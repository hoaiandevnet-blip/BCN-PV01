import { ensureCoreSchema, ensureApplicationModules } from './core-schema.js';
import { ensureDailyReportSchema } from './daily-reports/schema.js';
import { ensureSettingsSchema } from './settings.js';

export async function initializeSchema(pool) {
  await ensureCoreSchema(pool);
  await ensureDailyReportSchema(pool);
  await ensureApplicationModules(pool);
  await ensureSettingsSchema(pool);
}

export async function prepareDatabase(pool, mode = process.env.BCN_SCHEMA_MODE || 'auto') {
  if (mode === 'auto') return initializeSchema(pool);
  if (mode !== 'runtime') throw new Error('BCN_SCHEMA_MODE chỉ chấp nhận auto hoặc runtime.');
  const { rows: [role] } = await pool.query(`select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
    has_schema_privilege(current_user,'public','CREATE') as can_create
    from pg_roles where rolname=current_user`);
  if (!role || Object.values(role).some(Boolean)) {
    throw new Error('Chế độ runtime yêu cầu tài khoản database hạn quyền, không có quyền tạo schema.');
  }
  await pool.query('select id from daily_report_drafts limit 0');
}
