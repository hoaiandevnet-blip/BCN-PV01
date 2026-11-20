import assert from 'node:assert/strict';
import { compiler, targetAccounts } from './definitions.mjs';
import { startDate, endDate } from './plan.mjs';
import { readMapReports } from '../../server/digital-map-reports.js';
import { getDigitalMapWardIndex } from '../../server/digital-map.js';

export async function verifyCases({ local, pool, plan, save }) {
  const ids = plan.cases.map(item => item.payload.id);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }

  const matrixQuery = await pool.query(`select c.report_day::text as day, u.username, count(*)::int as count
    from daily_report_cases c
    join teams t on t.id = c.unit_id
    join users u on u.team_id = t.id and not u.is_deleted
    where c.report_day between $1 and $2 and u.username = any($3::text[])
    group by c.report_day, u.username
    order by c.report_day, u.username`, [startDate, endDate, targetAccounts]);

  const coverageMatrix = {};
  for (const day of dates) {
    coverageMatrix[day] = {};
    for (const username of targetAccounts) {
      coverageMatrix[day][username] = 0;
    }
  }

  for (const row of matrixQuery.rows) {
    if (coverageMatrix[row.day]) {
      coverageMatrix[row.day][row.username] = row.count;
    }
  }

  for (const day of dates) {
    for (const username of targetAccounts) {
      const count = coverageMatrix[day][username];
      assert.ok(count >= 2, `Coverage check failed for ${username} on ${day}: count is ${count}`);
    }
  }

  const casesInDb = await pool.query(`select id, current_state, report_day::text as day,
    summary, reference_info, location_address
    from daily_report_cases where id = any($1::uuid[])`, [ids]);
  assert.equal(casesInDb.rowCount, ids.length, 'All generated cases must exist in database');

  for (const row of casesInDb.rows) {
    assert.ok(row.summary.includes(plan.marker), 'Marker must be present in case summary');
    assert.ok(['PENDING_REVIEW', 'VERIFIED', 'RETURNED'].includes(row.current_state));
    assert.ok(row.location_address?.ward_code, 'Ward code must exist');
    assert.equal(row.location_address?.province_code, '75', 'Province code must be 75');
  }

  const submissions = await pool.query(`select count(*)::int as count
    from daily_report_submissions where case_id = any($1::uuid[])`, [ids]);
  assert.equal(submissions.rows[0].count, ids.length, 'Each case must have a submission record');

  const events = await pool.query(`select count(*)::int as count
    from daily_report_case_events where case_id = any($1::uuid[])`, [ids]);
  assert.equal(events.rows[0].count, ids.length, 'Each case must have an initial report event');

  const sampleDays = ['2026-10-20', '2026-11-01', '2026-11-10', '2026-11-18'];
  const sampleDashboards = [];
  for (const day of sampleDays) {
    const dash = await local.request(compiler, `/dashboard?day=${day}&span=1`);
    const expectedUnits = dash.units.filter(u => u.expected && targetAccounts.some(acc => u.id));
    sampleDashboards.push({
      day,
      total_cases: dash.cases.current,
      expected_units_count: expectedUnits.length
    });
  }

  const period = {
    previousFrom: '2026-10-01',
    from: startDate,
    to: endDate
  };
  const mapData = await readMapReports(pool, period, getDigitalMapWardIndex());
  assert.ok(mapData.rows.length > 0, 'Map report should return rows for the 30-day period');

  const stateCounts = await pool.query(`select current_state, count(*)::int as count
    from daily_report_cases where id = any($1::uuid[])
    group by current_state order by current_state`, [ids]);

  const summary = {
    status: 'PASS',
    at: new Date().toISOString(),
    start_date: startDate,
    end_date: endDate,
    total_days: dates.length,
    new_cases: ids.length,
    coverage_matrix: coverageMatrix,
    state_distribution: Object.fromEntries(stateCounts.rows.map(r => [r.current_state, r.count])),
    sample_dashboards: sampleDashboards,
    map_rows_count: mapData.rows.length
  };

  if (save) {
    await save('verification.json', summary);
    await save('coverage-matrix.json', coverageMatrix);
  }

  return summary;
}
