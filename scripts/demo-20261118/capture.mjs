import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { day } from './plan.mjs';

export async function captureDemo({ browser, compiler, base, output, password }) {
  const plan = JSON.parse(await readFile(output + '/plan.json', 'utf8'));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [name, value] = compiler.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const loadComposer = async () => {
    await page.locator('#sidebar [data-bcn-view=composer]').click();
    await page.locator('#bcnComposeDay').fill(day);
    await page.locator('#bcnComposeLoad').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 28);
  };
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.screenshot({ path: output + '/dashboard-today.png', animations: 'disabled' });
    await loadComposer();
    const rows = page.locator('[data-compose-row]');
    assert.equal(await rows.locator('[data-include]:disabled').count(), 28);
    const text = await page.locator('#bcnComposerRows').innerText();
    for (const record of plan.cases) assert.ok(text.includes(record.label));
    for (const unit of plan.units) assert.ok(text.includes(unit.name));
    assert.equal((text.match(/Chờ duyệt/g) || []).length, 28);
    await page.locator('#bcnComposerSources').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/composer-today.png', animations: 'disabled' });
    await page.locator('#bcnComposeStatus').selectOption('PENDING_REVIEW');
    assert.equal(await rows.count(), 28);
    await page.locator('#bcnComposeSearch').fill(plan.cases[0].label);
    await page.waitForFunction(() => document.querySelectorAll('[data-compose-row]').length === 1);
    await page.screenshot({ path: output + '/sample-case-today.png', animations: 'disabled' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await loadComposer();
    await page.locator('#sidebar [data-bcn-view=approval]').click();
    for (const unit of plan.units) {
      const record = plan.cases.find(item => item.payload.unit_id === unit.id);
      await page.locator(`[data-detail="${record.payload.id}"]`).click();
      const detail = page.locator('#bcnDetail[open]');
      await detail.waitFor();
      assert.match(await detail.innerText(), /18\/11\/2026/);
      assert.ok((await detail.innerText()).includes(record.label));
      assert.ok((await detail.innerText()).includes(unit.name));
      await page.screenshot({ path: `${output}/approval-unit-${unit.id}.png`, animations: 'disabled' });
      await detail.locator('[data-case-close]').click();
    }
    for (const unit of plan.units) {
      const response = await fetch(base + '/api/login', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: unit.username, password }) });
      assert.equal(response.status, 200);
      const [cookieName, cookieValue] = response.headers.get('set-cookie').split(';')[0].split('=');
      const reporter = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        await reporter.addCookies([{ name: cookieName, value: cookieValue, url: base }]);
        const view = await reporter.newPage();
        view.setDefaultTimeout(45000);
        view.on('pageerror', error => errors.push(error.message));
        await view.goto(base, { waitUntil: 'domcontentloaded' });
        await view.locator('#appShell').waitFor({ state: 'visible' });
        await view.locator('#dashData[aria-busy=false]').waitFor();
        const assigned = plan.cases.filter(item => item.payload.unit_id === unit.id);
        await view.locator(`[data-unit="${unit.id}"] [data-unit-detail]`).click();
        const cards = view.locator('.dash-source-card[data-kind=CASE]');
        assert.equal(await cards.count(), 4);
        const content = (await cards.allTextContents()).join('\n');
        for (const record of assigned) assert.ok(content.includes(record.label));
        await view.locator('.dash-units').scrollIntoViewIfNeeded();
        await view.screenshot({ path: `${output}/unit-${unit.id}.png`, animations: 'disabled' });
        const registry = view.locator('#sidebar [data-bcn-view=registry]');
        if (!await registry.isVisible()) continue;
        await registry.click();
        for (const record of assigned) {
          await view.locator(`[data-case-id="${record.payload.id}"]`).waitFor();
        }
        const first = assigned[0];
        await view.locator(`[data-case-preview="${first.payload.id}"]`).click();
        const dialog = view.locator('#bcnCasePreview[open]');
        await dialog.waitFor();
        assert.match(await dialog.innerText(), /18\/11\/2026/);
        assert.ok((await dialog.innerText()).includes(first.label));
        assert.ok((await dialog.innerText()).includes(unit.name));
        assert.match(await dialog.innerText(), /BÁO CÁO THỬ/);
        assert.equal(await dialog.locator('input,textarea,select,form').count(), 0);
        await view.screenshot({ path: `${output}/case-unit-${unit.id}.png`, animations: 'disabled' });
      } finally {
        await reporter.close();
      }
    }
    assert.deepEqual(errors, []);
    return { status: 'PASS', at: new Date().toISOString(), day, visible_sources: 28,
      pending_sources: 28, case_labels_found: 28, units_found: 7,
      unit_content_checks: 7, approval_detail_checks: 7, persisted_after_reload: true, errors };
  } catch (error) {
    await page.screenshot({ path: output + '/browser-failure.png', animations: 'disabled' });
    throw error;
  } finally {
    await context.close();
  }
}
