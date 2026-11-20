import { runSubmoduleBrowser } from './daily-reports-submodules-browser.mjs';
import { verifyLoginExpiry } from './notification-login-expiry-browser.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { pool } from '../server/db.js';
import { runNotificationBrowser } from './daily-reports-notification-browser.mjs';
import { runReferenceUI } from './daily-reports-reference-ui.mjs';
import { runAdminMenu } from './daily-reports-admin-menu.mjs';
import { runBundledLegalBrowser } from './daily-reports-bundled-legal-browser.mjs';
import { runAccountPickerChecks } from './daily-reports-account-picker.mjs';
import { runRoleBrowser } from './daily-reports-role-browser.mjs';
import { runPv01ChoiceBrowser } from './daily-reports-pv01-choice-browser.mjs';
import { runHistoryBrowser } from './daily-reports-history-browser.mjs';
import { runLeaderLayoutChecks } from './daily-reports-leader-layout.mjs';
import { runLeaderDeleteBrowser } from './daily-reports-leader-delete-browser.mjs';
import { runMergedBusinessBrowser } from './daily-reports-merged-business-browser.mjs';
import { runClassificationBrowser } from './daily-reports-classifications-browser.mjs';
import { runReportTextBrowser } from './daily-reports-report-text-browser.mjs';
const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const name = `bcn_main_qa_${Date.now()}`;
const temporary = await mkdtemp(path.join(tmpdir(), 'bcn-main-qa-'));
const checks = [];
const errors = [];
const expectedResponses = new Set();
const apiFailures = [];
let database;
let child;
let browser;
let log = '';
try {
  await mkdir('outputs/daily-reports-menu-qa', { recursive: true });
  await mkdir('outputs/daily-reports-v8-qa', { recursive: true });
  await pool.query(`create database ${name}`);
  const connection = new URL(pool.options.connectionString);
  connection.pathname = '/' + name;
  database = new pg.Pool({ connectionString: connection.toString() });
  const bootstrap = await readFile('ttttch_production_bootstrap.sql', 'utf8');
  await database.query(bootstrap.slice(0, bootstrap.indexOf('INSERT INTO positions')) + '\nCOMMIT;');
  await database.query(bootstrap.slice(bootstrap.indexOf('INSERT INTO modules'), bootstrap.indexOf('INSERT INTO users')));
  const salt = randomBytes(16).toString('hex');
  const password = randomBytes(24).toString('hex');
  const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  const user = (await database.query(`insert into users(username,password_hash,full_name,is_admin)
    values('admin',$1,'Tài khoản kiểm thử giả',true) returning id`, [hash])).rows[0];
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env,
    DATABASE_URL: connection.toString(), PORT: String(port), DAILY_REPORT_STORAGE_ROOT: temporary,
    NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { log += data.toString(); });
  child.stderr.on('data', data => { log += data.toString(); });
  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (!log.includes('running at')) {
    if (child.exitCode !== null || Date.now() - started > 65000) throw new Error('Main app startup: ' + log.slice(-2500));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  checks.push('actual server/index.js initialized on an isolated empty database');
  await database.query(`insert into user_permissions select $1,id from permissions on conflict do nothing`, [user.id]);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let authenticated = false;
  page.on('pageerror', error => {
    errors.push(error.message);
    console.error(error.stack || error.message);
  });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    const loginProbe = !authenticated && pathname === '/api/session' && response.status() === 401;
    if (response.status() >= 400 && pathname.startsWith('/api/') && !loginProbe) {
      apiFailures.push(response);
    }
  });
  await page.goto(base);
  await page.locator('#loginAccount').fill('admin');
  await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible', timeout: 20000 });
  authenticated = true;
  await page.locator('#dailyReportNavToggle').click();
  await page.locator('#dailyReports').waitFor({ state: 'visible' });
  await page.locator('#bcnDraftNew').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('#bcnStatsLoad') !== null);
  checks.push('real login and existing sidebar open Daily Reports');
  if (process.argv.includes('--login-expiry-only')) {
    await verifyLoginExpiry({ page, base, checks });
  } else if (process.argv.includes('--submodules-only')) {
    await runSubmoduleBrowser({ page, database, base, hash, password, checks });
  } else {
  await runLeaderLayoutChecks({ page, base, checks });
  await runLeaderDeleteBrowser({ page, base, checks });
  await runAdminMenu({ page, database, base, userId: user.id, checks });
  await runAccountPickerChecks({ page, database, hash, checks });
  await runBundledLegalBrowser({ page, base, checks });
  await page.locator('[data-bcn-view="permissions"]').click();
  await page.locator('#bcnConfiguration > summary').click();
  await page.locator('#bcnConfigurationLoad').click();
  await page.waitForFunction(() => document.querySelector('#bcnDefinitionRows').textContent.includes('Chưa có bộ chỉ tiêu'));
  checks.push('configuration menu uses main app authentication, route and database');
  await page.locator('[data-bcn-view="composer"]').click();
  await page.locator('#bcnComposeLoad').click();
  await page.waitForFunction(() => document.querySelector('#bcnComposerRows').textContent.includes('Không có ý phù hợp'));
  checks.push('composer loads through actual main server');
  await runRoleBrowser({ page, database, base, hash, password, checks });
  await runPv01ChoiceBrowser({ page, database, base, hash, password, checks });
  await runNotificationBrowser({ page, database, base, hash, password, checks });
  await runReferenceUI({ page, database, base, checks, userId: user.id });
  await runReportTextBrowser({ page, database, base, checks, userId: user.id });
  await runMergedBusinessBrowser({ page, database, base, userId: user.id, checks });
  await runClassificationBrowser({ page, database, base, userId: user.id, checks, expectedResponses });
  await runHistoryBrowser({ page, database, userId: user.id, checks });
  await runSubmoduleBrowser({ page, database, base, hash, password, checks });
  if (!await page.locator('#dailyReports').isVisible()) {
    await page.locator('#dailyReportNavToggle').click();
  }
   await page.waitForFunction(() => [...document.querySelectorAll('[data-bcn-view]')]
     .filter(button => !button.hidden).length === 10);
   const menu = page.locator('#dailyReportNavSubmenu');
   assert.equal(await page.locator('.bcn-navigation, [data-bcn-tab]').count(), 0);
   assert.equal(await menu.locator('[data-bcn-view]:visible').count(), 10);
   assert.equal(await menu.locator('[data-bcn-view="overview"]').count(), 0);
   await page.evaluate(() => window.DailyReports.navigate('overview'));
   await page.waitForFunction(() => document.querySelector('#dailyReports').dataset.bcnActiveView === 'input');
   checks.push('10 operational menu items replace the retired overview and its former route opens input');
   const expected = {
     input: 'sources', registry: 'intake', legal: 'legal', returned: 'intake',
     updates: 'intake', unlock: 'unlock', duplicates: 'duplicates', composer: 'composer',
     permissions: 'permissions', history: 'notifications'
   };
  for (const [view, pane] of Object.entries(expected)) {
    await menu.locator(`[data-bcn-view="${view}"]`).click();
    await page.waitForFunction(value => document.querySelector('#dailyReports').dataset.bcnActiveView === value, view);
    assert.ok(await page.locator(`[data-bcn-pane="${pane}"]`).isVisible());
    assert.equal(await menu.locator('.active').count(), 1);
    assert.equal(await menu.locator('.active').getAttribute('data-bcn-view'), view);
    assert.equal(await menu.locator('.active').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded'), 'true');
    if (view === 'returned' || view === 'updates') {
      assert.ok(await page.locator(view === 'updates' ? '#bcnUpdatesColumns' : '#bcnCaseWorkflow').isVisible());
      assert.equal(await page.locator('#dailyReportStateFilter').isDisabled(), false);
    }
    checks.push(`sidebar routes ${view} to ${pane} and retains one active item`);
    await page.screenshot({ path: `outputs/daily-reports-v8-qa/main-${view}.png`, fullPage: true });
  }
   await menu.locator('[data-bcn-view="input"]').click();
   await page.locator('#mainSidebar nav').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: 'outputs/daily-reports-menu-qa/main-app-desktop.png', fullPage: true });
  await page.locator('#dailyReportNavGroup').screenshot({ path: 'outputs/daily-reports-menu-qa/sidebar.png' });
  const readMenuStyle = element => {
    const style = getComputedStyle(element);
    return ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'borderRadius', 'paddingLeft']
      .map(property => [property, style[property]]);
  };
  const dailyMenuStyle = await menu.locator('.active').evaluate(readMenuStyle);
  await page.locator('#sidebarCollapse').click();
  await page.locator('#dailyReportNavToggle').click();
  if (await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#dailyReportNavToggle').click();
  }
  const flyout = await menu.boundingBox();
  assert.ok(flyout.x > 50 && flyout.y >= 0 && flyout.y + flyout.height <= 1001);
  await menu.locator('[data-bcn-view="registry"]').click();
  assert.equal(await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator('[data-bcn-pane="intake"]').isVisible());
  checks.push('compact sidebar positions the full submenu inside viewport and closes after selection');
  await page.locator('#sidebarCollapse').click();
  await page.locator('#staffNavToggle').click();
  await page.locator('#staffNavSubmenu .nav-item').first().click();
  assert.ok(await page.locator('#staffDirectory').isVisible());
  assert.deepEqual(await page.locator('#staffNavSubmenu .nav-item.active').evaluate(readMenuStyle), dailyMenuStyle);
  checks.push('Daily Reports submenu uses the same computed colors, font and spacing as the native staff submenu');
  assert.equal(await menu.locator('[aria-current="page"]').count(), 0);
  assert.equal(await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded'), 'false');
  checks.push('existing staff module still opens from its sidebar group');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobileMenuToggle').click();
  await page.locator('#dailyReportNavToggle').click();
  await menu.locator('[data-bcn-view="composer"]').click();
  assert.ok(await page.locator('[data-bcn-pane="composer"]').isVisible());
  assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded'), 'false');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  checks.push('mobile navigation opens the selected screen, closes menu and avoids horizontal overflow');
  await page.screenshot({ path: 'outputs/daily-reports-menu-qa/main-app-mobile.png', fullPage: true });
  await page.locator('#mobileMenuToggle').click();
  await page.locator('#dailyReportNavToggle').click();
  await page.screenshot({ path: 'outputs/daily-reports-menu-qa/mobile-menu.png', fullPage: true });
  }
  errors.push(...apiFailures.filter(response => !expectedResponses.has(response))
    .map(response => `${response.status()}: ${new URL(response.url()).pathname}`));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length }));
} catch (error) {
  errors.push(error.message);
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  await database?.end();
  await pool.query(`drop database if exists ${name}`);
  await pool.end();
  await rm(temporary, { recursive: true, force: true });
  await mkdir('outputs/daily-reports-qa', { recursive: true });
  await writeFile('outputs/daily-reports-menu-qa/main-app-results.json', JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2));
  await writeFile('outputs/daily-reports-menu-qa/main-app-server.log', log);
}
