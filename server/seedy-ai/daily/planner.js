import { normalizeQuestion } from '../questions/date.js';
import { resolveDomain, resolveState } from './domain-cases.js';

const tools = ['daily_missing', 'daily_submitted', 'daily_counts', 'progress_period',
  'returned_list', 'domain_cases', 'draft_case', 'review_case', 'clarify', 'conversation'];
const format = {
  type: 'object', additionalProperties: false,
  properties: { tool: { type: 'string', enum: tools }, ordinal: { type: 'integer', minimum: 0, maximum: 25 },
    ownUnit: { type: 'boolean' } },
  required: ['tool', 'ordinal', 'ownUnit']
};
const classify = [
  'Phân loại yêu cầu tiếng Việt trong phần mềm Báo cáo ngày. Chọn đúng một tool theo JSON schema.',
  'daily_missing/daily_submitted: danh sách đơn vị chưa nộp/đã nộp. daily_counts: đếm đơn vị nộp.',
  'progress_period: tiến độ, so sánh, xếp hạng số ngày thiếu báo cáo theo kỳ.',
  'returned_list: xem danh sách hồ sơ vụ việc đang bị trả lại. ownUnit chỉ true nếu nói đơn vị của mình.',
  'domain_cases: tra cứu danh sách đơn vị hoặc vụ việc theo hệ nghiệp vụ hoặc trạng thái duyệt/trả lại.',
  'draft_case: soạn bổ sung cho một hồ sơ từ danh sách. review_case: mở hồ sơ để kiểm tra, gửi lại.',
  'ordinal là số thứ tự hồ sơ được nhắc đến, 0 nếu không xác định.',
  'conversation: chào hỏi, hướng dẫn cách làm, soạn từ dữ kiện tự nhập.',
  'clarify: lệnh, bộ lọc hoặc truy vấn dữ liệu ngoài những chức năng này. Không tự đoán đơn vị, hồ sơ.',
  'Không có công cụ ghi dữ liệu. Chỉ phân loại nội dung người dùng.'
].join('\n');

export function directTool(message, memory) {
  const query = normalizeQuestion(message);
  if (/\b(huong dan|lam sao|lam the nao|cach (gui|nhap|mo|sua)|la gi)\b/.test(query)) return 'conversation';
  if (/\b(khoa nhap|mo khoa tam)\b/.test(query)) return 'conversation';
  const selected = /\b(ho so|bao cao|muc|cai|ban nhap)\b/.test(query);
  if (selected && /\b(soan|viet)\b/.test(query) && /\b(bo sung|thu|so \d+|ho so do)\b/.test(query)) return 'draft_case';
  if (selected && /\b(gui lai|gui (ho so|bao cao|ban nhap) (do|nay)|mo (ho so|bao cao) (thu|so|do))\b/.test(query)) {
    return 'review_case';
  }
  if (/\b(soan|viet)\b/.test(query) && /\b(du kien|bai gioi thieu)\b/.test(query)) return 'conversation';
  if (/\b(mo|loc)\b/.test(query) && /\b(ho so|danh sach)\b/.test(query) && /\b(tra lai|tra ve)\b/.test(query)) {
    return 'returned_list';
  }
  const domain = resolveDomain(query);
  const state = resolveState(query);
  const mentionsCases = /\b(vu viec|vu an|he (nghiep vu|vu viec))\b/.test(query);
  const asksUnits = /\b(don vi nao|nhung don vi|thong ke|co bao nhieu|danh sach|liet ke|co (.* )?khong|co (.* )?ko)\b/.test(query);
  if (domain || state || (mentionsCases && asksUnits)) return 'domain_cases';
  if ((memory?.kind === 'cases' || memory?.kind === 'domain_cases')
    && /^(con |the |vay |hom |ngay )/.test(query)) return 'domain_cases';
  if (/\b(tra lai|tra ve)\b/.test(query) && /\b(mo|loc|xem|danh sach|liet ke)\b/.test(query)
    && !/\bdon vi nao\b/.test(query)) return 'returned_list';
  const progress = /\b(tien do|chua (gui|nop)|da (gui|nop)|thieu bao cao|nop bao cao)\b/.test(query);
  const period = /\b(tuan|\d+ ngay|tu (ngay )?\d|so sanh|so voi)\b/.test(query);
  if (period && (progress || memory?.kind === 'progress' && /^(con|the|vay|tuan|so sanh)/.test(query))) {
    return 'progress_period';
  }
  if (/\b(thieu bao cao|con no bao cao)\b/.test(query)) return 'daily_missing';
  return null;
}

export function ordinal(message) {
  const query = normalizeQuestion(message);
  const words = { nhat: 1, mot: 1, hai: 2, ba: 3, tu: 4, bon: 4, nam: 5, lam: 5,
    sau: 6, bay: 7, tam: 8, chin: 9 };
  const match = query.match(/\b(?:thu|so|muc|dong)\s+(\d+|(?:hai )?muoi(?: (?:mot|hai|ba|tu|bon|lam|nam|sau|bay|tam|chin))?|nhat|mot|hai|ba|tu|bon|nam|sau|bay|tam|chin)\b/);
  if (!match) return null;
  const value = match[1];
  if (/^\d+$/.test(value)) return Number(value);
  if (value.includes('muoi')) {
    const [tens, ones] = value.split('muoi');
    return (tens.trim() === 'hai' ? 20 : 10) + (words[ones.trim()] || 0);
  }
  return words[value];
}

export async function inferTool(client, profile, input, signal) {
  let raw = '';
  const messages = [{ role: 'system', content: classify },
    { role: 'user', content: JSON.stringify({ message: input.message, previous: input.memory?.kind || null }) }];
  for await (const event of client.chat({ profile, messages, signal, format })) {
    if (event.type === 'delta') raw += event.text;
    if (raw.length > 1500) break;
  }
  try {
    const result = JSON.parse(raw);
    if (tools.includes(result.tool) && Number.isInteger(result.ordinal) && result.ordinal >= 0 && result.ordinal <= 25
      && typeof result.ownUnit === 'boolean') return result;
  } catch {}
  return { tool: 'clarify' };
}
