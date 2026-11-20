import { isPv01Unit } from './role-policy.js';

// Membership follows the current unit directory. It never creates a role grant.
export async function pv01UnitIds(db, values) {
  const unitIds = [...new Set(values.filter(value => value != null).map(String))];
  if (!unitIds.length) return new Set();
  const { rows } = await db.query(`with recursive ancestors as (
    select t.id as source_id,t.id,t.name,t.department_id,
      (to_jsonb(t)->>'parent_team_id')::bigint as parent_team_id,array[t.id] as visited
    from teams t where t.id=any($1::bigint[])
    union all
    select a.source_id,t.id,t.name,t.department_id,
      (to_jsonb(t)->>'parent_team_id')::bigint,a.visited || t.id
    from ancestors a join teams t on t.id=a.parent_team_id
    where not t.id=any(a.visited)
  )
  select a.source_id,a.name as unit_name,d.name as department_name,p.unit_code
  from ancestors a left join departments d on d.id=a.department_id
  left join daily_report_unit_profiles p on p.unit_id=a.id`, [unitIds]);
  return new Set(rows.filter(isPv01Unit).map(row => String(row.source_id)));
}
