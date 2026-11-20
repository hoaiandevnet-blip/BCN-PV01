import { validateMetric } from './configuration.js';
import { validateAdministrativeDomains, validatePrimitiveWeaponTypes, validateWorkDomain } from './intake/validation.js';
import { addDomainTotals } from './intake/statistics.js';
import { assertMetricPermission, PETITION_CODES } from './rules.js';
import { randomUUID } from 'node:crypto';
import { entryActor } from './role-policy.js';
import { registerAuditRoutes } from './audit-routes.js';
import { listAttachments, sealAttachments } from './attachments.js';

export function registerWorkspaceRoutes(app, services) {
  const { base, pool, wrap, requireRole, fail, audit, transaction,
    reportingScope, canAccessUnit, hasRole, cleanText, dateKey, clock, requireDay } = services;
  app.get(`${base}/statistics/rules`, requireRole('PV01_COMPILER'), wrap(async (_req, res) => {
    const { rows } = await pool.query(`select * from daily_report_statistic_rules order by created_at desc`);
    res.json({ rules: rows });
  }));
  app.post(`${base}/statistics/rules`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const { rows } = await pool.query(`insert into daily_report_statistic_rules
      (id,title,criteria,effective_from,approved_by) values ($1,$2,$3,$4,$5) returning *`,
    [randomUUID(), cleanText(req.body.title, 200, 'Tên quy tắc', true),
      cleanText(req.body.criteria, 5000, 'Tiêu chí đã được phê duyệt', true),
      requireDay(req.body.effective_from), req.dailyActor.id]);
    await audit(pool, req, 'STATISTIC_RULE_APPROVED', 'STATISTIC_RULE', rows[0].id);
    res.status(201).json({ rule: rows[0] });
  }));
  app.post(`${base}/cases/:id/counting`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    await transaction(async client => {
      const { rows: [item] } = await client.query(`select * from daily_report_cases where id=$1 for update`,
        [req.params.id]);
      if (!item || !canAccessUnit(req.dailyActor, item.unit_id)) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
      if (item.current_state !== 'VERIFIED'
        || ['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].includes(item.duplicate_state)) {
        fail(409, 'COUNT_NOT_ELIGIBLE', 'Hồ sơ chưa đủ điều kiện thống kê.');
      }
      const reason = cleanText(req.body.reason, 3000, 'Căn cứ thống kê', true);
      const { rows: [rule] } = await client.query(`select id from daily_report_statistic_rules
        where id=$1 and effective_from <= $2`, [req.body.rule_id, requireDay(req.body.report_day)]);
      if (!rule) fail(422, 'STATISTIC_RULE_REQUIRED', 'Chọn quy tắc có hiệu lực đã được phê duyệt.');
      const result = await client.query(`insert into daily_report_count_records
        (case_id,report_day,rule_id,reason,actor_id) values ($1,$2,$3,$4,$5)
        on conflict (case_id) do nothing returning case_id`,
      [item.id, req.body.report_day, rule.id, reason, req.dailyActor.id]);
      if (!result.rowCount) fail(409, 'CASE_ALREADY_COUNTED', 'Vụ đã được ghi nhận thống kê; không cộng lại.');
      await client.query(`update daily_report_cases set counted_as_pphs=true where id=$1`, [item.id]);
      await audit(client, req, 'PPHS_COUNT_CONFIRMED', 'CASE', item.id, 'ALLOW', { rule_id: rule.id });
    });
    res.json({ ok: true });
  }));
  app.get(`${base}/statistics`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const { rows } = await pool.query(`select c.id,c.unit_id,c.report_day,c.current_state,c.duplicate_state,
      r.report_day as counted_day from daily_report_cases c
      left join daily_report_count_records r on r.case_id=c.id
      where c.report_day=$1 or r.report_day=$1`, [requireDay(req.query.report_day)]);
    const allowed = rows.filter(item => canAccessUnit(req.dailyActor, item.unit_id)
      && (!req.query.unit_id || String(item.unit_id) === String(req.query.unit_id)));
    const { rows: metrics } = await pool.query(`select unit_id,metric_code,metric_version,metric_values,work_domain,
      administrative_domains
      from daily_report_metrics where report_day=$1 and state='VERIFIED'`, [req.query.report_day]);
    const totals = Object.create(null);
    const domains = Object.create(null);
    for (const item of metrics.filter(value => canAccessUnit(req.dailyActor, value.unit_id)
      && (!req.query.unit_id || String(value.unit_id) === String(req.query.unit_id)))) {
      const key = `${item.metric_code}:v${item.metric_version}`;
      addDomainTotals(domains, item);
      totals[key] ||= Object.create(null);
      for (const [field, value] of Object.entries(item.metric_values)) {
        totals[key][field] = (totals[key][field] || 0) + value;
      }
    }
    res.json({ statistics: {
      recorded: allowed.filter(item => dateKey(item.report_day) === req.query.report_day).length,
      verified: allowed.filter(item => item.current_state === 'VERIFIED').length,
      pphs_first_count: allowed.filter(item => item.counted_day && dateKey(item.counted_day) === req.query.report_day
        && !['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].includes(item.duplicate_state)).length,
      duplicate_excluded: allowed.filter(item => item.duplicate_state === 'DUPLICATE_NO_RECOUNT').length,
      verified_metrics: totals,
      verified_metrics_by_domain: domains
    } });
  }));
  for (const [resource, table, kind] of [
    ['work-results', 'daily_report_metrics', 'WORK_RESULT'],
    ['situations', 'daily_report_situations', 'SITUATION']
  ]) {
    const load = async (client, user, id) => {
      const { rows: [source] } = await client.query(`select * from ${table} where id=$1 for update`, [id]);
      if (!source || !canAccessUnit(user, source.unit_id)) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu.');
      return source;
    };
    const remember = async (client, req, source, action) => {
      const attachments = action === 'SOURCE_SUBMITTED'
        ? await sealAttachments(client, resource, source.id)
        : await listAttachments(client, resource, source.id);
      await client.query(`insert into daily_report_source_history
        (source_type,source_id,version,action,snapshot,actor_id) values ($1,$2,$3,$4,$5::jsonb,$6)`,
      [kind, source.id, source.version, action, JSON.stringify({ ...source, attachments }), req.dailyActor.id]);
      await audit(client, req, action, kind, source.id);
    };
    for (const action of ['submit', 'verify']) {
      app.post(`${base}/${resource}/:id/${action}`, wrap(async (req, res) => {
        const source = await transaction(async client => {
          const item = await load(client, req.dailyActor, req.params.id);
          const role = action === 'submit' ? 'UNIT_REPORTER' : 'PV01_COMPILER';
          if (!hasRole(req.dailyActor, role, item.unit_id)) fail(403, 'ROLE_FORBIDDEN', 'Không đủ quyền.');
          const eligible = action === 'submit' ? ['DRAFT', 'RETURNED'] : ['PENDING_REVIEW'];
          if (!eligible.includes(item.state)) fail(409, 'STATE_CONFLICT', 'Trạng thái nguồn không phù hợp.');
          if (action === 'submit') {
            await reportingScope(req.dailyActor, item.unit_id, dateKey(item.report_day), kind, item.id, clock(), client);
          }
          await remember(client, req, item, action === 'submit' ? 'SOURCE_SUBMITTED' : 'SOURCE_VERIFIED');
          const result = await client.query(`update ${table} set state=$2,version=version+1,updated_at=now()
            where id=$1 returning *`, [item.id, action === 'submit' ? 'PENDING_REVIEW' : 'VERIFIED']);
          return result.rows[0];
        });
        res.json({ [kind === 'WORK_RESULT' ? 'metric' : 'situation']: source, state: source.state });
      }));
    }
    app.patch(`${base}/${resource}/:id`, wrap(async (req, res) => {
      const source = await transaction(async client => {
        const item = await load(client, req.dailyActor, req.params.id);
        if (!hasRole(req.dailyActor, 'UNIT_REPORTER', item.unit_id)) fail(403, 'ROLE_FORBIDDEN', 'Không đủ quyền sửa.');
        if (!['DRAFT', 'RETURNED'].includes(item.state)) fail(409, 'STATE_CONFLICT', 'Nguồn không còn ở bản nháp.');
        if (Number(req.body.version) !== item.version) fail(409, 'STALE_VERSION', 'Nguồn đã thay đổi.');
        await reportingScope(req.dailyActor, item.unit_id, dateKey(item.report_day), kind, item.id, clock(), client);
        await remember(client, req, item, 'SOURCE_EDITED');
        let update;
        if (kind === 'WORK_RESULT') {
          const editor = await entryActor({ dailyActor: req.dailyActor, body: { unit_id: item.unit_id } }, client, fail);
          assertMetricPermission(item.metric_code, editor.unitGroup,
            editor.is_admin ? [item.metric_code] : editor.roles.filter(role => String(role.unit_id) === String(item.unit_id))
              .map(role => role.metric_code).filter(Boolean));
          const values = req.body.values;
          const workDomain = item.metric_code === 'DAILY_POLICE_WORK' && Object.hasOwn(req.body, 'work_domain')
            ? validateWorkDomain(req.body.work_domain, fail, true) : item.work_domain;
          await validateMetric(client, editor, item.metric_code, dateKey(item.report_day),
            values, fail, item.definition_id, workDomain);
          if (!values || Array.isArray(values) || typeof values !== 'object'
            || Object.values(values).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
            fail(422, 'INVALID_METRIC_VALUES', 'Chỉ tiêu phải là số không âm.');
          }
          const hasTypes = Object.hasOwn(req.body, 'primitive_weapon_types');
          const hasLegacyType = Object.hasOwn(req.body, 'primitive_weapon_type');
          const unchangedLegacyType = !hasTypes && hasLegacyType && typeof req.body.primitive_weapon_type === 'string'
            && req.body.primitive_weapon_type.trim() === item.primitive_weapon_type;
          const changesWeaponTypes = item.metric_code === 'DAILY_POLICE_WORK'
            && (hasTypes || (hasLegacyType && !unchangedLegacyType));
          const weaponTypes = changesWeaponTypes
            ? validatePrimitiveWeaponTypes(req.body.primitive_weapon_types, req.body.primitive_weapon_type, fail)
            : item.primitive_weapon_types;
          const weaponType = changesWeaponTypes ? weaponTypes.join(', ') : item.primitive_weapon_type;
          const administrativeDomains = item.metric_code === 'DAILY_POLICE_WORK'
            && Object.hasOwn(req.body, 'administrative_domains')
            ? req.body.administrative_domains : item.administrative_domains;
          if (administrativeDomains?.length) {
            validateAdministrativeDomains(administrativeDomains, values, workDomain, fail);
          } else if (Object.hasOwn(req.body, 'administrative_domains')) {
            fail(422, 'INVALID_ADMINISTRATIVE_DOMAINS', 'Phải giữ ít nhất một lĩnh vực.');
          }
          update = await client.query(`update ${table} set metric_values=$2::jsonb,version=version+1,
            updated_at=now(),primitive_weapon_type=$3,primitive_weapon_types=$4::jsonb,work_domain=$5,
            administrative_domains=$6::jsonb
            where id=$1 returning *`,
          [item.id, JSON.stringify(values), weaponType, JSON.stringify(weaponTypes), workDomain,
            JSON.stringify(administrativeDomains || [])]);
        } else {
          const codes = req.body.category_codes || item.category_codes;
          const allowedCodes = item.category_codes.includes('NORMAL_DAY') ? ['NORMAL_DAY'] : PETITION_CODES;
          if (!Array.isArray(codes) || !codes.length || codes.some(code => !allowedCodes.includes(code))) {
            fail(422, 'INVALID_SITUATION_CATEGORY', 'Nhãn tình hình không hợp lệ.');
          }
          update = await client.query(`update ${table} set narrative=$2,version=version+1,
            updated_at=now(),category_codes=$3::jsonb where id=$1 returning *`,
          [item.id, cleanText(req.body.narrative, 8000, 'Nội dung', true), JSON.stringify([...new Set(codes)])]);
        }
        return update.rows[0];
      });
      res.json({ source });
    }));
    app.post(`${base}/${resource}/:id/return`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
      const reason = cleanText(req.body.reason, 3000, 'Lý do trả lại', true);
      const source = await transaction(async client => {
        const item = await load(client, req.dailyActor, req.params.id);
        if (item.state !== 'PENDING_REVIEW') fail(409, 'STATE_CONFLICT', 'Nguồn không chờ rà soát.');
        await remember(client, req, item, 'SOURCE_RETURNED');
        const update = await client.query(`update ${table} set state='RETURNED',review_reason=$2,
          version=version+1,updated_at=now() where id=$1 returning *`, [item.id, reason]);
        await client.query(`insert into daily_report_outbox
          (event_key,event_type,recipient_unit_id,resource_type,resource_id)
          values ($1,'SOURCE_RETURNED',$2,$3,$4) on conflict (event_key) do nothing`,
        [`SOURCE_RETURNED:${item.id}:${item.version}`, item.unit_id, kind, item.id]);
        return update.rows[0];
      });
      res.json({ source });
    }));
    app.get(`${base}/${resource}/:id/history`, wrap(async (req, res) => {
      await load(pool, req.dailyActor, req.params.id);
      const { rows } = await pool.query(`select version,action,created_at,actor_id,snapshot from daily_report_source_history
        where source_type=$1 and source_id=$2 order by id`, [kind, req.params.id]);
      res.json({ history: rows });
    }));
  }
  registerAuditRoutes(app, services);
}
