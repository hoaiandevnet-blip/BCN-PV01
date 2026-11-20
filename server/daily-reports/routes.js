import { registerIntakeRoutes, intakeMetricText } from './intake/routes.js';
import { validateWorkDomain } from './intake/validation.js';
import { registerReferenceCaseRoutes } from './reference-case/routes.js';
import { createCaseSubmission } from './case-submission.js';
import { createSupplementPermission } from './supplement-permission.js';
import { assertArtifactScope, assertDraftScope } from './artifact-scope.js';
import { availableModules, compilerModules, restrictCompilerRequest } from './submodule-permissions.js';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { registerAttachmentRoutes } from './attachment-routes.js';
import { prepareAttachments, storeAttachments } from './attachments.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Packer } from 'docx';
import { createDailyReportDocument } from './docx.js';
import { createDailyNotificationFeed } from './notification-feed.js';
import { effectiveDailyRoles, normalizeUnitGroup, entryActor } from './role-policy.js';
import { registerRoleRoutes } from './role-routes.js';
import { pv01UnitIds } from './unit-ancestry.js';
import { registerWorkspaceRoutes } from './workspace-routes.js';
import { validateDailyReportRequest } from './validation.js';
import { registerConfigurationRoutes, validateMetric } from './configuration.js';
import { registerLegalRoutes } from './legal-routes.js';
import { resolveClassifications, primaryClassification, caseClassifications } from './classifications.js';
import { registerPresentationRoutes, validateDocumentFields } from './presentation-routes.js';
import { registerDashboardRoutes } from './dashboard/routes.js';
import { duplicateCandidates, maintainNotifications, selectionStatistics } from './registry-services.js';
import { validatePersons } from './persons.js';
import { businessCodeGroup } from './business-codes.js';
import { registerLeaderDeletionRoutes } from './leader-deletion.js';
import { resolveCaseLocation } from './location.js';
import {
  assertMetricPermission,
  assertUnlockScope,
  canAccessUnitScope,
  hasDailyReportRole,
  isBeforeCutoff,
  isValidReportDay,
  reportDay,
  unlockExpiry
} from './rules.js';

const base = '/api/bao-cao-ngay';
const types = new Set(['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB']);
const petitionCodes = new Set([
  'KHIEU_KIEN_DONG_NGUOI', 'KHIEU_KIEN_LEN_TRUNG_UONG',
  'KHIEU_KIEN_PHUC_TAP_ANTT', 'BIEU_TINH', 'PHA_ROI_ANTT', 'DINH_CONG'
]);
const scopeKinds = new Set(['CASE', 'SITUATION', 'WORK_RESULT']);
const dateKey = value => value instanceof Date
  ? [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')].join('-') : String(value).slice(0, 10);

const calendarFields = new Set(['report_day', 'effective_from', 'effective_to', 'decision_date', 'counted_day']);
function normalizeDates(value, key = '') {
  if (calendarFields.has(key) && value) return dateKey(value instanceof Date ? value
    : /^\d{4}-\d{2}-\d{2}T/.test(String(value)) ? new Date(value) : value);
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => normalizeDates(item, key));
  return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, normalizeDates(item, field)]));
}

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

function cleanText(value, limit, label, required = false) {
  const text = String(value ?? '').trim();
  if ((required && !text) || text.length > limit) fail(422, 'INVALID_FIELD', `${label} không hợp lệ.`);
  return text;
}

function caseTitle(businessCode, value, existingTitle = '') {
  if (businessCode === 'TINH_HINH_KHAC') {
    return cleanText(value ?? existingTitle, 200, 'Tên vụ việc', true);
  }
  if (value !== undefined && cleanText(value, 200, 'Tên vụ việc') !== existingTitle) {
    fail(422, 'CASE_TITLE_NOT_APPLICABLE', 'Chỉ được nhập tên vụ việc khi chọn hệ “Tình hình khác”.');
  }
  return existingTitle;
}

function requireDay(value) {
  if (!isValidReportDay(value)) fail(422, 'INVALID_REPORT_DAY', 'Ngày báo cáo không hợp lệ.');
  return value;
}

function requireOffset(value) {
  const offset = Number(value || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) fail(422, 'INVALID_OFFSET', 'Trang dữ liệu không hợp lệ.');
  return offset;
}

function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error.status) {
        res.status(error.status).json({ error: error.message, code: error.code });
      } else {
        next(error);
      }
    }
  };
}

export function registerDailyReportRoutes(app, { pool, auth, requireSameOrigin, storageRoot, clock = () => new Date(), scheduleMaintenance = true }) {
  let maintenanceRunning = false;
  async function maintenance() {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try { await maintainNotifications(pool, clock()); }
    finally { maintenanceRunning = false; }
  }
  const maintenanceTimer = scheduleMaintenance ? setInterval(() => {
    maintenance().catch(error => console.error('BCN maintenance failed; retry next tick:', error.code || 'DB_ERROR'));
  }, 30000).unref() : null;
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const fileRoot = storageRoot || process.env.DAILY_REPORT_STORAGE_ROOT || path.resolve(moduleDirectory, '../..', '.daily-report-files');

  async function actor(req) {
    const account = await auth.resolve(req);
    if (!account) fail(401, 'LOGIN_REQUIRED', 'Vui lòng đăng nhập lại.');
    const { rows } = await pool.query(`
      select t.id as unit_id, d.unit_type, d.name as department_name, t.name as unit_name,p.unit_group,p.unit_code
      from users u
      left join teams t on t.id = u.team_id
      left join departments d on d.id = t.department_id
      left join daily_report_unit_profiles p on p.unit_id=t.id
      where u.id = $1 and not u.is_deleted and u.status = 'Hoạt động'
    `, [account.id]);
    const pv01Units = await pv01UnitIds(pool, [rows[0]?.unit_id]);
    const roleRows = await pool.query(`
      select role_code, unit_id, metric_code, submodules
      from daily_report_user_roles where user_id = $1
        and (effective_from is null or effective_from <= $2)
        and (effective_to is null or effective_to >= $2)
    `, [account.id, reportDay(clock())]);
    const permissions = await pool.query(`
      select exists (
        select 1 from user_permissions up
        join permissions p on p.id = up.permission_id
        join modules m on m.id = p.module_id
        where up.user_id = $1 and m.module_key = 'dailyReports'
      ) as allowed, exists (
        select 1 from user_permissions up
        join permissions p on p.id=up.permission_id
        join modules m on m.id=p.module_id
        where up.user_id=$1 and m.module_key='dailyReportApproval'
      ) as approval_allowed, exists (
        select 1 from user_permissions up
        join permissions p on p.id=up.permission_id
        join modules m on m.id=p.module_id
        where up.user_id=$1 and m.module_key='dailyReportInput'
      ) as input_allowed
    `, [account.id]);
    return {
      ...account,
      approvalAllowed: Boolean(permissions.rows[0]?.approval_allowed),
      inputAllowed: Boolean(permissions.rows[0]?.input_allowed),
      unitId: rows[0]?.unit_id || null,
      unitName: rows[0]?.unit_name || null,
      unitGroup: rows[0]?.unit_group || normalizeUnitGroup(rows[0]?.unit_type, rows[0]?.unit_name),
      roles: effectiveDailyRoles(account,
        { ...rows[0], pv01_hierarchy: pv01Units.has(String(rows[0]?.unit_id)) }, roleRows.rows),
      moduleAllowed: Boolean(permissions.rows[0]?.allowed)
    };
  }

  function hasRole(user, role, unitId = null) {
    return hasDailyReportRole(user, role, unitId ?? user.unitId);
  }

  function canAccessUnit(user, unitId) {
    return canAccessUnitScope(user, unitId);
  }

  async function authorize(req, res, next) {
    try {
      res.set('Cache-Control', 'private, no-store');
      req.dailyActor = await actor(req);
      req.dailyRequestId = randomUUID();
      res.on('finish', () => {
        audit(pool, req, `${req.method}:${req.route?.path || 'ACCESS'}`, 'REQUEST', null,
          res.statusCode < 400 ? 'ALLOW' : 'DENY', { status: res.statusCode })
          .catch(() => console.error('BCN access audit write failed'));
      });
      const user = req.dailyActor;
      if (!user.moduleAllowed && !user.is_admin) fail(403, 'MODULE_FORBIDDEN', 'Chưa được cấp quyền Báo cáo ngày.');
      if (!user.is_admin && !user.roles.length) fail(403, 'ROLE_REQUIRED', 'Chưa được giao vai trò Báo cáo ngày.');
      next();
    } catch (error) {
      if (error.status) res.status(error.status).json({ error: error.message, code: error.code });
      else next(error);
    }
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      const user = req.dailyActor;
      const roleGrant = user.roles.some(item => roles.includes(item.role_code));
      if (user.is_admin || roleGrant) return next();
      return res.status(403).json({
        error: 'Không đủ quyền thực hiện thao tác này.',
        code: 'ROLE_FORBIDDEN'
      });
    };
  }

  async function audit(client, req, action, type, id, outcome = 'ALLOW', metadata = {}) {
    await client.query(`
      insert into daily_report_audit
        (actor_id, actor_unit_id, action, resource_type, resource_id, outcome,
          request_id, safe_metadata)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `, [req.dailyActor.id, req.dailyActor.unitId, action, type, id, outcome,
      req.dailyRequestId || null, JSON.stringify(metadata)]);
  }

  async function transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const value = await callback(client);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function reportingScope(user, unitId, reportDate, scopeKind, scopeId, now, client = pool) {
    if (!canAccessUnit(user, unitId)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu trong phạm vi được phép.');
    }
    if (!isBeforeCutoff(now) || reportDate !== reportDay(now)) {
      const { rows } = await client.query(`
        select unit_id, report_day, scope_kind, scope_id, status, approved_at, expires_at
        from daily_report_unlock_requests
        where unit_id = $1 and report_day = $2 and purpose <> 'CASE_SUPPLEMENT'
          and (purpose <> 'REPORT_SUPPLEMENT' or scope_id = $4)
          and (scope_id = $4 or scope_id = '*' or scope_id = '' or scope_id is null or scope_kind = 'REPORT' or scope_kind = $3)
          and status = 'APPROVED' and approved_at <= $5 and expires_at > $5
        order by approved_at desc limit 1
      `, [unitId, reportDate, scopeKind, String(scopeId), now]);
      if (!rows.length) fail(423, 'REPORTING_WINDOW_CLOSED', 'Đã hết giờ nhập báo cáo ngày.');
      assertUnlockScope({
        ...rows[0],
        report_day: dateKey(rows[0].report_day),
        scope_id: String(scopeId),
        scope_kind: scopeKind
      }, unitId, reportDate, scopeKind, scopeId, now);
    }
  }

  async function legalReference(client, articleId, day, businessCode) {
    if (!articleId) return;
    const result = await client.query(`select 1 from daily_report_legal_articles a
      join daily_report_legal_versions v on v.id=a.version_id where a.id=$1 and v.status='PUBLISHED'
        and v.effective_from <= $2 and a.effective_from <= $2
        and (a.effective_to is null or a.effective_to >= $2) and a.business_codes ?| $3::text[]`,
    [articleId, day, businessCodeGroup(businessCode)]);
    if (!result.rowCount) fail(422, 'LEGAL_REFERENCE_INVALID', 'Điều luật chưa công bố, hết hiệu lực hoặc sai hệ.');
  }

  async function ownCase(user, caseId, client = pool) {
    const { rows } = await client.query(`
      select c.*, exists(select 1 from daily_report_intake_batches b
        where b.result->'case_ids' @> jsonb_build_array(c.id::text)) as intake_report
      from daily_report_cases c where c.id = $1
    `, [caseId]);
    if (!rows.length) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ trong phạm vi được phép.');
    if (!canAccessUnit(user, rows[0].unit_id)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy hồ sơ trong phạm vi được phép.');
    }
    return rows[0];
  }

  app.use(base, (req, res, next) => {
    const json = res.json.bind(res);
    res.json = value => json(normalizeDates(value));
    next();
  }, requireSameOrigin, authorize, express.json({ limit: '30mb', inflate: false }), validateDailyReportRequest,
  (req, res, next) => {
    try {
      restrictCompilerRequest(req, fail);
      next();
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.code });
    }
  });
  app.use(base, (error, _req, res, next) => {
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Tổng dung lượng văn bản vượt giới hạn 20 MB.', code: 'UPLOAD_TOO_LARGE' });
    }
    next(error);
  });
  const caseSubmission = createCaseSubmission({ fail, hasRole, canAccessUnit, reportingScope,
    dateKey, clock, normalizeDates, cleanText, audit });
  const supplementPermission = createSupplementPermission({ fail, dateKey, audit });
  registerIntakeRoutes(app, { base, pool, wrap, fail, audit, transaction,
    reportingScope, supplementPermission, hasRole, canAccessUnit, clock, requireDay, requireRole, dateKey });
  registerReferenceCaseRoutes(app, { base, pool, wrap, fail, audit, transaction,
    reportingScope, caseSubmission, hasRole, canAccessUnit, clock, requireDay, requireRole, cleanText, dateKey });
  registerAttachmentRoutes(app, { base, pool, wrap, fail, audit, transaction,
    reportingScope, canAccessUnit, hasRole, dateKey, clock });
  registerWorkspaceRoutes(app, { base, pool, wrap, requireRole, fail, audit, transaction,
    reportingScope, canAccessUnit, hasRole, cleanText, dateKey, clock, requireDay });
  registerConfigurationRoutes(app, { base, pool, wrap, requireRole, fail, cleanText, requireDay, transaction, audit });
  registerLegalRoutes(app, { base, pool, wrap, requireRole, fail, cleanText, requireDay, transaction, audit, dateKey });

  registerRoleRoutes(app, { base, pool, wrap, requireRole, fail, audit, transaction, requireDay });
  registerLeaderDeletionRoutes(app, { base, wrap, requireRole, fail, transaction, audit });

  registerPresentationRoutes(app, { base, pool, wrap, requireRole, requireDay, clock });
  registerDashboardRoutes(app, { base, pool, wrap, requireRole, requireDay, clock, fail });

  app.get(`${base}/scope`, requireRole('UNIT_REPORTER', 'PV01_COMPILER', 'BCN_ADMIN', 'LEGAL_REVIEWER', 'AUDITOR'), wrap(async (req, res) => {
    const now = clock();
    const user = req.dailyActor;
    const day = reportDay(now);
    let activeUnlock = null;
    if (user.unitId) {
      const { rows } = await pool.query(`
        select id, unit_id, report_day, scope_kind, scope_id, purpose, status, approved_at, expires_at
        from daily_report_unlock_requests
        where unit_id = $1 and report_day = $2 and status = 'APPROVED' and purpose <> 'CASE_SUPPLEMENT'
          and approved_at <= $3 and expires_at > $3
        order by expires_at desc limit 1
      `, [user.unitId, day, now]);
      if (rows.length) {
        activeUnlock = {
          id: rows[0].id,
          scopeKind: rows[0].scope_kind,
          scopeId: rows[0].scope_id,
          purpose: rows[0].purpose,
          expiresAt: rows[0].expires_at,
          approvedAt: rows[0].approved_at,
          remainingSeconds: Math.max(0, Math.round((new Date(rows[0].expires_at).getTime() - now.getTime()) / 1000))
        };
      }
    }
    const isLocked = !isBeforeCutoff(now) && !Boolean(user.is_admin) && !activeUnlock;
    res.json({
      serverNow: now.toISOString(),
      userId: user.id,
      unitId: user.unitId,
      unitName: user.unitName,
      isAdmin: Boolean(user.is_admin),
      unitGroup: user.unitGroup,
      roles: user.roles.map(item => item.role_code),
      compilerModules: compilerModules(user),
      submodules: availableModules(user),
      primitiveWeaponTypeSupported: true,
      primitiveWeaponTypesVersion: 2,
      dailyWorkDomainSupported: true,
      administrativeFieldsSupported: true,
      multipleAdministrativeDomainsSupported: true,
      patrolFieldsSupported: true,
      patrolVehiclesCheckedSupported: true,
      caseUpdateResubmitVersion: 1,
      supplementPermissionVersion: 1,
      reportDay: day,
      beforeCutoff: isBeforeCutoff(now),
      activeUnlock,
      isLocked,
      timeZone: 'Asia/Ho_Chi_Minh',
      reportTypes: [...types]
    });
  }));

  app.get(`${base}/units`, wrap(async (req, res) => {
    const { rows } = await pool.query(`select id,name from teams order by name`);
    res.json({ units: rows.filter(unit => canAccessUnit(req.dailyActor, unit.id)
      || req.dailyActor.is_admin || req.dailyActor.roles.some(role => role.role_code === 'BCN_ADMIN')) });
  }));

  app.get(`${base}/cases`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const reportDate = requireDay(req.query.report_day || reportDay(clock()));
    const compilerRoles = user.roles.filter(role => role.role_code === 'PV01_COMPILER');
    const allUnits = compilerRoles.some(role => role.unit_id === null);
    const allowedUnits = compilerRoles.map(role => Number(role.unit_id)).filter(Boolean);
    if (hasRole(user, 'UNIT_REPORTER', user.unitId)) allowedUnits.push(Number(user.unitId));
    const unit = req.query.unit_id ? Number(req.query.unit_id) : compilerRoles.length ? null : Number(user.unitId);
    if ((!unit && !compilerRoles.length) || (unit && (!Number.isSafeInteger(unit) || !canAccessUnit(user, unit)))) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu trong phạm vi được phép.');
    }
    const fromDate = requireDay(req.query.from_day || reportDate);
    const toDate = requireDay(req.query.to_day || reportDate);
    const offset = requireOffset(req.query.offset);
    if (fromDate > toDate) fail(422, 'INVALID_DATE_RANGE', 'Khoảng ngày tra cứu không hợp lệ.');
    const hasExplicitDate = Boolean(req.query.from_day || req.query.to_day);
    const { rows } = await pool.query(`
      select c.id, c.title, c.unit_id, (select name from teams where id=c.unit_id) as unit_name,
        c.stable_code, c.business_code, c.classifications, c.category_code, c.occurred_at,
        c.report_day, c.location_general, c.location_address, c.summary, c.current_state, c.version,
        c.counted_as_pphs, c.duplicate_state, c.created_at, c.persons, c.external_reference,
        count(*) over() as total_count,
        (select count(*)::int from daily_report_case_events e where e.case_id = c.id) as event_count
      from daily_report_cases c
      where ($1::bigint is null or c.unit_id=$1)
        and (not $13::boolean or c.business_code = 'TINH_HINH_KHAC' or exists (
          select 1 from jsonb_array_elements(c.classifications) cls
          where cls->>'business_code' = 'TINH_HINH_KHAC'))
        and (case when $14::boolean then
          (select (max(r.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
            from daily_report_returns r join daily_report_submissions sub on sub.id=r.submission_id
            where sub.case_id=c.id) between $2 and $3
          else c.report_day between $2 and $3 end or ($13::boolean and exists (
          select 1 from daily_report_case_events followup where followup.case_id=c.id
            and followup.event_kind<>'INITIAL_REPORT' and followup.report_day between $2 and $3))
          or ($13::boolean and (c.business_code = 'TINH_HINH_KHAC' or exists (
            select 1 from jsonb_array_elements(c.classifications) cls
            where cls->>'business_code' = 'TINH_HINH_KHAC')) and not $15::boolean))
        and ($9::boolean or c.unit_id=any($10::bigint[]))
        and (not $12::boolean or exists(select 1 from daily_report_returns r
          join daily_report_submissions sub on sub.id=r.submission_id where sub.case_id=c.id))
        and (not $13::boolean or c.business_code = 'TINH_HINH_KHAC' or exists (
          select 1 from jsonb_array_elements(c.classifications) cls
          where cls->>'business_code' = 'TINH_HINH_KHAC') or c.current_state<>'VERIFIED' or exists(
          select 1 from daily_report_case_events e where e.case_id=c.id and e.event_kind<>'INITIAL_REPORT'))
        and ($4::text is null or c.current_state = $4)
        and ($5::text[] is null or c.business_code = any($5::text[]) or exists (
          select 1 from jsonb_array_elements(c.classifications) classification
          where classification->>'business_code'=any($5::text[])))
        and ($6::text is null or c.category_code = $6)
        and ($7::boolean is null or c.counted_as_pphs = $7)
        and ($8::text is null or c.title ilike '%' || $8 || '%' or c.summary ilike '%' || $8 || '%'
          or c.stable_code ilike '%' || $8 || '%'
          or c.location_general ilike '%' || $8 || '%'
          or c.external_reference ilike '%' || $8 || '%'
          or exists(select 1 from jsonb_array_elements(c.persons) person
            where person->>'name' ilike '%'||$8||'%' or person->>'reference' ilike '%'||$8||'%'
              or person->>'identity_number' ilike '%'||$8||'%')
          or exists(select 1 from daily_report_case_events event where event.case_id=c.id
            and event.decision_number ilike '%'||$8||'%'))
      order by c.created_at desc,c.id limit 501 offset $11
    `, [unit, fromDate, toDate, req.query.state || null,
      req.query.business_code ? businessCodeGroup(req.query.business_code) : null,
      req.query.category_code || null,
      req.query.counted_as_pphs === 'true' ? true : req.query.counted_as_pphs === 'false' ? false : null,
      String(req.query.q || '').slice(0, 120) || null, allUnits, allowedUnits, offset,
      req.query.has_returns === 'true', req.query.followup === 'true',
      req.query.has_returns === 'true' && req.query.date_basis === 'returned',
      hasExplicitDate]);
    res.json({ cases: rows.slice(0, 500), total: Number(rows[0]?.total_count || 0),
      offset, next_offset: rows.length > 500 ? offset + 500 : null });
  }));

  app.post(`${base}/cases`, wrap(async (req, res) => {
    const user = await entryActor(req, pool, fail);
    if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Chỉ cán bộ đơn vị được giao mới được nhập vụ việc.');
    }
    const reportDate = requireDay(req.body?.report_day || reportDay(clock()));
    const caseId = req.body?.id ? String(req.body.id) : randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) {
      fail(422, 'INVALID_CASE_ID', 'Mã định danh hồ sơ không hợp lệ.');
    }
    const stableCode = cleanText(req.body?.stable_code || `BCN-${reportDate.replaceAll('-', '')}-${caseId.slice(0, 8)}`,
      80, 'Mã hồ sơ', true);
    const category = cleanText(req.body?.category_code, 60, 'Loại vụ việc', true);
    const summary = cleanText(req.body?.summary, 8000, 'Nội dung', true);
    const location = resolveCaseLocation(req.body, null, { cleanText, fail });
    const now = clock();
    await reportingScope(user, user.unitId, reportDate, 'CASE', caseId, now);
    const persons = validatePersons(req.body.persons, req.body.person_count, fail, reportDay(now));
    const attachments = await prepareAttachments(req.body.attachments);
    const inserted = await transaction(async client => {
      await reportingScope(user, user.unitId, reportDate, 'CASE', caseId, clock(), client);
      const classifications = await resolveClassifications({ client, body: req.body, day: reportDate,
        fail, validateArticle: legalReference });
      const legal = primaryClassification(classifications);
      const businessCode = legal.businessCode;
      const hasOther = classifications.some(group => group.business_code === 'TINH_HINH_KHAC');
      const title = caseTitle(hasOther ? 'TINH_HINH_KHAC' : businessCode, req.body?.title);
      const { rows } = await client.query(`
        insert into daily_report_cases
          (id, stable_code, unit_id, business_code, category_code, occurred_at,
            report_day, location_general, summary, created_by, external_reference, persons,
            legal_article_id, title, legal_reference, location_address, classifications)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb)
        returning id, stable_code, current_state, version
      `, [caseId, stableCode, user.unitId, businessCode, category,
        req.body?.occurred_at || null, reportDate, location.general, summary, user.id,
        cleanText(req.body.external_reference, 100, 'Số hồ sơ nguồn'),
        JSON.stringify(persons), legal.articleId, title,
        legal.reference ? JSON.stringify(legal.reference) : null,
        location.address ? JSON.stringify(location.address) : null, JSON.stringify(classifications)]);
      await client.query(`
        insert into daily_report_case_events
          (id, case_id, report_day, event_kind, narrative, source_user_id, late_flag,
            decision_type,decision_number,decision_date,decision_authority)
        values ($1,$2,$3,'INITIAL_REPORT',$4,$5,$6,$7,$8,$9,$10)
      `, [randomUUID(), caseId, reportDate, summary, user.id, (!isBeforeCutoff(now) || reportDate !== reportDay(now)),
        cleanText(req.body.decision_type, 100, 'Loại quyết định') || null,
        cleanText(req.body.decision_number, 100, 'Số quyết định') || null,
        req.body.decision_date ? requireDay(req.body.decision_date) : null,
        cleanText(req.body.decision_authority, 250, 'Cơ quan ban hành', Boolean(req.body.decision_number)) || null]);
      await audit(client, req, 'CASE_CREATED', 'CASE', caseId);
      await storeAttachments(client, 'cases', caseId, user.id, attachments);
      return rows[0];
    });
    res.status(201).json({ case: inserted });
  }));

  app.get(`${base}/cases/:id`, wrap(async (req, res) => {
    const user = req.dailyActor;
    const item = await ownCase(user, req.params.id);
    const [{ rows: events }, { rows: submissions }, { rows: returns }] = await Promise.all([
      pool.query(`select * from daily_report_case_events where case_id=$1 order by created_at`, [item.id]),
      pool.query(`select id, version, state, snapshot, snapshot_sha256, late_flag, created_at
        from daily_report_submissions where case_id=$1 order by version desc`, [item.id]),
      pool.query(`select ret.id, ret.submission_id, ret.reason, ret.requested_fields,
        ret.response, ret.created_at from daily_report_returns ret
        join daily_report_submissions sub on sub.id=ret.submission_id
        where sub.case_id=$1 order by ret.created_at`, [item.id])
    ]);
    res.json({ case: item, events, submissions, returns });
  }));

  app.patch(`${base}/cases/:id`, wrap(async (req, res) => {
    const user = req.dailyActor;
    const item = await ownCase(user, req.params.id);
    if (!['DRAFT', 'RETURNED', 'VERIFIED'].includes(item.current_state)) {
      fail(409, 'VERIFIED_IMMUTABLE', 'Hồ sơ chưa cho phép chỉnh sửa.');
    }
    if (!hasRole(user, 'UNIT_REPORTER', item.unit_id)) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Không đủ quyền cập nhật hồ sơ.');
    }
    const now = clock();
    if (req.body.resubmit === true && item.current_state !== 'RETURNED') {
      fail(409, 'CASE_STATE_CONFLICT', 'Chỉ gửi lại hồ sơ đã được chỉ huy trả lại.');
    }
    await caseSubmission.assertScope(pool, user, item);
    const version = Number(req.body?.version);
    if (version !== item.version) fail(409, 'STALE_VERSION', 'Hồ sơ đã được cập nhật bởi tài khoản khác.');
    const summary = cleanText(req.body?.summary ?? item.summary, 8000, 'Nội dung', true);
    const location = resolveCaseLocation(req.body, item, { cleanText, fail });
    const persons = req.body.persons === undefined && req.body.person_count === undefined ? item.persons
      : validatePersons(req.body.persons, req.body.person_count, fail, reportDay(now));
    const result = await transaction(async client => {
    await caseSubmission.assertScope(client, user, item);
    const classifications = await resolveClassifications({ client, body: req.body, existing: item,
      day: dateKey(item.report_day), fail, validateArticle: legalReference });
    const legal = primaryClassification(classifications);
    const hasOther = classifications.some(group => group.business_code === 'TINH_HINH_KHAC');
    const wasOther = caseClassifications(item).some(group => group.business_code === 'TINH_HINH_KHAC');
    const title = !hasOther && wasOther ? ''
      : caseTitle(hasOther ? 'TINH_HINH_KHAC' : legal.businessCode, req.body.title, item.title);
    const { rows } = await client.query(`
      update daily_report_cases set summary=$2, location_general=$3,
        version=version+1, updated_at=now(), external_reference=$5,persons=$6::jsonb,
        legal_article_id=$7,title=$8,legal_reference=$9::jsonb,location_address=$10::jsonb,
        classifications=$11::jsonb,business_code=$12
      where id=$1 and version=$4 and current_state in ('DRAFT','RETURNED','VERIFIED') returning id, stable_code, version, current_state
    `, [item.id, summary, location.general, version,
      cleanText(req.body.external_reference ?? item.external_reference, 100, 'Số hồ sơ nguồn'),
      JSON.stringify(persons), legal.articleId,
      title,
      legal.reference ? JSON.stringify(legal.reference) : null,
      location.address ? JSON.stringify(location.address) : null, JSON.stringify(classifications), legal.businessCode]);
    if (!rows.length) fail(409, 'STALE_VERSION', 'Hồ sơ vừa được cập nhật bởi tài khoản khác.');
    await client.query(`update daily_report_case_events set state='SUPERSEDED'
      where case_id=$1 and state='PENDING_REVIEW' and event_kind in ('INITIAL_REPORT','CASE_UPDATED')`, [item.id]);
    await client.query(`
      insert into daily_report_case_events
        (id, case_id, report_day, event_kind, narrative, source_user_id, version, late_flag)
      values ($1,$2,$3,'CASE_UPDATED',$4,$5,$6,$7)
    `, [randomUUID(), item.id, item.report_day, summary, user.id, version + 1, (!isBeforeCutoff(now) || dateKey(item.report_day) !== reportDay(now))]);
    await audit(client, req, 'CASE_UPDATED', 'CASE', item.id);
    if (req.body.resubmit === true) {
      await caseSubmission.submit(client, req, { ...item, ...rows[0] });
      return (await client.query('select * from daily_report_cases where id=$1', [item.id])).rows[0];
    }
    return rows[0];
    });
    res.json({ case: result });
  }));

  app.post(`${base}/cases/:id/events`, wrap(async (req, res) => {
    const user = req.dailyActor;
    const item = await ownCase(user, req.params.id);
    if (!hasRole(user, 'UNIT_REPORTER', item.unit_id)) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Không đủ quyền cập nhật diễn biến.');
    }
    if (item.current_state !== 'VERIFIED') fail(409, 'CASE_NOT_VERIFIED', 'Sửa bản nháp trước khi thêm diễn biến mới.');
    const reportDate = requireDay(req.body?.report_day || reportDay(clock()));
    const now = clock();
    await reportingScope(user, item.unit_id, reportDate, 'CASE', item.id, now);
    const narrative = cleanText(req.body?.narrative, 8000, 'Diễn biến', true);
    const attachments = await prepareAttachments(req.body.attachments);
    const result = await transaction(async client => {
      const locked = await client.query(`select version from daily_report_cases where id=$1 for update`, [item.id]);
      await reportingScope(user, item.unit_id, reportDate, 'CASE', item.id, clock(), client);
      const decisionNumber = cleanText(req.body.decision_number, 100, 'Số quyết định');
      const authority = cleanText(req.body.decision_authority, 250, 'Cơ quan ban hành', Boolean(decisionNumber));
      const { rows } = await client.query(`insert into daily_report_case_events
        (id,case_id,report_day,event_kind,narrative,decision_type,decision_number,decision_date,
          decision_authority,source_user_id,version,late_flag)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
      [randomUUID(), item.id, reportDate, cleanText(req.body.event_kind || 'UPDATE', 60, 'Loại diễn biến', true),
        narrative, cleanText(req.body.decision_type, 100, 'Loại quyết định') || null, decisionNumber || null,
        req.body.decision_date ? requireDay(req.body.decision_date) : null, authority || null,
        user.id, locked.rows[0].version + 1, !isBeforeCutoff(now) || reportDate !== reportDay(now)]);
      await client.query('update daily_report_cases set version=version+1,updated_at=now() where id=$1', [item.id]);
      await audit(client, req, 'PRIOR_DAY_CASE_UPDATED', 'CASE', item.id);
      await storeAttachments(client, 'events', rows[0].id, user.id, attachments, true);
      return rows[0];
    });
    res.status(201).json({ event: result });
  }));

  app.post(`${base}/cases/:id/submit`, wrap(async (req, res) => {
    const item = await ownCase(req.dailyActor, req.params.id);
    const submission = await transaction(client => caseSubmission.submit(client, req, item));
    res.status(201).json({ submission });
  }));

  app.post(`${base}/cases/:id/return`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const item = await ownCase(user, req.params.id);
    if (item.current_state !== 'PENDING_REVIEW' && item.current_state !== 'RESUBMITTED'
      && item.current_state !== 'SUBMITTED') fail(409, 'CASE_STATE_CONFLICT', 'Hồ sơ chưa ở trạng thái rà soát.');
    const reason = cleanText(req.body?.reason, 3000, 'Lý do trả lại', true);
    const { rows: [submission] } = await pool.query(`
      select * from daily_report_submissions where case_id=$1 order by version desc limit 1
    `, [item.id]);
    if (!submission) fail(409, 'SUBMISSION_REQUIRED', 'Chưa có phiên bản gửi để trả lại.');
    const result = await transaction(async client => {
      const locked = await client.query('select version from daily_report_cases where id=$1 for update', [item.id]);
      if (!locked.rows.length || locked.rows[0].version !== item.version) {
        fail(409, 'STALE_VERSION', 'Hồ sơ vừa thay đổi, hãy tải lại trước khi xử lý.');
      }
      const ret = await client.query(`insert into daily_report_returns
        (id,submission_id,reason,requested_fields,actor_id)
        values ($1,$2,$3,$4::jsonb,$5) returning id`,
      [randomUUID(), submission.id, reason,
        JSON.stringify(Array.isArray(req.body?.requested_fields) ? req.body.requested_fields : []), user.id]);
      await client.query(`update daily_report_submissions set state='RETURNED' where id=$1`, [submission.id]);
      await client.query(`update daily_report_cases set current_state='RETURNED', version=version+1,
        updated_at=now() where id=$1`, [item.id]);
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
        values ($1,'CASE_RETURNED',$2,'CASE',$3,$4::jsonb) on conflict (event_key) do nothing`,
      [`CASE_RETURNED:${ret.rows[0].id}`, item.unit_id, item.id,
        JSON.stringify({ stable_code: item.stable_code, reason })]);
      await audit(client, req, 'CASE_RETURNED', 'CASE', item.id, 'ALLOW', { return_id: ret.rows[0].id });
      return ret.rows[0];
    });
    res.status(201).json({ return: result });
  }));

  app.post(`${base}/cases/:id/request-supplement`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const reason = cleanText(req.body?.reason, 3000, 'Nội dung yêu cầu bổ sung', true);
    const id = randomUUID();
    await transaction(async client => {
      const item = await ownCase(req.dailyActor, req.params.id);
      const locked = await client.query('select version from daily_report_cases where id=$1 for update', [item.id]);
      if (locked.rows[0]?.version !== item.version) {
        fail(409, 'STALE_VERSION', 'Hồ sơ vừa thay đổi, hãy tải lại trước khi gửi yêu cầu.');
      }
      if (item.current_state === 'DRAFT') {
        fail(409, 'CASE_NOT_SUBMITTED', 'Chỉ yêu cầu bổ sung đối với hồ sơ đã gửi.');
      }
      const canRequestAnySubmitted = compilerModules(req.dailyActor)
        .includes('approval');
      if (!canRequestAnySubmitted && !['PENDING_REVIEW', 'SUBMITTED', 'RESUBMITTED'].includes(item.current_state)) {
        fail(403, 'SUBMODULE_FORBIDDEN', 'Quyền xử lý báo cáo bị trả lại chỉ áp dụng với hồ sơ đang chờ rà soát.');
      }
      if (['PENDING_REVIEW', 'SUBMITTED', 'RESUBMITTED', 'VERIFIED'].includes(item.current_state)) {
        const { rows: [submission] } = await client.query(`select id from daily_report_submissions
          where case_id=$1 order by version desc limit 1`, [item.id]);
        if (!submission) fail(409, 'SUBMISSION_REQUIRED', 'Hồ sơ chưa có phiên bản gửi.');
        await client.query(`insert into daily_report_returns(id,submission_id,reason,requested_fields,actor_id)
          values($1,$2,$3,$4::jsonb,$5)`, [id, submission.id, reason, JSON.stringify([reason]), req.dailyActor.id]);
        await client.query("update daily_report_submissions set state='RETURNED' where id=$1", [submission.id]);
        await client.query(`update daily_report_cases set current_state='RETURNED',version=version+1,
          updated_at=now() where id=$1`, [item.id]);
      }
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
        values ($1,'CASE_SUPPLEMENT_REQUESTED',$2,'CASE',$3,$4::jsonb)`,
      [`CASE_SUPPLEMENT_REQUESTED:${id}`, item.unit_id, item.id,
        JSON.stringify({ reason, requested_by: req.dailyActor.id })]);
      await audit(client, req, 'CASE_SUPPLEMENT_REQUESTED', 'CASE', item.id, 'ALLOW', { reason });
    });
    res.status(201).json({ ok: true });
  }));

  app.post(`${base}/cases/:id/verify`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const item = await ownCase(user, req.params.id);
    if (!['PENDING_REVIEW', 'RESUBMITTED', 'SUBMITTED'].includes(item.current_state)) {
      fail(409, 'CASE_STATE_CONFLICT', 'Hồ sơ chưa ở trạng thái rà soát.');
    }
    const { rows: [submission] } = await pool.query(`
      select id from daily_report_submissions where case_id=$1 order by version desc limit 1
    `, [item.id]);
    if (!submission) fail(409, 'SUBMISSION_REQUIRED', 'Chưa có phiên bản gửi để duyệt.');
    await transaction(async client => {
      const locked = await client.query('select version from daily_report_cases where id=$1 for update', [item.id]);
      if (!locked.rows.length || locked.rows[0].version !== item.version) {
        fail(409, 'STALE_VERSION', 'Hồ sơ vừa thay đổi, hãy tải lại trước khi xử lý.');
      }
      await client.query(`update daily_report_cases set current_state='VERIFIED', version=version+1,
        updated_at=now() where id=$1`, [item.id]);
      await client.query(`update daily_report_case_events set state='VERIFIED'
        where case_id=$1 and state='PENDING_REVIEW'`, [item.id]);
      await client.query(`update daily_report_submissions set state='VERIFIED' where id=$1`, [submission.id]);
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
        values ($1,'CASE_VERIFIED',$2,'CASE',$3,'{}'::jsonb) on conflict (event_key) do nothing`,
      [`CASE_VERIFIED:${submission.id}`, item.unit_id, item.id]);
      await audit(client, req, 'CASE_VERIFIED', 'CASE', item.id);
    });
    res.json({ ok: true, state: 'VERIFIED' });
  }));

  app.post(`${base}/events/:id/verify`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const eventId = req.params.id;
    const event = await pool.query(`select case_id from daily_report_case_events where id=$1`, [eventId]);
    if (!event.rows.length) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy diễn biến.');
    await ownCase(req.dailyActor, event.rows[0].case_id);
    const result = await pool.query(`update daily_report_case_events e set state='VERIFIED'
      from daily_report_cases c where e.id=$1 and e.case_id=c.id
        and c.current_state='VERIFIED' and e.state='PENDING_REVIEW' returning e.id`, [eventId]);
    if (!result.rowCount) fail(409, 'EVENT_REVIEW_CONFLICT', 'Diễn biến không chờ duyệt.');
    await audit(pool, req, 'CASE_EVENT_VERIFIED', 'CASE_EVENT', eventId);
    res.json({ ok: true, state: 'VERIFIED' });
  }));



  app.post(`${base}/unlock-requests`, wrap(async (req, res) => {
    const user = await entryActor(req, pool, fail);
    if (!user.is_admin && !user.inputAllowed) {
      fail(403, 'INPUT_MODULE_REQUIRED', 'Cần quyền Nhập báo cáo ngày để tạo đề nghị.');
    }
    if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Chỉ đơn vị được giao mới xin mở khóa.');
    }
    const reportDate = requireDay(req.body?.report_day);
    if (reportDate !== reportDay(clock())) {
      fail(409, 'UNLOCK_REPORT_DAY_MISMATCH',
        'Chỉ được đề nghị cho đúng ngày tại Nhập báo cáo ngày. Hãy tải lại báo cáo trước khi gửi.');
    }
    const kind = String(req.body?.scope?.kind || '');
    const scopeId = cleanText(req.body?.scope?.id, 120, 'Phạm vi', true);
    if (!scopeKinds.has(kind)) fail(422, 'INVALID_UNLOCK_SCOPE', 'Phạm vi mở khóa không hợp lệ.');
    const reason = cleanText(req.body?.reason, 2000, 'Lý do', true);
    const purpose = String(req.body?.purpose || 'REPORTING_WINDOW');
    const supplement = supplementPermission.isSupplement(purpose);
    if (!supplement && purpose !== 'REPORTING_WINDOW') fail(422, 'INVALID_PURPOSE', 'Loại yêu cầu không hợp lệ.');
    if (!supplement && isBeforeCutoff(clock())) fail(409, 'UNLOCK_NOT_AVAILABLE', 'Chỉ xin mở khóa sau 10:00.');
    const id = randomUUID();
    await transaction(async client => {
      await supplementPermission.validate(client, user, purpose, kind, scopeId, reportDate);
      await client.query(`insert into daily_report_unlock_requests
        (id,unit_id,report_day,scope_kind,scope_id,reason,requester_id,purpose)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, user.unitId, reportDate, kind, scopeId, reason, user.id, purpose]);
      const compilers = await client.query(`select user_id from daily_report_user_roles
        where role_code='PV01_COMPILER' and (unit_id is null or unit_id=$1)
        union select id from users where is_admin and not is_deleted and status='Hoạt động'`, [user.unitId]);
      for (const compiler of compilers.rows) {
        await client.query(`insert into daily_report_outbox
          (event_key,event_type,recipient_user_id,resource_type,resource_id,safe_payload)
          values ($1,'UNLOCK_REQUESTED',$2,'UNLOCK_REQUEST',$3,$4::jsonb)
          on conflict (event_key) do nothing`,
        [`UNLOCK_REQUESTED:${id}:${compiler.user_id}`, compiler.user_id, id, JSON.stringify({ purpose })]);
      }
      await audit(client, req, 'UNLOCK_REQUESTED', 'UNLOCK_REQUEST', id);
    });
    res.status(201).json({ id, status: 'REQUESTED' });
  }));

  app.get(`${base}/unlock-requests`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const { rows } = await pool.query(`
      select id, unit_id, report_day, scope_kind, scope_id, reason, purpose, status,
        requester_id, decided_by, decision_reason, approved_at, expires_at, created_at
      from daily_report_unlock_requests
      where $3::boolean or unit_id=$1 or unit_id=any($2::bigint[])
      order by created_at desc limit 300
    `, [hasRole(user, 'UNIT_REPORTER') ? user.unitId : null,
      user.roles.filter(role => role.role_code === 'PV01_COMPILER').map(role => role.unit_id).filter(Boolean),
      Boolean(user.is_admin) || user.roles.some(role => role.role_code === 'PV01_COMPILER' && role.unit_id === null)]);
    res.json({ requests: rows.map(item => ({ ...item,
      status: item.status === 'APPROVED' && item.expires_at && new Date(item.expires_at) <= clock()
        ? 'EXPIRED' : item.status
    })) });
  }));

  const notificationFeed = createDailyNotificationFeed({ pool, actor, maintenance });
  app.get(`${base}/notifications`,
    requireRole('UNIT_REPORTER', 'PV01_COMPILER', 'BCN_ADMIN', 'LEGAL_REVIEWER'), wrap(async (req, res) => {
      res.json({ notifications: await notificationFeed.rows(req) });
    }));

  app.post(`${base}/notifications/:id/read`, wrap(async (req, res) => {
    if (!await notificationFeed.markRead(req, req.params.id)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy thông báo.');
    }
    res.json({ ok: true });
  }));

  app.post(`${base}/unlock-requests/:id/decide`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const decision = String(req.body?.decision || '');
    if (!['APPROVED', 'REJECTED'].includes(decision)) fail(422, 'INVALID_DECISION', 'Quyết định không hợp lệ.');
    const decisionReason = cleanText(req.body?.reason, 2000, 'Lý do quyết định');
    const user = req.dailyActor;
    const now = clock();
    const result = await transaction(async client => {
      const { rows } = await client.query(`select * from daily_report_unlock_requests
        where id=$1 for update`, [req.params.id]);
      const request = rows[0];
      if (!request) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu mở khóa.');
      if (!canAccessUnit(user, request.unit_id)) {
        fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu mở khóa trong phạm vi được giao.');
      }
      if (request.status !== 'REQUESTED') fail(409, 'REQUEST_ALREADY_DECIDED', 'Yêu cầu đã được xử lý.');
      if (decision === 'APPROVED') await supplementPermission.approve(client, req, request);
      const expiresAt = decision === 'APPROVED' && request.purpose !== 'CASE_SUPPLEMENT' ? unlockExpiry(now) : null;
      const { rows: updated } = await client.query(`update daily_report_unlock_requests
        set status=$2, decided_by=$3, decision_reason=$4, approved_at=$5, expires_at=$6,
          decided_at=$7 where id=$1 returning id,status,approved_at,expires_at`,
      [request.id, decision, user.id, decisionReason || null,
        decision === 'APPROVED' ? now : null, expiresAt, now]);
      await client.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
        values ($1,$2,$3,'UNLOCK_REQUEST',$4,$5::jsonb) on conflict (event_key) do nothing`,
      [`UNLOCK_${decision}:${request.id}`, `UNLOCK_${decision}`, request.unit_id, request.id,
        JSON.stringify({ purpose: request.purpose })]);
      await audit(client, req, `UNLOCK_${decision}`, 'UNLOCK_REQUEST', request.id);
      return updated[0];
    });
    res.json({ request: result });
  }));

  app.get(`${base}/metric-definitions`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor.is_admin && req.query.unit_id
      ? await entryActor({ dailyActor: req.dailyActor, body: { unit_id: req.query.unit_id } }, pool, fail)
      : req.dailyActor;
    const { rows: configured } = await pool.query(`select distinct on(code) *
      from daily_report_metric_definitions where status='PUBLISHED'
      and effective_from <= $1 and (effective_to is null or effective_to >= $1) order by code,version desc`,
    [requireDay(req.query.report_day || reportDay(clock()))]);
    const defaults = [
      { code: 'GENERAL', label: 'Kết quả công tác chung', configurable: true },
      { code: 'DETENTION', label: 'Quản lý giam giữ', restrictedTo: 'PHONG' },
      { code: 'TIP_INTAKE_AND_RESOLUTION', label: 'Tiếp nhận, giải quyết tin báo, tố giác tội phạm', restrictedTo: 'PHONG' },
      { code: 'INVESTIGATION', label: 'Kết quả điều tra án', restrictedTo: 'PHONG', fields: [
        'new_prosecutions_cases', 'new_prosecutions_accused', 'suspended_cases',
        'suspended_accused', 'discontinued_cases', 'discontinued_accused',
        'investigation_concluded_cases', 'investigation_concluded_accused'
      ] }
    ];
    const groups = new Map(defaults.map(item => [item.code, { ...item, configured: false }]));
    for (const item of configured) groups.set(item.code, { ...item, configured: true });
    const assignments = user.roles.filter(role => role.role_code === 'UNIT_REPORTER'
      && String(role.unit_id) === String(user.unitId)).map(role => role.metric_code);
    res.json({ metricGroups: [...groups.values()].map(group => ({ ...group,
      permitted: group.configured && group.owner_groups?.includes(user.unitGroup)
        && (user.is_admin || assignments.includes(group.code))
    })) });
  }));

  app.get(`${base}/work-results`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const reportDate = requireDay(req.query.report_day || req.query.from_day || reportDay(clock()));
    const fromDate = requireDay(req.query.from_day || reportDate);
    const toDate = requireDay(req.query.to_day || reportDate);
    const compilerRoles = user.roles.filter(role => role.role_code === 'PV01_COMPILER');
    const allUnits = compilerRoles.some(role => role.unit_id === null);
    const allowedUnits = compilerRoles.map(role => Number(role.unit_id)).filter(Boolean);
    if (hasRole(user, 'UNIT_REPORTER', user.unitId)) allowedUnits.push(Number(user.unitId));
    const unit = req.query.unit_id ? Number(req.query.unit_id) : compilerRoles.length ? null : Number(user.unitId);
    if ((!unit && !compilerRoles.length) || (unit && (!Number.isSafeInteger(unit) || !canAccessUnit(user, unit)))) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu.');
    }
    const state = req.query.state || null;
    const { rows } = await pool.query(`select m.*, (select name from teams where id=m.unit_id) as unit_name
      from daily_report_metrics m
      where ($1::bigint is null or m.unit_id=$1)
        and m.report_day between $2 and $3
        and ($4::boolean or m.unit_id = any($5::bigint[]))
        and ($6::text is null or m.state = $6)
      order by m.report_day desc, m.created_at desc`,
      [unit, fromDate, toDate, allUnits, allowedUnits, state]);
    res.json({ metrics: rows });
  }));


  app.post(`${base}/work-results`, wrap(async (req, res) => {
    const user = await entryActor(req, pool, fail);
    if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Chỉ đơn vị được giao mới nhập kết quả công tác.');
    }
    const metricCode = cleanText(req.body?.metric_code, 80, 'Nhóm chỉ tiêu', true);
    const assignments = user.roles.filter(item => item.role_code === 'UNIT_REPORTER' && item.metric_code
      && String(item.unit_id) === String(user.unitId)).map(item => item.metric_code);
    assertMetricPermission(metricCode, user.unitGroup, user.is_admin ? [metricCode] : assignments);
    const reportDate = requireDay(req.body?.report_day || reportDay(clock()));
    const values = req.body?.values;
    const workDomain = metricCode === 'DAILY_POLICE_WORK' && Object.hasOwn(req.body, 'work_domain')
      ? validateWorkDomain(req.body.work_domain, fail, true) : '';
    const definition = await validateMetric(pool, user, metricCode, reportDate, values, fail, null, workDomain);
    if (!values || Array.isArray(values) || typeof values !== 'object') fail(422, 'INVALID_METRIC_VALUES', 'Dữ liệu chỉ tiêu không hợp lệ.');
    for (const value of Object.values(values)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        fail(422, 'INVALID_METRIC_VALUES', 'Chỉ tiêu phải là số không âm.');
      }
    }
    const id = req.body?.id || randomUUID();
    const now = clock();
    await reportingScope(user, user.unitId, reportDate, 'WORK_RESULT', id, now);
    const attachments = await prepareAttachments(req.body.attachments);
    const metric = await transaction(async client => {
      await reportingScope(user, user.unitId, reportDate, 'WORK_RESULT', id, clock(), client);
      const { rows } = await client.query(`insert into daily_report_metrics
        (id,unit_id,report_day,metric_code,metric_values,created_by,late_flag,definition_id,metric_version,work_domain)
        values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) returning *`,
      [id, user.unitId, reportDate, metricCode, JSON.stringify(values), user.id,
        !isBeforeCutoff(now) || reportDate !== reportDay(now), definition.id, definition.version, workDomain]);
      await storeAttachments(client, 'work-results', id, user.id, attachments);
      return rows[0];
    });
    res.status(201).json({ metric });
  }));

  app.post(`${base}/situations`, wrap(async (req, res) => {
    const user = await entryActor(req, pool, fail);
    if (!user.unitId || !hasRole(user, 'UNIT_REPORTER')) {
      fail(403, 'UNIT_REPORTER_REQUIRED', 'Chỉ đơn vị được giao mới nhập tình hình.');
    }
    const reportDate = requireDay(req.body?.report_day || reportDay(clock()));
    if (req.body?.linked_case_id) await ownCase(user, req.body.linked_case_id);
    const codes = [...new Set(Array.isArray(req.body?.category_codes) ? req.body.category_codes : [])];
    if (!codes.length || codes.some(code => !petitionCodes.has(code))) {
      fail(422, 'INVALID_SITUATION_CATEGORY', 'Nhãn tình hình khiếu kiện không hợp lệ.');
    }
    const id = req.body?.id || randomUUID();
    const now = clock();
    await reportingScope(user, user.unitId, reportDate, 'SITUATION', id, now);
    const attachments = await prepareAttachments(req.body.attachments);
    const situation = await transaction(async client => {
      await reportingScope(user, user.unitId, reportDate, 'SITUATION', id, clock(), client);
      const { rows } = await client.query(`insert into daily_report_situations
        (id,unit_id,report_day,category_codes,narrative,linked_case_id,created_by)
        values ($1,$2,$3,$4::jsonb,$5,$6,$7) returning *`,
      [id, user.unitId, reportDate, JSON.stringify(codes),
        cleanText(req.body?.narrative, 8000, 'Nội dung', true), req.body?.linked_case_id || null, user.id]);
      await storeAttachments(client, 'situations', id, user.id, attachments);
      return rows[0];
    });
    res.status(201).json({ situation });
  }));

  app.get(`${base}/situations`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const reportDate = requireDay(req.query.report_day || reportDay(clock()));
    const unitId = req.query.unit_id ? Number(req.query.unit_id) : user.unitId;
    if (!unitId || !canAccessUnit(user, unitId)) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu.');
    const { rows } = await pool.query(`select * from daily_report_situations
      where unit_id=$1 and report_day=$2 order by created_at desc`, [unitId, reportDate]);
    res.json({ situations: rows });
  }));


  app.post(`${base}/duplicates/decisions`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const action = String(req.body?.action || '');
    if (!['APPEND_EVENT_TO_EXISTING', 'DUPLICATE_NO_RECOUNT', 'SEPARATE_CASE'].includes(action)) {
      fail(422, 'INVALID_DUPLICATE_ACTION', 'Phương án đối chiếu không hợp lệ.');
    }
    const reason = cleanText(req.body?.reason, 3000, 'Lý do đối chiếu', true);
    const first = await ownCase(user, req.body?.case_id);
    const second = await ownCase(user, req.body?.candidate_case_id);
    if (first.id === second.id) fail(422, 'SAME_CASE', 'Phải đối chiếu hai hồ sơ khác nhau.');
    const id = randomUUID();
    await transaction(async client => {
      await client.query(`select id from daily_report_cases where id=any($1::uuid[]) order by id for update`,
        [[first.id, second.id]]);
      const existing = await client.query(`select 1 from daily_report_duplicate_decisions
        where case_id=$1 and candidate_case_id=$2`, [first.id, second.id]);
      if (existing.rowCount) fail(409, 'DUPLICATE_ALREADY_DECIDED', 'Cặp hồ sơ đã được đối chiếu.');
      await client.query(`insert into daily_report_duplicate_decisions
        (id,case_id,candidate_case_id,action,reason,reviewer_id)
        values ($1,$2,$3,$4,$5,$6)`, [id, first.id, second.id, action, reason, user.id]);
      await client.query(`update daily_report_cases set duplicate_state=$2,
        counted_as_pphs=case when $2 in ('DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING')
          then false else counted_as_pphs end
        where id=$1`, [first.id, action]);
      if (action === 'APPEND_EVENT_TO_EXISTING') {
        await client.query(`insert into daily_report_case_events
          (id,case_id,report_day,event_kind,narrative,source_user_id,version,state)
          values ($1,$2,$3,'PRIOR_DAY_UPDATE',$4,$5,$6,'PENDING_REVIEW')`,
        [randomUUID(), second.id, first.report_day, first.summary, user.id, second.version + 1]);
        await client.query(`update daily_report_cases set version=version+1,updated_at=now() where id=$1`, [second.id]);
      }
      await audit(client, req, action, 'CASE', first.id, 'ALLOW', { candidate_id: second.id });
    });
    res.status(201).json({ id, action, reason });
  }));

  app.get(`${base}/duplicates/candidates`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const source = await ownCase(req.dailyActor, req.query.case_id);
    const candidates = await duplicateCandidates(pool, source, req.dailyActor);
    for (const candidate of candidates.filter(item => item.important)) {
      await pool.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_user_id,resource_type,resource_id)
        values ($1,'DUPLICATE_CANDIDATE_FOUND',$2,'CASE',$3) on conflict(event_key) do nothing`,
      [`DUPLICATE:${source.id}:${candidate.id}:${req.dailyActor.id}`, req.dailyActor.id, source.id]);
    }
    res.json({ source_case_id: source.id, candidates });
  }));

  app.get(`${base}/leaders`, requireRole('PV01_COMPILER', 'BCN_ADMIN'), wrap(async (req, res) => {
    const { rows } = await pool.query(`select id,full_name,rank_name,title,signer_scope,
      effective_from,effective_to,archived_at from daily_report_leaders
      where deleted_at is null and ($1::boolean or archived_at is null)
      order by full_name,id`, [Boolean(req.query.include_archived)]);
    res.json({ leaders: rows });
  }));

  app.post(`${base}/leaders`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const scope = String(req.body?.signer_scope || '');
    if (!['PV01', 'CATP'].includes(scope)) fail(422, 'INVALID_SIGNER_SCOPE', 'Phạm vi người ký không hợp lệ.');
    const start = requireDay(req.body?.effective_from);
    const end = req.body?.effective_to ? requireDay(req.body.effective_to) : null;
    if (end && end < start) fail(422, 'INVALID_EFFECTIVE_RANGE', 'Thời hạn chức vụ không hợp lệ.');
    const id = randomUUID();
    const { rows } = await pool.query(`insert into daily_report_leaders
      (id,full_name,rank_name,title,signer_scope,effective_from,effective_to,created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [id, cleanText(req.body?.full_name, 180, 'Họ tên', true),
      cleanText(req.body?.rank_name, 120, 'Cấp bậc'), cleanText(req.body?.title, 180, 'Chức vụ', true),
      scope, start, end, req.dailyActor.id]);
    await audit(pool, req, 'LEADER_CREATED', 'LEADER', id);
    res.status(201).json({ leader: rows[0] });
  }));

  app.put(`${base}/leaders/:id`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const scope = String(req.body?.signer_scope || '');
    if (!['PV01', 'CATP'].includes(scope)) fail(422, 'INVALID_SIGNER_SCOPE', 'Phạm vi người ký không hợp lệ.');
    const start = requireDay(req.body?.effective_from);
    const end = req.body?.effective_to ? requireDay(req.body.effective_to) : null;
    if (end && end < start) fail(422, 'INVALID_EFFECTIVE_RANGE', 'Thời hạn chức vụ không hợp lệ.');
    const { rows } = await pool.query(`update daily_report_leaders set full_name=$2,rank_name=$3,
      title=$4,signer_scope=$5,effective_from=$6,effective_to=$7
      where id=$1 and archived_at is null and deleted_at is null returning *`,
    [req.params.id, cleanText(req.body?.full_name, 180, 'Họ tên', true),
      cleanText(req.body?.rank_name, 120, 'Cấp bậc'), cleanText(req.body?.title, 180, 'Chức vụ', true),
      scope, start, end]);
    if (!rows.length) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy lãnh đạo đang sử dụng.');
    await audit(pool, req, 'LEADER_UPDATED', 'LEADER', req.params.id);
    res.json({ leader: rows[0] });
  }));

  app.post(`${base}/leaders/:id/archive`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const { rowCount } = await pool.query(`update daily_report_leaders set archived_at=now()
      where id=$1 and archived_at is null and deleted_at is null`, [req.params.id]);
    if (!rowCount) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy lãnh đạo.');
    await audit(pool, req, 'LEADER_ARCHIVED', 'LEADER', req.params.id);
    res.json({ ok: true });
  }));

  app.post(`${base}/leaders/:id/restore`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const { rowCount } = await pool.query(`update daily_report_leaders set archived_at=null
      where id=$1 and archived_at is not null and deleted_at is null`, [req.params.id]);
    if (!rowCount) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy lãnh đạo đã lưu trữ.');
    await audit(pool, req, 'LEADER_RESTORED', 'LEADER', req.params.id);
    res.json({ ok: true });
  }));

  app.post(`${base}/drafts`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const reportDate = requireDay(req.body?.report_day);
    const reportType = String(req.body?.report_type || '');
    if (!types.has(reportType)) fail(422, 'INVALID_REPORT_TYPE', 'Loại báo cáo không hợp lệ.');
    const id = randomUUID();
    const { rows } = await pool.query(`insert into daily_report_drafts
      (id,report_day,report_type,created_by) values ($1,$2,$3,$4) returning *`,
    [id, reportDate, reportType, req.dailyActor.id]);
    res.status(201).json({ draft: rows[0] });
  }));

  app.get(`${base}/drafts`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const { rows } = await pool.query(`select id,report_day,report_type,revision,signer_id,stale,
      created_at,updated_at from daily_report_drafts where created_by=$1 or $2::boolean
      order by updated_at desc limit 100`, [req.dailyActor.id, Boolean(req.dailyActor.is_admin)]);
    res.json({ drafts: rows });
  }));

  app.get(`${base}/drafts/:id`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const { rows: [draft] } = await pool.query(`select * from daily_report_drafts
      where id=$1 and (created_by=$2 or $3::boolean)`,
      [req.params.id, req.dailyActor.id, Boolean(req.dailyActor.is_admin)]);
    if (!draft) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy bản nháp.');
    const { rows: items } = await pool.query(`select * from daily_report_draft_items
      where draft_id=$1 order by section_code,sort_index,id`, [draft.id]);
    await assertArtifactScope(pool, req.dailyActor, items);
    res.json({ draft, items });
  }));

  app.get(`${base}/drafts/:id/history`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const { rows } = await pool.query(`select h.revision,h.snapshot,h.created_at from daily_report_draft_history h
      join daily_report_drafts d on d.id=h.draft_id where d.id=$1 and (d.created_by=$2 or $3::boolean) order by h.revision desc`,
    [req.params.id, req.dailyActor.id, Boolean(req.dailyActor.is_admin)]);
    for (const row of rows) await assertArtifactScope(pool, req.dailyActor, row.snapshot?.items);
    res.json({ history: rows });
  }));

  app.get(`${base}/composer/items`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const reportDate = requireDay(req.query.report_day);
    const offset = requireOffset(req.query.offset);
    const user = req.dailyActor;
    const globalCompiler = user.roles.some(role => role.role_code === 'PV01_COMPILER'
      && role.unit_id === null);
    const scopedUnits = [...new Set(user.roles.filter(role => role.role_code === 'PV01_COMPILER'
      && role.unit_id).map(role => Number(role.unit_id)))];
    if (user.unitId && hasRole(user, 'PV01_COMPILER', user.unitId)) scopedUnits.push(Number(user.unitId));
    const requestedUnit = req.query.unit_id ? Number(req.query.unit_id) : null;
    if (requestedUnit && !canAccessUnit(user, requestedUnit)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu trong phạm vi được phép.');
    }
    const allowedUnits = requestedUnit ? [requestedUnit] : [...new Set(scopedUnits)];
    if (!globalCompiler && allowedUnits.length === 0) fail(403, 'UNIT_REQUIRED', 'Chưa được giao đơn vị tổng hợp.');
    const includePending = req.query.include_pending === 'true';
    const { rows } = await pool.query(`
      select 'CASE_EVENT' as source_type,e.id as source_id,e.version,e.report_day,
        c.unit_id,c.stable_code,c.business_code,c.category_code,c.classifications,e.narrative as source_text,
        e.late_flag,case when c.current_state='VERIFIED' then e.state else c.current_state end as current_state
      from daily_report_case_events e join daily_report_cases c on c.id=e.case_id
      where e.report_day=$1 and (($5 and c.current_state in ('PENDING_REVIEW','RETURNED','RESUBMITTED','VERIFIED')
        and e.state<>'SUPERSEDED') or (c.current_state='VERIFIED' and e.state='VERIFIED'))
        and c.duplicate_state not in ('DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING')
        and ($2::boolean or c.unit_id=any($3::bigint[]))
      union all
      select 'WORK_RESULT',m.id,m.version,m.report_day,m.unit_id,m.metric_code,
        m.metric_code,'KET_QUA_CONG_TAC','[]'::jsonb,
        case when m.metric_code='DAILY_POLICE_WORK'
          then (m.metric_values || jsonb_build_object('_primitive_weapon_type',m.primitive_weapon_type,
            '_work_domain',m.work_domain,'_administrative_domains',m.administrative_domains))::text
          else m.metric_values::text end,
        m.late_flag,m.state
      from daily_report_metrics m where m.report_day=$1
        and (m.state='VERIFIED' or ($5 and m.state in ('PENDING_REVIEW','RETURNED')))
        and ($2::boolean or m.unit_id=any($3::bigint[]))
      union all
      select 'SITUATION',s.id,s.version,s.report_day,s.unit_id,
        s.category_codes::text,'SITUATION','TINH_HINH_KHAC','[]'::jsonb,s.narrative,false,s.state
      from daily_report_situations s where s.report_day=$1
        and (s.state='VERIFIED' or ($5 and s.state in ('PENDING_REVIEW','RETURNED')))
        and ($2::boolean or s.unit_id=any($3::bigint[]))
      order by source_type,source_id limit 1001 offset $4
    `, [reportDate, globalCompiler && !requestedUnit, allowedUnits, offset, includePending]);
    res.json({ next_offset: rows.length > 1000 ? offset + 1000 : null,
      items: rows.slice(0, 1000).map(item => ({ ...item,
      source_text: item.business_code === 'DAILY_POLICE_WORK'
        ? intakeMetricText(JSON.parse(item.source_text), JSON.parse(item.source_text)._primitive_weapon_type,
          JSON.parse(item.source_text)._work_domain, JSON.parse(item.source_text)._administrative_domains)
        : item.source_text,
      section_code: item.source_type === 'SITUATION' || (item.business_code === 'TINH_HINH_KHAC'
        && !item.classifications.some(group => group.business_code !== 'TINH_HINH_KHAC'))
        ? 'TINH_HINH_KHAC' : item.source_type === 'WORK_RESULT'
          ? item.business_code === 'GENERAL' ? 'CAC_MAT_CONG_TAC_KHAC' : 'KET_QUA_CONG_TAC'
          : 'NOI_DUNG'
    })) });
  }));

  app.put(`${base}/drafts/:id/items`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const globalCompiler = user.roles.some(role => role.role_code === 'PV01_COMPILER'
      && role.unit_id === null);
    const allowedUnits = [...new Set(user.roles.filter(role => role.role_code === 'PV01_COMPILER'
      && role.unit_id).map(role => Number(role.unit_id)))];
    if (user.unitId && hasRole(user, 'PV01_COMPILER', user.unitId)) allowedUnits.push(Number(user.unitId));
    const revision = Number(req.body?.revision);
    const items = req.body?.items;
    if (!Number.isInteger(revision) || !Array.isArray(items) || items.length > 1000) {
      fail(422, 'INVALID_DRAFT_ITEMS', 'Phiên bản hoặc danh sách ý không hợp lệ.');
    }
    const updated = await transaction(async client => {
      const { rows } = await client.query(`select * from daily_report_drafts where id=$1 for update`, [req.params.id]);
      const draft = rows[0];
      if (!draft || (!user.is_admin && Number(draft.created_by) !== Number(user.id))) {
        fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy bản nháp.');
      }
      await assertDraftScope(client, user, draft.id);
      if (draft.revision !== revision) fail(409, 'STALE_REVISION', 'Bản nháp đã được cập nhật.');
      if (req.body.leader_id) {
        const signer = await client.query(`select id from daily_report_leaders
          where id=$1 and deleted_at is null for share`, [req.body.leader_id]);
        if (!signer.rowCount) fail(422, 'SIGNER_NOT_AVAILABLE', 'Người ký đã bị xóa. Vui lòng chọn người ký khác.');
      }
      const documentFields = req.body.document_fields === undefined ? draft.document_fields
        : validateDocumentFields(req.body.document_fields, fail);
      await client.query(`update daily_report_draft_items set included=false where draft_id=$1`, [draft.id]);
      for (const item of items) {
        const sourceType = String(item.source_type || '');
        if (!['CASE_EVENT', 'WORK_RESULT', 'SITUATION'].includes(sourceType)) {
          fail(422, 'INVALID_SOURCE_TYPE', 'Loại nguồn không hợp lệ.');
        }
        let source;
        if (sourceType === 'CASE_EVENT') {
          const result = await client.query(`select e.*,c.stable_code,c.current_state,c.unit_id,c.business_code,c.category_code,
            c.duplicate_state,c.legal_article_id,c.legal_reference,c.classifications,c.counted_as_pphs,
            (select r.report_day::text from daily_report_count_records r where r.case_id=c.id) as counted_day
            from daily_report_case_events e join daily_report_cases c on c.id=e.case_id
            where e.id=$1 and c.current_state='VERIFIED' and e.state='VERIFIED'
              and c.duplicate_state not in ('DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING')
              and ($2::boolean or c.unit_id=any($3::bigint[]))`,
          [item.source_id, globalCompiler, allowedUnits]);
          source = result.rows[0];
        } else if (sourceType === 'WORK_RESULT') {
          const result = await client.query(`select * from daily_report_metrics
            where id=$1 and state='VERIFIED' and ($2::boolean or unit_id=any($3::bigint[]))`,
          [item.source_id, globalCompiler, allowedUnits]);
          source = result.rows[0];
        } else {
          const result = await client.query(`select * from daily_report_situations
            where id=$1 and state='VERIFIED' and ($2::boolean or unit_id=any($3::bigint[]))`,
          [item.source_id, globalCompiler, allowedUnits]);
          source = result.rows[0];
        }
        if (!source) fail(409, 'NOT_VERIFIED', 'Chỉ nguồn đã duyệt mới được đưa vào báo cáo.');
        if (dateKey(source.report_day) !== dateKey(draft.report_day)) {
          fail(422, 'SOURCE_DAY_MISMATCH', 'Nguồn phải thuộc đúng ngày báo cáo của bản nháp.');
        }
        const snapshot = JSON.parse(JSON.stringify(normalizeDates(source)));
        await client.query(`insert into daily_report_draft_items
          (id,draft_id,source_type,source_id,source_version,included,section_code,sort_index,edited_text,source_snapshot)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
          on conflict (draft_id,source_type,source_id) do update set
            source_version=excluded.source_version,included=excluded.included,
            section_code=excluded.section_code,sort_index=excluded.sort_index,
            edited_text=excluded.edited_text,source_snapshot=excluded.source_snapshot`,
        [randomUUID(), draft.id, sourceType, item.source_id,
          Number(source.version || 1), Boolean(item.included),
          cleanText(item.section_code || 'NOI_DUNG', 80, 'Đề mục', true),
          Math.max(0, Number(item.sort_index) || 0),
          item.edited_text == null ? null : cleanText(item.edited_text, 8000, 'Nội dung biên tập'),
          JSON.stringify(normalizeDates(snapshot))]);
      }
      const selected = await client.query(`select * from daily_report_draft_items
        where draft_id=$1 and included order by section_code,sort_index,id`, [draft.id]);
      const statistics = selectionStatistics(selected.rows);
      await client.query(`insert into daily_report_draft_history(draft_id,revision,snapshot,actor_id)
        values ($1,$2,$3::jsonb,$4)`, [draft.id, revision + 1,
        JSON.stringify({ items: selected.rows, statistics, document_fields: documentFields }), user.id]);
      await client.query(`update daily_report_drafts set statistics_snapshot=$2::jsonb,document_fields=$3::jsonb,signer_id=$4 where id=$1`,
        [draft.id, JSON.stringify(statistics), JSON.stringify(documentFields),
          req.body.leader_id === undefined ? draft.signer_id : req.body.leader_id || null]);
      const { rows: result } = await client.query(`update daily_report_drafts
        set revision=revision+1,stale=false,updated_at=now() where id=$1 returning *`, [draft.id]);
      await audit(client, req, 'DRAFT_ITEMS_UPDATED', 'DRAFT', draft.id, 'ALLOW', { count: items.length });
      return result[0];
    });
    res.json({ draft: updated });
  }));

  app.post(`${base}/drafts/:id/exports`, requireRole('PV01_COMPILER'), wrap(async (req, res) => {
    const reportType = String(req.body?.report_type || '');
    if (!types.has(reportType)) fail(422, 'INVALID_REPORT_TYPE', 'Loại báo cáo không hợp lệ.');
    const result = await transaction(async client => {
      const { rows: [draft] } = await client.query(`select * from daily_report_drafts where id=$1 for update`, [req.params.id]);
      if (!draft || (!req.dailyActor.is_admin && Number(draft.created_by) !== Number(req.dailyActor.id))) {
        fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy bản nháp.');
      }
      await assertDraftScope(client, req.dailyActor, draft.id);
      if (draft.revision !== Number(req.body?.expected_revision)) fail(409, 'EXPORT_STALE', 'Bản nháp đã thay đổi.');
      if (draft.stale) fail(409, 'EXPORT_STALE', 'Có dữ liệu nguồn mới; cần rà soát và lưu lại lựa chọn.');
      const { rows: items } = await client.query(`select * from daily_report_draft_items
        where draft_id=$1 and included order by section_code,sort_index,id`, [draft.id]);
      if (!items.length) fail(422, 'SELECTION_REQUIRED', 'Phải chọn ít nhất một ý trước khi xuất.');
      if (reportType !== draft.report_type) fail(422, 'REPORT_TYPE_MISMATCH', 'Loại văn bản khác bản nháp.');
      for (const item of items) {
        let live;
        if (item.source_type === 'CASE_EVENT') {
          live = await client.query(`select e.version,e.state,c.unit_id,c.current_state,c.duplicate_state,c.id as case_id
            from daily_report_case_events e join daily_report_cases c on c.id=e.case_id where e.id=$1`,
          [item.source_id]);
        } else {
          const table = item.source_type === 'WORK_RESULT' ? 'daily_report_metrics' : 'daily_report_situations';
          live = await client.query(`select * from ${table} where id=$1`, [item.source_id]);
        }
        const source = live.rows[0];
        if (source?.case_id && !['DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING'].includes(source.duplicate_state)) {
          const parent = await ownCase(req.dailyActor, source.case_id, client);
          if ((await duplicateCandidates(client, parent, req.dailyActor)).some(candidate => candidate.important)) {
            fail(409, 'DUPLICATE_REVIEW_REQUIRED', 'Có nghi vấn trùng quan trọng; đối chiếu trước khi xuất.');
          }
        }
        if (!source || !hasRole(req.dailyActor, 'PV01_COMPILER', source.unit_id)) {
          fail(403, 'SOURCE_SCOPE_REVOKED', 'Nguồn không còn trong phạm vi tổng hợp.');
        }
        if (source.state !== 'VERIFIED' || (source.current_state && source.current_state !== 'VERIFIED')
          || ['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].includes(source.duplicate_state)) {
          fail(409, 'NOT_VERIFIED', 'Nguồn chưa duyệt hoặc đã được loại trùng.');
        }
        if (Number(source.version || 1) !== item.source_version) fail(409, 'EXPORT_STALE', 'Nguồn đã thay đổi.');
      }
      if (items.some(item => item.source_snapshot?.current_state === 'RETURNED')) {
        fail(409, 'NOT_VERIFIED', 'Bản nháp có hồ sơ chưa duyệt.');
      }
      const signerRequired = reportType !== 'BANTIN_24H';
      let signer = null;
      if (signerRequired) {
        const { rows: signers } = await client.query(`select id,full_name,rank_name,title,signer_scope
          from daily_report_leaders where id=$1 and archived_at is null and deleted_at is null
            and effective_from <= $2 and (effective_to is null or effective_to >= $2) for share`,
        [req.body?.leader_id || null, draft.report_day]);
        signer = signers[0];
        if (!signer) fail(422, 'SIGNER_REQUIRED', 'Phải chọn người ký đang hiệu lực.');
        const expectedScope = ['BCN_BCA', 'BCN_TUUB'].includes(reportType) ? 'CATP' : 'PV01';
        if (signer.signer_scope !== expectedScope) fail(422, 'SIGNER_OUT_OF_SCOPE', 'Người ký không đúng phạm vi báo cáo.');
      }
      const document = createDailyReportDocument({
        reportType,
        reportDay: dateKey(draft.report_day),
        reportNumber: cleanText(req.body?.report_number ?? draft.document_fields?.number, 100, 'Số ký hiệu'),
        documentFields: draft.document_fields,
        items: items.map(item => ({
          included: true,
          section_code: item.section_code,
          business_code: item.source_snapshot.business_code,
          sort_index: item.sort_index,
          edited_text: item.edited_text,
          narrative: item.source_snapshot.narrative,
          summary: item.source_snapshot.metric_code === 'DAILY_POLICE_WORK'
            ? intakeMetricText(item.source_snapshot.metric_values, item.source_snapshot.primitive_weapon_type,
              item.source_snapshot.work_domain, item.source_snapshot.administrative_domains)
            : item.source_snapshot.summary || (item.source_snapshot.metric_values
            ? Object.entries(item.source_snapshot.metric_values).map(([key, value]) => `${key}: ${value}`).join('; ') : ''),
          source_version: item.source_version
        })),
        signer
      });
      const buffer = await Packer.toBuffer(document);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const exportId = randomUUID();
      const storageKey = `${exportId}.docx`;
      await mkdir(fileRoot, { recursive: true, mode: 0o700 });
      await writeFile(path.join(fileRoot, storageKey), buffer, { flag: 'wx', mode: 0o600 });
      const snapshot = items.map(item => ({
        source_type: item.source_type, source_id: item.source_id,
        source_version: item.source_version, section_code: item.section_code,
        edited_text: item.edited_text, source_snapshot: item.source_snapshot
      }));
      const { rows: exportRows } = await client.query(`insert into daily_report_exports
        (id,draft_id,revision,report_type,signer_snapshot,selection_snapshot,sha256,file_name,storage_key,generated_by,statistics_snapshot,document_snapshot)
        values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12::jsonb) returning *`,
      [exportId, draft.id, draft.revision, reportType, signer ? JSON.stringify(signer) : null,
        JSON.stringify(normalizeDates(snapshot)), checksum, `${reportType}-${dateKey(draft.report_day)}.docx`,
        storageKey, req.dailyActor.id, JSON.stringify(draft.statistics_snapshot),
        JSON.stringify(draft.document_fields)]);
      await audit(client, req, 'DOCX_EXPORTED', 'EXPORT', exportId, 'ALLOW', { sha256: checksum, revision: draft.revision });
      return exportRows[0];
    });
    res.status(201).json({ export: result });
  }));

  app.get(`${base}/exports/:id/download`, wrap(async (req, res) => {
    const user = req.dailyActor;
    if (!user.roles.some(role => role.role_code === 'PV01_COMPILER')) {
      fail(403, 'EXPORT_FORBIDDEN', 'Không đủ quyền tải báo cáo.');
    }
    const { rows } = await pool.query(`select id,file_name,storage_key,sha256,selection_snapshot
      from daily_report_exports where id=$1 and (generated_by=$2 or $3::boolean)`, [req.params.id, user.id, Boolean(user.is_admin)]);
    if (!rows.length) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tệp báo cáo.');
    await assertArtifactScope(pool, user, rows[0].selection_snapshot);
    const file = await readFile(path.join(fileRoot, path.basename(rows[0].storage_key)));
    if (createHash('sha256').update(file).digest('hex') !== rows[0].sha256) {
      fail(500, 'EXPORT_HASH_MISMATCH', 'Hash tệp báo cáo không khớp.');
    }
    await pool.query(`insert into daily_report_audit
      (actor_id,actor_unit_id,action,resource_type,resource_id,outcome,safe_metadata)
      values ($1,$2,'EXPORT_DOWNLOADED','EXPORT',$3,'ALLOW',$4::jsonb)`,
    [user.id, user.unitId, rows[0].id, JSON.stringify({ sha256: rows[0].sha256 })]);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${rows[0].file_name}"`);
    res.send(file);
  }));

  app.get(`${base}/exports/:id/preview`, wrap(async (req, res) => {
    const user = req.dailyActor;
    if (!user.roles.some(role => role.role_code === 'PV01_COMPILER')) {
      fail(403, 'EXPORT_FORBIDDEN', 'Không đủ quyền xem trước.');
    }
    const { rows } = await pool.query(`select storage_key,sha256,selection_snapshot from daily_report_exports
      where id=$1 and (generated_by=$2 or $3::boolean)`, [req.params.id, user.id, Boolean(user.is_admin)]);
    if (!rows.length) fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tệp báo cáo.');
    await assertArtifactScope(pool, user, rows[0].selection_snapshot);
    const { spawn } = await import('node:child_process');
    const renderer = process.env.DAILY_REPORT_DOCX_RENDERER;
    if (!renderer) fail(503, 'DOCX_RENDERER_NOT_CONFIGURED', 'Chưa cấu hình renderer DOCX được phê duyệt.');
    const original = await readFile(path.join(fileRoot, path.basename(rows[0].storage_key)));
    if (createHash('sha256').update(original).digest('hex') !== rows[0].sha256) {
      fail(500, 'EXPORT_HASH_MISMATCH', 'Hash tệp báo cáo không khớp.');
    }
    const sourceFile = path.join(fileRoot, path.basename(rows[0].storage_key));
    const { mkdtemp, readFile: read, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const temporary = await mkdtemp(path.join(tmpdir(), 'daily-report-preview-'));
    try {
      const child = spawn(renderer, ['--headless', '--convert-to', 'pdf', '--outdir', temporary, sourceFile], {
        stdio: ['ignore', 'ignore', 'pipe'], timeout: 45000, killSignal: 'SIGKILL'
      });
      let errorText = '';
      child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-1000); });
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      if (code !== 0) fail(503, 'DOCX_PREVIEW_FAILED', 'Không render được DOCX trong giới hạn thời gian.');
      const pdfName = `${path.basename(sourceFile, '.docx')}.pdf`;
      const pdf = await read(path.join(temporary, pdfName));
      await pool.query(`insert into daily_report_audit
        (actor_id,actor_unit_id,action,resource_type,resource_id,outcome)
        values ($1,$2,'EXPORT_PREVIEWED','EXPORT',$3,'ALLOW')`, [user.id, user.unitId, req.params.id]);
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline');
      res.send(pdf);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }));
  return { notificationFeed, stop: () => clearInterval(maintenanceTimer) };
}
