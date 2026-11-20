import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { intakeSchema } from '../server/daily-reports/intake/validation.js';

export async function verifyCaseReader({ request, login, reporter, compiler, database,
  browser, base, output, check, errors }) {
  const api = '/api/bao-cao-ngay';
  const scope = (await request(api + '/scope', { cookie: reporter })).data;
  const other = await login('demo.canbo03');
  const otherScope = (await request(api + '/scope', { cookie: other })).data;
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const reportId = randomUUID();
  const contexts = [];
  const folder = output + '/case-reader';
  const values = Object.fromEntries(intakeSchema.entryFields.map(([key]) => [key, 0]));
  values.guns = 3;
  const reportBody = { id: reportId, unit_id: scope.unitId, report_day: scope.reportDay, is_update: true,
    mode: 'WORK_ONLY', incidents: [], values, work_domain: 'Lĩnh vực ANTT - ATXH', attachments: [] };
  const info = { subjects: ['Người thử nghiệm'], subject_details: [{ name: 'Người thử nghiệm', gender: 'MALE',
    birth_year: 1995, identity_number: '000000000001', permanent_address: 'Địa chỉ giả A',
    current_address: 'Địa chỉ giả B' }], incident_status: 'Tiếp nhận vụ việc ban đầu',
    death_count: 0, injured_count: 2, property_damage: 12500000, evidence: '01 xe mô tô thử; 02 điện thoại thử.',
    handling_result: 'Đang giải quyết' };
  const getCase = async id => (await request(`${api}/cases/${id}`, { cookie: reporter })).data.case;
  const petition = (id, cookie = reporter, unitId = scope.unitId, purpose = 'CASE_SUPPLEMENT') =>
    request(api + '/unlock-requests', { cookie, method: 'POST', body: {
      unit_id: unitId, report_day: scope.reportDay, purpose,
      scope: { kind: purpose === 'CASE_SUPPLEMENT' ? 'CASE' : 'WORK_RESULT', id }, reason: 'Đề nghị bổ sung dữ liệu thử'
    } });
  const decide = (id, decision, cookie = compiler) => request(`${api}/unlock-requests/${id}/decide`, {
    cookie, method: 'POST', body: { decision, reason: 'Quyết định thử nghiệm' }
  });
  const openPage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    return page;
  };
  await mkdir(folder, { recursive: true });
  let page;
  try {
    for (const [index, id] of ids.entries()) {
      await database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,title,current_state,
          created_by,reference_info) values($1,$2,$3,'TINH_HINH_KHAC','TEST',$4,$5,$6,'PENDING_REVIEW',$7,$8)`,
      [id, 'READER-' + id, scope.unitId, scope.reportDay, 'Nội dung chi tiết thử nghiệm đầy đủ.',
        `Xác minh vụ mất tài sản tại địa điểm thử ${index + 1}`, scope.userId, JSON.stringify(info)]);
      await database.query(`insert into daily_report_submissions
        (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
        values($1,$2,$3,$4,1,'SUBMITTED',$5,'reader-test',$6)`,
      [randomUUID(), id, scope.unitId, scope.reportDay, JSON.stringify({ summary: 'Bản gốc cần giữ nguyên' }), scope.userId]);
    }
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by,work_domain)
      values($1,$2,$3,'DAILY_POLICE_WORK',$4,'PENDING_REVIEW',$5,'Lĩnh vực ANTT - ATXH')`,
    [reportId, scope.unitId, scope.reportDay, JSON.stringify(values), scope.userId]);
    await database.query(`insert into daily_report_intake_batches(id,unit_id,created_by,payload_hash,result)
      values($1,$2,$3,'reader-test',$4)`, [reportId, scope.unitId, scope.userId, JSON.stringify({ case_ids: ids })]);
    page = await openPage(reporter);
    await page.locator('#sidebar [data-bcn-view=input]').click();
    const trigger = page.locator(`[data-incident-preview="${ids[0]}"]`);
    await trigger.waitFor({ state: 'visible' });
    assert.equal(await trigger.isEnabled(), true);
    assert.equal(await page.locator('#bcnEditSubmittedReportBtn').isVisible(), false);
    assert.equal(await page.locator('#bcnDeleteSubmittedReportBtn').count(), 0);
    await trigger.click();
    const dialog = page.locator('#bcnCasePreview[open]');
    await dialog.waitFor();
    await dialog.locator('[data-preview-files] .bcn-attachment-list, [data-preview-files].bcn-attachment-list').waitFor();
    assert.equal(await dialog.locator('input,select,textarea,form,[data-delete-attachment],#bcnCaseUpdate').count(), 0);
    assert.match(await dialog.innerText(), /Nội dung chi tiết thử nghiệm đầy đủ/);
    assert.match(await dialog.innerText(), /CCCD 000000000001/);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
          previewAppearance({ palette: 'charcoal', mode });
          window.NotificationPopup.getShared().reset();
        }, mode);
        for (const tab of ['information', 'subjects', 'files', 'history']) {
          const navigationButton = dialog.locator(`[data-preview-section=${tab}]`);
          await navigationButton.click();
          assert.ok((await navigationButton.boundingBox()).width >= 95, 'Reader tabs must retain readable widths');
          assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        }
        for (const selector of ['[data-preview-close]', '[data-preview-supplement]']) {
          const bounds = await dialog.locator(selector).boundingBox();
          assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0
            && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 900);
        }
        await dialog.locator('[data-preview-section=subjects]').click();
        await page.screenshot({ path: `${folder}/readonly-${mode}-${width}.png`, animations: 'disabled' });
      }
    }
    await page.keyboard.press('Escape');
    await page.locator('#bcnCasePreview').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#bcnCasePreview').count(), 0);
    assert.equal(await trigger.isVisible(), true);
    check('Read-only details remain available after cutoff, show all saved facts, and fit desktop/mobile in both themes');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await trigger.click();
    await dialog.locator('[data-preview-supplement]').click();
    const petitionDialog = page.getByRole('dialog').filter({ hasText: 'Đề nghị bổ sung hồ sơ' });
    await petitionDialog.locator('[name=reason]').fill('Xin bổ sung thiệt hại và vật chứng thử nghiệm');
    const pending = page.waitForResponse(response => response.url().endsWith('/unlock-requests')
      && response.request().method() === 'POST');
    await petitionDialog.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    const permission = await (await pending).json();
    assert.equal((await getCase(ids[0])).current_state, 'PENDING_REVIEW');
    assert.equal((await petition(ids[0])).status, 409);
    assert.ok([403, 404].includes((await petition(ids[0], other, otherScope.unitId)).status));
    assert.equal((await decide(permission.id, 'APPROVED', reporter)).status, 403);
    assert.equal((await request(`${api}/reference-cases/${ids[0]}`, {
      cookie: reporter, method: 'PATCH', body: { ...(await getCase(ids[0])), reference_info: info, resubmit: true }
    })).status, 409);
    const commander = await openPage(compiler);
    await commander.locator('#sidebar [data-bcn-view=unlock]').click();
    await commander.locator(`[data-approve="${permission.id}"]`).click();
    const approvalDialog = commander.getByRole('dialog').filter({ hasText: 'Duyệt bổ sung hồ sơ' });
    const approved = commander.waitForResponse(response => response.url().endsWith(`/unlock-requests/${permission.id}/decide`)
      && response.request().method() === 'POST');
    await approvalDialog.getByRole('button', { name: 'Duyệt bổ sung', exact: true }).click();
    assert.equal((await approved).status(), 200);
    await approvalDialog.waitFor({ state: 'hidden' });
    assert.equal((await getCase(ids[0])).current_state, 'RETURNED');
    const scoped = (await request(api + '/scope', { cookie: reporter })).data;
    assert.notEqual(scoped.activeUnlock?.purpose, 'CASE_SUPPLEMENT');
    assert.equal((await getCase(ids[1])).current_state, 'PENDING_REVIEW');
    await dialog.locator('[data-preview-close]').click();
    await trigger.click();
    assert.equal(await dialog.locator('input,select,textarea,form,#bcnCaseUpdate').count(), 0);
    await dialog.getByRole('button', { name: 'Mở mục bổ sung', exact: true }).click();
    await page.locator('#bcnDetail[open] #bcnCaseUpdate').waitFor({ state: 'visible' });
    await page.locator('#bcnCaseEdit [name=evidence]').fill('Đã bổ sung 03 điện thoại thử');
    const updated = page.waitForResponse(response => response.url().endsWith('/reference-cases/' + ids[0])
      && response.request().method() === 'PATCH');
    await page.locator('#bcnCaseUpdate').click();
    assert.equal((await updated).status(), 200);
    assert.equal((await getCase(ids[0])).current_state, 'PENDING_REVIEW');
    check('A unit requests supplementation, waits for commander approval, then updates and resubmits only its approved case');

    const rejected = await petition(ids[2]);
    assert.equal(rejected.status, 201);
    assert.equal((await decide(rejected.data.id, 'REJECTED')).status, 200);
    assert.equal((await getCase(ids[2])).current_state, 'PENDING_REVIEW');
    assert.equal((await request(`${api}/cases/${ids[1]}/verify`, {
      cookie: compiler, method: 'POST', body: {}
    })).status, 200);
    const reviewInfo = { ...info, handling_unit_id: scope.unitId,
      case_types: [{ key: 'saved-reference', label: 'Loại vụ việc đã lưu <kiểm chứng>' }],
      handling_details: { form: 'Xử lý hành chính', resolution: 'Kết quả giải quyết đã lưu',
        reason: 'Lý do trong hồ sơ', detail: 'Hình thức xử lý chi tiết', fine_million: '0',
        prosecution_decision_number: '01/QĐ-THỬ', prosecution_date: '2026-11-01',
        prosecution_authority: 'Cơ quan ban hành thử nghiệm' }
    };
    await database.query('update daily_report_cases set reference_info=$1 where id=$2',
      [JSON.stringify(reviewInfo), ids[1]]);
    await commander.locator('#sidebar [data-bcn-view=approval]').click();
    await commander.locator(`[data-detail="${ids[1]}"]`).click();
    const commanderPreview = commander.locator('#bcnDetail[open]');
    assert.equal(await commanderPreview.locator('#bcnCaseUpdate').count(), 0);
    assert.equal(await commanderPreview.locator('[data-case-dossier] input, [data-case-dossier] select').count(), 0);
    for (const content of ['CCCD 000000000001', 'Địa chỉ giả A', 'Địa chỉ giả B',
      '12.500.000 đồng', '01 xe mô tô thử; 02 điện thoại thử.', 'Đang giải quyết',
      'Loại vụ việc đã lưu <kiểm chứng>', 'Xử lý hành chính', 'Kết quả giải quyết đã lưu',
      'Lý do trong hồ sơ', 'Hình thức xử lý chi tiết', '0 triệu đồng', '01/QĐ-THỬ',
      '01/11/2026', 'Cơ quan ban hành thử nghiệm']) {
      assert.ok((await commanderPreview.innerText()).includes(content), `Missing review fact: ${content}`);
    }
    await commanderPreview.locator('[data-case-section=bcnEditPersons]').click();
    await commander.screenshot({ path: folder + '/approval-subjects.png', animations: 'disabled' });
    await commanderPreview.locator('#bcnDetailHandling').evaluate(node => node.scrollIntoView({ block: 'start' }));
    await commander.screenshot({ path: folder + '/approval-handling.png', animations: 'disabled' });
    await commanderPreview.getByRole('button', { name: 'Trả lại / Yêu cầu bổ sung', exact: true }).click();
    const commanderRequest = commander.getByRole('dialog').filter({ hasText: 'Yêu cầu đơn vị bổ sung' });
    await commanderRequest.locator('[name=reason]').fill('Chỉ huy yêu cầu bổ sung dữ liệu thử');
    const commanderSent = commander.waitForResponse(response =>
      response.url().endsWith(`/cases/${ids[1]}/request-supplement`) && response.request().method() === 'POST');
    await commanderRequest.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
    assert.equal((await commanderSent).status(), 201);
    assert.equal((await getCase(ids[1])).current_state, 'RETURNED');
    const original = (await database.query(`select snapshot from daily_report_submissions
      where case_id=$1 and version=1`, [ids[0]])).rows[0];
    assert.equal(original.snapshot.summary, 'Bản gốc cần giữ nguyên');
    check('Commander requests and rejected unit petitions preserve role boundaries and the original submitted snapshot');

    assert.equal((await request(api + '/daily-intake', {
      cookie: reporter, method: 'POST', body: reportBody
    })).status, 423);
    const reportPermission = await petition(reportId, reporter, scope.unitId, 'REPORT_SUPPLEMENT');
    assert.equal(reportPermission.status, 201);
    assert.equal((await decide(reportPermission.data.id, 'APPROVED')).status, 200);
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=input]').click();
    await page.locator('#bcnEditSubmittedReportBtn').click();
    await page.locator('#bcnDailyIntake [name=value_guns]').fill('4');
    const reportSaved = page.waitForResponse(response => response.url().endsWith('/daily-intake')
      && response.request().method() === 'POST');
    await page.locator('#bcnSubmitReportBtn').click();
    const reportResponse = await reportSaved;
    assert.equal(reportResponse.status(), 201);
    const savedValues = (await database.query('select metric_values from daily_report_metrics where id=$1',
      [reportId])).rows[0].metric_values;
    assert.equal(savedValues.guns, 4);
    const history = (await database.query(`select snapshot from daily_report_source_history
      where source_id=$1 order by id`, [reportId])).rows;
    assert.equal(history[0].snapshot.metric_values.guns, 3);
    assert.equal(history.at(-1).snapshot.metric_values.guns, 4);
    const batch = (await database.query('select result from daily_report_intake_batches where id=$1',
      [reportId])).rows[0];
    assert.deepEqual(batch.result.case_ids, ids);
    const retryBody = reportResponse.request().postDataJSON();
    assert.equal((await request(api + '/daily-intake', {
      cookie: reporter, method: 'POST', body: retryBody
    })).status, 201);
    assert.equal((await database.query('select version from daily_report_metrics where id=$1',
      [reportId])).rows[0].version, 2);
    await database.query(`update daily_report_unlock_requests set expires_at=now()-interval '1 second'
      where id=$1`, [reportPermission.data.id]);
    assert.equal((await request(api + '/daily-intake', {
      cookie: reporter, method: 'POST', body: { ...retryBody, values: { ...retryBody.values, guns: 5 } }
    })).status, 423);
    assert.equal((await database.query('select count(*) from daily_report_cases where id=any($1::uuid[])',
      [ids])).rows[0].count, '3');
    check('The submitted report cannot be edited until its own supplementation request is approved; browser save preserves existing cases');
  } catch (error) {
    await page?.screenshot({ path: `${folder}/failure.png` }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    const petitions = (await database.query('select id from daily_report_unlock_requests where scope_id=any($1::text[])',
      [[...ids, reportId]])).rows.map(row => row.id);
    await database.query('delete from daily_report_outbox where resource_id=any($1::text[])',
      [[...ids, reportId, ...petitions]]);
    await database.query('delete from daily_report_unlock_requests where scope_id=any($1::text[])', [[...ids, reportId]]);
    await database.query(`delete from daily_report_returns where submission_id in
      (select id from daily_report_submissions where case_id=any($1::uuid[]))`, [ids]);
    await database.query('delete from daily_report_submissions where case_id=any($1::uuid[])', [ids]);
    await database.query('delete from daily_report_case_events where case_id=any($1::uuid[])', [ids]);
    await database.query('delete from daily_report_intake_batches where id=$1', [reportId]);
    await database.query('delete from daily_report_metrics where id=$1', [reportId]);
    await database.query('delete from daily_report_source_history where source_id=$1', [reportId]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [ids]);
  }
}
