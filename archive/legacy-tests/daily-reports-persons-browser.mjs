import assert from 'node:assert/strict';
import { verifyCaseDetailLayout } from './daily-reports-case-detail-layout.mjs';
import { mkdir } from 'node:fs/promises';
import { fillPersons, testPersons } from './daily-reports-person-fixtures.mjs';

export async function preparePersonsEntry({ page, checks }) {
  const form = page.locator('#dailyReportCaseForm');
  const count = form.locator('[name="person_count"]');
  const output = 'outputs/bcn-persons-qa';
  await mkdir(output, { recursive: true });
  assert.equal(await count.locator('option').count(), 101);
  assert.equal(await count.inputValue(), '');
  assert.equal(await form.locator('[data-person-index]').count(), 0);
  assert.equal(await count.evaluate(element => element.checkValidity()), false);
  await fillPersons(form, testPersons(2));
  assert.equal(await form.locator('[data-person-index]').count(), 2);
  assert.equal(await form.locator('[data-person-field][required]').count(), 12);
  const identity = form.locator('[name="person_0_identity_number"]');
  await identity.fill('123');
  assert.equal(await identity.evaluate(element => element.checkValidity()), false);
  await identity.fill(testPersons()[0].identity_number);
  await count.selectOption('1');
  await count.selectOption('2');
  assert.equal(await form.locator('[name="person_1_current_address"]').inputValue(), testPersons(2)[1].current_address);
  await count.selectOption('100');
  assert.equal(await form.locator('[data-person-index]').count(), 100);
  await count.selectOption('2');
  assert.equal(await form.locator('[name="person_0_identity_number"]').inputValue(), '000000000001');
  checks.push('person dropdown requires 1–100; generates six required fields each and retains edits when count changes');
  await page.locator('#bcnEntryPersons').scrollIntoViewIfNeeded();
  await page.locator('#bcnEntryPersons').screenshot({ path: `${output}/entry-desktop.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.locator('#bcnEntryPersons').screenshot({ path: `${output}/entry-mobile.png` });
  await page.setViewportSize(viewport);
  checks.push('structured subject fields fit mobile and retain leading zeroes in CCCD');
}

export async function verifyPersonsSaved({ page, base, caseId, checks }) {
  const response = await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`);
  assert.equal(response.status(), 200);
  const detail = await response.json();
  assert.deepEqual(detail.case.persons, testPersons(2));
  assert.equal(await page.locator('#dailyReportCaseForm [name="person_count"]').inputValue(), '');
  assert.equal(await page.locator('#bcnEntryPersons [data-person-index]').count(), 0);
  checks.push('actual reporter submission saves both complete people; successful save resets the dynamic editor');
}

export async function verifyPersonsDetail({ page, base, caseId, checks, readOnly = false }) {
  await page.locator(`[data-detail="${caseId}"]`).click();
  await page.locator('#bcnDetail').waitFor({ state: 'visible' });
  const form = page.locator('#bcnCaseEdit');
  const section = page.locator('#bcnEditPersons');
  if (!readOnly) {
    assert.equal(await form.locator('[name="person_count"]').inputValue(), '2');
    assert.equal(await form.locator('[name="person_1_identity_number"]').inputValue(), '000000000002');
    await form.locator('[name="person_1_current_address"]').fill('Nơi ở giả lập đã cập nhật');
    await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/cases/${caseId}`)
        && response.request().method() === 'PATCH'),
      form.locator('button.primary').click()
    ]);
    assert.equal(saved.status(), 200);
    const result = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`)).json();
    assert.equal(result.case.persons[1].current_address, 'Nơi ở giả lập đã cập nhật');
    assert.deepEqual(result.case.persons[0], testPersons()[0]);
    checks.push('detail editor restores all fields and saves an updated address without losing other person data');
  } else {
    assert.equal(await section.locator('input,select').count(), 0);
    assert.equal(await section.locator('.bcn-person-summary').count(), 2);
    assert.ok((await section.innerText()).includes('000000000002'));
    assert.ok((await section.innerText()).includes('Nơi ở giả lập đã cập nhật'));
    await section.screenshot({ path: 'outputs/bcn-persons-qa/saved-persons.png' });
    await verifyCaseDetailLayout({ page, checks });
    await page.locator('#bcnDetail [data-case-close]').click();
    checks.push('submitted details show complete personal information read-only');
  }
}
