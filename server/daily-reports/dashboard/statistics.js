import { canonicalBusinessCode } from '../business-codes.js';

export const domains = {
  PPHS: 'Phạm pháp hình sự', TNXH: 'Tệ nạn xã hội', MA_TUY: 'Ma túy',
  KINH_TE: 'Kinh tế, chức vụ', MOI_TRUONG: 'Môi trường', ANQG: 'An ninh quốc gia',
  CONG_NGHE_CAO: 'Công nghệ cao', HOAT_DONG_TU_PHAP: 'Hoạt động tư pháp', TINH_HINH_KHAC: 'Tình hình khác'
};
const excluded = new Set(['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING']);
const pending = new Set(['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED']);

export function shiftDay(day, offset) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function comparison(current, previous, comparable = true) {
  if (!comparable) return { current, previous, delta: null, percent: null, direction: 'unknown' };
  const delta = current - previous;
  return { current, previous, delta,
    percent: previous ? Math.round(delta / previous * 1000) / 10 : null,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

export function summarizeDashboard({ day, span, units, sources, now }) {
  const from = shiftDay(day, 1 - span);
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(from, -span);
  const current = sources.filter(item => item.day >= from && item.day <= day);
  const previous = sources.filter(item => item.day >= previousFrom && item.day <= previousTo);
  const countable = item => item.kind === 'CASE' && !excluded.has(item.duplicate_state);
  const currentCases = current.filter(countable);
  const previousCases = previous.filter(countable);
  const currentDays = new Set(current.map(item => item.day));
  const previousDays = new Set(previous.map(item => item.day));
  const comparable = previous.length > 0 && current.length > 0;
  const codes = item => [...new Set((item.classifications?.length
    ? item.classifications.map(group => group.business_code) : [item.business_code]).map(canonicalBusinessCode))];
  const domainDays = new Map(Object.keys(domains).map(code => [code, new Map()]));
  for (const item of sources.filter(countable)) {
    for (const code of codes(item)) {
      const days = domainDays.get(code);
      if (days) days.set(item.day, (days.get(item.day) || 0) + 1);
    }
  }
  const series = Array.from({ length: Math.max(span, 7) }, (_, index) => {
    const date = shiftDay(day, index + 1 - Math.max(span, 7));
    const baseline = shiftDay(date, -span);
    return { day: date, previousDay: baseline,
      current: sources.filter(item => item.day === date && countable(item)).length,
      previous: sources.filter(item => item.day === baseline && countable(item)).length,
      hasCurrent: sources.some(item => item.day === date),
      hasPrevious: sources.some(item => item.day === baseline) };
  });
  const dailySources = sources.filter(item => item.day === day);
  const unitRows = units.filter(unit => unit.expected
    || dailySources.some(item => String(item.unit_id) === String(unit.id))).map(unit => {
    const items = dailySources.filter(item => String(item.unit_id) === String(unit.id));
    const cases = items.filter(item => item.kind === 'CASE');
    const work = items.filter(item => item.kind === 'WORK_RESULT');
    const situations = items.filter(item => item.kind === 'SITUATION');
    const complete = work.some(item => item.metric_code === 'DAILY_POLICE_WORK')
      && (cases.length > 0 || situations.length > 0);
    const returned = items.filter(item => item.state === 'RETURNED').length;
    return { ...unit, status: !items.length ? 'missing' : returned ? 'returned' : complete ? 'complete' : 'partial',
      counts: { cases: cases.length, work: work.length, situations: situations.length,
        pending: items.filter(item => pending.has(item.state)).length, returned },
      recordedAt: items.map(item => item.created_at).sort().at(-1) || null,
      items: items.map(item => ({ id: item.id, kind: item.kind, state: item.state,
        summary: item.summary, business_code: canonicalBusinessCode(item.business_code),
        duplicate: excluded.has(item.duplicate_state), created_at: item.created_at })) };
  });
  const expected = unitRows.filter(unit => unit.expected);
  const submitted = expected.filter(unit => unit.status !== 'missing').length;
  return { day, span, from, previousFrom, previousTo, generatedAt: now.toISOString(),
    coverage: { currentDays: currentDays.size, previousDays: previousDays.size, expectedDays: span },
    progress: { expected: expected.length, submitted, missing: expected.length - submitted,
      complete: expected.filter(unit => unit.status === 'complete').length,
      partial: expected.filter(unit => unit.status === 'partial').length,
      returned: expected.filter(unit => unit.status === 'returned').length,
      percent: expected.length ? Math.round(submitted / expected.length * 100) : null,
      pending: dailySources.filter(item => pending.has(item.state)).length,
      verified: dailySources.filter(item => item.state === 'VERIFIED').length },
    cases: { ...comparison(currentCases.length, previousCases.length, comparable),
      verified: currentCases.filter(item => item.state === 'VERIFIED').length,
      excluded: current.filter(item => item.kind === 'CASE' && excluded.has(item.duplicate_state)).length },
    domains: Object.entries(domains).map(([code, label]) => ({ code, label,
      ...comparison(currentCases.filter(item => codes(item).includes(code)).length,
        previousCases.filter(item => codes(item).includes(code)).length, comparable),
      verified: currentCases.filter(item => item.state === 'VERIFIED' && codes(item).includes(code)).length,
      excluded: current.filter(item => item.kind === 'CASE' && excluded.has(item.duplicate_state)
        && codes(item).includes(code)).length,
      series: series.map(point => ({ ...point,
        current: domainDays.get(code).get(point.day) || 0,
        previous: domainDays.get(code).get(point.previousDay) || 0 })) })),
    series, units: unitRows };
}
