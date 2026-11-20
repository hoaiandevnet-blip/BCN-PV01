import assert from 'node:assert/strict';

function recordStartupFrames() {
  window.__startupFrames = [];
  const visible = selector => {
    const element = document.querySelector(selector);
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  };
  const started = performance.now();
  const sample = () => {
    const frame = { loading: visible('#appLoading'), login: visible('#loginScreen'), app: visible('#appShell') };
    const previous = window.__startupFrames.at(-1);
    if (JSON.stringify(previous) !== JSON.stringify(frame)) window.__startupFrames.push(frame);
    if ((!frame.login && !frame.app) && performance.now() - started < 20000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function holdRequest(page, pattern) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => {
    await gate;
    await route.continue();
  };
  await page.route(pattern, handler);
  return { release, remove: () => page.unroute(pattern, handler) };
}

export async function verifyStartup({ page, browser, base, output, check, errors }) {
  await page.addInitScript(recordStartupFrames);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const session = await holdRequest(page, '**/api/me');
    const directory = await holdRequest(page, '**/api/directory');
    try {
      const sessionRequest = page.waitForRequest('**/api/me');
      const reload = page.reload({ waitUntil: 'domcontentloaded' });
      await sessionRequest;
      await page.locator('#appLoading').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#loginScreen').isVisible(), false);
      assert.equal(await page.locator('#appShell').isVisible(), false);
      const loadingFits = await page.locator('.bcn-loading-content').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 0 && rect.bottom <= innerHeight;
      });
      assert.equal(loadingFits, true, 'Loading identity and status must fit the viewport');
      await page.screenshot({ path: output + '/theme/reloading-' + width + '.png' });
      const directoryRequest = page.waitForRequest('**/api/directory');
      session.release();
      await directoryRequest;
      assert.equal(await page.locator('#appLoading').isVisible(), true);
      assert.equal(await page.locator('#loginScreen').isVisible(), false);
      assert.equal(await page.locator('#appShell').isVisible(), false);
      directory.release();
      await reload;
      await page.locator('#appShell').waitFor({ state: 'visible' });
      await page.locator('#appLoading').waitFor({ state: 'hidden' });
      await page.getByText('Xin chào,', { exact: false }).waitFor();
      const frames = await page.evaluate(() => window.__startupFrames);
      assert.ok(frames.some(frame => frame.loading), JSON.stringify(frames));
      assert.ok(frames.every(frame => !frame.login), 'A valid-session reload must never show the login form');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      check(`Reload at ${width}px shows loading until account and workspace data are ready, without a login flash`);
    } finally {
      session.release();
      directory.release();
      await session.remove();
      await directory.remove();
    }
  }

  const stored = await page.context().storageState();
  const expiredContext = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    storageState: { ...stored, cookies: stored.cookies.map(cookie => cookie.name === 'bcnpv01_session'
      ? { ...cookie, value: 'expired-verification-session' } : cookie) } });
  const expired = await expiredContext.newPage();
  expired.on('pageerror', error => errors.push(error.message));
  const session = await holdRequest(expired, '**/api/me');
  try {
    const sessionRequest = expired.waitForRequest('**/api/me');
    const navigation = expired.goto(base, { waitUntil: 'domcontentloaded' });
    await sessionRequest;
    await expired.locator('#appLoading').waitFor({ state: 'visible' });
    assert.equal(await expired.locator('#loginScreen').isVisible(), false);
    session.release();
    await navigation;
    await expired.locator('#loginScreen').waitFor({ state: 'visible' });
    assert.equal(await expired.locator('#appLoading').isVisible(), false);
    assert.equal(await expired.locator('#appShell').isVisible(), false);
    check('An expired session shows the login form only after the server rejects it; loading always finishes');
  } finally {
    session.release();
    await expiredContext.close();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
