import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { compiler, marker, targetAccounts } from './definitions.mjs';
import { buildPlan } from './plan.mjs';
import { verifyCases } from './verify.mjs';
import { createDynamicLocalRunner } from './local-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-cases-20261020-20261118');
const storageRoot = path.join(root, '.private/report-files');
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2));

async function readSaved(name) {
  try {
    return JSON.parse(await readFile(path.join(output, name), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

const pgDump = '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump';

try {
  await mkdir(output, { recursive: true });
  let plan = await readSaved('plan.json');
  if (!plan) {
    plan = await buildPlan(pool);
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
    marker: plan.marker
  };
  await save('preflight.json', preflight);

  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, ...preflight }, null, 2));
  } else {
    if (!await readSaved('backup.json')) {
      const backupDir = path.join(root, '.private/backups/demo-cases-20261020-20261118');
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backupFile = path.join(backupDir, `before-cases-${Date.now()}.dump`);
      execFileSync(pgDump, ['--dbname', pool.options.connectionString, '-Fc', '-f', backupFile]);
      await save('backup.json', { at: new Date().toISOString(), backup: backupFile });
    }

    const beforeRoles = (await pool.query(`select r.id, u.username, r.role_code, r.unit_id,
      r.effective_from::text, r.effective_to::text
      from daily_report_user_roles r
      join users u on u.id = r.user_id
      where u.username = any($1::text[]) and r.role_code = 'UNIT_REPORTER'
      order by u.username`, [targetAccounts])).rows;
    await save('before-roles.json', beforeRoles);

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

        const stored = await pool.query(`select id, current_state, unit_id, report_day::text, summary
          from daily_report_cases where id = $1`, [record.payload.id]);
        let current = stored.rows[0];

        if (current) {
          assert.equal(String(current.unit_id), record.payload.unit_id);
          assert.equal(current.report_day, record.report_day);
        } else {
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

        if (record.scenario === 'VERIFIED') {
          const checkState = (await pool.query('select current_state from daily_report_cases where id = $1',
            [record.payload.id])).rows[0]?.current_state;
          if (checkState === 'PENDING_REVIEW') {
            await local.request(compiler, `/cases/${record.payload.id}/verify`, {
              method: 'POST',
              body: {}
            });
          }
        }

        results.push({
          id: record.payload.id,
          label: record.label,
          unit: record.unit_name,
          day: record.report_day,
          scenario: record.scenario
        });

        count += 1;
        if (count % 50 === 0 || count === plan.cases.length) {
          console.log(`Processed ${count}/${plan.cases.length} cases (Day: ${record.report_day})`);
        }
      }

      await save('results.json', results);

      local.setClockTime('2026-11-18T10:00:00+07:00');
      const verification = await verifyCases({ local, pool, plan, save });
      console.log(JSON.stringify(verification, null, 2));
    } finally {
      local.close();
    }
  }
} finally {
  await pool.end();
}
