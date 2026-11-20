import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { referenceNarrative } from '../server/daily-reports/reference-case/validation.js';

const context = vm.createContext({ window: {} });
for (const file of ['daily-reports-ui.js', 'daily-reports-case-event-content.js']) {
  vm.runInContext(readFileSync(new URL('../assets/js/' + file, import.meta.url), 'utf8'), context);
}
const content = context.window.DailyReportsCaseEventContent;
const fixture = () => ({ title: 'Hồ sơ thử <cũ>', summary: 'Nội dung ban đầu\nKhông được mất dòng này.',
  info: { details: 'Thông tin chi tiết đã lưu.', death_count: 0, injured_count: 2, property_damage: 15000000,
    evidence: '03 hộp hàng mẫu\nDòng vật chứng thứ hai <script>thử</script>',
    incident_status: 'Tiếp nhận vụ việc ban đầu', handling_result: 'Đã giải quyết',
    handling_details: { form: 'Không khởi tố', prosecution_decision_number: 'QĐ-THỬ-01',
      prosecution_date: '2026-11-17' } } });
const eventFor = item => ({ event_kind: 'INITIAL_REPORT', narrative: referenceNarrative(item) });
const rebuild = value => [value.narrative,
  ...value.damage.map(row => `${row.label}: ${row.value}`),
  ...value.handling.map(row => `${row.label}: ${row.value}`)].filter(Boolean).join('\n');

test('grouping preserves every saved line, explicit zero and multiline evidence from generated reports', () => {
  const item = fixture();
  const event = eventFor(item);
  const split = content.split(event, { reference_info: item.info });
  assert.equal(rebuild(split), event.narrative);
  assert.equal(split.damage.find(row => row.label === 'Người chết').value, '0');
  assert.equal(split.damage.find(row => row.label === 'Tài sản thiệt hại').value, '15.000.000 đồng');
  assert.equal(split.damage.find(row => row.label === 'Vật chứng').value, item.info.evidence);
  assert.equal(split.handling.find(row => row.label === 'Số QĐ không khởi tố vụ án').value, 'QĐ-THỬ-01');
  const html = content.render(event, { reference_info: item.info });
  assert.ok(html.includes('&lt;script&gt;thử&lt;/script&gt;'));
  assert.doesNotMatch(html, /<script>/u);
});

test('historical event values never come from the latest case data', () => {
  const event = eventFor(fixture());
  const current = { reference_info: { death_count: 999, evidence: 'Mới', handling_result: 'Đang giải quyết' } };
  const html = content.render(event, current);
  assert.ok(html.includes('03 hộp hàng mẫu'));
  assert.ok(html.includes('Đã giải quyết'));
  assert.doesNotMatch(html, /999|Đang giải quyết/u);
});

test('ordinary updates and legacy text remain verbatim even when their prose contains field labels', () => {
  const narrative = 'Người chết: 4\nTrạng thái vụ việc: Nội dung trích dẫn\nKết quả xử lý: Chưa kết luận';
  for (const [event, item] of [
    [{ narrative, event_kind: 'UPDATE' }, { reference_info: fixture().info }],
    [{ narrative, event_kind: 'INITIAL_REPORT' }, {}],
    [{ narrative: 'Trạng thái vụ việc: A\nMột dòng khác\nKết quả xử lý: B', event_kind: 'INITIAL_REPORT' },
      { reference_info: fixture().info }]
  ]) {
    const split = content.split(event, item);
    assert.equal(split.narrative, event.narrative);
    assert.equal(split.damage.length + split.handling.length, 0);
  }
});

test('missing damage does not become zero and unknown continuation lines remain visible', () => {
  const item = fixture();
  Object.assign(item.info, { death_count: null, injured_count: null, property_damage: null });
  const event = eventFor(item);
  event.narrative += '\nThông tin bổ sung không theo mẫu: vẫn phải giữ nguyên';
  const split = content.split(event, { reference_info: item.info });
  assert.equal(split.damage.length, 0);
  assert.equal(rebuild(split), event.narrative);
  assert.ok(content.render(event, { reference_info: item.info }).includes(item.info.evidence.split('\n')[0]));
});

test('administrative results retain multiline details and a zero fine', () => {
  const item = fixture();
  item.info.handling_details = { form: 'Xử lý hành chính', resolution: 'Kết quả đã lưu\nDòng thứ hai',
    detail: 'Hình thức chi tiết\nDòng thứ hai', fine_million: '0' };
  const event = eventFor(item);
  const split = content.split(event, { reference_info: item.info });
  assert.equal(rebuild(split), event.narrative);
  assert.equal(split.handling.find(row => row.label === 'Tổng tiền phạt').value, '0 triệu đồng');
});

test('independent event decisions remain separate and escape all supplied values', () => {
  const html = content.render({ event_kind: 'UPDATE', narrative: 'Diễn biến <img src=x>',
    decision_type: 'OTHER', decision_number: '<QĐ>', decision_date: '2026-11-17',
    decision_authority: 'Cơ quan & đơn vị' }, {});
  assert.ok(html.includes('Diễn biến &lt;img src=x&gt;'));
  assert.ok(html.includes('&lt;QĐ&gt;'));
  assert.ok(html.includes('17/11/2026'));
  assert.ok(html.includes('Cơ quan &amp; đơn vị'));
  assert.doesNotMatch(html, /<img/u);
});
