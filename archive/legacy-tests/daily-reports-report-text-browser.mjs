import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runReportTextBrowser({ page, database, base, userId, checks }) {
  const output = 'outputs/bcn-clean-report-text-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  const records = [
    { id: randomUUID(), code: 'BCN-20261029-4fde4a52', marker: '[DỮ LIỆU TEST BCN-FORM-20261029-CB08-2]',
      text: 'Xã thử: Tiếp nhận tin báo giả lập về gói đồ nghi vấn.' },
    { id: randomUUID(), code: 'BCN-20261029-2f40c9d7', marker: '[TEST]',
      text: 'Mâu thuẫn sinh hoạt giả lập — đơn vị thử nghiệm.' }
  ];
  for (const record of records) {
    await database.query(`insert into daily_report_cases
      (id,stable_code,title,summary,unit_id,business_code,category_code,report_day,current_state,created_by)
      values($1,$2,$3,$3,$4,'TINH_HINH_KHAC','QA',$5,'PENDING_REVIEW',$6)`,
    [record.id, record.code, `${record.marker} ${record.text}`, scope.unitId, scope.reportDay, userId]);
    await database.query(`insert into daily_report_case_events
      (id,case_id,report_day,event_kind,narrative,source_user_id)
      values($1,$2,$3,'INITIAL',$4,$5)`,
    [randomUUID(), record.id, scope.reportDay, `${record.marker} ${record.text}`, userId]);
    const snapshot = JSON.stringify({ title: `${record.marker} ${record.text}`,
      summary: `${record.marker} ${record.text}` });
    await database.query(`insert into daily_report_submissions
      (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
      values($1,$2,$3,$4,1,'PENDING_REVIEW',$5,$6,$7)`,
    [randomUUID(), record.id, scope.unitId, scope.reportDay, snapshot,
      createHash('sha256').update(snapshot).digest('hex'), userId]);
  }
  const navigate = async view => {
    await page.locator(`[data-bcn-view="${view}"]`).click();
    await page.waitForFunction(value => document.querySelector('#dailyReports').dataset.bcnActiveView === value, view);
  };
  const verifyClean = async locator => {
    const text = await locator.innerText();
    for (const record of records) {
      assert.ok(text.includes(record.text), text);
      assert.ok(!text.includes(record.code) && !text.includes(record.marker), text);
    }
  };
  try {
    await navigate('updates');
    await page.locator('#dailyReportRefresh').click();
    await page.locator(`#bcnUpdateRows [data-detail="${records[0].id}"]`).waitFor();
    await verifyClean(page.locator('#bcnUpdateRows'));
    await page.locator('#bcnUpdatesColumns').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/updates-desktop.png` });
    checks.push('all follow-up report rows display their names without generated BCN codes or seed labels');

    await page.locator(`#bcnUpdateRows [data-detail="${records[0].id}"]`).click();
    await page.locator('#bcnDetail[open]').waitFor();
    assert.equal(await page.locator('#bcnCaseEdit [name="title"]').inputValue(), records[0].text);
    assert.equal(await page.locator('#bcnCaseEdit [name="summary"]').inputValue(), records[0].text);
    const verifyResponse = page.waitForResponse(response =>
      response.url().endsWith(`/cases/${records[0].id}/verify`) && response.request().method() === 'POST');
    await page.locator('#bcnVerifyCase').click();
    const verified = await verifyResponse;
    assert.equal(verified.status(), 200, await verified.text());
    await page.locator('#bcnVerifyCase').waitFor({ state: 'detached' });
    await page.locator('#bcnDetail [data-case-close]').click();
    const stored = (await database.query('select stable_code,summary,current_state from daily_report_cases where id=$1',
      [records[0].id])).rows[0];
    assert.equal(stored.stable_code, records[0].code);
    assert.equal(stored.summary, `${records[0].marker} ${records[0].text}`);
    assert.equal(stored.current_state, 'VERIFIED');
    checks.push('clean detail still verifies the same case; identifiers and original source text remain intact in storage');

    await navigate('registry');
    await page.waitForFunction(({ selector, text }) => document.querySelector(selector).textContent.includes(text),
      { selector: '#dailyReportCaseRows', text: records[0].text });
    await verifyClean(page.locator('#dailyReportCaseRows'));
    assert.equal(await page.locator('#dailyReportCaseRows').locator('xpath=ancestor::table').locator('th')
      .first().innerText(), 'STT');
    checks.push('registry shows row numbers and clean report content without the retired overview screen');

    await navigate('composer');
    await page.locator('#bcnComposeLoad').click();
    const source = page.locator('[data-compose-row]').filter({ hasText: records[0].text });
    await source.waitFor();
    assert.ok(!(await source.innerText()).includes(records[0].code));
    assert.equal(await source.locator('textarea').inputValue(), records[0].text);
    await source.locator('[data-include]').check();
    await page.waitForFunction(text => document.querySelector('#bcnPaperStack').textContent.includes(text), records[0].text);
    assert.ok(!(await page.locator('#bcnPaperStack').innerText()).includes(records[0].marker));
    checks.push('compiler sees and selects clean source text and preview remains free of test prefixes');
    await navigate('updates');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bcnUpdatesColumns').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({ path: `${output}/updates-mobile.png` });
    await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
      checks: checks.slice(start) }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}
