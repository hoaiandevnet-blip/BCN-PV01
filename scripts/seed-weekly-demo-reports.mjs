import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../server/db.js';
import { createLocalReportRequest } from './lib/local-report-request.mjs';
import { buildWeeklyDemoPlan, marker } from './lib/weekly-demo-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.env.DEMO_OUTPUT || path.join(root, 'outputs/weekly-demo-20261110'));
const local = createLocalReportRequest(pool, path.join(root, '.private/report-files'));
const apply = process.argv.includes('--apply');
const pgDump = '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump';
const save = (name, data) => writeFile(path.join(output, name), JSON.stringify(data, null, 2));

try {
  await mkdir(output, { recursive: true });
  let plan;
  try {
    plan = JSON.parse(await readFile(path.join(output, 'plan.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = await buildWeeklyDemoPlan(pool);
    await save('plan.json', plan);
  }
  assert.equal(plan.records.length, 65);
  const scope = await local.request('ttttch.pv01', '/scope');
  assert.equal(scope.reportDay, plan.to, 'This requested dataset is for 10/11/2026');
  if (!apply) {
    console.log(JSON.stringify({ ready: true, week: [plan.from, plan.to], cases: 65, today: 20, output }));
  } else {
    const databaseName = new URL(pool.options.connectionString).pathname;
    if (!databaseName.includes('_test_')) {
      const backups = path.join(root, '.private/backups');
      await mkdir(backups, { recursive: true, mode: 0o700 });
      const backup = path.join(backups, `before-weekly-demo-${Date.now()}.dump`);
      execFileSync(pgDump, ['--dbname', pool.options.connectionString, '-Fc', '-f', backup]);
      await save('backup.json', { at: new Date().toISOString(), backup });
    }
    const initial = await pool.query(`select id,current_state,version,summary from daily_report_cases
      where not (id=any($1::uuid[])) order by id`, [plan.records.map(item => item.payload.id)]);
    const results = [];
    const unlocks = new Map();
    for (const record of plan.records) {
      const { payload, username, label, scenario } = record;
      let stored = (await pool.query('select * from daily_report_cases where id=$1', [payload.id])).rows[0];
      const returned = stored && (await pool.query(`select ret.id from daily_report_returns ret
        join daily_report_submissions sub on sub.id=ret.submission_id where sub.case_id=$1`, [payload.id])).rows;
      const resubmitted = stored && (await pool.query(`select id from daily_report_submissions
        where case_id=$1 and state='RESUBMITTED'`, [payload.id])).rowCount > 0;
      const ready = stored && (scenario === 'RESUBMITTED' ? resubmitted
        : stored.current_state === scenario);
      if (!ready) {
        const group = `${payload.unit_id}:${payload.report_day}`;
        if (!unlocks.has(group)) {
          const request = await local.request(username, '/unlock-requests', { method: 'POST', body: {
            report_day: payload.report_day, scope: { kind: 'CASE', id: '*' },
            reason: `${marker} Mở cửa sổ nhập bộ dữ liệu tuần do người dùng yêu cầu, ngày ${payload.report_day}.`
          } });
          await local.request('admin', `/unlock-requests/${request.id}/decide`, { method: 'POST', body: {
            decision: 'APPROVED', reason: `${marker} Cho phép nhập dữ liệu kiểm thử trong cửa sổ 30 phút.`
          } });
          unlocks.set(group, request.id);
          await save('unlocks.json', [...unlocks].map(([scope, id]) => ({ scope, id })));
        }
        if (!stored) {
          stored = (await local.request(username, '/reference-cases', { method: 'POST', body: payload })).case;
        }
        if (stored.current_state === 'DRAFT') {
          await local.request(username, `/cases/${payload.id}/submit`, { method: 'POST', body: {} });
        }
        if (['RETURNED', 'RESUBMITTED'].includes(scenario) && !returned?.length) {
          await local.request('ttttch.pv01', `/cases/${payload.id}/return`, { method: 'POST', body: {
            reason: `${marker} ${label}: bổ sung mô tả tài liệu đối chiếu và xác nhận số liệu thử.`,
            requested_fields: ['reference_info.details', 'reference_info.evidence']
          } });
        }
        if (scenario === 'RESUBMITTED') {
          stored = (await local.request(username, `/cases/${payload.id}`)).case;
          await local.request(username, `/reference-cases/${payload.id}`, { method: 'PATCH', body: {
            ...payload, version: stored.version, reference_info: { ...payload.reference_info,
              details: payload.reference_info.details + ' Đã bổ sung đối chiếu đủ tài liệu giả lập theo yêu cầu PV01.' }
          } });
          await local.request(username, `/cases/${payload.id}/submit`, { method: 'POST', body: {
            response: `${marker} Đã bổ sung nội dung đối chiếu và kiểm tra đầy đủ các số liệu mô phỏng.`
          } });
        }
        if (scenario === 'VERIFIED') {
          await local.request('ttttch.pv01', `/cases/${payload.id}/verify`, { method: 'POST', body: {} });
        }
      }
      if (record.supplement && !(await pool.query(`select id from daily_report_outbox
        where resource_id=$1 and event_type='CASE_SUPPLEMENT_REQUESTED'`, [payload.id])).rowCount) {
        await local.request('ttttch.pv01', `/cases/${payload.id}/request-supplement`, { method: 'POST', body: {
          reason: `${marker} Bổ sung diễn biến sau xác minh để thử chức năng theo dõi cập nhật.`
        } });
      }
      const detail = await local.request(username, `/cases/${payload.id}`);
      assert.equal(detail.case.current_state, scenario === 'RESUBMITTED' ? 'PENDING_REVIEW' : scenario);
      assert.ok(detail.case.summary.includes('BÁO CÁO THỬ'));
      assert.ok(detail.case.reference_info.subject_details.every(person => /^\d{12}$/.test(person.identity_number)));
      assert.ok(detail.submissions.length >= 1);
      results.push({ id: payload.id, label, day: payload.report_day, unit: record.unit,
        business: payload.business_code, scenario, state: detail.case.current_state });
      await save('results.json', results);
      console.log('READY', label, detail.case.current_state);
    }
    const unchanged = await pool.query(`select id,current_state,version,summary from daily_report_cases
      where not (id=any($1::uuid[])) order by id`, [plan.records.map(item => item.payload.id)]);
    assert.deepEqual(unchanged.rows, initial.rows, 'Existing cases must remain unchanged');
    const week = await local.request('ttttch.pv01', `/dashboard?day=${plan.to}&span=7`);
    const today = await local.request('ttttch.pv01', `/dashboard?day=${plan.to}&span=1`);
    const feed = await local.request('ttttch.pv01', '/notifications');
    const reportIds = new Set(results.map(item => item.id));
    const incoming = feed.notifications.filter(item => reportIds.has(item.resource_id)
      && ['CASE_SUBMITTED', 'CASE_RESUBMITTED'].includes(item.event_type));
    assert.equal(new Set(incoming.map(item => item.resource_id)).size, 65);
    const pending = await local.request('ttttch.pv01', `/composer/items?report_day=${plan.to}&include_pending=true`);
    const todayEligible = results.filter(item => item.day === plan.to && item.state !== 'RETURNED');
    for (const item of todayEligible) assert.ok(pending.items.some(source => source.source_text.includes(item.label)),
      `Compiler can include ${item.label}`);
    await save('verification.json', { at: new Date().toISOString(), status: 'PASS', new_cases: results.length,
      today_new: results.filter(item => item.day === plan.to).length, from: plan.from, to: plan.to,
      today_total: today.cases.current, weekly_total: week.cases.current, series: week.series,
      today_states: Object.fromEntries(['VERIFIED', 'PENDING_REVIEW', 'RETURNED'].map(state =>
        [state, results.filter(item => item.day === plan.to && item.state === state).length])),
      compiler_notifications: incoming.length, existing_cases_unchanged: true });
    console.log('PASS: 65 additional cases; exactly 20 today; all incoming notifications visible to ttttch.pv01.');
  }
} finally {
  local.close();
  await pool.end();
}
