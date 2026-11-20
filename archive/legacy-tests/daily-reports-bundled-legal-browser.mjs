import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runBundledLegalBrowser({ page, base, checks }) {
  const output = 'outputs/bcn-legal-bundle-qa';
  const dialogOutput = 'outputs/bcn-legal-dialog-qa';
  await mkdir(output, { recursive: true });
  await mkdir(dialogOutput, { recursive: true });
  const start = checks.length;
  await page.locator('[data-bcn-view="legal"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#bcnLawResults [data-law-detail]').length === 315);
  assert.match(await page.locator('#bcnLegalVersion option:checked').innerText(), /135\/VBHN-VPQH/);
  assert.equal(await page.locator('#bcnLegalSource, .bcn-law-strip').count(), 0);
  checks.push('empty main database immediately shows 315 official-source lookup entries without importing test data');
  await page.screenshot({ path: `${output}/catalogue.png` });

  const form = page.locator('#bcnLegalSearch');
  const search = async (query, expected) => {
    await form.locator('[name="q"]').fill(query);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/legal/bundled/articles?')
        && response.status() === 200),
      form.getByRole('button', { name: 'Tra cứu', exact: true }).click()
    ]);
    await page.waitForFunction(count => document.querySelectorAll('#bcnLawResults [data-law-detail]').length === count,
      expected);
  };
  await search('Điều 173', 1);
  assert.match(await page.locator('#bcnLawResults').innerText(), /Tội trộm cắp tài sản/);
  await page.locator('#bcnLawResults [data-law-detail]').click();
  await page.locator('#bcnDetail').waitFor({ state: 'visible' });
  const source = page.locator('#bcnDetailBody a');
  assert.match(await source.getAttribute('href'), /\/legal\/bundled\/source#page=\d+/);
  assert.match(await page.locator('#bcnDetailBody').innerText(), /Chương XVI/);
  const popup = page.locator('#bcnDetail');
  const assertCentered = async () => {
    const box = await popup.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) <= 2, 'dialog centered horizontally');
    assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) <= 2, 'dialog centered vertically');
    assert.ok(box.x >= 11 && box.y >= 11, 'dialog keeps viewport margins');
    assert.ok(box.x + box.width <= viewport.width - 11, 'dialog fits viewport width');
    assert.ok(box.y + box.height <= viewport.height - 11, 'dialog fits viewport height');
    assert.ok(await popup.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
      'dialog has no horizontal content overflow');
    assert.ok(await page.locator('.bcn-law-scroll').evaluate(element => element.clientHeight > 0),
      'article content remains scrollable');
    await page.locator('#bcnDetailClose').waitFor({ state: 'visible' });
    await source.waitFor({ state: 'visible' });
  };
  await assertCentered();
  await page.screenshot({ path: `${output}/article-173.png` });
  await page.screenshot({ path: `${dialogOutput}/desktop.png` });
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertCentered();
  await page.screenshot({ path: `${dialogOutput}/mobile.png` });
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#bcnLawResults [data-law-detail]').evaluate(element =>
    document.activeElement === element), true, 'Escape returns focus to the article button');
  await page.setViewportSize(originalViewport);
  checks.push('search by article number opens offence detail with the original PDF page link');
  checks.push('legal detail is centered on desktop and phone, fits the viewport and restores focus after Escape');

  await search('Điều 136', 1);
  await page.locator('#bcnLawResults [data-law-detail]').click();
  await popup.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 844, height: 390 });
  await assertCentered();
  assert.match(await page.locator('#bcnLegalTitle').innerText(), /vượt quá/);
  await page.screenshot({ path: `${dialogOutput}/long-title-landscape.png` });
  await page.locator('#bcnDetailClose').click();
  await popup.waitFor({ state: 'hidden' });
  await page.setViewportSize(originalViewport);
  checks.push('long offence title fits a short landscape viewport and the close action remains usable');

  await search('trom cap', 1);
  assert.match(await page.locator('#bcnLawResults').innerText(), /Tội trộm cắp tài sản/);
  checks.push('accent-free Vietnamese search finds the correct offence');
  await form.locator('[name="business_code"]').selectOption('MA_TUY');
  await search('', 14);
  assert.match(await page.locator('#bcnLawResults').innerText(), /Điều 256a/);
  await search('173', 0);
  assert.match(await page.locator('#bcnLawResults').innerText(), /Chưa có điều luật phù hợp/);
  await form.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#bcnLawResults [data-law-detail]').length === 315);
  checks.push('business filter includes article 256a, combines with search and resets to the complete catalogue');

  const metadata = await (await page.request.get(`${base}/api/bao-cao-ngay/legal/bundled`)).json();
  const download = await page.request.get(base + metadata.version.catalogue_url);
  assert.match(download.headers()['content-disposition'], /attachment/);
  assert.equal((await download.json()).articles.length, 315);
  const pdf = await page.request.get(base + metadata.version.pdf_url);
  assert.equal(pdf.headers()['content-type'], 'application/pdf');
  assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
  checks.push('source banner is removed while bundled PDF and JSON remain available through authenticated routes');
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
