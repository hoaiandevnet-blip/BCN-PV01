function auditQuery(query, fail) {
  const reject = () => fail(422, 'INVALID_AUDIT_FILTER', 'Bộ lọc hoặc trang lịch sử không hợp lệ.');
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.page_size ?? 10);
  const search = query.q ?? '';
  const group = query.group ?? '';
  const outcome = query.outcome ?? '';
  const snapshot = query.snapshot ?? null;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) reject();
  if (![10, 20, 50].includes(pageSize)) reject();
  if (typeof search !== 'string' || search.length > 200) reject();
  if (!['', 'lookup', 'update', 'export', 'permissions'].includes(group)) reject();
  if (!['', 'ALLOW', 'DENY'].includes(outcome)) reject();
  if (snapshot !== null && (typeof snapshot !== 'string' || !/^\d{1,19}$/.test(snapshot)
    || BigInt(snapshot) > 9223372036854775807n)) reject();
  const pattern = search.trim().replace(/[\\%_]/g, value => '\\' + value);
  return { page, pageSize, pattern: pattern ? `%${pattern}%` : '', group, outcome, snapshot };
}

export function registerAuditRoutes(app, { base, pool, wrap, requireRole, fail }) {
  app.get(`${base}/audit`, requireRole('AUDITOR', 'PV01_COMPILER'), wrap(async (req, res) => {
    const filter = auditQuery(req.query, fail);
    const roles = req.dailyActor.roles.filter(role => ['AUDITOR', 'PV01_COMPILER'].includes(role.role_code));
    const global = req.dailyActor.is_admin || roles.some(role => role.unit_id === null);
    const units = roles.filter(role => role.unit_id).map(role => String(role.unit_id));
    // Count, page and snapshot use the same permission-filtered statement. New audit events cannot shift later pages.
    const { rows: [result] } = await pool.query(`
      with eligible as (
        select a.id as sort_id,a.id::text as id,a.actor_id,a.actor_unit_id,a.action,
          a.resource_type,a.resource_id,a.outcome,a.created_at,
          u.username as actor_username,u.full_name as actor_name,t.name as actor_unit_name,
          c.stable_code as case_code,
          case when a.action like 'ROLE\\_%' escape '\\' or a.action like '%/user-roles%'
              or a.action like '%/role-assignments%' then 'permissions'
            when a.resource_type='EXPORT' or a.action='DOCX_EXPORTED'
              or a.action like '%/exports/%' then 'export'
            when a.action like 'GET:%' then 'lookup'
            else 'update' end as action_group
        from daily_report_audit a
        left join users u on u.id=a.actor_id
        left join teams t on t.id=a.actor_unit_id
        left join daily_report_cases c on a.resource_type='CASE' and c.id::text=a.resource_id
          and ($1::boolean or c.unit_id=any($2::bigint[]))
        where ($1::boolean or a.actor_unit_id=any($2::bigint[]) or a.actor_id=$3)
          and ($7::bigint is null or a.id <= $7)
      ), filtered as (
        select * from eligible
        where ($4::text='' or concat_ws(' ',actor_username,actor_name,actor_unit_name,
            actor_id::text,resource_id,case_code,action) ilike $4 escape '\\')
          and ($5::text='' or action_group=$5)
          and ($6::text='' or outcome=$6)
      ), summary as (
        select count(*)::int as total,coalesce($7::bigint,max(sort_id),0)::text as snapshot,
          greatest(1,ceil(count(*)::numeric / $8)::int) as total_pages,
          least($9,greatest(1,ceil(count(*)::numeric / $8)::int)) as page
        from filtered
      ), current_page as (
        select * from filtered order by sort_id desc
        limit $8 offset (select (page - 1) * $8 from summary)
      )
      select summary.*,coalesce((select jsonb_agg(to_jsonb(current_page) - 'sort_id'
        order by sort_id desc) from current_page),'[]'::jsonb) as events from summary`,
    [global, units, req.dailyActor.id, filter.pattern, filter.group, filter.outcome,
      filter.snapshot, filter.pageSize, filter.page]);
    res.json({ events: result.events, pagination: {
      page: result.page, page_size: filter.pageSize, total: result.total,
      total_pages: result.total_pages, snapshot: result.snapshot
    } });
  }));
}
