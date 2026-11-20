import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';
import { intakeSchema } from '../server/daily-reports/intake/validation.js';
import { verifySettings } from './verify-settings.mjs';
import { verifyAccounts } from './verify-accounts.mjs';
import { verifyStartup } from './verify-startup.mjs';
import { verifyBrowserIds } from './verify-browser-ids.mjs';
import { verifyReportMap } from './verify-report-map.mjs';
import { verifyDashboard } from './verify-dashboard.mjs';
import { verifyUnitDashboard } from './verify-unit-dashboard.mjs';
import { verifyDuplicates } from './verify-duplicates.mjs';
import { verifyReportNotifications } from './verify-report-notifications.mjs';
import { verifyReturnedAttention } from './verify-returned-attention.mjs';
import { verifyCompactScreen } from './verify-compact-screen.mjs';
import { verifySourcePreview } from './verify-source-preview.mjs';
import { verifyNotificationAppearance } from './verify-notification-appearance.mjs';
import { verifyUnitIsolation } from './verify-unit-isolation.mjs';
import { verifyCaseReader } from './verify-case-reader.mjs';
import { verifyApprovalPermissions } from './verify-approval-permissions.mjs';
import { verifyCaseActions } from './verify-case-actions.mjs';
import { verifyCaseResubmission } from './verify-case-resubmission.mjs';
import { verifyEntryLock } from './verify-entry-lock.mjs';
import { verifyUnlockWorkspace } from './verify-unlock-workspace.mjs';
import { verifyPet } from './pet-seedy/verify.mjs';
import { verifySeedy } from './seedy-ai/verify.mjs';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs');
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const databaseName = 'bcnpv01_test_' + Date.now();
const temp = await mkdtemp(path.join(tmpdir(), 'bcnpv01-verify-'));
const password = randomBytes(24).toString('hex');
const checks = [];
const errors = [];
let productionBaseline;
const productionCounts = async () => (await pool.query(`select
  (select count(*) from daily_report_cases) as cases,
  (select count(*) from daily_report_intake_batches) as reports,
  (select count(*) from digital_map_cases) as map_cases,
  (select count(*) from users where not is_deleted) as accounts`)).rows[0];
let database;
let server;
let browser;
let primaryPage;
const pendingRequests = new Map();
const failedRequests = [];
let log = '';
const check = label => {
  checks.push({ label, at: new Date().toISOString() });
  console.log('PASS', label);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(handler, description, limit = 30000) {
  const until = Date.now() + limit;
  while (Date.now() < until) {
    if (await handler()) return;
    await sleep(150);
  }
  throw new Error('Timed out: ' + description + '\n' + log);
}
const base = 'http://127.0.0.1:4311';
async function request(endpoint, { cookie = '', method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(base + endpoint, { method,
    headers: { cookie, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const content = response.headers.get('content-type') || '';
  const data = content.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(username) {
  const result = await request('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.match(result.cookie, /^bcnpv01_session=/);
  return result.cookie;
}
try {
  await mkdir(output, { recursive: true });
  await mkdir(output + '/theme', { recursive: true });
  productionBaseline = await productionCounts();
  check('Production baseline recorded; verification uses an isolated database copy');
  execFileSync(pgBin + 'pg_dump', ['--dbname', pool.options.connectionString, '-Fc', '-f', temp + '/clean.dump']);
  await pool.query(`create database "${databaseName}"`);
  const url = new URL(pool.options.connectionString);
  url.pathname = '/' + databaseName;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', temp + '/clean.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  await database.query('update users set password_hash=$1', [hashPassword(password)]);
  server = spawn(process.execPath, ['server/index.js'], { cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4311', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data.toString(); });
  server.stderr.on('data', data => { log += data.toString(); });
  await waitFor(() => log.includes('BCNPV01 ready'), 'server startup');
  const admin = await login('admin');
  const reporter = await login('demo.canbo02');
  const compiler = await login('ttttch.pv01');
  check('Real password login works for migrated admin, reporter and PV01 compiler');
  assert.equal((await request('/api/accounts')).status, 401);
  assert.equal((await request('/api/accounts', { cookie: reporter })).status, 403);
  assert.equal((await request('/api/digital-map/import', {
    method: 'POST', headers: { 'x-actor': 'admin' }, body: {}
  })).status, 401);
  assert.equal((await request('/api/digital-map/rows', { cookie: reporter })).status, 403);
  assert.equal((await request('/api/login', { method: 'POST', headers: { origin: 'https://invalid.example' },
    body: { username: 'admin', password } })).status, 403);
  assert.equal((await request('/.private/before-transfer.dump')).status, 404);
  assert.equal((await request('/server/accounts.js')).status, 404);
  check('Anonymous, forged actor, wrong role, cross-origin and private file access are denied');
  const reportScope = await request('/api/bao-cao-ngay/scope', { cookie: reporter });
  assert.equal(reportScope.status, 200);
  assert.deepEqual(reportScope.data.roles, ['UNIT_REPORTER']);
  assert.equal(String(reportScope.data.unitId), '114');
  const compileScope = await request('/api/bao-cao-ngay/scope', { cookie: compiler });
  assert.ok(compileScope.data.roles.includes('PV01_COMPILER'));
  assert.ok(compileScope.data.compilerModules.includes('composer'));
  check('Migrated unit and PV01 role scopes match existing assignments');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  primaryPage = page;
  page.on('request', request => pendingRequests.set(request, {
    method: request.method(), path: new URL(request.url()).pathname, startedAt: new Date().toISOString()
  }));
  page.on('requestfinished', request => pendingRequests.delete(request));
  page.on('requestfailed', request => {
    failedRequests.push({ ...pendingRequests.get(request), error: request.failure()?.errorText });
    pendingRequests.delete(request);
  });
  page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER', error.message); });
  await page.goto(base);
  await page.locator('#loginScreen').waitFor({ state: 'visible' });
  await page.screenshot({ path: output + '/login.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBrandFits = await page.locator('.bcn-login-brand').evaluate(brand => {
    const rect = brand.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.right <= innerWidth &&
      document.documentElement.scrollWidth <= innerWidth;
  });
  assert.equal(mobileBrandFits, true, 'Login branding must stay reachable at the top of a small screen');
  await page.screenshot({ path: output + '/theme/login-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check('Enlarged login branding stays visible without clipping on mobile');
  await page.locator('#loginAccount').fill('admin');
  await page.locator('#loginPassword').fill(password);
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
  assert.equal(await page.locator('#loginPassword').getAttribute('type'), 'text');
  assert.equal(await page.locator('#loginPassword').inputValue(), password);
  assert.equal(await page.locator('#loginScreen').isVisible(), true);
  assert.equal(await page.locator('#togglePassword').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true }).press('Space');
  assert.equal(await page.locator('#loginPassword').getAttribute('type'), 'password');
  assert.equal(await page.locator('#loginPassword').inputValue(), password);
  check('Password visibility toggles by pointer and keyboard without submitting or changing the password');
  await page.locator('#loginForm button[type=submit]').click();
  await page.locator('#appShell').waitFor({ state: 'visible' });
  await page.getByText('Xin chào,', { exact: false }).waitFor();
  await page.screenshot({ path: output + '/home.png', fullPage: true });
  check('Browser login opens the independent workspace');
  await verifyUnlockWorkspace({ request, reporter, compiler, database, browser, base, output, check, errors });
  await verifyBrowserIds({ chromium, base, password, database, output, check, errors });
  await verifyCompactScreen({ browser, base, reporter, output, check, errors });
  await verifySourcePreview({ request, reporter, database, browser, base, output, check, errors });
  await verifyNotificationAppearance({ request, admin, reporter, database, browser, base, output, check, errors });
  await verifyPet({ page, browser, base, output, check, errors });
  await verifySeedy({ page, request, login, admin, reporter, base, output, password, check });
  const navigationFits = await page.evaluate(() => {
    const submenu = document.getElementById('dailyReportNavSubmenu');
    const frame = submenu.getBoundingClientRect();
    return Array.from(submenu.querySelectorAll('button:not([hidden])')).every(button => {
      const rect = button.getBoundingClientRect();
      return rect.height > 0 && rect.top >= frame.top && rect.bottom <= frame.bottom + 1;
    });
  });
  assert.equal(navigationFits, true, 'Report navigation must not be clipped by a collapsed submenu');
  check('All report navigation items have visible, unclipped hit areas');
  await verifyStartup({ page, browser, base, output, check, errors });
  await verifyDashboard({ request, admin, reporter, compiler, page, database, output, check });
  await verifyUnitDashboard({ request, admin, reporter, compiler, database, browser, base,
    output, password, check, errors });
  await verifyDuplicates({ page, request, admin, reporter, database, output, check });
  await verifyEntryLock({ request, reporter, database, browser, base, output, check, errors });
  await verifyReportNotifications({ request, admin, reporter, compiler, database, browser, base, output, check, errors });
  await verifyReturnedAttention({ request, login, reporter, compiler, database,
    browser, base, output, check, errors });
  await verifyUnitIsolation({ request, login, admin, reporter, compiler, database, browser, base,
    output, check, errors, password });
  await verifyCaseResubmission({ request, login, reporter, compiler, database, browser, base, output, check, errors });
  await verifyCaseReader({ request, login, reporter, compiler, database, browser, base, output, check, errors });
  await verifyApprovalPermissions({ request, login, admin, reporter, compiler, database, browser, base,
    password, output, check, errors });
  await verifyCaseActions({ request, reporter, compiler, database, browser, base, output, check, errors });
  await verifySettings({ request, admin, reporter, compiler, page, browser, base, password,
    database, output, check, errors });
  await page.locator('#notificationToggle').click();
  await page.locator('#notificationPanel').waitFor({ state: 'visible' });
  const panelFits = await page.locator('#notificationPanel').evaluate(panel => {
    const rect = panel.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && rect.left >= 0;
  });
  assert.equal(panelFits, true, 'Notifications must open inside the viewport');
  assert.equal(await page.locator('[data-notification-kind=asset]').count(), 0);
  assert.doesNotMatch(await page.locator('[data-notification-summary]').innerText(), /tài sản/i);
  assert.doesNotMatch(await page.locator('[data-notification-search]').getAttribute('placeholder'), /tài sản/i);
  await page.screenshot({ path: output + '/theme/notifications.png' });
  await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  check('Notification panel opens inside the viewport and closes correctly');
  await page.evaluate(() => {
    window.__appNotices = [];
    const popup = window.NotificationPopup.getShared();
    const original = popup.notify.bind(popup);
    popup.notify = (message, ...args) => {
      window.__appNotices.push(String(message));
      return original(message, ...args);
    };
  });

  await page.locator('#sidebar [data-bcn-view=input]').click();
  await page.locator('#bcnDailyIntake').waitFor({ state: 'visible' });
  await page.screenshot({ path: output + '/report.png', fullPage: true });
  for (const view of ['registry', 'approval', 'legal', 'returned', 'updates', 'unlock',
    'duplicates', 'composer', 'permissions', 'history']) {
    await page.locator(`[data-bcn-view="${view}"]`).click();
    await page.locator(`#dailyReports[data-bcn-active-view="${view}"]`).waitFor({ state: 'visible' });
    if (view === 'permissions') await page.locator('#bcnRoleRows article').first().waitFor();
    await page.screenshot({ path: output + '/theme/' + view + '.png' });
  }
  check('All eleven report workspaces open in the real browser');
  await page.locator('[data-page=accounts]').click();
  await page.locator('#accountRows tr').first().waitFor();
  await page.locator('#addAccount').click();
  await page.locator('dialog[open] input[name=username]').fill('verify.new');
  await page.locator('dialog[open] input[name=full_name]').fill('Tài khoản kiểm chứng độc lập');
  await page.locator('dialog[open] input[name=password]').fill(password);
  await page.locator('dialog[open] select[name=team_id]').selectOption('114');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.locator('dialog.bcn-dialog[open]').waitFor({ state: 'detached' });
  assert.equal((await database.query("select count(*)::int as count from users where username='verify.new'")).rows[0].count, 1);
  const newCookie = await login('verify.new');
  assert.equal((await request('/api/bao-cao-ngay/scope', { cookie: newCookie })).status, 403);
  check('Account creation persists and a new account receives no implicit report permissions');
  const createdId = (await database.query("select id from users where username='verify.new'")).rows[0].id;
  const createdAccount = (await request('/api/accounts/' + createdId, { cookie: admin })).data;
  const availablePermissions = (await request('/api/accounts', { cookie: admin })).data.permissions;
  const granted = availablePermissions.filter(item => ['dailyReports', 'dailyReportInput'].includes(item.module_key));
  const changedAccount = { ...createdAccount, permission_ids: granted.map(item => item.id) };
  assert.equal((await request('/api/accounts/' + createdId, { cookie: admin, method: 'PUT',
    body: changedAccount })).status, 200);
  assert.equal((await request('/api/bao-cao-ngay/user-roles', { cookie: admin, method: 'PUT',
    body: { user_id: Number(createdId), role_code: 'UNIT_REPORTER', unit_id: 114 } })).status, 201);
  const grantedCookie = await login('verify.new');
  assert.equal((await request('/api/bao-cao-ngay/scope', { cookie: grantedCookie })).status, 200);
  assert.equal((await request('/api/accounts/' + createdId, { cookie: admin, method: 'PUT',
    body: { ...changedAccount, status: 'Tạm khóa' } })).status, 200);
  assert.equal((await request('/api/me', { cookie: grantedCookie })).status, 401);
  check('Granting module and business role takes effect; locking the account revokes its sessions');
  await verifyAccounts({ request, admin, reporter, compiler, page, password, database, output, check, login });

  await page.locator('[data-page=directory]').click();
  await page.locator('#addDirectory').click();
  await page.locator('dialog[open] input[name=name]').fill('Đơn vị kiểm chứng riêng');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.getByText('Đơn vị kiểm chứng riêng', { exact: true }).waitFor();
  check('Directory management writes to the independent database');
  await verifyReportMap({ page, database, request, admin, reporter, output, check });

  const schema = intakeSchema;
  const unitId = 114;
  const reportDay = reportScope.data.reportDay;
  const id = randomUUID();
  const values = Object.fromEntries(schema.legacyFields.map(([key]) => [key, 0]));
  if (!reportScope.data.beforeCutoff) {
  const unlocked = await request('/api/bao-cao-ngay/unlock-requests', { cookie: reporter, method: 'POST',
    body: { report_day: reportDay, scope: { kind: 'WORK_RESULT', id }, reason: 'Kiểm chứng sau giờ khóa' } });
  assert.equal(unlocked.status, 201, JSON.stringify(unlocked.data));
  const approved = await request(`/api/bao-cao-ngay/unlock-requests/${unlocked.data.id}/decide`, {
    cookie: compiler, method: 'POST', body: { decision: 'APPROVED', reason: 'Cho phép kiểm chứng nghiệp vụ' }
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  }
  const submitted = await request('/api/bao-cao-ngay/daily-intake', { cookie: reporter, method: 'POST',
    body: { id, unit_id: unitId, report_day: reportDay, mode: 'NORMAL', incidents: [], values, attachments: [] } });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
  assert.equal(submitted.data.state, 'PENDING_REVIEW');
  const incomingReports = await request('/api/notifications', { cookie: compiler });
  for (const [type, resourceId] of [['WORK_RESULT', submitted.data.id], ['SITUATION', submitted.data.situation_id]]) {
    assert.ok(incomingReports.data.items.some(item => item.eventType === type + '_PENDING_REVIEW'
      && item.dailyReportRef.resourceId === resourceId && item.dailyReportRef.reportDay === reportDay
      && !item.read), `Compiler receives the submitted ${type}`);
  }
  check('Submitting a daily report notifies the compiler of both work results and the situation report');
  const latest = await request(`/api/bao-cao-ngay/daily-intake/latest?unit_id=${unitId}`, { cookie: admin });
  assert.equal(latest.status, 200);
  assert.equal(latest.data.submitted, true);
  const otherReporter = await login('demo.canbo03');
  assert.equal((await request(`/api/bao-cao-ngay/daily-intake/latest?unit_id=${unitId}`,
    { cookie: otherReporter })).status, 404);
  check('Report submission persists, reloads and blocks a different unit from reading it');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menuToggle').click();
  await page.locator('#sidebar [data-bcn-view=input]').click();
  await page.locator('#dailyReports').waitFor({ state: 'visible' });
  await page.locator('#bcnDailyIntake').waitFor({ state: 'visible' });
  await page.evaluate(() => window.NotificationPopup.getShared().reset());
  await page.screenshot({ path: output + '/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
  check('Mobile navigation works without page-level horizontal overflow');

  await page.locator('#menuToggle').click();
  await page.locator('[data-page=home]').click();
  await page.locator('#home.active').waitFor({ state: 'visible' });
  await page.locator('#changePassword').click();
  await page.locator('dialog[open] input[name=currentPassword]').fill(password);
  await page.locator('dialog[open] input[name=password]').fill(password + 'new');
  const passwordResponse = page.waitForResponse(response => response.url().endsWith('/api/change-password'));
  await page.locator('dialog[open] button[type=submit]').click();
  assert.equal((await passwordResponse).status(), 200);
  assert.equal((await request('/api/me', { cookie: admin })).status, 401);
  check('Changing password from Home works and revokes previous sessions');
  const capturedNotices = await page.evaluate(() => window.__appNotices || []);
  await writeFile(output + '/browser-notices.json', JSON.stringify(capturedNotices, null, 2));
  assert.deepEqual(capturedNotices.filter(message => /is not defined|Cannot |undefined/.test(message)), []);
  await page.locator('#logout').click();
  await page.locator('#loginScreen').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#loginPassword').getAttribute('type'), 'password');
  assert.equal(await page.locator('#loginPassword').inputValue(), '');
  assert.equal((await page.request.get(base + '/api/me')).status(), 401);
  check('Logout revokes the session');
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  check('No browser JavaScript errors');
  assert.deepEqual(await productionCounts(), productionBaseline);
  check('Verification left production report, map and account counts unchanged');
  await writeFile(output + '/verification.json', JSON.stringify({ status: 'PASS', checks, errors }, null, 2));
  console.log('VERIFICATION PASS:', checks.length, 'checks');
} catch (error) {
  await primaryPage?.screenshot({ path: output + '/verification-failure.png', timeout: 5000 }).catch(() => {});
  await writeFile(output + '/verification.json', JSON.stringify({ status: 'FAIL', checks,
    error: error.stack, browserErrors: errors,
    pendingRequests: [...pendingRequests.values()], failedRequests }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await waitFor(() => server.exitCode !== null, 'server shutdown', 10000).catch(() => server.kill('SIGKILL'));
  }
  await writeFile(output + '/verification-server.log', log);
  if (database) await database.end();
  await pool.query(`drop database if exists "${databaseName}" with (force)`);
  await pool.end();
  await rm(temp, { recursive: true, force: true });
}
