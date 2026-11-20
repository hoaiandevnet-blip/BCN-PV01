import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingDashboard } from '../assets/js/standalone/dashboard/reporting-units.js';

const unit = (id, name, status, expected = true) => ({ id, name, status, expected, items: [] });
const dashboard = units => ({ audience: 'command', units, progress: { pending: 7, verified: 9 },
  cases: { current: 11 }, series: [{ current: 11 }], domains: [] });

test('the receiving centre is excluded from reporting rows and every submission progress count', () => {
  const input = dashboard([
    unit('centre', '  TRUNG TÂM THÔNG TIN CHỈ HUY  ', 'missing'),
    unit('a', 'Xã An Phước', 'complete'),
    unit('b', 'Xã Bình Tân', 'missing'),
    unit('c', 'Xã Bom Bo', 'partial'),
    unit('d', 'Xã An Viễn', 'returned'),
    unit('e', 'Đơn vị gửi ngoài danh sách', 'complete', false)
  ]);
  const before = structuredClone(input);
  const result = reportingDashboard(input);
  assert.deepEqual(result.units.map(unit => unit.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(result.progress, { expected: 4, submitted: 3, missing: 1, complete: 1,
    partial: 1, returned: 1, percent: 75, pending: 7, verified: 9 });
  assert.deepEqual(result.cases, input.cases);
  assert.deepEqual(result.series, input.series);
  assert.deepEqual(input, before);
});

test('receipt-only units stay excluded after sending; unrelated units and individual dashboards stay intact', () => {
  const centre = unit('centre', 'Trung tâm thông tin chỉ huy'.normalize('NFD'), 'complete');
  const input = dashboard([centre, unit('a', 'Đội chỉ huy Xã An Phước', 'missing')]);
  assert.deepEqual(reportingDashboard(input).units.map(unit => unit.id), ['a']);
  assert.equal(reportingDashboard(input).progress.submitted, 0);
  const own = { ...input, audience: 'unit' };
  assert.equal(reportingDashboard(own), own);
  const noCentre = dashboard([unit('a', 'Xã An Phước', 'complete')]);
  assert.equal(reportingDashboard(noCentre), noCentre);
  const onlyCentre = reportingDashboard(dashboard([centre]));
  assert.equal(onlyCentre.units.length, 0);
  assert.equal(onlyCentre.progress.expected, 0);
  assert.equal(onlyCentre.progress.percent, null);
});
