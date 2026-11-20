import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { day } from './plan.mjs';

export async function captureDemo({ browser, compiler, base, output }) {
  const plan = JSON.parse(await readFile(output + '/plan.json', 'utf8'));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [name, value] = compiler.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base);
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.screenshot({ path: output + '/dashboard-today.png' });
    await page.locator('#sidebar [data-bcn-view=composer]').click();
    await page.locator('#bcnComposeDay').fill(day);
    await page.locator('#bcnComposeLoad').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 25);
    const rows = page.locator('[data-compose-row]');
    assert.equal(await rows.count(), 25);
    assert.equal(await rows.locator('[data-include]:disabled').count(), 25);
    const text = await page.locator('#bcnComposerRows').innerText();
    for (const record of plan.cases) assert.ok(text.includes(record.label));
    for (const record of plan.work) assert.ok(text.includes(record.unit));
    assert.equal((text.match(/Chờ duyệt/g) || []).length, 25);
    await page.locator('#bcnComposerSources').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/composer-today.png' });
    await page.locator('#bcnComposeStatus').selectOption('PENDING_REVIEW');
    assert.equal(await rows.count(), 25);
    await page.locator('#bcnComposeSearch').fill(plan.cases[0].label);
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 1);
    await page.locator('#bcnComposerSources').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/sample-case-today.png' });
    await page.locator('#bcnComposeSearch').fill('');
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 25);
    await page.reload();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=composer]').click();
    await page.locator('#bcnComposeDay').fill(day);
    await page.locator('#bcnComposeLoad').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 25);
    assert.deepEqual(errors, []);
    return { status: 'PASS', day, visible_sources: 25, pending_sources: 25,
      case_labels_found: 20, units_found: 5, persisted_after_reload: true, errors };
  } finally {
    await context.close();
  }
}
