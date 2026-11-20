import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { verifySubmittedCaseOrder } from './verify-submitted-case-order.mjs';

export async function verifyCompactScreen({ browser, base, reporter, output, check, errors }) {
  const folder = output + '/compact-screen';
  await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1422, height: 727 } });
  const [name, value] = reporter.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const measurements = [];
  const measure = () => page.evaluate(() => {
    const bounds = selector => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const size = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      title: bounds('#accountUnit'), header: bounds('.bcn-topbar'),
      brand: bounds('#sidebar .bcn-brand'), sidebar: bounds('#sidebar'),
      firstKpi: bounds('[data-unit-kpi=cases]'),
      work: bounds('#unitWorkTitle'), footer: bounds('#sidebar .bcn-sidebar-foot'),
      lastMenu: bounds('#sidebar [data-bcn-view="unlock"]'),
      reportFont: size('.unit-work-label'), menuFont: size('#sidebar .nav-text'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  });
  const setStyles = enabled => page.evaluate(enabled => {
    document.querySelectorAll('link[href*="compact-screen/"]').forEach(link => { link.sheet.disabled = !enabled; });
  }, enabled);
  try {
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('[data-work-field=patrol_rounds]').waitFor();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await setStyles(false);
    const before = await measure();
    await page.screenshot({ path: folder + '/before-1422x727.png', animations: 'disabled' });
    await setStyles(true);
    const after = await measure();
    measurements.push({ before, after });
    assert.equal(await page.locator('#home .dash-header').isVisible(), false);
    assert.ok(after.firstKpi.bottom < before.firstKpi.bottom - 20,
      'Compaction must bring the first summary statistic materially higher');
    assert.ok(after.reportFont >= 12 && after.menuFont >= 14, 'Keep content and navigation text readable');
    check('Laptop layout keeps summary statistics high on the page with identity in the toolbar and readable menu text');

    for (const [width, height] of [[1422, 727], [1366, 650], [1280, 640], [1024, 680], [390, 740], [320, 700]]) {
      await page.setViewportSize({ width, height });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          document.querySelector('.main').scrollTop = 0;
        }, mode);
        const result = await measure();
        measurements.push({ mode, ...result });
        assert.equal(result.overflow, false, `${mode} ${width}: no page-level horizontal scroll`);
        assert.equal(await page.locator('.bcn-topbar').evaluate(bar => bar.scrollWidth <= bar.clientWidth + 1), true);
        assert.equal(await page.locator('#home #unitTasksTitle, #home #unitRecentTitle, #home .unit-progress').count(), 0);
        if (width > 760) {
          assert.ok(result.firstKpi.bottom <= height, `${width}x${height}: the first summary statistic fits initially`);
          assert.ok(result.lastMenu.bottom <= result.footer.top + 1, `${width}: unit navigation stays above the footer`);
        }
        const visibleOverflow = await page.locator('.unit-work-values article').evaluateAll(cards => cards.some(card =>
          card.scrollWidth > card.clientWidth + 1));
        assert.equal(visibleOverflow, false, `${width}: work-result numbers fit their cards`);
        assert.equal(await page.locator('#unitWorkTitle').evaluate(title => {
          const panel = title.closest('section');
          const analysis = panel.previousElementSibling;
          const work = title.closest('.unit-report-work');
          const reports = panel.querySelector('.dash-table-scroll');
          return panel.classList.contains('dash-units') && analysis.classList.contains('dash-analysis')
            && panel.nextElementSibling.classList.contains('dash-footer')
            && panel.getBoundingClientRect().top >= analysis.getBoundingClientRect().bottom
            && work.getBoundingClientRect().top >= reports.getBoundingClientRect().bottom;
        }), true, `${width}: own-unit reports and work results share the final dashboard panel`);
        await page.screenshot({ path: `${folder}/${mode}-${width}x${height}.png`, animations: 'disabled' });
      }
    }
    check('Small laptop and phone dashboards fit in both themes; work statistics and menu stay reachable');

    await page.setViewportSize({ width: 1920, height: 1080 });
    const large = await measure();
    await setStyles(false);
    const originalLarge = await measure();
    assert.equal(large.header.height, originalLarge.header.height);
    assert.equal(large.sidebar.width, originalLarge.sidebar.width);
    await setStyles(true);
    await page.screenshot({ path: folder + '/large-1920x1080.png', animations: 'disabled' });
    measurements.push({ large, originalLarge });
    check('Large desktop screens retain their existing spacious layout');

    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.locator('.bcn-topbar[data-entry-topbar]').waitFor();
    assert.equal(await page.locator('#dailyReports .daily-report-heading').isVisible(), false);
    assert.equal(await page.locator('.bcn-topbar #pageTitle').innerText(), 'Nhập báo cáo ngày');
    assert.match(await page.locator('.entry-topbar-day').innerText(), /^\d{2}\/\d{2}\/\d{4}$/);
    const reportDay = await page.locator('.entry-topbar-day').getAttribute('datetime');
    const nextDay = new Date(Date.parse(reportDay + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    await page.route('**/api/bao-cao-ngay/scope', async route => {
      const response = await route.fetch();
      const scope = await response.json();
      await route.fulfill({ response, json: { ...scope, reportDay: nextDay } });
    });
    const scopeResponse = page.waitForResponse(response => response.url().endsWith('/api/bao-cao-ngay/scope'));
    await page.locator('#sidebar [data-bcn-view=input]').click();
    assert.equal((await scopeResponse).status(), 200);
    await page.waitForFunction(day => document.querySelector('.entry-topbar-day')?.dateTime === day, nextDay);
    await page.unroute('**/api/bao-cao-ngay/scope');
    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.waitForFunction(day => document.querySelector('.entry-topbar-day')?.dateTime === day, reportDay);
    await verifySubmittedCaseOrder({ page, folder, check });
    for (const view of ['input', 'registry']) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.locator(`#sidebar [data-bcn-view=${view}]`).click();
      await page.locator(`.bcn-topbar[data-entry-topbar=${view}]`).waitFor();
      const expectedTitle = view === 'input' ? 'Nhập báo cáo ngày' : 'Tra cứu vụ việc';
      assert.equal(await page.locator('#pageTitle').innerText(), expectedTitle);
      assert.equal(await page.locator('#dailyReports .daily-report-heading').isVisible(), false);
      assert.equal(await page.locator('#dailyReportRefresh').isVisible(), false);
      assert.equal(await page.locator('#bcnPageActions [data-bcn-go=input]').count(), 0);
      if (view === 'registry') {
        await page.locator('#bcnRegistryFilters').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.entry-topbar-day').count(), 0);
      }
      const sizes = [[1920, 1080], [1422, 727], [1280, 640], [1024, 680], [390, 740], [320, 700]];
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const mode of ['dark', 'light']) {
          await page.evaluate(async mode => {
            const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
            previewAppearance({ palette: 'charcoal', mode });
            document.querySelector('.main').scrollTop = 0;
            window.NotificationPopup.getShared().reset();
          }, mode);
          const fits = await page.locator('.bcn-topbar').evaluate((bar, view) => {
            const elements = ['#pageTitle', '#accountUnit', '.userbox'];
            if (view === 'input') elements.push('.entry-topbar-day');
            return bar.scrollWidth <= bar.clientWidth + 1 && elements.every(selector => {
              const node = bar.querySelector(selector);
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth
                && node.scrollWidth <= node.clientWidth + 1;
            });
          }, view);
          assert.equal(fits, true, `${view} ${mode} ${width}: title and account controls fit in the toolbar`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await page.screenshot({ path: `${folder}/${view}-${mode}-${width}x${height}.png`, animations: 'disabled' });
        }
      }
    }
    await page.setViewportSize({ width: 1422, height: 727 });
    for (const view of ['registry', 'returned', 'unlock', 'input', 'registry']) {
      await page.locator(`#sidebar [data-bcn-view=${view}]`).click();
      await page.locator(`#dailyReports[data-bcn-active-view=${view}]`).waitFor();
      const compact = view === 'input' || view === 'registry';
      assert.equal(await page.locator('.bcn-topbar #dailyReportRefresh').count(), 0);
      assert.equal(await page.locator('#dailyReports #dailyReportRefresh').isVisible(), !compact);
      assert.equal(await page.locator('.entry-topbar-icon').count(), compact ? 1 : 0);
      if (!compact) assert.equal(await page.locator('#pageTitle').innerText(), 'Báo cáo ngày');
    }
    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.locator('[data-page=home]').click();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    assert.equal(await page.locator('.bcn-topbar[data-entry-topbar], .entry-topbar-meta').count(), 0);
    assert.equal(await page.locator('.bcn-topbar[data-unit-dashboard]').count(), 1);
    check('Entry and registry titles fit the toolbar without removed actions and restore correctly on navigation');
  } catch (error) {
    await page.screenshot({ path: folder + '/failure.png', animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    await writeFile(folder + '/measurements.json', JSON.stringify(measurements, null, 2));
    await context.close();
  }
}
