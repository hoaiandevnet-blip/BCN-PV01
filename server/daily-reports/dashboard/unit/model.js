import { isBeforeCutoff, reportDay } from '../../rules.js';
import { shiftDay } from '../statistics.js';

const pendingStates = new Set(['SUBMITTED', 'PENDING_REVIEW', 'RESUBMITTED']);
const sentStates = new Set([...pendingStates, 'VERIFIED']);
const workFields = [
  ['patrol_rounds', 'Tuần tra, kiểm soát', 'lượt', 'route'],
  ['patrol_officers', 'CBCS tham gia tuần tra', 'lượt CBCS', 'users'],
  ['patrol_vehicles_checked', 'Phương tiện đã kiểm tra', 'phương tiện', 'car'],
  ['administrative_checks', 'Kiểm tra hành chính', 'trường hợp', 'clipboard-check'],
  ['administrative_penalty_decisions', 'Quyết định xử phạt VPHC', 'trường hợp', 'file-check-2'],
  ['administrative_fines', 'Tiền phạt VPHC', 'đồng', 'banknote']
];

function sourceView(item, modules) {
  if (item.kind !== 'CASE') return modules.includes('input') ? 'input' : null;
  if (item.state === 'RETURNED' && modules.includes('returned')) return 'returned';
  return ['registry', 'updates', 'returned'].find(view => modules.includes(view)) || null;
}

function sourceSummary(item, modules) {
  return { id: item.id, kind: item.kind, day: item.day, state: item.state,
    code: item.stable_code || '', summary: item.summary, reason: item.review_reason || '',
    updatedAt: item.updated_at, view: sourceView(item, modules),
    duplicate: ['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].includes(item.duplicate_state) };
}

function section(items, accessible) {
  if (!accessible) return { status: 'restricted', sent: null, returned: null, drafts: null };
  const sent = items.filter(item => sentStates.has(item.state)).length;
  const returned = items.filter(item => item.state === 'RETURNED').length;
  const drafts = items.filter(item => item.state === 'DRAFT').length;
  return { status: returned ? 'returned' : sent ? 'complete' : drafts ? 'draft' : 'missing', sent, returned, drafts };
}

export function summarizeUnit({ unit, modules, sources, unlocks, day, span, now }) {
  const from = shiftDay(day, 1 - span);
  const daily = sources.filter(item => item.day === day);
  const period = sources.filter(item => item.day >= from && item.day <= day);
  const canReadWork = modules.includes('input');
  const sections = {
    situation: section(daily.filter(item => ['CASE', 'SITUATION'].includes(item.kind)), canReadWork),
    work: section(daily.filter(item => item.kind === 'WORK_RESULT'
      && item.metric_code === 'DAILY_POLICE_WORK'), canReadWork)
  };
  const tasks = sources.filter(item => ['DRAFT', 'RETURNED'].includes(item.state)).sort((first, second) =>
    Number(second.state === 'RETURNED') - Number(first.state === 'RETURNED')
    || first.day.localeCompare(second.day) || first.id.localeCompare(second.id));
  const recent = [...period].sort((first, second) => second.day.localeCompare(first.day)
    || second.updated_at.localeCompare(first.updated_at) || first.id.localeCompare(second.id));
  const work = period.filter(item => item.kind === 'WORK_RESULT' && item.metric_code === 'DAILY_POLICE_WORK');
  const acceptedWork = work.filter(item => sentStates.has(item.state));
  const fields = workFields.map(([key, label, unit, icon]) => {
    const supplied = acceptedWork.filter(item => Number.isFinite(item.metric_values?.[key]));
    return { key, label, unit, icon, reported: supplied.length,
      value: supplied.length ? supplied.reduce((sum, item) => sum + item.metric_values[key], 0) : null };
  });
  return {
    unit, modules,
    sections,
    dayCounts: { pending: daily.filter(item => pendingStates.has(item.state)).length,
      verified: daily.filter(item => item.state === 'VERIFIED').length,
      drafts: daily.filter(item => item.state === 'DRAFT').length },
    tasks: { total: tasks.length, returned: tasks.filter(item => item.state === 'RETURNED').length,
      drafts: tasks.filter(item => item.state === 'DRAFT').length,
      items: tasks.slice(0, 6).map(item => sourceSummary(item, modules)) },
    recent: { total: recent.length, items: recent.slice(0, 10).map(item => sourceSummary(item, modules)) },
    work: { accessible: canReadWork, sourceCount: acceptedWork.length,
      verified: acceptedWork.filter(item => item.state === 'VERIFIED').length,
      pending: acceptedWork.filter(item => pendingStates.has(item.state)).length,
      returned: work.filter(item => item.state === 'RETURNED').length, fields },
    window: { currentDay: reportDay(now), regularOpen: day === reportDay(now) && isBeforeCutoff(now),
      deadline: day + 'T10:00:00+07:00',
      activeUnlocks: unlocks.filter(item => item.status === 'APPROVED').map(item => ({
        kind: item.scope_kind, expiresAt: new Date(item.expires_at).toISOString() })),
      requested: unlocks.filter(item => item.status === 'REQUESTED').length }
  };
}
