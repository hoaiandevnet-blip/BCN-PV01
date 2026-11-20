import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile('assets/data/vietnam-provinces-wards.json', 'utf8'));
const [first, second] = catalog;
const savedAddress = { province_code: String(first.code), province_name: first.name,
  ward_code: String(first.wards[0].code), ward_name: first.wards[0].name, detail: '12 Đường thử nghiệm' };
const changedAddress = { province_code: String(second.code), province_name: second.name,
  ward_code: String(second.wards[0].code), ward_name: second.wards[0].name, detail: '25 Ngõ kiểm thử mới' };
const output = 'outputs/bcn-location-qa';

export async function prepareLocationEntry({ page, checks }) {
  await mkdir(output, { recursive: true });
  const group = page.locator('#bcnEntryLocation[data-location-state="ready"]');
  await group.waitFor();
  const province = group.locator('[name="location_province_code"]');
  const ward = group.locator('[name="location_ward_code"]');
  const detail = group.locator('[name="location_detail"]');
  assert.equal(await province.locator('option').count(), catalog.length + 1);
  assert.equal(await ward.isDisabled(), true);
  await province.selectOption(String(first.code));
  await ward.selectOption(String(first.wards[0].code));
  await detail.fill('Địa chỉ giữ lại khi đổi tỉnh');
  await province.selectOption(String(second.code));
  assert.equal(await ward.inputValue(), '');
  assert.deepEqual(await ward.locator('option').evaluateAll(items => items.slice(1).map(item => item.value)),
    second.wards.map(item => String(item.code)));
  assert.equal(await detail.inputValue(), 'Địa chỉ giữ lại khi đổi tỉnh');
  await ward.selectOption(String(second.wards[0].code));
  await province.selectOption('');
  assert.equal(await ward.isDisabled(), true);
  assert.equal(await ward.inputValue(), '');
  await province.selectOption(savedAddress.province_code);
  await ward.selectOption(savedAddress.ward_code);
  await detail.fill(savedAddress.detail);
  checks.push('province selection filters wards; changing or clearing province clears the old ward and retains detail');
  await group.scrollIntoViewIfNeeded();
  await group.screenshot({ path: `${output}/entry-desktop.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await group.screenshot({ path: `${output}/entry-mobile.png` });
  await page.setViewportSize(viewport);
  checks.push('three location fields fit desktop and mobile widths');
}

export async function verifyLocationSaved({ page, base, caseId, checks }) {
  const result = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`)).json();
  assert.deepEqual(result.case.location_address, savedAddress);
  assert.equal(result.case.location_general,
    [savedAddress.detail, savedAddress.ward_name, savedAddress.province_name].join(', '));
  const form = page.locator('#dailyReportCaseForm');
  assert.equal(await form.locator('[name="location_province_code"]').inputValue(), '');
  assert.equal(await form.locator('[name="location_ward_code"]').isDisabled(), true);
  assert.equal(await form.locator('[name="location_detail"]').inputValue(), '');
  checks.push('real create API saves all location parts and the successful entry form resets its dependent controls');
}

export async function verifyLocationEdit({ page, base, caseId, checks, readOnly = false }) {
  await page.locator(`[data-detail="${caseId}"]`).click();
  const group = page.locator('#bcnEditLocation[data-location-state="ready"]');
  await group.waitFor();
  const expected = readOnly ? changedAddress : savedAddress;
  for (const key of ['province_code', 'ward_code', 'detail']) {
    assert.equal(await group.locator(`[name="location_${key}"]`).inputValue(), expected[key]);
  }
  if (readOnly) {
    assert.equal(await group.locator('select').first().isDisabled(), true);
    assert.equal(await group.locator('select').last().isDisabled(), true);
    assert.equal(await group.locator('input').getAttribute('readonly'), '');
    await page.locator('#bcnDetail [data-case-close]').click();
    checks.push('submitted case reopens all saved location parts read-only');
    return;
  }
  await group.locator('[name="location_province_code"]').selectOption(changedAddress.province_code);
  assert.equal(await group.locator('[name="location_ward_code"]').inputValue(), '');
  await group.locator('[name="location_ward_code"]').selectOption(changedAddress.ward_code);
  await group.locator('[name="location_detail"]').fill(changedAddress.detail);
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  const [response] = await Promise.all([
    page.waitForResponse(value => value.url().endsWith(`/cases/${caseId}`) && value.request().method() === 'PATCH'),
    page.locator('#bcnCaseEdit button.primary').click()
  ]);
  assert.equal(response.status(), 200);
  await page.locator('#bcnDetail').waitFor({ state: 'hidden' });
  const result = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`)).json();
  assert.deepEqual(result.case.location_address, changedAddress);
  checks.push('detail editor restores and saves changed province, ward and street through the real API');
}

export async function verifyLocationRetry({ page, base, checks }) {
  const retryPage = await page.context().newPage();
  let blocked = true;
  await retryPage.route('**/assets/data/vietnam-provinces-wards.json', route => {
    if (blocked) return route.fulfill({ status: 503, body: 'Temporary failure for QA' });
    return route.continue();
  });
  try {
    await retryPage.goto(base);
    await retryPage.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await retryPage.locator('#dailyReportNavToggle').click();
    await retryPage.locator('[data-bcn-view="input"]').click();
    const group = retryPage.locator('#bcnEntryLocation');
    await group.locator('[data-location-retry]').waitFor({ state: 'visible' });
    assert.equal(await group.locator('[name="location_province_code"]').isDisabled(), true);
    await group.locator('[name="location_detail"]').fill('Nội dung giữ lại khi tải lại');
    blocked = false;
    await group.locator('[data-location-retry]').click();
    await retryPage.locator('#bcnEntryLocation[data-location-state="ready"]').waitFor();
    assert.equal(await group.locator('[name="location_detail"]').inputValue(), 'Nội dung giữ lại khi tải lại');
    assert.equal(await group.locator('[name="location_province_code"]').isDisabled(), false);
    checks.push('catalogue load failure offers retry and recovers without losing typed address details');
  } finally {
    await retryPage.close();
  }
}
