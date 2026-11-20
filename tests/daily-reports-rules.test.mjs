import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMetricPermission,
  assertUnlockScope,
  canAccessUnitScope,
  hasDailyReportRole,
  isBeforeCutoff,
  isValidReportDay,
  reportDay,
  unlockExpiry,
  validateCaseStateTransition
} from '../server/daily-reports/rules.js';

test('cutoff uses Asia/Ho_Chi_Minh and blocks exactly at 10:00', () => {
  assert.equal(isBeforeCutoff(new Date('2026-10-28T02:59:59.999Z')), true);
  assert.equal(isBeforeCutoff(new Date('2026-10-28T03:00:00.000Z')), false);
  assert.equal(reportDay(new Date('2026-10-27T17:00:00.000Z')), '2026-10-28');
});

test('report day parser rejects invalid calendar dates', () => {
  assert.equal(isValidReportDay('2026-10-28'), true);
  assert.equal(isValidReportDay('2026-02-30'), false);
  assert.equal(isValidReportDay('28-10-2026'), false);
});

test('restricted metrics require PHONG and explicit metric assignment', () => {
  assert.throws(() => assertMetricPermission('DETENTION', 'XA_PHUONG', ['DETENTION']), {
    code: 'METRIC_UNIT_GROUP_FORBIDDEN'
  });
  assert.throws(() => assertMetricPermission('INVESTIGATION', 'PHONG', []), {
    code: 'METRIC_NOT_ASSIGNED'
  });
  assert.doesNotThrow(() => assertMetricPermission('TIP_INTAKE_AND_RESOLUTION', 'PHONG', [
    'TIP_INTAKE_AND_RESOLUTION'
  ]));
});

test('unit scope blocks cross-unit ID access without explicit PV01 assignment', () => {
  const reporter = { unitId: 10, roles: [{ role_code: 'UNIT_REPORTER', unit_id: 10 }] };
  const assignedCompiler = { unitId: 99, roles: [{ role_code: 'PV01_COMPILER', unit_id: 11 }] };
  const globalCompiler = { unitId: 99, roles: [{ role_code: 'PV01_COMPILER', unit_id: null }] };
  assert.equal(canAccessUnitScope({ unitId: 10, roles: [] }, 10), false);
  assert.equal(canAccessUnitScope(reporter, 10), true);
  assert.equal(canAccessUnitScope(reporter, 11), false);
  assert.equal(canAccessUnitScope(assignedCompiler, 11), true);
  assert.equal(canAccessUnitScope(assignedCompiler, 12), false);
  assert.equal(canAccessUnitScope(globalCompiler, 12), true);
  assert.equal(hasDailyReportRole({ unitId: 10, roles: [] }, 'PV01_COMPILER'), false);
});

test('unlock is scoped and expires exactly 30 minutes after approval', () => {
  const approvedAt = new Date('2026-10-28T03:13:00.000Z');
  const request = {
    unit_id: 11,
    report_day: '2026-10-28',
    scope_kind: 'CASE',
    scope_id: 'case-1',
    status: 'APPROVED',
    approved_at: approvedAt,
    expires_at: unlockExpiry(approvedAt)
  };
  assert.equal(request.expires_at.toISOString(), '2026-10-28T03:43:00.000Z');
  assert.doesNotThrow(() => assertUnlockScope(request, 11, '2026-10-28', 'CASE', 'case-1',
    new Date('2026-10-28T03:42:59.999Z')));
  assert.throws(() => assertUnlockScope(request, 11, '2026-10-28', 'CASE', 'case-1',
    request.expires_at), { code: 'UNLOCK_SCOPE_MISMATCH' });
  assert.throws(() => assertUnlockScope(request, 12, '2026-10-28', 'CASE', 'case-1', approvedAt), {
    code: 'UNLOCK_SCOPE_MISMATCH'
  });
});

test('case state machine supports return/resubmit and rejects skipped states', () => {
  assert.doesNotThrow(() => validateCaseStateTransition('PENDING_REVIEW', 'RETURNED'));
  assert.doesNotThrow(() => validateCaseStateTransition('RETURNED', 'RESUBMITTED'));
  assert.throws(() => validateCaseStateTransition('DRAFT', 'VERIFIED'), {
    code: 'CASE_STATE_CONFLICT'
  });
});
