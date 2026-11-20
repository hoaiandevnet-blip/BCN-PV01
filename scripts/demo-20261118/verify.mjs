import assert from 'node:assert/strict';
import { day, marker } from './plan.mjs';

export async function verifyCreatedCases({ local, pool, plan, save }) {
  const ids = plan.cases.map(item => item.payload.id);
  for (const record of plan.cases) {
    const detail = await local.request(record.username, `/cases/${record.payload.id}`);
    assert.equal(detail.case.current_state, 'PENDING_REVIEW');
    assert.equal(detail.case.report_day, day);
    assert.equal(String(detail.case.unit_id), record.payload.unit_id);
    assert.equal(detail.case.summary, record.payload.summary);
    assert.ok(detail.case.summary.includes(marker));
    assert.equal(detail.case.reference_info.creator_unit, record.unit);
    assert.equal(detail.case.location_address.ward_name, record.unit);
    assert.equal(detail.case.reference_info.evidence, record.payload.reference_info.evidence);
    assert.equal(detail.submissions.length, 1);
  }
  const events = await pool.query(`select id,case_id,state from daily_report_case_events
    where case_id=any($1::uuid[])`, [ids]);
  assert.equal(events.rowCount, ids.length);
  assert.ok(events.rows.every(item => item.state === 'PENDING_REVIEW'));
  const sourceIds = new Set(events.rows.map(item => item.id));
  const feed = await local.request(plan.compiler, `/composer/items?report_day=${day}&include_pending=true`);
  const incoming = feed.items.filter(item => sourceIds.has(item.source_id));
  assert.equal(new Set(incoming.map(item => item.source_id)).size, ids.length);
  assert.ok(incoming.every(item => item.current_state === 'PENDING_REVIEW'));
  assert.ok(incoming.every(item => item.source_text.includes('BÁO CÁO THỬ')));
  const notifications = await local.request(plan.compiler, '/notifications');
  const notices = notifications.notifications.filter(item => ids.includes(item.resource_id));
  assert.equal(new Set(notices.map(item => item.resource_id)).size, ids.length);
  const dashboard = await local.request(plan.compiler, `/dashboard?day=${day}&span=1`);
  for (const unit of plan.units) {
    const current = dashboard.units.find(item => item.id === unit.id);
    assert.ok(current.counts.cases >= 4);
    assert.equal(plan.cases.filter(item => item.payload.unit_id === unit.id).length, 4);
  }
  const other = plan.cases.find(item => item.payload.unit_id !== plan.cases[0].payload.unit_id);
  await assert.rejects(local.request(plan.cases[0].username, `/cases/${other.payload.id}`),
    error => error.status === 404);
  await save('compiler-feed.json', feed);
  await save('dashboard.json', dashboard);
  return { status: 'PASS', at: new Date().toISOString(), report_day: day,
    new_cases: ids.length, business_domains: 9, cases_per_unit: 4,
    units: plan.units.map(item => item.name), state: 'PENDING_REVIEW',
    incoming_notifications: notices.length, new_work_reports: 0,
    cross_unit_access_denied: true, today_total_cases: dashboard.cases.current };
}
