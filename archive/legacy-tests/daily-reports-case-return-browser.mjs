import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// The main browser harness supplies an isolated database and a submitted case.
export async function verifyReturnInDetail({ page, caseId, base, database, checks }) {
  const output = 'outputs/bcn-case-return-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const dialog = page.locator('#bcnDetail');
  const actionDialog = page.locator('.bcn-action-dialog[open]');
  const endpoint = `${base}/api/bao-cao-ngay/cases/${caseId}`;
  const fetchDetail = async () => (await page.request.get(endpoint)).json();
  const before = await fetchDetail();
  const reason = 'Cần đối chiếu nội dung và bổ sung thông tin vụ việc.';
  const fields = ['Làm rõ diễn biến vụ việc', 'Bổ sung văn bản liên quan'];
  const returnedRequests = [];
  const track = request => {
    if (request.url() === `${endpoint}/return`) returnedRequests.push(request);
  };
  page.on('request', track);
  try {
    await dialog.locator('#bcnReturnCase').click();
    await actionDialog.locator('[name="reason"]').waitFor();
    await actionDialog.locator('button[type="submit"]').click();
    assert.equal(await actionDialog.locator('form').evaluate(element => element.checkValidity()), false);
    assert.ok(await actionDialog.isVisible());
    await actionDialog.locator('[data-cancel]').click();
    assert.equal(returnedRequests.length, 0);
    assert.ok(await dialog.isVisible());
    assert.equal((await fetchDetail()).case.current_state, 'PENDING_REVIEW');
    checks.push('detail return requires a reason; cancel preserves the pending case and the open detail');

    await dialog.locator('#bcnReturnCase').click();
    await actionDialog.locator('[name="reason"]').fill(reason);
    await actionDialog.locator('[name="requested_fields"]').fill(fields.join('\n'));
    await actionDialog.screenshot({ path: `${output}/return-form.png` });
    const returnedResponse = page.waitForResponse(response => response.url() === `${endpoint}/return`
      && response.request().method() === 'POST');
    await actionDialog.locator('button[type="submit"]').click();
    const response = await returnedResponse;
    assert.equal(response.status(), 201, await response.text());
    await dialog.locator('.bcn-detail-header').getByText('Đã trả lại – chờ bổ sung', { exact: true }).waitFor();
    assert.equal(await dialog.locator('#bcnReturnCase, #bcnVerifyCase').count(), 0);
    const returned = await fetchDetail();
    assert.equal(returned.case.current_state, 'RETURNED');
    assert.equal(returned.case.id, before.case.id);
    assert.equal(returned.case.stable_code, before.case.stable_code);
    assert.deepEqual(returned.case.classifications, before.case.classifications);
    assert.equal(returned.returns[0].reason, reason);
    assert.deepEqual(returned.returns[0].requested_fields, fields);
    await dialog.locator('[data-case-section="bcnDetailEvents"]').click();
    await dialog.locator('.bcn-detail-return').scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: `${output}/returned-history.png` });
    checks.push('detail return uses the existing API, saves reason and requirements, updates status and history');

    const notice = await database.query(`select recipient_unit_id from daily_report_outbox
      where resource_id=$1 and event_type='CASE_RETURNED'`, [caseId]);
    assert.equal(notice.rowCount, 1);
    assert.equal(String(notice.rows[0].recipient_unit_id), String(before.case.unit_id));
    checks.push('return queues the existing notification for the case reporting unit');

    await dialog.locator('[data-case-close]').click();
    const row = page.locator(`#dailyReportCaseRows [data-case-id="${caseId}"]`);
    await row.locator('[data-submit]').click();
    await actionDialog.locator('[name="response"]').fill('Đã đối chiếu và bổ sung theo yêu cầu kiểm thử.');
    const submittedResponse = page.waitForResponse(value => value.url() === `${endpoint}/submit`
      && value.request().method() === 'POST');
    await actionDialog.locator('button[type="submit"]').click();
    const submitted = await submittedResponse;
    assert.equal(submitted.status(), 201, await submitted.text());
    await row.getByText('Chờ xác minh', { exact: true }).waitFor();
    await row.locator('[data-detail]').click();
    await page.locator('#bcnEditClassifications[data-legal-state="ready"]').waitFor();
    assert.ok(await dialog.locator('#bcnReturnCase').isVisible());
    assert.equal((await fetchDetail()).returns[0].response, 'Đã đối chiếu và bổ sung theo yêu cầu kiểm thử.');
    checks.push('the same returned case can be resubmitted and reopened for verification with history retained');
    await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
      status: 'PASS', checks: checks.slice(start) }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
  } finally {
    page.off('request', track);
  }
}
