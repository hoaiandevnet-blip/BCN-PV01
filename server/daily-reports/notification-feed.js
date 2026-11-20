import { availableModules, compilerHasModule } from './submodule-permissions.js';
import { hasDailyReportRole } from './rules.js';
import { formatDailyNotification } from './notification-format.js';

// Resolve the source before applying current permissions; an old receipt is never an access grant.
const sources = `with source_events as (
  select event.*, reads.read_at is not null as is_read,
    coalesce(c.unit_id, s.unit_id, m.unit_id, u.unit_id) as source_unit_id,
    coalesce(c.current_state, s.state, m.state) as report_state,
    coalesce(e.report_day, c.report_day, s.report_day, m.report_day, u.report_day, d.report_day) as report_day,
    c.id as case_id, c.stable_code, c.title as case_title, c.report_day as original_day,
    c.business_code, e.event_kind, e.narrative, e.decision_type, e.decision_number, e.decision_authority,
    u.reason as unlock_reason, u.scope_kind, u.scope_id,
    s.category_codes, m.metric_code, v.document_number,
    d.created_by as draft_owner,
    (select name from teams where id=coalesce(c.unit_id,s.unit_id,m.unit_id,u.unit_id)) as unit_name
  from daily_report_outbox event
  left join daily_report_notification_reads reads on reads.outbox_id=event.id and reads.user_id=$1
  left join daily_report_case_events e on event.resource_type='CASE_EVENT' and e.id::text=event.resource_id
  left join daily_report_cases c on c.id::text=case
    when event.resource_type='CASE' then event.resource_id else e.case_id::text end
  left join daily_report_situations s on event.resource_type='SITUATION' and s.id::text=event.resource_id
  left join daily_report_metrics m on event.resource_type='WORK_RESULT' and m.id::text=event.resource_id
  left join daily_report_unlock_requests u
    on event.resource_type='UNLOCK_REQUEST' and u.id::text=event.resource_id
  left join daily_report_drafts d on event.resource_type='DRAFT' and d.id::text=event.resource_id
  left join daily_report_legal_versions v
    on event.resource_type='LEGAL_VERSION' and v.id::text=event.resource_id
), visible_events as (
  select * from source_events
  where ($3::boolean
      or (recipient_unit_id=$2 and source_unit_id=$2
        and event_type in ('CASE_RETURNED','SOURCE_RETURNED','CASE_SUPPLEMENT_REQUESTED'))
      or (recipient_user_id=$1 and (
        (((resource_type in ('CASE','CASE_EVENT','SITUATION','WORK_RESULT') and report_state<>'DRAFT')
            or event_type='UNLOCK_REQUESTED')
          and exists (select 1 from jsonb_to_recordset($4::jsonb) as permission(unit_id bigint,resources jsonb)
            where (permission.unit_id is null or permission.unit_id=source_unit_id)
              and permission.resources ? resource_type))
        or (resource_type='DRAFT' and draft_owner=$1 and $5::boolean)
      )))
    and (source_unit_id is not null or (resource_type='LEGAL_VERSION' and document_number is not null)
      or (resource_type='DRAFT' and draft_owner is not null))
    and not (resource_type='CASE_EVENT' and event_kind='INITIAL_REPORT' and event_type='CASE_EVENT_UPDATED')
)
`;

const validId = value => /^[1-9]\d{0,18}$/.test(String(value || ''))
  && BigInt(value) <= 9223372036854775807n;

export function createDailyNotificationFeed({ pool, actor, maintenance }) {
  async function parameters(req) {
    const user = req.dailyActor || await actor(req);
    if (!user.moduleAllowed && !user.is_admin) return null;
    const permissions = user.roles.filter(role => role.role_code === 'PV01_COMPILER').map(role => {
      const has = module => (module !== 'approval' || user.approvalAllowed !== false)
        && compilerHasModule(role, module);
      const resources = [];
      if (['registry', 'approval', 'composer', 'input', 'returned', 'updates', 'duplicates'].some(has)) {
        resources.push('CASE');
      }
      if (has('approval') || has('updates') || has('composer')) resources.push('CASE_EVENT');
      if (has('approval') || has('input') || has('composer')) resources.push('SITUATION', 'WORK_RESULT');
      if (has('unlock')) resources.push('UNLOCK_REQUEST');
      return { unit_id: role.unit_id, resources };
    });
    const reporter = user.unitId && hasDailyReportRole(user, 'UNIT_REPORTER', user.unitId);
    return [user.id, reporter ? user.unitId : null, Boolean(user.is_admin),
      JSON.stringify(permissions),
      user.roles.some(role => compilerHasModule(role, 'composer'))];
  }

  async function rows(req, { recent = false } = {}) {
    const params = await parameters(req);
    if (!params) return [];
    await maintenance();
    const result = await pool.query(sources + `select * from visible_events
      ${recent ? "where not is_read or created_at >= now() - interval '30 days'" : ''}
      order by created_at desc,id desc`, params);
    return result.rows;
  }

  async function markRead(req, id) {
    if (!validId(id)) return false;
    const params = await parameters(req);
    if (!params) return false;
    const result = await pool.query(sources + `insert into daily_report_notification_reads(outbox_id,user_id)
      select id,$1 from visible_events where id=$6
      on conflict(outbox_id,user_id) do update set read_at=daily_report_notification_reads.read_at
      returning outbox_id`, [...params, id]);
    return result.rowCount > 0;
  }

  async function markAllRead(req) {
    const params = await parameters(req);
    if (!params) return 0;
    const result = await pool.query(sources + `insert into daily_report_notification_reads(outbox_id,user_id)
      select id,$1 from visible_events where not is_read
      on conflict(outbox_id,user_id) do nothing`, params);
    return result.rowCount;
  }

  return {
    rows, markRead, markAllRead,
    async list(req) {
      const user = req.dailyActor || await actor(req);
      const modules = availableModules(user);
      return (await rows(req, { recent: true })).map(row => {
        const item = formatDailyNotification(row);
        if (!modules.includes(item.dailyReportRef.view)) {
          item.dailyReportRef.view = modules.includes('composer') ? 'composer'
            : ['approval', 'registry', 'input', 'returned', 'updates', 'duplicates']
              .find(module => modules.includes(module));
        }
        return item;
      });
    }
  };
}
