import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { intakeSchema } from '../server/daily-reports/intake/validation.js';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';

export async function verifyEntryLock({ request, reporter, database, browser, base, output, check, errors }) {
  const endpoint = '/api/bao-cao-ngay';
  const { data: scope } = await request(endpoint + '/scope', { cookie: reporter });
  const id = randomUUID();
  const closedDay = shiftDay(scope.reportDay, -55);
  const values = Object.fromEntries(intakeSchema.entryFields.map(([key]) => [key, 0]));
  const payload = { id, unit_id: scope.unitId, report_day: closedDay, mode: 'WORK_ONLY', incidents: [],
    values, work_domain: 'Lĩnh vực ANTT - ATXH', primitive_weapon_types: [], attachments: [] };
  try {
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by)
      values($1,$2,$3,'DAILY_POLICE_WORK',$4::jsonb,'PENDING_REVIEW',$5)`,
    [id, scope.unitId, closedDay, JSON.stringify(values), scope.userId]);
    await database.query(`insert into daily_report_intake_batches(id,unit_id,created_by,payload_hash,result)
      values($1,$2,$3,'entry-lock-check','{}')`, [id, scope.unitId, scope.userId]);
    for (const [method, path, body] of [
      ['POST', '/daily-intake', { ...payload, id: randomUUID() }],
      ['POST', '/daily-intake', { ...payload, is_update: true, values: { ...values, guns: 9 } }],
      ['DELETE', `/daily-intake/${id}`, undefined]
    ]) {
      const result = await request(endpoint + path, { cookie: reporter, method, body });
      assert.equal(result.status, 423, JSON.stringify(result.data));
    }
    const stored = (await database.query('select metric_values from daily_report_metrics where id=$1', [id])).rows;
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0].metric_values, values);
    check('Closed reporting windows reject creating, editing and deleting intake reports without changing stored data');
  } finally {
    await database.query('delete from daily_report_intake_batches where id=$1', [id]);
    await database.query('delete from daily_report_metrics where id=$1', [id]);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const [name, value] = reporter.split('=');
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const current = Date.now();
  const serverNow = Date.parse(`${scope.reportDay}T10:30:00+07:00`);
  await page.route('**/api/bao-cao-ngay/daily-intake/latest?*', route =>
    route.fulfill({ json: { submitted: false } }));
  let mode = 'locked';
  await page.clock.setFixedTime(current);
  await page.route('**/api/bao-cao-ngay/scope', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const before = mode === 'before';
    await route.fulfill({ response, json: { ...body,
      serverNow: new Date(before ? serverNow - 31 * 60000 : serverNow).toISOString(),
      beforeCutoff: before, isLocked: mode === 'locked',
      activeUnlock: mode === 'open' ? { id: 'entry-lock-check', scopeKind: 'WORK_RESULT', scopeId: '*',
        expiresAt: new Date(serverNow + 30 * 60000).toISOString() } : null
    } });
  });
  const openEntry = async () => {
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.locator('[data-entry-lock-region=input]').waitFor();
    assert.equal(await page.locator('#bcnTimeWindow, #returnedReportAlert').count(), 0);
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
  };
  const allLocked = async () => {
    assert.equal(await page.locator('#dailyReports').getAttribute('data-bcn-entry-locked'), 'true');
    assert.equal(await page.locator('[data-entry-lock-region]').evaluateAll(regions => regions.every(region =>
      region.disabled && region.inert && [...region.querySelectorAll('input,select,textarea,button')]
        .every(control => control.matches(':disabled')))), true);
  };
  await mkdir(output + '/entry-lock', { recursive: true });
  try {
    await openEntry();
    await page.locator('#bcnCutoffLockBanner').waitFor({ state: 'visible' });
    await allLocked();
    assert.equal(await page.locator('#bcnUnlockTriggerBtn').isEnabled(), true);
    const choice = await page.evaluate(() => {
      const input = document.querySelector('input[name=bcn_incident_choice]:checked');
      const initial = input.value;
      document.querySelector('[data-bcn-choice=has_incident]').click();
      const button = document.createElement('button');
      button.type = 'button';
      button.onclick = () => { window.entryLockUnexpectedClick = true; };
      document.querySelector('[data-entry-lock-region=input]').append(button);
      button.click();
      const result = { initial, after: document.querySelector('input[name=bcn_incident_choice]:checked').value,
        disabled: button.matches(':disabled'), clicked: Boolean(window.entryLockUnexpectedClick) };
      button.remove();
      return result;
    });
    assert.equal(choice.initial, choice.after);
    assert.equal(choice.disabled, true);
    assert.equal(choice.clicked, false);
    await page.locator('#bcnUnlockTriggerBtn').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[data-entry-lock-region]'))), false);
    await page.locator('#bcnUnlockTriggerBtn').click();
    await page.locator('#bcnQuickUnlockDialog[open]').waitFor();
    await page.locator('#bcnQuickUnlockForm [data-close-unlock]').click();
    await page.locator('[data-bcn-pane=input]').screenshot({ path: output + '/entry-lock/all-disabled.png' });
    check('The entire entry module blocks fields, custom toggles, attachments, edit/delete actions and dynamic controls');

    mode = 'open';
    await openEntry();
    await page.locator('#bcnUnlockedBanner').waitFor({ state: 'visible' });
    await page.locator('#bcnDailyIntake').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('#bcnSubmittedReportCard')?.hidden === false
      || document.querySelector('#bcnDailyIntake')?.hidden === false);
    if (await page.locator('#bcnEditSubmittedReportBtn').isVisible()) {
      await page.locator('#bcnEditSubmittedReportBtn').click();
    }
    await page.locator('[data-bcn-choice=has_incident]').click();
    const note = page.locator('#bcnReferenceCaseForm [name=summary]');
    await note.fill('Nội dung chưa gửi cần được giữ khi hết thời gian mở khóa');
    assert.equal(await page.locator('#bcnReferenceCaseForm [name=unit_id]').isDisabled(), true);
    await page.locator('#bcnReferenceCaseForm [data-handling-open]').click();
    await page.locator('.bcn-handling-dialog[open]').waitFor();
    await page.clock.setFixedTime(current + 31 * 60000);
    await page.locator('#bcnCutoffLockBanner').waitFor({ state: 'visible' });
    await allLocked();
    assert.equal(await page.locator('.bcn-handling-dialog[open]').count(), 0);
    assert.equal(await page.locator('#bcnUnlockTriggerBtn').isEnabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'bcnUnlockTriggerBtn');
    assert.equal(await note.inputValue(), 'Nội dung chưa gửi cần được giữ khi hết thời gian mở khóa');
    await page.screenshot({ path: output + '/entry-lock/expired.png' });
    check('Unlock expiry closes an open entry dialog, locks all sections and preserves unsent form content');

    mode = 'before';
    await page.clock.setFixedTime(current);
    await openEntry();
    await page.waitForFunction(() => document.querySelector('#dailyReports').dataset.bcnEntryLocked === 'false');
    await page.clock.setFixedTime(current + 2 * 60000);
    await page.locator('#bcnCutoffLockBanner').waitFor({ state: 'visible' });
    await allLocked();
    check('An entry page left open before 10:00 automatically locks at the cutoff without reloading');
  } finally {
    await context.close();
  }
}
