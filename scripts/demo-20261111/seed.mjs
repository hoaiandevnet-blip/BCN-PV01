import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { createLocalReportRequest } from '../lib/local-report-request.mjs';
import { buildPlan, day } from './plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-reports-20261111');
const local = createLocalReportRequest(pool, path.join(root, '.private/report-files'));
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2));

try {
  await mkdir(output, { recursive: true });
  let plan;
  try {
    plan = JSON.parse(await readFile(path.join(output, 'plan.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = await buildPlan();
    await save('plan.json', plan);
  }
  assert.equal(plan.report_day, day);
  assert.equal(plan.cases.length, 20);
  assert.equal(plan.work.length, 5);
  const compiler = await local.request(plan.compiler, '/scope');
  assert.equal(compiler.reportDay, day);
  assert.ok(compiler.compilerModules.includes('composer'));
  for (const record of plan.work) {
    const scope = await local.request(record.username, '/scope');
    assert.equal(String(scope.unitId), record.payload.unit_id);
    assert.equal(scope.reportDay, day);
    assert.equal(scope.beforeCutoff, true, 'Submit only in the real reporting window');
    assert.ok(scope.roles.includes('UNIT_REPORTER'));
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, day, cases: 20, work_results: 5,
      units: plan.work.map(record => record.unit), state: 'PENDING_REVIEW' }, null, 2));
  } else {
    const backups = path.join(root, '.private/backups');
    await mkdir(backups, { recursive: true, mode: 0o700 });
    try {
      await readFile(path.join(output, 'backup.json'), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const backup = path.join(backups, `before-demo-20261111-${Date.now()}.dump`);
      execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump',
        ['--dbname', pool.options.connectionString, '-Fc', '-f', backup]);
      await save('backup.json', { at: new Date().toISOString(), backup });
    }
    const caseIds = plan.cases.map(record => record.payload.id);
    const workIds = plan.work.map(record => record.payload.id);
    const snapshot = async () => ({
      cases: (await pool.query(`select to_jsonb(c) as value from daily_report_cases c
        where not (id=any($1::uuid[])) order by id`, [caseIds])).rows,
      work: (await pool.query(`select to_jsonb(m) as value from daily_report_metrics m
        where not (id=any($1::uuid[])) order by id`, [workIds])).rows
    });
    const initial = await snapshot();
    const results = { cases: [], work: [] };
    for (const record of plan.cases) {
      const { payload, username } = record;
      let stored = (await pool.query('select current_state from daily_report_cases where id=$1',
        [payload.id])).rows[0];
      if (!stored) {
        stored = (await local.request(username, '/reference-cases', { method: 'POST', body: payload })).case;
      }
      if (stored.current_state === 'DRAFT') {
        await local.request(username, `/cases/${payload.id}/submit`, { method: 'POST', body: {} });
      }
      const detail = await local.request(username, `/cases/${payload.id}`);
      assert.equal(detail.case.current_state, 'PENDING_REVIEW');
      assert.ok(detail.case.summary.includes('BÁO CÁO THỬ'));
      assert.ok(detail.submissions.length >= 1);
      results.cases.push({ id: payload.id, unit: record.unit, label: record.label });
      await save('results.json', results);
      console.log('SUBMITTED', record.label, record.unit);
    }
    for (const record of plan.work) {
      const response = await local.request(record.username, '/daily-intake', {
        method: 'POST', body: record.payload
      });
      assert.equal(response.state, 'PENDING_REVIEW');
      results.work.push({ id: response.id, unit: record.unit });
      await save('results.json', results);
      console.log('WORK RESULT', record.unit);
    }
    assert.deepEqual(await snapshot(), initial, 'All existing cases and work reports remain unchanged');
    const feed = await local.request(plan.compiler, `/composer/items?report_day=${day}&include_pending=true`);
    const events = (await pool.query('select id from daily_report_case_events where case_id=any($1::uuid[])',
      [caseIds])).rows;
    const sourceIds = new Set([...events.map(item => item.id), ...workIds]);
    const incoming = feed.items.filter(item => sourceIds.has(item.source_id));
    assert.equal(new Set(incoming.map(item => item.source_id)).size, 25);
    assert.ok(incoming.every(item => item.current_state === 'PENDING_REVIEW'));
    assert.ok(incoming.every(item => item.source_text.includes('BÁO CÁO THỬ')));
    const notifications = await local.request(plan.compiler, '/notifications');
    const resourceIds = new Set([...caseIds, ...workIds]);
    const notices = notifications.notifications.filter(item => resourceIds.has(item.resource_id));
    assert.equal(new Set(notices.map(item => item.resource_id)).size, 25);
    const dashboard = await local.request(plan.compiler, `/dashboard?day=${day}&span=1`);
    for (const record of plan.work) {
      const unit = dashboard.units.find(item => item.id === record.payload.unit_id);
      assert.equal(unit.status, 'complete');
      assert.ok(unit.counts.cases >= 4 && unit.counts.work >= 1);
    }
    await save('compiler-feed.json', feed);
    await save('dashboard.json', dashboard);
    const verification = { status: 'PASS', at: new Date().toISOString(), report_day: day,
      new_cases: 20, new_work_results: 5, units: plan.work.map(record => record.unit),
      business_domains: new Set(plan.cases.map(record => record.payload.business_code)).size,
      state: 'PENDING_REVIEW', compiler: plan.compiler, incoming_notifications: notices.length,
      existing_data_unchanged: true, today_total_cases: dashboard.cases.current,
      submitted_units: dashboard.progress.submitted, missing_units: dashboard.progress.missing };
    await save('verification.json', verification);
    console.log(JSON.stringify(verification, null, 2));
  }
} finally {
  local.close();
  await pool.end();
}
