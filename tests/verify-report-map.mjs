import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export async function verifyReportMap({ page, database, request, admin, reporter, output, check }) {
  const source = '/api/digital-map/reports';
  const day = '2003-08-12';
  const prior = '2003-08-10';
  const address = JSON.parse(readFileSync(new URL('../assets/data/vietnam-provinces-wards.json', import.meta.url)))
    .find(province => String(province.code) === '75').wards.find(ward => ward.name === 'Xã An Phước');
  const local = { province_code: '75', ward_code: String(address.code), ward_name: address.name };
  const seed = randomUUID();
  const creator = (await database.query("select id from users where username='demo.canbo02'")).rows[0].id;
  const add = (date, location, code = 'PPHS', state = 'VERIFIED', duplicate = 'UNRESOLVED', legacy = '') =>
    database.query(`insert into daily_report_cases
        (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,
          duplicate_state,created_by,location_address,location_general)
      values($1,$2,114,$3,'TEST',$4,'Kiểm thử tổng hợp bản đồ',$5,$6,$7,$8,$9)`,
    [randomUUID(), seed + randomUUID(), code, date, state, duplicate, creator, location, legacy]);

  try {
    await add(day, local);
    await add('2003-08-11', local, 'MA_TUY', 'PENDING_REVIEW');
    await add(day, null, 'PPHS', 'VERIFIED', 'UNRESOLVED', 'Xã Long Phước, Đồng Nai');
    await add(day, { province_code: '79', ward_name: address.name });
    await add(day, null);
    await add(prior, local);
    await add(prior, null);
    await add(day, local, 'PPHS', 'DRAFT');
    await add(day, local, 'PPHS', 'RETURNED');
    await add(day, local, 'PPHS', 'VERIFIED', 'DUPLICATE_NO_RECOUNT');
    const path = source + '?from=2003-08-11&to=' + day;
    assert.equal((await request(path, { cookie: reporter })).status, 403);
    const response = await request(path, { cookie: admin });
    assert.equal(response.status, 200);
    assert.equal(response.data.period.previousFrom, '2003-08-09');
    const rows = response.data.rows;
    const sum = (field, area) => rows.filter(row => !area || row.area === area)
      .reduce((total, row) => total + row[field], 0);
    assert.deepEqual([sum('current'), sum('previous'), sum('current', 'mapped'), sum('current', 'outside')], [5,2,3,1]);
    assert.equal((await request(source + '?from=2026-02-30', { cookie: admin })).status, 422);
    check('Report map resolves official and legacy wards, separates unresolved/outside cases and compares equal periods');

    await page.locator('[data-page=digitalMap]').click();
    const paths = page.locator('#digitalMapCanvas .leaflet-overlay-pane path.leaflet-interactive');
    await page.waitForFunction(() => document.querySelectorAll('#digitalMapCanvas path.leaflet-interactive').length === 95);
    await page.locator('#mapTimelineDaily:enabled').waitFor();
    assert.equal(await page.locator('#digitalMapChooseFile, #digitalMapImportKey').count(), 0);
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await page.locator('#digitalMap').screenshot({ path: output + '/map.png' });
    await page.locator('#digitalMapFrom').fill('2003-08-11');
    await page.locator('#digitalMapTo').fill(day);
    await page.waitForFunction(() => document.querySelector('#digitalMapSummary strong')?.textContent === '5');
    assert.match(await page.locator('#digitalMapSummary').innerText(), /\+150%/);
    await page.locator('#digitalMapWardSearch').fill('An Phước');
    await page.locator('#digitalMapWardSearch').press('Enter');
    assert.match(await page.locator('#digitalMapSelected').innerText(), /2 vụ kỳ này/);
    assert.match(await page.locator('#digitalMapSelected').innerText(), /\+100%/);
    assert.equal(await page.locator('#mapWardContent h4').innerText(), 'Hệ nghiệp vụ');
    assert.match(await page.locator('.map-ward-status').innerText(), /1 chờ duyệt/);
    await page.locator('#mapCloseWard').click();
    assert.equal(await page.locator('#digitalMapSelected').isVisible(), false);
    await page.locator('[data-map-list=digitalMapCharts]').click();
    assert.equal(await page.locator('#digitalMapCharts').isVisible(), true);
    assert.equal(await page.locator('#digitalMapRanking').isVisible(), false);
    await page.locator('[data-map-list=digitalMapRanking]').click();
    await page.locator('#digitalMapRanking button').first().click();
    assert.match(await page.locator('#digitalMapSelected').innerText(), /An Phước/);
    await page.locator('#mapBoundaries').uncheck();
    assert.equal(await paths.evaluateAll(nodes => nodes.filter(node => +node.getAttribute('stroke-opacity') > 0).length), 1);
    await page.locator('[data-digital-map-mode=change]').click();
    assert.match(await page.locator('#digitalMapLegend').innerText(), /Tăng/);
    await page.locator('#digitalMapCategory').selectOption({label: 'Ma túy'});
    assert.match(await page.locator('#digitalMapSummary').innerText(), /Kỳ trước 0 vụ · Tăng 1 vụ/);
    await page.locator('#digitalMapCategory').selectOption('');
    assert.equal(await page.locator('#mapDailyControls').isVisible(), false);
    await page.locator('#mapTimelineDaily').click();
    assert.equal(await page.locator('#mapTimelineLabel').innerText(), '11/08/2003');
    await page.locator('#mapTimelinePlay').click();
    await page.waitForFunction(() => document.querySelector('#mapTimelineLabel').textContent === '12/08/2003');
    assert.equal(await page.locator('#digitalMapSummary strong').first().innerText(), '4');
    await page.locator('#mapTimelineAll').click();
    assert.equal(await page.locator('#digitalMapSummary strong').first().innerText(), '5');
    assert.equal(await paths.count(), 95);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#digitalMapRanking button').first().click();
    assert.equal(await page.locator('#mapWardContent h3').innerText(), 'Xã An Phước');
    const mobileLayout = await page.locator('#digitalMapSelected').boundingBox();
    assert.ok(mobileLayout.width <= 390 && mobileLayout.height > 80);
    await page.locator('#mapCloseWard').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    check('Map heat, change layer, ward detail, filters, playback and whole-period totals work in Chrome');
  } finally {
    await database.query('delete from daily_report_cases where stable_code like $1', [seed + '%']);
  }
}
