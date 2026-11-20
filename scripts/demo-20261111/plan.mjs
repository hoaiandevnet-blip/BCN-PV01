import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { intakeSchema } from '../../server/daily-reports/intake/validation.js';

export const day = '2026-11-11';
export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';

export async function buildPlan() {
  const source = JSON.parse(await readFile(new URL('../../outputs/weekly-demo-20261110/plan.json',
    import.meta.url), 'utf8'));
  const previous = source.records.filter(record => record.payload.report_day === '2026-11-10');
  assert.equal(previous.length, 20);
  const cases = previous.map((record, index) => {
    const label = `THU-NGAY-20261111-${String(index + 1).padStart(2, '0')}`;
    const payload = JSON.parse(JSON.stringify(record.payload)
      .replaceAll(record.label, label).replaceAll('2026-11-10', day));
    payload.id = randomUUID();
    payload.summary += ' Bộ dữ liệu bổ sung ngày 11/11/2026 theo yêu cầu kiểm thử tổng hợp.';
    for (const [personIndex, person] of payload.reference_info.subject_details.entries()) {
      person.identity_number = `000011${String(index + 1).padStart(3, '0')}${String(personIndex + 1).padStart(3, '0')}`;
    }
    return { label, username: record.username, unit: record.unit, payload };
  });
  const units = [...new Map(cases.map(record => [record.username, record])).values()];
  const work = units.map((record, index) => ({
    username: record.username,
    unit: record.unit,
    payload: {
      id: randomUUID(), unit_id: record.payload.unit_id, report_day: day, mode: 'WORK_ONLY', incidents: [],
      work_domain: 'Lĩnh vực ANTT - ATXH', attachments: [],
      primitive_weapon_types: ['Dao mô hình — BÁO CÁO THỬ, không có vật chứng thật'],
      values: {
        ...Object.fromEntries(intakeSchema.entryFields.map(([key]) => [key, 0])),
        primitive_weapons: index + 1,
        community_sentences: index + 2,
        released_prisoners: 2,
        parole: index % 2,
        delinquent_youth: index + 1,
        community_rehabilitation: 1,
        suspected_drug_users: index % 3,
        administrative_checks: 8 + index * 2,
        administrative_violation_records: index + 2,
        administrative_penalty_decisions: index + 1,
        administrative_fines: (index + 1) * 750000,
        patrol_officers: 6 + index * 2,
        patrol_rounds: 2 + index,
        patrol_vehicles_checked: 18 + index * 5,
        patrol_vehicles_detained: index % 2,
        patrol_violations: index + 1,
        patrol_documents_detained: index % 2
      }
    }
  }));
  return { report_day: day, marker, compiler: 'ttttch.pv01', cases, work };
}
