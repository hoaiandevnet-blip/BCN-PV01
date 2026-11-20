import { randomUUID } from 'node:crypto';

export async function runRolePolicyChecks({ ok, call, expect, database, body, login, setNow }) {
  setNow('2026-10-28T02:30:00Z');
  await database.query(`insert into users(id,username,is_admin,status,is_deleted,team_id)
    values(20,'qa-role-reporter',false,'Hoạt động',false,10),
      (21,'qa-role-pv01',false,'Hoạt động',false,12),
      (22,'qa-role-other',false,'Hoạt động',false,11),
      (23,'qa-role-no-unit',false,'Hoạt động',false,null),
      (24,'qa-pv01-selected',false,'Hoạt động',false,12),
      (25,'qa-pv01-unassigned',false,'Hoạt động',false,12)`);
  for (const id of [20, 21, 22, 23, 24, 25]) await login(id);
  const admin = await ok(1, '/scope');
  expect(admin.roles.includes('PV01_COMPILER') && admin.roles.includes('UNIT_REPORTER'), true,
    'Admin inherits full operations without role assignments');
  expect(admin.roles.includes('BCN_ADMIN'), false, 'no assignable administrator role appears in scope');
  expect((await database.query('select count(*)::int as count from daily_report_user_roles where user_id=1'))
    .rows[0].count, 0, 'Admin authority is inherited, never persisted as artificial operational grants');
  expect((await call(1, '/user-roles', { user_id: 20, role_code: 'BCN_ADMIN' }, 'PUT')).status, 422,
    'API rejects retired BCN administrator assignment');
  expect((await call(1, '/user-roles', { user_id: 1, role_code: 'AUDITOR' }, 'PUT')).status, 422,
    'system Admin does not require an extra role');
  await database.query(`insert into user_permissions select 25,id from permissions on conflict do nothing`);
  expect((await call(25, '/scope')).status, 403,
    'PV01 membership and module access alone never confer operational roles');
  const pv01Reporter = (await ok(1, '/user-roles', { user_id: 21, role_code: 'UNIT_REPORTER' }, 'PUT')).role;
  expect(Number(pv01Reporter.unit_id), 12, 'PV01 reporter role is assigned to the current PV01 unit');
  expect((await ok(21, '/scope')).roles, ['UNIT_REPORTER'],
    'PV01 reporter does not automatically become a compiler');
  const pv01Case = (await ok(21, '/cases', { ...body, summary: 'PV01 nhập báo cáo theo phân công' })).case;
  const pv01Stored = (await database.query('select unit_id from daily_report_cases where id=$1',
    [pv01Case.id])).rows[0];
  expect(Number(pv01Stored.unit_id), 12, 'PV01 reporter can enter reports for the assigned unit');
  expect((await call(21, '/cases', { ...body, unit_id: 11 })).status, 403,
    'PV01 reporter cannot enter reports for another unit');
  expect((await call(21, '/drafts')).status, 403, 'PV01 reporter cannot open compilation API');
  const selected = (await ok(1, '/user-roles', { user_id: 24, role_code: 'PV01_COMPILER' }, 'PUT')).role;
  expect((await ok(24, '/scope')).roles, ['PV01_COMPILER'],
    'only the individually selected PV01 account receives compiler access');
  expect((await call(24, '/drafts')).status, 200, 'selected PV01 compiler can access report drafts');
  expect((await ok(21, '/scope')).roles, ['UNIT_REPORTER'],
    'granting compiler to a colleague leaves the PV01 reporter unchanged');
  expect((await call(25, '/drafts')).status, 403, 'other unassigned PV01 accounts still cannot compile');
  await ok(1, '/user-roles', selected, 'DELETE');
  expect((await call(24, '/drafts')).status, 403, 'revoking the selected compiler removes access immediately');
  expect((await call(1, '/user-roles', { user_id: 20, role_code: 'PV01_COMPILER' }, 'PUT')).status,
    422, 'non-PV01 account cannot be assigned compiler');
  expect((await call(1, '/user-roles', { user_id: 20, role_code: 'UNIT_REPORTER', unit_id: 11 }, 'PUT')).status,
    422, 'reporter cannot be assigned another unit');
  expect((await call(1, '/user-roles', { user_id: 23, role_code: 'UNIT_REPORTER' }, 'PUT')).status,
    422, 'account without a unit cannot receive reporter access');
  expect((await call(20, '/scope')).status, 403, 'new account starts without module or business access');
  const role = (await ok(1, '/user-roles', { user_id: 20, role_code: 'UNIT_REPORTER' }, 'PUT')).role;
  expect(Number(role.unit_id), 10, 'reporter assignment derives the current account unit');
  const granted = await database.query(`select m.module_key from user_permissions up
    join permissions p on p.id=up.permission_id join modules m on m.id=p.module_id where up.user_id=20`);
  expect(granted.rows.map(item => item.module_key), ['dailyReports'],
    'role assignment grants only Daily Reports module access in the same transaction');
  expect((await ok(20, '/scope')).roles, ['UNIT_REPORTER'], 'new reporter has exactly the assigned role');
  expect((await ok(20, '/units')).units.map(unit => Number(unit.id)), [10],
    'reporter unit lookup returns only the currently assigned unit');
  const allUnits = (await database.query('select id from teams order by name')).rows;
  expect((await ok(1, '/units')).units.map(unit => Number(unit.id)), allUnits.map(unit => Number(unit.id)),
    'Admin unit lookup returns every unit');
  for (const route of ['/situations', '/work-results', '/unlock-requests']) {
    expect((await call(20, route, { unit_id: 11 })).status, 403,
      `${route} rejects entering for a unit outside the account assignment`);
  }
  await ok(1, '/user-roles', { user_id: 22, role_code: 'UNIT_REPORTER' }, 'PUT');
  expect((await call(20, '/cases', { ...body, unit_id: 11 })).status, 403,
    'spoofed entry unit is rejected server-side');
  const item = (await ok(20, '/cases', { ...body, summary: 'Vai trò nhập báo cáo thử' })).case;
  expect((await call(22, `/cases/${item.id}`)).status, 404, 'another unit cannot read the new reporter case');
  expect((await call(20, '/user-roles', { user_id: 22, role_code: 'AUDITOR' }, 'PUT')).status, 403,
    'reporter cannot grant roles to another account');
  await ok(20, `/cases/${item.id}/submit`, {});
  const notices = await ok(1, '/notifications');
  expect(notices.notifications.some(event => event.resource_id === item.id), true,
    'Admin receives operational notifications without compiler grants');
  await ok(1, `/cases/${item.id}/verify`, {});
  expect((await ok(20, `/cases/${item.id}`)).case.current_state, 'VERIFIED',
    'Admin can review a unit submission using inherited authority');
  const entered = (await ok(1, '/cases', { ...body, unit_id: 11, summary: 'Admin nhập cho đơn vị thử' })).case;
  const stored = (await database.query('select unit_id,created_by from daily_report_cases where id=$1',
    [entered.id])).rows[0];
  expect([Number(stored.unit_id), Number(stored.created_by)], [11, 1],
    'Admin chooses the reporting unit while the real creating account remains Admin');
  const foreignDraft = (await database.query('select id from daily_report_drafts where created_by=4 limit 1')).rows[0];
  expect((await call(1, `/drafts/${foreignDraft.id}`)).status, 200, 'Admin can inspect compiler drafts');
  const exported = (await database.query('select id from daily_report_exports where generated_by=4 limit 1')).rows[0];
  expect((await call(1, `/exports/${exported.id}/download`)).status, 200, 'Admin can download compiler reports');
  const compiler = (await ok(1, '/user-roles', { user_id: 21, role_code: 'PV01_COMPILER' }, 'PUT')).role;
  expect((await ok(21, '/scope')).roles.sort(), ['PV01_COMPILER', 'UNIT_REPORTER'],
    'an administrator can explicitly grant both roles to the same PV01 account');
  await database.query("insert into daily_report_user_roles(user_id,role_code) values(22,'BCN_ADMIN')");
  expect((await call(22, '/role-assignments')).status, 403, 'legacy BCN_ADMIN row cannot elevate a regular account');
  await database.query('update users set team_id=12 where id=20');
  expect((await call(20, '/scope')).status, 403, 'reporter grant stops granting access after transfer to PV01');
  await database.query('update users set team_id=11 where id=21');
  expect((await call(21, '/scope')).status, 403, 'compiler grant stops granting access after leaving PV01');
  await database.query('update users set team_id=12 where id=21');
  await ok(1, '/user-roles', compiler, 'DELETE');
  expect((await ok(21, '/scope')).roles, ['UNIT_REPORTER'],
    'revoking compiler preserves the explicitly assigned reporter role');
  expect((await call(21, '/drafts')).status, 403, 'reporter cannot retain compilation after compiler revocation');
  await ok(1, '/user-roles', pv01Reporter, 'DELETE');
  expect((await call(21, '/scope')).status, 403, 'revoked last role removes operational access immediately');
  setNow('2026-10-28T03:05:00Z');
  const id = randomUUID();
  expect((await call(1, '/cases', { ...body, id, unit_id: 10 })).status, 423,
    'full Admin privileges preserve the reporting-window business rule');
  const unlock = await ok(1, '/unlock-requests', { unit_id: 10, report_day: body.report_day,
    scope: { kind: 'CASE', id }, reason: 'Admin kiểm thử mở lại đúng đơn vị và hồ sơ' });
  expect((await ok(1, '/unlock-requests')).requests.some(item => item.id === unlock.id), true,
    'Admin can see unlock requests across units without stored assignments');
  await ok(1, `/unlock-requests/${unlock.id}/decide`, { decision: 'APPROVED' });
  expect((await call(1, '/cases', { ...body, id, unit_id: 10 })).status, 201,
    'Admin can complete the scoped unlock and intake workflow');
  setNow('2026-10-28T02:30:00Z');
}
