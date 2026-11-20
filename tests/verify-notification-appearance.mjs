import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

export async function verifyNotificationAppearance({ browser, base, admin, reporter, request,
  database, output, check, errors }) {
  const folder = output + '/notification-appearance';
  await mkdir(folder, { recursive: true });
  const { data: scope } = await request('/api/bao-cao-ngay/scope', { cookie: reporter });
  const source = randomUUID();
  const events = new Map();
  const context = await browser.newContext({ viewport: { width: 1422, height: 727 } });
  const [name, value] = admin.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  const panel = page.locator('#notificationPanel');
  const measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by)
      values($1,$2,$3,'DAILY_POLICE_WORK','{}','PENDING_REVIEW',$4)`,
    [source, scope.unitId, scope.reportDay, scope.userId]);
    for (const [type, tone] of [
      ['CASE_SUPPLEMENT_REQUESTED', 'returned'], ['WORK_RESULT_PENDING_REVIEW', 'warning'],
      ['WORK_RESULT_VERIFIED', 'success'], ['WORK_RESULT_UPDATED', 'info']
    ]) {
      const result = await database.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id,safe_payload)
        values($1,$2,$3,'WORK_RESULT',$4,$5::jsonb) returning id`,
      ['APPEARANCE-' + type + source, type, scope.unitId, source,
        JSON.stringify({ reason: 'Kiểm chứng giao diện thông báo <img src=x onerror=alert(1)>' })]);
      events.set(tone, result.rows[0].id);
    }
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    assert.equal(await page.locator('#home .dash-header').isVisible(), true);
    assert.equal(await page.locator('.bcn-topbar[data-unit-dashboard]').count(), 0);
    await page.evaluate(() => {
      window.NotificationPopup.getShared().reset();
      window.NotificationCenter.publish({ id: 'appearance-system', title: 'Thông báo hệ thống',
        message: 'Dữ liệu kiểm chứng giao diện, không phải thông báo thật.', level: 'info' });
    });
    await page.locator('#notificationToggle').click();
    const item = tone => panel.locator(`[data-notification-item="server:bcn:${events.get(tone)}"]`);
    await item('returned').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-notification-status]').textContent
      .includes('Đồng bộ lúc'));
    assert.match(await item('returned').locator('.notification-type').innerText(), /Yêu cầu bổ sung/);
    assert.match(await item('warning').locator('.notification-type').innerText(), /Chờ rà soát/);
    assert.match(await item('success').locator('.notification-type').innerText(), /Đã duyệt/);
    assert.match(await item('info').locator('.notification-type').innerText(), /Cập nhật báo cáo/);
    assert.equal(await item('returned').locator('img').count(), 0);
    for (const [width, height] of [[1422, 727], [1280, 640], [1024, 600], [390, 740], [320, 640]]) {
      await page.setViewportSize({ width, height });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          document.querySelector('[data-notification-list]').scrollTop = 0;
        }, mode);
        const result = await panel.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const close = element.querySelector('[data-notification-close]').getBoundingClientRect();
          const icon = element.querySelector('[data-notification-close] svg').getBoundingClientRect();
          const list = element.querySelector('.notification-list');
          const colors = Object.fromEntries(['returned', 'warning', 'success', 'info', 'system'].map(tone => {
            const row = element.querySelector(`[data-notification-tone="${tone}"]`);
            const style = getComputedStyle(row.querySelector('.notification-type'));
            return [tone, { text: style.color, background: style.backgroundColor,
              border: getComputedStyle(row).borderLeftColor,
              icon: getComputedStyle(row.querySelector('.notification-item-icon svg')).color }];
          }));
          return { width: innerWidth, height: innerHeight, left: rect.left, right: rect.right,
            top: rect.top, bottom: rect.bottom, listHeight: list.clientHeight,
            overflow: element.scrollWidth > element.clientWidth + 1 || list.scrollWidth > list.clientWidth + 1,
            colors, closeOffsetX: icon.x + icon.width / 2 - close.x - close.width / 2,
            closeOffsetY: icon.y + icon.height / 2 - close.y - close.height / 2 };
        });
        measurements.push({ mode, ...result });
        assert.ok(result.left >= 0 && result.right <= width && result.top >= 0 && result.bottom <= height);
        assert.equal(result.overflow, false);
        assert.ok(Math.abs(result.closeOffsetX) <= 0.5 && Math.abs(result.closeOffsetY) <= 0.5);
        assert.ok(result.listHeight >= 220, 'Keep enough visible space for notifications on a small screen');
        assert.equal(new Set(Object.values(result.colors).map(color => color.text)).size, 5);
        for (const color of Object.values(result.colors)) assert.equal(color.icon, color.text);
        await page.screenshot({ path: `${folder}/${mode}-${width}x${height}.png`, animations: 'disabled' });
        await panel.locator('[data-notification-close]').click();
        await page.evaluate(() => {
          window.NotificationPopup.getShared().reset();
          window.NotificationPopup.getShared().notify('Đã duyệt hồ sơ.', { durationMs: 60000 });
        });
        const popup = page.locator('.notification-popup-visible');
        await popup.waitFor();
        const popupOffset = await popup.locator('.notification-popup-close').evaluate(button => {
          const rect = button.getBoundingClientRect();
          const icon = button.querySelector('svg').getBoundingClientRect();
          return { x: icon.x + icon.width / 2 - rect.x - rect.width / 2,
            y: icon.y + icon.height / 2 - rect.y - rect.height / 2 };
        });
        assert.ok(Math.abs(popupOffset.x) <= 0.5 && Math.abs(popupOffset.y) <= 0.5);
        await popup.hover();
        await page.screenshot({ path: `${folder}/close-${mode}-${width}.png`, animations: 'disabled' });
        await popup.locator('.notification-popup-close').click();
        await popup.waitFor({ state: 'detached' });
        await page.locator('#notificationToggle').click();
      }
    }
    check('Notification types have distinct labels, icons and colors in both themes; small-screen panels retain list space');
    await page.setViewportSize({ width: 1422, height: 727 });
    await panel.locator('[data-notification-kind=returned]').click();
    assert.ok((await panel.locator('[data-notification-item]').count()) > 0);
    assert.equal(await panel.locator('[data-notification-item]:not([data-notification-tone=returned])').count(), 0);
    await panel.locator('[data-notification-kind=all]').click();
    await panel.locator('[data-notification-search]').fill('Kiểm chứng giao diện thông báo');
    assert.equal(await panel.locator('[data-notification-item]').count(), 4);
    await item('returned').locator('strong').click();
    assert.equal(await item('returned').evaluate(row => row.classList.contains('is-read')), false);
    const saved = page.waitForResponse(response => response.url().includes('/read') && response.request().method() === 'POST');
    await item('returned').locator('[data-notification-read]').click();
    assert.equal((await saved).status(), 200);
    await item('returned').locator('[data-notification-read]').waitFor({ state: 'detached' });
    await panel.locator('[data-notification-unread]').click();
    assert.equal(await item('returned').count(), 0);
    assert.equal(await panel.locator('[data-notification-item]').count(), 3);
    await page.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), false);
    assert.equal(await page.locator('#notificationToggle').evaluate(button => button === document.activeElement), true);
    check('Notification filters, search, explicit read action and Escape work; reading text alone preserves unread state');
  } catch (error) {
    await page.screenshot({ path: folder + '/failure.png' }).catch(() => {});
    throw error;
  } finally {
    await writeFile(folder + '/measurements.json', JSON.stringify(measurements, null, 2));
    await context.close();
    await database.query('delete from daily_report_outbox where resource_id=$1', [source]);
    await database.query('delete from daily_report_metrics where id=$1', [source]);
  }
}
