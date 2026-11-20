import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runComposerLayoutChecks({ page, checks }) {
  const output = 'outputs/bcn-composer-layout-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const preview = page.locator('#bcnComposerPreview');
  const source = page.locator('#bcnComposerSources');
  const fields = page.locator('#bcnComposerDocument');
  const paper = page.locator('#bcnPaperStack');
  const row = page.locator('[data-compose-row]').filter({ has: page.locator('[data-include]:enabled') }).first();
  const selected = await row.locator('[data-include]').isChecked();
  const original = await row.locator('textarea').inputValue();
  const audience = page.locator('[data-document="audience"]');
  const originalAudience = await audience.inputValue();
  const text = 'Nội dung thử bố cục: chọn bên trái, xem ngay bên phải.';
  const scrollToColumns = () => page.locator('.bcn-composer-columns').evaluate(element => {
    const main = element.closest('.main');
    const header = main.querySelector('.topbar').getBoundingClientRect();
    main.scrollTop += element.getBoundingClientRect().top - Math.max(0, header.bottom) - 16;
  });
  const waitText = (value, included) => page.waitForFunction(({ value, included }) =>
    document.querySelector('#bcnPaperStack').textContent.includes(value) === included, { value, included });
  try {
    await row.locator('[data-include]').check();
    await row.locator('textarea').fill(text);
    await waitText(text, true);
    await scrollToColumns();
    let sourceBox = await source.boundingBox();
    let fieldsBox = await fields.boundingBox();
    let previewBox = await preview.boundingBox();
    assert.ok(Math.abs(sourceBox.x - fieldsBox.x) < 2);
    assert.ok(fieldsBox.y >= sourceBox.y + sourceBox.height);
    assert.ok(previewBox.x >= sourceBox.x + sourceBox.width);
    assert.ok(Math.abs(previewBox.y - sourceBox.y) < 2, JSON.stringify({ sourceBox, previewBox }));
    await page.screenshot({ path: `${output}/desktop-two-columns.png` });
    checks.push('composer places sections 2 and 3 in the left column and section 4 alongside on the right');

    await row.locator('[data-include]').uncheck();
    await waitText(text, false);
    await row.locator('[data-include]').check();
    await waitText(text, true);
    checks.push('selecting, deselecting and editing source text updates right preview without a refresh click');

    const audienceText = 'Kính gửi: Đơn vị kiểm thử bố cục.';
    await audience.fill(audienceText);
    await waitText(audienceText, true);
    const sticky = await preview.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const header = element.closest('.main').querySelector('.topbar').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, headerBottom: Math.max(0, header.bottom), height: innerHeight };
    });
    assert.ok(sticky.top >= sticky.headerBottom && sticky.top < sticky.headerBottom + 20, JSON.stringify(sticky));
    assert.ok(sticky.bottom <= sticky.height, JSON.stringify(sticky));
    await page.screenshot({ path: `${output}/document-fields-live-preview.png` });
    checks.push('preview stays in view below system header while editing document fields farther down the left');

    await page.setViewportSize({ width: 1280, height: 900 });
    await scrollToColumns();
    sourceBox = await source.boundingBox();
    previewBox = await preview.boundingBox();
    assert.ok(previewBox.x >= sourceBox.x + sourceBox.width);
    await page.waitForFunction(() => {
      const viewport = document.querySelector('#bcnPaperViewport');
      return viewport.scrollWidth <= viewport.clientWidth + 2;
    });
    await page.locator('#bcnPreviewZoom').click();
    assert.equal(await paper.evaluate(element => element.style.zoom), '1');
    assert.ok(await page.locator('#bcnPaperViewport').evaluate(element => element.scrollWidth > element.clientWidth));
    await page.locator('#bcnPreviewZoom').click();
    await page.waitForFunction(() => {
      const viewport = document.querySelector('#bcnPaperViewport');
      return viewport.scrollWidth <= viewport.clientWidth + 2;
    });
    await page.screenshot({ path: `${output}/laptop-two-columns.png` });
    checks.push('1280px laptop retains two columns; fit-to-width and 100 percent zoom remain usable');

    await page.setViewportSize({ width: 390, height: 844 });
    await preview.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const viewport = document.querySelector('#bcnPaperViewport');
      return viewport.scrollWidth <= viewport.clientWidth + 2;
    });
    fieldsBox = await fields.boundingBox();
    previewBox = await preview.boundingBox();
    assert.ok(previewBox.y >= fieldsBox.y + fieldsBox.height);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: `${output}/mobile-preview.png` });
    checks.push('mobile stacks sections in order and fits the A4 preview without horizontal page overflow');
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await audience.fill(originalAudience);
    await row.locator('textarea').fill(original);
    if (!selected) await row.locator('[data-include]').uncheck();
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
