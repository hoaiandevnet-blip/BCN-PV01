import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';
import { verifyDomainFilter } from './verify-domain-filter.mjs';
import { verifyUnitReportTable } from './verify-unit-report-table.mjs';
import { verifyDashboardMotion } from './verify-dashboard-motion.mjs';

export async function verifyUnitDashboard({ request, admin, reporter, compiler, database,
  browser, base, output, password, check, errors }) {
  const endpoint = '/api/bao-cao-ngay/dashboard';
  const { data: scope } = await request('/api/bao-cao-ngay/scope', { cookie: reporter });
  const day = shiftDay(scope.reportDay, -220);
  const prior = shiftDay(day, -1);
  const old = shiftDay(day, -40);
  const roles = (await database.query('select * from daily_report_user_roles where user_id=$1', [scope.userId])).rows;
  const cases = [];
  const metrics = [];
  const situation = randomUUID();
  const submission = randomUUID();
  const marker = 'UNIT-DASH-' + randomUUID();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function addCase(state, reportDay = day, unit = scope.unitId, duplicate = 'UNRESOLVED') {
    const id = randomUUID();
    cases.push(id);
    await database.query(`insert into daily_report_cases
      (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,duplicate_state,created_by)
      values($1,$2,$3,'PPHS','TEST',$4,$5,$6,$7,$8)`,
    [id, marker + id, unit, reportDay, `Hồ sơ kiểm chứng <img src=x onerror=alert(1)> ${state}`,
      state, duplicate, scope.userId]);
    return id;
  }
  async function addWork(state, rounds) {
    const id = randomUUID();
    metrics.push(id);
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by,review_reason)
      values($1,$2,$3,'DAILY_POLICE_WORK',$4::jsonb,$5,$6,$7)`,
    [id, scope.unitId, day, JSON.stringify({ patrol_rounds: rounds, patrol_vehicles_checked: 0,
      administrative_fines: rounds * 100000 }), state, scope.userId,
    state === 'RETURNED' ? 'Đối chiếu lại số lượt tuần tra' : null]);
    return id;
  }
  const read = async (query = '', cookie = reporter) => {
    const result = await request(`${endpoint}?day=${day}${query}`, { cookie });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  const selectDay = async value => {
    await page.locator('#dashDay').fill(value);
    await page.locator('#dashDay').dispatchEvent('change');
    await page.locator('#dashData[aria-busy=false]').waitFor();
    await page.locator('#unitWorkTitle').waitFor();
  };
  try {
    await addCase('VERIFIED');
    await addCase('PENDING_REVIEW');
    await addCase('VERIFIED', day, scope.unitId, 'DUPLICATE_NO_RECOUNT');
    await addCase('DRAFT');
    const returned = await addCase('RETURNED', old);
    const other = await addCase('RETURNED', day, 124);
    await database.query(`insert into daily_report_submissions
      (id,case_id,unit_id,report_day,version,state,snapshot,snapshot_sha256,created_by)
      values($1,$2,$3,$4,1,'RETURNED','{}','verification',$5)`,
    [submission, returned, scope.unitId, old, scope.userId]);
    await database.query(`insert into daily_report_returns(id,submission_id,reason,actor_id)
      values($1,$2,'Bổ sung địa điểm xảy ra vụ việc',$3)`, [randomUUID(), submission, scope.userId]);
    await addWork('VERIFIED', 3);
    await addWork('PENDING_REVIEW', 2);
    const returnedWork = await addWork('RETURNED', 100);
    await addWork('DRAFT', 200);
    await database.query(`insert into daily_report_situations
      (id,unit_id,report_day,category_codes,narrative,state,created_by)
      values($1,$2,$3,'["NORMAL_DAY"]','Tình hình bình thường','PENDING_REVIEW',$4)`,
    [situation, scope.unitId, prior, scope.userId]);
    const result = await read('&unit_id=124');
    assert.equal(result.audience, 'unit');
    assert.equal(result.unitDashboard.unit.id, String(scope.unitId));
    assert.ok(result.units.every(unit => unit.id === String(scope.unitId)));
    assert.ok(!JSON.stringify(result).includes(other));
    assert.equal((await read('', admin)).audience, 'command');
    assert.equal((await read('', compiler)).audience, 'command');
    assert.equal(result.cases.current, 2);
    assert.equal(result.cases.excluded, 1);
    assert.equal(result.domains.find(domain => domain.code === 'PPHS').series.at(-1).current, 2);
    assert.equal(result.unitDashboard.dayCounts.pending, 2);
    assert.equal(result.unitDashboard.tasks.returned, 2);
    assert.equal(result.unitDashboard.tasks.drafts, 2);
    assert.equal(result.unitDashboard.sections.work.status, 'returned');
    assert.equal(result.unitDashboard.work.fields.find(field => field.key === 'patrol_rounds').value, 5);
    assert.equal(result.unitDashboard.work.fields.find(field => field.key === 'patrol_vehicles_checked').value, 0);
    assert.equal(result.unitDashboard.work.fields.find(field => field.key === 'patrol_officers').value, null);
    assert.equal(result.unitDashboard.work.fields.find(field => field.key === 'administrative_fines').value, 500000);
    assert.ok(result.unitDashboard.tasks.items.some(item => item.id === returned && item.reason.includes('địa điểm')));
    check('Unit dashboard routes reporters and compilers separately, ignores forged unit scope and counts real states');

    await page.goto(base);
    await page.locator('#loginAccount').fill('demo.canbo02');
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginForm button[type=submit]').click();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('[data-audience=unit]').waitFor();
    await selectDay(day);
    assert.equal(await page.locator('.bcn-topbar #accountUnit').innerText(), scope.unitName);
    assert.equal(await page.locator('#home .dash-header').isVisible(), false);
    assert.equal(await page.locator('#dashUnitRows').count(), 1);
    assert.equal((await page.locator('[data-unit-kpi=cases] .dash-kpi-value').innerText()).replace(/\s/g, ''), '2vụ');
    const removed = '#unitTasksTitle, #unitRecentTitle, #unitProgressTitle, .unit-shortcuts, [data-unit-item]';
    assert.equal(await page.locator('#home').locator(removed).count(), 0);
    assert.equal(await page.locator('.unit-work-values article').count(), 6);
    for (const view of ['input', 'registry', 'returned', 'updates', 'unlock']) {
      assert.equal(await page.locator(`#sidebar [data-bcn-view="${view}"]`).isVisible(), true);
    }
    await page.locator('#sidebar [data-bcn-view=unlock]').click();
    await page.locator('[data-bcn-pane=unlock]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.bcn-topbar[data-unit-dashboard]').count(), 0);
    check('Reporter dashboard removes all four requested blocks, merges identity into the toolbar and keeps sidebar access');

    await page.locator('[data-page=home]').click();
    await selectDay(day);
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await verifyDashboardMotion({ page, data: result, check });
    await verifyDomainFilter({ page, data: result, output, audience: 'unit', check });
    await verifyUnitReportTable({ page, data: result, scope, day, prior, emptyDay: shiftDay(old, -1),
      selectDay, output, check, database });
    await mkdir(output + '/unit-dashboard', { recursive: true });
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const appearance = await import('/assets/js/standalone/appearance.js');
          appearance.previewAppearance({ palette: 'charcoal', mode });
        }, mode);
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.equal(await page.locator('#home').locator(removed).count(), 0);
        await page.locator('.bcn-topbar').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/unit-dashboard/${mode}-${width}.png` });
        await page.locator('#unitWorkTitle').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/unit-dashboard/work-${mode}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const span of [7, 30, 1]) {
      await page.locator(`[data-span="${span}"]`).click();
      await page.locator('#dashData[aria-busy=false]').waitFor();
      assert.equal(await page.locator(`[data-span="${span}"]`).getAttribute('aria-pressed'), 'true');
    }
    await selectDay(shiftDay(old, -1));
    assert.match(await page.locator('#home').innerText(), /Chưa có bản kết quả công tác đã gửi trong kỳ/);
    assert.equal(await page.locator('[data-work-field=patrol_rounds] strong').innerText(), '—');
    await selectDay(prior);
    const priorData = (await request(`${endpoint}?day=${prior}`, { cookie: reporter })).data;
    assert.equal(priorData.unitDashboard.sections.situation.status, 'complete');
    assert.equal(priorData.unitDashboard.sections.work.status, 'missing');
    assert.equal(await page.locator('#home').locator(removed).count(), 0);
    check('Unit dashboard handles zero versus unknown, normal-day reports, empty days, periods and both themes at 320–1440px');

    await selectDay(day);
    await page.route('**/api/bao-cao-ngay/dashboard?*', route => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ error: 'Lỗi kết nối kiểm chứng' }) }));
    await page.locator('#dashRefresh').click();
    await page.getByText('Chưa cập nhật được', { exact: false }).waitFor();
    await page.locator('#unitWorkTitle').waitFor();
    await page.unroute('**/api/bao-cao-ngay/dashboard?*');
    await database.query(`update daily_report_user_roles set submodules='["input"]' where user_id=$1`, [scope.userId]);
    const inputOnly = await read();
    assert.ok(inputOnly.units.every(unit => unit.id === String(scope.unitId)));
    assert.ok(!JSON.stringify(inputOnly).includes(other));
    await page.locator('#dashRefresh').click();
    await page.locator('#dashData[aria-busy=false]').waitFor();
    assert.equal(await page.locator('#dashUnitRows tr[data-unit]').count(), 1);
    await page.locator('[data-unit-detail]').click();
    assert.equal(await page.locator('.dash-source-card').count(), inputOnly.units[0].items.length);
    await database.query(`update daily_report_user_roles set submodules='["registry"]' where user_id=$1`, [scope.userId]);
    const restricted = await read();
    assert.equal(restricted.unitDashboard.work.accessible, false);
    assert.equal(restricted.unitDashboard.sections.work.status, 'restricted');
    assert.ok(!JSON.stringify(restricted).includes(returnedWork));
    await page.locator('#dashRefresh').click();
    await page.getByText('Cần quyền Nhập báo cáo ngày để xem kết quả công tác.').waitFor();
    assert.equal(await page.locator('#dashUnitRows, .dash-source-card').count(), 0);
    assert.equal(await page.locator('[data-unit-open=input]').count(), 0);
    await database.query(`update daily_report_user_roles set submodules='["legal"]' where user_id=$1`, [scope.userId]);
    assert.equal((await request(endpoint, { cookie: reporter })).status, 403);
    await page.locator('#dashRefresh').click();
    await page.getByText('Chưa có quyền xem dashboard', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-unit-source]').count(), 0);
    assert.equal(await page.locator('#dashUnitRows, .dash-source-card').count(), 0);
    assert.equal(await page.locator('.bcn-topbar[data-unit-dashboard]').count(), 0);
    assert.ok(!(await page.locator('.dash-header').innerText()).includes(scope.unitName));
    check('Unit dashboard preserves dated data on outage, hides ungranted work data and clears content after access revocation');
    check('Reporter review works with input-only permission and disappears when reporting permission is removed');
  } catch (error) {
    await mkdir(output + '/unit-dashboard', { recursive: true });
    await page.screenshot({ path: output + '/unit-dashboard/failure.png' });
    await writeFile(output + '/unit-dashboard/failure.txt', await page.locator('body').innerText());
    throw error;
  } finally {
    for (const role of roles) {
      await database.query('update daily_report_user_roles set submodules=$2::jsonb where id=$1',
        [role.id, role.submodules === null ? null : JSON.stringify(role.submodules)]);
    }
    await context.close();
    await database.query('delete from daily_report_returns where submission_id=$1', [submission]);
    await database.query('delete from daily_report_submissions where id=$1', [submission]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [cases]);
    await database.query('delete from daily_report_metrics where id=any($1::uuid[])', [metrics]);
    await database.query('delete from daily_report_situations where id=$1', [situation]);
  }
}
