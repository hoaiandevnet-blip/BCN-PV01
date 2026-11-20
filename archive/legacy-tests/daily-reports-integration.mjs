import assert from 'node:assert/strict';
import { runExtendedChecks } from './daily-reports-extended.mjs';
import { runPaginationChecks } from './daily-reports-pagination.mjs';
import { runAuditPaginationChecks } from './daily-reports-audit-pagination.mjs';
import { runRolePolicyChecks } from './daily-reports-role-policy.mjs';
import { runV8Checks } from './daily-reports-v8.mjs';
import { runNotificationChecks } from './daily-reports-notifications.mjs';
import { runBundledLegalChecks } from './daily-reports-bundled-legal.mjs';
import { runLegalEntryChecks } from './daily-reports-legal-entry.mjs';
import { runAttachmentChecks } from './daily-reports-attachments.mjs';
import { testPersons } from './daily-reports-person-fixtures.mjs';
import { runPersonsChecks } from './daily-reports-persons.mjs';
import { runCaseTitleChecks } from './daily-reports-case-title.mjs';
import { runMergedBusinessChecks } from './daily-reports-merged-business.mjs';
import { runLeaderDeleteChecks } from './daily-reports-leader-delete.mjs';
import { runLocationChecks } from './daily-reports-location.mjs';
import { runClassificationChecks } from './daily-reports-classifications.mjs';
import { ensureNotificationSchema, registerNotificationRoutes } from '../server/notification-feed.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import JSZip from 'jszip';
import { pool } from '../server/db.js';
import { createSessionAuth, requireSameOrigin } from '../server/session-auth.js';
import { ensureDailyReportSchema } from '../server/daily-reports/schema.js';
import { registerDailyReportRoutes } from '../server/daily-reports/routes.js';

const schema = `bcn_test_${Date.now()}`;
const directory = await mkdtemp(path.join(tmpdir(), 'bcn-integration-'));
const checks = [];
const cookies = new Map();
let database;
let server;
let auth;
let dailyModule;
let now = new Date('2026-10-28T02:59:59.999Z');
let url;
const expect = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks.push({ label, passed: true, at: new Date().toISOString() });
};
async function call(user, endpoint, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
  const response = await fetch(url + (endpoint.startsWith('/api/') ? endpoint : '/api/bao-cao-ngay' + endpoint), {
    method, headers: { cookie: cookies.get(user) || '', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, data };
}
async function ok(user, endpoint, body, method) {
  const result = await call(user, endpoint, body, method);
  assert.ok(result.status < 300, `${endpoint}: ${result.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
try {
  await pool.query(`create schema ${schema}`);
  database = new pg.Pool({ ...pool.options, options: `-c search_path=${schema}`, max: 5 });
  await database.query(`
    create table departments(id bigint primary key,name text,unit_type text);
    create table teams(id bigint primary key,name text,department_id bigint references departments);
    create table users(id bigint primary key,username text,is_admin boolean,status text,is_deleted boolean,
      team_id bigint references teams);
    create table modules(id bigserial primary key,module_key text unique,name text,description text,icon text,
      visible boolean,is_admin_only boolean,is_custom boolean);
    create table permissions(id bigserial primary key,module_id bigint references modules,name text unique);
    create table user_permissions(user_id bigint references users,permission_id bigint references permissions,
      primary key(user_id,permission_id));
    insert into departments values(1,'Đơn vị xã thử','Xã'),(2,'Phòng thử','Phòng');
    insert into teams values(10,'Xã thử A',1),(11,'Xã thử B',1),(12,'PV01',2),(13,'Phòng thử',2);
    insert into users values(1,'qa-admin',true,'Hoạt động',false,null),
      (2,'qa-a',false,'Hoạt động',false,10),(3,'qa-b',false,'Hoạt động',false,11),
      (4,'qa-pv01',false,'Hoạt động',false,12),(5,'qa-legal',false,'Hoạt động',false,null),
      (6,'qa-scoped',false,'Hoạt động',false,12),(7,'qa-room',false,'Hoạt động',false,13);
    alter table users add column full_name text;
    update users set full_name='Nguyễn Văn An kiểm thử' where id=2;
  `);
  await database.query(`create table if not exists activity_logs (
    id bigserial primary key,actor_username text,module_key text,module_name text,detail text,
    entity_type text,entity_id text,severity text,created_at timestamptz default now(),
    action text,metadata jsonb,before_data jsonb,after_data jsonb
  )`);
  await ensureNotificationSchema(database);
  await ensureDailyReportSchema(database);
  await ensureDailyReportSchema(database);
  expect((await database.query('select count(*)::int as count from modules')).rows[0].count, 1,
    'idempotent schema preserves single module');
  await database.query(`insert into user_permissions select u.id,p.id from users u cross join permissions p;
    insert into daily_report_user_roles(user_id,role_code,unit_id) values
      (2,'UNIT_REPORTER',10),(3,'UNIT_REPORTER',11),(4,'PV01_COMPILER',null),
      (5,'LEGAL_REVIEWER',null),(6,'PV01_COMPILER',10);`);
  auth = createSessionAuth({ pool: database });
  const app = express();
  app.use((req, res, next) => req.path.startsWith('/api/bao-cao-ngay/')
    ? next() : express.json({ limit: '3mb' })(req, res, next));
  app.post('/qa/login', (req, res) => { auth.issue(req, res, { id: req.body.id }); res.json({ ok: true }); });
  dailyModule = registerDailyReportRoutes(app, { pool: database, auth, requireSameOrigin, storageRoot: directory,
    clock: () => new Date(now), scheduleMaintenance: false });
  registerNotificationRoutes(app, { pool: database, auth, sameOrigin: requireSameOrigin,
    dailyReports: dailyModule.notificationFeed });
  app.use('/assets', express.static(path.resolve('assets')));
  app.get('/qa/workspace', async (_req, res) => {
    const index = await readFile('index.html', 'utf8');
    const section = index.slice(index.indexOf('<section id="dailyReports"'), index.indexOf('<section id="permissions"'));
    const menuStart = index.indexOf('<div class="nav-group user-module" id="dailyReportNavGroup"');
    const menuEnd = index.indexOf('<button class="nav-item active admin-only"', menuStart);
    const menu = index.slice(menuStart, menuEnd);
    res.send(`<!doctype html><html lang="vi"><meta charset="utf-8">
      <link rel="stylesheet" href="/assets/css/style.css">
      <link rel="stylesheet" href="/assets/css/daily-reports.css">
      <link rel="stylesheet" href="/assets/css/daily-reports-attachments.css">
      <link rel="stylesheet" href="/assets/css/daily-reports-navigation.css">
      <link rel="stylesheet" href="/assets/css/daily-reports-preview.css?v=20261028-v8"/>
  <link rel="stylesheet" href="/assets/css/daily-reports-v8.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-reference.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-domain-colors.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-legal-detail.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-legal-import.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-permissions.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-permission-guides.css">
  <link rel="stylesheet" href="/assets/css/daily-reports-process.css">
  <link rel="stylesheet" href="/assets/js/notification-center/popup/style.css">
      <style>body{display:block;padding:24px}.page{display:block}
        #mainSidebar{max-width:270px}#dailyReportNavSubmenu{max-height:none;opacity:1}</style>
      <body><aside id="mainSidebar"><nav>${menu}</nav></aside>${section}
      <script src="/assets/js/notification-center/popup/view.js"></script>
      <script src="/assets/js/daily-reports-ui.js"></script>
      <script src="/assets/js/daily-reports-attachments.js"></script>
      <script src="/assets/js/daily-reports-v8-view.js"></script>
      <script src="/assets/js/daily-reports-presentation.js"></script>
      <script src="/assets/js/daily-reports-composer-view.js?v=20261028-v8"></script>
      <script src="/assets/js/daily-reports-composer.js?v=20261028-v8"></script>
      <script src="/assets/js/daily-reports-preview.js?v=20261028-v8"></script>
      <script src="/assets/js/daily-reports-navigation.js"></script>
      <script src="/assets/js/daily-reports-workspace-view.js"></script>
      <script src="/assets/js/daily-reports-account-picker.js"></script>
  <script src="/assets/js/daily-reports-role-picker.js"></script>
  <script src="/assets/js/daily-reports-entry-units.js"></script>
      <script src="/assets/js/daily-reports-configuration.js"></script>
      <script src="/assets/js/daily-reports-reference-panels.js"></script>
      <script src="/assets/js/daily-reports-reference-view.js"></script>
      <script src="/assets/js/daily-reports-workspace.js"></script>
      <script src="/assets/js/daily-reports.js"></script>
      <script>
        document.querySelectorAll('[data-bcn-view]').forEach(button => {
          button.onclick = () => window.DailyReports.navigate(button.dataset.bcnView);
        });
        window.DailyReports.activate();
      </script></body></html>`);
  });
  app.use((error, _req, res, _next) => {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  });
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  url = `http://127.0.0.1:${server.address().port}`;
  async function login(id) {
    const response = await fetch(url + '/qa/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id })
    });
    cookies.set(id, response.headers.get('set-cookie').split(';')[0]);
  }
  for (const id of [1, 2, 3, 4, 5, 6, 7]) await login(id);
  expect((await call(0, '/scope')).status, 401, 'anonymous denied');
  expect((await call(2, '/role-assignments')).status, 403, 'reporter cannot search administrative accounts');
  const directoryAccounts = (await ok(1, '/role-assignments')).accounts;
  expect(directoryAccounts.find(item => Number(item.id) === 2).full_name, 'Nguyễn Văn An kiểm thử',
    'account suggestions include the full name for authorized administrators');
  expect(directoryAccounts.find(item => Number(item.id) === 2).unit_name, 'Xã thử A',
    'account suggestions include the current unit name');
  expect((await call(2, '/scope', undefined, 'GET', { origin: 'https://foreign.invalid' })).status, 403,
    'cross-origin request denied');
  expect((await ok(1, '/scope')).unitId, null, 'admin never impersonates a unit');
  expect((await call(1, '/cases', { summary: 'invalid' })).status, 422, 'admin must choose a unit before creating data');
  expect((await call(2, '/cases')).status, 200, 'reporter can list own unit without client unit_id');
  expect((await call(2, '/cases?unit_id=11')).status, 404, 'reporter cross-unit list IDOR denied');
  expect((await call(6, '/cases?unit_id=11')).status, 404, 'scoped compiler cross-unit list IDOR denied');
  const definition = (await ok(1, '/configuration/metrics', { code: 'GENERAL', label: 'Chỉ tiêu giả',
    owner_groups: ['XA_PHUONG'], fields: [{ code: 'activities', label: 'Số lượt giả' }],
    effective_from: '2026-01-01' })).definition;
  await ok(1, `/configuration/metrics/${definition.id}/publish`, {});
  await ok(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER', unit_id: 10, metric_code: 'GENERAL' }, 'PUT');
  const investigationFields = ['new_prosecutions_cases', 'new_prosecutions_accused', 'suspended_cases',
    'suspended_accused', 'discontinued_cases', 'discontinued_accused',
    'investigation_concluded_cases', 'investigation_concluded_accused'];
  const investigation = (await ok(1, '/configuration/metrics', { code: 'INVESTIGATION', label: 'Điều tra án giả',
    owner_groups: ['PHONG'], fields: investigationFields.map(code => ({ code, label: code })),
    effective_from: '2026-01-01' })).definition;
  await ok(1, `/configuration/metrics/${investigation.id}/publish`, {});
  await ok(1, '/user-roles', { user_id: 7, role_code: 'UNIT_REPORTER', unit_id: 13, metric_code: 'INVESTIGATION' }, 'PUT');
  const body = { report_day: '2026-10-28', business_code: 'PPHS', category_code: 'TEST',
    summary: 'DỮ LIỆU GIẢ - Nội dung kiểm thử', location_general: 'Địa điểm giả',
    person_count: 1, persons: testPersons() };
  await runBundledLegalChecks({ ok, call, expect, database, body });
  const item = (await ok(2, '/cases', body)).case;
  expect(item.current_state, 'DRAFT', 'intake succeeds at 09:59:59.999');
  expect((await call(3, `/cases/${item.id}`)).status, 404, 'case detail IDOR denied');
  expect((await call(2, '/work-results', { metric_code: 'DETENTION', values: { received: 1 } })).status,
    403, 'commune cannot enter detention');
  now = new Date('2026-10-28T03:00:00.000Z');
  expect((await call(2, '/cases', body)).status, 423, 'intake blocked exactly at 10:00');
  const unlock = await ok(2, '/unlock-requests', {
    report_day: body.report_day, scope: { kind: 'CASE', id: item.id }, reason: 'Bổ sung kiểm thử'
  });
  now = new Date('2026-10-28T03:13:00Z');
  const grant = (await ok(4, `/unlock-requests/${unlock.id}/decide`, { decision: 'APPROVED' })).request;
  expect(grant.expires_at, '2026-10-28T03:43:00.000Z', 'grant expires 30 minutes after approval');
  await ok(2, `/cases/${item.id}/submit`, {});
  expect((await call(4, `/cases/${item.id}/return`, { reason: '' })).status, 422, 'return requires reason');
  await ok(4, `/cases/${item.id}/return`, { reason: 'Bổ sung vị trí thử' });
  expect((await ok(2, '/notifications')).notifications.some(event => event.event_type === 'CASE_RETURNED'),
    true, 'return notification arrives at source unit');
  const returned = (await ok(2, `/cases/${item.id}`)).case;
  await ok(2, `/cases/${item.id}`, { version: returned.version, summary: 'Nội dung đã sửa giả' }, 'PATCH');
  await ok(2, `/cases/${item.id}/submit`, { response: 'Đã bổ sung theo yêu cầu' });
  const competing = await Promise.all([
    call(4, `/cases/${item.id}/verify`, {}), call(4, `/cases/${item.id}/verify`, {})
  ]);
  expect(competing.map(result => result.status).sort(), [200, 409], 'concurrent verification has one winner');
  const history = await ok(2, `/cases/${item.id}`);
  expect(history.submissions.length, 2, 'resubmission preserves both snapshots');
  expect(history.submissions[0].snapshot.summary, 'Nội dung đã sửa giả', 'reviewer can inspect submitted snapshot');
  expect(history.returns[0].response, 'Đã bổ sung theo yêu cầu', 'response linked to original return');
  now = new Date('2026-10-28T03:43:00Z');
  expect((await call(2, `/cases/${item.id}/events`, { narrative: 'late' })).status, 423, 'grant blocked at exact expiry');
  now = new Date('2026-10-28T02:30:00Z');
  const ids = [item.id];
  for (let number = 1; number < 10; number += 1) {
    const record = (await ok(2, '/cases', { ...body, summary: `Ý giả số ${number}` })).case;
    ids.push(record.id);
    await ok(2, `/cases/${record.id}/submit`, {});
    await ok(4, `/cases/${record.id}/verify`, {});
  }
  const metric = (await ok(2, '/work-results', { metric_code: 'GENERAL', values: { activities: 2 } })).metric;
  await ok(2, `/work-results/${metric.id}/submit`, {});
  await ok(4, `/work-results/${metric.id}/verify`, {});
  const situation = (await ok(2, '/situations', {
    category_codes: ['DINH_CONG', 'BIEU_TINH'], narrative: 'Tình hình giả'
  })).situation;
  await ok(2, `/situations/${situation.id}/submit`, {});
  await ok(4, `/situations/${situation.id}/verify`, {});
  expect((await ok(2, '/situations')).situations[0].state, 'VERIFIED', 'situation draft-submit-verify via HTTP');
  expect((await ok(2, '/work-results')).metrics[0].state, 'VERIFIED', 'metric draft-submit-verify via HTTP');
  const returnedSituation = (await ok(2, '/situations', {
    category_codes: ['DINH_CONG'], narrative: 'Nguồn thử trả lại'
  })).situation;
  await ok(2, `/situations/${returnedSituation.id}/submit`, {});
  await ok(4, `/situations/${returnedSituation.id}/return`, { reason: 'Cần cập nhật' });
  const editable = (await ok(2, '/situations')).situations.find(value => value.id === returnedSituation.id);
  await ok(2, `/situations/${editable.id}`, { version: editable.version, narrative: 'Đã cập nhật' }, 'PATCH');
  await ok(2, `/situations/${editable.id}/submit`, {});
  await ok(4, `/situations/${editable.id}/verify`, {});
  expect((await ok(2, `/situations/${editable.id}/history`)).history.filter(entry => ['SOURCE_RETURNED', 'SOURCE_EDITED'].includes(entry.action)).length, 2, 'source return/edit history retained');
  const rule = (await ok(4, '/statistics/rules', { title: 'Quy tắc giả đã duyệt',
    criteria: 'Tiêu chí thử, không có giá trị nghiệp vụ', effective_from: '2026-01-01' })).rule;
  await ok(4, `/cases/${item.id}/counting`, {
    rule_id: rule.id, reason: 'Đủ tiêu chí giả', report_day: '2026-10-28'
  });
  expect((await call(4, `/cases/${item.id}/counting`, {
    rule_id: rule.id, reason: 'Ghi lại', report_day: '2026-10-28'
  })).status, 409, 'case can only enter first-count registry once');
  expect((await ok(4, '/statistics?report_day=2026-10-28')).statistics.pphs_first_count, 1,
    'statistics counts distinct case, not submissions');
  now = new Date('2026-10-27T02:00:00Z');
  const previous = (await ok(2, '/cases', { ...body, report_day: '2026-10-27' })).case;
  await ok(2, `/cases/${previous.id}/submit`, {});
  await ok(4, `/cases/${previous.id}/verify`, {});
  now = new Date('2026-10-28T02:30:00Z');
  const duplicate = (await ok(2, '/cases', body)).case;
  await ok(2, `/cases/${duplicate.id}/submit`, {});
  await ok(4, `/cases/${duplicate.id}/verify`, {});
  const suggestions = await ok(4, `/duplicates/candidates?case_id=${duplicate.id}`);
  expect(suggestions.candidates.some(candidate => candidate.id === previous.id && candidate.reasons.length > 0),
    true, 'duplicate detection returns evidence from a previous day');
  await ok(4, '/duplicates/decisions', { case_id: duplicate.id, candidate_case_id: previous.id,
    action: 'DUPLICATE_NO_RECOUNT', reason: 'Dữ liệu giả báo lặp' });
  const duplicateEvents = (await ok(2, `/cases/${duplicate.id}`)).events;
  expect((await ok(4, '/composer/items?report_day=2026-10-28')).items
    .some(source => duplicateEvents.some(event => event.id === source.source_id)), false,
  'duplicate is retained in registry but excluded from composer');
  const b = (await ok(3, '/cases', { ...body, summary: 'Ý riêng đơn vị B' })).case;
  await ok(3, `/cases/${b.id}/submit`, {});
  await ok(4, `/cases/${b.id}/verify`, {});
  const scoped = await ok(6, '/composer/items?report_day=2026-10-28');
  expect(scoped.items.some(source => Number(source.unit_id) === 11), false, 'scoped composer hides B');
  const sourceItems = (await ok(4, '/composer/items?report_day=2026-10-28&unit_id=10')).items;
  expect(sourceItems.find(source => source.source_type === 'SITUATION').section_code, 'TINH_HINH_KHAC',
    'petition situation defaults to separate 1.2 section');
  expect(sourceItems.find(source => source.source_type === 'WORK_RESULT').section_code, 'CAC_MAT_CONG_TAC_KHAC',
    'general work defaults to separate 1.3.2 section');
  expect(sourceItems.every(source => Number(source.unit_id) === 10), true, 'global compiler unit filter works');
  const pvLeader = (await ok(1, '/leaders', { full_name: 'Người ký giả PV01', title: 'Phó Trưởng phòng',
    rank_name: 'Cấp bậc giả', signer_scope: 'PV01', effective_from: '2026-01-01' })).leader;
  await ok(1, `/leaders/${pvLeader.id}`, { full_name: pvLeader.full_name, title: 'Phó Trưởng phòng thử',
    rank_name: pvLeader.rank_name, signer_scope: 'PV01', effective_from: '2026-01-01' }, 'PUT');
  expect((await ok(4, '/leaders')).leaders.find(value => value.id === pvLeader.id).title,
    'Phó Trưởng phòng thử', 'leader update is visible through API');
  const catpLeader = (await ok(1, '/leaders', { full_name: 'Người ký giả CATP', title: 'Phó Giám đốc',
    signer_scope: 'CATP', effective_from: '2026-01-01' })).leader;
  for (const reportType of ['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB']) {
    let draft = (await ok(4, '/drafts', { report_day: '2026-10-28', report_type: reportType })).draft;
    const selected = sourceItems.filter(source => source.source_type === 'CASE_EVENT').slice(-3)
      .map((source, index) => ({ ...source, included: true, edited_text: `SELECTED_ONLY_${index}`,
        section_code: 'NOI_DUNG', sort_index: index }));
    draft = (await ok(4, `/drafts/${draft.id}/items`, { revision: draft.revision, items: selected }, 'PUT')).draft;
    expect((await call(6, `/drafts/${draft.id}`)).status, 404, `${reportType}: draft ownership enforced`);
    expect((await call(4, `/drafts/${draft.id}/items`, { revision: 1, items: selected }, 'PUT')).status, 409,
      `${reportType}: stale draft revision rejected`);
    const exported = (await ok(4, `/drafts/${draft.id}/exports`, { expected_revision: draft.revision,
      report_type: reportType, leader_id: reportType === 'BCN_PV01' ? pvLeader.id : catpLeader.id })).export;
    const download = await ok(4, `/exports/${exported.id}/download`);
    const xml = await (await JSZip.loadAsync(download)).file('word/document.xml').async('string');
    expect((xml.match(/SELECTED_ONLY_/g) || []).length, 3, `${reportType}: Word contains exactly 3 selected ideas`);
    expect(exported.selection_snapshot.length, 3, `${reportType}: immutable snapshot has 3 sources`);
    expect((await call(2, `/exports/${exported.id}/download`)).status, 403, `${reportType}: reporter cannot download`);
    expect((await call(6, `/exports/${exported.id}/download`)).status >= 400, true, `${reportType}: other compiler cannot download`);
    await writeFile(`outputs/daily-reports-qa/${reportType}.docx`, download);
    if (process.env.DAILY_REPORT_DOCX_RENDERER) {
      const pdf = await ok(4, `/exports/${exported.id}/preview`);
      expect(pdf.subarray(0, 4).toString(), '%PDF', `${reportType}: same-DOCX preview renders PDF`);
      await writeFile(`outputs/daily-reports-qa/${reportType}.pdf`, pdf);
    }
  }
  const originals = await database.query(`select count(*)::int as count from daily_report_case_events
    where narrative like 'SELECTED_ONLY_%'`);
  expect(originals.rows[0].count, 0, 'composer editing never changes original narrative');
  const legal = (await ok(1, '/legal/import-drafts', { title: 'Danh mục giả', document_number: 'QA-1',
    source_uri: 'https://example.invalid/qa', checksum: 'fake-source-checksum', effective_from: '2026-10-28',
    articles: [{ article_code: 'QA1', title: 'Mục giả không có giá trị pháp luật', business_codes: ['PPHS'] }] })).version;
  expect((await call(5, `/legal/versions/${legal.id}/publish`, { effective_from: '2026-10-28' })).status,
    409, 'unreviewed legal version cannot be published');
  await ok(5, `/legal/versions/${legal.id}/review`, {});
  await ok(5, `/legal/versions/${legal.id}/publish`, { effective_from: '2026-10-28' });
  expect((await ok(4, `/legal/articles?version_id=${legal.id}`)).articles.length, 1, 'legal articles persisted');
  await ok(5, `/legal/versions/${legal.id}/rollback`, { reason: 'Hết đợt kiểm thử' });
  expect((await ok(5, `/legal/articles?version_id=${legal.id}`)).articles.length, 1, 'legal retirement preserves articles');
  await ok(1, `/leaders/${pvLeader.id}/archive`, {});
  const snapshot = await database.query(`select signer_snapshot from daily_report_exports where report_type='BCN_PV01'`);
  expect(snapshot.rows[0].signer_snapshot.full_name, 'Người ký giả PV01', 'archive never changes signer snapshot');
  const savedDraft = (await ok(4, '/drafts')).drafts.find(value => value.report_type === 'BCN_PV01');
  expect((await call(4, `/drafts/${savedDraft.id}/exports`, {
    expected_revision: savedDraft.revision, report_type: savedDraft.report_type, leader_id: pvLeader.id
  })).status, 422, 'archived signer cannot be used for a new export');
  await ok(1, `/leaders/${pvLeader.id}/restore`, {});
  expect((await ok(4, '/leaders')).leaders.some(value => value.id === pvLeader.id), true,
    'restored leader is selectable again');
  await runExtendedChecks({ ok, call, expect, database, body, savedDraft, pvLeader,
    setNow: value => { now = new Date(value); } });
  await runPaginationChecks({ database, ok, expect });
  await runV8Checks({ ok, call, expect, database, body, pvLeader });
  await runNotificationChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await runRolePolicyChecks({ ok, call, expect, database, body, login, setNow: value => { now = new Date(value); } });
  await runAuditPaginationChecks({ database, ok, call, expect });
  await runLegalEntryChecks({ ok, call, expect, body, setNow: value => { now = new Date(value); } });
  await runAttachmentChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await runPersonsChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await runCaseTitleChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await runMergedBusinessChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await runLeaderDeleteChecks({ ok, call, expect, database, pvLeader, savedDraft });
  await runLocationChecks({ ok, call, expect, body, setNow: value => { now = new Date(value); } });
  await runClassificationChecks({ ok, call, expect, database, body, setNow: value => { now = new Date(value); } });
  await writeFile('outputs/daily-reports-qa/integration-results.json', JSON.stringify({ schema, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, url, schema, status: 'PASS' }));
  if (process.argv.includes('--browser')) {
    const browser = spawn(process.execPath, ['tests/daily-reports-browser.mjs'], {
      env: { ...process.env, BCN_QA_URL: url }, stdio: 'inherit'
    });
    const [code] = await once(browser, 'exit');
    assert.equal(code, 0, 'browser integration process must exit successfully');
  }
  if (process.argv.includes('--serve')) {
    console.log('QA server kept alive; only fake data in isolated schema.');
    await new Promise(resolve => process.once('SIGTERM', resolve));
  }
} catch (error) {
  console.error(error);
  await mkdir('outputs/daily-reports-qa', { recursive: true });
  await writeFile('outputs/daily-reports-qa/integration-results.json',
    JSON.stringify({ checks, failure: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  dailyModule?.stop();
  auth?.close();
  if (database) await database.end();
  await pool.query(`drop schema if exists ${schema} cascade`);
  await pool.end();
  await rm(directory, { recursive: true, force: true });
}
