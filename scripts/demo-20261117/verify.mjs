import assert from 'node:assert/strict';
import { day, marker } from './plan.mjs';

export async function verifyCreatedReports({ local, pool, plan, save }) {
  const caseIds = plan.cases.map(record => record.payload.id);
  const workIds = plan.work.map(record => record.payload.id);
  for (const record of plan.cases) {
    const detail = await local.request(record.username, `/cases/${record.payload.id}`);
    assert.equal(detail.case.current_state, 'PENDING_REVIEW');
    assert.equal(detail.case.report_day, day);
    assert.equal(detail.case.summary, record.payload.summary);
    assert.ok(detail.case.summary.includes(marker));
    assert.equal(detail.case.reference_info.evidence, record.payload.reference_info.evidence);
    assert.equal(detail.submissions.length, 1);
  }
  const feed = await local.request(plan.compiler, `/composer/items?report_day=${day}&include_pending=true`);
  const events = (await pool.query('select id from daily_report_case_events where case_id=any($1::uuid[])',
    [caseIds])).rows;
  const sourceIds = new Set([...events.map(item => item.id), ...workIds]);
  const incoming = feed.items.filter(item => sourceIds.has(item.source_id));
  assert.equal(new Set(incoming.map(item => item.source_id)).size, 25);
  assert.ok(incoming.every(item => item.current_state === 'PENDING_REVIEW'));
  assert.ok(incoming.every(item => item.source_text.includes('BÁO CÁO THỬ')));
  const notifications = await local.request(plan.compiler, '/notifications');
  const resourceIds = new Set([...caseIds, ...workIds]);
  const notices = notifications.notifications.filter(item => resourceIds.has(item.resource_id));
  assert.equal(new Set(notices.map(item => item.resource_id)).size, 25);
  const dashboard = await local.request(plan.compiler, `/dashboard?day=${day}&span=1`);
  const unitViews = [];
  for (const record of plan.work) {
    const unit = dashboard.units.find(item => item.id === record.payload.unit_id);
    assert.equal(unit.status, 'complete');
    assert.ok(unit.counts.cases >= 4 && unit.counts.work >= 1);
    const latest = await local.request(record.username, `/daily-intake/latest?report_day=${day}`);
    assert.equal(latest.submitted, true);
    assert.equal(latest.data.id, record.payload.id);
    assert.equal(latest.data.report_day, day);
    assert.equal(latest.data.state, 'PENDING_REVIEW');
    assert.deepEqual(latest.data.metric_values, record.payload.values);
    const expected = plan.cases.filter(item => item.username === record.username).map(item => item.payload.id);
    assert.equal(expected.length, 4);
    assert.ok(expected.every(id => latest.data.cases.some(item => item.id === id)));
    unitViews.push({ unit: record.unit, username: record.username, latest });
  }
  await save('compiler-feed.json', feed);
  await save('unit-views.json', unitViews);
  await save('dashboard.json', dashboard);
  return { status: 'PASS', at: new Date().toISOString(), report_day: day,
    new_cases: caseIds.length, new_work_results: workIds.length,
    units: plan.work.map(record => record.unit), business_domains: 9,
    state: 'PENDING_REVIEW', incoming_notifications: notices.length,
    today_total_cases: dashboard.cases.current,
    submitted_units: dashboard.progress.submitted, missing_units: dashboard.progress.missing };
}
