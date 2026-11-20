import { availableModules } from '../../submodule-permissions.js';
import { shiftDay, summarizeDashboard } from '../statistics.js';
import { intakeMetricText } from '../../intake/routes.js';
import { summarizeUnit } from './model.js';

// The unit always comes from the authenticated role, never from a query parameter.
export async function loadUnitDashboard(pool, user, day, span, now) {
  const modules = availableModules(user);
  const canReadWork = modules.includes('input');
  const earliest = shiftDay(day, 1 - Math.max(span * 2, 7 + span));
  const client = await pool.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');
    const { rows: cases } = await client.query(`select c.id,c.unit_id,c.report_day::text as day,
      c.current_state as state,'CASE' as kind,c.stable_code,c.business_code,c.classifications,
      c.duplicate_state,left(c.summary,1200) as summary,c.created_at,c.updated_at,
      (select left(r.reason,1200) from daily_report_returns r
        join daily_report_submissions s on s.id=r.submission_id
        where s.case_id=c.id and r.resubmitted_submission_id is null
        order by r.created_at desc limit 1) as review_reason
      from daily_report_cases c where c.unit_id=$1 and c.report_day<=$3
        and (c.report_day>=$2 or c.current_state in ('DRAFT','RETURNED'))`, [user.unitId, earliest, day]);
    let metrics = [];
    let situations = [];
    if (canReadWork) {
      metrics = (await client.query(`select id,unit_id,report_day::text as day,state,'WORK_RESULT' as kind,
        metric_code,metric_values,primitive_weapon_type,work_domain,administrative_domains,
        left(review_reason,1200) as review_reason,created_at,updated_at
        from daily_report_metrics where unit_id=$1 and report_day<=$3
          and (report_day>=$2 or state in ('DRAFT','RETURNED'))`, [user.unitId, earliest, day])).rows;
      situations = (await client.query(`select id,unit_id,report_day::text as day,state,'SITUATION' as kind,
        left(narrative,1200) as summary,left(review_reason,1200) as review_reason,created_at,updated_at
        from daily_report_situations where unit_id=$1 and report_day<=$3
          and (report_day>=$2 or state in ('DRAFT','RETURNED'))`, [user.unitId, earliest, day])).rows;
    }
    const unlocks = modules.includes('unlock') ? (await client.query(`select id,scope_kind,scope_id,status,
      approved_at,expires_at from daily_report_unlock_requests where unit_id=$1 and report_day=$2
        and (status='REQUESTED' or (status='APPROVED' and approved_at<=$3 and expires_at>$3))`,
    [user.unitId, day, now])).rows : [];
    const { rows: [expected] } = await client.query(`select exists(
      select 1 from daily_report_user_roles r join users u on u.id=r.user_id
      where r.unit_id=$1 and u.team_id=$1 and r.role_code='UNIT_REPORTER'
        and not u.is_deleted and u.status='Hoạt động'
        and (r.effective_from is null or r.effective_from<=$2::date)
        and (r.effective_to is null or r.effective_to>=$2::date)
        and (r.submodules is null or r.submodules ? 'input')
        and exists(select 1 from user_permissions up join permissions p on p.id=up.permission_id
          join modules m on m.id=p.module_id where up.user_id=u.id and m.module_key='dailyReports')
      ) as value`, [user.unitId, day]);
    const sources = [...cases, ...metrics.map(item => ({ ...item,
      summary: item.metric_code === 'DAILY_POLICE_WORK'
        ? intakeMetricText(item.metric_values, item.primitive_weapon_type,
          item.work_domain, item.administrative_domains) : 'Kết quả công tác · ' + item.metric_code
    })), ...situations].map(item => ({ ...item,
      created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() }));
    const unit = { id: String(user.unitId), name: user.unitName, group: user.unitGroup, expected: expected.value };
    const snapshot = summarizeDashboard({ day, span, now, units: [unit],
      sources: sources.filter(item => item.state !== 'DRAFT' && item.day >= earliest) });
    const unitDashboard = summarizeUnit({ unit, modules, sources, unlocks, day, span, now });
    await client.query('commit');
    return { ...snapshot, audience: 'unit', unitDashboard };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
