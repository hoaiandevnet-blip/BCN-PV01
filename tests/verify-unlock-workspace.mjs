import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function verifyUnlockWorkspace({ request, reporter, compiler, database,
  browser, base, output, check, errors }) {
  const folder = output + '/unlock-ui-20261117';
  await mkdir(folder, { recursive: true });
  const api = '/api/bao-cao-ngay';
  const scope = (await request(api + '/scope', { cookie: reporter })).data;
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const scopeIds = ids.map(() => randomUUID());
  const contexts = [];
  const testErrors = [];
  const marker = 'GIAO-DIEN-' + ids[0].slice(0, 8);
  let currentPage;
  let submittedId;
  const openPage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => testErrors.push(error.message));
    await page.goto(base);
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=unlock]').click();
    await page.locator('#dailyReportUnlockRows[aria-busy=false]').waitFor();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    return page;
  };
  try {
    for (const [index, id] of ids.entries()) {
      const status = index < 9 ? 'REQUESTED' : index === 10 ? 'REJECTED' : 'APPROVED';
      const approved = status === 'APPROVED';
      await database.query(`insert into daily_report_unlock_requests
        (id,unit_id,report_day,scope_kind,scope_id,reason,status,requester_id,
          approved_at,expires_at,decision_reason,created_at)
        values($1,$2,$3,'WORK_RESULT',$4,$5,$6,$7,$8,$9,$10,now()+$11::interval)`,
      [id, scope.unitId, scope.reportDay, scopeIds[index],
        `${marker} · Đề nghị cập nhật kết quả tuần tra ${index}. `
          + (index === 0 ? '<img src=x onerror="window.unlockUnsafe=true">\n'
            + 'Nội dung giải trình đầy đủ cần được đọc trước khi quyết định mở khóa. '.repeat(8)
            : 'Bổ sung số liệu của đơn vị.'),
        status, scope.userId, approved ? new Date() : null,
        approved ? new Date(Date.now() + (index === 11 ? -60000 : 1800000)) : null,
        status === 'REJECTED' ? 'Cần làm rõ nội dung bổ sung.' : null, `${index} seconds`]);
    }
    const page = await openPage(reporter);
    currentPage = page;
    assert.equal(await page.locator('#dailyReportUnlockForm').count(), 0);
    assert.equal(await page.locator('#sidebar [data-bcn-view=unlock]').innerText(), 'Lịch sử đề nghị');
    assert.equal(await page.locator('[data-approve]').count(), 0);
    assert.equal(await page.locator('#unlockDay').inputValue(), '');
    await page.locator('#unlockSearch').fill(marker);
    await page.waitForFunction(() => document.querySelector('#unlockResultCount').textContent.startsWith('12 '));
    assert.equal(await page.locator('#dailyReportUnlockRows [data-unlock-id]').count(), 8);
    await page.locator('#unlockNext').click();
    assert.equal(await page.locator('#dailyReportUnlockRows [data-unlock-id]').count(), 4);
    await page.locator('#unlockPrevious').click();
    await page.locator('[data-unlock-filter=REQUESTED]').click();
    assert.equal(await page.locator('#unlockStatus').inputValue(), 'REQUESTED');
    assert.match(await page.locator('#unlockResultCount').innerText(), /^9 /);
    await page.locator('[data-unlock-filter=EXPIRED]').click();
    assert.equal(await page.locator(`[data-unlock-id="${ids[11]}"]`).count(), 1);
    await page.locator('#unlockStatus').selectOption('REJECTED');
    const rejected = page.locator(`[data-unlock-id="${ids[10]}"]`);
    await rejected.locator('summary').click();
    assert.match(await rejected.innerText(), /Cần làm rõ nội dung bổ sung/);
    assert.equal(await rejected.locator('dt').filter({ hasText: 'Mã đối tượng' }).count(), 0);
    await page.locator('#unlockClear').click();
    await page.locator('#unlockSearch').fill(scopeIds[0]);
    const escaped = page.locator(`[data-unlock-id="${ids[0]}"]`);
    await escaped.locator('summary').click();
    assert.equal(await escaped.locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.unlockUnsafe), undefined);
    assert.match(await escaped.innerText(), /<img src=x/);
    const reasonToggle = escaped.locator('[data-unlock-reason-toggle]');
    await reasonToggle.waitFor({ state: 'visible' });
    await reasonToggle.click();
    assert.equal(await reasonToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await escaped.locator('.unlock-reason-text').evaluate(node =>
      node.scrollHeight <= node.clientHeight + 1), true);
    await page.locator('#unlockStatus').selectOption('REQUESTED');
    assert.equal(await reasonToggle.getAttribute('aria-expanded'), 'true');
    await reasonToggle.press('Enter');
    assert.equal(await reasonToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await escaped.locator('.unlock-reason-text').evaluate(node =>
      node.scrollHeight > node.clientHeight), true);
    await page.locator('#unlockStatus').selectOption('');
    check('Long reasons expand without losing text, remain open after filtering and collapse using the keyboard');
    await page.locator('#unlockSearch').fill('de nghi cap nhat ket qua tuan tra');
    assert.match(await page.locator('#unlockResultCount').innerText(), /^12 /);
    await page.locator('#unlockDay').fill('2000-01-01');
    await page.locator('.unlock-empty').waitFor();
    await page.locator('[data-clear-filters]').click();
    assert.equal(await page.locator('#unlockSearch').inputValue(), '');
    assert.equal(await page.locator('#unlockDay').inputValue(), '');
    await page.locator('#unlockSearch').fill('no-matching-unlock-request');
    assert.match(await page.locator('.unlock-empty').innerText(), /Không có đề nghị phù hợp/);
    await page.locator('#unlockClear').click();
    check('Unlock UI filters accents, status, date and scope ID; paginates and escapes request content');

    await page.route('**/api/bao-cao-ngay/unlock-requests', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Kiểm chứng mất kết nối' })
    }), { times: 1 });
    await page.locator('#dailyReportRefresh').click();
    await page.locator('#unlockLoadFeedback').waitFor({ state: 'visible' });
    assert.match(await page.locator('#unlockLoadFeedback').innerText(), /dữ liệu đã tải trước đó/);
    await page.locator('#unlockRetry').click();
    await page.locator('#unlockLoadFeedback').waitFor({ state: 'hidden' });
    await page.locator('#dailyReportUnlockRows[aria-busy=false]').waitFor();
    check('Unlock load failures retain existing data and recover through the visible retry action');

    for (const day of ['2000-01-01', '2099-01-01']) {
      const response = await request(api + '/unlock-requests', { cookie: reporter, method: 'POST', body: {
        report_day: day, scope: { kind: 'WORK_RESULT', id: randomUUID() }, reason: 'Thử đổi ngày đề nghị'
      } });
      assert.equal(response.status, 409);
      assert.equal(response.data.code, 'UNLOCK_REPORT_DAY_MISMATCH');
    }
    check('Unlock API rejects dates outside the report currently available in daily entry');

    const inputGrants = (await database.query(`select up.permission_id from user_permissions up
      join permissions p on p.id=up.permission_id join modules m on m.id=p.module_id
      where up.user_id=$1 and m.module_key='dailyReportInput'`, [scope.userId])).rows;
    assert.ok(inputGrants.length);
    try {
      await database.query('delete from user_permissions where user_id=$1 and permission_id=any($2::bigint[])',
        [scope.userId, inputGrants.map(item => item.permission_id)]);
      const denied = await request(api + '/unlock-requests', { cookie: reporter, method: 'POST', body: {
        report_day: scope.reportDay, scope: { kind: 'WORK_RESULT', id: randomUUID() }, reason: 'Thử bỏ quyền nhập'
      } });
      assert.equal(denied.status, 403);
      assert.equal(denied.data.code, 'INPUT_MODULE_REQUIRED');
    } finally {
      for (const grant of inputGrants) {
        await database.query('insert into user_permissions(user_id,permission_id) values($1,$2) on conflict do nothing',
          [scope.userId, grant.permission_id]);
      }
    }
    const labels = (await database.query(`select p.name from permissions p join modules m on m.id=p.module_id
      where m.module_key='dailyReportUnlock'`)).rows;
    assert.deepEqual(labels.map(item => item.name), ['Lịch sử đề nghị']);
    check('History keeps its renamed permission; creating requests requires the Input account permission');

    if (!scope.beforeCutoff) {
      await database.query(`update daily_report_unlock_requests set expires_at=now()-interval '1 minute'
        where id=any($1::uuid[]) and status='APPROVED'`, [ids]);
      await page.locator('#dailyReportRefresh').click();
      await page.locator('#sidebar [data-bcn-view=input]').click();
      await page.locator('#bcnUnlockTriggerBtn').click();
      const form = page.locator('#bcnQuickUnlockForm');
      await form.waitFor({ state: 'visible' });
      assert.equal(await form.locator('input[type=date], [name=scope_id], [name=unit_id]').count(), 0);
      assert.equal(await form.locator('[data-unlock-report-day]').getAttribute('datetime'), scope.reportDay);
      await form.locator('[name=reason]').fill(marker + ' Gửi đề nghị từ báo cáo đang mở');
      await page.screenshot({ path: folder + '/entry-request-context.png' });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const dialog = page.locator('#bcnQuickUnlockDialog');
        assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        const submitBounds = await form.locator('[type=submit]').boundingBox();
        assert.ok(submitBounds && submitBounds.x >= 0 && submitBounds.x + submitBounds.width <= width);
        await page.screenshot({ path: `${folder}/entry-request-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.route('**/api/bao-cao-ngay/unlock-requests', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await new Promise(resolve => setTimeout(resolve, 300));
        await route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: 'Kiểm chứng gửi lỗi, giữ lại nội dung.' }) });
      }, { times: 1 });
      await form.locator('[type=submit]').click();
      await form.locator('[data-unlock-feedback]').waitFor({ state: 'visible' });
      assert.match(await form.locator('[name=reason]').inputValue(), /Gửi đề nghị từ báo cáo đang mở/);
      const sent = page.waitForResponse(response => response.url().endsWith('/unlock-requests')
        && response.request().method() === 'POST');
      await form.locator('[type=submit]').click();
      const response = await sent;
      assert.equal(response.status(), 201);
      submittedId = (await response.json()).id;
      assert.equal(response.request().postDataJSON().report_day, scope.reportDay);
      await page.locator('#bcnQuickUnlockDialog').waitFor({ state: 'hidden' });
      const record = (await database.query('select report_day,unit_id from daily_report_unlock_requests where id=$1',
        [submittedId])).rows[0];
      assert.equal(String(record.unit_id), String(scope.unitId));
      await page.locator('#sidebar [data-bcn-view=unlock]').click();
      await page.locator('#dailyReportRefresh').click();
      await page.locator(`[data-unlock-id="${submittedId}"]`).waitFor();
      check('Only daily entry creates a request, preserving failed input and binding the exact displayed date and unit');
    }

    await page.locator('#unlockSearch').fill(marker);
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          window.NotificationPopup.getShared().reset();
        }, mode);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
          `No document overflow at ${width} ${mode}`);
        assert.equal(await page.locator('.unlock-list-card').evaluate(node => node.scrollWidth <= node.clientWidth + 1),
          true, `No list clipping at ${width} ${mode}`);
        await page.evaluate(() => {
          document.querySelector('.main').scrollTop = 0;
          window.scrollTo(0, 0);
        });
        const colors = await page.locator('.unlock-stat-copy strong').evaluateAll(nodes =>
          nodes.map(node => getComputedStyle(node).color));
        assert.equal(new Set(colors).size, 4, 'Each request status has a distinct visible color');
        await page.screenshot({ path: `${folder}/reporter-${width}-${mode}.png` });
      }
    }
    check('Unlock workspace fits 1440, 1024, 390 and 320px in both light and dark palettes');

    const commander = await openPage(compiler);
    currentPage = commander;
    assert.equal(await commander.locator('.unlock-form-card').isVisible(), false);
    await commander.locator('#unlockSearch').fill(scopeIds[0]);
    await commander.locator(`[data-approve="${ids[0]}"]`).click();
    const approval = commander.locator('.bcn-action-dialog[open]');
    assert.match(await approval.innerText(), new RegExp(scopeIds[0]));
    await approval.locator('[name=reason]').fill('Chấp thuận kiểm chứng giao diện.');
    await approval.getByRole('button', { name: 'Chấp thuận 30 phút', exact: true }).click();
    await approval.waitFor({ state: 'hidden' });
    await commander.locator(`[data-unlock-id="${ids[0]}"] .unlock-badge[data-tone=success]`).waitFor();
    const approvedRow = (await database.query('select * from daily_report_unlock_requests where id=$1', [ids[0]])).rows[0];
    assert.equal(approvedRow.status, 'APPROVED');
    assert.equal(new Date(approvedRow.expires_at) - new Date(approvedRow.approved_at), 1800000);
    await commander.locator('#unlockSearch').fill(scopeIds[1]);
    await commander.locator(`[data-reject="${ids[1]}"]`).click();
    await commander.locator('.bcn-action-dialog[open] [name=reason]').fill('Nội dung cần làm rõ.');
    await commander.locator('.bcn-action-dialog[open]').getByRole('button', { name: 'Từ chối yêu cầu' }).click();
    await commander.locator('.bcn-action-dialog[open]').waitFor({ state: 'hidden' });
    await commander.locator(`[data-unlock-id="${ids[1]}"] .unlock-badge[data-tone=danger]`).waitFor();
    assert.equal((await database.query('select decision_reason from daily_report_unlock_requests where id=$1',
      [ids[1]])).rows[0].decision_reason, 'Nội dung cần làm rõ.');
    await commander.locator('#unlockSearch').fill(marker);
    await commander.evaluate(() => {
      window.NotificationPopup.getShared().reset();
      document.querySelector('.main').scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await commander.screenshot({ path: folder + '/compiler-desktop.png' });
    await commander.setViewportSize({ width: 390, height: 844 });
    await commander.screenshot({ path: folder + '/compiler-mobile.png' });
    assert.equal(await commander.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    check('PV01 approves for exactly 30 minutes and rejects with a recorded reason through contextual dialogs');
    assert.deepEqual(testErrors, []);
  } catch (error) {
    await currentPage?.screenshot({ path: folder + '/failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    errors.push(...testErrors);
    for (const context of contexts) await context.close();
    const cleanupIds = [...ids, ...(submittedId ? [submittedId] : [])];
    await database.query('delete from daily_report_unlock_requests where id=any($1::uuid[])', [cleanupIds]);
  }
}
