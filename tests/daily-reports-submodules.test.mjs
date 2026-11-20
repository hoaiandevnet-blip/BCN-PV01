import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { routeModules, restrictCompilerRequest, availableModules } from '../server/daily-reports/submodule-permissions.js';

const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const compiler = (submodules, unit_id = 114) => ({ role_code: 'PV01_COMPILER', submodules, unit_id });
const restrict = (path, method, roles, query = {}) => {
  const request = { path, method, query, dailyActor: { roles } };
  restrictCompilerRequest(request, fail);
  return request.dailyActor.roles;
};

test('creating an unlock request requires Input, while history and decisions retain Unlock scope', () => {
  const input = { role_code: 'UNIT_REPORTER', submodules: ['input'] };
  const history = { role_code: 'UNIT_REPORTER', submodules: ['unlock'] };
  assert.deepEqual(restrict('/unlock-requests', 'POST', [input, history]), [input]);
  assert.throws(() => restrict('/unlock-requests', 'POST', [history]), { code: 'SUBMODULE_FORBIDDEN' });
  assert.deepEqual(restrict('/unlock-requests', 'GET', [input, history]), [history]);
  assert.deepEqual(restrict('/unlock-requests/sample/decide', 'POST', [compiler(['unlock'])]),
    [compiler(['unlock'])]);
});

test('case, source and event review require the independent approval grant', () => {
  for (const resource of ['cases', 'work-results', 'events']) {
    for (const action of ['verify', 'return', 'request-supplement']) {
      const path = `/${resource}/sample/${action}`;
      assert.deepEqual(routeModules(path, 'POST'), ['approval']);
      for (const module of ['registry', 'returned', 'updates', 'input']) {
        assert.throws(() => restrict(path, 'POST', [compiler([module])]), { code: 'SUBMODULE_FORBIDDEN' });
      }
      assert.equal(restrict(path, 'POST', [compiler(['approval'])]).length, 1);
    }
  }
});

test('approval uses its own unit scope even when registry access covers every unit', () => {
  const lookup = compiler(['registry'], null);
  const review = compiler(['approval'], 114);
  const roles = [lookup, review];
  assert.deepEqual(restrict('/cases/sample/verify', 'POST', roles), [review]);
  assert.deepEqual(restrict('/cases', 'GET', roles, { workspace: 'approval' }), [review]);
  assert.deepEqual(restrict('/cases/sample', 'GET', roles, { workspace: 'registry' }), [lookup]);
  assert.deepEqual(restrict('/work-results/sample/attachments', 'GET', roles,
    { workspace: 'approval' }), [review]);
});

test('registry and approval alone cannot edit, submit, or upload to a case', () => {
  for (const modules of [['registry'], ['approval']]) {
    for (const [path, method] of [['/reference-cases/sample', 'PATCH'], ['/cases/sample', 'PATCH'],
      ['/cases/sample/submit', 'POST'], ['/cases/sample/attachments', 'POST'],
      ['/work-results/sample/attachments/file', 'DELETE']]) {
      assert.throws(() => restrict(path, method, [compiler(modules)]), { code: 'SUBMODULE_FORBIDDEN' });
    }
  }
  assert.ok(!availableModules({ roles: [{ role_code: 'UNIT_REPORTER' }] }).includes('approval'));
});

test('review buttons depend on both the current workspace and submitted state', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../assets/js/daily-reports-review.js', import.meta.url), 'utf8'), context);
  const review = context.window.DailyReportsReview;
  const scope = { roles: ['PV01_COMPILER'], compilerModules: ['registry', 'approval'] };
  for (const view of ['registry', 'returned', 'updates', 'input']) {
    assert.equal(review.actions(scope, view, 'PENDING_REVIEW').verify, false);
    assert.equal(review.actions(scope, view, 'VERIFIED').supplement, false);
  }
  assert.equal(review.actions(scope, 'approval', 'RESUBMITTED').verify, true);
  assert.equal(review.actions(scope, 'approval', 'VERIFIED').supplement, true);
  assert.equal(review.actions(scope, 'approval', 'VERIFIED').verify, false);
  assert.equal(review.actions(scope, 'approval', 'DRAFT').supplement, false);
  assert.equal(review.actions(scope, 'approval', 'RETURNED').supplement, false);
});
