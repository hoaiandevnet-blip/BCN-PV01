import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';

export async function verifyBrowserIds({ chromium, base, password, database, output, check, errors }) {
  const origin = new URL(base);
  origin.hostname = 'bcnpv01-lan.test';
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--host-resolver-rules=MAP bcnpv01-lan.test 127.0.0.1', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  let sourceId;
  const unlockId = randomUUID();
  await mkdir(output + '/lan-browser', { recursive: true });
  try {
    await page.goto(origin.href);
    await page.locator('#loginScreen').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => isSecureContext), false);
    assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
    await page.locator('#loginAccount').fill('demo.canbo02');
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    for (const view of ['input', 'registry', 'returned', 'updates', 'unlock']) {
      await page.locator(`#sidebar [data-bcn-view="${view}"]`).click();
      await page.locator(`#dailyReports[data-bcn-active-view="${view}"]`).waitFor();
      assert.equal(await page.evaluate(() => typeof window.DailyReports.activate), 'function');
      if (view === 'input') {
        await page.locator('[data-bcn-pane=input]').waitFor({ state: 'visible' });
        await page.locator('#bcnDailyIntake').waitFor({ state: 'attached' });
        assert.equal(await page.locator('#dailyReportUnlockForm').isVisible(), false);
      }
      if (view === 'registry') await page.waitForFunction(() =>
        !document.querySelector('#dailyReportCaseRows').textContent.includes('Đang tải'));
    }
    assert.deepEqual(browserErrors, []);
    check('HTTP LAN origins log in and initialize entry, registry, returned, updates and unlock views without raw loading blocks');

    const scope = await page.evaluate(async () =>
      (await window.BcnSession.fetch('/api/bao-cao-ngay/scope')).json());
    const day = shiftDay(scope.reportDay, -77);
    const ids = await page.evaluate(() => Array.from({ length: 64 }, () => window.BcnIds.randomUUID()));
    assert.equal(new Set(ids).size, 64);
    assert.ok(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
    sourceId = ids[0];
    await database.query(`insert into daily_report_unlock_requests
      (id,unit_id,report_day,scope_kind,scope_id,reason,status,requester_id,approved_at,expires_at)
      values($1,$2,$3,'SITUATION',$4,'Kiểm chứng mã hồ sơ qua HTTP LAN','APPROVED',$5,
        now(),now()+interval '30 minutes')`, [unlockId, scope.unitId, day, sourceId, scope.userId]);
    const created = await page.evaluate(async payload => {
      const response = await window.BcnSession.fetch('/api/bao-cao-ngay/situations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      return { status: response.status, data: await response.json() };
    }, { id: sourceId, report_day: day, category_codes: ['KHIEU_KIEN_PHUC_TAP_ANTT'],
      narrative: 'Nội dung kiểm chứng mã định danh trên trình duyệt HTTP LAN', attachments: [] });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.situation.id, sourceId);
    const stored = await database.query('select id from daily_report_situations where id=$1', [sourceId]);
    assert.equal(stored.rowCount, 1);
    check('Cryptographically generated UUIDs on HTTP LAN remain valid and persist through the real report API');

    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${output}/lan-browser/input-${width}.png` });
    }
    assert.deepEqual(browserErrors, []);
  } catch (error) {
    await page.screenshot({ path: output + '/lan-browser/failure.png', timeout: 10000 }).catch(() => {});
    throw error;
  } finally {
    errors.push(...browserErrors);
    await browser.close();
    if (sourceId) await database.query('delete from daily_report_situations where id=$1', [sourceId]);
    await database.query('delete from daily_report_unlock_requests where id=$1', [unlockId]);
  }
}
