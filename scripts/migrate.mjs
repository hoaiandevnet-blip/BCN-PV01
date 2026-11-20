import pg from 'pg';
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureCoreSchema, ensureApplicationModules } from '../server/core-schema.js';
import { ensureDailyReportSchema } from '../server/daily-reports/schema.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = dotenv.config({ path: new URL('../../.env', import.meta.url) }).parsed || {};
const sourceUrl = process.env.SOURCE_DATABASE_URL || environment.DATABASE_URL;
if (!sourceUrl) throw new Error('Thiếu SOURCE_DATABASE_URL.');
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = '/BCNPV01';
if (new URL(sourceUrl).pathname === targetUrl.pathname) throw new Error('Nguồn và đích phải khác nhau.');
const source = new pg.Pool({ connectionString: sourceUrl });
let target;
const transfer = { startedAt: new Date().toISOString(), database: 'BCNPV01', tables: {}, resetBusinessData: true };
const identityTables = ['departments', 'teams', 'ranks', 'positions', 'users', 'modules', 'permissions', 'user_permissions'];
const configurationTables = ['daily_report_unit_profiles', 'daily_report_user_roles', 'daily_report_leaders',
  'daily_report_metric_definitions', 'daily_report_statistic_rules', 'daily_report_legal_versions',
  'daily_report_legal_articles'];
const safeModule = key => key.startsWith('dailyReport') || ['digitalMap', 'permissions', 'teamManager'].includes(key);
const quote = name => '"' + name.replaceAll('"', '""') + '"';
try {
  const existing = await source.query("select 1 from pg_database where datname='BCNPV01'");
  if (existing.rowCount) throw new Error('BCNPV01 đã tồn tại. Không ghi đè database đang có.');
  await mkdir(root + '.private', { recursive: true, mode: 0o700 });
  const backupPath = root + '.private/before-transfer.dump';
  execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump',
    ['--dbname', sourceUrl, '--format=custom', '--file', backupPath], { stdio: 'pipe' });
  execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore', ['--list', backupPath], { stdio: 'pipe' });
  transfer.backup = '.private/before-transfer.dump';
  await source.query('create database "BCNPV01"');
  target = new pg.Pool({ connectionString: targetUrl.toString() });
  await ensureCoreSchema(target);
  const client = await target.connect();
  const sourceClient = await source.connect();
  const selected = {};
  try {
    await sourceClient.query('begin isolation level repeatable read read only');
    await client.query('begin');
    for (const table of identityTables) {
      let rows = (await sourceClient.query(`select * from ${quote(table)} order by 1`)).rows;
      if (table === 'modules') rows = rows.filter(row => safeModule(row.module_key));
      if (table === 'permissions') rows = rows.filter(row => selected.modules.some(module => module.id === row.module_id));
      if (table === 'user_permissions') rows = rows.filter(row => selected.permissions.some(perm => perm.id === row.permission_id));
      selected[table] = rows;
      for (const row of rows) {
        const copy = { ...row };
        if (table === 'teams') copy.parent_team_id = null;
        if (table === 'departments') copy.parent_id = null;
        if (table === 'users') {
          copy.failed_login_count = 0;
          copy.locked_until = null;
          if (copy.notification_modules) copy.notification_modules = copy.notification_modules.filter(safeModule);
        }
        const columns = Object.keys(copy);
        await client.query(`insert into ${quote(table)}(${columns.map(quote).join(',')})
          values(${columns.map((_, index) => '$' + (index + 1)).join(',')})`, Object.values(copy));
      }
      if (table === 'teams' || table === 'departments') {
        const column = table === 'teams' ? 'parent_team_id' : 'parent_id';
        for (const row of rows.filter(row => row[column])) {
          await client.query(`update ${quote(table)} set ${column}=$2 where id=$1`, [row.id, row[column]]);
        }
      }
      if (table !== 'user_permissions') await client.query(`select setval(pg_get_serial_sequence($1,'id'),
        greatest(coalesce((select max(id) from ${quote(table)}),0),1),
        exists(select 1 from ${quote(table)}))`, [table]);
      transfer.tables[table] = rows.length;
    }
    await client.query('commit');
    await ensureDailyReportSchema(target);
    await ensureApplicationModules(target);
    await client.query('begin');
    for (const table of configurationTables) {
      const rows = (await sourceClient.query(`select * from ${quote(table)} order by 1`)).rows;
      for (const row of rows) {
        const columns = Object.keys(row);
        const columnInfo = await client.query(`select column_name,data_type from information_schema.columns
          where table_schema='public' and table_name=$1`, [table]);
        const jsonColumns = new Set(columnInfo.rows.filter(item => /json/.test(item.data_type)).map(item => item.column_name));
        const values = columns.map(key => jsonColumns.has(key) && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
        await client.query(`insert into ${quote(table)}(${columns.map(quote).join(',')})
          values(${columns.map((_, index) => '$' + (index + 1)).join(',')})`, values);
      }
      const sequence = table === 'daily_report_user_roles' ? 'daily_report_user_roles_id_seq' : null;
      if (sequence) await client.query(`select setval($1::regclass,
        greatest(coalesce((select max(id) from ${quote(table)}),0),1),exists(select 1 from ${quote(table)}))`, [sequence]);
      transfer.tables[table] = rows.length;
    }
    await client.query('commit');
    await sourceClient.query('commit');
  } catch (error) {
    await client.query('rollback');
    await sourceClient.query('rollback');
    throw error;
  } finally {
    client.release();
    sourceClient.release();
  }
  await writeFile(root + '.env', `DATABASE_URL=${targetUrl}\nPORT=4310\nTILE_SERVER_PORT=8082\n`, { mode: 0o600 });
  transfer.finishedAt = new Date().toISOString();
  await writeFile(root + 'outputs/transfer.json', JSON.stringify(transfer, null, 2));
  console.log(JSON.stringify(transfer, null, 2));
} finally {
  await source.end();
  if (target) await target.end();
}
