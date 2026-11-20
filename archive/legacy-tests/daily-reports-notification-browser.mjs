import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { attachmentPdf } from './daily-reports-attachments.mjs';

export async function runNotificationBrowser({ page, database, base, hash, password, checks }) {
  const output = 'outputs/daily-reports-notifications-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const department = (await database.query(`insert into departments(name,unit_type)
    values('Đơn vị QA thông báo','Xã') returning id`)).rows[0];
  const unit = (await database.query(`insert into teams(name,department_id)
    values('Đơn vị QA thông báo',$1) returning id`, [department.id])).rows[0];
  const reporter = (await database.query(`insert into users(username,password_hash,full_name,team_id)
    values('qa-notification-reporter',$1,'Đơn vị kiểm thử thông báo',$2) returning id`, [hash, unit.id])).rows[0];
  await database.query(`insert into user_permissions select $1,id from permissions`, [reporter.id]);
  await database.query(`insert into daily_report_user_roles(user_id,role_code,unit_id)
    values($1,'UNIT_REPORTER',$2)`, [reporter.id, unit.id]);
  const caseId = randomUUID();
  await database.query(`insert into daily_report_cases
    (id,stable_code,title,unit_id,business_code,category_code,report_day,summary,current_state,created_by)
    values($1,'QA-THK-2020','Hồ sơ tình hình khác từ năm 2020',$2,'TINH_HINH_KHAC','QA','2020-01-02',
      'Nội dung gốc đã xử lý từ năm 2020','VERIFIED',$3)`, [caseId, unit.id, reporter.id]);
  const reporterContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const unitPage = await reporterContext.newPage();
  const unitErrors = [];
  unitPage.on('pageerror', error => unitErrors.push(error.message));
  const call = async (context, path, body) => {
    const response = body === undefined ? await context.request.get(base + path)
      : await context.request.post(base + path, { data: body });
    const data = await response.json();
    assert.ok(response.ok(), `${path}: ${response.status()} ${JSON.stringify(data)}`);
    return data;
  };
  try {
    await unitPage.goto(base);
    await unitPage.locator('#loginAccount').fill('qa-notification-reporter');
    await unitPage.locator('#loginPassword').fill(password);
    await unitPage.locator('#loginForm button[type="submit"]').click();
    await unitPage.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await unitPage.locator('#dailyReportNavToggle').click();
    const scope = await call(reporterContext, '/api/bao-cao-ngay/scope');
    const day = scope.reportDay;
    if (!scope.beforeCutoff) {
      const request = await call(reporterContext, '/api/bao-cao-ngay/unlock-requests', {
        report_day: day, scope: { kind: 'CASE', id: caseId }, reason: 'Bổ sung quyết định cho hồ sơ năm 2020'
      });
      // A real second account creates the request; the compiler sees it on the next shared-feed poll.
      await page.locator('#notificationToggle').click();
      await page.locator('[data-notification-kind="daily-report"]').click();
      const unlockNotice = page.locator('[data-notification-item]').filter({ hasText: 'Bổ sung quyết định cho hồ sơ năm 2020' });
      await unlockNotice.waitFor({ state: 'visible', timeout: 15000 });
      await unlockNotice.locator('[data-notification-open]').click();
      const requestRow = page.locator(`[data-unlock-id="${request.id}"]`);
      await requestRow.waitFor({ state: 'visible' });
      assert.ok(await requestRow.getAttribute('data-notification-focus') !== null);
      await requestRow.locator('[data-approve]').click();
      const approval = page.locator('dialog[open]').filter({ hasText: 'Mở khóa 30 phút' });
      await approval.locator('textarea[name="reason"]').fill('Đồng ý bổ sung dữ liệu kiểm thử');
      await approval.getByRole('button', { name: 'Chấp thuận 30 phút' }).click();
      await requestRow.getByText('Đang mở khóa', { exact: false }).waitFor();
      checks.push('second account unlock request appears in globe and opens exact request for approval');

    } else {
      checks.push('during open reporting window, old-case supplements require no unlock');
    }

    await unitPage.locator('[data-bcn-view="registry"]').click();
    await unitPage.locator('#bcnCaseFilters [name="from_day"]').fill('2020-01-02');
    await unitPage.locator('#bcnCaseFilters [name="to_day"]').fill('2020-01-02');
    await unitPage.locator('#bcnCaseFilters button[type="submit"], #bcnCaseFilters button:not([type])').click();
    await unitPage.locator(`[data-detail="${caseId}"]`).click();
    await unitPage.locator('#bcnAddEvent').click();
    const form = unitPage.locator('dialog[open]').filter({ hasText: 'Lưu diễn biến và thông báo' });
    await form.locator('[name="decision_type"]').selectOption('PROSECUTION_CASE');
    await form.locator('[name="decision_number"]').fill('QA-QD-2020-NEW');
    await form.locator('[name="decision_date"]').fill(day);
    await form.locator('[name="decision_authority"]').fill('Cơ quan QA');
    await form.locator('[name="narrative"]').fill('Bổ sung quyết định hôm nay cho hồ sơ từ năm 2020');
    await form.locator('input[type="file"]').setInputFiles({ name: 'Quyết định bổ sung năm 2020.pdf',
      mimeType: 'application/pdf', buffer: attachmentPdf });
    await form.getByRole('button', { name: 'Lưu diễn biến và thông báo' }).click();
    await unitPage.locator('#bcnDetail').getByText('QA-QD-2020-NEW', { exact: false }).waitFor();
    checks.push('reporter supplements decision through existing case UI despite case age');

    await page.locator('#notificationToggle').click();
    const notice = page.locator('[data-notification-item]').filter({ hasText: 'QA-QD-2020-NEW' });
    await notice.waitFor({ state: 'visible', timeout: 15000 });
    assert.ok((await notice.innerText()).includes('02/01/2020'));
    assert.ok(await notice.locator('.notification-unread-dot').isVisible());
    await page.screenshot({ path: `${output}/globe-decision.png`, fullPage: true });
    await notice.locator('[data-notification-open]').click();
    await page.locator('#bcnDetail').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#bcnCaseEdit [name="title"]').inputValue(), 'Hồ sơ tình hình khác từ năm 2020');
    assert.ok(!(await page.locator('#bcnDetailBody').innerText()).includes('QA-THK-2020'));
    const focused = page.locator('#bcnDetail [data-notification-focus]');
    assert.ok((await focused.innerText()).includes('QA-QD-2020-NEW'));
    await focused.getByText('Quyết định bổ sung năm 2020.pdf', { exact: true }).waitFor();
    checks.push('compiler opens notification and sees the document attached to an old-case supplement');
    await page.screenshot({ path: `${output}/opened-old-case.png`, fullPage: true });
    checks.push('globe opens exact old case and highlights today decision with its number and issuing authority');
    await focused.locator('[data-event-verify]').click();
    await page.locator('#bcnDetail [data-event-compose]').waitFor({ state: 'visible' });
    await page.locator('#bcnDetail [data-event-compose]').click();
    const row = page.locator('[data-compose-row]').filter({ hasText: 'Bổ sung quyết định hôm nay' });
    await row.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#bcnComposeDay').inputValue(), day);
    assert.ok(await row.locator('[data-include]').isEnabled());
    await row.locator('[data-include]').check();
    await row.locator('[data-section]').selectOption('TINH_HINH_KHAC');
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/drafts') && response.request().method() === 'GET'),
      page.locator('#bcnDraftNew').click()
    ]);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'PUT'),
      page.locator('#bcnDraftSave').click()
    ]);
    await page.waitForFunction(() => document.querySelector('#bcnDraftStatus').textContent.includes('phiên bản 2'));
    const drafts = await call(page.context(), `/api/bao-cao-ngay/drafts?report_day=${day}`);
    assert.ok(drafts.drafts.length);
    const saved = await call(page.context(), `/api/bao-cao-ngay/drafts/${drafts.drafts[0].id}`);
    assert.equal(saved.items.filter(item => item.included).length, 1);
    assert.equal(saved.items[0].section_code, 'TINH_HINH_KHAC');
    assert.equal(saved.draft.report_day, day);
    await page.screenshot({ path: `${output}/today-composer.png`, fullPage: true });
    checks.push('compiler verifies, selects and saves old-case supplement into today report through main UI');
    await page.locator('[data-bcn-view="history"]').click();
    assert.equal(await page.getByRole('button', { name: 'Tải thông báo', exact: true }).count(), 0);
    assert.equal(await page.locator('#bcnRoleBanner, #bcnNotificationsLoad').count(), 0);
    await page.locator('#notificationToggle').click();
    await page.locator('[data-notification-read-all]').click();
    await page.waitForFunction(() => document.querySelectorAll('.notification-item.daily-report:not(.is-read)').length === 0);
    await page.reload();
    await page.locator('#notificationToggle').waitFor({ state: 'visible' });
    await page.locator('#notificationToggle').click();
    await page.locator('[data-notification-kind="daily-report"]').click();
    await page.locator('[data-notification-item]').filter({ hasText: 'QA-QD-2020-NEW' }).first().waitFor();
    assert.equal(await page.locator('.notification-item.daily-report:not(.is-read)').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator('#notificationPanel').boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
    await page.screenshot({ path: `${output}/mobile-globe.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-notification-close]').click();
    checks.push('notification globe remains within a mobile viewport');
    checks.push('history points to globe and shared read state survives reload');
    assert.deepEqual(unitErrors, []);
    await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
      checks: checks.slice(start), errors: unitErrors }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${output}/failure-compiler.png`, fullPage: true });
    await unitPage.screenshot({ path: `${output}/failure-reporter.png`, fullPage: true });
    throw error;
  } finally {
    await reporterContext.close();
  }
}
