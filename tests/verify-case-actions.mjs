import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function verifyCaseActions({ request, reporter, compiler, database, browser, base, output, check, errors }) {
  const api = '/api/bao-cao-ngay';
  const scope = (await request(api + '/scope', { cookie: reporter })).data;
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const contexts = [];
  const folder = output + '/case-actions';
  await mkdir(folder, { recursive: true });
  const openPage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    const view = cookie === compiler ? 'approval' : 'registry';
    await page.locator(`#sidebar [data-bcn-view=${view}]`).click();
    await page.locator(`[data-case-id="${ids[0]}"]`).waitFor();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    return page;
  };
  const state = async id => (await request(`${api}/cases/${id}`, { cookie: compiler })).data.case.current_state;
  let page;
  try {
    for (const [index, id] of ids.entries()) {
      const current = index === 1 ? 'VERIFIED' : 'PENDING_REVIEW';
      const info = { subjects: [], subject_details: [], death_count: 0, injured_count: 0,
        property_damage: 0, evidence: 'Vật chứng mô phỏng', incident_status: 'Tiếp nhận vụ việc ban đầu' };
      const title = `[BÁO CÁO THỬ] Kiểm tra thao tác ${index + 1}`;
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,title,summary,current_state,
          created_by,reference_info) values($1,$2,$3,'TINH_HINH_KHAC','TEST',$4,$5,$5,$6,$7,$8)`,
      [id, 'ACTION-' + id, scope.unitId, scope.reportDay, title, current, scope.userId, JSON.stringify(info)]);
      await database.query(`insert into daily_report_submissions
        (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
        values($1,$2,$3,$4,1,$5,$6,'action-test',$7)`, [randomUUID(), id, scope.unitId, scope.reportDay,
        index === 1 ? 'VERIFIED' : 'SUBMITTED', JSON.stringify({ summary: title }), scope.userId]);
    }
    page = await openPage(compiler);
    await page.locator('#sidebar [data-bcn-view=registry]').click();
    await page.locator('#dailyReports[data-bcn-active-view=registry]').waitFor();
    await page.locator(`[data-case-preview="${ids[0]}"]`).waitFor();
    assert.equal(await page.locator('#dailyReportCaseRows [data-verify], '
      + '#dailyReportCaseRows [data-request-supplement], #dailyReportCaseRows [data-case-more]').count(), 0);
    await page.locator(`[data-case-preview="${ids[0]}"]`).click();
    const reader = page.locator('#bcnCasePreview[open]');
    assert.equal(await reader.locator('input,textarea,select,form,[data-preview-supplement]').count(), 0);
    await page.screenshot({ path: folder + '/registry-read-only.png' });
    await reader.locator('[data-preview-close]').click();
    await page.locator('#bcnCaseFilters [name=q]').fill('Tra cứu không khớp');
    await page.locator('#sidebar [data-bcn-view=approval]').click();
    await page.locator('#dailyReports[data-bcn-active-view=approval]').waitFor();
    await page.locator(`[data-verify="${ids[0]}"]`).waitFor();
    assert.equal(await page.locator('#bcnCaseFilters [name=q]').inputValue(), '');
    await page.locator('#sidebar [data-bcn-view=registry]').click();
    await page.locator('#dailyReports[data-bcn-active-view=registry]').waitFor();
    assert.equal(await page.locator('#bcnCaseFilters [name=q]').inputValue(), 'Tra cứu không khớp');
    await page.locator('#sidebar [data-bcn-view=approval]').click();
    await page.locator('#dailyReports[data-bcn-active-view=approval]').waitFor();
    await page.locator(`[data-verify="${ids[0]}"]`).waitFor();
    check('Registry stays read-only for a commander; Approval has independent filters and review actions');
    const more = page.locator(`[data-case-more="${ids[0]}"]`);
    const menu = page.locator(`#bcnCaseActions-${ids[0]}`);
    const row = page.locator(`[data-case-id="${ids[0]}"]`);
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          window.NotificationPopup.getShared().reset();
        }, mode);
        await more.scrollIntoViewIfNeeded();
        const bounds = await row.locator('.bcn-case-actions > button').evaluateAll(buttons =>
          buttons.map(button => {
            const rect = button.getBoundingClientRect();
            return { top: rect.top, height: rect.height, left: rect.left, right: rect.right };
          }));
        assert.equal(bounds.length, 3);
        assert.ok(bounds.every(button => button.height <= 34 && Math.abs(button.top - bounds[0].top) < 1));
        assert.ok(bounds.every(button => button.left >= 0 && button.right <= width));
        await page.screenshot({ path: `${folder}/compact-${mode}-${width}.png`, animations: 'disabled' });
        await more.click();
        await menu.waitFor({ state: 'visible' });
        const popup = await menu.boundingBox();
        assert.ok(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= width
          && popup.y + popup.height <= 900);
        assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).map(text => text.trim()),
          ['Trả lại / Yêu cầu bổ sung']);
        assert.equal(await page.locator('[data-return]').count(), 0);
        assert.equal(await menu.evaluate(node => node.parentElement === document.body), true);
        await page.screenshot({ path: `${folder}/menu-${mode}-${width}.png`, animations: 'disabled' });
        await page.keyboard.press('ArrowDown');
        assert.equal(await menu.locator('[data-request-supplement]').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await menu.isVisible(), false);
        assert.equal(await more.evaluate(node => node === document.activeElement), true);
      }
    }
    check('Case actions stay on one compact row; secondary menus fit desktop/mobile in both themes and support keyboard focus');

    await page.setViewportSize({ width: 1440, height: 900 });
    await more.press('ArrowDown');
    await menu.waitFor({ state: 'visible' });
    await page.locator('#pageTitle').click();
    assert.equal(await menu.isVisible(), false);
    await more.click();
    const otherMore = page.locator(`[data-case-more="${ids[1]}"]`);
    await otherMore.click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.locator('.bcn-case-overflow-menu:visible').count(), 1);
    await page.keyboard.press('Escape');
    await more.click();
    await row.evaluate(node => { node.closest('.main').scrollTop += 20; });
    await menu.waitFor({ state: 'hidden' });
    await more.click();
    await menu.getByRole('menuitem', { name: 'Trả lại / Yêu cầu bổ sung', exact: true }).click();
    const returned = page.getByRole('dialog').filter({ hasText: 'Yêu cầu đơn vị bổ sung' });
    const reason = 'Yêu cầu sửa dữ liệu mô phỏng';
    await returned.locator('[name=reason]').fill(reason);
    const returnSaved = page.waitForResponse(response => response.url().endsWith(`/cases/${ids[0]}/request-supplement`)
      && response.request().method() === 'POST');
    await returned.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    assert.ok((await returnSaved).ok());
    assert.equal(await state(ids[0]), 'RETURNED');
    await returned.waitFor({ state: 'hidden' });
    const history = (await request(`${api}/cases/${ids[0]}`, { cookie: reporter })).data;
    assert.equal(history.returns.length, 1);
    assert.equal(history.returns[0].reason, reason);
    assert.equal(history.submissions[0].state, 'RETURNED');
    const notices = (await request('/api/notifications', { cookie: reporter })).data.items;
    assert.ok(notices.some(item => item.eventType === 'CASE_SUPPLEMENT_REQUESTED'
      && item.dailyReportRef.caseId === ids[0]));
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await otherMore.click();
    const otherMenu = page.locator(`#bcnCaseActions-${ids[1]}`);
    assert.equal(await otherMenu.getByRole('menuitem').count(), 1);
    await otherMenu.getByRole('menuitem', { name: 'Trả lại / Yêu cầu bổ sung', exact: true }).click();
    const supplement = page.getByRole('dialog').filter({ hasText: 'Yêu cầu đơn vị bổ sung' });
    await supplement.locator('[name=reason]').fill('Đề nghị bổ sung vật chứng mô phỏng');
    const supplementSaved = page.waitForResponse(response =>
      response.url().endsWith(`/cases/${ids[1]}/request-supplement`) && response.request().method() === 'POST');
    await supplement.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    assert.ok((await supplementSaved).ok());
    assert.equal(await state(ids[1]), 'RETURNED');
    await supplement.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    const approved = page.waitForResponse(response => response.url().endsWith(`/cases/${ids[2]}/verify`)
      && response.request().method() === 'POST');
    await page.locator(`[data-verify="${ids[2]}"]`).click();
    assert.ok((await approved).ok());
    assert.equal(await state(ids[2]), 'VERIFIED');
    check('One supplement action returns pending and approved cases, records reasons and notifies the unit; Approve still works');

    const unitPage = await openPage(reporter);
    const unitRow = unitPage.locator(`[data-case-id="${ids[0]}"]`);
    assert.equal(await unitRow.locator('[data-case-more], [data-verify], [data-request-supplement]').count(), 0);
    await unitRow.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    const preview = unitPage.locator('#bcnCasePreview[open]');
    await preview.waitFor();
    assert.equal(await preview.locator('input,textarea,select,form').count(), 0);
    await preview.locator('[data-preview-close]').click();
    check('Units retain read-only case details and do not receive commander actions in the compact layout');

    const compilerScope = (await request(api + '/scope', { cookie: compiler })).data;
    const assignments = (await database.query(`select id,submodules from daily_report_user_roles
      where user_id=$1 and role_code='PV01_COMPILER'`, [compilerScope.userId])).rows;
    assert.ok(assignments.length);
    try {
      await database.query(`update daily_report_user_roles set submodules='["returned"]'::jsonb
        where id=any($1::bigint[])`, [assignments.map(item => item.id)]);
      const send = (id, cookie = compiler, reason = 'Bổ sung theo quyền xử lý báo cáo') =>
        request(`${api}/cases/${id}/request-supplement`, { cookie, method: 'POST', body: { reason } });
      assert.equal((await send(ids[2])).status, 403);
      assert.equal((await send(ids[2], reporter)).status, 403);
      assert.equal(await state(ids[2]), 'VERIFIED');
      await database.query("update daily_report_cases set current_state='PENDING_REVIEW' where id=$1", [ids[2]]);
      assert.equal((await request(`${api}/cases/${ids[2]}/verify`, {
        cookie: compiler, method: 'POST', body: {}
      })).status, 403);
      assert.equal((await send(ids[2], compiler, '   ')).status, 403);
      assert.equal((await send(ids[2])).status, 403);
      await database.query(`update daily_report_user_roles set submodules='["registry"]'::jsonb
        where id=any($1::bigint[])`, [assignments.map(item => item.id)]);
      for (const action of ['verify', 'return', 'request-supplement']) {
        assert.equal((await request(`${api}/cases/${ids[2]}/${action}`, {
          cookie: compiler, method: 'POST', body: { reason: 'Thử quyền tra cứu' }
        })).status, 403);
      }
      assert.equal((await request(`${api}/cases?workspace=approval`, { cookie: compiler })).status, 403);
      await database.query(`update daily_report_user_roles set submodules='["approval"]'::jsonb
        where id=any($1::bigint[])`, [assignments.map(item => item.id)]);
      assert.equal((await request(`${api}/cases?workspace=registry`, { cookie: compiler })).status, 403);
      assert.equal((await request(`${api}/cases?workspace=approval`, { cookie: compiler })).status, 200);
      assert.equal((await send(ids[2], compiler, '   ')).status, 422);
      assert.equal(await state(ids[2]), 'PENDING_REVIEW');
      assert.equal((await send(ids[2])).status, 201);
      assert.equal(await state(ids[2]), 'RETURNED');
      check('Registry and Returned cannot review via API; Approval alone can read and return, with a required reason');
    } finally {
      for (const assignment of assignments) {
        await database.query('update daily_report_user_roles set submodules=$1::jsonb where id=$2',
          [assignment.submodules === null ? null : JSON.stringify(assignment.submodules), assignment.id]);
      }
    }
  } catch (error) {
    await page?.screenshot({ path: folder + '/failure.png', animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])', [ids]);
    await database.query(`delete from daily_report_returns where submission_id in
      (select id from daily_report_submissions where case_id=any($1::uuid[]))`, [ids]);
    await database.query('delete from daily_report_submissions where case_id=any($1::uuid[])', [ids]);
    await database.query('delete from daily_report_case_events where case_id=any($1::uuid[])', [ids]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [ids]);
  }
}
