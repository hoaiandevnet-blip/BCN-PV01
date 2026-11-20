import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function verifyReportNotifications({ request, admin, reporter, compiler, database,
  browser, base, output, check, errors }) {
  const endpoint = '/api/notifications';
  const { data: scope } = await request('/api/bao-cao-ngay/scope', { cookie: reporter });
  const compilerId = (await database.query("select id from users where username='ttttch.pv01'")).rows[0].id;
  const roles = (await database.query('select * from daily_report_user_roles where user_id=$1', [compilerId])).rows;
  const caseIds = [randomUUID(), randomUUID()];
  const unlockIds = [randomUUID(), randomUUID()];
  let extraRole;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [cookieName, cookieValue] = compiler.split('=');
  await context.addCookies([{ name: cookieName, value: cookieValue, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const setRoles = async (unit, modules) => database.query(`update daily_report_user_roles
    set unit_id=$2,submodules=$3::jsonb where user_id=$1`, [compilerId, unit, JSON.stringify(modules)]);
  const list = async () => {
    const response = await request(endpoint, { cookie: compiler });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data.items;
  };
  const measureBell = async () => {
    const delta = await page.locator('#notificationToggle').evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg').getBoundingClientRect();
      return { x: icon.x + icon.width / 2 - bounds.x - bounds.width / 2,
        y: icon.y + icon.height / 2 - bounds.y - bounds.height / 2 };
    });
    assert.ok(Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5, JSON.stringify(delta));
  };
  try {
    await request(endpoint + '/read-all', { cookie: compiler, method: 'POST', body: {} });
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await measureBell();
    for (const [index, unit] of [114, 124].entries()) {
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,created_by,reference_info)
        values($1,$2,$3,'PPHS','TEST',$4,'BÁO CÁO THỬ — kiểm chứng thông báo',$5,'{"subjects":[]}')`,
      [caseIds[index], 'NOTICE-' + caseIds[index], unit, scope.reportDay, scope.userId]);
      await database.query(`insert into daily_report_case_events
        (id,case_id,report_day,event_kind,narrative,source_user_id)
        values($1,$2,$3,'INITIAL_REPORT','BÁO CÁO THỬ — kiểm chứng thông báo',$4)`,
      [randomUUID(), caseIds[index], scope.reportDay, scope.userId]);
      await database.query(`insert into daily_report_unlock_requests
        (id,unit_id,report_day,scope_kind,scope_id,reason,status,requester_id,approved_at,expires_at)
        values($1,$2,$3,'CASE',$4,'Notification verification','APPROVED',$5,now(),now()+interval '30 minutes')`,
      [unlockIds[index], unit, scope.reportDay, caseIds[index], scope.userId]);
      assert.ok(!(await list()).some(item => item.dailyReportRef.caseId === caseIds[index]),
        'An unsubmitted draft must not notify the compiler');
      const sent = await request(`/api/bao-cao-ngay/cases/${caseIds[index]}/submit`, {
        cookie: index === 0 ? reporter : admin, method: 'POST', body: {}
      });
      assert.equal(sent.status, 201, JSON.stringify(sent.data));
    }
    const incoming = (await list()).filter(item => caseIds.includes(item.dailyReportRef.caseId));
    assert.equal(incoming.length, 2);
    assert.ok(incoming.every(item => item.eventType === 'CASE_SUBMITTED' && !item.read));
    const first = incoming.find(item => item.dailyReportRef.caseId === caseIds[0]);
    const second = incoming.find(item => item.dailyReportRef.caseId === caseIds[1]);
    await page.locator('#notificationToggle').click();
    const notice = page.locator(`[data-notification-item="server:${first.id}"]`);
    await notice.waitFor({ timeout: 12000 });
    assert.match(await notice.innerText(), /Xã An Phước/);
    assert.ok((await notice.innerText()).includes('Ngày báo cáo ' + scope.reportDay.split('-').reverse().join('/')));
    assert.equal(await page.locator('[data-notification-badge]').innerText(), '2');
    await measureBell();
    await mkdir(output + '/notifications', { recursive: true });
    await page.screenshot({ path: output + '/notifications/compiler-incoming.png' });
    await notice.locator('[data-notification-open]').click();
    await page.locator('#bcnDetail[open]').waitFor();
    assert.match(await page.locator('#bcnDetail').innerText(), /BÁO CÁO THỬ — kiểm chứng thông báo/);
    assert.match(await page.locator('#bcnDetail').innerText(), /Chờ duyệt/);
    await page.screenshot({ path: output + '/notifications/open-case.png' });
    await page.locator('#bcnDetail').evaluate(dialog => dialog.close());
    assert.equal((await list()).find(item => item.id === first.id).read, true);
    check('A real unit submission appears automatically in the compiler bell, with a centred icon and working case link');

    await setRoles(114, ['registry']);
    extraRole = (await database.query(`insert into daily_report_user_roles
      (user_id,role_code,unit_id,submodules) values($1,'PV01_COMPILER',124,'["unlock"]') returning id`,
    [compilerId])).rows[0].id;
    assert.ok((await list()).some(item => item.id === first.id));
    assert.ok(!(await list()).some(item => item.id === second.id));
    assert.equal((await request(`${endpoint}/${second.id}/read`, {
      cookie: compiler, method: 'POST', body: {}
    })).status, 404);
    await request(endpoint + '/read-all', { cookie: compiler, method: 'POST', body: {} });
    assert.equal((await database.query(`select 1 from daily_report_notification_reads
      where user_id=$1 and outbox_id=$2`, [compilerId, second.id.slice(4)])).rowCount, 0);
    await database.query('delete from daily_report_user_roles where id=$1', [extraRole]);
    extraRole = null;
    await setRoles(null, ['unlock']);
    assert.ok(!(await list()).some(item => caseIds.includes(item.dailyReportRef.caseId)));
    assert.equal((await request(`${endpoint}/${first.id}/read`, {
      cookie: compiler, method: 'POST', body: {}
    })).status, 404);
    const ownFeed = await request(endpoint, { cookie: reporter });
    assert.ok(!ownFeed.data.items.some(item => item.dailyReportRef.caseId === caseIds[1]));
    check('Notification access and read-all respect report-specific unit grants; unlock-only roles and old receipts grant no access');

    await setRoles(null, ['composer']);
    const composerFeed = (await list()).filter(item => caseIds.includes(item.dailyReportRef.caseId));
    assert.equal(composerFeed.length, 2);
    assert.ok(composerFeed.every(item => item.dailyReportRef.view === 'composer'));
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#notificationToggle').click();
    await page.locator(`[data-notification-item="server:${second.id}"] [data-notification-open]`).click();
    await page.locator('#dailyReports[data-bcn-active-view=composer]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#bcnComposerRows')?.textContent
      .includes('BÁO CÁO THỬ — kiểm chứng thông báo'));
    assert.equal(await page.locator('#bcnComposeDay').inputValue(), scope.reportDay);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await measureBell();
    }
    check('Composer-only accounts receive reports and open the correct day/unit directly in the permitted aggregation screen');
  } catch (error) {
    console.error('NOTIFICATION CHECK FAILED', error);
    await mkdir(output + '/notifications', { recursive: true });
    await page.screenshot({ path: output + '/notifications/failure.png' });
    throw error;
  } finally {
    await context.close();
    if (extraRole) await database.query('delete from daily_report_user_roles where id=$1', [extraRole]);
    for (const role of roles) {
      await database.query('update daily_report_user_roles set unit_id=$2,submodules=$3::jsonb where id=$1',
        [role.id, role.unit_id, role.submodules === null ? null : JSON.stringify(role.submodules)]);
    }
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])', [caseIds]);
    await database.query(`delete from daily_report_outbox where resource_type='CASE_EVENT'
      and resource_id in (select id::text from daily_report_case_events where case_id=any($1::uuid[]))`, [caseIds]);
    await database.query('delete from daily_report_case_events where case_id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_submissions where case_id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_unlock_requests where id=any($1::uuid[])', [unlockIds]);
  }
}
