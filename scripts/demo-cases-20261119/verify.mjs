import assert from 'node:assert/strict';

export async function verifyTodayCases({ local, pool, plan, save }) {
  const day = plan.reportDay;
  const targetIds = plan.cases.map(c => c.id);

  const dbCases = (await pool.query(`select c.id, c.current_state, c.business_code, c.title,
    t.name as unit_name, u.username, c.reference_info
    from daily_report_cases c
    join teams t on t.id = c.unit_id
    join users u on u.team_id = t.id and not u.is_deleted
    where c.report_day = $1 and u.username = any($2::text[])
    order by c.created_at`, [day, plan.targetAccounts])).rows;

  assert.equal(dbCases.length, plan.cases.length,
    `Expected ${plan.cases.length} cases in DB for ${day}, found ${dbCases.length}`);

  const dbCasesById = new Map(dbCases.map(c => [c.id, c]));
  for (const item of plan.cases) {
    const found = dbCasesById.get(item.id);
    assert.ok(found, `Case ${item.id} (${item.label}) not found in DB`);
    assert.equal(found.current_state, item.scenario,
      `Case ${item.id} state mismatch: expected ${item.scenario}, got ${found.current_state}`);
    assert.equal(found.business_code, item.domain,
      `Case ${item.id} domain mismatch: expected ${item.domain}, got ${found.business_code}`);
    assert.ok(found.reference_info?.subjects?.length > 0, `Case ${item.id} missing subjects`);
    assert.ok(found.reference_info?.subject_details?.every(s => /^\d{12}$/.test(s.identity_number)),
      `Case ${item.id} has invalid CCCD numbers`);
  }

  const submissions = (await pool.query(`select case_id, unit_id, report_day, created_by
    from daily_report_submissions
    where case_id = any($1::uuid[])`, [targetIds])).rows;
  assert.equal(submissions.length, plan.cases.length,
    `Expected ${plan.cases.length} submission records, found ${submissions.length}`);

  const events = (await pool.query(`select case_id, event_kind, state
    from daily_report_case_events
    where case_id = any($1::uuid[])
    order by created_at`, [targetIds])).rows;
  assert.equal(events.length, plan.cases.length,
    `Expected ${plan.cases.length} event records, found ${events.length}`);

  const unitStats = dbCases.reduce((acc, c) => {
    acc[c.unit_name] = (acc[c.unit_name] || 0) + 1;
    return acc;
  }, {});

  const stateStats = dbCases.reduce((acc, c) => {
    acc[c.current_state] = (acc[c.current_state] || 0) + 1;
    return acc;
  }, {});

  const domainStats = dbCases.reduce((acc, c) => {
    acc[c.business_code] = (acc[c.business_code] || 0) + 1;
    return acc;
  }, {});

  local.setClockTime(`${day}T08:30:00+07:00`);
  const dashboard = await local.request(plan.compiler, `/dashboard?day=${day}`);
  assert.ok(dashboard, 'Dashboard response received');
  assert.ok(dashboard.cases?.current >= 21, 'Dashboard current cases should include today cases');

  const verification = {
    status: 'PASS',
    verified_at: new Date().toISOString(),
    report_day: day,
    total_cases_in_db: dbCases.length,
    by_unit: unitStats,
    by_state: stateStats,
    by_domain: domainStats,
    total_submissions: submissions.length,
    total_events: events.length,
    dashboard_cases_current: dashboard.cases?.current,
    dashboard_ok: true
  };

  if (save) {
    await save('verification.json', verification);
  }

  return verification;
}
