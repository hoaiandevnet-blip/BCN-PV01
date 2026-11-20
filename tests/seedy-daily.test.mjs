import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePeriod, progressPeriod } from '../server/seedy-ai/daily/period.js';
import { directTool, ordinal } from '../server/seedy-ai/daily/planner.js';
import { runDailyTool } from '../server/seedy-ai/daily/execute.js';

test('Weekly comparison counts expected unit-days, ties and equal elapsed weekdays across year boundaries', async () => {
  const period = resolvePeriod('so sanh tuan nay voi tuan truoc', '2026-01-02');
  assert.deepEqual(period, { from: '2025-12-29', to: '2026-01-02', compare: true, weekly: true });
  const reads = [];
  const output = await progressPeriod(period, async (name, { day }) => {
    assert.equal(name, 'dashboard');
    reads.push(day);
    return { units: [{ id: 'a', name: 'A', expected: true, status: 'missing' },
      { id: 'b', name: 'B', expected: true, status: day >= period.from ? 'partial' : 'missing' },
      { id: 'c', name: 'C', expected: false, status: 'missing' }] };
  });
  assert.equal(reads.length, 10);
  assert.match(output, /A: 5 ngày/);
  assert.match(output, /Lượt chưa gửi giảm 5/);
  assert.equal(reads[5], '2025-12-22');
});

test('Returned case selection preserves the displayed ID and never treats user-supplied facts as a general draft', () => {
  const memory = { kind: 'cases', ids: ['a', 'b'], index: null };
  const message = 'Soạn bổ sung cho báo cáo thứ hai. Dữ kiện mới: đã nhận tài liệu.';
  assert.equal(directTool(message, memory), 'draft_case');
  assert.equal(ordinal(message), 2);
  assert.equal(ordinal('Hồ sơ thứ mười hai'), 12);
  assert.equal(ordinal('Báo cáo số hai mươi lăm'), 25);
  return runDailyTool({ tool: 'draft_case' }, { message, memory }, '2026-11-19', async name => {
    if (name === 'scope') return { submodules: ['returned'] };
    assert.equal(name, 'cases/b');
    return { case: { id: 'b', version: 3, title: 'B', summary: 'Nội dung', current_state: 'RETURNED' },
      returns: [{ reason: 'Lý do đầu' }, { reason: 'Yêu cầu hiện tại' }] };
  }).then(result => {
    assert.equal(result.action.id, 'b');
    assert.equal(result.draftFacts.reason, 'Yêu cầu hiện tại');
  });
});
