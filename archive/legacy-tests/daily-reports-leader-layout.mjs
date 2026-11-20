import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runLeaderLayoutChecks({ page, base, checks }) {
  const output = 'outputs/bcn-leader-layout-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const section = page.locator('#bcnLeaderManagement');
  const form = page.locator('#bcnLeaderForm');
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  const seeded = await page.request.post(`${base}/api/bao-cao-ngay/leaders`, { data: {
    full_name: 'Lãnh đạo tự tải kiểm thử', title: 'Chức danh kiểm thử',
    signer_scope: 'PV01', effective_from: scope.reportDay
  } });
  assert.equal(seeded.status(), 201);
  const measurements = [];
  for (const view of ['composer', 'permissions']) {
    await page.locator(`[data-bcn-view="${view}"]`).click();
    if (!await section.evaluate(element => element.open)) await section.locator('summary').click();
    await section.getByText('Lãnh đạo tự tải kiểm thử', { exact: true }).waitFor();
    await form.scrollIntoViewIfNeeded();
    const bounds = await form.evaluate(element => {
      const box = element.getBoundingClientRect();
      const controls = [...element.querySelectorAll('input:not([type="hidden"]),select')];
      return {
        padding: parseFloat(getComputedStyle(element).paddingLeft),
        minInset: Math.min(...controls.map(control => {
          const rect = control.getBoundingClientRect();
          return Math.min(rect.left - box.left, box.right - rect.right);
        })),
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    measurements.push({ view, ...bounds });
    await section.screenshot({ path: `${output}/${view}-desktop.png` });
    await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
    assert.ok(bounds.minInset >= 14, `${view}: fields need padding inside form; got ${bounds.minInset}px`);
    assert.ok(bounds.overflow <= 2);
  }
  checks.push('leader fields have inner spacing and no horizontal overflow in both composer and permissions');
  checks.push('existing leaders load automatically on opening composer and permissions, without refresh button');

  const name = 'Người ký kiểm thử giao diện';
  await form.locator('[name="full_name"]').fill(name);
  await form.locator('[name="rank_name"]').fill('Cấp bậc kiểm thử');
  await form.locator('[name="title"]').fill('Chức danh kiểm thử');
  await form.locator('[name="effective_from"]').fill(scope.reportDay);
  const [created] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/leaders')
      && response.request().method() === 'POST'),
    form.locator('button.primary').click()
  ]);
  assert.equal(created.status(), 201);
  const row = page.locator('#bcnLeaderRows article').filter({ hasText: name });
  await row.waitFor();
  await row.locator('[data-leader-edit]').click();
  assert.equal(await form.locator('[name="full_name"]').inputValue(), name);
  await form.locator('[name="title"]').fill('Chức danh đã cập nhật');
  const [updated] = await Promise.all([
    page.waitForResponse(response => /\/leaders\/[^/]+$/.test(response.url())
      && response.request().method() === 'PUT'),
    form.locator('button.primary').click()
  ]);
  assert.equal(updated.status(), 200);
  await row.getByText('Chức danh đã cập nhật', { exact: false }).waitFor();
  await row.locator('[data-leader-edit]').click();
  await form.locator('button[type="reset"]').click();
  assert.equal(await form.locator('[name="id"]').inputValue(), '');
  assert.equal(await form.locator('[name="full_name"]').inputValue(), '');
  checks.push('leader form still creates, edits, saves and resets through actual API and UI');
  await form.locator('[name="full_name"]').fill('Người ký mới sau khi đặt lại');
  await form.locator('[name="title"]').fill('Chức danh mới');
  await form.locator('[name="effective_from"]').fill(scope.reportDay);
  const [second] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/leaders')
      && response.request().method() === 'POST'),
    form.locator('button.primary').click()
  ]);
  assert.equal(second.status(), 201);
  await page.locator('#bcnLeaderRows article').filter({ hasText: 'Người ký mới sau khi đặt lại' }).waitFor();
  assert.equal(await row.count(), 1);
  checks.push('New entry creates a separate leader after editing, without overwriting the previous record');
  await row.locator('[data-leader-state]').click();
  await row.getByRole('button', { name: 'Khôi phục', exact: true }).waitFor();
  await row.locator('[data-leader-state]').click();
  await row.getByRole('button', { name: 'Lưu trữ', exact: true }).waitFor();
  checks.push('leader archive and restore remain functional');

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await form.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    const outside = await form.evaluate(element => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll('input:not([type="hidden"]),select,button')].some(control => {
        const rect = control.getBoundingClientRect();
        return rect.left < box.left || rect.right > box.right + 1;
      });
    });
    assert.equal(outside, false);
    await section.screenshot({ path: `${output}/leaders-${width}.png` });
  }
  checks.push('leader editor, list and actions fit laptop and mobile widths');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section.evaluate(element => { element.open = false; });
  await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
