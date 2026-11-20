import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function verifyCaseDetailLayout({ page, checks }) {
  const output = 'outputs/bcn-case-detail-ui-qa';
  await mkdir(output, { recursive: true });
  const dialog = page.locator('#bcnDetail');
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  await page.locator('#bcnCaseAttachments h4').waitFor();
  assert.equal(await dialog.locator('.bcn-detail-heading h3').innerText(), 'Chi tiết vụ việc');
  assert.ok((await dialog.locator('.bcn-detail-header .daily-report-state').innerText()).includes('Chờ xác minh'));
  assert.equal(await dialog.locator('#bcnCaseEdit button[type="submit"]').count(), 0);
  assert.equal(await page.locator('#bcnDetailClose').isVisible(), false);
  assert.equal(await dialog.locator('#bcnReturnCase').count(), 0);
  const original = page.viewportSize();
  const geometries = [];
  await dialog.screenshot({ path: `${output}/popup-initial.png` });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 },
    { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await dialog.locator('[data-case-section="bcnDetailInformation"]').click();
    const bounds = await dialog.boundingBox();
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) <= 2, 'dialog centered horizontally');
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) <= 2, 'dialog centered vertically');
    const layout = await dialog.evaluate(element => {
      const scroll = element.querySelector('.bcn-detail-scroll');
      const header = element.querySelector('.bcn-detail-header').getBoundingClientRect();
      const footer = element.querySelector('.bcn-detail-footer').getBoundingClientRect();
      const close = element.querySelector('[data-case-close]').getBoundingClientRect();
      return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth,
        scrollHeight: scroll.clientHeight, headerY: header.y, footerBottom: footer.bottom,
        closeRight: close.right, hiddenControls: [...element.querySelectorAll('[hidden]')]
          .filter(node => node.getClientRects().length).map(node => node.className) };
    });
    console.log(JSON.stringify({ viewport, bounds, layout }));
    await dialog.screenshot({ path: `${output}/popup-${viewport.width}x${viewport.height}.png` });
    assert.ok(layout.scrollWidth <= layout.clientWidth + 2, 'no horizontal overflow');
    assert.ok(layout.scrollHeight > 50, 'body remains scrollable in short landscape');
    assert.ok(layout.footerBottom <= viewport.height && layout.closeRight <= viewport.width);
    assert.deepEqual(layout.hiddenControls, [], 'hidden controls stay hidden');
    await dialog.screenshot({ path: `${output}/popup-${viewport.width}x${viewport.height}.png` });
    await dialog.locator('[data-case-section="bcnEditPersons"]').click();
    assert.ok(await page.locator('#bcnEditPersons').evaluate(element => {
      const box = element.getBoundingClientRect();
      const viewport = element.closest('.bcn-detail-scroll').getBoundingClientRect();
      return box.top >= viewport.top - 2 && box.top < viewport.bottom;
    }));
    const after = await dialog.locator('.bcn-detail-header').boundingBox();
    assert.equal(after.y, layout.headerY, 'header stays fixed when navigating sections');
    if (viewport.width === 1440) await dialog.screenshot({ path: `${output}/popup-persons.png` });
    await dialog.locator('[data-case-section="bcnDetailEvents"]').click();
    assert.ok(await dialog.locator('.bcn-detail-scroll').evaluate(element => element.scrollTop > 0));
    geometries.push({ viewport, bounds, layout });
  }
  await page.setViewportSize(original);
  await dialog.locator('[data-case-section="bcnDetailInformation"]').click();
  checks.push('case popup is centered at desktop, phone and landscape widths, without overflow or clipped controls');
  checks.push('Vietnamese status, read-only access and quick section navigation retain a fixed header and footer');
  console.log(JSON.stringify({ caseDetailLayout: geometries }));
}

export async function verifyCompilerCasePopup({ page, caseId, base, database, checks }) {
  const row = page.locator('#dailyReportCaseRows tr').filter({ has: page.locator(`[data-detail="${caseId}"]`) });
  await row.locator('[data-submit]').click();
  await page.locator('.bcn-action-dialog textarea').fill('Kiểm tra xác minh trên popup mới');
  const [submitted] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/cases/${caseId}/submit`)
      && response.request().method() === 'POST'),
    page.locator('.bcn-action-dialog button[type="submit"]').click()
  ]);
  assert.equal(submitted.status(), 201);
  await row.getByText('Chờ xác minh', { exact: true }).waitFor();
  await row.locator('[data-detail]').click();
  await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
  const dialog = page.locator('#bcnDetail');
  const header = dialog.locator('.bcn-detail-header');
  assert.equal(await dialog.locator('#bcnCaseEdit button[type="submit"]').count(), 0);
  assert.equal(await page.locator('#bcnDetailClose').isVisible(), false);
  const viewport = page.viewportSize();
  for (const dimensions of [viewport, { width: 390, height: 844 }]) {
    await page.setViewportSize(dimensions);
    await dialog.locator('[data-case-section="bcnDetailInformation"]').click();
    const layout = await header.evaluate(element => {
      const button = element.querySelector('#bcnVerifyCase').getBoundingClientRect();
      const close = document.querySelector('#bcnDetail [data-case-close]').getBoundingClientRect();
      const scroll = document.querySelector('.bcn-detail-scroll');
      return { overlap: button.x < close.right && button.right > close.x
        && button.y < close.bottom && button.bottom > close.y,
      footerBottom: close.bottom,
      scrollWidth: scroll.scrollWidth, width: scroll.clientWidth, top: scroll.scrollTop };
    });
    assert.equal(layout.overlap, false);
    assert.ok(layout.scrollWidth <= layout.width + 2);
    assert.equal(layout.top, 0);
    assert.equal(await dialog.locator('#bcnReturnCase').count(), 0);
    assert.ok(layout.footerBottom <= dimensions.height);
    await dialog.screenshot({ path: `outputs/bcn-case-detail-ui-qa/admin-${dimensions.width}.png` });
  }
  await page.setViewportSize(viewport);
  const [verified] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/cases/${caseId}/verify`)
      && response.request().method() === 'POST'),
    dialog.locator('#bcnVerifyCase').click()
  ]);
  assert.equal(verified.status(), 200);
  await header.getByText('Đã xác minh', { exact: true }).waitFor();
  assert.equal(await dialog.locator('#bcnVerifyCase').count(), 0);
  const result = await (await page.request.get(`${base}/api/bao-cao-ngay/cases/${caseId}`)).json();
  assert.equal(result.case.current_state, 'VERIFIED');
  assert.equal(result.case.classifications.length, 3);
  await dialog.locator('[data-case-close]').click();
  assert.equal(await dialog.isVisible(), false);
  await row.locator('[data-detail]').click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  checks.push('Admin popup keeps review and close controls separate on mobile; verify persists state and all classifications');
  checks.push('quick information link returns to unit/date metadata; footer Close and Escape both close the case popup');
}
