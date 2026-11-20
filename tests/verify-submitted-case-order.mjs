import assert from 'node:assert/strict';

export async function verifySubmittedCaseOrder({ page, folder, check }) {
  const domains = [
    'PPHS', 'TNXH', 'MA_TUY', 'KINH_TE', 'MOI_TRUONG', 'ANQG',
    'CONG_NGHE_CAO', 'HOAT_DONG_TU_PHAP', 'TINH_HINH_KHAC'
  ];
  const reportDay = await page.locator('.entry-topbar-day').getAttribute('datetime');
  const latestUrl = new URL('/api/bao-cao-ngay/daily-intake/latest?report_day=' + reportDay, page.url());
  const latestResponse = await page.request.get(latestUrl.href);
  assert.equal(latestResponse.status(), 200);
  const latest = await latestResponse.json();
  for (const item of latest.data?.cases || []) {
    assert.ok(Object.hasOwn(item, 'title'), 'Latest intake returns the actual case title');
  }
  const actualOptions = await page.locator('#bcnReferenceCaseForm select[name=business_code] option')
    .evaluateAll(options => options.map(option => option.value).filter(Boolean));
  assert.deepEqual(actualOptions, domains, 'Use the same domain order as the entry dropdown');
  const shuffledCodes = [
    'TINH_HINH_KHAC', 'ANQG', 'KINH_TE', 'PPHS', 'HOAT_DONG_TU_PHAP',
    'TNXH', 'CONG_NGHE_CAO', 'MA_TUY', 'MOI_TRUONG', 'PPHS', 'THAM_NHUNG', 'UNKNOWN_TEST'
  ];
  const cases = shuffledCodes.map((businessCode, index) => ({
    id: `order-test-${index}`,
    business_code: businessCode,
    title: `Kiểm tra thứ tự ${index}`,
    summary: 'Dữ liệu thử thứ tự hiển thị; không ghi vào database.',
    reference_info: { title: 'Tên cũ không dùng', incident_status: 'Tiếp nhận vụ việc ban đầu' }
  }));
  Object.assign(cases[3].reference_info, {
    subjects: ['Người thử thứ nhất', 'Người thử thứ hai'],
    subject_details: [{ name: 'Người thử thứ nhất', gender: 'MALE', birth_year: 1995,
      identity_number: '000000000001', permanent_address: 'Địa chỉ thử A', current_address: 'Địa chỉ thử B' },
    { name: 'Người thử thứ hai', gender: 'FEMALE', birth_year: 1998,
      birth_month: 4, birth_day: 9, identity_number: '000000000002',
      permanent_address: 'Địa chỉ thử C', current_address: 'Địa chỉ thử C' }],
    death_count: 0, injured_count: 2, property_damage: 12500000, evidence: '01 xe mô tô; 02 điện thoại thử.'
  });
  const response = {
    submitted: true,
    data: { id: 'case-order-test', report_day: reportDay, metric_values: {}, cases }
  };
  const pattern = '**/api/bao-cao-ngay/daily-intake/latest?*';
  await page.route(pattern, route => route.fulfill({ json: response }));
  const reopen = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#sidebar [data-bcn-view=input]').click();
  };
  try {
    await reopen();
    const cards = page.locator('#bcnSubmittedReportCard .bcn-incident-summary-card');
    await page.waitForFunction(count =>
      document.querySelectorAll('#bcnSubmittedReportCard .bcn-incident-summary-card').length === count, cases.length);
    assert.deepEqual(await cards.locator('.bcn-category').evaluateAll(badges =>
      badges.map(badge => badge.dataset.bcnDomain)), [
      'PPHS', 'PPHS', 'TNXH', 'MA_TUY', 'KINH_TE', 'KINH_TE', 'MOI_TRUONG',
      'ANQG', 'CONG_NGHE_CAO', 'HOAT_DONG_TU_PHAP', 'TINH_HINH_KHAC', 'KHAC'
    ]);
    assert.deepEqual(await cards.locator('.bcn-incident-summary-title').allTextContents(),
      [3, 9, 5, 7, 2, 10, 8, 1, 6, 4, 0, 11].map(index => `Kiểm tra thứ tự ${index}`));
    const first = cards.first();
    assert.equal(await first.locator('[data-incident-fact=subjects] dd').innerText(), '2');
    assert.equal(await first.locator('[data-incident-fact=deaths] dd').innerText(), '0');
    assert.equal(await first.locator('[data-incident-fact=injured] dd').innerText(), '2');
    assert.equal(await first.locator('[data-incident-fact=damage] dd').innerText(), '12.500.000 đồng');
    assert.match(await first.innerText(), /CCCD 000000000001/);
    assert.match(await first.innerText(), /09\/04\/1998/);
    assert.match(await first.innerText(), /01 xe mô tô; 02 điện thoại thử/);
    assert.doesNotMatch(await first.innerText(), /Tên cũ không dùng|Dữ liệu thử thứ tự hiển thị/);
    for (const mode of ['dark', 'light']) {
      await page.evaluate(async mode => {
        const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
        previewAppearance({ palette: 'charcoal', mode });
      }, mode);
      const colors = await cards.locator('.bcn-category').evaluateAll(badges =>
        badges.slice(0, -1).map(badge => getComputedStyle(badge).backgroundColor));
      assert.equal(new Set(colors).size, 9, 'All nine domains retain distinct colors');
      assert.equal(await first.evaluate(card => {
        return !card.closest('[inert], fieldset[disabled]') && getComputedStyle(card).opacity === '1';
      }), true, 'A locked report summary keeps readable text and domain colors');
      for (const width of [1422, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.NotificationPopup.getShared().reset());
        await first.scrollIntoViewIfNeeded();
        assert.equal(await first.evaluate(card => card.scrollWidth <= card.clientWidth + 1), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({ path: `${folder}/incident-summary-${mode}-${width}.png`, animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
    check('Case summaries show saved names, subjects, casualties, damages and evidence in nine readable domain colors');
    check('Submitted cases follow all nine dropdown domains, retain order within a domain and preserve unknown cases');
  } finally {
    await page.unroute(pattern);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await reopen();
    await page.waitForFunction(() => document.querySelector('#bcnSubmittedReportCard')?.hidden
      || !document.querySelector('#bcnSubmittedReportCard')?.textContent.includes('Kiểm tra thứ tự'));
  }
}
