import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getDigitalMapWardIndex, validateDigitalMapRows } from '../server/digital-map.js';

const wards = [...getDigitalMapWardIndex().byCode.values()];
const row = (ward, overrides = {}) => ({
  wardCode:ward.code, wardName:ward.name, reportDate:'2026-10-01',
  category:'Tai nạn giao thông', severity:'Nghiêm trọng',
  caseCount:100, subjectCount:'', vehicleCount:0, ...overrides
});

test('boundary catalog has 95 unique ward and commune codes', () => {
  assert.equal(wards.length,95);
  assert.equal(new Set(wards.map(ward => ward.name)).size,95);
});

test('validates counts while preserving blank versus zero', () => {
  const result = validateDigitalMapRows([row(wards[0]), row(wards[1], {caseCount:0})]);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.rows[0].subjectCount,null);
  assert.equal(result.rows[0].vehicleCount,0);
  assert.equal(result.rows[1].caseCount,0);
});

test('rejects wrong ward mapping, invalid date and duplicate import keys', () => {
  const result = validateDigitalMapRows([
    row(wards[0], {wardName:wards[1].name}),
    row(wards[1], {reportDate:'2026-02-30'}),
    row(wards[2], {caseCount:-1}),
    row(wards[3]), row(wards[3])
  ]);
  assert.equal(result.errors.length,4);
});

test('100 cases render darker red than 94 cases', () => {
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/digital-map.js',import.meta.url),'utf8'),context);
  const color = context.window.DigitalMap.colorForCount;
  const lightness = value => Number(color(value,100).match(/(\d+)%\)$/)[1]);
  assert.ok(lightness(100) < lightness(94));
  assert.notEqual(color(null,100),color(0,100));
});

test('finds wards by Vietnamese name without requiring diacritics', () => {
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/digital-map.js',import.meta.url),'utf8'),context);
  const search = context.window.DigitalMap.searchWardFeatures;
  const features = [
    { properties:{ code:'ward-a', name:'Phường Long Khánh' } },
    { properties:{ code:'ward-b', name:'Xã Lộc Thạnh' } },
    { properties:{ code:'ward-c', name:'Xã Lộc Thành' } }
  ];
  assert.equal(context.window.DigitalMap.normalizeWardSearch('Đường'), 'duong');
  assert.deepEqual(search(features, 'loc thanh').map(feature => feature.properties.code), ['ward-c', 'ward-b']);
  assert.deepEqual(search(features, 'WARD-B').map(feature => feature.properties.code), ['ward-b']);
  assert.equal(search(features, '', true).length, 3);
});

test('uses subject counts when the filtered metric is người chết', () => {
  const context = { window:{} };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/digital-map.js',import.meta.url),'utf8'),context);
  const data = context.window.DigitalMap.aggregate([
    { ward_code:'ward-a', ward_name:'Phường A', metric_type:'subject', subject_count:7, case_count:0, vehicle_count:0, category:'Tội phạm', severity:'Người chết' },
    { ward_code:'ward-a', ward_name:'Phường A', metric_type:'subject', subject_count:3, case_count:0, vehicle_count:0, category:'Tội phạm', severity:'Người chết' }
  ]);
  assert.equal(data.displayMetricType, 'subject');
  assert.equal(data.displayTotal, 10);
  assert.equal(data.wards.get('ward-a').count, 10);
  assert.equal(data.categories.get('Tội phạm'), 10);
});

test('reports the source Excel row for invalid entered data', () => {
  const result = validateDigitalMapRows([row(wards[0], {excelRow:57, caseCount:''})]);
  assert.deepEqual(result.errors, [{row:57,error:'Số vụ việc là bắt buộc'}]);
});

test('normalizes source matrix from the 95-ward monthly workbook', () => {
  const wardNames = Array.from({ length:95 }, (_, index) => `Ward ${index + 1}`);
  const matrix = [
    ['PHỤ LỤC SỐ LIỆU 09 THÁNG ĐẦU NĂM 2026 TRÊN ĐỊA BÀN 95 XÃ, PHƯỜNG (từ ngày 15/12/2025 đến ngày 14/9/2026)'],
    ['STT', 'Chỉ tiêu thống kê', ...wardNames],
    ['1', '1. Phạm tội về trật tự xã hội', ...Array(95).fill('')],
    ['', 'Số vụ xảy ra', 4, 0, ...Array(93).fill('')],
    ['', 'Số đối tượng bị bắt giữ, xử lý', 2, 1, ...Array(93).fill('')]
  ];
  const context = {
    window: {
      XLSX: { utils: { sheet_to_json() { return matrix; } } }
    }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/digital-map.js', import.meta.url), 'utf8'), context);
  const parsed = context.window.DigitalMap.parseSourceMatrix({
    Sheets: { tổng: {} },
    SheetNames: ['tổng']
  });
  assert.equal(parsed.period.key, 'period-20260914');
  assert.equal(parsed.period.from, '2025-12-15');
  assert.equal(parsed.period.to, '2026-09-14');
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.rows[0].metricType, 'case');
  assert.equal(parsed.rows[0].caseCount, 4);
  assert.equal(parsed.rows[2].metricType, 'subject');
  assert.equal(parsed.rows[2].subjectCount, 2);
});

test('keeps Vietnamese diacritics when two ward names differ only by accent', () => {
  const result = validateDigitalMapRows([
    row(wards.find(item => item.name === 'Xã Lộc Thành'), { wardCode:'', wardName:'Lộc Thành' }),
    row(wards.find(item => item.name === 'Xã Lộc Thạnh'), { wardCode:'', wardName:'Lộc Thạnh' })
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(item => item.wardName), ['Xã Lộc Thành', 'Xã Lộc Thạnh']);
});
