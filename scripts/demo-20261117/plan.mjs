import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const day = '2026-11-17';
export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';

export async function buildPlan() {
  const source = JSON.parse(await readFile(new URL('../../outputs/demo-reports-20261112/plan.json',
    import.meta.url), 'utf8'));
  assert.equal(source.report_day, '2026-11-12');
  assert.equal(source.cases.length, 20);
  assert.equal(source.work.length, 5);
  const cases = source.cases.map((record, index) => {
    const label = `THU-NGAY-20261117-${String(index + 1).padStart(2, '0')}`;
    const payload = JSON.parse(JSON.stringify(record.payload)
      .replaceAll(record.label, label)
      .replaceAll('2026-11-12', day)
      .replaceAll('12/11/2026', '17/11/2026'));
    payload.id = randomUUID();
    for (const [personIndex, person] of payload.reference_info.subject_details.entries()) {
      person.identity_number = `000017${String(index + 1).padStart(3, '0')}`
        + String(personIndex + 1).padStart(3, '0');
    }
    assert.ok(payload.title.startsWith('[BÁO CÁO THỬ]'));
    assert.ok(payload.summary.includes(marker));
    assert.ok(payload.reference_info.details.includes(marker));
    assert.equal(payload.report_day, day);
    assert.ok(payload.occurred_at.startsWith(day));
    assert.ok(payload.reference_info.recorded_at.startsWith(day));
    assert.doesNotMatch(JSON.stringify(payload), /2026-11-12|20261112|12\/11\/2026/);
    return { label, username: record.username, unit: record.unit, payload };
  });
  const work = source.work.map(record => ({ ...record, payload: {
    ...structuredClone(record.payload), id: randomUUID(), report_day: day,
    primitive_weapon_types: ['Dao mô hình — BÁO CÁO THỬ ngày 17/11/2026, không có vật chứng thật']
  } }));
  const domains = new Set(cases.map(record => record.payload.business_code));
  assert.equal(domains.size, 9);
  return { report_day: day, marker, compiler: source.compiler, cases, work };
}
