import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MARKER, SCENARIO_TEMPLATES } from './scenarios.mjs';
import { loadCatalogue } from '../demo-cases-20261020-20261118/definitions.mjs';

export async function seedCommuneCases(client, targetUnits) {
  const dates = [];
  for (let i = 1; i <= 19; i += 1) {
    dates.push(`2026-11-${String(i).padStart(2, '0')}`);
  }
  assert.equal(dates.length, 19, 'Expected 19 days from 2026-11-01 to 2026-11-19');

  const catalogue = await loadCatalogue(client, '2026-11-01');

  // Load ward metadata
  const geoData = JSON.parse(
    await readFile(new URL('../../assets/data/vietnam-provinces-wards.json', import.meta.url), 'utf8')
  );
  const province = geoData.find(item => Number(item.code) === 75);
  const wardMap = new Map((province?.wards || []).map(w => [w.name, w]));

  let totalInserted = 0;
  let totalSkipped = 0;

  for (let d = 0; d < dates.length; d += 1) {
    const day = dates[d];
    const isToday = day === '2026-11-19';

    for (let u = 0; u < targetUnits.length; u += 1) {
      const unit = targetUnits[u];

      // Check if unit already has cases for this day
      const existing = await client.query(`
        select count(*)::int as count from daily_report_cases
        where unit_id = $1 and report_day = $2
      `, [unit.unit_id, day]);

      if (existing.rows[0].count > 0) {
        totalSkipped += 1;
        continue;
      }

      const scenarioIdx = (u * 13 + d * 7) % SCENARIO_TEMPLATES.length;
      const scenario = SCENARIO_TEMPLATES[scenarioIdx];
      const caseId = randomUUID();
      const stableCode = `BCN-${day.replaceAll('-', '')}-${caseId}`;
      const label = `BCN-COMMUNE-${day.replaceAll('-', '')}-${String(unit.unit_id)}-${caseId.slice(0, 6)}`;

      const ward = wardMap.get(unit.unit_name) || {
        code: String(unit.unit_id).padStart(5, '0'),
        name: unit.unit_name
      };

      const patrolNumber = ((u + d) % 20) + 1;
      const locationAddress = {
        province_code: '75',
        province_name: 'Thành phố Đồng Nai',
        ward_code: String(ward.code),
        ward_name: unit.unit_name,
        detail: `Địa bàn tuần tra số ${patrolNumber}, ${unit.unit_name}`
      };
      const locationGeneral = `${locationAddress.detail}, ${unit.unit_name}, Thành phố Đồng Nai`;

      const minute = String(10 + ((u + d * 3) % 45)).padStart(2, '0');
      const hour = String(6 + (u % 3)).padStart(2, '0');
      const occurredAt = `${day}T${hour}:${minute}:00+07:00`;
      const createdAt = `${day}T08:${String(15 + (u % 35)).padStart(2, '0')}:00+07:00`;

      // Legal catalogue reference
      const domainCatalogue = catalogue.get(scenario.domain) || [];
      const art = domainCatalogue.find(item => item.article_code === scenario.articleCode)
        || domainCatalogue[0] || null;

      const legalReference = art ? {
        title: art.title,
        bundle_key: art.bundle_key || 'blhs-135-2025',
        source_uri: art.source_uri || '',
        clause_code: art.clause_code || '',
        source_kind: art.source_kind || 'REFERENCE',
        source_page: art.source_page || 1,
        article_code: art.article_code || scenario.articleCode,
        reference_id: art.reference_id || `blhs-135-2025:${scenario.articleCode}`,
        source_sha256: art.source_sha256 || '',
        mapping_status: art.mapping_status || 'SUGGESTED',
        document_number: art.document_number || '135/VBHN-VPQH'
      } : null;

      const classifications = [{
        business_code: scenario.domain,
        legal_selections: [{
          legal_reference: legalReference,
          legal_article_id: null
        }]
      }];

      const subjects = [];
      const subjectDetails = [];
      for (let s = 1; s <= scenario.subjectCount; s += 1) {
        const subName = `Đối tượng giả lập ${label}-${s}`;
        subjects.push(subName);
        subjectDetails.push({
          name: subName,
          gender: s % 2 === 0 ? 'FEMALE' : 'MALE',
          birth_year: 1982 + ((u * 3 + s * 5) % 20),
          birth_month: ((u + s) % 12) + 1,
          birth_day: ((u + s * 3) % 27) + 1,
          identity_number: `0750${String(1980 + u).slice(-2)}${String(100000 + u * 100 + s)}`,
          permanent_province: 'Thành phố Đồng Nai',
          permanent_ward: unit.unit_name,
          permanent_detail: `Số nhà thử nghiệm ${s}`,
          permanent_address: `Số nhà thử nghiệm ${s}, ${unit.unit_name}, Thành phố Đồng Nai`,
          current_province: 'Thành phố Đồng Nai',
          current_ward: unit.unit_name,
          current_detail: `Nơi tạm trú mô phỏng ${s}`,
          current_address: `Nơi tạm trú mô phỏng ${s}, ${unit.unit_name}, Thành phố Đồng Nai`
        });
      }

      // Case state: on past days = VERIFIED; on today = 80% VERIFIED, 20% PENDING_REVIEW
      const isPending = isToday && (u % 5 === 0);
      const currentState = isPending ? 'PENDING_REVIEW' : 'VERIFIED';

      const summary = `${MARKER}\n` +
        `Mã hồ sơ: ${label}. Đơn vị lập: ${unit.unit_name}. Lĩnh vực: ${scenario.domain}. ` +
        `Nội dung: ${scenario.title}. Đối tượng liên quan: ${scenario.subjectCount} người. ` +
        `Ước tính thiệt hại: ${scenario.damage.toLocaleString('vi-VN')} VNĐ.`;

      const title = `${art ? art.title : scenario.title} (${unit.unit_name})`;

      const referenceInfo = {
        nature: scenario.nature,
        details: `${MARKER}\n${label}: Vào hồi ${hour}h${minute} ngày ${day}, ` +
          `${unit.unit_name} tiếp nhận nguồn tin về vụ việc ${scenario.title.toLowerCase()}. ` +
          `Tổ công tác nhanh chóng có mặt bảo vệ hiện trường, lấy lời khai và củng cố hồ sơ.`,
        victims: [],
        ended_at: null,
        evidence: `${scenario.evidence}. Mã đối soát ${label}.`,
        subjects,
        vehicles: [`BS-60B1-${String(10000 + (u * 13) % 90000)}`],
        workflow: 'Tiếp nhận tin báo → Phân công cán bộ xác minh → Lập hồ sơ xử lý (mô phỏng)',
        case_type: art ? `Điều ${art.article_code} — ${art.title}` : scenario.domain,
        case_types: art ? [{
          key: `reference:${art.reference_id}`,
          label: `Điều ${art.article_code} — ${art.title}`
        }] : [],
        entered_at: createdAt,
        death_count: scenario.death,
        recorded_at: occurredAt,
        creator_unit: unit.unit_name,
        case_type_key: art ? `reference:${art.reference_id}` : null,
        injured_count: scenario.injured,
        category_group: 'Báo cáo vụ việc trong ngày',
        schema_version: 1,
        handling_result: scenario.handlingForm,
        incident_status: 'Giải quyết tin báo tố giác tội phạm',
        property_damage: scenario.damage,
        subject_details: subjectDetails,
        handling_unit_id: Number(unit.unit_id),
        related_vehicles: ['01 phương tiện mô hình phục vụ điều tra'],
        subordinate_unit_id: null
      };

      // 1. Insert into daily_report_cases
      await client.query(`
        insert into daily_report_cases (
          id, stable_code, unit_id, business_code, category_code, occurred_at,
          report_day, location_general, summary, current_state, version,
          counted_as_pphs, duplicate_state, created_by, created_at, updated_at,
          title, location_address, external_reference, persons, legal_article_id,
          legal_reference, classifications, reference_info
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, 1,
          false, 'UNRESOLVED', $11, $12, $12,
          $13, $14::jsonb, '', '[]'::jsonb, null,
          $15::jsonb, $16::jsonb, $17::jsonb
        )
      `, [
        caseId, stableCode, unit.unit_id, scenario.domain,
        art ? `Điều ${art.article_code} — ${art.title}` : scenario.domain,
        occurredAt, day, locationGeneral, summary, currentState,
        unit.user_id, createdAt, title, JSON.stringify(locationAddress),
        legalReference ? JSON.stringify(legalReference) : null,
        JSON.stringify(classifications), JSON.stringify(referenceInfo)
      ]);

      // 2. Insert into daily_report_case_events
      const eventId = randomUUID();
      await client.query(`
        insert into daily_report_case_events (
          id, case_id, report_day, event_kind, narrative,
          source_user_id, late_flag, state, created_at
        ) values (
          $1, $2, $3, 'INITIAL_REPORT', $4,
          $5, false, $6, $7
        )
      `, [eventId, caseId, day, summary, unit.user_id, currentState, createdAt]);

      // 3. Insert into daily_report_submissions
      const submissionId = randomUUID();
      const snapshot = {
        id: caseId,
        title,
        persons: [],
        summary,
        unit_id: String(unit.unit_id),
        version: 1,
        created_at: createdAt,
        created_by: String(unit.user_id),
        report_day: day,
        updated_at: createdAt,
        attachments: [],
        occurred_at: occurredAt,
        stable_code: stableCode,
        business_code: scenario.domain,
        category_code: art ? `Điều ${art.article_code} — ${art.title}` : scenario.domain,
        current_state: currentState,
        reference_info: referenceInfo,
        classifications,
        counted_as_pphs: false,
        duplicate_state: 'UNRESOLVED',
        legal_reference: legalReference,
        legal_article_id: null,
        location_address: locationAddress,
        location_general: locationGeneral,
        external_reference: ''
      };
      const snapshotSha256 = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');

      await client.query(`
        insert into daily_report_submissions (
          id, case_id, unit_id, report_day, version,
          state, snapshot, snapshot_sha256, late_flag, created_by, created_at
        ) values (
          $1, $2, $3, $4, 1,
          $5, $6::jsonb, $7, false, $8, $9
        )
      `, [
        submissionId, caseId, unit.unit_id, day,
        currentState, JSON.stringify(snapshot), snapshotSha256, unit.user_id, createdAt
      ]);

      totalInserted += 1;
    }
  }

  return { totalInserted, totalSkipped };
}
