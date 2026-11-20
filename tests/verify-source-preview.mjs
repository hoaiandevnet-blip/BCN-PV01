import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';

export async function verifySourcePreview({ request, reporter, database, browser, base, output, check, errors }) {
  const folder = output + '/source-preview';
  await mkdir(folder, { recursive: true });
  const { data: scope } = await request('/api/bao-cao-ngay/scope', { cookie: reporter });
  const day = shiftDay(scope.reportDay, -205);
  const workId = randomUUID();
  const situationId = randomUUID();
  const values = {
    primitive_weapons: 5, community_sentences: 6, released_prisoners: 2,
    delinquent_youth: 5, community_rehabilitation: 1, suspected_drug_users: 1,
    patrol_officers: 14, patrol_rounds: 6, patrol_vehicles_checked: 38, patrol_violations: 5,
    administrative_checks: 16, administrative_violation_records: 6,
    administrative_penalty_decisions: 5, administrative_fines: 3750000
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 640 } });
  const [name, value] = reporter.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const dialog = page.locator('.bcn-source-preview[open]');
  const measurements = [];
  const events = new Map();
  async function openSource(id) {
    await page.locator('#notificationToggle').click();
    await page.locator('[data-notification-kind=all]').click();
    const refreshed = page.waitForResponse(response => response.url().endsWith('/api/notifications'));
    await page.locator('[data-notification-refresh]').click();
    await refreshed;
    await page.locator(`[data-notification-item="server:bcn:${events.get(id)}"] [data-notification-open]`).click();
    await dialog.waitFor();
    await dialog.locator(`[data-source-id="${id}"]`).waitFor({ state: 'visible' });
  }
  try {
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by,primitive_weapon_type,work_domain)
      values($1,$2,$3,'DAILY_POLICE_WORK',$4,'PENDING_REVIEW',$5,$6,$7)`,
    [workId, scope.unitId, day, JSON.stringify(values), scope.userId,
      'Dao mô hình — BÁO CÁO THỬ, không có vật chứng thật', 'Lĩnh vực ANTT - ATXH']);
    await database.query(`insert into daily_report_situations
      (id,unit_id,report_day,category_codes,narrative,state,created_by)
      values($1,$2,$3,'["NORMAL_DAY"]',$4,'PENDING_REVIEW',$5)`,
    [situationId, scope.unitId, day, 'Tình hình thử nghiệm <img src=x onerror=alert(1)>', scope.userId]);
    for (const [id, kind] of [[workId, 'WORK_RESULT'], [situationId, 'SITUATION']]) {
      const result = await database.query(`insert into daily_report_outbox
        (event_key,event_type,recipient_unit_id,resource_type,resource_id)
        values($1,'SOURCE_RETURNED',$2,$3,$4) returning id`,
      ['PREVIEW-' + id, scope.unitId, kind, id]);
      events.set(id, result.rows[0].id);
    }
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await openSource(workId);
    assert.equal(await dialog.locator('.bcn-work-block').count(), 4);
    assert.match(await dialog.innerText(), /3\.750\.000/);
    assert.match(await dialog.locator('[data-source-field=status]:visible').innerText(), /Chờ duyệt/);
    assert.match(await dialog.locator('[data-source-field=unit]:visible').innerText(), new RegExp(scope.unitName));
    assert.equal(await dialog.locator('.chip-val').allTextContents().then(items => items.some(text => /14/.test(text))), true);
    for (const [width, height] of [[1422, 727], [1280, 640], [1024, 600], [390, 740], [320, 640]]) {
      await page.setViewportSize({ width, height });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          document.querySelector('.bcn-source-preview #bcnSourceRows').scrollTop = 0;
        }, mode);
        const result = await dialog.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const header = element.querySelector('header').getBoundingClientRect();
          const source = element.querySelector('#bcnSourceRows');
          const row = element.querySelector('tr[data-source-id]:not([hidden])');
          const content = row.querySelector('[data-source-field=content]').getBoundingClientRect();
          const nodes = [...element.querySelectorAll('*')].filter(node => node.getClientRects().length);
          const overflow = nodes.filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 2)
            .map(node => node.className || node.tagName);
          const collisions = [...element.querySelectorAll('.bcn-stat-chip')].some(chip => {
            const label = chip.querySelector('.chip-label').getBoundingClientRect();
            const value = chip.querySelector('.chip-val').getBoundingClientRect();
            return value.left < label.right + 4;
          });
          return { width: innerWidth, height: innerHeight, left: rect.left, right: rect.right,
            top: rect.top, bottom: rect.bottom, headerHeight: header.height,
            contentWidth: content.width, sourceWidth: source.clientWidth,
            overflow, collisions, font: getComputedStyle(row.querySelector('.chip-label')).fontSize };
        });
        measurements.push({ mode, ...result });
        assert.ok(result.left >= 0 && result.right <= width && result.top >= 0 && result.bottom <= height);
        assert.deepEqual(result.overflow, [], `${mode} ${width}: detail content must not scroll horizontally`);
        assert.equal(result.collisions, false, `${width}: labels and numbers need a visible gap`);
        assert.ok(parseFloat(result.font) >= 13);
        assert.ok(result.contentWidth >= result.sourceWidth * .9, 'Use full detail width for report content');
        await page.screenshot({ path: `${folder}/${mode}-${width}x${height}.png`, animations: 'disabled' });
      }
    }
    check('Source detail groups all work metrics across its width; 320–1422px layouts fit in both themes without collisions');
    const closeBefore = await dialog.locator('[data-source-preview-close]').boundingBox();
    await dialog.locator('#bcnSourceRows').evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.deepEqual(await dialog.locator('[data-source-preview-close]').boundingBox(), closeBefore);
    await dialog.locator(`[data-source-files="${workId}"]`).click();
    const attachment = page.locator('.bcn-attachment-dialog[open]');
    await attachment.getByText('Chưa có văn bản đính kèm.').waitFor();
    const badge = attachment.locator('.bcn-attachment-list h4 > span');
    assert.equal(await badge.innerText(), '0');
    for (const mode of ['dark', 'light']) {
      await page.evaluate(async mode => {
        const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
        previewAppearance({ palette: 'charcoal', mode });
      }, mode);
      const ratio = await badge.evaluate(node => {
        const luminance = rgb => {
          const [red, green, blue] = rgb.match(/\d+/g).map(value => {
            const channel = Number(value) / 255;
            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
          });
          return .2126 * red + .7152 * green + .0722 * blue;
        };
        const style = getComputedStyle(node);
        const text = luminance(style.color);
        const fill = luminance(style.backgroundColor);
        return (Math.max(text, fill) + .05) / (Math.min(text, fill) + .05);
      });
      assert.ok(ratio >= 4.5, `${mode} attachment count contrast: ${ratio.toFixed(2)}`);
      check(`${mode} attachment count 0 is readable (${ratio.toFixed(2)}:1)`);
    }
    const reloaded = page.waitForResponse(response => response.url().includes('/work-results?'));
    await attachment.getByRole('button', { name: 'Đóng', exact: true }).click();
    await reloaded;
    await dialog.locator('.bcn-work-block').first().waitFor();
    assert.equal(await dialog.locator('tbody > tr:not([hidden])').count(), 1);
    await page.keyboard.press('Escape');
    await page.locator('.bcn-source-preview').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#bcnSourceRows').count(), 1);
    assert.equal(await page.locator('#bcnSourceRows tbody tr[hidden]').count(), 0);
    check('Close stays accessible while scrolling; attachment dialog, source reload and Escape restore the original list');
    await database.query(`update daily_report_metrics set state='RETURNED',review_reason=$2 where id=$1`,
      [workId, 'Đối chiếu lại các số liệu trước khi gửi rà soát.']);
    await page.setViewportSize({ width: 1280, height: 640 });
    await openSource(workId);
    assert.match(await dialog.innerText(), /Đối chiếu lại các số liệu/);
    assert.equal(await dialog.locator('[data-source-edit]').isDisabled(), true);
    assert.equal(await dialog.locator('[data-source-action=submit]').isDisabled(), true);
    await dialog.locator('[data-source-preview-close]').click();
    await openSource(situationId);
    assert.match(await dialog.locator('h2').innerText(), /Chi tiết tình hình ANTT/);
    assert.match(await dialog.innerText(), /<img src=x onerror=alert\(1\)>/);
    assert.equal(await dialog.locator('img').count(), 0);
    await dialog.locator('[data-source-preview-close]').click();
    check('Returned reasons and editing restrictions survive; situation detail retains escaped narrative and closes normally');
  } catch (error) {
    await page.screenshot({ path: folder + '/failure.png', animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    await writeFile(folder + '/measurements.json', JSON.stringify(measurements, null, 2));
    await context.close();
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])',
      [[workId, situationId]]);
    await database.query('delete from daily_report_metrics where id=$1', [workId]);
    await database.query('delete from daily_report_situations where id=$1', [situationId]);
  }
}
