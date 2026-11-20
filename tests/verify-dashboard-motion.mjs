import assert from 'node:assert/strict';

export async function verifyDashboardMotion({ page: original, data, check }) {
  const page = await original.context().newPage();
  const endpoint = '**/api/bao-cao-ngay/dashboard?*';
  const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
  const cases = data.audience === 'unit' ? '[data-unit-kpi=cases]' : '.dash-kpi[data-tone=blue]';
  const counter = cases + ' .dash-kpi-value [data-count-to]';
  const fills = ['.dash-track > span', '.dash-compare-track > span'];
  if (data.audience !== 'unit') fills.push('.dash-progress > span');

  function sampleSweeps(selectors) {
    return [...selectors, '.dash-column-sweep'].map(selector => {
      const column = selector === '.dash-column-sweep';
      const elements = [...document.querySelectorAll(selector)];
      const element = elements.find(node => node.getBoundingClientRect().width > 0) || elements[0];
      const style = getComputedStyle(element, column ? null : '::after');
      const bar = column ? element.closest('[data-column]').querySelector('.dash-trend-bar') : element;
      const { width, height } = bar.getBoundingClientRect();
      return { width, height, transform: style.transform, iterations: style.animationIterationCount };
    });
  }

  async function checkEntrance() {
    const selectors = [
      ['.dash-domain-bottom .dash-track > span', 'a'],
      ['.is-current .dash-compare-track > span', 'a'],
      ['.dash-trend-bar', 'd']
    ];
    if (data.audience !== 'unit') selectors.push(['.dash-progress > span', 'a']);
    const growingBars = selectors.map(entry => page.waitForFunction(([selector, axis]) => {
      const bar = document.querySelector(selector);
      if (!bar) return false;
      const transform = getComputedStyle(bar).transform;
      if (transform === 'none') return false;
      const scale = new DOMMatrix(transform)[axis];
      return scale > 0 && scale < 1;
    }, entry));
    await Promise.all([...growingBars, page.waitForFunction(selector => {
      const target = document.querySelector(selector);
      const value = Number(target?.dataset.countFrame);
      return value > 0 && value < Number(target.dataset.countTo)
        && getComputedStyle(target, '::after').content.includes(String(value));
    }, counter)]);
    await page.waitForFunction(() => !document.querySelector('.dash-kpis[data-dash-entrance]'));
    assert.equal(await page.locator(counter).getAttribute('data-count-frame'), null);
    assert.equal(await page.locator(counter).innerText(), number.format(data.cases.current));
  }

  try {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Open the existing seeded reporting day through the normal dashboard entry path.
    await page.route(endpoint, route => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has('day')) url.searchParams.set('day', data.day);
      return route.continue({ url: url.href });
    });
    await page.goto(original.url(), { waitUntil: 'domcontentloaded' });
    await checkEntrance();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await checkEntrance();
    await page.locator('#sidebar [data-bcn-view]:visible').first().click();
    await page.locator('#dailyReports.active').waitFor();
    await page.locator('#sidebar [data-page=home]').click();
    await checkEntrance();
    const refreshed = page.waitForResponse(response =>
      response.url().includes('/api/bao-cao-ngay/dashboard?'));
    await page.locator('#dashRefresh').click();
    await refreshed;
    await page.locator('#dashData[aria-busy=false]').waitFor();
    assert.equal(await page.locator('#dashData [data-dash-entrance]').count(), 0);
    const first = await page.evaluate(sampleSweeps, fills);
    assert.ok(first.every(sample => sample.iterations === 'infinite'));
    await page.waitForFunction(() => {
      const sweep = document.querySelector('.dash-column-sweep');
      return sweep?.getAnimations().some(animation => {
        const timing = animation.effect.getComputedTiming();
        return timing.currentIteration >= 1 && timing.progress > .25 && timing.progress < .5;
      });
    });
    const next = await page.evaluate(sampleSweeps, fills);
    for (const [index, sample] of next.entries()) {
      if (sample.width > 0) assert.notEqual(sample.transform, first[index].transform);
      assert.equal(sample.width, first[index].width);
      assert.equal(sample.height, first[index].height);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const columnSweep = page.locator('.dash-column-sweep').first();
    assert.equal(await columnSweep.evaluate(node => getComputedStyle(node).display), 'none');
    for (const selector of fills) {
      const fill = page.locator(selector).first();
      const animation = await fill.evaluate(node => getComputedStyle(node, '::after').animationName);
      assert.equal(animation, 'none');
    }
    check(`${data.audience}: continuous light sweeps move inside stable bars and stop for reduced motion`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(counter).waitFor({ state: 'attached' });
    assert.equal(await page.locator(counter).innerText(), number.format(data.cases.current));
    assert.equal(await page.locator('#dashData [data-dash-entrance], #dashData [data-count-frame]').count(), 0);
    check(`${data.audience}: counters, horizontal fills and SVG columns animate on entry, reload and return; `
      + 'refresh and reduced motion show final values directly');
  } finally {
    await page.close();
    await original.bringToFront();
  }
}
