import { createHash, randomUUID } from 'node:crypto';
import { entryActor } from '../role-policy.js';
import { isBeforeCutoff, reportDay } from '../rules.js';
import { prepareAttachments, storeAttachments, sealAttachments } from '../attachments.js';
import { intakeSchema, validateIntake, validatePrimitiveWeaponTypes, validateWorkDomain } from './validation.js';

export async function ensureIntakeSchema(pool) {
  await pool.query("alter table daily_report_metrics add column if not exists primitive_weapon_type text not null default ''");
  await pool.query("alter table daily_report_metrics add column if not exists primitive_weapon_types jsonb not null default '[]'::jsonb");
  await pool.query("alter table daily_report_metrics add column if not exists work_domain text not null default ''");
  await pool.query("alter table daily_report_metrics add column if not exists administrative_domains jsonb not null default '[]'::jsonb");
  await pool.query(`create table if not exists daily_report_intake_batches (
    id uuid primary key,
    unit_id bigint not null references teams(id),
    created_by bigint not null references users(id),
    payload_hash text not null,
    result jsonb not null,
    created_at timestamptz not null default now()
  )`);
}

export function intakeMetricText(values, weaponType = '', workDomain = '', administrativeDomains = []) {
  return intakeSchema.formatValues(values, weaponType, workDomain, administrativeDomains);
}

export function registerIntakeRoutes(app, services) {
  const { base, pool, wrap, fail, transaction, reportingScope, hasRole, clock, requireDay,
    requireRole, canAccessUnit, audit, dateKey, supplementPermission } = services;
  app.post(`${base}/daily-intake`, wrap(async (req, res) => {
    const user = await entryActor(req, pool, fail);
    if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Chỉ đơn vị được giao nhập báo cáo mới được gửi báo cáo ngày.');
    }
    const incidents = validateIntake(req.body || {}, fail);
    const day = requireDay(req.body.report_day || reportDay(clock()));
    const id = req.body.id || randomUUID();
    const workDomain = validateWorkDomain(req.body.work_domain, fail, Object.hasOwn(req.body, 'work_domain'));
    const fields = workDomain ? intakeSchema.entryFields : intakeSchema.fields;
    const values = Object.fromEntries(fields.filter(([key]) => Object.hasOwn(req.body.values, key))
      .map(([key]) => [key, req.body.values[key]]));
    const weaponTypes = validatePrimitiveWeaponTypes(req.body.primitive_weapon_types, req.body.primitive_weapon_type, fail);
    const weaponType = weaponTypes.join(', ');
    const files = await prepareAttachments(req.body.attachments);
    const content = { day, mode: req.body.mode, incidents, values, attachments: req.body.attachments || [] };
    if (weaponType) content.primitive_weapon_type = weaponType;
    if (weaponTypes.length > 1) content.primitive_weapon_types = weaponTypes;
    if (workDomain) content.work_domain = workDomain;
    const administrativeDomains = req.body.administrative_domains || [];
    if (administrativeDomains.length) content.administrative_domains = administrativeDomains;
    const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    const result = await transaction(async client => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [id]);
      const previous = (await client.query('select * from daily_report_intake_batches where id=$1', [id])).rows[0];
      if (previous) {
        if ((!user.is_admin && String(previous.created_by) !== String(user.id))
          || String(previous.unit_id) !== String(user.unitId)) {
          fail(403, 'UNIT_SCOPE_FORBIDDEN', 'Không có quyền sửa báo cáo của đơn vị khác.');
        }
        if (req.body.is_update || req.body.replace) {
          await supplementPermission.assertReportEdit(client, user.unitId, id, clock());
          await reportingScope(user, user.unitId, day, 'WORK_RESULT', id, clock(), client);
          if (previous.payload_hash === hash) return previous.result;
          await client.query(`insert into daily_report_source_history
            (source_type,source_id,version,action,snapshot,actor_id)
            select 'WORK_RESULT',id,version,'BEFORE_SUPPLEMENT',to_jsonb(m),$2
            from daily_report_metrics m where id=$1`, [id, user.id]);
          await client.query(`update daily_report_metrics set
            metric_values = $2::jsonb, primitive_weapon_type = $3, primitive_weapon_types = $4::jsonb,
            work_domain = $5, administrative_domains = $6::jsonb, state='PENDING_REVIEW',version=version+1
            where id = $1`, [id, JSON.stringify(values), weaponType, JSON.stringify(weaponTypes),
            workDomain, JSON.stringify(administrativeDomains)]);
          if (req.body.mode === 'NORMAL') {
            await client.query(`update daily_report_situations set narrative = $2
              where unit_id = $1 and report_day = $3`,
              [user.unitId, req.body.situation_narrative || 'Tình hình trong ngày bình thường', day]);
          }
          await storeAttachments(client, 'work-results', id, user.id, files);
          await sealAttachments(client, 'work-results', id);
          await client.query(`insert into daily_report_source_history
            (source_type,source_id,version,action,snapshot,actor_id)
            select 'WORK_RESULT',id,version,'SOURCE_SUBMITTED',to_jsonb(m),$2
            from daily_report_metrics m where id=$1`, [id, user.id]);
          await audit(client, req, 'SOURCE_SUBMITTED', 'WORK_RESULT', id);
          const response = { ...previous.result, id, state: 'PENDING_REVIEW', updated: true };
          await client.query(`update daily_report_intake_batches set payload_hash = $2, result = $3::jsonb where id = $1`,
            [id, hash, JSON.stringify(response)]);
          return response;
        }
        if (String(previous.created_by) !== String(user.id) || String(previous.unit_id) !== String(user.unitId)
          || previous.payload_hash !== hash) {
          fail(409, 'INTAKE_CONFLICT', 'Mã báo cáo đã được sử dụng cho nội dung khác. Hãy tải lại kết quả đã gửi.');
        }
        return previous.result;
      }
      const now = clock();
      const late = !isBeforeCutoff(now) || day !== reportDay(now);
      await reportingScope(user, user.unitId, day, 'WORK_RESULT', id, now, client);
      const caseIds = [];
      const situationId = req.body.mode === 'NORMAL' ? randomUUID() : null;
      if (situationId) {
        // The batch ID is stable before submission and can be used in an unlock request.
        await reportingScope(user, user.unitId, day, 'SITUATION', id, clock(), client);
        const situationNarrative = req.body.situation_narrative
          || 'Tình hình ngày bình thường, không phát sinh vụ việc.';
        await client.query(`insert into daily_report_situations
          (id,unit_id,report_day,category_codes,narrative,state,created_by)
          values($1,$2,$3,'["NORMAL_DAY"]',$4,
            'PENDING_REVIEW',$5)`, [situationId, user.unitId, day, situationNarrative, user.id]);
        await audit(client, req, 'SOURCE_SUBMITTED', 'SITUATION', situationId);
      }
      for (const incident of incidents) {
        await reportingScope(user, user.unitId, day, 'CASE', id, clock(), client);
        const caseId = randomUUID();
        const stableCode = `BCN-${day.replaceAll('-', '')}-${caseId}`;
        const narrative = `${incident.label}\n${incident.narrative}`;
        const classifications = [{ business_code: incident.business, legal_selections: [] }];
        const inserted = await client.query(`insert into daily_report_cases
          (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,
            created_by,classifications)
          values($1,$2,$3,$4,$5,$6,$7,'PENDING_REVIEW',$8,$9::jsonb) returning *`,
        [caseId, stableCode, user.unitId, incident.business, incident.code, day,
          narrative, user.id, JSON.stringify(classifications)]);
        await client.query(`insert into daily_report_case_events
          (id,case_id,report_day,event_kind,narrative,source_user_id,late_flag,state)
          values($1,$2,$3,'INITIAL_REPORT',$4,$5,$6,'PENDING_REVIEW')`,
        [randomUUID(), caseId, day, narrative, user.id, late]);
        const snapshot = { ...inserted.rows[0], report_day: day, attachments: [] };
        const checksum = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
        await client.query(`insert into daily_report_submissions
          (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,late_flag,created_by)
          values($1,$2,$3,$4,1,'SUBMITTED',$5::jsonb,$6,$7,$8)`,
        [randomUUID(), caseId, user.unitId, day, JSON.stringify(snapshot), checksum, late, user.id]);
        await audit(client, req, 'CASE_SUBMITTED', 'CASE', caseId);
        await client.query(`insert into daily_report_outbox
          (event_key,event_type,recipient_user_id,resource_type,resource_id,safe_payload)
          select $1 || ':' || user_id,'CASE_SUBMITTED',user_id,'CASE',$2,$3::jsonb
          from daily_report_user_roles where role_code='PV01_COMPILER'
            and (unit_id is null or unit_id=$4) on conflict (event_key) do nothing`,
        [caseId, caseId, JSON.stringify({ stable_code: stableCode, report_day: day }), user.unitId]);
        caseIds.push(caseId);
      }
      await client.query(`insert into daily_report_metrics
        (id,unit_id,report_day,metric_code,metric_values,state,created_by,late_flag,
          primitive_weapon_type,primitive_weapon_types,work_domain,administrative_domains)
        values($1,$2,$3,$4,$5::jsonb,'PENDING_REVIEW',$6,$7,$8,$9::jsonb,$10,$11::jsonb)`,
      [id, user.unitId, day, intakeSchema.metricCode, JSON.stringify(values), user.id, late,
        weaponType, JSON.stringify(weaponTypes), workDomain, JSON.stringify(administrativeDomains)]);
      await storeAttachments(client, 'work-results', id, user.id, files);
      await sealAttachments(client, 'work-results', id);
      await client.query(`insert into daily_report_source_history
        (source_type,source_id,version,action,snapshot,actor_id)
        select 'WORK_RESULT',id,version,'SOURCE_SUBMITTED',to_jsonb(m),$2
        from daily_report_metrics m where id=$1`, [id, user.id]);
      if (situationId) {
        await client.query(`insert into daily_report_source_history
          (source_type,source_id,version,action,snapshot,actor_id)
          select 'SITUATION',id,version,'SOURCE_SUBMITTED',to_jsonb(s),$2
          from daily_report_situations s where id=$1`, [situationId, user.id]);
      }
      await audit(client, req, 'SOURCE_SUBMITTED', 'WORK_RESULT', id);
      const response = { id, case_ids: caseIds, situation_id: situationId, state: 'PENDING_REVIEW' };
      await client.query(`insert into daily_report_intake_batches(id,unit_id,created_by,payload_hash,result)
        values($1,$2,$3,$4,$5::jsonb)`, [id, user.unitId, user.id, hash, JSON.stringify(response)]);
      return response;
    });
    res.status(201).json(result);
  }));

  app.get(`${base}/daily-intake/latest`, requireRole('UNIT_REPORTER', 'PV01_COMPILER', 'BCN_ADMIN'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const day = requireDay(req.query.report_day || reportDay(clock()));
    const unitId = req.query.unit_id ? Number(req.query.unit_id) : user.unitId;
    if (!unitId || !canAccessUnit(user, unitId)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu.');
    }
    const { rows: metrics } = await pool.query(`
      select id, unit_id, report_day, metric_code, metric_values, state, created_by,
        created_at, primitive_weapon_type, primitive_weapon_types, work_domain, administrative_domains
      from daily_report_metrics
      where unit_id = $1 and report_day = $2
      order by created_at desc limit 1
    `, [unitId, day]);
    if (!metrics.length) return res.json({ submitted: false });
    const metric = metrics[0];
    const { rows: situations } = await pool.query(`
      select id, narrative, state, created_at
      from daily_report_situations
      where unit_id = $1 and report_day = $2
      order by created_at desc limit 1
    `, [unitId, day]);
    const { rows: cases } = await pool.query(`
      select id, stable_code, business_code, category_code, title, summary, current_state, created_at, reference_info
      from daily_report_cases
      where unit_id = $1 and report_day = $2
      order by created_at desc
    `, [unitId, day]);
    res.json({
      submitted: true,
      data: {
        id: metric.id,
        unit_id: metric.unit_id,
        report_day: metric.report_day,
        metric_values: metric.metric_values,
        work_domain: metric.work_domain,
        administrative_domains: metric.administrative_domains,
        primitive_weapon_type: metric.primitive_weapon_type,
        primitive_weapon_types: metric.primitive_weapon_types,
        state: metric.state,
        created_at: metric.created_at,
        situation: situations[0] || null,
        cases: cases || []
      }
    });
  }));

  app.delete(`${base}/daily-intake/:id`, requireRole('UNIT_REPORTER', 'BCN_ADMIN'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const id = req.params.id;
    await transaction(async client => {
      const { rows } = await client.query('select * from daily_report_metrics where id = $1', [id]);
      if (!rows.length) {
        await client.query('delete from daily_report_intake_batches where id = $1', [id]);
        return;
      }
      const metric = rows[0];
      if (!user.is_admin && Number(user.unitId) !== Number(metric.unit_id)) {
        fail(403, 'FORBIDDEN', 'Không có quyền xóa báo cáo của đơn vị khác.');
      }
      await reportingScope(user, metric.unit_id, dateKey(metric.report_day), 'WORK_RESULT', id, clock(), client);
      await client.query('delete from daily_report_situations where unit_id = $1 and report_day = $2',
        [metric.unit_id, metric.report_day]);
      await client.query('delete from daily_report_metrics where id = $1', [id]);
      await client.query('delete from daily_report_intake_batches where id = $1', [id]);
      await audit(client, req, 'SOURCE_DELETED', 'WORK_RESULT', id);
    });
    res.json({ ok: true, message: 'Đã xóa báo cáo ngày.' });
  }));
}
