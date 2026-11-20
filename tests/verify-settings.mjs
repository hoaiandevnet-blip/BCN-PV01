import assert from 'node:assert/strict';
import { palettes } from '../assets/js/standalone/palettes.js';

export async function verifySettings({ request, admin, reporter, compiler, page, browser, base, password,
  database, output, check, errors }) {
  const initial = (await request('/api/settings', { cookie: admin })).data;
  const payload = { palette: 'crimson', mode: 'light', revision: initial.revision };
  for (const cookie of ['', reporter, compiler]) {
    const expected = cookie ? 403 : 401;
    assert.equal((await request('/api/settings', { cookie })).status, expected);
    assert.equal((await request('/api/settings', { cookie, method: 'PUT', body: payload,
      headers: { 'x-actor': 'admin' } })).status, expected);
  }
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT', body: payload,
    headers: { origin: 'https://invalid.example' } })).status, 403);
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT',
    body: { ...payload, palette: 'invalid' } })).status, 400);
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT',
    body: { ...payload, mode: 'invalid' } })).status, 400);
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT',
    body: { ...payload, is_admin: true } })).status, 400);
  const publicSettings = await request('/api/appearance');
  assert.equal(publicSettings.status, 200);
  assert.deepEqual(Object.keys(publicSettings.data).sort(), ['mode', 'palette', 'revision']);
  check('Only authenticated admins can read or change settings; invalid and cross-origin writes are denied');

  await page.locator('[data-page=settings]').click();
  await page.locator('#appearanceSave').waitFor();
  const previewBackgrounds = new Set();
  for (const mode of ['dark', 'light']) {
    await page.locator(`#settings [data-mode="${mode}"]`).click();
    for (const palette of palettes) {
      await page.locator(`#settings [data-palette="${palette.id}"]`).click();
      assert.equal(await page.locator('body').getAttribute('data-palette'), palette.id);
      assert.equal(await page.locator('body').getAttribute('data-appearance-mode'), mode);
      const rendering = await page.locator('.bcn-settings-panel').first().evaluate(element => {
        const style = getComputedStyle(element);
        return { blur: style.backdropFilter, background: style.backgroundColor };
      });
      assert.match(rendering.blur, /blur\(/);
      previewBackgrounds.add(rendering.background);
    }
  }
  assert.ok(previewBackgrounds.size >= 6, 'Palette colours must change rendered glass surfaces');
  assert.equal((await request('/api/settings', { cookie: admin })).data.revision, initial.revision);
  await page.locator('#appearanceCancel').click();
  assert.equal(await page.locator('body').getAttribute('data-palette'), initial.palette);
  check('All six palettes preview in light and dark glass without saving; Cancel restores the saved palette');

  await page.locator('#settings [data-palette=crimson]').click();
  await page.locator('#settings [data-mode=light]').click();
  const response = page.waitForResponse(value => value.url().endsWith('/api/settings') &&
    value.request().method() === 'PUT');
  await page.locator('#appearanceSave').click();
  assert.equal((await response).status(), 200);
  await page.getByText('Đã lưu giao diện cho toàn hệ thống', { exact: true }).waitFor();
  const disabledBackground = await page.locator('#appearanceSave').evaluate(button =>
    getComputedStyle(button).backgroundColor);
  assert.notEqual(disabledBackground, 'rgba(0, 0, 0, 0)', 'Disabled primary controls must remain readable');
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('.bcn-settings-head').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/theme/settings-light.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stored = (await database.query('select * from bcn_system_settings where id = 1')).rows[0];
  assert.equal(stored.palette, 'crimson');
  assert.equal(stored.mode, 'light');
  assert.equal(stored.updated_by, 'admin');
  assert.equal(stored.revision, initial.revision + 1);
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT', body: payload })).status, 409);
  assert.ok((await database.query("select id from activity_logs where module_key = 'settings'")).rows.length);
  await page.reload();
  await page.locator('#home.active').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-palette'), 'crimson');
  assert.equal(await page.locator('body').getAttribute('data-appearance-mode'), 'light');
  await page.locator('#sidebar [data-bcn-view=input]').click();
  await page.locator('#bcnDailyIntake').waitFor({ state: 'visible' });
  await page.screenshot({ path: output + '/theme/report-light.png', fullPage: true });
  await page.locator('[data-page=digitalMap]').click();
  await page.waitForFunction(() => document.querySelectorAll('#digitalMapCanvas .leaflet-interactive').length >= 95);
  await page.screenshot({ path: output + '/theme/map-light.png', fullPage: true });
  check('Saving appearance persists in the database, survives reload, records audit and rejects stale updates');

  const staffContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const staff = await staffContext.newPage();
  staff.on('pageerror', error => errors.push(error.message));
  await staff.goto(base);
  await staff.waitForFunction(() => document.body.dataset.palette === 'crimson');
  await staff.locator('#loginAccount').fill('demo.canbo02');
  await staff.locator('#loginPassword').fill(password);
  await staff.locator('#loginForm button[type=submit]').click();
  await staff.locator('#home.active').waitFor();
  assert.equal(await staff.locator('[data-page=settings]').isVisible(), false);
  assert.equal(await staff.locator('#settings').innerText(), '');
  assert.equal((await staff.request.get(base + '/api/settings')).status(), 403);
  assert.equal(await staff.locator('body').getAttribute('data-appearance-mode'), 'light');
  await staff.screenshot({ path: output + '/theme/staff-no-settings.png', fullPage: true });
  await staffContext.close();
  check('A separate ordinary-user browser inherits the saved palette but cannot see or access Settings');

  await page.locator('[data-page=settings]').click();
  await page.locator('#settings [data-palette=emerald]').click();
  await page.locator('#settings [data-mode=dark]').click();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.locator('.bcn-settings-head').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/theme/settings-dark.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-page=home]').click();
  assert.equal(await page.locator('body').getAttribute('data-palette'), 'crimson');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menuToggle').click();
  await page.locator('[data-page=settings]').click();
  await page.locator('#appearanceSave').waitFor();
  await page.screenshot({ path: output + '/theme/settings-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const current = (await request('/api/settings', { cookie: admin })).data;
  assert.equal((await request('/api/settings', { cookie: admin, method: 'PUT', body: {
    palette: initial.palette, mode: initial.mode, revision: current.revision
  } })).status, 200);
  await page.reload();
  await page.locator('#home.active').waitFor();
  check('Leaving settings cancels unsaved preview and mobile settings fit the viewport');
}
