import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runLeaderDeleteBrowser({ page, base, checks }) {
  const output = 'outputs/bcn-leader-delete-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const api = `${base}/api/bao-cao-ngay`;
  const scope = await (await page.request.get(`${api}/scope`)).json();
  const seeded = [];
  for (const suffix of ['một người', 'nhóm A', 'nhóm B']) {
    const response = await page.request.post(`${api}/leaders`, { data: {
      full_name: `Người ký kiểm thử xóa ${suffix}`, title: 'Chức danh kiểm thử',
      signer_scope: 'PV01', effective_from: scope.reportDay
    } });
    assert.equal(response.status(), 201);
    seeded.push((await response.json()).leader);
  }
  await page.locator('[data-bcn-view="input"]').click();
  await page.locator('[data-bcn-view="permissions"]').click();
  const section = page.locator('#bcnLeaderManagement');
  if (!await section.evaluate(element => element.open)) await section.locator('summary').click();
  const row = id => page.locator(`[data-leader-id="${id}"]`);
  for (const item of seeded) await row(item.id).waitFor();
  await page.waitForFunction(() => !document.querySelector('#bcnLeadersLoad').disabled);
  checks.push('re-entering permissions automatically loads newly added leaders');
  const form = page.locator('#bcnLeaderForm');
  const dialog = page.locator('.bcn-leader-delete-dialog');
  await row(seeded[0].id).locator('[data-leader-edit]').click();
  await row(seeded[0].id).getByRole('button', { name: 'Xóa', exact: true }).click();
  await dialog.waitFor();
  assert.ok((await dialog.innerText()).includes(seeded[0].full_name));
  const centered = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height,
      viewport: [innerWidth, innerHeight], margin: getComputedStyle(element).margin,
      centered: Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2
        && Math.abs(box.top + box.height / 2 - innerHeight / 2) < 2 };
  });
  await writeFile(`${output}/dialog-measurements.json`, JSON.stringify(centered, null, 2));
  await dialog.screenshot({ path: `${output}/single-confirmation.png` });
  assert.equal(centered.centered, true, JSON.stringify(centered));
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  assert.ok((await (await page.request.get(`${api}/leaders`)).json()).leaders
    .some(item => item.id === seeded[0].id));
  checks.push('centered confirmation lists the exact signer; cancelling leaves data intact');
  await row(seeded[0].id).getByRole('button', { name: 'Xóa', exact: true }).click();
  const [removed] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/leaders/${seeded[0].id}`)
      && response.request().method() === 'DELETE'),
    dialog.getByRole('button', { name: 'Xóa 1 người ký', exact: true }).click()
  ]);
  assert.equal(removed.status(), 200);
  await row(seeded[0].id).waitFor({ state: 'detached' });
  assert.equal(await form.locator('[name="id"]').inputValue(), '');
  assert.equal(await form.locator('[name="full_name"]').inputValue(), '');
  checks.push('individual deletion removes the row and clears the editor when deleting its selected leader');

  await page.waitForFunction(() => !document.querySelector('#bcnLeaderSelectAll').disabled);
  await page.locator('#bcnLeaderSelectAll').check();
  const count = await page.locator('[data-leader-select]').count();
  assert.equal(await page.locator('[data-leader-select]:checked').count(), count);
  await page.locator('#bcnLeaderSelectAll').uncheck();
  await row(seeded[1].id).locator('[data-leader-select]').check();
  assert.equal(await page.locator('#bcnLeaderSelectAll').evaluate(element => element.indeterminate), true);
  await row(seeded[2].id).locator('[data-leader-select]').check();
  assert.equal(await page.locator('#bcnLeaderSelectedCount').innerText(), 'Đã chọn 2 người ký');
  await page.locator('#bcnLeadersDelete').click();
  assert.equal(await dialog.locator('li').count(), 2);
  await dialog.screenshot({ path: `${output}/bulk-confirmation.png` });
  const [bulk] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/leaders')
      && response.request().method() === 'DELETE'),
    dialog.getByRole('button', { name: 'Xóa 2 người ký', exact: true }).click()
  ]);
  assert.equal(bulk.status(), 200);
  assert.equal((await bulk.json()).deleted_count, 2);
  for (const item of seeded) await row(item.id).waitFor({ state: 'detached' });
  assert.equal(await page.locator('#bcnLeadersDelete').isDisabled(), true);
  assert.equal(await page.locator('[data-leader-id]').count(), count - 2);
  checks.push('select all, partial selection and bulk deletion work, retaining every unselected leader');
  await page.locator('[data-bcn-view="composer"]').click();
  await page.locator('#bcnReportType').selectOption('BCN_PV01');
  for (const item of seeded) assert.equal(await page.locator(`#bcnSigner option[value="${item.id}"]`).count(), 0);
  checks.push('deleted leaders are absent from report signer options');
  if (!await section.evaluate(element => element.open)) await section.locator('summary').click();
  await page.waitForFunction(() => !document.querySelector('#bcnLeadersLoad').disabled);
  await section.screenshot({ path: `${output}/directory-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#bcnLeaderBulk').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await page.locator('[data-leader-delete]').first().click();
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  }));
  await page.screenshot({ path: `${output}/confirmation-mobile.png` });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  checks.push('bulk toolbar and confirmation fit mobile; Escape cancels safely');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section.evaluate(element => { element.open = false; });
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
