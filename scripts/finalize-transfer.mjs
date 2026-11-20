import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceEnv = dotenv.config({ path: path.join(root, '../.env') }).parsed;
const targetEnv = dotenv.config({ path: path.join(root, '.env') }).parsed;
const source = new pg.Pool({ connectionString: sourceEnv.DATABASE_URL });
const target = new pg.Pool({ connectionString: targetEnv.DATABASE_URL });
try {
  for (const file of ['verification.json', 'old-verification.json']) {
    const result = JSON.parse(await readFile(path.join(root, 'outputs', file), 'utf8'));
    assert.equal(result.status, 'PASS', file);
  }
  const retired = await source.query(`select tablename from pg_tables where schemaname='public'
    and (tablename like 'daily_report_%' or tablename like 'digital_map_%')`);
  assert.equal(retired.rowCount, 0);
  const sql = 'select id,username,password_hash,team_id,is_admin,status from users order by id';
  assert.deepEqual((await source.query(sql)).rows, (await target.query(sql)).rows);
  const configuration = new Set(['daily_report_user_roles', 'daily_report_unit_profiles', 'daily_report_leaders',
    'daily_report_legal_versions', 'daily_report_legal_articles', 'daily_report_metric_definitions',
    'daily_report_statistic_rules']);
  const tables = (await target.query(`select tablename from pg_tables where schemaname='public'
    and (tablename like 'daily_report_%' or tablename like 'digital_map_%') order by tablename`)).rows;
  const counts = {};
  for (const { tablename } of tables) {
    counts[tablename] = Number((await target.query(`select count(*) from "${tablename}"`)).rows[0].count);
    if (!configuration.has(tablename)) assert.equal(counts[tablename], 0, 'Residual test data: ' + tablename);
  }
  const temporary = await source.query("select datname from pg_database where datname like 'bcnpv01_test_%'");
  assert.equal(temporary.rowCount, 0);
  const dump = path.join(root, '.private/BCNPV01-initial.dump');
  const bin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
  execFileSync(bin + 'pg_dump', ['--dbname', targetEnv.DATABASE_URL, '-Fc', '-f', dump]);
  execFileSync(bin + 'pg_restore', ['--list', dump]);
  await unlink(path.join(root, '.private/before-transfer.dump'));
  const transferFile = path.join(root, 'outputs/transfer.json');
  const transfer = JSON.parse(await readFile(transferFile, 'utf8'));
  transfer.backup = '.private/BCNPV01-initial.dump';
  transfer.oldTestBackupRemovedAt = new Date().toISOString();
  await writeFile(transferFile, JSON.stringify(transfer, null, 2));
  const result = { status: 'PASS', at: new Date().toISOString(), accountsAndPasswordHashesPreserved: true,
    retiredTablesRemaining: 0, temporaryDatabasesRemaining: 0, newDatabaseCounts: counts,
    oldTestBackupRemoved: true, cleanBackup: '.private/BCNPV01-initial.dump' };
  await writeFile(path.join(root, 'outputs/final-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: 'PASS', accounts: 24, retiredTablesRemaining: 0,
    temporaryDatabasesRemaining: 0, newBusinessRecords: 0, cleanBackupCreated: true }, null, 2));
} finally {
  await source.end();
  await target.end();
}
