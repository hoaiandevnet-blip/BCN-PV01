export const ASSIGNABLE_ROLES = ['UNIT_REPORTER', 'PV01_COMPILER', 'LEGAL_REVIEWER', 'AUDITOR'];

export function isPv01Unit(unit = {}) {
  if (unit.pv01_hierarchy === true) return true;
  return [unit.unit_code, unit.unit_name, unit.department_name].some(value =>
    /(?:^|[^A-Z0-9])PV\s*01(?:$|[^A-Z0-9])/i.test(String(value || '')));
}

export function effectiveDailyRoles(account, unit, roles) {
  if (account.is_admin) {
    return ASSIGNABLE_ROLES.map(role_code => ({ role_code, unit_id: null, metric_code: null }));
  }
  const pv01 = isPv01Unit(unit);
  return roles.filter(role => {
    if (!ASSIGNABLE_ROLES.includes(role.role_code)) return false;
    if (role.role_code === 'UNIT_REPORTER') {
      return unit.unit_id && String(role.unit_id) === String(unit.unit_id);
    }
    if (role.role_code === 'PV01_COMPILER') return pv01;
    return true;
  });
}

export function normalizeUnitGroup(unitType, unitName) {
  const value = String(unitType || '').toLocaleLowerCase('vi');
  const name = String(unitName || '').toLocaleLowerCase('vi');
  if (name.includes('đồn')) return 'DON';
  if (name.includes('cảng')) return 'CANG';
  if (value.includes('xã') || value.includes('phường')) return 'XA_PHUONG';
  if (value.includes('đồn')) return 'DON';
  if (value.includes('cảng')) return 'CANG';
  if (value.includes('phòng')) return 'PHONG';
  return null;
}

export async function entryActor(req, pool, fail) {
  const user = req.dailyActor;
  if (!user.is_admin) {
    if (req.body?.unit_id && String(req.body.unit_id) !== String(user.unitId)) {
      fail(403, 'UNIT_SCOPE_FORBIDDEN', 'Chỉ được nhập báo cáo cho đơn vị công tác của tài khoản.');
    }
    return user;
  }
  const unitId = Number(req.body?.unit_id || user.unitId);
  if (!Number.isSafeInteger(unitId) || unitId < 1) {
    fail(422, 'ENTRY_UNIT_REQUIRED', 'Chọn đơn vị báo cáo trước khi nhập dữ liệu.');
  }
  const { rows: [unit] } = await pool.query(`select t.id,t.name,d.unit_type,p.unit_group
    from teams t left join departments d on d.id=t.department_id
    left join daily_report_unit_profiles p on p.unit_id=t.id where t.id=$1`, [unitId]);
  if (!unit) fail(422, 'ENTRY_UNIT_INVALID', 'Đơn vị báo cáo không còn tồn tại.');
  return { ...user, unitId: unit.id, unitName: unit.name,
    unitGroup: unit.unit_group || normalizeUnitGroup(unit.unit_type, unit.name) };
}
