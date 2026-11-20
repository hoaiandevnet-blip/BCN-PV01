import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function runMergedBusinessBrowser({ page, database, base, userId, checks }) {
  const output = 'outputs/bcn-merged-domains-qa';
  await mkdir(output, { recursive: true });
  const expected = [
    ['PPHS', 'Phạm pháp hình sự'], ['TNXH', 'Tệ nạn xã hội'], ['MA_TUY', 'Ma túy'],
    ['KINH_TE', 'Kinh tế, chức vụ'], ['MOI_TRUONG', 'Môi trường'], ['ANQG', 'An ninh quốc gia'],
    ['CONG_NGHE_CAO', 'Công nghệ cao'], ['HOAT_DONG_TU_PHAP', 'Hoạt động tư pháp'],
    ['TINH_HINH_KHAC', 'Tình hình khác']
  ];
  await page.locator('[data-bcn-view="input"]').click();
  await page.locator('[data-entry-mode="case"]').click();
  const business = page.locator('#dailyReportCaseForm [data-group-code]');
  assert.deepEqual(await business.locator('option').evaluateAll(options =>
    options.map(option => [option.value, option.textContent])), [['', 'Chọn hệ vụ việc'], ...expected]);
  const ready = () => page.locator('#bcnEntryClassifications[data-legal-state="ready"]').waitFor();
  for (const [code, articles] of [['PPHS', ['173', '260', '295', '313', '393']], ['KINH_TE', ['188', '353']]]) {
    await business.selectOption(code);
    await ready();
    const values = await page.locator('#bcnEntryClassifications [data-law-key]').evaluateAll(options => options.map(option => option.dataset.lawKey));
    for (const article of articles) assert.ok(values.includes(`reference:blhs-135-2025:${article}`));
    assert.ok(!values.includes('reference:blhs-135-2025:249'));
  }
  await business.selectOption('MA_TUY');
  await ready();
  assert.equal(await page.locator('#bcnEntryClassifications [data-law-key]').count(), 14);
  await business.selectOption('TINH_HINH_KHAC');
  assert.equal(await page.locator('#dailyReportCaseForm [name="title"]').isEditable(), true);
  await page.locator('[data-classification-petition]').click();
  await page.locator('#bcnSituationForm').waitFor({ state: 'visible' });
  await page.locator('[data-entry-mode="case"]').click();
  checks.push('only requested business choices are merged; remaining labels, drug articles, other title and petition flow stay intact');

  await page.locator('[data-bcn-view="legal"]').click();
  const { version } = await (await page.request.get(`${base}/api/bao-cao-ngay/legal/bundled`)).json();
  await page.locator('#bcnLegalVersion').selectOption(version.id);
  for (const [code, article, name] of [['PPHS', '313', 'Phạm pháp hình sự'], ['KINH_TE', '353', 'Kinh tế, chức vụ']]) {
    await page.locator('#bcnLegalSearch [name="business_code"]').selectOption(code);
    await page.locator('#bcnLegalSearch [name="q"]').fill(article);
    await page.locator('#bcnLegalSearch button.primary').click();
    await page.waitForFunction(value => {
      const rows = document.querySelectorAll('#bcnLawResults [data-law-detail]');
      return rows.length === 1 && rows[0].textContent.includes(value);
    }, article);
    assert.equal(await page.locator('#bcnLawResults .bcn-category').innerText(), name);
  }
  await page.screenshot({ path: `${output}/economic-law.png` });
  await page.locator('#bcnLegalSearch button[type="reset"]').click();
  checks.push('legal lookup displays original fire and office-offence articles under the two merged labels');

  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  const fixtures = [];
  for (const code of ['PPHS', 'KHAC', 'PCCC_CNCH', 'TNGT', 'TTXH', 'KINH_TE', 'THAM_NHUNG', 'TINH_HINH_KHAC']) {
    const id = randomUUID();
    const eventId = randomUUID();
    await database.query(`insert into daily_report_cases
      (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,created_by)
      values($1,$2,$3,$4,'QA-MERGED',$5,'QA-MERGED-UI nội dung giả','VERIFIED',$6)`,
    [id, `QA-MERGED-${code}`, scope.unitId, code, scope.reportDay, userId]);
    await database.query(`insert into daily_report_case_events
      (id,case_id,report_day,event_kind,narrative,source_user_id,state)
      values($1,$2,$3,'INITIAL_REPORT','QA-MERGED-UI nội dung giả',$4,'VERIFIED')`,
    [eventId, id, scope.reportDay, userId]);
    fixtures.push({ code, id, eventId });
  }
  await page.locator('[data-bcn-view="registry"]').click();
  await page.locator('#bcnCaseFilters [name="q"]').fill('QA-MERGED-UI');
  await page.locator('#bcnCaseFilters [name="from_day"]').fill(scope.reportDay);
  await page.locator('#bcnCaseFilters [name="to_day"]').fill(scope.reportDay);
  await page.locator('#bcnCaseFilters [name="state"]').selectOption('');
  for (const [code, count] of [['PPHS', 5], ['KINH_TE', 2], ['TINH_HINH_KHAC', 1]]) {
    await page.locator('#bcnCaseFilters [name="business_code"]').selectOption(code);
    await page.locator('#bcnCaseFilters button.primary').click();
    await page.waitForFunction(expectedCount =>
      document.querySelectorAll('#dailyReportCaseRows [data-detail]').length === expectedCount, count);
    assert.equal(await page.locator('#dailyReportCaseRows tr').count(), count);
  }
  await page.locator('#bcnClearFilters').click();
  checks.push('registry filters include all legacy members of each merged group and keep Tình hình khác separate');

  await page.locator('[data-bcn-view="composer"]').click();
  await page.locator('#bcnComposeDay').fill(scope.reportDay);
  await page.locator('#bcnComposeUnit').selectOption('');
  await page.locator('#bcnComposeClear').click();
  await page.locator('#bcnComposeLoad').click();
  await page.locator(`[data-source-id="${fixtures[0].eventId}"]`).waitFor({ state: 'visible' });
  for (const [code, members] of [['PPHS', ['PPHS', 'KHAC', 'PCCC_CNCH', 'TNGT', 'TTXH']],
    ['KINH_TE', ['KINH_TE', 'THAM_NHUNG']]]) {
    await page.locator('#bcnComposeCategory').selectOption(code);
    for (const item of fixtures) {
      assert.equal(await page.locator(`#bcnComposerRows [data-source-id="${item.eventId}"]`).count(),
        members.includes(item.code) ? 1 : 0);
    }
  }
  await page.screenshot({ path: `${output}/legacy-composer.png` });
  await page.locator('#bcnComposeClear').click();
  checks.push('compilation filters retain legacy cases in merged groups without changing their stored codes');
}
