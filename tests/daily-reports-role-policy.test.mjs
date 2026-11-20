import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveDailyRoles, isPv01Unit, ASSIGNABLE_ROLES } from '../server/daily-reports/role-policy.js';
import { canAccessUnitScope, hasDailyReportRole } from '../server/daily-reports/rules.js';

test('only system Admin inherits full operational privileges; old BCN_ADMIN grants confer no access', () => {
  const roles = effectiveDailyRoles({ is_admin: true }, {}, []);
  assert.deepEqual(roles.map(role => role.role_code), ASSIGNABLE_ROLES);
  assert.ok(roles.every(role => role.unit_id === null));
  assert.equal(canAccessUnitScope({ is_admin: true, roles: [] }, 999), true);
  assert.equal(hasDailyReportRole({ is_admin: true }, 'PV01_COMPILER'), true);
  assert.equal(hasDailyReportRole({ is_admin: true }, 'UNRECOGNIZED'), false);
  assert.deepEqual(effectiveDailyRoles({}, {}, [{ role_code: 'BCN_ADMIN', unit_id: null }]), []);
});

test('PV01 identity uses authoritative unit metadata without matching other codes', () => {
  for (const unit of [{ unit_name: 'PV01' }, { unit_name: 'Phòng PV01 - Tham mưu' },
    { department_name: 'Phòng PV01' }, { unit_code: 'PV01' }]) assert.equal(isPv01Unit(unit), true);
  for (const unit of [{ unit_name: 'PV010' }, { unit_name: 'PC01' }, { unit_name: 'Đơn vị 101' }, {}]) {
    assert.equal(isPv01Unit(unit), false);
  }
});

test('unit reporters cannot carry reporting access after transfer, or become compilers outside PV01', () => {
  const roles = [{ role_code: 'UNIT_REPORTER', unit_id: 10 }, { role_code: 'PV01_COMPILER', unit_id: null }];
  assert.deepEqual(effectiveDailyRoles({}, { unit_id: 10, unit_name: 'PC02' }, roles), [roles[0]]);
  assert.deepEqual(effectiveDailyRoles({}, { unit_id: 11, unit_name: 'PC02' }, roles), []);
  assert.deepEqual(effectiveDailyRoles({}, { unit_id: 10, unit_name: 'PV01' }, roles), roles);
});

test('PV01 accounts only receive their individually assigned roles, never compiler access from unit membership', () => {
  const unit = { unit_id: 12, unit_name: 'PV01' };
  const reporter = { role_code: 'UNIT_REPORTER', unit_id: 12 };
  const compiler = { role_code: 'PV01_COMPILER', unit_id: null };
  assert.deepEqual(effectiveDailyRoles({}, unit, []), []);
  assert.deepEqual(effectiveDailyRoles({}, unit, [reporter]), [reporter]);
  assert.deepEqual(effectiveDailyRoles({}, unit, [compiler]), [compiler]);
  assert.deepEqual(effectiveDailyRoles({}, { unit_id: 11, unit_name: 'PC02' }, [reporter, compiler]), []);
});
