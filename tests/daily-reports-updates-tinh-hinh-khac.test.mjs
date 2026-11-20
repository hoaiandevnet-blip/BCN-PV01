import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../server/db.js';

test('updates module only displays TINH_HINH_KHAC and excludes all other domains', async () => {
  const fromDate = '2026-11-19';
  const toDate = '2026-11-19';
  const offset = 0;
  const hasReturns = false;
  const followup = true;
  const dateBasis = false;
  const hasExplicitDate = false;

  const querySql = `
    select c.id, c.title, c.business_code, c.unit_id,
      (select name from teams where id=c.unit_id) as unit_name,
      c.report_day, c.current_state,
      count(*) over() as total_count,
      (select count(*)::int from daily_report_case_events e where e.case_id = c.id) as event_count
    from daily_report_cases c
    where ($1::bigint is null or c.unit_id=$1)
      and (not $13::boolean or c.business_code = 'TINH_HINH_KHAC' or exists (
        select 1 from jsonb_array_elements(c.classifications) cls
        where cls->>'business_code' = 'TINH_HINH_KHAC'))
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
  `;

  // 1. Test Unit 114 (Xã An Phước)
  const res114 = await pool.query(querySql, [114, fromDate, toDate, null, null, null, null, null,
    false, [114], offset, hasReturns, followup, dateBasis, hasExplicitDate]);
  assert.equal(res114.rows.length, 4, 'Unit 114 must have exactly 4 cases in updates');
  assert.ok(res114.rows.every(r => r.business_code === 'TINH_HINH_KHAC'),
    'All cases in updates for Unit 114 must be TINH_HINH_KHAC');

  // 2. Test Unit 149 (Xã Bình Tân)
  const res149 = await pool.query(querySql, [149, fromDate, toDate, null, null, null, null, null,
    false, [149], offset, hasReturns, followup, dateBasis, hasExplicitDate]);
  assert.equal(res149.rows.length, 5, 'Unit 149 must have exactly 5 cases in updates');
  assert.ok(res149.rows.every(r => r.business_code === 'TINH_HINH_KHAC'),
    'All cases in updates for Unit 149 must be TINH_HINH_KHAC');

  // 3. Test Admin (all units) in updates view
  const resAdmin = await pool.query(querySql, [null, fromDate, toDate, null, null, null, null, null,
    true, [], offset, hasReturns, followup, dateBasis, hasExplicitDate]);
  assert.equal(resAdmin.rows.length, 26, 'Updates module across all units must have exactly 26 cases');
  assert.ok(resAdmin.rows.every(r => r.business_code === 'TINH_HINH_KHAC'),
    'Updates module must only contain TINH_HINH_KHAC cases');
});
