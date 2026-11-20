import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeUnit } from '../server/daily-reports/dashboard/unit/model.js';

const context = { unit: { id: '114' }, modules: ['input', 'registry', 'returned', 'unlock'],
  day: '2026-11-11', span: 1, now: new Date('2026-11-11T03:00:00Z'), unlocks: [] };
const source = (id, kind, state, day = context.day, values = {}) => ({
  id, kind, state, day, metric_code: 'DAILY_POLICE_WORK', metric_values: values,
  created_at: '2026-11-11T02:00:00.000Z', updated_at: '2026-11-11T02:00:00.000Z'
});

test('unit progress includes normal-day reports and excludes drafts and returned work from accepted totals', () => {
  const data = summarizeUnit({ ...context, sources: [
    source('normal', 'SITUATION', 'PENDING_REVIEW'),
    source('work', 'WORK_RESULT', 'PENDING_REVIEW', context.day, { patrol_rounds: 0 }),
    source('returned', 'WORK_RESULT', 'RETURNED', context.day, { patrol_rounds: 100 }),
    source('draft', 'WORK_RESULT', 'DRAFT', context.day, { patrol_rounds: 200 }),
    source('old', 'CASE', 'RETURNED', '2026-09-01')
  ] });
  assert.equal(data.sections.situation.status, 'complete');
  assert.equal(data.sections.work.status, 'returned');
  assert.equal(data.work.fields.find(field => field.key === 'patrol_rounds').value, 0);
  assert.equal(data.work.fields.find(field => field.key === 'patrol_officers').value, null);
  assert.equal(data.tasks.returned, 2);
  assert.equal(data.tasks.drafts, 1);
  assert.equal(data.tasks.items[0].id, 'old');
  assert.equal(data.dayCounts.pending, 2);
});

test('unit reporting window uses the Vietnam date and closes exactly at 10:00; history is never open by default', () => {
  const read = extra => summarizeUnit({ ...context, sources: [], ...extra }).window;
  assert.equal(read({ now: new Date('2026-11-11T02:59:59Z') }).regularOpen, true);
  assert.equal(read({}).regularOpen, false);
  assert.equal(read({ day: '2026-11-10', now: new Date('2026-11-11T02:59:59Z') }).regularOpen, false);
  assert.equal(read({}).deadline, '2026-11-11T10:00:00+07:00');
});

test('registry-only accounts see unavailable work progress instead of false zero or missing-report claims', () => {
  const data = summarizeUnit({ ...context, modules: ['registry'], sources: [] });
  assert.equal(data.work.accessible, false);
  assert.equal(data.sections.work.status, 'restricted');
  assert.equal(data.sections.work.sent, null);
});
