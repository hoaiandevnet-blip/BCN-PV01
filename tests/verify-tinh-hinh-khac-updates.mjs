import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');

async function testUpdatesForUnitReporter() {
  console.log('--- Testing TINH_HINH_KHAC in Updates Module for Unit Reporters ---');

  // Verify accounts in database
  const accountsToTest = [
    { username: 'demo.canbo02', unitId: 114, expectedThkCount: 4, unitName: 'Xã An Phước' },
    { username: 'demo.canbo07', unitId: 149, expectedThkCount: 5, unitName: 'Xã Bình Tân' },
    { username: 'demo.canbo08', unitId: 147, expectedThkCount: 4, unitName: 'Xã Bom Bo' },
    { username: 'demo.canbo03', unitId: 124, expectedThkCount: 3, unitName: 'Xã An Viễn' },
    { username: 'demo.canbo04', unitId: 151, expectedThkCount: 3, unitName: 'Xã Bàu Hàm' }
  ];

  for (const acc of accountsToTest) {
    const userRes = await pool.query(
      `select u.id, u.username, u.team_id, u.is_admin,
        array_agg(ur.role_code) as roles
       from users u
       left join daily_report_user_roles ur on ur.user_id = u.id
       where u.username = $1
       group by u.id, u.username, u.team_id, u.is_admin`,
      [acc.username]
    );
    assert.equal(userRes.rows.length, 1, `User ${acc.username} exists`);
    const user = userRes.rows[0];
    assert.equal(user.is_admin, false, 'User must not be admin');
    assert.ok(user.roles.includes('UNIT_REPORTER'), 'User must be UNIT_REPORTER');
    assert.ok(!user.roles.includes('PV01_COMPILER'), 'User must not be TTCH/PV01 compiler');
    assert.equal(Number(user.team_id), acc.unitId, `User belongs to unit ${acc.unitId}`);

    // Test API query directly using the database logic in routes.js
    const fromDate = '2026-11-19';
    const toDate = '2026-11-19';
    const offset = 0;
    const allUnits = false;
    const allowedUnits = [acc.unitId];
    const hasReturns = false;
    const followup = true;
    const dateBasis = false;
    const hasExplicitDate = false;

    const res = await pool.query(`
      select c.id, c.title, c.business_code, c.unit_id,
        (select name from teams where id=c.unit_id) as unit_name,
        c.report_day, c.current_state,
        count(*) over() as total_count,
        (select count(*)::int from daily_report_case_events e where e.case_id = c.id) as event_count
      from daily_report_cases c
      where ($1::bigint is null or c.unit_id=$1)
        and (case when $14::boolean then
          (select (max(r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
            from daily_report_returns r join daily_report_submissions sub on sub.id=r.submission_id
            where sub.case_id=c.id) between $2 and $3
          else c.report_day between $2 and $3 end or ($13::boolean and exists (
          select 1 from daily_report_case_events followup where followup.case_id=c.id
            and followup.event_kind<>'INITIAL_REPORT' and followup.report_day between $2 and $3))
          or ($13::boolean and (c.business_code = 'TINH_HINH_KHAC' or exists (
            select 1 from jsonb_array_elements(c.classifications) cls
            where cls->>'business_code' = 'TINH_HINH_KHAC')) and not $15::boolean))
        and ($9::boolean or c.unit_id=any($10::bigint[]))
        and (not $12::boolean or exists(select 1 from daily_report_returns r
          join daily_report_submissions sub on sub.id=r.submission_id where sub.case_id=c.id))
        and (not $13::boolean or c.business_code = 'TINH_HINH_KHAC' or exists (
          select 1 from jsonb_array_elements(c.classifications) cls
          where cls->>'business_code' = 'TINH_HINH_KHAC') or c.current_state<>'VERIFIED' or exists(
          select 1 from daily_report_case_events e where e.case_id=c.id and e.event_kind<>'INITIAL_REPORT'))
        and ($4::text is null or c.current_state = $4)
        and ($5::text[] is null or c.business_code = any($5::text[]) or exists (
          select 1 from jsonb_array_elements(c.classifications) classification
          where classification->>'business_code'=any($5::text[])))
        and ($6::text is null or c.category_code = $6)
        and ($7::boolean is null or c.counted_as_pphs = $7)
        and ($8::text is null or c.title ilike '%' || $8 || '%')
      order by c.created_at desc, c.id limit 501 offset $11
    `, [acc.unitId, fromDate, toDate, null, null, null, null, null, allUnits, allowedUnits, offset,
        hasReturns, followup, dateBasis, hasExplicitDate]);

    const thkCases = res.rows.filter(r => r.business_code === 'TINH_HINH_KHAC');
    assert.equal(
      thkCases.length,
      acc.expectedThkCount,
      `Unit ${acc.unitName} (${acc.username}) should have ${acc.expectedThkCount} TINH_HINH_KHAC cases in updates, got ${thkCases.length}`
    );
    console.log(`PASS: ${acc.username} (${acc.unitName}) retrieves all ${thkCases.length}/${acc.expectedThkCount} TINH_HINH_KHAC cases on module entry.`);
  }

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

try {
  await testUpdatesForUnitReporter();
  process.exit(0);
} catch (error) {
  console.error('TEST FAILED:', error);
  process.exit(1);
} finally {
  await pool.end();
}
