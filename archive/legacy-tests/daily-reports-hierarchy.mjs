import { randomUUID } from 'node:crypto';
import { pv01UnitIds } from '../server/daily-reports/unit-ancestry.js';

export async function runHierarchyChecks({ ok, call, expect, database, login, body, setNow }) {
  await database.query(`alter table teams add column if not exists parent_team_id bigint;
    insert into teams(id,name,department_id,parent_team_id) values
      (99001,'Trung tâm thông tin chỉ huy',2,12),
      (99002,'Tổ trực thuộc trung tâm',2,99001),
      (99003,'Trung tâm thông tin chỉ huy',2,13),
      (99004,'Đội mã PV010',2,99005),
      (99005,'Đội vòng tham chiếu',2,99004);
    insert into users(id,username,is_admin,status,is_deleted,team_id) values
      (99001,'qa-hierarchy-compiler',false,'Hoạt động',false,99001),
      (99002,'qa-hierarchy-unassigned',false,'Hoạt động',false,99001),
      (99003,'qa-hierarchy-namesake',false,'Hoạt động',false,99003),
      (99004,'qa-hierarchy-grandchild',false,'Hoạt động',false,99002);
    insert into user_permissions select u.id,p.id from users u cross join permissions p
      where u.id between 99001 and 99004 on conflict do nothing`);
  for (const id of [99001, 99002, 99003, 99004]) await login(id);
  const listed = (await ok(1, '/role-assignments')).accounts;
  expect(listed.find(user => Number(user.id) === 99001).is_pv01, true,
    'role picker recognizes the command center under PV01');
  expect(listed.find(user => Number(user.id) === 99003).is_pv01, false,
    'an outside command-center namesake is not PV01');
  expect((await call(99002, '/scope')).status, 403,
    'PV01 descendants without an assigned role remain denied');
  await ok(1, '/user-roles', { user_id: 99001, role_code: 'PV01_COMPILER' }, 'PUT');
  expect((await ok(99001, '/scope')).roles, ['PV01_COMPILER'],
    'explicitly assigned compiler role works for a child of PV01');
  expect((await call(1, '/user-roles', { user_id: 99003, role_code: 'PV01_COMPILER' }, 'PUT')).status, 422,
    'outside namesake cannot be assigned compiler');
  await ok(1, '/user-roles', {
    user_id: 99004, role_code: 'PV01_COMPILER', submodules: ['unlock'], unit_id: 10
  }, 'PUT');
  expect((await call(99004, '/unlock-requests')).status, 200,
    'assigned grandchild can use its permitted unlock module');
  expect((await call(99004, '/drafts')).status, 403,
    'hierarchy membership does not bypass compiler submodule restrictions');
  setNow('2026-10-28T03:05:00Z');
  const id = randomUUID();
  const request = await ok(2, '/unlock-requests', {
    report_day: body.report_day, scope: { kind: 'CASE', id }, reason: 'Kiểm thử phân quyền đơn vị con PV01'
  });
  expect((await call(99002, `/unlock-requests/${request.id}/decide`, { decision: 'APPROVED' })).status, 403,
    'unassigned colleague cannot approve an unlock request');
  expect((await call(99001, `/unlock-requests/${request.id}/decide`, { decision: 'APPROVED' })).status, 200,
    'assigned command-center compiler can approve a scoped unlock request');
  const saved = await call(2, '/cases', { ...body, id });
  if (saved.status !== 201) throw new Error(`Unlocked case failed: ${JSON.stringify(saved)}`);
  expect(saved.status, 201,
    'reporter can save the exact case after command-center approval');
  await database.query('update teams set parent_team_id=13 where id=99001');
  expect((await call(99001, '/scope')).status, 403,
    'moving a child out of PV01 immediately removes effective compiler access');
  expect((await call(99004, '/scope')).status, 403,
    'moving an ancestor also removes descendant compiler access');
  await database.query('update teams set parent_team_id=12 where id=99001');
  expect((await ok(99001, '/scope')).roles, ['PV01_COMPILER'],
    'restoring the directory parent restores only the already assigned role');
  expect([...(await pv01UnitIds(database, [99004, 99005]))], [],
    'cyclic unrelated directory entries terminate without granting access');
  await ok(1, '/user-roles', { user_id: 99001, role_code: 'PV01_COMPILER' }, 'DELETE');
  expect((await call(99001, '/scope')).status, 403,
    'revocation still removes access for a PV01 child');
  setNow('2026-10-28T02:30:00Z');
}
