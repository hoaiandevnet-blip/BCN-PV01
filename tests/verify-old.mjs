import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { hashPassword } from '../server/passwords.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'BCNPV01/outputs');
const env = dotenv.config({ path: path.join(root, '.env') }).parsed;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const temporary = await mkdtemp(path.join(tmpdir(), 'bcnpv01-old-qa-'));
const name = 'bcnpv01_test_old_' + Date.now();
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const checks = [];
const errors = [];
let database;
let server;
let browser;
let log = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = label => {
  console.log('PASS', label);
  checks.push({ label, at: new Date().toISOString() });
};
try {
  const retired = await pool.query(`select tablename from pg_tables where schemaname='public'
    and (tablename like 'daily_report_%' or tablename like 'digital_map_%')`);
  assert.equal(retired.rowCount, 0);
  assert.equal((await pool.query(`select 1 from modules where module_key ~ '^dailyReport'
    or module_key in ('digitalMap','nq57Meeting')`)).rowCount, 0);
  check('All 28 report/map tables and retired registry modules are absent after old-server restart');
  const audit = JSON.parse(await readFile(path.join(output, 'retirement.json'), 'utf8'));
  const baseline = JSON.parse(await readFile(path.join(output, 'unrelated-audit.json'), 'utf8'));
  for (const difference of baseline.differences) {
    assert.equal(difference.beforeCount, difference.afterCount);
    assert.ok(difference.fields.every(field => field === 'updated_at'
      || (difference.table === 'unit_directory_state' && field === 'revision')));
  }
  for (const [table, previous] of Object.entries(baseline.normalized)) {
    const exclude = table === 'unit_directory_state' ? "-'revision'" : '';
    const current = (await pool.query(`select count(*)::int as count,
      md5(coalesce(string_agg((to_jsonb(t)-'updated_at'${exclude})::text, ''
      order by (to_jsonb(t)-'updated_at'${exclude})::text),'')) as checksum from "${table}" t`)).rows[0];
    assert.deepEqual(current, previous, 'Unrelated table changed: ' + table);
  }
  check('Unrelated business data is unchanged; only existing startup timestamps and directory revision advanced');
  execFileSync(pgBin + 'pg_dump', ['--dbname', env.DATABASE_URL, '-Fc', '-f', temporary + '/old.dump']);
  await pool.query(`create database "${name}"`);
  const url = new URL(env.DATABASE_URL);
  url.pathname = '/' + name;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', temporary + '/old.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  const password = randomBytes(24).toString('hex');
  await database.query('update users set password_hash=$1', [hashPassword(password)]);
  server = spawn(process.execPath, ['server/index.js'], { cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4312', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data.toString(); });
  server.stderr.on('data', data => { log += data.toString(); });
  for (let attempt = 0; attempt < 150 && !log.includes('running at'); attempt += 1) {
    if (server.exitCode !== null) throw new Error(log);
    await pause(200);
  }
  assert.match(log, /running at/, log);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('http://127.0.0.1:4312');
  await page.locator('#loginAccount').fill('admin');
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm button[type=submit]').click();
  await page.locator('#dashboardContent .command-banner').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.ops-health').waitFor({ state: 'visible' });
  await page.locator('.ops-health').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/old-dashboard.png', fullPage: true });
  assert.equal(await page.locator('#dailyReportNavGroup,#digitalMap,#nq57Meeting').count(), 0);
  assert.equal(requests.some(url => /^\/api\/(bao-cao-ngay|digital-map|smart-meetings)/.test(url)), false);
  assert.equal(await page.evaluate(() => moduleDefinitions.some(module =>
    /^dailyReport/.test(module.key) || ['digitalMap','nq57Meeting'].includes(module.key))), false);
  check('Old dashboard shows real asset operations and makes no calls to retired modules');
  await page.locator('.ops-health [data-dashboard-action=assetCategoryManager]').click();
  await page.locator('#assetCategoryManager.active').waitFor({ state: 'visible' });
  check('Replacement dashboard action opens the existing asset catalogue');
  for (const endpoint of ['/api/bao-cao-ngay/scope','/api/digital-map/rows','/api/smart-meetings/nq57']) {
    assert.equal((await page.request.get('http://127.0.0.1:4312' + endpoint)).status(), 404);
  }
  check('Retired APIs no longer exist');
  assert.deepEqual(errors, []);
  check('Old browser application has no JavaScript errors');
  await writeFile(output + '/old-verification.json', JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log('OLD VERIFICATION PASS:', checks.length, 'checks');
} catch (error) {
  await writeFile(output + '/old-verification.json', JSON.stringify({ status: 'FAIL', checks,
    error: error.stack, errors }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    for (let attempt = 0; attempt < 40 && server.exitCode === null; attempt += 1) await pause(100);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await writeFile(output + '/old-server.log', log);
  if (database) await database.end();
  await pool.query(`drop database if exists "${name}" with (force)`);
  await pool.end();
  await rm(temporary, { recursive: true, force: true });
}
