import { verifyReturnedAssistant } from './seedy-ai/verify-returned.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';

export async function verifyCaseResubmission({ request, login, reporter, compiler, database,
  browser, base, output, check, errors }) {
  const api = '/api/bao-cao-ngay';
  const { data: scope } = await request(api + '/scope', { cookie: reporter });
  const other = await login('demo.canbo03');
  const day = shiftDay(scope.reportDay, -10);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const info = { subjects: [], subject_details: [], incident_status: 'Tiếp nhận vụ việc ban đầu',
    death_count: 0, injured_count: 0, property_damage: 0, evidence: 'Vật chứng thử',
    handling_result: 'Đang giải quyết' };
  const contexts = [];
  const folder = output + '/case-resubmission';
  await mkdir(folder, { recursive: true });
  const getCase = async id => (await request(`${api}/cases/${id}`, { cookie: reporter })).data.case;
  const patch = (id, body, cookie = reporter) => request(`${api}/reference-cases/${id}`, {
    cookie, method: 'PATCH', body
  });
  const bodyFor = item => ({ version: item.version, unit_id: scope.unitId,
    business_code: 'TINH_HINH_KHAC', title: item.title, summary: item.summary,
    reference_info: item.reference_info, resubmit: true });
  const submissionCount = async id => Number((await database.query(
    'select count(*) as count from daily_report_submissions where case_id=$1', [id])).rows[0].count);
  const openPage = async (cookie, id) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=registry]').click();
    await page.locator('#dailyReports.active[data-bcn-active-view=registry]').waitFor();
    await page.evaluate(async ({ id, day, unitId, review }) => {
      await window.DailyReports.openNotification({ view: review ? 'approval' : 'returned', resourceType: 'CASE',
        caseId: id, resourceId: id, reportDay: day, unitId });
      window.NotificationPopup.getShared().reset();
    }, { id, day, unitId: scope.unitId, review: cookie === compiler });
    await page.locator('#bcnDetail[open]').waitFor();
    return page;
  };
  try {
    for (const [index, id] of ids.entries()) {
      const title = 'Hồ sơ thử cập nhật một bước ' + index;
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,title,current_state,
          created_by,reference_info) values($1,$2,$3,'TINH_HINH_KHAC','TEST',$4,$5,$5,$6,$7,$8::jsonb)`,
      [id, 'UPDATE-' + id, scope.unitId, day, title, index === 2 ? 'DRAFT' : 'PENDING_REVIEW',
        scope.userId, JSON.stringify(info)]);
      await database.query(`insert into daily_report_case_events
        (id,case_id,report_day,event_kind,narrative,source_user_id)
        values($1,$2,$3,'INITIAL_REPORT',$4,$5)`, [randomUUID(), id, day, title, scope.userId]);
      if (index !== 2) {
        await database.query(`insert into daily_report_submissions
          (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
          values($1,$2,$3,$4,1,'PENDING_REVIEW','{}','resubmit-test',$5)`,
        [randomUUID(), id, scope.unitId, day, scope.userId]);
        assert.equal((await request(`${api}/cases/${id}/request-supplement`, {
          cookie: compiler, method: 'POST', body: { reason: 'Bổ sung vật chứng và thiệt hại tài sản thử.' }
        })).status, 201);
      }
    }
    const initial = await getCase(ids[0]);
    const payload = bodyFor(initial);
    const foreign = await patch(ids[0], payload, other);
    assert.ok([403, 404].includes(foreign.status));
    const commander = await patch(ids[0], payload, compiler);
    assert.ok([403, 404].includes(commander.status));
    const draft = await getCase(ids[2]);
    assert.equal((await patch(ids[2], { ...bodyFor(draft), resubmit: false })).status, 423);
    assert.equal((await patch(ids[2], bodyFor(draft))).status, 409);
    check('A return grants only the owning reporter permission to update that case; closed drafts remain locked');

    const failed = await patch(ids[0], { ...payload, summary: 'Không được lưu khi gửi lại thất bại',
      response: 'x'.repeat(2001) });
    assert.equal(failed.status, 422, JSON.stringify(failed.data));
    const afterFailure = await getCase(ids[0]);
    assert.equal(afterFailure.summary, initial.summary);
    assert.equal(afterFailure.version, initial.version);
    assert.equal(afterFailure.current_state, 'RETURNED');
    assert.equal(await submissionCount(ids[0]), 1);
    check('A failed resubmission rolls back edits and submission records together');

    const page = await openPage(reporter, ids[0]);
    await verifyReturnedAssistant({ page, day, scope, title: initial.title, id: ids[0], getCase, check });
    const close = page.getByRole('button', { name: 'Đóng chi tiết vụ việc', exact: true });
    assert.equal(await page.getByRole('button', { name: 'Đóng hồ sơ', exact: true }).count(), 0);
    assert.equal(await page.locator('[data-submit]').count(), 0);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          const scroll = document.querySelector('.bcn-detail-scroll');
          scroll.scrollTop = scroll.scrollHeight;
        }, mode);
        for (const control of [close, page.locator('#bcnCaseUpdate')]) {
          const bounds = await control.boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0
            && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 900);
        }
        await page.screenshot({ path: `${folder}/${mode}-${width}.png`, animations: 'disabled' });
      }
    }
    await close.click();
    assert.equal(await page.locator('#bcnDetail').isVisible(), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(id => window.DailyReports.openNotification({
      view: 'returned', resourceType: 'CASE', resourceId: id, caseId: id
    }), ids[0]);
    await page.locator('#bcnCaseEdit [name=summary]').fill('Đã bổ sung nội dung thử cho trung tâm');
    await page.locator('#bcnCaseEdit [name=property_damage]').fill('25000000');
    await page.locator('#bcnCaseEdit [name=evidence]').fill('02 điện thoại; 01 xe mô tô thử.');
    const saved = page.waitForResponse(response => response.url().endsWith('/reference-cases/' + ids[0])
      && response.request().method() === 'PATCH');
    await page.locator('#bcnCaseUpdate').click();
    assert.equal((await saved).status(), 200);
    await page.locator('#bcnDetail').waitFor({ state: 'hidden' });
    const updated = await getCase(ids[0]);
    assert.equal(updated.current_state, 'PENDING_REVIEW');
    assert.equal(updated.summary, 'Đã bổ sung nội dung thử cho trung tâm');
    assert.equal(updated.reference_info.property_damage, 25000000);
    assert.equal(await submissionCount(ids[0]), 2);
    const latest = (await database.query(`select * from daily_report_submissions
      where case_id=$1 order by version desc limit 1`, [ids[0]])).rows[0];
    assert.equal(latest.state, 'RESUBMITTED');
    assert.equal(latest.snapshot.summary, updated.summary);
    assert.equal(latest.snapshot.reference_info.property_damage, 25000000);
    assert.equal(latest.late_flag, true);
    const receipt = (await database.query(`select resubmitted_submission_id from daily_report_returns
      where submission_id in (select id from daily_report_submissions where case_id=$1)`, [ids[0]])).rows[0];
    assert.equal(receipt.resubmitted_submission_id, latest.id);
    const notices = (await request('/api/notifications', { cookie: compiler })).data.items;
    assert.ok(notices.some(item => item.eventType === 'CASE_RESUBMITTED' && item.dailyReportRef.caseId === ids[0]));
    check('One Update click saves the returned reference case and sends its exact new snapshot to the commander after cutoff');

    const second = await getCase(ids[1]);
    const racing = bodyFor(second);
    const results = await Promise.all([patch(ids[1], racing), patch(ids[1], racing)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(await submissionCount(ids[1]), 2);
    const repeated = await patch(ids[0], payload);
    assert.equal(repeated.status, 409);
    const compilerPage = await openPage(compiler, ids[0]);
    assert.equal(await compilerPage.locator('#bcnCaseUpdate').count(), 0);
    assert.equal(await compilerPage.locator('#bcnVerifyCase').isVisible(), true);
    assert.equal(await compilerPage.locator('#bcnVerifyCase').innerText(), 'Duyệt hồ sơ');
    const dossier = compilerPage.locator('#bcnDetail [data-case-dossier]');
    assert.equal(await dossier.locator('input,select,textarea,form').count(), 0);
    assert.equal(await dossier.locator('[data-case-summary]').innerText(), updated.summary);
    assert.match(await dossier.innerText(), /25\.000\.000 đồng/);
    assert.match(await dossier.innerText(), /02 điện thoại; 01 xe mô tô thử/);
    for (const width of [1440, 390, 320]) {
      await compilerPage.setViewportSize({ width, height: 900 });
      for (const mode of ['dark', 'light']) {
        await compilerPage.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
        }, mode);
        for (const section of ['bcnDetailInformation', 'bcnEditPersons', 'bcnCaseAttachments', 'bcnDetailEvents']) {
          const tab = compilerPage.locator(`[data-case-section=${section}]`);
          await tab.click();
          assert.equal(await compilerPage.locator('#' + section).evaluate(node => node === document.activeElement), true);
          assert.equal(await compilerPage.locator('.bcn-detail-scroll')
            .evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
          for (const selector of ['[data-case-close]', '#bcnVerifyCase', '#bcnRequestSupplement']) {
            const bounds = await compilerPage.locator(selector).boundingBox();
            assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0
              && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 900);
          }
        }
        await compilerPage.locator('[data-case-section=bcnDetailInformation]').click();
        await compilerPage.screenshot({ path: `${folder}/review-${mode}-${width}.png`, animations: 'disabled' });
      }
    }
    await compilerPage.setViewportSize({ width: 1440, height: 1000 });
    await compilerPage.evaluate(async () => {
      const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
      previewAppearance({ palette: 'charcoal', mode: 'dark' });
    });
    const approved = compilerPage.waitForResponse(response => response.url().endsWith(`/cases/${ids[0]}/verify`)
      && response.request().method() === 'POST');
    await compilerPage.locator('#bcnVerifyCase').click();
    assert.equal((await approved).status(), 200);
    assert.equal((await getCase(ids[0])).current_state, 'VERIFIED');
    await compilerPage.locator('#bcnDetail .bcn-detail-header-actions').getByText('Đã duyệt', { exact: true }).waitFor();
    await compilerPage.screenshot({ path: folder + '/approved-case.png', animations: 'disabled' });
    await compilerPage.getByRole('button', { name: 'Đóng chi tiết vụ việc', exact: true }).click();
    check('Duplicate updates produce one submission; the commander receives a read-only case ready for verification');
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
