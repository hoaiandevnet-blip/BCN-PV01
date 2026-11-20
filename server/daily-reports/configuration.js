import { randomUUID } from 'node:crypto';
import { assertMetricPermission } from './rules.js';
import { intakeSchema, validateIntake } from './intake/validation.js';

export async function ensureConfigurationSchema(pool) {
  await pool.query(`create table if not exists daily_report_unit_profiles (
    unit_id bigint primary key references teams(id), unit_group text not null
      check(unit_group in ('XA_PHUONG','PHONG','DON','CANG')),
    unit_code text not null unique, updated_by bigint not null references users(id),
    updated_at timestamptz not null default now()
  );
  create table if not exists daily_report_metric_definitions (
    id uuid primary key, code text not null, version integer not null, label text not null,
    owner_groups jsonb not null, fields jsonb not null, constraints jsonb not null default '[]',
    effective_from date not null, effective_to date, status text not null default 'DRAFT',
    created_by bigint not null references users(id), published_by bigint references users(id),
    created_at timestamptz not null default now(), unique(code,version)
  );
  alter table daily_report_metrics add column if not exists definition_id uuid
    references daily_report_metric_definitions(id);
  `);
}

export async function validateMetric(client, user, code, day, values, fail, definitionId = null, workDomain = '') {
  const roles = user.roles.filter(role => role.role_code === 'UNIT_REPORTER'
    && String(role.unit_id) === String(user.unitId));
  if (code === intakeSchema.metricCode) {
    if (!user.is_admin && !roles.length) fail(403, 'UNIT_REPORTER_REQUIRED', 'Chưa được giao nhập báo cáo.');
    validateIntake({ mode: 'NORMAL', incidents: [], values,
      ...(workDomain ? { work_domain: workDomain } : {}) }, fail);
    return { id: null, version: 1 };
  }
  assertMetricPermission(code, user.unitGroup, user.is_admin ? [code] : roles.map(role => role.metric_code));
  const { rows: [definition] } = await client.query(`select * from daily_report_metric_definitions
    where code=$1 and status='PUBLISHED' and effective_from <= $2
      and (effective_to is null or effective_to >= $2) and ($3::uuid is null or id=$3)
    order by version desc limit 1`, [code, day, definitionId]);
  if (!definition) fail(422, 'METRIC_NOT_CONFIGURED', 'Chưa có định nghĩa chỉ tiêu được công bố cho ngày này.');
  if (!definition.owner_groups.includes(user.unitGroup)
    || (!user.is_admin && !roles.some(role => role.metric_code === code))) {
    fail(403, 'METRIC_NOT_ASSIGNED', 'Chỉ tiêu chưa được giao cho tài khoản/nhóm đơn vị.');
  }
  if (!values || Array.isArray(values) || typeof values !== 'object'
    || Object.keys(values).some(key => !definition.fields.some(field => field.code === key))) {
    fail(422, 'INVALID_METRIC_VALUES', 'Có trường chỉ tiêu chưa được định nghĩa.');
  }
  for (const field of definition.fields) {
    if (!Number.isSafeInteger(values[field.code]) || values[field.code] < 0) {
      fail(422, 'INVALID_METRIC_VALUES', `${field.label}: phải là số nguyên không âm.`);
    }
  }
  for (const rule of definition.constraints) {
    const sum = rule.parts.reduce((total, field) => total + values[field], 0);
    if ((rule.operator === 'EQ' && values[rule.total] !== sum)
      || (rule.operator === 'GTE' && values[rule.total] < sum)) {
      fail(422, 'METRIC_TOTAL_MISMATCH', rule.message || 'Tổng chỉ tiêu không khớp các thành phần.');
    }
  }
  return definition;
}

export function registerConfigurationRoutes(app, services) {
  const { base, pool, wrap, requireRole, fail, cleanText, requireDay, transaction, audit } = services;
  app.get(`${base}/configuration`, requireRole('BCN_ADMIN'), wrap(async (_req, res) => {
    const [units, definitions] = await Promise.all([
      pool.query(`select t.id,t.name,p.unit_group,p.unit_code from teams t
        left join daily_report_unit_profiles p on p.unit_id=t.id order by t.name`),
      pool.query(`select * from daily_report_metric_definitions order by code,version desc`)
    ]);
    res.json({ units: units.rows, definitions: definitions.rows });
  }));
  app.put(`${base}/configuration/units/:id`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const group = req.body.unit_group;
    if (!['XA_PHUONG', 'PHONG', 'DON', 'CANG'].includes(group)) fail(422, 'INVALID_UNIT_GROUP', 'Nhóm đơn vị không hợp lệ.');
    await transaction(async client => {
      await client.query(`insert into daily_report_unit_profiles(unit_id,unit_group,unit_code,updated_by)
        values($1,$2,$3,$4) on conflict(unit_id) do update set unit_group=excluded.unit_group,
        unit_code=excluded.unit_code,updated_by=excluded.updated_by,updated_at=now()`,
      [req.params.id, group, cleanText(req.body.unit_code, 80, 'Mã đơn vị', true), req.dailyActor.id]);
      await audit(client, req, 'UNIT_PROFILE_UPDATED', 'UNIT', req.params.id, 'ALLOW', { group });
    });
    res.json({ ok: true });
  }));
  app.post(`${base}/configuration/metrics`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const body = req.body;
    const code = cleanText(body.code, 80, 'Mã chỉ tiêu', true);
    const groups = body.owner_groups;
    if (!/^[A-Z][A-Z0-9_]*$/.test(code) || !Array.isArray(groups) || !groups.length
      || groups.some(group => !['XA_PHUONG', 'PHONG', 'DON', 'CANG'].includes(group))) {
      fail(422, 'INVALID_DEFINITION', 'Mã hoặc nhóm đơn vị không hợp lệ.');
    }
    const fields = body.fields;
    if (!Array.isArray(fields) || !fields.length || fields.length > 100
      || fields.some(field => !/^[a-z][a-z0-9_]{0,79}$/.test(field.code) || !field.label)
      || new Set(fields.map(field => field.code)).size !== fields.length) {
      fail(422, 'INVALID_FIELDS', 'Định nghĩa trường chỉ tiêu không hợp lệ.');
    }
    const constraints = body.constraints || [];
    if (!Array.isArray(constraints) || constraints.some(rule => !['EQ', 'GTE'].includes(rule.operator)
      || !Array.isArray(rule.parts) || !rule.parts.length
      || [...rule.parts, rule.total].some(key => !fields.some(field => field.code === key)))) {
      fail(422, 'INVALID_CONSTRAINT', 'Quy tắc đối chiếu tổng không hợp lệ.');
    }
    const effectiveFrom = requireDay(body.effective_from);
    const effectiveTo = body.effective_to ? requireDay(body.effective_to) : null;
    if (effectiveTo && effectiveTo < effectiveFrom) fail(422, 'INVALID_EFFECTIVE_RANGE', 'Khoảng hiệu lực không hợp lệ.');
    const definition = await transaction(async client => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`bcn-metric:${code}`]);
      const result = await client.query(`insert into daily_report_metric_definitions
        (id,code,version,label,owner_groups,fields,constraints,effective_from,effective_to,created_by)
        select $1,$2,coalesce(max(version),0)+1,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9
        from daily_report_metric_definitions where code=$2 returning *`,
      [randomUUID(), code, cleanText(body.label, 200, 'Tên chỉ tiêu', true), JSON.stringify(groups),
        JSON.stringify(fields.map(field => ({ code: field.code, label: cleanText(field.label, 200, 'Tên trường', true) }))),
        JSON.stringify(constraints), effectiveFrom, effectiveTo, req.dailyActor.id]);
      await audit(client, req, 'METRIC_DEFINITION_DRAFTED', 'METRIC_DEFINITION', result.rows[0].id);
      return result.rows[0];
    });
    res.status(201).json({ definition });
  }));
  app.post(`${base}/configuration/metrics/:id/publish`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    await transaction(async client => {
      const result = await client.query(`update daily_report_metric_definitions set status='PUBLISHED',published_by=$2
        where id=$1 and status='DRAFT' returning id`, [req.params.id, req.dailyActor.id]);
      if (!result.rowCount) fail(409, 'DEFINITION_STATE_CONFLICT', 'Định nghĩa không còn là bản nháp.');
      await audit(client, req, 'METRIC_DEFINITION_PUBLISHED', 'METRIC_DEFINITION', req.params.id);
    });
    res.json({ ok: true });
  }));
}
