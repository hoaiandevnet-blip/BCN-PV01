import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { compiler, marker, targetAccounts } from './scenarios.mjs';
import { buildDynamicPlan } from './plan.mjs';
import { verifyDynamicCases } from './verify.mjs';
import { createDynamicLocalRunner } from '../demo-cases-20261020-20261118/local-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-cases-dynamic-20261020-20261118');
const prevOutputDir = path.join(root, 'outputs/demo-cases-20261020-20261118');
const storageRoot = path.join(root, '.private/report-files');
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2));

async function readSaved(dir, name) {
  try {
    return JSON.parse(await readFile(path.join(dir, name), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

const pgDump = '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump';

try {
  await mkdir(output, { recursive: true });

  const prevPlan = await readSaved(prevOutputDir, 'plan.json');
  const prevIds = new Set(prevPlan?.cases?.map(item => item.payload.id) || []);

  let plan = await readSaved(output, 'plan.json');
  if (!plan) {
    plan = await buildDynamicPlan(pool, prevIds);
    await save('plan.json', plan);
  }

  assert.equal(plan.targetAccounts.length, 7);
  assert.ok(plan.cases.length > 0);

  const preflight = {
    at: new Date().toISOString(),
    start_date: plan.startDate,
    end_date: plan.endDate,
    target_accounts: plan.targetAccounts,
    units: plan.units.map(item => item.name),
    cases_to_create: plan.cases.length,
    previous_cases_to_replace: prevIds.size,
    marker: plan.marker
  };
  await save('preflight.json', preflight);

  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, ...preflight }, null, 2));
  } else {
    if (!await readSaved(output, 'backup.json')) {
      const backupDir = path.join(root, '.private/backups/demo-cases-dynamic-20261020-20261118');
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backupFile = path.join(backupDir, `before-dynamic-cases-${Date.now()}.dump`);
      execFileSync(pgDump, ['--dbname', pool.options.connectionString, '-Fc', '-f', backupFile]);
      await save('backup.json', { at: new Date().toISOString(), backup: backupFile });
    }

    if (prevIds.size > 0) {
      const idList = [...prevIds];
      await pool.query('delete from daily_report_submissions where case_id = any($1::uuid[])', [idList]);
      await pool.query('delete from daily_report_case_events where case_id = any($1::uuid[])', [idList]);
      await pool.query('delete from daily_report_outbox where resource_id = any($1::text[])', [idList]);
      await pool.query('delete from daily_report_cases where id = any($1::uuid[])', [idList]);
      console.log(`Cleanly removed ${prevIds.size} earlier uniform test cases`);
    }

    await pool.query(`update daily_report_user_roles r
      set effective_from = '2026-10-20'
      from users u
      where u.id = r.user_id and u.username = any($1::text[]) and r.role_code = 'UNIT_REPORTER'`,
    [targetAccounts]);

    const local = createDynamicLocalRunner(pool, storageRoot);
    const results = [];

    try {
      let count = 0;
      for (const record of plan.cases) {
        local.setClockTime(`${record.report_day}T08:00:00+07:00`);

        const stored = (await pool.query(`select id, current_state from daily_report_cases
          where id = $1`, [record.payload.id])).rows[0];

        let current = stored;
        if (!current) {
          current = (await local.request(record.username, '/reference-cases', {
            method: 'POST',
            body: record.payload
          })).case;
        }

        if (current.current_state === 'DRAFT') {
          await local.request(record.username, `/cases/${record.payload.id}/submit`, {
            method: 'POST',
            body: {}
          });
        }

        const stateCheck = (await pool.query('select current_state from daily_report_cases where id = $1',
          [record.payload.id])).rows[0]?.current_state;

        if (record.scenario === 'VERIFIED' && stateCheck === 'PENDING_REVIEW') {
          await local.request(compiler, `/cases/${record.payload.id}/verify`, {
            method: 'POST',
            body: {}
          });
        } else if (record.scenario === 'RETURNED' && stateCheck === 'PENDING_REVIEW') {
          await local.request(compiler, `/cases/${record.payload.id}/return`, {
            method: 'POST',
            body: {
              reason: record.return_reason || `${marker} Bổ sung tài liệu đối chiếu thử nghiệm.`,
              requested_fields: ['reference_info.details', 'reference_info.evidence']
            }
          });
        }

        results.push({
          id: record.payload.id,
          label: record.label,
          unit: record.unit_name,
          day: record.report_day,
          scenario: record.scenario,
          domain: record.payload.business_code
        });

        count += 1;
        if (count % 50 === 0 || count === plan.cases.length) {
          console.log(`Processed ${count}/${plan.cases.length} cases (Day: ${record.report_day})`);
        }
      }

      await save('results.json', results);

      local.setClockTime('2026-11-18T10:00:00+07:00');
      const verification = await verifyDynamicCases({ local, pool, plan, save });
      console.log(JSON.stringify(verification, null, 2));
    } finally {
      local.close();
    }
  }
} finally {
  await pool.end();
}
