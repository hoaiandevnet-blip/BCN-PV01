import assert from 'node:assert/strict';
import { verifyCompilerCasePopup } from './daily-reports-case-detail-layout.mjs';
import { randomUUID } from 'node:crypto';
import { fillPersons } from './daily-reports-person-fixtures.mjs';

// Called only by the existing main-app harness, which creates and drops an isolated database.
export async function runClassificationBrowser({ page, base, database, userId, checks, expectedResponses }) {
  const output = 'outputs/bcn-multi-law-qa';
  await page.locator('[data-bcn-view="input"]').click();
  await page.locator('[data-entry-mode="case"]').click();
  const form = page.locator('#dailyReportCaseForm');
  const host = form.locator('#bcnEntryClassifications');
  const ready = () => host.locator('[data-law-key]').first().waitFor();
  await host.locator('[data-group-code]').selectOption('PPHS');
  await ready();
  for (const article of ['173', '174']) {
    await host.locator('[data-law-search]').fill(article);
    await host.locator(`[data-law-key="reference:blhs-135-2025:${article}"]`).check();
  }
  await host.locator('[data-classification-add]').click();
  await host.locator('[data-group-code]').nth(1).selectOption('MA_TUY');
  await host.locator('[data-law-key="reference:blhs-135-2025:249"]').check();
  await host.locator('[data-law-key="reference:blhs-135-2025:250"]').check();
  assert.equal(await host.locator('.bcn-law-chip').count(), 4);
  await host.locator('[data-law-search]').first().fill('');
  await host.screenshot({ path: `${output}/two-systems.png` });
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  await form.locator('[name="unit_id"]').selectOption(String(scope.unitId));
  await form.locator('[name="occurred_at"]').fill(`${scope.reportDay}T08:30`);
  await form.locator('[name="summary"]').fill('QA-MULTI-BROWSER dữ liệu giả kiểm tra nhiều hệ và điều khoản.');
  await fillPersons(form);
  const save = async () => (await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/cases') && response.request().method() === 'POST'),
    form.locator('button[type="submit"]').click()
  ]))[0];
  let response = await save();
  if (response.status() === 423) {
    // This one response is expected after the daily cutoff; the retry must still return 201.
    expectedResponses.add(response);
    const pending = response.request().postDataJSON();
    await database.query(`insert into daily_report_unlock_requests
      (id,unit_id,report_day,scope_kind,scope_id,reason,requester_id,status,decided_by,approved_at,expires_at)
      values($1,$2,$3,'CASE',$4,'Isolated multi-law UI test',$5,'APPROVED',$5,now(),now()+interval '30 minutes')`,
    [randomUUID(), scope.unitId, scope.reportDay, pending.id, userId]);
    response = await save();
  }
  assert.equal(response.status(), 201, await response.text());
  const item = (await response.json()).case;
  let detail = (await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${item.id}`)).json()).case;
  assert.deepEqual(detail.classifications.map(group => [group.business_code, group.legal_selections.length]),
    [['PPHS', 2], ['MA_TUY', 2]]);
  checks.push('real entry form saves two systems with two articles each and clears selections after save');
  await host.locator('[data-group-code]').waitFor();
  assert.equal(await host.locator('.bcn-law-chip').count(), 0);
  await page.locator('[data-bcn-view="registry"]').click();
  await page.locator('#bcnCaseFilters [name="q"]').fill('QA-MULTI-BROWSER');
  await page.locator('#bcnCaseFilters button').first().click();
  await page.locator(`[data-detail="${item.id}"]`).click();
  const edit = page.locator('#bcnEditClassifications');
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  assert.equal(await edit.locator('.bcn-law-chip').count(), 4);
  await edit.locator('[data-law-remove="reference:blhs-135-2025:174"]').click();
  await edit.locator('[data-classification-add]').click();
  await edit.locator('[data-group-code]').nth(2).selectOption('TINH_HINH_KHAC');
  assert.equal(await page.locator('#bcnCaseEdit [name="title"]').isEditable(), true);
  await page.locator('#bcnCaseEdit [name="title"]').fill('QA-MULTI-BROWSER có tình hình khác');
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  const [updated] = await Promise.all([
    page.waitForResponse(value => value.url().endsWith(`/cases/${item.id}`) && value.request().method() === 'PATCH'),
    page.locator('#bcnCaseEdit button.primary').click()
  ]);
  assert.equal(updated.status(), 200);
  detail = (await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${item.id}`)).json()).case;
  assert.deepEqual(detail.classifications.map(group => [group.business_code, group.legal_selections.length]),
    [['PPHS', 1], ['MA_TUY', 2], ['TINH_HINH_KHAC', 0]]);
  assert.equal(detail.title, 'QA-MULTI-BROWSER có tình hình khác');
  checks.push('detail form restores all choices, removes one article, adds a third system and persists its title');
  await page.locator('#bcnCaseFilters [name="business_code"]').selectOption('MA_TUY');
  await page.locator('#bcnCaseFilters button').first().click();
  await page.locator(`[data-detail="${item.id}"]`).waitFor();
  assert.equal(await page.locator('#dailyReportCaseRows .bcn-category').count(), 3);
  checks.push('secondary-system registry filter finds the case and shows all three system badges');
  await verifyCompilerCasePopup({ page, caseId: item.id, base, database, checks });
}
