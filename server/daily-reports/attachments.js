import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';

export const attachmentSources = {
  cases: { table: 'daily_report_cases', column: 'case_id', kind: 'CASE', state: 'current_state' },
  events: { table: 'daily_report_case_events', column: 'event_id', kind: 'CASE_EVENT', state: 'state' },
  'work-results': { table: 'daily_report_metrics', column: 'metric_id', kind: 'WORK_RESULT', state: 'state' },
  situations: { table: 'daily_report_situations', column: 'situation_id', kind: 'SITUATION', state: 'state' }
};
const maxFile = 10 * 1024 * 1024;
const maxTotal = 20 * 1024 * 1024;
const metadata = 'id,file_name,media_type,byte_size,sha256,created_by,created_at,sealed_at';
const mediaTypes = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm'
};
function invalid(message, status = 422) {
  throw Object.assign(new Error(message), { status, code: 'INVALID_ATTACHMENT' });
}
async function validSignature(bytes, extension) {
  const hex = bytes.subarray(0, 8).toString('hex');
  if (extension === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'png') return hex === '89504e470d0a1a0a';
  if (['jpg', 'jpeg'].includes(extension)) return hex.startsWith('ffd8ff');
  if (['mp4', 'mov'].includes(extension)) {
    return bytes.length >= 12 && bytes.subarray(4, 8).toString() === 'ftyp';
  }
  if (extension === 'webm') return hex.startsWith('1a45dfa3');
  if (['doc', 'xls'].includes(extension)) return hex === 'd0cf11e0a1b11ae1';
  if (!hex.startsWith('504b0304')) return false;
  try {
    const zip = await JSZip.loadAsync(bytes);
    const main = extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
    return Boolean(zip.file('[Content_Types].xml') && zip.file(main))
      && !Object.keys(zip.files).some(name => /vbaProject\.bin$/i.test(name));
  } catch {
    return false;
  }
}
export async function prepareAttachments(input, { allowVideo = false } = {}) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 10) invalid('Mỗi hồ sơ được đính kèm tối đa 10 tệp.');
  const files = [];
  let total = 0;
  for (const value of input) {
    const name = typeof value?.name === 'string' ? value.name.trim().normalize('NFC') : '';
    const extension = name.split('.').pop().toLowerCase();
    if (['mp4', 'mov', 'webm'].includes(extension) && !allowVideo) invalid('Loại tệp không được hỗ trợ.');
    if (!name || name.length > 180 || /[/\\\x00-\x1f\x7f]/.test(name) || !Object.hasOwn(mediaTypes, extension)) {
      invalid('Chỉ nhận tệp PDF, Word, Excel hoặc ảnh JPG, PNG có tên hợp lệ.');
    }
    const base64 = value.content;
    if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(maxFile / 3) * 4
      || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      invalid('Tệp không hợp lệ hoặc vượt quá 10 MB.');
    }
    const bytes = Buffer.from(base64, 'base64');
    total += bytes.length;
    if (!bytes.length || bytes.length > maxFile || total > maxTotal) {
      invalid('Mỗi tệp tối đa 10 MB; tổng dung lượng tối đa 20 MB.');
    }
    if (bytes.toString('base64') !== base64 || !await validSignature(bytes, extension)) {
      invalid(`Nội dung tệp “${name}” không khớp định dạng được hỗ trợ.`);
    }
    files.push({ name, bytes, mediaType: mediaTypes[extension],
      hash: createHash('sha256').update(bytes).digest('hex') });
  }
  return files;
}
export async function listAttachments(client, resource, id) {
  const column = attachmentSources[resource].column;
  const { rows } = await client.query(`select ${metadata} from daily_report_attachments
    where ${column}=$1 order by created_at,id`, [id]);
  return rows;
}
export async function storeAttachments(client, resource, id, actorId, files, sealed = false) {
  if (!files.length) return;
  const column = attachmentSources[resource].column;
  const { rows: [existing] } = await client.query(`select count(*)::int as count,
    coalesce(sum(byte_size),0)::int as size from daily_report_attachments where ${column}=$1`, [id]);
  if (existing.count + files.length > 10 || existing.size + files.reduce((sum, file) => sum + file.bytes.length, 0)
    > maxTotal) invalid('Mỗi hồ sơ tối đa 10 tệp, tổng dung lượng tối đa 20 MB.');
  for (const file of files) {
    await client.query(`insert into daily_report_attachments
      (id,${column},file_name,media_type,byte_size,sha256,content,created_by,sealed_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,case when $9 then now() else null end)`,
    [randomUUID(), id, file.name, file.mediaType, file.bytes.length, file.hash, file.bytes, actorId, sealed]);
  }
}
export async function sealAttachments(client, resource, id) {
  const column = attachmentSources[resource].column;
  await client.query(`update daily_report_attachments set sealed_at=now()
    where ${column}=$1 and sealed_at is null`, [id]);
  return listAttachments(client, resource, id);
}
