import { normalizeQuestion } from '../questions/date.js';
import { ordinal } from './planner.js';
import { resolvePeriod, progressPeriod } from './period.js';
import { executeDomainCasesTool, resolveDomain } from './domain-cases.js';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function readMemory(raw) {
  if (raw?.kind === 'progress') return { kind: 'progress' };
  if (raw?.kind === 'domain_cases') return { kind: 'domain_cases', domain: raw.domain, date: raw.date };
  if (raw?.kind !== 'cases' || !Array.isArray(raw.ids) || raw.ids.length > 25
    || !raw.ids.every(id => typeof id === 'string' && uuid.test(id))) return null;
  const index = Number.isInteger(raw.index) && raw.index >= 0 && raw.index < raw.ids.length ? raw.index : null;
  return { kind: 'cases', ids: raw.ids, index };
}

const clarify = text => ({ text, sources: [], memory: null });
const sources = title => [{ id: 'dailyReports', title }];
export async function runDailyTool(decision, input, today, read) {
  const { tool } = decision;
  const query = normalizeQuestion(input.message);
  const memory = input.memory;
  if (tool === 'clarify') {
    return clarify('Bạn muốn tra tiến độ nộp theo ngày/tuần, xem hồ sơ bị trả lại hay soạn bổ sung cho hồ sơ nào?');
  }
  if (['draft_case', 'review_case'].includes(tool)) {
    const explicit = ordinal(input.message);
    const position = explicit ?? decision.ordinal;
    const selectedIndex = memory?.index ?? (memory?.ids?.length === 1 ? 0 : null);
    const index = explicit !== null || position ? position - 1 : selectedIndex;
    const id = memory?.ids?.[index];
    if (!id) return { ...clarify('Hãy mở danh sách hồ sơ bị trả lại và chọn số thứ tự có trong danh sách.'),
      memory };
    const scope = await read('scope', {});
    if (!scope.submodules.includes('returned')) throw Object.assign(new Error('Bạn chưa có quyền Báo cáo bị trả lại.'),
      { status: 403 });
    const detail = await read('cases/' + id, {});
    const item = detail.case;
    if (item.current_state !== 'RETURNED') return clarify('Hồ sơ đã đổi trạng thái. Hãy mở lại danh sách.');
    const selected = { kind: 'cases', ids: memory.ids, index };
    const title = item.title || item.stable_code;
    const result = { memory: selected, sources: sources('Hồ sơ ' + item.stable_code),
      action: { type: 'review', id, version: item.version, title } };
    if (tool === 'review_case') {
      return { ...result, text: `Hồ sơ ${index + 1}: ${title}. Hãy kiểm tra nội dung trên biểu mẫu trước khi gửi lại.` };
    }
    return { ...result, draftFacts: { title, summary: String(item.summary || '').slice(0, 3500),
      reason: String(detail.returns.at(-1)?.reason || '').slice(0, 1200) } };
  }
  const period = resolvePeriod(query, today);
  if (period.clarification) return clarify(period.clarification);
  if (tool === 'domain_cases') {
    return await executeDomainCasesTool({ query, period, memory, read, sources });
  }
  if (tool === 'progress_period') {
    return { text: await progressPeriod(period, read), memory: { kind: 'progress' },
      sources: sources('Tiến độ gửi theo ngày · Tổng quan') };
  }
  if (tool === 'returned_list') {
    const mine = decision.ownUnit || /\b(don vi (cua )?(toi|minh|tao|t)|ben (toi|minh|tao|t))\b/.test(query);
    const params = { from_day: period.from, to_day: period.to, has_returns: 'true', state: 'RETURNED' };
    const byReturn = !/\b(ngay bao cao|ngay ghi nhan|ngay lap)\b/.test(query);
    const dateLabel = byReturn ? 'ngày trả lại gần nhất' : 'ngày báo cáo';
    if (byReturn) params.date_basis = 'returned';
    const domain = resolveDomain(query)?.code || null;
    if (domain) params.business_code = domain;
    if (mine) {
      const scope = await read('scope', {});
      if (!scope.unitId) return clarify('Tài khoản chưa gắn với một đơn vị để áp dụng bộ lọc này.');
      params.unit_id = String(scope.unitId);
    }
    const data = await read('cases', params);
    const rows = data.cases.slice(0, 25);
    const lines = [`Có ${data.total} hồ sơ vụ việc đang bị trả lại, theo ${dateLabel} ${period.from} – ${period.to}.`];
    rows.forEach((item, index) => lines.push(`${index + 1}. ${item.title || item.stable_code} · ${item.unit_name}`));
    if (rows.length) lines.push('Bạn có thể yêu cầu “Soạn bổ sung cho hồ sơ số 1”.');
    if (rows.length < data.total) lines.push(`Hiển thị ${rows.length}/${data.total} hồ sơ trong chat.`);
    return { text: lines.join('\n'), sources: sources('Báo cáo bị trả lại · ' + dateLabel),
      memory: { kind: 'cases', ids: rows.map(item => item.id), domain: domain || null, index: null },
      action: { type: 'list', from: period.from, to: period.to, unit: params.unit_id || '',
        domain: domain || '', byReturn } };
  }
  return { plan: { kind: 'dashboard', day: period.to, answer: 'units',
    list: { daily_missing: 'missing', daily_submitted: 'submitted' }[tool] || null } };
}
