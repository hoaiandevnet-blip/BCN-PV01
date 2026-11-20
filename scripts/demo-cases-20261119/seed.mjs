import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { compiler, marker, targetAccounts } from './scenarios.mjs';
import { buildTodayPlan } from './plan.mjs';
import { createLocalRunner } from './runner.mjs';
import { verifyTodayCases } from './verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputDir = path.join(root, 'outputs/demo-cases-20261119');
const storageRoot = path.join(root, '.private/report-files');
const save = (name, value) => writeFile(path.join(outputDir, name), JSON.stringify(value, null, 2));

async function readSaved(name) {
  try {
    return JSON.parse(await readFile(path.join(outputDir, name), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

const pgDump = '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump';

try {
  await mkdir(outputDir, { recursive: true });

  let plan = await readSaved('plan.json');
  if (!plan) {
    plan = await buildTodayPlan(pool);
    await save('plan.json', plan);
  }

  assert.equal(plan.targetAccounts.length, 7);
  assert.equal(plan.cases.length, 21);

  const preflight = {
    at: new Date().toISOString(),
    report_day: plan.reportDay,
    target_accounts: plan.targetAccounts,
    cases_to_create: plan.cases.length,
    by_unit: plan.cases.reduce((acc, c) => (acc[c.unit_name] = (acc[c.unit_name] || 0) + 1, acc), {}),
    by_state: plan.cases.reduce((acc, c) => (acc[c.scenario] = (acc[c.scenario] || 0) + 1, acc), {}),
    by_domain: plan.cases.reduce((acc, c) => (acc[c.domain] = (acc[c.domain] || 0) + 1, acc), {}),
    marker
  };
  await save('preflight.json', preflight);

  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, ...preflight }, null, 2));
  } else {
    if (!await readSaved('backup.json')) {
      const backupDir = path.join(root, '.private/backups/demo-cases-20261119');
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backupFile = path.join(backupDir, `before-today-cases-${Date.now()}.dump`);
      execFileSync(pgDump, ['--dbname', pool.options.connectionString, '-Fc', '-f', backupFile]);
      await save('backup.json', { at: new Date().toISOString(), backup: backupFile });
    }

    const local = createLocalRunner(pool, storageRoot);
    const results = [];

    try {
      let count = 0;
      for (const record of plan.cases) {
        local.setClockTime(`${record.report_day}T08:15:00+07:00`);

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
          domain: record.payload.business_code,
          title: record.title
        });

        count += 1;
        console.log(`[${count}/${plan.cases.length}] Processed case ${record.label} (${record.unit_name}) -> ${record.scenario}`);
      }

      await save('results.json', results);

      const verification = await verifyTodayCases({ local, pool, plan, save });
      console.log('\n--- VERIFICATION RESULT ---');
      console.log(JSON.stringify(verification, null, 2));
    } finally {
      local.close();
    }
  }
} finally {
  await pool.end();
}
