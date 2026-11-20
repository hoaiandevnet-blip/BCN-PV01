import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fillPersons } from './daily-reports-person-fixtures.mjs';

const output = 'outputs/bcn-case-title-qa';

export async function prepareCaseTitle({ page, checks }) {
  await mkdir(output, { recursive: true });
  const form = page.locator('#dailyReportCaseForm');
  const field = form.locator('[name="title"]');
  const business = form.locator('[data-group-code]');
  assert.equal(await field.isDisabled(), true);
  assert.equal(await field.getAttribute('required'), null);
  assert.equal(await form.locator('.bcn-case-title > span').innerText(), 'Tên vụ việc');
  await business.selectOption('TINH_HINH_KHAC');
  assert.equal(await field.isEnabled(), true);
  assert.equal(await field.evaluate(element => element.required && !element.checkValidity()), true);
  await field.fill('Tên tình hình khác đang nhập');
  await form.locator('.bcn-case-title').screenshot({ path: `${output}/other-title.png` });
  await business.selectOption('MA_TUY');
  assert.equal(await field.isDisabled(), true);
  assert.equal(await form.evaluate(element => new FormData(element).has('title')), false);
  await form.locator('.bcn-case-title').screenshot({ path: `${output}/disabled-title.png` });
  await business.selectOption('TINH_HINH_KHAC');
  assert.equal(await field.inputValue(), 'Tên tình hình khác đang nhập');
  await field.fill('   ');
  await page.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
  assert.equal(await field.evaluate(element => element.checkValidity()), false);
  await business.selectOption('PPHS');
  assert.equal(await field.evaluate(element => element.required), false);
  checks.push('Tên vụ việc is editable and required only for Tình hình khác; switching preserves unsaved input');
  checks.push('disabled title is excluded from submission and whitespace-only other title is invalid');
}

export async function verifyOtherCaseTitle({ page, adminPage, base, checks }) {
  await page.locator('[data-bcn-view="input"]').click();
  await page.locator('[data-entry-mode="case"]').click();
  const form = page.locator('#dailyReportCaseForm');
  const field = form.locator('[name="title"]');
  await form.locator('[data-group-code]').selectOption('TINH_HINH_KHAC');
  await field.fill('Tình hình khác kiểm thử giao diện');
  await form.locator('[name="summary"]').fill('Dữ liệu giả kiểm thử tên vụ việc theo hệ.');
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  await form.locator('[name="occurred_at"]').fill(`${scope.reportDay}T08:30`);
  await fillPersons(form);
  await page.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
  const save = async () => (await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/cases') && response.request().method() === 'POST'),
    form.locator('button[type="submit"]').click()
  ]))[0];
  let created = await save();
  if (created.status() === 423) {
    await page.locator('[data-bcn-view="unlock"]').click();
    await page.locator('#dailyReportUnlockForm [name="reason"]').fill('Kiểm thử tên vụ việc tình hình khác');
    const [requested] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/unlock-requests')
        && response.request().method() === 'POST'),
      page.locator('#dailyReportUnlockForm button[type="submit"]').click()
    ]);
    assert.equal(requested.status(), 201);
    const unlock = await requested.json();
    await adminPage.locator('[data-bcn-view="unlock"]').click();
    await adminPage.locator('#dailyReportRefresh').click();
    const row = adminPage.locator(`[data-unlock-id="${unlock.id}"]`);
    await row.locator('[data-approve]').click();
    const dialog = adminPage.locator('dialog[open]').filter({ hasText: 'Mở khóa 30 phút' });
    await dialog.locator('textarea[name="reason"]').fill('Mở đúng hồ sơ kiểm thử tên vụ việc');
    await dialog.getByRole('button', { name: 'Chấp thuận 30 phút' }).click();
    await row.getByText('Đang mở khóa', { exact: false }).waitFor();
    await page.locator('[data-bcn-view="input"]').click();
    await page.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
    assert.equal(await field.inputValue(), 'Tình hình khác kiểm thử giao diện');
    created = await save();
  }
  assert.equal(created.status(), 201);
  const { case: item } = await created.json();
  await page.waitForFunction(() => !document.querySelector('#dailyReportCaseForm [name="title"]').value);
  assert.equal(await field.isDisabled(), true);
  await page.locator('[data-bcn-view="registry"]').click();
  await page.locator('#bcnCaseFilters [name="q"]').fill('Tình hình khác kiểm thử giao diện');
  await page.locator('#bcnCaseFilters button').first().click();
  await page.locator(`[data-detail="${item.id}"]`).click();
  const edit = page.locator('#bcnCaseEdit [name="title"]');
  assert.equal(await edit.isEditable(), true);
  assert.equal(await edit.inputValue(), 'Tình hình khác kiểm thử giao diện');
  await edit.fill('Tình hình khác đã chỉnh sửa');
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  const [saved] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/cases/${item.id}`)
      && response.request().method() === 'PATCH'),
    page.locator('#bcnCaseEdit button.primary').click()
  ]);
  assert.equal(saved.status(), 200);
  const detail = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${item.id}`)).json();
  assert.equal(detail.case.title, 'Tình hình khác đã chỉnh sửa');
  checks.push('other-situation case is created and its title edited through real forms; reset relocks the title');
}
