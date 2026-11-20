import { randomUUID, createHash } from 'node:crypto';
import JSZip from 'jszip';

function makePdf() {
  const content = 'BT /F1 18 Tf 40 160 Td (QA attachment - test data) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R'
      + ' /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(text + `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`);
}
export const attachmentPdf = makePdf();
export const attachmentInput = (name = 'Báo cáo đơn vị.pdf') => ({ name, content: attachmentPdf.toString('base64') });

export async function runAttachmentChecks({ ok, call, expect, database, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const input = attachmentInput();
  const invalidId = randomUUID();
  expect((await call(2, '/cases', { ...body, id: invalidId,
    attachments: [{ name: 'gia-mao.pdf', content: Buffer.from('<script>fake</script>').toString('base64') }] })).status,
  422, 'attachment signature mismatch rejects entire create');
  expect((await database.query('select id from daily_report_cases where id=$1', [invalidId])).rowCount, 0,
    'invalid file leaves no partial case');
  for (const [name, content] of [['../path.pdf', input.content], ['script.html', input.content],
    ['empty.pdf', ''], ['fake.pdf', 'invalid base64'], ['Báo cáo.pdf', 'a'.repeat(14 * 1024 * 1024)]]) {
    expect((await call(2, '/cases', { ...body, attachments: [{ name, content }] })).status, 422,
      `reject invalid attachment: ${name}`);
  }
  expect((await call(2, '/cases', { ...body, attachments: Array.from({ length: 11 }, () => input) })).status,
    422, 'reject more than ten attachments');
  const docx = new JSZip();
  docx.file('[Content_Types].xml', '<Types/>');
  docx.file('word/document.xml', '<w:document/>');
  const word = { name: 'Quyết định.docx', content: await docx.generateAsync({ type: 'base64' }) };
  const item = (await ok(2, '/cases', { ...body, attachments: [input, word] })).case;
  const path = `/cases/${item.id}/attachments`;
  let files = (await ok(2, path)).attachments;
  expect(files.length, 2, 'reporter stores PDF and Word with case in one transaction');
  const pdf = files.find(file => file.file_name === input.name);
  const url = `${path}/${pdf.id}`;
  expect(pdf.sha256, createHash('sha256').update(attachmentPdf).digest('hex'), 'file hash matches exact bytes');
  expect(files.every(file => !Object.hasOwn(file, 'content')), true, 'file lists never include binary content');
  expect((await call(0, url)).status, 401, 'anonymous cannot download attachment');
  expect((await call(3, path)).status, 404, 'another unit cannot list attachments');
  expect((await call(3, url)).status, 404, 'another unit cannot download guessed file URL');
  expect((await call(3, url, {}, 'DELETE')).status, 404, 'another unit cannot delete attachment');
  expect((await call(3, path, { attachments: [input] })).status, 404, 'another unit cannot append attachment');
  expect((await call(4, path, { attachments: [input] })).status, 403, 'compiler cannot alter unit attachments');
  expect((await call(4, url)).data.equals(attachmentPdf), true, 'assigned compiler downloads original bytes');
  expect((await call(1, url + '?inline=1')).data.equals(attachmentPdf), true, 'preview serves original PDF bytes');
  expect((await call(2, `${path}/not-a-uuid`)).status, 422, 'invalid attachment ID is rejected before SQL');
  const other = (await ok(2, '/cases', body)).case;
  expect((await call(2, `/cases/${other.id}/attachments/${pdf.id}`)).status, 404,
    'file must belong to specified parent');
  await ok(2, url, {}, 'DELETE');
  expect((await call(2, url)).status, 404, 'draft removal deletes file content');
  expect((await database.query('select id from daily_report_attachments where id=$1', [pdf.id])).rowCount, 0,
    'deleted draft file is physically removed from storage');
  await ok(2, path, { attachments: [input] });
  const submitted = (await ok(2, `/cases/${item.id}/submit`, {})).submission;
  files = (await ok(4, path)).attachments;
  expect(files.every(file => Boolean(file.sealed_at)), true, 'submission seals every attachment');
  expect(submitted.snapshot.attachments.length, 2, 'submission snapshot retains attachment references and hashes');
  expect((await call(2, path, { attachments: [input] })).status, 403,
    'pending review case cannot have attachments silently changed');
  await ok(4, `/cases/${item.id}/return`, { reason: 'Bổ sung văn bản thử nghiệm' });
  expect((await call(2, `${path}/${files[0].id}`, {}, 'DELETE')).status, 409,
    'returned case retains already submitted original document');
  await ok(2, path, { attachments: [attachmentInput('Văn bản bổ sung.pdf')] });
  await ok(2, `/cases/${item.id}/submit`, {});
  await ok(4, `/cases/${item.id}/verify`, {});
  setNow('2026-10-29T02:00:00Z');
  const event = (await ok(2, `/cases/${item.id}/events`, { report_day: '2026-10-29',
    narrative: 'Bổ sung quyết định vào hồ sơ ngày trước', decision_number: 'QA-ATTACHMENT',
    decision_authority: 'Đơn vị thử', attachments: [input] })).event;
  expect((await ok(4, `/events/${event.id}/attachments`)).attachments.length, 1,
    'old case supplement retains attachment under new report day');
  expect((await database.query(`select id from daily_report_outbox where resource_id=$1
    and event_type='CASE_DECISION_ADDED'`, [event.id])).rowCount > 0, true,
  'decision with attachment still notifies compiler through outbox');
  setNow('2026-10-28T02:00:00Z');
  for (const [resource, key, payload] of [
    ['situations', 'situation', { report_day: body.report_day, category_codes: ['DINH_CONG'], narrative: 'Tình hình thử' }],
    ['work-results', 'metric', { report_day: body.report_day, metric_code: 'GENERAL', values: { activities: 2 } }]
  ]) {
    const created = (await ok(2, `/${resource}`, { ...payload, attachments: [input] }))[key];
    const route = `/${resource}/${created.id}`;
    expect((await ok(2, route + '/attachments')).attachments.length, 1, `${resource} creates attached document`);
    setNow('2026-10-28T03:00:01Z');
    expect((await call(2, route + '/attachments', { attachments: [input] })).status, 423,
      `${resource} attachments obey cutoff`);
    const unlock = await ok(2, '/unlock-requests', { report_day: body.report_day,
      scope: { kind: key === 'metric' ? 'WORK_RESULT' : 'SITUATION', id: created.id }, reason: 'Bổ sung tệp thử' });
    await ok(4, `/unlock-requests/${unlock.id}/decide`, { decision: 'APPROVED', reason: 'Đồng ý thử' });
    await ok(2, route + '/attachments', { attachments: [attachmentInput('Bổ sung sau giờ khóa.pdf')] });
    expect((await ok(2, route + '/attachments')).attachments.length, 2, `${resource} scoped unlock allows attachment`);
    await ok(2, route + '/submit', {});
    expect((await ok(2, route + '/attachments')).attachments.every(file => Boolean(file.sealed_at)), true,
      `${resource} submission seals documents`);
    await ok(4, route + '/verify', {});
    expect((await ok(4, route + '/attachments')).can_edit, false, `${resource} verified attachments read only`);
    setNow('2026-10-28T02:00:00Z');
  }
  const limited = (await ok(2, '/cases', { ...body, attachments: Array.from({ length: 10 }, () => input) })).case;
  expect((await call(2, `/cases/${limited.id}/attachments`, { attachments: [input] })).status, 422,
    'adding files respects existing stored count');
  const large = Buffer.alloc(10 * 1024 * 1024, 32);
  attachmentPdf.copy(large);
  const big = { name: 'lon.pdf', content: large.toString('base64') };
  const bigCase = (await ok(2, '/cases', { ...body, attachments: [big, big] })).case;
  expect((await ok(2, `/cases/${bigCase.id}/attachments`)).attachments.length, 2,
    'full 20 MB batch passes authenticated 30 MB JSON parser');
  expect((await call(2, `/cases/${bigCase.id}/attachments`, { attachments: [input] })).status, 422,
    'stored total cannot exceed 20 MB');
}
