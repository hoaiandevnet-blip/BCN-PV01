export const REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const REPORT_TYPES = ['BANTIN_24H', 'BCN_PV01', 'BCN_BCA', 'BCN_TUUB'];
export const CASE_STATES = [
  'DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'RETURNED', 'RESUBMITTED', 'VERIFIED'
];
export const UNIT_GROUPS = ['XA_PHUONG', 'PHONG', 'DON', 'CANG'];
export const BUSINESS_CODES = ['PPHS', 'TNXH', 'MA_TUY', 'KINH_TE', 'MOI_TRUONG',
  'PCCC_CNCH', 'TNGT', 'ANQG', 'TINH_HINH_KHAC', 'KHAC', 'CONG_NGHE_CAO', 'THAM_NHUNG', 'HOAT_DONG_TU_PHAP', 'TTXH'];
export const PETITION_CODES = ['KHIEU_KIEN_DONG_NGUOI', 'KHIEU_KIEN_LEN_TRUNG_UONG',
  'KHIEU_KIEN_PHUC_TAP_ANTT', 'BIEU_TINH', 'PHA_ROI_ANTT', 'DINH_CONG'];
export const LOCKABLE_SCOPES = ['CASE', 'SITUATION', 'WORK_RESULT'];
export const RESTRICTED_METRICS = new Set([
  'DETENTION', 'TIP_INTAKE_AND_RESOLUTION', 'INVESTIGATION'
]);

export function reportLocalTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

export function reportDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isBeforeCutoff(date) {
  return reportLocalTime(date) < '10:00:00';
}

export function isValidReportDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertMetricPermission(metricCode, unitGroup, assignedMetricCodes = []) {
  if (RESTRICTED_METRICS.has(metricCode) && unitGroup !== 'PHONG') {
    throw Object.assign(new Error('Chỉ đơn vị cấp phòng được nhập nhóm chỉ tiêu chuyên trách.'), {
      status: 403,
      code: 'METRIC_UNIT_GROUP_FORBIDDEN'
    });
  }
  if (RESTRICTED_METRICS.has(metricCode) && !assignedMetricCodes.includes(metricCode)) {
    throw Object.assign(new Error('Tài khoản chưa được giao nhập nhóm chỉ tiêu này.'), {
      status: 403,
      code: 'METRIC_NOT_ASSIGNED'
    });
  }
}

export function canAccessUnitScope(user, unitId) {
  if (user?.is_admin) return true;
  if (String(user?.unitId) === String(unitId)
    && hasDailyReportRole(user, 'UNIT_REPORTER', unitId)) return true;
  return (user?.roles || []).some(role => role.role_code === 'PV01_COMPILER'
    && (role.unit_id === null || String(role.unit_id) === String(unitId)));
}

export function hasDailyReportRole(user, roleCode, unitId = user?.unitId) {
  if (user?.is_admin) return ['UNIT_REPORTER', 'PV01_COMPILER', 'BCN_ADMIN', 'LEGAL_REVIEWER', 'AUDITOR']
    .includes(roleCode);
  return (user?.roles || []).some(role => role.role_code === roleCode
    && (role.unit_id === null || String(role.unit_id) === String(unitId)));
}

export function assertUnlockScope(request, unitId, reportDate, scopeKind, scopeId, now) {
  if (String(request.unit_id) !== String(unitId)
    || request.report_day !== reportDate
    || request.scope_kind !== scopeKind
    || String(request.scope_id) !== String(scopeId)
    || request.status !== 'APPROVED'
    || new Date(request.approved_at) > now
    || new Date(request.expires_at) <= now) {
    throw Object.assign(new Error('Không có quyền mở khóa còn hiệu lực cho phạm vi này.'), {
      status: 423,
      code: 'UNLOCK_SCOPE_MISMATCH'
    });
  }
}

export function unlockExpiry(approvedAt) {
  return new Date(new Date(approvedAt).getTime() + 30 * 60 * 1000);
}

export function validateCaseStateTransition(from, to) {
  const transitions = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['RETURNED', 'VERIFIED'],
    RETURNED: ['RESUBMITTED'],
    RESUBMITTED: ['PENDING_REVIEW'],
    VERIFIED: []
  };
  if (!transitions[from]?.includes(to)) {
    throw Object.assign(new Error(`Không thể chuyển hồ sơ từ ${from} sang ${to}.`), {
      status: 409,
      code: 'CASE_STATE_CONFLICT'
    });
  }
}
