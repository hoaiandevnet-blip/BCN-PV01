import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const date = value => value.split('-').reverse().join('/');

export async function verifyDomainFilter({ page, data, output, audience, check }) {
  const folder = `${output}/domain-filter-20261117`;
  await mkdir(folder, { recursive: true });
  const button = code => page.locator(`[data-domain-select="${code}"]`);
  const assertChart = async domain => {
    assert.equal(await page.locator('[data-trend-domain]').innerText(), domain.label);
    assert.equal(await button(domain.code).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-domain-select][aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('.dash-comparison').getAttribute('data-direction'), domain.direction);
    if (domain.current === 0 && domain.previous === 0 && domain.direction === 'flat') {
      assert.doesNotMatch(await page.locator('.dash-comparison').innerText(), /Phát sinh mới/);
    }
    assert.equal(await page.locator('.is-current .dash-compare-number strong').innerText(),
      data.coverage.currentDays ? number(domain.current) : '—');
    assert.equal(await page.locator('.is-previous .dash-compare-number strong').innerText(),
      data.coverage.previousDays ? number(domain.previous) : '—');
    await page.locator('[data-trend-point]').last().waitFor();
    const labels = await page.locator('[data-trend-point]').evaluateAll(points =>
      points.map(point => point.getAttribute('aria-label')));
    assert.deepEqual(labels, domain.series.map(point =>
      `${date(point.day)}: ${point.hasCurrent ? number(point.current) + ' vụ' : 'chưa có báo cáo'}; `
      + `${date(point.previousDay)}: ${point.hasPrevious ? number(point.previous) + ' vụ' : 'chưa có báo cáo'}`));
    const colors = await page.locator('.dash-trend-column').evaluateAll(columns => columns.map(column => {
      const swatch = document.createElement('span');
      const palette = getComputedStyle(column);
      const expected = column.dataset.direction === 'down' ? '--dash-green' : '--dash-domain';
      swatch.style.color = palette.getPropertyValue(expected);
      column.closest('.dash-chart-panel').append(swatch);
      const color = getComputedStyle(swatch).color;
      swatch.remove();
      const stop = column.querySelector('.dash-trend-stop');
      return { actual: getComputedStyle(stop).stopColor, expected: color };
    }));
    assert.ok(colors.every(color => color.actual === color.expected), JSON.stringify(colors));
  };
  const originalTotal = await page.locator('.dash-kpi-value').allTextContents();
  for (const domain of data.domains) {
    await button(domain.code).click();
    await assertChart(domain);
  }
  assert.deepEqual(await page.locator('.dash-kpi-value').allTextContents(), originalTotal);
  const selected = data.domains.find(domain => domain.code === 'PPHS');
  await button(selected.code).click();
  await assertChart(selected);
  await page.locator('[data-trend-point]').last().click();
  assert.match(await page.locator('#dashTrendTooltip').innerText(), new RegExp(`${selected.current} vụ`));
  await page.locator('[data-trend-point]').last().press('Escape');
  await page.locator('.dash-analysis').screenshot({ path: `${folder}/${audience}-selected.png` });

  await button(selected.code).focus();
  await button(selected.code).press('Enter');
  assert.equal(await page.locator('[data-domain-select][aria-pressed=true]').count(), 0);
  assert.equal(await page.locator('[data-trend-domain]').innerText(), 'Tất cả hệ nghiệp vụ');
  assert.equal(await page.locator('.is-current .dash-compare-number strong').innerText(), number(data.cases.current));
  await button(selected.code).press('Space');
  await assertChart(selected);

  await page.locator('#dashRefresh').click();
  await page.locator('#dashData[aria-busy=false]').waitFor();
  await assertChart(selected);
  for (const span of [7, 30, 1]) {
    const response = page.waitForResponse(response => response.url().includes('/dashboard?')
      && new URL(response.url()).searchParams.get('span') === String(span));
    await page.locator(`[data-span="${span}"]`).click();
    const result = await (await response).json();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    data = result;
    await assertChart(result.domains.find(domain => domain.code === selected.code));
  }
  const originalDay = data.day;
  const changeDay = async day => {
    const response = page.waitForResponse(response => response.url().includes('/dashboard?')
      && new URL(response.url()).searchParams.get('day') === day);
    await page.locator('#dashDay').fill(day);
    data = await (await response).json();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await assertChart(data.domains.find(domain => domain.code === selected.code));
  };
  await changeDay(data.previousTo);
  await changeDay(originalDay);

  await page.setViewportSize({ width: 320, height: 850 });
  await button('MOI_TRUONG').click();
  await assertChart(data.domains.find(domain => domain.code === 'MOI_TRUONG'));
  for (const mode of ['dark', 'light']) {
    await page.evaluate(async mode => {
      const appearance = await import('/assets/js/standalone/appearance.js');
      appearance.previewAppearance({ palette: 'charcoal', mode });
    }, mode);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await page.locator('.dash-compare-result').evaluate(result => {
      const bounds = result.getBoundingClientRect();
      return [...result.querySelectorAll('*')].every(element =>
        element.getBoundingClientRect().right <= bounds.right + 1);
    }), true, 'Comparison text must remain visible inside the mobile chart');
    await page.locator('.dash-analysis').screenshot({ path: `${folder}/${audience}-320-${mode}.png` });
  }
  await page.locator('[data-domain-reset]').click();
  assert.equal(await page.locator('[data-domain-select][aria-pressed=true]').count(), 0);
  assert.equal(await button('MOI_TRUONG').evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  check(`${audience}: all 9 domain filters update chart, comparison and tooltip; keyboard, zero counts, `
    + 'reset, refresh, date/period changes and 320px light/dark layouts pass');
}
