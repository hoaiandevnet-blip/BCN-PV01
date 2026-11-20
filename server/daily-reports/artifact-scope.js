import { hasDailyReportRole } from './rules.js';

const sourceQueries = {
  CASE_EVENT: `select e.id,c.unit_id from daily_report_case_events e
    join daily_report_cases c on c.id=e.case_id where e.id=any($1::uuid[])`,
  WORK_RESULT: 'select id,unit_id from daily_report_metrics where id=any($1::uuid[])',
  SITUATION: 'select id,unit_id from daily_report_situations where id=any($1::uuid[])'
};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function denied() {
  throw Object.assign(new Error('Báo cáo có nguồn ngoài phạm vi quyền hiện tại.'), {
    status: 403,
    code: 'SOURCE_SCOPE_REVOKED'
  });
}

export async function assertArtifactScope(client, user, items) {
  if (user.is_admin) return;
  if (!Array.isArray(items)) denied();
  const groups = new Map(Object.keys(sourceQueries).map(type => [type, new Set()]));
  for (const item of items) {
    if (!groups.has(item?.source_type) || !uuid.test(item?.source_id || '')) denied();
    const originalUnit = item.source_snapshot?.unit_id;
    if (!originalUnit || !hasDailyReportRole(user, 'PV01_COMPILER', originalUnit)) denied();
    groups.get(item.source_type).add(item.source_id);
  }
  for (const [type, ids] of groups) {
    if (!ids.size) continue;
    const { rows } = await client.query(sourceQueries[type], [[...ids]]);
    if (rows.length !== ids.size) denied();
    if (rows.some(source => !hasDailyReportRole(user, 'PV01_COMPILER', source.unit_id))) denied();
  }
}

export async function assertDraftScope(client, user, draftId) {
  if (user.is_admin) return;
  const { rows } = await client.query(`select source_type,source_id,source_snapshot
    from daily_report_draft_items where draft_id=$1`, [draftId]);
  await assertArtifactScope(client, user, rows);
}
