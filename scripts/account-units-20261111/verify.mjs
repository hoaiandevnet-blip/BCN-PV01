import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from '../../server/db.js';
import { hashPassword } from '../../server/passwords.js';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = new URL('../../outputs/account-units-20261111/', import.meta.url);
const before = JSON.parse(await readFile(new URL('before.json', output), 'utf8'));
const applied = JSON.parse(await readFile(new URL('applied.json', output), 'utf8'));
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const databaseName = 'bcnpv01_test_account_units_' + Date.now();
const temporary = await mkdtemp(path.join(tmpdir(), 'bcnpv01-account-units-'));
const password = randomBytes(24).toString('hex');
const base = 'http://127.0.0.1:4313';
const checks = [];
const errors = [];
let database;
let server;
let browser;
let log = '';
let result;
const check = message => {
  checks.push(message);
  console.log('PASS', message);
};
try {
  const { rows: live } = await pool.query(`select id,username,team_id,updated_at from users order by id`);
  for (const previous of before.users) {
    const current = live.find(user => user.id === previous.id);
    const assignment = applied.assignments.find(item => item.id === previous.id);
    assert.equal(current?.team_id, assignment?.toUnitId || previous.team_id);
    if (!assignment) assert.equal(current.updated_at.toISOString(), previous.updated_at);
  }
  assert.equal(new Set(applied.assignments.map(item => item.toUnitId)).size, 12);
  check('Production assignments match all 12 requested changes; the seven commune and three protected accounts match backup');
  execFileSync(pgBin + 'pg_dump', ['--dbname', pool.options.connectionString, '-Fc', '-f', temporary + '/copy.dump']);
  await pool.query(`create database "${databaseName}"`);
  const url = new URL(pool.options.connectionString);
  url.pathname = '/' + databaseName;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', temporary + '/copy.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  // Only the isolated copy uses a generated password for browser verification.
  await database.query('update users set password_hash=$1', [hashPassword(password)]);
  server = spawn(process.execPath, ['server/index.js'], { cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4313', HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data.toString(); });
  server.stderr.on('data', data => { log += data.toString(); });
  for (let attempt = 0; attempt < 200 && !log.includes('BCNPV01 ready'); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(log.includes('BCNPV01 ready'), 'Verification server must start');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const signIn = async username => {
    await page.goto(base);
    await page.locator('#loginScreen').waitFor({ state: 'visible' });
    await page.locator('#loginAccount').fill(username);
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#appShell').waitFor({ state: 'visible' });
  };
  const signOut = async () => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.locator('#logout').click()
    ]);
    await page.locator('#loginScreen').waitFor({ state: 'visible' });
  };
  await signIn('admin');
  await page.locator('[data-page=accounts]').click();
  await page.locator('#accountRows').waitFor();
  for (const assignment of applied.assignments) {
    const row = page.locator(`#accountRows tr:has([data-edit="${assignment.id}"])`);
    assert.ok((await row.innerText()).includes(assignment.toUnitName));
    await row.locator('[data-edit]').click();
    const dialog = page.locator('dialog[open]');
    assert.equal(await dialog.locator('[name=team_id]').inputValue(), assignment.toUnitId);
    await dialog.locator('[data-cancel]').click();
  }
  await page.locator('#accountSearch').fill('demo.canbo');
  await page.screenshot({ path: fileURLToPath(new URL('account-list.png', output)), fullPage: true });
  check('Admin account list and all 12 account editors show the saved commune assignments in Chrome');
  await signOut();
  for (const assignment of applied.assignments) {
    await signIn(assignment.username);
    assert.equal(await page.locator('#accountUnit').innerText(), assignment.toUnitName);
    const account = await (await page.request.get(base + '/api/me')).json();
    assert.equal(String(account.team_id), assignment.toUnitId);
    assert.equal(account.team, assignment.toUnitName);
    const dashboard = await page.request.get(base + '/api/bao-cao-ngay/dashboard');
    assert.equal(dashboard.status(), 403, 'Changing a unit must not silently grant a reporting role');
    await page.getByText('Chưa có quyền xem dashboard', { exact: true }).waitFor();
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#accountUnit').innerText(), assignment.toUnitName);
    await signOut();
  }
  check('All 12 accounts log in and reload with their new unit; unassigned reporting roles remain denied');
  assert.deepEqual(errors, []);
  check('No browser JavaScript errors');
  result = { at: new Date().toISOString(), status: 'PASS', checks, errors };
} catch (error) {
  result = { at: new Date().toISOString(), status: 'FAIL', checks, errors, error: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  await database?.end();
  await pool.query(`drop database if exists "${databaseName}" with (force)`);
  await pool.end();
  await writeFile(new URL('verification.json', output), JSON.stringify(result, null, 2));
  await writeFile(new URL('verification-server.log', output), log);
  await rm(temporary, { recursive: true, force: true });
}
