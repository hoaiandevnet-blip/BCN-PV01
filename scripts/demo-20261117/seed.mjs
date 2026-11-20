import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { createLocalReportRequest } from '../lib/local-report-request.mjs';
import { buildPlan, day, marker } from './plan.mjs';
import { verifyCreatedReports } from './verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-reports-20261117');
const local = createLocalReportRequest(pool, path.join(root, '.private/report-files'));
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2));

async function readSaved(name) {
  try {
    return JSON.parse(await readFile(path.join(output, name), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function snapshot(plan) {
  const cases = await pool.query(`select to_jsonb(c) as value from daily_report_cases c
    where not (id=any($1::uuid[])) order by id`, [plan.cases.map(item => item.payload.id)]);
  const work = await pool.query(`select to_jsonb(m) as value from daily_report_metrics m
    where not (id=any($1::uuid[])) order by id`, [plan.work.map(item => item.payload.id)]);
  const digest = result => ({ count: result.rowCount,
    sha256: createHash('sha256').update(JSON.stringify(result.rows)).digest('hex') });
  return { cases: digest(cases), work: digest(work) };
}

async function openWindow(record, plan, unlocks) {
  const scope = await local.request(record.username, '/scope');
  if (scope.beforeCutoff) return;
  const key = String(record.payload.unit_id);
  let request = unlocks.find(item => item.unit_id === key);
  if (request) {
    const existing = await local.request(record.username, '/unlock-requests');
    const stored = existing.requests.find(item => item.id === request.id);
    if (stored?.status === 'APPROVED') return;
    assert.equal(stored?.status, 'REQUESTED', 'The recorded window expired or was rejected; do not silently reopen');
  } else {
    const created = await local.request(record.username, '/unlock-requests', { method: 'POST', body: {
      report_day: day, scope: { kind: 'CASE', id: '*' },
      reason: `${marker} Nhập 4 vụ việc và 1 báo cáo công tác thử ngày 17/11/2026 theo yêu cầu người dùng.`
    } });
    request = { id: created.id, unit_id: key, unit: record.unit };
    unlocks.push(request);
    await save('unlocks.json', unlocks);
  }
  const decided = await local.request(plan.compiler, `/unlock-requests/${request.id}/decide`, {
    method: 'POST', body: { decision: 'APPROVED',
      reason: `${marker} Mở cửa sổ 30 phút để nhập bộ báo cáo thử ngày 17/11/2026 được yêu cầu.` }
  });
  assert.equal(decided.request.status, 'APPROVED');
  assert.equal(new Date(decided.request.expires_at) - new Date(decided.request.approved_at), 30 * 60 * 1000);
  Object.assign(request, decided.request);
  await save('unlocks.json', unlocks);
}

try {
  await mkdir(output, { recursive: true });
  let plan = await readSaved('plan.json');
  if (!plan) {
    const existing = await pool.query('select count(*)::int as count from daily_report_cases where summary like $1',
      ['%THU-NGAY-20261117-%']);
    assert.equal(existing.rows[0].count, 0, 'Dataset already exists; recover its saved plan before continuing');
    plan = await buildPlan();
    await save('plan.json', plan);
  }
  assert.equal(plan.report_day, day);
  assert.equal(plan.cases.length, 20);
  assert.equal(plan.work.length, 5);
  assert.equal(new Set([...plan.cases, ...plan.work].map(item => item.payload.id)).size, 25);
  const compiler = await local.request(plan.compiler, '/scope');
  assert.equal(compiler.reportDay, day);
  assert.ok(compiler.compilerModules.includes('composer'));
  assert.ok(compiler.compilerModules.includes('unlock'));
  const scopes = [];
  for (const record of plan.work) {
    const scope = await local.request(record.username, '/scope');
    assert.equal(String(scope.unitId), record.payload.unit_id);
    assert.equal(scope.reportDay, day);
    assert.ok(scope.roles.includes('UNIT_REPORTER'));
    assert.equal(plan.cases.filter(item => item.username === record.username).length, 4);
    scopes.push({ unit: record.unit, unit_id: scope.unitId, beforeCutoff: scope.beforeCutoff });
  }
  const today = await local.request(plan.compiler, `/dashboard?day=${day}&span=1`);
  await save('preflight.json', { at: new Date().toISOString(), report_day: day,
    cases: 20, work_results: 5, scopes, existing_today_cases: today.cases.current });
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, day, cases: 20, work_results: 5,
      units: scopes, existing_today_cases: today.cases.current, state: 'PENDING_REVIEW' }, null, 2));
  } else {
    if (!await readSaved('backup.json')) {
      const directory = path.join(root, '.private/backups/demo-20261117');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const backup = path.join(directory, `before-demo-${Date.now()}.dump`);
      execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump',
        ['--dbname', pool.options.connectionString, '-Fc', '-f', backup]);
      await save('backup.json', { at: new Date().toISOString(), backup });
    }
    const initial = await readSaved('before.json') || await snapshot(plan);
    await save('before.json', initial);
    const unlocks = await readSaved('unlocks.json') || [];
    const results = { cases: [], work: [] };
    for (const record of plan.work) {
      const caseRecords = plan.cases.filter(item => item.username === record.username);
      const stored = await pool.query(`select id,current_state from daily_report_cases
        where id=any($1::uuid[])`, [caseRecords.map(item => item.payload.id)]);
      const storedWork = await pool.query('select id from daily_report_metrics where id=$1', [record.payload.id]);
      if (stored.rowCount !== 4 || stored.rows.some(item => item.current_state === 'DRAFT') || !storedWork.rowCount) {
        await openWindow(record, plan, unlocks);
      }
      for (const item of caseRecords) {
        let current = stored.rows.find(row => row.id === item.payload.id);
        if (!current) {
          current = (await local.request(item.username, '/reference-cases', {
            method: 'POST', body: item.payload
          })).case;
        }
        if (current.current_state === 'DRAFT') {
          await local.request(item.username, `/cases/${item.payload.id}/submit`, { method: 'POST', body: {} });
        }
        results.cases.push({ id: item.payload.id, unit: item.unit, label: item.label });
        await save('results.json', results);
        console.log('SUBMITTED', item.label, item.unit);
      }
      const response = await local.request(record.username, '/daily-intake', {
        method: 'POST', body: record.payload
      });
      assert.equal(response.state, 'PENDING_REVIEW');
      results.work.push({ id: response.id, unit: record.unit });
      await save('results.json', results);
      console.log('WORK RESULT', record.unit);
    }
    assert.deepEqual(await snapshot(plan), initial, 'Existing cases and work reports must remain unchanged');
    const verification = await verifyCreatedReports({ local, pool, plan, save });
    verification.existing_data_unchanged = true;
    verification.unlocks_created = unlocks.length;
    await save('verification.json', verification);
    console.log(JSON.stringify(verification, null, 2));
  }
} finally {
  local.close();
  await pool.end();
}
