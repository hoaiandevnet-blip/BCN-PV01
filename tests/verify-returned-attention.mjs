import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function verifyReturnedAttention({ request, login, reporter, compiler, database,
  browser, base, output, check, errors }) {
  const api = '/api/bao-cao-ngay';
  const { data: scope } = await request(api + '/scope', { cookie: reporter });
  const caseIds = [randomUUID(), randomUUID()];
  const workId = randomUUID();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [name, value] = (await login('demo.canbo02')).split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const outputDir = output + '/returned-attention';
  await mkdir(outputDir, { recursive: true });
  const badge = page.locator('[data-returned-badge]');
  const feed = async () => (await request('/api/notifications', { cookie: reporter })).data.items;
  const waitCount = async count => {
    await page.waitForFunction(count => {
      const badge = document.querySelector('[data-returned-badge]');
      return badge.textContent === String(count) && badge.hidden === (count === 0);
    }, count, { timeout: 15000 });
    assert.equal(await page.locator('#returnedReportAlert').count(), 0);
    assert.equal(await badge.getAttribute('hidden') === null, count > 0);
  };
  const openUnreadReturns = async () => {
    await page.locator('#notificationToggle').click();
    await page.locator('[data-notification-kind=returned]').click();
    await page.locator('[data-notification-unread]').click();
  };
  const readItem = id => page.locator(`[data-notification-item="server:${id}"]`);
  const returnCase = async index => {
    const action = index === 0 ? 'request-supplement' : 'return';
    const response = await request(`${api}/cases/${caseIds[index]}/${action}`, {
      cookie: compiler, method: 'POST', body: { reason: 'Kiểm chứng nhắc trả lại — bổ sung địa điểm vụ việc' }
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
  };
  try {
    await request('/api/notifications/read-all', { cookie: reporter, method: 'POST', body: {} });
    for (const [index, unit] of [Number(scope.unitId), 124].entries()) {
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,created_by,title)
        values($1,$2,$3,'TINH_HINH_KHAC','TEST',$4,$5,'PENDING_REVIEW',$6,$5)`,
      [caseIds[index], 'RETURN-ALERT-' + caseIds[index], unit, scope.reportDay,
        'BÁO CÁO THỬ — nhắc báo cáo bị trả lại', scope.userId]);
      await database.query(`insert into daily_report_submissions
        (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
        values($1,$2,$3,$4,1,'PENDING_REVIEW','{}','returned-attention-test',$5)`,
      [randomUUID(), caseIds[index], unit, scope.reportDay, scope.userId]);
    }
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by)
      values($1,$2,$3,'DAILY_POLICE_WORK','{}','PENDING_REVIEW',$4)`,
    [workId, scope.unitId, scope.reportDay, scope.userId]);
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await waitCount(0);
    await returnCase(0);
    await returnCase(1);
    await waitCount(1);
    assert.equal(await badge.innerText(), '1');
    assert.match(await page.title(), /^\(1 trả lại chưa đọc\)/);
    const first = (await feed()).find(item => item.dailyReportRef.caseId === caseIds[0]);
    assert.ok(first && !first.read);
    assert.equal(first.eventType, 'CASE_SUPPLEMENT_REQUESTED');
    const returnedCase = await request(`${api}/cases/${caseIds[0]}`, { cookie: reporter });
    assert.equal(returnedCase.data.case.current_state, 'RETURNED');
    assert.ok(!(await feed()).some(item => item.dailyReportRef.caseId === caseIds[1]));
    // Let the temporary popup expire naturally, as when the officer is away from the desk.
    await page.mouse.move(0, 0);
    await page.locator('.notification-popup-host').waitFor({ state: 'attached' });
    await page.waitForFunction(() => !document.querySelector('.notification-popup-host')?.children.length,
      null, { timeout: 18000 });
    await waitCount(1);
    assert.equal((await feed()).find(item => item.id === first.id).read, false);
    await page.locator('#sidebar [data-bcn-view=returned]').click();
    await page.locator('#dailyReports[data-bcn-active-view=returned]').waitFor({ state: 'visible' });
    await waitCount(1);
    await page.locator('#sidebar [data-page=home]').click();
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await waitCount(1);
    check('A real supplementation request returns the case and keeps its sidebar count after popup expiry, navigation and reload without a top banner');

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const returnedWork = await request(`${api}/work-results/${workId}/return`, {
      cookie: compiler, method: 'POST', body: { reason: 'Kiểm chứng nhắc trả lại — đối chiếu số liệu' }
    });
    assert.equal(returnedWork.status, 200, JSON.stringify(returnedWork.data));
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitCount(2);
    const second = (await feed()).find(item => item.dailyReportRef.resourceId === workId);
    assert.equal(second.eventType, 'SOURCE_RETURNED');
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const appearance = await import('/assets/js/standalone/appearance.js');
          appearance.previewAppearance({ palette: 'charcoal', mode });
        }, mode);
        assert.equal(await page.locator('#notificationToggle').evaluate(element => {
          const rect = element.getBoundingClientRect();
          const badge = element.querySelector('[data-notification-badge]').getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
            && badge.left >= 0 && badge.right <= innerWidth && badge.top >= 0 && badge.bottom <= innerHeight;
        }), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ path: `${outputDir}/${mode}-${width}.png`, animations: 'disabled' });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(async () => {
      const appearance = await import('/assets/js/standalone/appearance.js');
      appearance.previewAppearance({ palette: 'charcoal', mode: 'dark' });
    });
    check('Returning to the tab refreshes both case and work-result returns; light/dark layouts fit desktop and phones');

    await openUnreadReturns();
    assert.equal(await page.locator('[data-notification-kind=returned]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-notification-unread]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-notification-item]').count(), 2);
    assert.equal((await feed()).find(item => item.id === first.id).read, false);
    await page.screenshot({ path: outputDir + '/unread-returns.png' });
    await page.route('**/api/notifications/*/read', route => route.fulfill({
      status: 503, contentType: 'application/json', body: '{"error":"verification offline"}'
    }));
    await readItem(first.id).locator('[data-notification-read]').click();
    await page.locator('[data-notification-status].is-error').waitFor();
    await waitCount(2);
    assert.equal((await feed()).find(item => item.id === first.id).read, false);
    await page.unroute('**/api/notifications/*/read');
    await readItem(first.id).locator('[data-notification-open]').click();
    await page.locator('#bcnDetail[open]').waitFor();
    assert.match(await page.locator('#bcnDetail').innerText(), /bổ sung địa điểm vụ việc/);
    await waitCount(1);
    assert.equal((await feed()).find(item => item.id === first.id).read, true);
    await page.locator('#bcnDetail').evaluate(dialog => dialog.close());
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await waitCount(1);
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await openUnreadReturns();
    await readItem(second.id).locator('[data-notification-open]').click();
    await page.locator('.bcn-source-preview[open]').waitFor();
    assert.match(await page.locator('.bcn-source-preview[open]').innerText(), /đối chiếu số liệu/);
    await waitCount(0);
    assert.equal((await feed()).find(item => item.id === second.id).read, true);
    await page.locator('[data-source-preview-close]').click();
    assert.doesNotMatch(await page.title(), /trả lại chưa đọc/);
    check('The bell filters unread returns without marking them read; failed saves preserve it and real case/source links work');

    await database.query(`update daily_report_outbox set created_at=now()-interval '45 days'
      where id=$1`, [first.id.slice(4)]);
    await database.query('delete from daily_report_notification_reads where outbox_id=$1 and user_id=$2',
      [first.id.slice(4), scope.userId]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitCount(1);
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await openUnreadReturns();
    await page.locator('[data-notification-read-all]').click();
    await waitCount(0);
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await waitCount(0);
    assert.ok((await feed()).every(item => item.read));
    check('Unseen returns older than 30 days remain visible; explicit read-all persists after reload');

    await database.query('delete from daily_report_notification_reads where outbox_id=$1 and user_id=$2',
      [second.id.slice(4), scope.userId]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitCount(1);
    await page.locator('#logout').click();
    await page.locator('#loginScreen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#returnedReportAlert').count(), 0);
    assert.doesNotMatch(await page.title(), /trả lại chưa đọc/);
    const [compilerName, compilerValue] = compiler.split('=');
    await context.addCookies([{ name: compilerName, value: compilerValue, url: base }]);
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#notificationToggle').click();
    assert.equal(await page.locator('[data-notification-kind=all]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-notification-unread]').getAttribute('aria-pressed'), 'false');
    check('Logout clears the returned-report reminder and the next account starts with fresh notification filters');
  } catch (error) {
    await page.screenshot({ path: outputDir + '/failure.png' }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])', [[...caseIds, workId]]);
    await database.query(`delete from daily_report_returns where submission_id in
      (select id from daily_report_submissions where case_id=any($1::uuid[]))`, [caseIds]);
    await database.query('delete from daily_report_submissions where case_id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_source_history where source_id=$1', [workId]);
    await database.query('delete from daily_report_metrics where id=$1', [workId]);
  }
}
