import pg from 'pg';
import dotenv from 'dotenv';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const appRoot = path.join(root, 'BCNPV01');
const env = dotenv.config({ path: path.join(root, '.env') }).parsed;
const nextEnv = dotenv.config({ path: path.join(appRoot, '.env') }).parsed;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const next = new pg.Pool({ connectionString: nextEnv.DATABASE_URL });
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const retired = key => /^dailyReport/.test(key) || ['digitalMap', 'nq57Meeting'].includes(key);
const audit = { startedAt: new Date().toISOString(), droppedTables: [], removedModules: [], unaffected: {} };
try {
  const verification = JSON.parse(await readFile(path.join(appRoot, 'outputs/verification.json'), 'utf8'));
  if (verification.status !== 'PASS') throw new Error('Chưa đạt kiểm chứng phần mềm mới; không được gỡ hệ thống cũ.');
  const tables = (await pool.query("select tablename from pg_tables where schemaname='public'")).rows.map(row => row.tablename);
  const businessTables = tables.filter(table => /^(daily_report_|digital_map_)/.test(table));
  if (!businessTables.length) throw new Error('Các bảng đã được gỡ; không chạy lại thao tác chuyển giao.');
  const external = await pool.query(`select conrelid::regclass::text as source,confrelid::regclass::text as target
    from pg_constraint where contype='f' and confrelid::regclass::text=any($1::text[])
    and not(conrelid::regclass::text=any($1::text[]))`, [businessTables]);
  if (external.rowCount) throw new Error('Có khóa ngoại từ module khác; không tự động xóa.');
  for (const table of businessTables) {
    const count = Number((await pool.query(`select count(*) from "${table}"`)).rows[0].count);
    audit.droppedTables.push({ name: table, rows: count });
  }
  const expected = { daily_report_cases: 22, daily_report_metrics: 1, digital_map_cases: 1057 };
  for (const [table, count] of Object.entries(expected)) {
    if (audit.droppedTables.find(row => row.name === table)?.rows !== count) {
      throw new Error(`Dữ liệu ${table} đã thay đổi kể từ kiểm kê. Dừng để đối chiếu.`);
    }
  }
  const nonDemo = await pool.query('select 1 from digital_map_periods where not is_demo');
  if (nonDemo.rowCount) throw new Error('Có kỳ bản đồ không phải demo; cần đối chiếu lại.');
  for (const sql of [
    'select id,username,password_hash,team_id,is_admin,status from users order by id',
    'select id,user_id,role_code,unit_id,metric_code,submodules from daily_report_user_roles order by id'
  ]) {
    if (JSON.stringify((await pool.query(sql)).rows) !== JSON.stringify((await next.query(sql)).rows)) {
      throw new Error('Tài khoản hoặc phân quyền chưa khớp; không gỡ dữ liệu nguồn.');
    }
  }
  audit.identityVerified = true;
  for (const table of tables.filter(table => !businessTables.includes(table)
    && !['modules', 'permissions', 'user_permissions', 'activity_logs', 'notification_feed_reads',
      'notification_feed_events', 'users'].includes(table))) {
    const result = await pool.query(`select count(*)::int as count,
      md5(coalesce(string_agg(row_to_json(t)::text, '' order by row_to_json(t)::text),'')) as checksum from "${table}" t`);
    audit.unaffected[table] = result.rows[0];
  }
  const manifest = JSON.parse(await readFile(path.join(appRoot, '.private/retirement-manifest.json'), 'utf8'));
  for (const [relative, digest] of Object.entries(manifest)) {
    if (digest.before && hash(await readFile(path.join(root, relative))) !== digest.before) {
      throw new Error('Mã nguồn thay đổi trong lúc chuẩn bị: ' + relative);
    }
    if (hash(await readFile(path.join(appRoot, '.private/retirement', relative))) !== digest.after) {
      throw new Error('Bản chuẩn bị không đúng checksum: ' + relative);
    }
  }
  for (const relative of Object.keys(manifest)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await copyFile(path.join(appRoot, '.private/retirement', relative), path.join(root, relative));
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='8s'");
    const modules = (await client.query('select id,module_key from modules')).rows.filter(row => retired(row.module_key));
    const ids = modules.map(row => row.id);
    await client.query(`delete from user_permissions where permission_id in
      (select id from permissions where module_id=any($1::bigint[]))`, [ids]);
    await client.query('delete from permissions where module_id=any($1::bigint[])', [ids]);
    await client.query('delete from modules where id=any($1::bigint[])', [ids]);
    await client.query("delete from activity_logs where module_key ~ '^dailyReport' or module_key=any($1::text[])",
      [['digitalMap', 'nq57Meeting']]);
    await client.query(`update users set notification_modules=array(select key from unnest(notification_modules) key
      where key !~ '^dailyReport' and key not in ('digitalMap','nq57Meeting')) where notification_modules is not null`);
    await client.query('drop table ' + businessTables.map(table => '"' + table + '"').join(', '));
    await client.query('commit');
    audit.removedModules = modules.map(row => row.module_key);
  } catch (error) {
    await client.query('rollback');
    for (const [relative, digest] of Object.entries(manifest)) {
      if (digest.before) await copyFile(path.join(appRoot, '.private/old-source', relative), path.join(root, relative));
    }
    throw error;
  } finally {
    client.release();
  }
  audit.finishedAt = new Date().toISOString();
  await writeFile(path.join(appRoot, 'outputs/retirement.json'), JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ status: 'PASS', droppedTables: audit.droppedTables.length,
    removedModules: audit.removedModules, identityVerified: audit.identityVerified }, null, 2));
} finally {
  await pool.end();
  await next.end();
}
