import assert from 'node:assert/strict';
import { verifyAdminEntryUnits, verifyAssignedEntryUnits } from './daily-reports-entry-units-browser.mjs';
import { prepareCaseTitle, verifyOtherCaseTitle } from './daily-reports-case-title-browser.mjs';
import { preparePersonsEntry, verifyPersonsSaved, verifyPersonsDetail } from './daily-reports-persons-browser.mjs';
import { prepareLocationEntry, verifyLocationSaved, verifyLocationEdit, verifyLocationRetry }
  from './daily-reports-location-browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { prepareLegalEntry, verifySavedLegalEntry } from './daily-reports-legal-entry-browser.mjs';
import { prepareAttachmentEntry, verifyCaseAttachments, verifySealedAttachments, verifySourceAttachments }
  from './daily-reports-attachment-browser.mjs';

export async function runRoleBrowser({ page, database, base, hash, password, checks }) {
  const output = 'outputs/bcn-role-policy-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const department = (await database.query(`insert into departments(name,unit_type)
    values('Đơn vị kiểm thử vai trò','Phòng') returning id`)).rows[0];
  const unit = (await database.query(`insert into teams(name,department_id)
    values('PC02 kiểm thử nhập báo cáo',$1) returning id`, [department.id])).rows[0];
  const reporter = (await database.query(`insert into users(username,password_hash,full_name,team_id)
    values('qa-new-reporter',$1,'Đơn vị nhập báo cáo thử',$2) returning id`, [hash, unit.id])).rows[0];
  await page.reload();
  await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
  await page.locator('#dailyReportNavToggle').click();
  await verifyAdminEntryUnits({ page, base, checks });
  await page.locator('[data-bcn-view="permissions"]').click();
  if (!await page.locator('#bcnRoleManagement').evaluate(element => element.open)) {
    await page.locator('#bcnRoleManagement > summary').click();
  }
  await page.waitForFunction(() => document.querySelector('#bcnRoleAccountSearch').dataset.loaded === 'true');
  await page.locator('#bcnRoleAccountSearch').fill('qa-new-reporter');
  await page.locator('#bcnRoleAccountOptions [role="option"]').first().click();
  await page.locator('#bcnRoleForm [name="role_code"]').selectOption('UNIT_REPORTER');
  assert.equal(await page.locator('#bcnRoleForm [name="role_code"] option[value="PV01_COMPILER"]').count(), 0);
  assert.equal(await page.locator('#bcnRoleForm [name="role_code"] option[value="BCN_ADMIN"]').count(), 0);
  assert.equal(await page.locator('#bcnRoleUnit').inputValue(), String(unit.id));
  assert.equal(await page.locator('#bcnRoleUnit').isDisabled(), true);
  await page.locator('#bcnRoleForm').screenshot({ path: `${output}/unit-role.png` });
  const [grant] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/user-roles') && response.request().method() === 'PUT'),
    page.locator('#bcnRoleForm button.primary').click()
  ]);
  assert.equal(grant.status(), 201);
  checks.push('Admin grants Unit Reporter from actual form; unit is automatic and PV01/Admin roles are absent');
  const permissions = await database.query(`select m.module_key from user_permissions up
    join permissions p on p.id=up.permission_id join modules m on m.id=p.module_id where up.user_id=$1`,
  [reporter.id]);
  assert.deepEqual(permissions.rows.map(row => row.module_key), ['dailyReports']);
  checks.push('role grant automatically opens only Daily Reports for a new account');

  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const reporterPage = await context.newPage();
  const errors = [];
  reporterPage.on('pageerror', error => errors.push(error.message));
  const failures = [];
  reporterPage.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    const expected = pathname === '/api/session' && response.status() === 401
      || /^\/api\/bao-cao-ngay\/(cases|situations|work-results)$/.test(pathname) && response.status() === 423;
    if (response.status() >= 400 && pathname.startsWith('/api/') && !expected) {
      failures.push(`${response.status()} ${pathname}`);
    }
  });
  try {
    await reporterPage.goto(base);
    await reporterPage.locator('#loginAccount').fill('qa-new-reporter');
    await reporterPage.locator('#loginPassword').fill(password);
    await reporterPage.locator('#loginForm button[type="submit"]').click();
    await reporterPage.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await reporterPage.locator('#dailyReportNavToggle').click();
    await reporterPage.locator('[data-bcn-view="input"]').click();
    const form = reporterPage.locator('#dailyReportCaseForm');
    await form.waitFor({ state: 'visible' });
    assert.equal(await reporterPage.locator('[data-bcn-view="permissions"]').isVisible(), false);
    assert.equal(await reporterPage.locator('[data-bcn-view="composer"]').isVisible(), false);
    assert.equal(await form.locator('[name="unit_name"]').inputValue(), 'PC02 kiểm thử nhập báo cáo');
    assert.equal(await form.locator('[name="unit_id"]').isVisible(), false);
    await verifyAssignedEntryUnits({ page: reporterPage, base, checks });
    checks.push('new reporter logs in, sees the entry form for own unit, and cannot open administration or compilation');
    await prepareCaseTitle({ page: reporterPage, checks });
    const summary = 'Hồ sơ do đơn vị mới được phân quyền nhập';
    await form.locator('[name="summary"]').fill(summary);
    await form.locator('[data-group-code]').selectOption('PPHS');
    const scope = await (await reporterPage.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
    await form.locator('[name="occurred_at"]').fill(`${scope.reportDay}T08:30`);
    await preparePersonsEntry({ page: reporterPage, checks });
    await prepareLocationEntry({ page: reporterPage, checks });
    await prepareLegalEntry({ page: reporterPage, checks });
    await prepareAttachmentEntry({ page: reporterPage, checks });
    const invalidFields = await form.evaluate(element => [...element.elements]
      .filter(field => field.willValidate && !field.validity.valid)
      .map(field => ({ name: field.name, message: field.validationMessage })));
    assert.deepEqual(invalidFields, [], 'reporter form is complete before submitting');
    const [first] = await Promise.all([
      reporterPage.waitForResponse(response => response.url().endsWith('/cases')
        && response.request().method() === 'POST'),
      form.locator('button[type="submit"]').click()
    ]);
    if (first.status() === 423) {
      await reporterPage.locator('[data-bcn-view="unlock"]').click();
      await reporterPage.locator('#dailyReportUnlockForm [name="reason"]').fill('Kiểm thử cấp vai trò và nhập báo cáo');
      const [request] = await Promise.all([
        reporterPage.waitForResponse(response => response.url().endsWith('/unlock-requests')
          && response.request().method() === 'POST'),
        reporterPage.locator('#dailyReportUnlockForm button[type="submit"]').click()
      ]);
      assert.equal(request.status(), 201);
      const unlock = await request.json();
      await page.locator('[data-bcn-view="unlock"]').click();
      await page.locator('#dailyReportRefresh').click();
      const row = page.locator(`[data-unlock-id="${unlock.id}"]`);
      await row.waitFor({ state: 'visible' });
      await row.locator('[data-approve]').click();
      const dialog = page.locator('dialog[open]').filter({ hasText: 'Mở khóa 30 phút' });
      await dialog.locator('textarea[name="reason"]').fill('Admin duyệt mở đúng phạm vi kiểm thử');
      await dialog.getByRole('button', { name: 'Chấp thuận 30 phút' }).click();
      await row.getByText('Đang mở khóa', { exact: false }).waitFor();
      await reporterPage.locator('[data-bcn-view="input"]').click();
      assert.equal(await form.locator('.bcn-attachment-queue li').count(), 2,
        'selected files survive the cutoff rejection and unlock workflow');
      await reporterPage.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
      assert.equal(await reporterPage.locator('[data-law-key="reference:blhs-135-2025:249"]').isChecked(), true);
      const [created] = await Promise.all([
        reporterPage.waitForResponse(response => response.url().endsWith('/cases')
          && response.request().method() === 'POST'),
        form.locator('button[type="submit"]').click()
      ]);
      assert.equal(created.status(), 201);
      checks.push('after cutoff, newly granted reporter requests unlock and Admin approves it through actual UI');
    } else assert.equal(first.status(), 201);
    const stored = (await database.query(`select id,unit_id,created_by,legal_reference,title
      from daily_report_cases where summary=$1`, [summary])).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, '', 'disabled title is not saved for a non-other case');
    assert.equal(String(stored[0].unit_id), String(unit.id));
    assert.equal(String(stored[0].created_by), String(reporter.id));
    await verifyPersonsSaved({ page: reporterPage, base, caseId: stored[0].id, checks });
    await verifyLocationSaved({ page: reporterPage, base, caseId: stored[0].id, checks });
    assert.equal(stored[0].legal_reference.article_code, '249');
    checks.push('real reporter form persists the selected drug article and its original source');
    await reporterPage.locator('[data-bcn-view="registry"]').click();
    await reporterPage.locator('#bcnCaseFilters [name="q"]').fill(summary);
    await reporterPage.locator('#bcnCaseFilters button').first().click();
    const row = reporterPage.locator('#dailyReportCaseRows tr').filter({ hasText: summary });
    await row.waitFor({ state: 'visible' });
    await verifySavedLegalEntry({ page: reporterPage, base, caseId: stored[0].id, checks });
    await verifyPersonsDetail({ page: reporterPage, base, caseId: stored[0].id, checks });
    await verifyLocationEdit({ page: reporterPage, base, caseId: stored[0].id, checks });
    await verifyCaseAttachments({ page: reporterPage, base, caseId: stored[0].id, checks });
    await row.locator('[data-submit]').click();
    await reporterPage.locator('.bcn-action-dialog textarea').fill('Gửi hồ sơ kiểm thử');
    await reporterPage.locator('.bcn-action-dialog button[type="submit"]').click();
    await reporterPage.waitForFunction(() => document.querySelector('#dailyReportCaseRows').textContent
      .includes('Chờ xác minh'));
    checks.push('new reporter creates and submits a case with correct unit ownership and no duplicate insertion');
    await verifySealedAttachments({ page: reporterPage, caseId: stored[0].id, checks });
    await verifyPersonsDetail({ page: reporterPage, base, caseId: stored[0].id, checks, readOnly: true });
    await verifyLocationEdit({ page: reporterPage, base, caseId: stored[0].id, checks, readOnly: true });
    await verifyLocationRetry({ page: reporterPage, base, checks });
    await verifySourceAttachments({ page: reporterPage, adminPage: page, base,
      unitId: unit.id, reporterId: reporter.id, checks });
    await verifyOtherCaseTitle({ page: reporterPage, adminPage: page, base, checks });
    await reporterPage.screenshot({ path: `${output}/reporter-entry.png` });
    assert.deepEqual(errors, []);
    await writeFile(`${output}/reporter-api-failures.json`, JSON.stringify(failures, null, 2));
    assert.deepEqual(failures, [], 'reporter page must not request unrelated unauthorized modules');
  } finally {
    await context.close();
  }
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
