import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function verifyUnitIsolation({ request, login, admin, reporter, compiler, database,
  browser, base, output, check, errors, password }) {
  const api = '/api/bao-cao-ngay';
  const other = await login('demo.canbo03');
  const { data: scope } = await request(api + '/scope', { cookie: reporter });
  const { data: otherScope } = await request(api + '/scope', { cookie: other });
  const cases = [randomUUID(), randomUUID()];
  const contexts = [];
  const feed = async cookie => (await request('/api/notifications', { cookie })).data.items;
  const newPage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, domain: '127.0.0.1', path: '/api' }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    return page;
  };
  const person = { name: 'Đối tượng giả kiểm chứng', gender: 'MALE', date_of_birth: '1990-01-01',
    identity_number: '000000000001', permanent_address: 'Địa chỉ giả', current_address: 'Địa chỉ giả' };
  await mkdir(output + '/unit-isolation', { recursive: true });
  try {
    for (const [index, actor] of [scope, otherScope].entries()) {
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,created_by,title,persons)
        values($1,$2,$3,'TINH_HINH_KHAC','TEST',$4,$5,$6,$5,$7::jsonb)`,
      [cases[index], 'ISOLATION-' + cases[index], actor.unitId, scope.reportDay,
        'BÁO CÁO THỬ — phân quyền đơn vị ' + actor.unitId, actor.userId, JSON.stringify([person])]);
      await database.query(`insert into daily_report_unlock_requests
        (id,unit_id,report_day,scope_kind,scope_id,reason,status,requester_id,approved_at,expires_at)
        values($1,$2,$3,'CASE',$4,'BÁO CÁO THỬ','APPROVED',$5,now(),now()+interval '30 minutes')`,
      [randomUUID(), actor.unitId, scope.reportDay, cases[index], actor.userId]);
      assert.equal((await request(`${api}/cases/${cases[index]}/submit`, {
        cookie: index ? other : reporter, method: 'POST', body: {}
      })).status, 201);
      assert.equal((await request(`${api}/cases/${cases[index]}/return`, {
        cookie: compiler, method: 'POST', body: { reason: 'BÁO CÁO THỬ — bổ sung nội dung của đúng đơn vị' }
      })).status, 201);
    }
    const [ownFeed, otherFeed, compilerFeed, adminFeed] = await Promise.all(
      [reporter, other, compiler, admin].map(feed));
    assert.ok(ownFeed.every(item => String(item.dailyReportRef.unitId) === String(scope.unitId)));
    assert.ok(otherFeed.every(item => String(item.dailyReportRef.unitId) === String(otherScope.unitId)));
    const notice = ownFeed.find(item => item.eventType === 'CASE_RETURNED'
      && item.dailyReportRef.caseId === cases[0]);
    assert.ok(notice);
    assert.ok(!otherFeed.some(item => item.id === notice.id));
    assert.ok(cases.every(id => compilerFeed.some(item => item.dailyReportRef.caseId === id)));
    assert.ok(cases.every(id => adminFeed.some(item => item.dailyReportRef.caseId === id)));
    for (const [cookie, foreign] of [[other, cases[0]], [reporter, cases[1]]]) {
      for (const suffix of ['', '/attachments']) {
        assert.equal((await request(`${api}/cases/${foreign}${suffix}`, { cookie })).status, 404);
      }
      for (const [method, suffix, body] of [['PATCH', '', { version: 3, summary: 'Không được lưu' }],
        ['POST', '/submit', {}], ['POST', '/events', { narrative: 'Không được lưu' }]]) {
        assert.equal((await request(`${api}/cases/${foreign}${suffix}`, { cookie, method, body })).status, 404);
      }
    }
    assert.equal((await request(`/api/notifications/${notice.id}/read`, {
      cookie: other, method: 'POST', body: {}
    })).status, 404);
    await request('/api/notifications/read-all', { cookie: other, method: 'POST', body: {} });
    assert.equal((await database.query(`select 1 from daily_report_notification_reads
      where user_id=$1 and outbox_id=$2`, [otherScope.userId, notice.id.slice(4)])).rowCount, 0);
    const returned = await request(`${api}/cases?report_day=${scope.reportDay}&has_returns=true`, { cookie: other });
    assert.ok(returned.data.cases.every(item => String(item.unit_id) === String(otherScope.unitId)));
    check('Unit notification feeds, read receipts, returned lists and direct read/write links exclude other units');

    const ownerPage = await newPage(await login('demo.canbo02'));
    await ownerPage.locator('#notificationToggle').click();
    const ownNotice = ownerPage.locator(`[data-notification-item="server:${notice.id}"]`);
    await ownNotice.waitFor();
    await ownNotice.locator('[data-notification-open]').click();
    await ownerPage.locator('#bcnDetail[open]').waitFor();
    assert.equal(await ownerPage.locator('#bcnCaseEdit textarea[name=summary]').isEditable(), true);
    const updated = 'BÁO CÁO THỬ — đơn vị đã sửa đúng hồ sơ được trả lại';
    await ownerPage.locator('#bcnCaseEdit textarea[name=summary]').fill(updated);
    await ownerPage.locator('#bcnEditClassifications[data-legal-state=ready]').waitFor();
    await ownerPage.screenshot({ path: output + '/unit-isolation/owner-before-save.png' });
    const saved = ownerPage.waitForResponse(response => response.url().endsWith('/cases/' + cases[0])
      && response.request().method() === 'PATCH');
    await ownerPage.locator('#bcnCaseUpdate').click();
    assert.equal((await saved).status(), 200);
    const savedCase = (await request(`${api}/cases/${cases[0]}`, { cookie: reporter })).data.case;
    assert.equal(savedCase.summary, updated);
    assert.equal(savedCase.current_state, 'PENDING_REVIEW');
    assert.equal(await ownerPage.locator('[data-submit]').count(), 0);
    await ownerPage.screenshot({ path: output + '/unit-isolation/owner-resubmitted.png' });
    check('The recipient unit opens its returned notification, edits the case and resubmits in the browser');

    const foreignPage = await newPage(other);
    await foreignPage.locator('#notificationToggle').click();
    assert.equal(await foreignPage.locator(`[data-notification-item="server:${notice.id}"]`).count(), 0);
    await foreignPage.evaluate(async id => {
      try { await window.DailyReports.openNotification({ view: 'returned', caseId: id, resourceType: 'CASE' }); }
      catch { /* Expected: the server denies another unit's case. */ }
    }, cases[0]);
    assert.equal(await foreignPage.locator('#bcnDetail[open]').count(), 0);
    check('A different unit cannot open a returned case through a copied notification reference');

    const mismatched = await request('/api/notifications', {
      cookie: compiler, headers: { 'x-bcn-account-id': scope.userId }
    });
    assert.equal(mismatched.status, 401);
    assert.equal((await request('/api/me', { cookie: compiler })).status, 200,
      'Reject the old tab without revoking the newly selected account');
    const otherTab = await ownerPage.context().newPage();
    await otherTab.goto(base);
    await otherTab.evaluate(async password => {
      await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ttttch.pv01', password }) });
    }, password);
    await ownerPage.bringToFront();
    await ownerPage.evaluate(() => window.NotificationCenter.open());
    await ownerPage.locator('#loginScreen').waitFor({ state: 'visible' });
    assert.equal(await ownerPage.locator('#appShell').isVisible(), false);
    assert.equal(await ownerPage.locator('[data-notification-item]').count(), 0);
    await ownerPage.screenshot({ path: output + '/unit-isolation/account-switched.png' });
    check('Changing account in another tab clears the old workspace before displaying another account’s notifications');
  } finally {
    for (const context of contexts) await context.close();
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])', [cases]);
    await database.query(`delete from daily_report_returns where submission_id in
      (select id from daily_report_submissions where case_id=any($1::uuid[]))`, [cases]);
    await database.query('delete from daily_report_case_events where case_id=any($1::uuid[])', [cases]);
    await database.query('delete from daily_report_submissions where case_id=any($1::uuid[])', [cases]);
    await database.query('delete from daily_report_unlock_requests where scope_id=any($1::text[])', [cases]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [cases]);
  }
}
