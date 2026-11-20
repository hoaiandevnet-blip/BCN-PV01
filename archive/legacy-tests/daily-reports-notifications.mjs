export async function runNotificationChecks({ ok, call, expect, database, body, setNow }) {
  const feed = async user => (await ok(user, '/api/notifications')).items.filter(item => item.kind === 'daily-report');
  setNow('2026-10-28T02:00:00Z');
  const item = (await ok(2, '/cases', { ...body, summary: 'Hồ sơ kiểm tra thông báo theo vai trò' })).case;
  await ok(2, `/cases/${item.id}/submit`, {});
  expect((await feed(2)).some(value => value.dailyReportRef.caseId === item.id), false,
    'reporter receives no routine submission notification');
  expect((await feed(4)).some(value => value.dailyReportRef.caseId === item.id), false,
    'compiler receives no routine submission notification');
  expect((await call(2, `/cases/${item.id}/request-supplement`, { reason: 'Không được gửi' })).status, 403,
    'reporter cannot send compiler supplement requests');
  expect((await call(4, `/cases/${item.id}/request-supplement`, { reason: ' ' })).status, 422,
    'supplement request requires meaningful content');
  await ok(4, `/cases/${item.id}/request-supplement`, { reason: 'Bổ sung nội dung và văn bản liên quan.' });
  const notice = (await feed(2)).find(value => value.eventType === 'CASE_SUPPLEMENT_REQUESTED'
    && value.dailyReportRef.caseId === item.id);
  expect(Boolean(notice), true, 'reporter receives PV01 supplement request');
  expect(notice.message.includes('Bổ sung nội dung và văn bản liên quan.'), true,
    'supplement notification includes the actual request');
  expect((await feed(3)).some(value => value.id === notice.id), false, 'other unit cannot receive request');
  expect((await call(3, `/api/notifications/${notice.id}/read`, {})).status, 404,
    'other unit cannot acknowledge notification');
  await ok(2, `/api/notifications/${notice.id}/read`, {});
  expect((await feed(2)).find(value => value.id === notice.id).read, true, 'read receipt persists');
  expect((await ok(2, `/cases/${item.id}`)).case.current_state, 'RETURNED',
    'supplement request releases pending submission for unit correction');
  await ok(2, `/cases/${item.id}/submit`, { response: 'Đã bổ sung theo yêu cầu.' });
  await ok(4, `/cases/${item.id}/return`, { reason: 'Cần chỉnh lý nội dung', requested_fields: ['Diễn biến'] });
  expect((await feed(2)).some(value => value.eventType === 'CASE_RETURNED'
    && value.dailyReportRef.caseId === item.id), true, 'return notification reaches the reporting unit');
  await ok(2, `/cases/${item.id}/submit`, {});
  await ok(4, `/cases/${item.id}/verify`, {});
  const allowedReporter = ['CASE_RETURNED', 'SOURCE_RETURNED', 'CASE_SUPPLEMENT_REQUESTED'];
  expect((await feed(2)).every(value => allowedReporter.includes(value.eventType)), true,
    'reporter feed contains only returns and supplement requests, including old stored events');
  setNow('2026-10-28T04:00:00Z');
  const request = await ok(2, '/unlock-requests', { report_day: '2026-10-28',
    scope: { kind: 'CASE', id: item.id }, reason: 'Xin mở lại để chỉnh sửa và nhập bổ sung' });
  const unlock = (await feed(4)).find(value => value.eventType === 'UNLOCK_REQUESTED'
    && value.dailyReportRef.resourceId === request.id);
  expect(Boolean(unlock), true, 'compiler receives unit request to reopen or supplement report');
  expect((await feed(4)).every(value => value.eventType === 'UNLOCK_REQUESTED'), true,
    'compiler feed excludes unrelated workflow and success events');
  expect((await feed(6)).some(value => value.dailyReportRef.resourceId === request.id), true,
    'compiler assigned to the unit receives unlock request');
  expect((await call(4, '/user-roles', { user_id: 6, role_code: 'PV01_COMPILER',
    unit_id: 10, submodules: ['registry'] }, 'PUT')).status, 403, 'compiler cannot grant itself permissions');
  expect((await call(1, '/user-roles', { user_id: 6, role_code: 'PV01_COMPILER',
    unit_id: 10, submodules: ['invented'] }, 'PUT')).status, 422, 'unknown submodule is rejected');
  expect((await call(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER',
    unit_id: 10, submodules: ['registry'] }, 'PUT')).status, 422, 'submodule configuration is compiler-only');
  await ok(1, '/user-roles', { user_id: 6, role_code: 'PV01_COMPILER',
    unit_id: 10, submodules: ['registry'] }, 'PUT');
  expect((await feed(6)).length, 0, 'compiler without unlock submodule receives no unlock notification');
  expect((await call(6, `/api/notifications/${unlock.id}/read`, {})).status, 404,
    'revoked submodule prevents acknowledgement');
  expect((await call(6, '/unlock-requests')).status, 403, 'direct unlock API enforces submodule permissions');
  expect((await call(6, '/drafts')).status, 403, 'direct composer API enforces submodule permissions');
  expect((await call(6, `/cases/${item.id}`)).status, 200, 'assigned registry remains available');
  expect((await ok(6, '/scope')).compilerModules, ['registry'], 'scope exposes only assigned submodules');
  await ok(1, '/user-roles', { user_id: 6, role_code: 'PV01_COMPILER',
    unit_id: 11, submodules: ['unlock'] }, 'PUT');
  expect((await ok(6, '/unlock-requests')).requests.some(value => value.id === request.id), false,
    'unlock permission for another unit does not borrow the registry grant unit scope');
  expect((await feed(6)).some(value => value.dailyReportRef.resourceId === request.id), false,
    'notification scope follows the unlock grant, not the union of unrelated grants');
  expect((await call(6, `/unlock-requests/${request.id}/decide`, { decision: 'APPROVED' })).status, 404,
    'cross-grant unit scope cannot approve a request');
  await ok(1, '/user-roles', { user_id: 6, role_code: 'PV01_COMPILER', unit_id: 11 }, 'DELETE');
  await database.query(`update daily_report_user_roles set submodules='["unlock"]',unit_id=11 where user_id=6`);
  expect((await feed(6)).length, 0, 'changed unit scope removes previously visible notifications');
  await database.query(`update daily_report_user_roles set unit_id=10,effective_to='2026-10-27' where user_id=6`);
  expect((await feed(6)).length, 0, 'expired compiler assignment receives no notifications');
  await database.query(`update daily_report_user_roles set effective_to=null,submodules=null where user_id=6`);
  await database.query('delete from user_permissions where user_id=6');
  expect((await feed(6)).length, 0, 'revoked module hides notifications');
  await database.query('insert into user_permissions select 6,id from permissions');
  await ok(4, `/unlock-requests/${request.id}/decide`, { decision: 'APPROVED', reason: 'Cho phép bổ sung' });
  expect((await feed(2)).every(value => allowedReporter.includes(value.eventType)), true,
    'unlock decisions remain on the request screen, not reporter notifications');
  await ok(4, '/api/notifications/read-all', {});
  expect((await feed(4)).every(value => value.read), true, 'mark all read applies to visible events');
  expect((await feed(6)).some(value => !value.read), true, 'read state remains per account');
  expect((await feed(5)).length, 0, 'unrelated legal reviewer receives no daily-report notifications');
  expect((await call(0, '/api/notifications')).status, 401, 'notifications require authentication');
  setNow('2026-10-28T02:00:00Z');
}
