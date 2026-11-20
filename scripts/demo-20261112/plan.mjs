import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const day = '2026-11-12';
export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';

export async function buildPlan() {
  const source = JSON.parse(await readFile(new URL('../../outputs/demo-reports-20261111/plan.json',
    import.meta.url), 'utf8'));
  assert.equal(source.report_day, '2026-11-11');
  assert.equal(source.cases.length, 20);
  assert.equal(source.work.length, 5);
  const cases = source.cases.map((record, index) => {
    const label = `THU-NGAY-20261112-${String(index + 1).padStart(2, '0')}`;
    const payload = JSON.parse(JSON.stringify(record.payload)
      .replaceAll(record.label, label).replaceAll('2026-11-11', day).replaceAll('11/11/2026', '12/11/2026'));
    payload.id = randomUUID();
    const minute = String(index + 1).padStart(2, '0');
    payload.occurred_at = `${day}T00:${minute}:00+07:00`;
    payload.reference_info.recorded_at = `${day}T00:${minute}:30+07:00`;
    if (payload.reference_info.ended_at) payload.reference_info.ended_at = `${day}T00:25:00+07:00`;
    payload.reference_info.workflow = 'Tiếp nhận → kiểm tra nội dung → Trung tâm duyệt → tổng hợp (mô phỏng)';
    for (const [personIndex, person] of payload.reference_info.subject_details.entries()) {
      person.identity_number = `000012${String(index + 1).padStart(3, '0')}`
        + String(personIndex + 1).padStart(3, '0');
    }
    assert.ok(payload.title.startsWith('[BÁO CÁO THỬ]'));
    assert.ok(payload.summary.includes(marker));
    return { label, username: record.username, unit: record.unit, payload };
  });
  const work = source.work.map(record => ({ ...record, payload: {
    ...structuredClone(record.payload), id: randomUUID(), report_day: day
  } }));
  return { report_day: day, marker, compiler: source.compiler, cases, work };
}
