import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { entryActor } from '../role-policy.js';
import { isBeforeCutoff, reportDay } from '../rules.js';
import { prepareAttachments, storeAttachments, listAttachments } from '../attachments.js';
import { validateReferenceCase, referenceNarrative, assertHandlingRequirements, INCIDENT_STATUSES } from './validation.js';
import { referenceCaseLegal } from './legal.js';

export async function ensureReferenceCaseSchema(pool) {
  await pool.query('alter table daily_report_cases add column if not exists reference_info jsonb');
}

export function registerReferenceCaseRoutes(app, services) {
  const { base, pool, wrap, fail, cleanText, requireDay, requireRole, transaction, audit,
    hasRole, canAccessUnit, reportingScope, caseSubmission, dateKey, clock } = services;
  app.get(`${base}/reference-case-options`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const { rows: units } = await pool.query('select id,name from teams order by name');
    const { rows } = await pool.query(`select unit_id,reference_info from daily_report_cases
      where reference_info is not null order by created_at desc limit 500`);
    const records = rows.filter(item => canAccessUnit(req.dailyActor, item.unit_id));
    const options = {};
    for (const field of ['handling_result']) {
      options[field] = [...new Set(records.map(item => item.reference_info[field]).filter(Boolean))];
    }
    res.json({ units, options, handling_details_version: 2, subject_details_version: 1 });
  }));

  async function save(req, editing) {
    const id = editing ? req.params.id : req.body.id || randomUUID();
    const validated = validateReferenceCase(req.body, { fail, cleanText, today: reportDay(clock()) });
    const files = await prepareAttachments(req.body.attachments, { allowVideo: true });
    return transaction(async client => {
      const user = await entryActor(req, client, fail);
      if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
        fail(403, 'UNIT_REPORTER_REQUIRED', 'Chưa được giao nhập báo cáo cho đơn vị.');
      }
      let previous;
      if (editing) {
        previous = (await client.query('select * from daily_report_cases where id=$1 for update', [id])).rows[0];
        if (!previous || !canAccessUnit(user, previous.unit_id) || !previous.reference_info) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
        }
        if (!hasRole(user, 'UNIT_REPORTER', previous.unit_id)) fail(403, 'ROLE_FORBIDDEN', 'Không có quyền sửa.');
        if (!['DRAFT', 'RETURNED'].includes(previous.current_state)) {
          fail(409, 'STATE_CONFLICT', 'Chỉ sửa khi hồ sơ là bản nháp hoặc được trả lại.');
        }
        if (Number(req.body.version) !== previous.version) fail(409, 'STALE_VERSION', 'Hồ sơ đã thay đổi.');
      }
      if (req.body.resubmit === true && previous?.current_state !== 'RETURNED') {
        fail(409, 'CASE_STATE_CONFLICT', 'Chỉ gửi lại hồ sơ đã được chỉ huy trả lại.');
      }
      validated.info.entered_at = previous?.reference_info?.entered_at
        || previous?.created_at?.toISOString() || clock().toISOString();
      if (!INCIDENT_STATUSES.includes(validated.info.incident_status)
        && validated.info.incident_status !== previous?.reference_info?.incident_status) {
        fail(422, 'INVALID_INCIDENT_STATUS', 'Chọn trạng thái vụ việc trong danh sách.');
      }
      if (previous) {
        for (const key of ['category_group', 'workflow', 'nature', 'vehicles', 'victims', 'handling_details',
          'related_vehicles']) {
          if (req.body.reference_info[key] === undefined && previous.reference_info[key] !== undefined) {
            validated.info[key] = previous.reference_info[key];
          }
        }
        if (req.body.location_address === undefined && req.body.location_general === undefined) {
          validated.location = { general: previous.location_general, address: previous.location_address };
        }
        if (req.body.reference_info.subordinate_unit_id === undefined) {
          validated.info.subordinate_unit_id = previous.reference_info.subordinate_unit_id || null;
        }
      }
      assertHandlingRequirements(validated.info, fail);
      const unitId = previous?.unit_id || user.unitId;
      const day = previous ? dateKey(previous.report_day) : requireDay(req.body.report_day || reportDay(clock()));
      if (previous) await caseSubmission.assertScope(client, user, previous);
      else await reportingScope(user, unitId, day, 'CASE', id, clock(), client);
      for (const key of ['handling_unit_id', 'subordinate_unit_id']) {
        if (validated.info[key] && !(await client.query('select id from teams where id=$1',
          [validated.info[key]])).rowCount) fail(422, 'INVALID_UNIT', 'Đơn vị xử lý không còn tồn tại.');
      }
      const { rows: [unit] } = await client.query('select name from teams where id=$1', [unitId]);
      validated.info.creator_unit = previous?.reference_info.creator_unit || unit.name;
      const legal = await referenceCaseLegal({ client, body: req.body, validated, previous, day, fail });
      if (validated.info.case_type) {
        const name = validated.info.case_types.map(entry => entry.label
          .replace(/^Điều\s+[^—–]+[—–]\s*/iu, '').replace(/^Tội\s+/iu, '').trim()).join('; ');
        validated.title = `${name.charAt(0).toLocaleUpperCase('vi')}${name.slice(1)} (${unit.name})`;
      }
      const selections = legal.selections;
      const classifications = [{ business_code: validated.business, legal_selections: selections }];
      const values = [id, unitId, validated.business, validated.info.case_type || validated.business,
        validated.occurred, day, validated.location.general, validated.summary, user.id,
        validated.title, JSON.stringify(validated.location.address), JSON.stringify(classifications),
        JSON.stringify(validated.info)];
      let result;
      if (editing) {
        result = await client.query(`update daily_report_cases set business_code=$2,category_code=$3,
          occurred_at=$4,location_general=$5,summary=$6,title=$7,location_address=$8::jsonb,
          classifications=$9::jsonb,reference_info=$10::jsonb,version=version+1,updated_at=now()
          where id=$1 returning *`, [id, validated.business, validated.info.case_type || validated.business,
          validated.occurred, validated.location.general, validated.summary, validated.title,
          JSON.stringify(validated.location.address), JSON.stringify(classifications), JSON.stringify(validated.info)]);
        await client.query(`update daily_report_case_events set narrative=$2,version=version+1
          where case_id=$1 and event_kind='INITIAL_REPORT'`, [id, referenceNarrative(validated)]);
      } else {
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [id]);
        const existing = (await client.query('select * from daily_report_cases where id=$1', [id])).rows[0];
        if (existing) {
          validated.info.entered_at = existing.reference_info?.entered_at || validated.info.entered_at;
          const savedFiles = await listAttachments(client, 'cases', id);
          const matchingFiles = savedFiles.length === files.length
            && savedFiles.every(saved => files.some(file => file.hash === saved.sha256 && file.name === saved.file_name));
          if (String(existing.created_by) === String(user.id) && String(existing.unit_id) === String(unitId)
            && isDeepStrictEqual(existing.reference_info, validated.info) && matchingFiles
            && existing.business_code === validated.business && existing.title === validated.title
            && existing.summary === validated.summary && dateKey(existing.report_day) === day
            && (existing.occurred_at?.toISOString() || null) === validated.occurred
            && isDeepStrictEqual(existing.location_address, validated.location.address)) return existing;
          fail(409, 'CASE_ID_CONFLICT', 'Mã vụ việc đã được sử dụng.');
        }
        result = await client.query(`insert into daily_report_cases
          (id,unit_id,business_code,category_code,occurred_at,report_day,location_general,summary,created_by,
            title,location_address,classifications,reference_info,stable_code)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14) returning *`,
        [...values, `BCN-${day.replaceAll('-', '')}-${id}`]);
        await client.query(`insert into daily_report_case_events
          (id,case_id,report_day,event_kind,narrative,source_user_id,late_flag)
          values($1,$2,$3,'INITIAL_REPORT',$4,$5,$6)`,
        [randomUUID(), id, day, referenceNarrative(validated), user.id,
          !isBeforeCutoff(clock()) || day !== reportDay(clock())]);
      }
      result = await client.query(`update daily_report_cases set legal_article_id=$2,legal_reference=$3::jsonb
        where id=$1 returning *`, [id, legal.articleId, legal.reference ? JSON.stringify(legal.reference) : null]);
      await storeAttachments(client, 'cases', id, user.id, files);
      await audit(client, req, editing ? 'CASE_UPDATED' : 'CASE_CREATED', 'CASE', id);
      if (req.body.resubmit === true) {
        await caseSubmission.submit(client, req, result.rows[0]);
        return (await client.query('select * from daily_report_cases where id=$1', [id])).rows[0];
      }
      return result.rows[0];
    });
  }
  app.post(`${base}/reference-cases`, wrap(async (req, res) => res.status(201).json({ case: await save(req, false) })));
  app.patch(`${base}/reference-cases/:id`, wrap(async (req, res) => res.json({ case: await save(req, true) })));
}
