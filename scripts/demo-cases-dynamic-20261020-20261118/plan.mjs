import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { compiler, marker, targetAccounts } from './scenarios.mjs';
import {
  buildHandlingDetails,
  pickDomain,
  pickHandlingForm,
  pickScenario,
  pickState,
  pickTimeOfDay
} from './curve.mjs';
import { loadCatalogue } from '../demo-cases-20261020-20261118/definitions.mjs';

export const startDate = '2026-10-20';
export const endDate = '2026-11-18';

export const targetPerDay = [
  [2, 1, 3, 2, 0, 1, 3], // 20/10 (12)
  [3, 2, 1, 4, 2, 2, 2], // 21/10 (16)
  [1, 2, 0, 1, 3, 1, 1], // 22/10 (9)
  [2, 3, 2, 1, 2, 3, 2], // 23/10 (15)
  [4, 3, 2, 4, 3, 3, 3], // 24/10 (22 - Cuối tuần)
  [3, 3, 4, 2, 2, 3, 2], // 25/10 (19 - Chủ nhật)
  [1, 0, 2, 1, 2, 1, 1], // 26/10 (8)
  [2, 2, 1, 3, 2, 2, 2], // 27/10 (14)
  [4, 3, 4, 3, 4, 3, 3], // 28/10 (24 - Cao điểm Ma túy)
  [3, 3, 2, 4, 3, 3, 2], // 29/10 (20)
  [2, 1, 2, 3, 2, 1, 2], // 30/10 (13)
  [3, 4, 3, 3, 2, 3, 3], // 31/10 (21 - Cuối tuần)
  [3, 2, 2, 3, 3, 2, 2], // 01/11 (17 - Chủ nhật)
  [1, 1, 0, 2, 1, 1, 1], // 02/11 (7)
  [2, 2, 3, 1, 2, 2, 2], // 03/11 (14)
  [2, 1, 1, 2, 1, 3, 2], // 04/11 (12)
  [2, 3, 2, 2, 2, 3, 3], // 05/11 (17)
  [2, 1, 2, 2, 2, 3, 2], // 06/11 (14)
  [3, 3, 2, 3, 4, 3, 3], // 07/11 (21 - Cao điểm Kinh tế & Môi trường)
  [2, 2, 3, 2, 2, 3, 3], // 08/11 (17)
  [2, 2, 2, 2, 2, 3, 3], // 09/11 (16)
  [7, 6, 5, 4, 4, 3, 4], // 10/11 (33)
  [4, 4, 4, 4, 4, 3, 4], // 11/11 (27)
  [4, 4, 4, 4, 4, 2, 3], // 12/11 (25)
  [2, 1, 2, 2, 1, 2, 1], // 13/11 (11)
  [4, 3, 3, 4, 3, 3, 3], // 14/11 (23 - Cao điểm Công nghệ cao)
  [3, 2, 3, 2, 3, 3, 2], // 15/11 (18)
  [1, 1, 1, 2, 1, 1, 1], // 16/11 (8)
  [4, 4, 4, 4, 4, 3, 4], // 17/11 (27)
  [4, 4, 4, 4, 4, 4, 4]  // 18/11 (28 - Đã có đủ)
];

export async function buildDynamicPlan(pool, excludeIds = new Set()) {
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

  const catalogue = await loadCatalogue(pool, startDate);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    dates.push(cur.toISOString().slice(0, 10));
  }

  const allExisting = (await pool.query(`select c.id, c.report_day::text as day, u.username
    from daily_report_cases c
    join teams t on t.id = c.unit_id
    join users u on u.team_id = t.id and not u.is_deleted
    where c.report_day between $1 and $2 and u.username = any($3::text[])`,
  [startDate, endDate, targetAccounts])).rows;

  const baselineCounts = new Map();
  for (const row of allExisting) {
    if (!excludeIds.has(row.id)) {
      const key = `${row.day}:${row.username}`;
      baselineCounts.set(key, (baselineCounts.get(key) || 0) + 1);
    }
  }

  const cases = [];
  let globalSeed = 1000;

  for (let d = 0; d < dates.length; d += 1) {
    const day = dates[d];

    for (let u = 0; u < units.length; u += 1) {
      const unit = units[u];
      const target = targetPerDay[d][u];
      const existing = baselineCounts.get(`${day}:${unit.username}`) || 0;
      const needed = Math.max(0, target - existing);

      for (let k = 0; k < needed; k += 1) {
        globalSeed += 1;
        const seed = globalSeed;
        const caseSeq = existing + k + 1;
        const domain = pickDomain(d, seed);
        const scenario = pickScenario(domain, seed);
        const time = pickTimeOfDay(seed);
        const form = pickHandlingForm(seed);
        const state = pickState(d, seed);

        const label = `THU-BIENDONG-${day.replaceAll('-', '')}-${String(caseSeq).padStart(2, '0')}`;
        const address = `Địa bàn kiểm thử ${label}, ${unit.ward.name}, ${province.name}`;

        const subCount = scenario.subjectCount[0]
          + (seed % (scenario.subjectCount[1] - scenario.subjectCount[0] + 1));

        const subjects = Array.from({ length: subCount }, (_, pIdx) => ({
          name: `Đối tượng giả lập ${label}-${pIdx + 1}`,
          gender: ['MALE', 'FEMALE', 'OTHER'][(seed + pIdx) % 3],
          birth_year: 1980 + ((seed + pIdx * 7) % 25),
          birth_month: ((seed + pIdx) % 12) + 1,
          birth_day: ((seed + pIdx * 3) % 27) + 1,
          identity_number: `0000${String(seed).padStart(5, '0')}${String(pIdx + 1).padStart(3, '0')}`,
          permanent_address: address,
          current_address: address,
          permanent_detail: `Số nhà thử nghiệm ${seed}-${pIdx + 1}`,
          permanent_ward: unit.ward.name,
          permanent_province: province.name,
          current_detail: `Nơi tạm trú ${label}`,
          current_ward: unit.ward.name,
          current_province: province.name
        }));

        const caseTypes = scenario.articles.map(code => {
          const art = catalogue.get(domain)?.find(item => item.article_code === code);
          assert.ok(art, `${domain}: code ${code} not found in legal catalogue`);
          return {
            key: art.source_kind === 'REFERENCE' ? `reference:${art.reference_id}` : `published:${art.id}`,
            label: `Điều ${art.article_code} — ${art.title}`
          };
        });

        const damageDiff = scenario.damage[1] - scenario.damage[0];
        const propertyDamage = damageDiff > 0
          ? scenario.damage[0] + ((seed * 100000) % damageDiff)
          : scenario.damage[0];

        const injuredDiff = scenario.injured[1] - scenario.injured[0];
        const injuredCount = injuredDiff > 0
          ? scenario.injured[0] + (seed % (injuredDiff + 1))
          : scenario.injured[0];

        const deathDiff = scenario.death[1] - scenario.death[0];
        const deathCount = deathDiff > 0
          ? scenario.death[0] + (seed % (deathDiff + 1))
          : scenario.death[0];

        const handling = buildHandlingDetails({ form, label, unitName: unit.unit_name, day, seed });

        const id = randomUUID();
        cases.push({
          id,
          label,
          username: unit.username,
          unit_id: String(unit.unit_id),
          unit_name: unit.unit_name,
          report_day: day,
          scenario: state,
          return_reason: state === 'RETURNED'
            ? `${marker} ${label}: Bổ sung tài liệu đối chiếu tang vật và lời khai đối tượng.`
            : null,
          payload: {
            id,
            unit_id: String(unit.unit_id),
            report_day: day,
            business_code: domain,
            title: `[BÁO CÁO THỬ] ${scenario.title}`,
            summary: `${marker}\nMã vụ việc: ${label}. ${scenario.title}. `
              + `Ghi nhận ${subCount} đối tượng, thiệt hại ước tính ${propertyDamage.toLocaleString('vi-VN')}đ. `
              + `Dữ liệu giả lập phục vụ kiểm thử biến động số liệu.`,
            occurred_at: `${day}T${time.hour}:${time.min}:00+07:00`,
            location_address: {
              province_code: province.code,
              ward_code: unit.ward.code,
              detail: `Điểm diễn tập ${label} (địa điểm mô phỏng)`
            },
            reference_info: {
              subjects: subjects.map(p => p.name),
              subject_details: subjects,
              case_types: caseTypes,
              incident_status: 'Giải quyết tin báo tố giác tội phạm',
              category_group: 'Tình huống kiểm thử nghiệp vụ',
              workflow: 'Tiếp nhận → xác minh hiện trường → lập hồ sơ xử lý (mô phỏng)',
              nature: scenario.nature,
              recorded_at: `${day}T${time.hour}:${String((Number(time.min) + 15) % 60).padStart(2, '0')}:00+07:00`,
              ended_at: form !== 'Đang giải quyết' ? `${day}T${time.hour}:55:00+07:00` : null,
              handling_unit_id: Number(unit.unit_id),
              subordinate_unit_id: null,
              details: `${marker}\n${label}: ${scenario.title}. `
                + `Công an xã tiến hành kiểm tra, lấy lời khai các đối tượng liên quan và lập biên bản vụ việc. `
                + `Hồ sơ kiểm thử phục vụ đối soát số liệu biến động báo cáo ngày.`,
              evidence: `${scenario.evidence}. Mã quản lý ${label}.`,
              vehicles: [`BS-${label.slice(-8)}`],
              related_vehicles: ['01 phương tiện mô hình thử nghiệm'],
              death_count: deathCount,
              injured_count: injuredCount,
              property_damage: propertyDamage,
              ...handling
            }
          }
        });
      }
    }
  }

  return {
    startDate,
    endDate,
    marker,
    compiler,
    targetAccounts,
    units: units.map(u => ({ id: u.unit_id, name: u.unit_name, username: u.username })),
    cases
  };
}
