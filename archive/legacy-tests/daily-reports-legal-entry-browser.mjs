import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function prepareLegalEntry({ page, checks }) {
  const output = 'outputs/bcn-legal-entry-qa';
  await mkdir(output, { recursive: true });
  const business = page.locator('#dailyReportCaseForm [data-group-code]');
  const ready = () => page.waitForFunction(() => document.querySelector('#bcnEntryClassifications').dataset.legalState === 'ready');
  await ready();
  await business.selectOption('MA_TUY');
  await ready();
  assert.equal(await page.locator('#bcnEntryClassifications [data-law-key]').count(), 14);
  assert.match(await page.locator('#bcnEntryClassifications').innerText(), /Điều 256a/);
  assert.doesNotMatch(await page.locator('#bcnEntryClassifications').innerText(), /Điều 173 /);
  checks.push('case entry shows fourteen drug articles, including 256a, and excludes unrelated article 173');

  let release;
  let received;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { received = resolve; });
  let delayDrug = true;
  await page.route('**/legal/entry-options?**', async route => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get('business_code') === 'MA_TUY' && delayDrug) {
      delayDrug = false;
      received();
      await blocked;
    }
    await route.fulfill({ response });
  });
  try {
    await business.selectOption('PPHS');
    await ready();
    await business.selectOption('MA_TUY');
    await started;
    await business.selectOption('KINH_TE');
    await ready();
    const expectedOptions = await page.locator('#bcnEntryClassifications').innerText();
    const late = page.waitForResponse(response => response.url().includes('/legal/entry-options?')
      && response.url().includes('MA_TUY'));
    release();
    await late;
    await page.locator('#bcnEntryClassifications').press('Tab');
    assert.equal(await page.locator('#bcnEntryClassifications').innerText(), expectedOptions);
    checks.push('late drug response cannot overwrite a newer economic-business selection');
  } finally {
    release();
    await page.unroute('**/legal/entry-options?**');
  }

  await page.route('**/legal/entry-options?**', route => route.abort());
  await business.selectOption('MA_TUY');
  await page.waitForFunction(() => document.querySelector('#bcnEntryClassifications').dataset.legalState === 'error');
  const submitted = [];
  const recordSubmission = request => {
    if (request.method() === 'POST' && request.url().endsWith('/cases')) submitted.push(request.url());
  };
  page.on('request', recordSubmission);
  await page.locator('#dailyReportCaseForm button[type="submit"]').click();
  assert.equal(submitted.length, 0, 'unloaded options cannot accidentally save an empty legal selection');
  page.off('request', recordSubmission);
  await page.unroute('**/legal/entry-options?**');
  await page.locator('#dailyReportRefresh').click();
  await ready();
  assert.equal(await page.locator('#bcnEntryClassifications [data-law-key]').count(), 14);
  checks.push('failed legal list has an explicit loading error and Cập nhật retries successfully');
  await page.locator('[data-law-key="reference:blhs-135-2025:249"]').check();
  await page.locator('[data-entry-mode="metric"]').click();
  await page.locator('[data-entry-mode="case"]').click();
  assert.equal(await page.locator('#bcnEntryClassifications [data-law-key="reference:blhs-135-2025:249"]').isChecked(), true);
  for (const close of await page.locator('.notification-popup-close:visible').all()) {
    if (await close.isVisible()) await close.click();
  }
  await page.locator('#dailyReportCaseForm').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/drug-selected-desktop.png` });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#bcnEntryClassifications').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/drug-selected-mobile.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.setViewportSize(viewport);
  checks.push('selected source article survives changing entry tabs and the form fits mobile');
}

export async function verifySavedLegalEntry({ page, base, caseId, checks }) {
  let release;
  let complete;
  const blocked = new Promise(resolve => { release = resolve; });
  const finished = new Promise(resolve => { complete = resolve; });
  await page.route('**/legal/entry-options?**', async route => {
    try {
      const response = await route.fetch();
      await blocked;
      await route.fulfill({ response });
    } finally {
      complete();
    }
  });
  try {
    await page.locator(`[data-detail="${caseId}"]`).click();
    await page.locator('#bcnEditClassifications[data-legal-state="loading"]').waitFor();
    const url = page.url();
    await page.locator('#bcnCaseEdit button.primary').click();
    assert.equal(page.url(), url, 'saving while options load does not submit a native form or navigate');
    assert.equal(await page.locator('#bcnDetail').isVisible(), true);
  } finally {
    release();
    await finished;
    await page.unroute('**/legal/entry-options?**');
  }
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  assert.equal(await page.locator('#bcnCaseEdit [name="title"]').isDisabled(), true);
  assert.equal(await page.locator('#bcnEditClassifications [data-law-key="reference:blhs-135-2025:249"]').isChecked(), true);
  assert.match(await page.locator('#bcnEditClassifications .bcn-law-selection').innerText(), /Điều 249/);
  await page.locator('#bcnEditClassifications [data-law-key="reference:blhs-135-2025:249"]').uncheck();
  await page.locator('#bcnEditClassifications [data-law-key="reference:blhs-135-2025:250"]').check();
  const [saved] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/cases/${caseId}`)
      && response.request().method() === 'PATCH'),
    page.locator('#bcnCaseEdit button.primary').click()
  ]);
  assert.equal(saved.status(), 200);
  const detail = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`)).json();
  assert.equal(detail.case.legal_reference.article_code, '250');
  assert.equal(detail.case.legal_article_id, null);
  checks.push('case detail restores article 249 and saving an edit persists the newly chosen article 250');
}
