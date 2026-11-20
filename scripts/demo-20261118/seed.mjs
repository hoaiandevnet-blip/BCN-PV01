import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { createLocalReportRequest } from '../lib/local-report-request.mjs';
import { buildPlan, day } from './plan.mjs';
import { verifyCreatedCases } from './verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-cases-20261118');
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
  const definitions = [
    ['cases', 'daily_report_cases', 'id'],
    ['events', 'daily_report_case_events', 'case_id'],
    ['submissions', 'daily_report_submissions', 'case_id'],
    ['work', 'daily_report_metrics'],
    ['situations', 'daily_report_situations'],
    ['accounts', 'users'],
    ['roles', 'daily_report_user_roles'],
    ['permissions', 'user_permissions'],
    ['units', 'teams']
  ];
  const digest = {};
  for (const [key, table, exclusion] of definitions) {
    const clause = exclusion ? `where not (${exclusion}=any($1::uuid[]))` : '';
    const parameters = exclusion ? [plan.cases.map(item => item.payload.id)] : [];
    const result = await pool.query(`select to_jsonb(item) as value from ${table} item
      ${clause} order by to_jsonb(item)::text`, parameters);
    digest[key] = { count: result.rowCount,
      sha256: createHash('sha256').update(JSON.stringify(result.rows)).digest('hex') };
  }
  return digest;
}

try {
  await mkdir(output, { recursive: true });
  let plan = await readSaved('plan.json');
  if (!plan) {
    const existing = await pool.query(`select count(*)::int as count from daily_report_cases
      where summary like '%THU-NGAY-20261118-%'`);
    assert.equal(existing.rows[0].count, 0, 'Recover the existing plan rather than creating duplicates');
    plan = await buildPlan({ local, pool });
    await save('plan.json', plan);
  }
  assert.equal(plan.report_day, day);
  assert.equal(plan.cases.length, 28);
  assert.equal(new Set(plan.cases.map(item => item.payload.id)).size, 28);
  for (const unit of plan.units) {
    const scope = await local.request(unit.username, '/scope');
    assert.equal(scope.reportDay, day);
    assert.equal(String(scope.unitId), unit.id);
    assert.ok(scope.roles.includes('UNIT_REPORTER'));
    assert.ok(scope.submodules.includes('input'));
    assert.ok(scope.beforeCutoff, 'Regular entry window closed; do not bypass the reporting rule');
  }
  const preflight = { at: new Date().toISOString(), day, cases: plan.cases.length,
    units: plan.units.map(item => item.name), state: 'PENDING_REVIEW', work_reports: 0 };
  await save('preflight.json', preflight);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, ...preflight }, null, 2));
  } else {
    if (!await readSaved('backup.json')) {
      const directory = path.join(root, '.private/backups/demo-20261118');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const backup = path.join(directory, `before-cases-${Date.now()}.dump`);
      execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump',
        ['--dbname', pool.options.connectionString, '-Fc', '-f', backup]);
      await save('backup.json', { at: new Date().toISOString(), backup });
    }
    const initial = await readSaved('before.json') || await snapshot(plan);
    await save('before.json', initial);
    const results = [];
    for (const record of plan.cases) {
      const stored = await pool.query(`select id,current_state,unit_id,report_day::text,summary
        from daily_report_cases where id=$1`, [record.payload.id]);
      let current = stored.rows[0];
      if (current) {
        assert.equal(String(current.unit_id), record.payload.unit_id);
        assert.equal(current.report_day, day);
        assert.equal(current.summary, record.payload.summary);
      } else {
        current = (await local.request(record.username, '/reference-cases', {
          method: 'POST', body: record.payload
        })).case;
      }
      if (current.current_state === 'DRAFT') {
        await local.request(record.username, `/cases/${record.payload.id}/submit`, {
          method: 'POST', body: {}
        });
      } else {
        assert.equal(current.current_state, 'PENDING_REVIEW', 'Do not change an already reviewed case');
      }
      results.push({ id: record.payload.id, unit: record.unit, label: record.label });
      await save('results.json', results);
      console.log('PENDING_REVIEW', record.label, record.unit);
    }
    assert.deepEqual(await snapshot(plan), initial, 'Existing data or access assignments changed');
    const verification = await verifyCreatedCases({ local, pool, plan, save });
    verification.existing_data_unchanged = true;
    await save('verification.json', verification);
    console.log(JSON.stringify(verification, null, 2));
  }
} finally {
  local.close();
  await pool.end();
}
