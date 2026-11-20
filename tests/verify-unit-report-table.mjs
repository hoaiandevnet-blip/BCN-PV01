import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function verifyUnitReportTable({ page, data, scope, day, prior, emptyDay,
  selectDay, output, check, database }) {
  const folder = output + '/unit-dashboard';
  await mkdir(folder, { recursive: true });
  const table = page.locator('.dash-units');
  const row = table.locator('tr[data-unit]');
  const detail = table.locator('[data-unit-detail]');
  const cards = table.locator('.dash-source-card');
  const expected = data.units.find(unit => unit.id === String(scope.unitId));

  assert.equal(await table.locator('#unitWorkTitle').count(), 1);
  assert.equal(await table.locator('.unit-work-values article').count(), 6);
  assert.equal(await table.locator('.dash-panel').count(), 0, 'Use one shared panel without nested panel frames');
  assert.equal(await table.locator('[data-work-field=patrol_rounds] strong').innerText(), '5');
  assert.equal(await table.locator('.unit-work-heading p').count(), 0, 'A daily date is already in the main heading');
  assert.equal(await row.count(), 1);
  assert.equal(await row.getAttribute('data-unit'), String(scope.unitId));
  assert.equal(await row.locator('.dash-unit-name strong').innerText(), scope.unitName);
  assert.equal(await row.getAttribute('data-status'), expected.status);
  assert.equal(await table.locator('#dashUnitSearch, [data-status-filter]').count(), 0);
  await detail.click();
  assert.equal(await detail.getAttribute('aria-expanded'), 'true');
  assert.equal(await cards.count(), expected.items.length);
  assert.equal(await cards.locator('img, .dash-source-number').count(), 0);
  assert.match(await cards.allTextContents().then(text => text.join(' ')), /300\.000 đồng/);
  for (const kind of ['CASE', 'WORK_RESULT', 'SITUATION']) {
    assert.equal(await table.locator(`.dash-source-card[data-kind="${kind}"]`).count(),
      expected.items.filter(item => item.kind === kind).length);
  }
  await page.locator('#dashRefresh').click();
  await page.locator('#dashData[aria-busy=false]').waitFor();
  assert.equal(await detail.getAttribute('aria-expanded'), 'true');
  assert.equal(await cards.count(), expected.items.length);
  await detail.focus();
  await page.keyboard.press('Enter');
  assert.equal(await cards.count(), 0);
  assert.equal(await detail.getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('Space');
  assert.equal(await cards.count(), expected.items.length);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ['dark', 'light']) {
      await page.evaluate(async mode => {
        const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
        previewAppearance({ palette: 'charcoal', mode });
      }, mode);
      await table.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await row.count(), 1);
      assert.equal(await cards.count(), expected.items.length);
      await table.screenshot({ path: `${folder}/report-table-${mode}-${width}.png` });
    }
  }
  check('Reporter review table shows only the assigned unit, opens submitted content, keeps details on refresh and fits mobile');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectDay(prior);
  assert.equal(await detail.getAttribute('aria-expanded'), 'false');
  assert.equal(await row.getAttribute('data-status'), 'partial');
  await detail.click();
  assert.equal(await cards.count(), 1);
  assert.equal(await cards.first().getAttribute('data-kind'), 'SITUATION');
  assert.match(await cards.first().innerText(), /Tình hình bình thường/);
  // Control assignment dates only in the isolated database, then restore every affected role.
  const assignments = (await database.query(`select id,effective_from::text as starts
    from daily_report_user_roles where unit_id=$1 and role_code='UNIT_REPORTER'`, [scope.unitId])).rows;
  try {
    await database.query(`update daily_report_user_roles set effective_from=$2::date
      where unit_id=$1 and role_code='UNIT_REPORTER'`, [scope.unitId, day]);
    await selectDay(emptyDay);
    assert.equal(await row.count(), 0);
    assert.equal(await detail.count(), 0);
    assert.equal(await cards.count(), 0);
    assert.match(await table.innerText(), /Đơn vị chưa có báo cáo trong ngày đã chọn/);
    await database.query(`update daily_report_user_roles set effective_from=$2::date
      where unit_id=$1 and role_code='UNIT_REPORTER'`, [scope.unitId, emptyDay]);
    await selectDay(emptyDay);
    assert.equal(await row.count(), 1);
    assert.equal(await row.getAttribute('data-status'), 'missing');
    assert.equal(await detail.count(), 0);
    assert.equal(await cards.count(), 0);
    assert.match(await row.innerText(), /Chưa nhận nội dung/);
  } finally {
    for (const assignment of assignments) {
      await database.query('update daily_report_user_roles set effective_from=$2::date where id=$1',
        [assignment.id, assignment.starts]);
    }
  }

  await selectDay(day);
  await detail.click();
  for (const span of [7, 30, 1]) {
    await page.locator(`[data-span="${span}"]`).click();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    assert.equal(await detail.getAttribute('aria-expanded'), 'true');
    assert.equal(await cards.count(), expected.items.length);
    assert.equal(await table.locator('.unit-work-heading p').count(), span === 1 ? 0 : 1);
    assert.equal(await table.locator('[data-work-field=patrol_rounds] strong').innerText(), '5');
  }
  await detail.click();
  check('Reporter review follows the selected day, clears old details, distinguishes missing reports and keeps daily content across periods');
}
