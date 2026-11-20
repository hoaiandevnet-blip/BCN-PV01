import assert from 'node:assert/strict';
import { compiler, targetAccounts } from './scenarios.mjs';
import { startDate, endDate } from './plan.mjs';
import { readMapReports } from '../../server/digital-map-reports.js';
import { getDigitalMapWardIndex } from '../../server/digital-map.js';

export async function verifyDynamicCases({ local, pool, plan, save }) {
  const ids = plan.cases.map(item => item.payload.id);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    dates.push(cur.toISOString().slice(0, 10));
  }

  const allRows = await pool.query(`select c.id, c.report_day::text as day, u.username,
    c.business_code, c.current_state, c.reference_info
    from daily_report_cases c
    join teams t on t.id = c.unit_id
    join users u on u.team_id = t.id and not u.is_deleted
    where c.report_day between $1 and $2 and u.username = any($3::text[])
    order by c.report_day, u.username`, [startDate, endDate, targetAccounts]);

  const coverageMatrix = {};
  const dailyTotals = {};
  const domainTotals = {};

  for (const day of dates) {
    coverageMatrix[day] = {};
    dailyTotals[day] = 0;
    for (const acc of targetAccounts) {
      coverageMatrix[day][acc] = 0;
    }
  }

  for (const row of allRows.rows) {
    if (coverageMatrix[row.day]) {
      coverageMatrix[row.day][row.username] += 1;
      dailyTotals[row.day] += 1;
    }
    domainTotals[row.business_code] = (domainTotals[row.business_code] || 0) + 1;
  }

  // 1. Verify fluctuation in daily totals
  const totalList = Object.values(dailyTotals);
  const minDaily = Math.min(...totalList);
  const maxDaily = Math.max(...totalList);
  const distinctDailyTotals = new Set(totalList).size;

  assert.ok(minDaily >= 7, 'Minimum daily total should be at least 7');
  assert.ok(maxDaily >= 25, 'Maximum daily total should reach at least 25 (spike)');
  assert.ok(distinctDailyTotals >= 8, 'There should be at least 8 distinct daily total values for fluctuation');

  // 2. Verify domain distribution
  const distinctDomains = Object.keys(domainTotals).length;
  assert.ok(distinctDomains >= 7, 'At least 7 different business domains represented');
  assert.ok(domainTotals.PPHS > 50, 'PPHS should be a major domain');
  assert.ok(domainTotals.MA_TUY > 30, 'MA_TUY should have substantial presence');

  // 3. Verify state diversity
  const stateCounts = (await pool.query(`select current_state, count(*)::int as count
    from daily_report_cases where id = any($1::uuid[])
    group by current_state order by current_state`, [ids])).rows;
  const statesMap = Object.fromEntries(stateCounts.map(r => [r.current_state, r.count]));

  assert.ok(statesMap.VERIFIED > 0, 'Must have VERIFIED cases');
  assert.ok(statesMap.PENDING_REVIEW > 0, 'Must have PENDING_REVIEW cases');
  assert.ok(statesMap.RETURNED > 0, 'Must have RETURNED cases for testing return workflows');

  // 4. Verify casualty and damage diversity
  const damageRows = (await pool.query(`select
    count(*) filter (where (reference_info->>'property_damage')::bigint > 0)::int as has_damage,
    count(*) filter (where (reference_info->>'injured_count')::int > 0)::int as has_injured,
    count(*) filter (where (reference_info->>'death_count')::int > 0)::int as has_death
    from daily_report_cases where id = any($1::uuid[])`, [ids])).rows[0];

  assert.ok(damageRows.has_damage > 100, 'Many cases should have non-zero property damage');
  assert.ok(damageRows.has_injured > 15, 'Some cases should have injuries');

  // 5. Test dashboard trends and delta comparisons
  const sampleDays = ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-18'];
  const trendSamples = [];

  for (const day of sampleDays) {
    const dash = await local.request(compiler, `/dashboard?day=${day}&span=7`);
    const pphsComp = dash.domains.find(d => d.code === 'PPHS');
    const drugComp = dash.domains.find(d => d.code === 'MA_TUY');
    trendSamples.push({
      day,
      total_cases_span: dash.cases.current,
      previous_span: dash.cases.previous,
      delta: dash.cases.delta,
      percent: dash.cases.percent,
      direction: dash.cases.direction,
      pphs_trend: { delta: pphsComp?.delta, percent: pphsComp?.percent, direction: pphsComp?.direction },
      drug_trend: { delta: drugComp?.delta, percent: drugComp?.percent, direction: drugComp?.direction }
    });
  }

  // 6. Test digital map reports
  const period = {
    previousFrom: '2026-10-01',
    from: startDate,
    to: endDate
  };
  const mapData = await readMapReports(pool, period, getDigitalMapWardIndex());
  assert.ok(mapData.rows.length > 50, 'Digital map report should return substantial spatially distributed rows');

  const summary = {
    status: 'PASS',
    at: new Date().toISOString(),
    start_date: startDate,
    end_date: endDate,
    total_days: dates.length,
    total_period_cases: allRows.rowCount,
    new_cases_added: ids.length,
    daily_fluctuation: {
      min_day: minDaily,
      max_day: maxDaily,
      distinct_totals: distinctDailyTotals,
      daily_totals: dailyTotals
    },
    domain_totals: domainTotals,
    state_distribution: statesMap,
    casualties_and_damages: damageRows,
    trend_samples_7d: trendSamples,
    map_rows_count: mapData.rows.length,
    coverage_matrix: coverageMatrix
  };

  if (save) {
    await save('verification.json', summary);
    await save('coverage-matrix.json', coverageMatrix);
    await save('trend-samples.json', trendSamples);
  }

  return summary;
}
