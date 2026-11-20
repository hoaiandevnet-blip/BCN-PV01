// Move existing full review grants once; later permission changes must survive restarts.
export async function ensureApprovalSplit(pool) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`create table if not exists daily_report_module_migrations (
      migration_key text primary key, applied_at timestamptz not null default now()
    )`);
    const applied = await client.query(`insert into daily_report_module_migrations(migration_key)
      values('approval-split-v1') on conflict do nothing returning migration_key`);
    if (applied.rowCount) {
      await client.query(`update daily_report_user_roles
        set submodules=submodules || '["approval"]'::jsonb
        where role_code='PV01_COMPILER' and submodules is not null
          and (submodules ? 'registry' or submodules ? 'updates') and not submodules ? 'approval'`);
      await client.query(`insert into user_permissions(user_id,permission_id)
        select distinct role.user_id,permission.id from daily_report_user_roles role
          cross join permissions permission join modules module on module.id=permission.module_id
        where role.role_code='PV01_COMPILER' and module.module_key='dailyReportApproval'
          and (role.submodules is null or role.submodules ? 'approval')
        on conflict do nothing`);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
