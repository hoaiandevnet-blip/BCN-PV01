import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { compiler, definitions, handlingForms, loadCatalogue, marker, targetAccounts } from './definitions.mjs';

export const startDate = '2026-10-20';
export const endDate = '2026-11-18';

export async function buildPlan(pool) {
  const directory = JSON.parse(await readFile(new URL('../../assets/data/vietnam-provinces-wards.json',
    import.meta.url), 'utf8'));
  const province = directory.find(item => Number(item.code) === 75);
  assert.ok(province, 'Province 75 not found');

  const units = (await pool.query(`select u.id as user_id, u.username, t.id as unit_id, t.name as unit_name
    from users u join teams t on t.id = u.team_id
    where u.username = any($1::text[]) and not u.is_deleted and u.status = 'Hoạt động'
    order by u.username`, [targetAccounts])).rows;
  assert.equal(units.length, targetAccounts.length, 'All 7 target accounts must be present');

  for (const unit of units) {
    const ward = province.wards.find(w => w.name === unit.unit_name);
    assert.ok(ward, `Ward not found for ${unit.unit_name}`);
    unit.ward = ward;
  }

  const catalogue = await loadCatalogue(pool, startDate);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }

  const existingCounts = (await pool.query(`select c.report_day::text as day, u.username, count(*)::int as count
    from daily_report_cases c
    join teams t on t.id = c.unit_id
    join users u on u.team_id = t.id and not u.is_deleted
    where c.report_day between $1 and $2 and u.username = any($3::text[])
    group by c.report_day, u.username`, [startDate, endDate, targetAccounts])).rows;

  const countMap = new Map();
  for (const row of existingCounts) {
    countMap.set(`${row.day}:${row.username}`, row.count);
  }

  const cases = [];
  let globalOrdinal = 0;

  for (const [dayIndex, day] of dates.entries()) {
    const targetPerUnit = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-17'].includes(day) ? 4 : 2;

    for (const [unitIndex, unit] of units.entries()) {
      const existing = countMap.get(`${day}:${unit.username}`) || 0;
      const needed = Math.max(0, targetPerUnit - existing);

      for (let k = 0; k < needed; k += 1) {
        globalOrdinal += 1;
        const caseSeq = existing + k + 1;
        const scenarioIndex = (dayIndex * 5 + unitIndex * 3 + k) % definitions.length;
        const [business, articles, narrative, evidence] = definitions[scenarioIndex];

        const label = `THU-NGAY-${day.replaceAll('-', '')}-${String(caseSeq).padStart(2, '0')}`;
        const address = `Điểm diễn tập ${label}, ${unit.ward.name}, ${province.name}`;
        const countSubjects = scenarioIndex === 19 ? 0 : (caseSeq % 2) + 1;

        const subjects = Array.from({ length: countSubjects }, (_, pIdx) => ({
          name: `Người giả lập ${label}-${pIdx + 1}`,
          gender: ['MALE', 'FEMALE', 'OTHER'][pIdx % 3],
          birth_year: 1985 + (globalOrdinal % 18),
          birth_month: (globalOrdinal % 12) + 1,
          birth_day: (globalOrdinal % 27) + 1,
          identity_number: `0000${String(globalOrdinal).padStart(5, '0')}${String(pIdx + 1).padStart(3, '0')}`,
          permanent_address: address,
          current_address: address,
          permanent_detail: `Nhà mô phỏng ${label}`,
          permanent_ward: unit.ward.name,
          permanent_province: province.name,
          current_detail: `Nơi ở thử ${label}`,
          current_ward: unit.ward.name,
          current_province: province.name
        }));

        const form = handlingForms[(globalOrdinal + k) % handlingForms.length];
        const hour = String(7 + (caseSeq % 2)).padStart(2, '0');
        const minute = String(10 + ((caseSeq * 7) % 40)).padStart(2, '0');

        const caseTypes = articles.map(code => {
          const article = catalogue.get(business)?.find(item => item.article_code === code);
          assert.ok(article, `${business}: article ${code} not found`);
          return {
            key: article.source_kind === 'REFERENCE'
              ? `reference:${article.reference_id}`
              : `published:${article.id}`,
            label: `Điều ${article.article_code} — ${article.title}`
          };
        });

        const isPast = day < '2026-11-17';
        const scenario = isPast
          ? (globalOrdinal % 10 === 0 ? 'PENDING_REVIEW' : 'VERIFIED')
          : (globalOrdinal % 2 === 0 ? 'PENDING_REVIEW' : 'VERIFIED');

        cases.push({
          id: randomUUID(),
          label,
          username: unit.username,
          unit_id: String(unit.unit_id),
          unit_name: unit.unit_name,
          report_day: day,
          scenario,
          payload: {
            id: randomUUID(),
            unit_id: String(unit.unit_id),
            report_day: day,
            business_code: business,
            title: `[BÁO CÁO THỬ] ${narrative}`,
            summary: `${marker}\nMã tình huống: ${label}. ${narrative}. `
              + `Ghi nhận ${countSubjects} người giả lập; thời gian, tài sản và tài liệu đều dùng cho kiểm thử.`,
            occurred_at: `${day}T${hour}:${minute}:00+07:00`,
            location_address: {
              province_code: province.code,
              ward_code: unit.ward.code,
              detail: `Điểm diễn tập ${label} (địa điểm giả lập)`
            },
            reference_info: {
              subjects: subjects.map(p => p.name),
              subject_details: subjects,
              case_types: caseTypes,
              incident_status: 'Giải quyết tin báo tố giác tội phạm',
              category_group: 'Tình huống kiểm thử nghiệp vụ',
              workflow: 'Tiếp nhận → xác minh → cập nhật → tổng hợp (mô phỏng)',
              nature: ['Ít nghiêm trọng', 'Nghiêm trọng', 'Rất nghiêm trọng'][caseSeq % 3],
              recorded_at: `${day}T${hour}:${String(Number(minute) + 5).padStart(2, '0')}:00+07:00`,
              ended_at: form ? `${day}T09:30:00+07:00` : null,
              handling_unit_id: Number(unit.unit_id),
              subordinate_unit_id: null,
              details: `${marker}\n${label}: ${narrative}. Đã lập biên bản tiếp nhận giả lập, `
                + `đối chiếu lời trình bày mẫu, kiểm tra tài liệu thử và lập hồ sơ chuyển bộ phận tổng hợp. `
                + `Tất cả thông tin con người, căn cước, địa chỉ chi tiết và tang vật đều hư cấu.`,
              evidence: `${evidence}. Mã quản lý thử ${label}; không có tang vật thực tế.`,
              vehicles: [`BS-THU-${label}`],
              related_vehicles: ['01 phương tiện mô hình dùng diễn tập'],
              death_count: 0,
              injured_count: 0,
              property_damage: 0,
              handling_result: form ? 'Đã giải quyết' : 'Đang giải quyết',
              handling_details: form ? {
                form,
                resolution: `${form} trong kịch bản kiểm thử ${label}; không phải quyết định thực tế.`,
                reason: 'Kết quả giả lập dùng kiểm tra hiển thị và tổng hợp, không kết luận về người thật.',
                prosecution_authority: `${unit.unit_name} — cơ quan mô phỏng, không có giá trị pháp lý`,
                prosecution_decision_number: `QD-THU-${label}`,
                prosecution_date: day,
                fine_million: form === 'Xử lý hành chính' ? '2.5' : ''
              } : undefined
            }
          }
        });
      }
    }
  }

  for (const item of cases) {
    item.payload.id = item.id;
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
