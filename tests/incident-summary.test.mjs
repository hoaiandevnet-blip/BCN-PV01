import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
for (const file of ['daily-reports-ui.js', 'daily-report-intake/incident-summary.js']) {
  vm.runInContext(readFileSync(new URL('../assets/js/' + file, import.meta.url), 'utf8'), context);
}
const render = cases => context.window.DailyReportIncidentSummary.render(cases);

test('summary uses the actual case title and safely renders saved subject and damage details', () => {
  const html = render([{ id: 'one', business_code: 'PPHS', title: 'Tên vụ <script>test</script>',
    summary: 'Nội dung dài không được dùng thay tên vụ việc', reference_info: {
      title: 'Tên cũ', incident_status: 'Tiếp nhận vụ việc ban đầu', subjects: ['Người thử'],
      subject_details: [{ name: 'Người thử <img src=x>', gender: 'MALE', birth_year: 1995,
        birth_month: 3, birth_day: 2, identity_number: '000000000001',
        permanent_address: 'Địa chỉ thử A', current_address: 'Địa chỉ thử B' }],
      death_count: 0, injured_count: 2, property_damage: 12500000, evidence: '<img src=x onerror=alert(1)>'
    } }]);
  for (const value of ['Tên vụ &lt;script&gt;test&lt;/script&gt;', 'Phạm pháp hình sự', '02/03/1995',
    'CCCD 000000000001', 'Địa chỉ thử A', 'Địa chỉ thử B',
    '12.500.000 đồng', '&lt;img src=x onerror=alert(1)&gt;']) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<script>|<img |Tên cũ|Nội dung dài/);
  assert.match(html, /<dt>Thường trú:<\/dt><dd>Địa chỉ thử A<\/dd>/);
  assert.match(html, /<dt>Nơi ở hiện tại:<\/dt><dd>Địa chỉ thử B<\/dd>/);
  assert.match(html, /data-incident-fact="deaths"><dt>Người chết<\/dt><dd>0<\/dd>/);
});

test('missing information is distinct from explicit zero and an empty subject list', () => {
  const missing = render([{ business_code: 'TNXH', reference_info: {} }]);
  assert.match(missing, /Chưa nhập tên vụ việc/);
  assert.match(missing, /Chưa nhập thông tin đối tượng/);
  assert.match(missing, /data-incident-fact="damage"><dt>Tài sản thiệt hại<\/dt><dd>Chưa nhập<\/dd>/);
  const empty = render([{ reference_info: { subjects: [], death_count: 0, property_damage: 0 } }]);
  assert.match(empty, /Không có đối tượng/);
  assert.match(empty, /0 đồng/);
});

test('legacy subject names and partial birth dates stay visible without invented details', () => {
  const html = render([{ title: 'Vụ thử', reference_info: {
    subjects: ['Người thứ nhất', 'Người thứ hai'],
    subject_details: [{ name: 'Người thứ nhất', birth_year: 1992, permanent_detail: 'Số nhà thử',
      permanent_ward: 'Xã thử', permanent_province: 'Tỉnh thử' }]
  } }]);
  assert.match(html, /Sinh năm 1992/);
  assert.match(html, /Người thứ hai/);
  assert.match(html, /Số nhà thử, Xã thử, Tỉnh thử/);
  assert.doesNotMatch(html, /01\/01\/1992|undefined|null|NaN/);
});

test('domain sorting preserves within-domain order, legacy aliases and unknown cases without changing input', () => {
  const cases = [
    { id: 'other', business_code: 'TINH_HINH_KHAC' },
    { id: 'economic', business_code: 'KINH_TE' },
    { id: 'criminal-first', business_code: 'PPHS' },
    { id: 'legacy', business_code: 'THAM_NHUNG' },
    { id: 'criminal-second', business_code: 'PPHS' },
    { id: 'unknown', business_code: 'FUTURE' }
  ];
  const before = structuredClone(cases);
  const html = render(cases);
  assert.deepEqual([...html.matchAll(/data-incident-id="([^"]+)"/g)].map(match => match[1]),
    ['criminal-first', 'criminal-second', 'economic', 'legacy', 'other', 'unknown']);
  assert.deepEqual(cases, before);
});
