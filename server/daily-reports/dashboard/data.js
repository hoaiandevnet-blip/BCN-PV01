import { intakeMetricText } from '../intake/routes.js';
import { normalizeUnitGroup } from '../role-policy.js';
import { shiftDay } from './statistics.js';

export async function loadDashboardData(pool, user, day, span) {
  const compiler = user.roles.filter(role => role.role_code === 'PV01_COMPILER');
  const global = user.is_admin || compiler.some(role => role.unit_id === null);
  const allowed = compiler.map(role => Number(role.unit_id)).filter(Boolean);
  if (user.roles.some(role => role.role_code === 'UNIT_REPORTER'
    && String(role.unit_id) === String(user.unitId))) allowed.push(Number(user.unitId));
  const earliest = shiftDay(day, 1 - Math.max(span * 2, 7 + span));
  const client = await pool.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');
    const units = await client.query(`select t.id,t.name,p.unit_group,d.unit_type,
      exists(select 1 from daily_report_user_roles r join users u on u.id=r.user_id
        where r.unit_id=t.id and u.team_id=t.id and r.role_code='UNIT_REPORTER'
          and not u.is_deleted and u.status='Hoạt động'
          and (r.effective_from is null or r.effective_from <= $1::date)
          and (r.effective_to is null or r.effective_to >= $1::date)
          and (r.submodules is null or r.submodules ? 'input')
          and exists(select 1 from user_permissions up join permissions permission on permission.id=up.permission_id
            join modules m on m.id=permission.module_id where up.user_id=u.id and m.module_key='dailyReports')
      ) as expected
      from teams t left join departments d on d.id=t.department_id
      left join daily_report_unit_profiles p on p.unit_id=t.id
      where ($2::boolean or t.id=any($3::bigint[])) order by t.name`, [day, global, allowed]);
    const parameters = [earliest, day, global, allowed];
    const cases = await client.query(`select id,unit_id,report_day::text as day,current_state as state,
      'CASE' as kind,business_code,classifications,duplicate_state,created_at,
      case when report_day=$2 then left(summary,1200) else '' end as summary
      from daily_report_cases where report_day between $1 and $2 and current_state<>'DRAFT'
        and ($3::boolean or unit_id=any($4::bigint[]))`, parameters);
    const metrics = await client.query(`select id,unit_id,report_day::text as day,state,
      'WORK_RESULT' as kind,metric_code,created_at,
      case when report_day=$2 then metric_values else '{}'::jsonb end as metric_values,
      primitive_weapon_type,work_domain,administrative_domains
      from daily_report_metrics where report_day between $1 and $2 and state<>'DRAFT'
        and ($3::boolean or unit_id=any($4::bigint[]))`, parameters);
    const situations = await client.query(`select id,unit_id,report_day::text as day,state,
      'SITUATION' as kind,created_at,case when report_day=$2 then left(narrative,1200) else '' end as summary
      from daily_report_situations where report_day between $1 and $2 and state<>'DRAFT'
        and ($3::boolean or unit_id=any($4::bigint[]))`, parameters);
    await client.query('commit');
    return { units: units.rows.map(unit => ({ id: String(unit.id), name: unit.name, expected: unit.expected,
      group: unit.unit_group || normalizeUnitGroup(unit.unit_type, unit.name) || 'KHAC' })),
    sources: [...cases.rows, ...metrics.rows.map(item => ({ ...item,
      summary: item.day !== day ? '' : item.metric_code === 'DAILY_POLICE_WORK'
        ? intakeMetricText(item.metric_values, item.primitive_weapon_type, item.work_domain, item.administrative_domains)
        : 'Kết quả công tác · ' + item.metric_code })), ...situations.rows]
      .map(item => ({ ...item, created_at: item.created_at.toISOString() })) };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
