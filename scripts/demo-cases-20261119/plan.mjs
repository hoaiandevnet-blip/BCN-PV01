import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { legalEntryOptions } from '../../server/daily-reports/legal-entry.js';
import {
  compiler,
  marker,
  targetAccounts,
  targetDistribution,
  todayScenarios
} from './scenarios.mjs';

export const reportDay = '2026-11-19';

const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ'];
const middleNames = ['Văn', 'Thị', 'Đình', 'Thành', 'Minh', 'Hồng', 'Đức', 'Quang', 'Hữu', 'Xuân'];
const lastNames = ['Tuấn', 'Hải', 'Lan', 'Nam', 'Thảo', 'Dũng', 'Kiên', 'Cường', 'Trang', 'Phúc'];

function generateSubject(seed, index, label, wardName, provinceName) {
  const f = firstNames[(seed + index) % firstNames.length];
  const m = middleNames[(seed * 3 + index) % middleNames.length];
  const l = lastNames[(seed * 7 + index) % lastNames.length];
  const fullName = `${f} ${m} ${l}`;
  const gender = m === 'Thị' || l === 'Lan' || l === 'Thảo' || l === 'Trang' ? 'FEMALE' : 'MALE';
  const birthYear = 1982 + ((seed + index * 5) % 22);
  const birthMonth = ((seed + index * 2) % 12) + 1;
  const birthDay = ((seed + index * 3) % 27) + 1;

  const genderCode = gender === 'MALE' ? '0' : '1';
  const year2 = String(birthYear).slice(-2);
  const seq6 = String(100000 + (seed * 17 + index) % 900000);
  const idNumber = `075${genderCode}${year2}${seq6}`;
  assert.equal(idNumber.length, 12, 'CCCD must be exactly 12 digits');

  const address = `Ấp mô phỏng ${index + 1}, ${wardName}, ${provinceName}`;

  return {
    name: `${fullName} (Mô phỏng ${label}-${index + 1})`,
    gender,
    birth_year: birthYear,
    birth_month: birthMonth,
    birth_day: birthDay,
    identity_number: idNumber,
    permanent_address: address,
    current_address: address,
    permanent_detail: `Tổ ${(seed % 15) + 1}, ấp thử nghiệm ${index + 1}`,
    permanent_ward: wardName,
    permanent_province: provinceName,
    current_detail: `Nhà số ${seed % 100 + 1}`,
    current_ward: wardName,
    current_province: provinceName
  };
}

export async function buildTodayPlan(pool) {
  const directory = JSON.parse(await readFile(new URL('../../assets/data/vietnam-provinces-wards.json',
    import.meta.url), 'utf8'));
  const province = directory.find(item => Number(item.code) === 75);
  assert.ok(province, 'Province 75 not found');

  const units = (await pool.query(`select u.id as user_id, u.username, t.id as unit_id, t.name as unit_name
    from users u join teams t on t.id = u.team_id
    where u.username = any($1::text[]) and not u.is_deleted and u.status = 'Hoạt động'
    order by u.username`, [targetAccounts])).rows;
  assert.equal(units.length, targetAccounts.length);

  for (const unit of units) {
    const ward = province.wards.find(w => w.name === unit.unit_name);
    assert.ok(ward, `Ward not found for ${unit.unit_name}`);
    unit.ward = ward;
  }

  const catalogue = new Map();
  for (const scenario of todayScenarios) {
    if (!catalogue.has(scenario.domain)) {
      catalogue.set(scenario.domain, await legalEntryOptions(pool, reportDay, scenario.domain));
    }
  }

  const planCases = [];
  let globalIndex = 0;

  for (const dist of targetDistribution) {
    const unit = units.find(u => u.username === dist.username);
    assert.ok(unit, `Unit not found for ${dist.username}`);

    for (let k = 0; k < dist.count; k += 1) {
      globalIndex += 1;
      const scenarioIndex = (globalIndex * 5 + k * 2) % todayScenarios.length;
      const scenario = todayScenarios[scenarioIndex];

      let scenarioState = 'PENDING_REVIEW';
      let returnReason = null;
      if (globalIndex === 1 || globalIndex === 10 || globalIndex === 20) {
        scenarioState = 'VERIFIED';
      } else if (globalIndex === 7) {
        scenarioState = 'RETURNED';
        returnReason = `${marker} Đề nghị Công an xã bổ sung kết quả xác minh lời khai và biên bản hiện trường.`;
      }

      const caseSeq = String(globalIndex).padStart(2, '0');
      const label = `TODAY-20261119-${caseSeq}`;

      const hour = String(1 + Math.floor((globalIndex * 17) % 7)).padStart(2, '0');
      const minute = String((globalIndex * 13) % 55).padStart(2, '0');
      const occurredTime = `${reportDay}T${hour}:${minute}:00+07:00`;
      const recMinute = String((Number(minute) + 20) % 60).padStart(2, '0');
      const recHour = Number(minute) + 20 >= 60 ? String(Number(hour) + 1).padStart(2, '0') : hour;
      const recordedTime = `${reportDay}T${recHour}:${recMinute}:00+07:00`;

      const subCount = scenario.subjectCount[0]
        + (globalIndex % (scenario.subjectCount[1] - scenario.subjectCount[0] + 1));
      const subjects = Array.from({ length: subCount }, (_, pIdx) =>
        generateSubject(globalIndex * 100 + pIdx, pIdx, label, unit.ward.name, province.name)
      );

      const caseTypes = scenario.articles.map(code => {
        const art = catalogue.get(scenario.domain)?.find(item => item.article_code === code);
        assert.ok(art, `${scenario.domain}: article ${code} not found in catalogue`);
        return {
          key: art.source_kind === 'REFERENCE' ? `reference:${art.reference_id}` : `published:${art.id}`,
          label: `Điều ${art.article_code} — ${art.title}`
        };
      });

      const damageDiff = scenario.damage[1] - scenario.damage[0];
      const damage = damageDiff > 0
        ? scenario.damage[0] + ((globalIndex * 1500000) % damageDiff)
        : scenario.damage[0];

      const id = randomUUID();
      planCases.push({
        id,
        label,
        username: unit.username,
        unit_id: String(unit.unit_id),
        unit_name: unit.unit_name,
        report_day: reportDay,
        scenario: scenarioState,
        return_reason: returnReason,
        domain: scenario.domain,
        title: scenario.title,
        payload: {
          id,
          unit_id: String(unit.unit_id),
          report_day: reportDay,
          business_code: scenario.domain,
          title: `[HÔM NAY 19/11] ${scenario.title}`,
          summary: `${marker}\nMã hồ sơ: ${label}. Đơn vị lập: ${unit.unit_name}. `
            + `Lĩnh vực: ${scenario.domain}. Nội dung: ${scenario.title}. `
            + `Đối tượng liên quan: ${subCount} người. Ước tính thiệt hại: ${damage.toLocaleString('vi-VN')} VNĐ.`,
          occurred_at: occurredTime,
          location_address: {
            province_code: province.code,
            ward_code: unit.ward.code,
            detail: `Địa bàn tuần tra số ${globalIndex}, ${unit.ward.name}`
          },
          reference_info: {
            subjects: subjects.map(s => s.name),
            subject_details: subjects,
            case_types: caseTypes,
            incident_status: 'Giải quyết tin báo tố giác tội phạm',
            category_group: 'Báo cáo vụ việc trong ngày',
            workflow: 'Tiếp nhận tin báo → Phân công cán bộ xác minh → Lập hồ sơ ban đầu',
            nature: scenario.nature,
            recorded_at: recordedTime,
            handling_unit_id: Number(unit.unit_id),
            details: `${marker}\n${label}: Vào hồi ${hour}h${minute} ngày 19/11/2026, `
              + `${unit.unit_name} tiếp nhận nguồn tin về vụ việc ${scenario.title.toLowerCase()}. `
              + `Tổ công tác nhanh chóng có mặt bảo vệ hiện trường, lấy lời khai và tạm giữ tang vật liên quan.`,
            evidence: `${scenario.evidence}. Đã niêm phong phục vụ giám định.`,
            vehicles: [`BS-60B1-${String(10000 + globalIndex * 314).slice(0, 5)}`],
            related_vehicles: ['01 phương tiện mô hình phục vụ điều tra'],
            death_count: scenario.death[0],
            injured_count: scenario.injured[0],
            property_damage: damage,
            handling_form: scenario.handlingForm,
            handling_result: `${scenario.handlingForm} theo quy định của pháp luật`,
            settlement_status: scenarioState === 'VERIFIED' ? 'Đã giải quyết xong ban đầu' : 'Đang giải quyết'
          }
        }
      });
    }
  }

  assert.equal(planCases.length, 21, 'Must plan exactly 21 cases for today');

  return {
    reportDay,
    marker,
    compiler,
    targetAccounts,
    units: units.map(u => ({ id: u.unit_id, name: u.unit_name, username: u.username })),
    cases: planCases
  };
}
