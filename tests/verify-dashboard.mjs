import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';
import { verifyDomainFilter } from './verify-domain-filter.mjs';
import { verifyDashboardMotion } from './verify-dashboard-motion.mjs';

export async function verifyDashboard({ request, admin, reporter, compiler, page, database, output, check }) {
  const endpoint = '/api/bao-cao-ngay/dashboard';
  const initial = await request(endpoint, { cookie: admin });
  assert.equal(initial.status, 200);
  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await request(endpoint + '?span=2', { cookie: admin })).status, 422);
  assert.equal((await request(endpoint + '?day=2026-02-30', { cookie: admin })).status, 422);
  assert.equal((await request(endpoint + '?day=9999-01-01', { cookie: admin })).status, 422);
  const own = await request(endpoint + '?unit_id=115', { cookie: reporter });
  assert.equal(own.status, 200);
  assert.ok(own.data.units.every(unit => unit.id === '114'));
  assert.equal(own.data.progress.expected, 1);
  const compilerId = (await database.query("select id from users where username='ttttch.pv01'")).rows[0].id;
  const savedRoles = (await database.query('select * from daily_report_user_roles where user_id=$1', [compilerId])).rows;
  try {
    await database.query(`update daily_report_user_roles set unit_id=114,submodules='["registry"]' where user_id=$1`,
      [compilerId]);
    const restricted = await request(endpoint, { cookie: compiler });
    assert.equal(restricted.status, 200);
    assert.ok(restricted.data.units.every(unit => unit.id === '114'));
    await database.query(`update daily_report_user_roles set submodules='["legal"]' where user_id=$1`, [compilerId]);
    assert.equal((await request(endpoint, { cookie: compiler })).status, 403);
  } finally {
    for (const role of savedRoles) {
      await database.query('update daily_report_user_roles set unit_id=$2,submodules=$3::jsonb where id=$1',
        [role.id, role.unit_id, role.submodules === null ? null : JSON.stringify(role.submodules)]);
    }
  }
  check('Dashboard enforces login, valid periods, reporter units and compiler unit/submodule scope');

  const day = shiftDay(initial.data.day, -100);
  const prior = shiftDay(day, -1);
  const creator = (await database.query("select id from users where username='demo.canbo02'")).rows[0].id;
  const marker = 'Dashboard verification ' + randomUUID();
  const caseIds = [];
  const workId = randomUUID();
  const situationId = randomUUID();
  async function addCase(reportDay, business, state = 'VERIFIED', duplicate = 'UNRESOLVED', extra = []) {
    const id = randomUUID();
    caseIds.push(id);
    await database.query(`insert into daily_report_cases
      (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,
        duplicate_state,created_by,classifications)
      values($1,$2,114,$3,'TEST',$4,$5,$6,$7,$8,$9::jsonb)`,
    [id, marker + id, business, reportDay, marker + ' <script>unsafe</script>', state, duplicate, creator,
      JSON.stringify([business, ...extra].map(business_code => ({ business_code, legal_selections: [] })))]);
    return id;
  }
  try {
    await addCase(day, 'PPHS');
    await addCase(day, 'PPHS', 'PENDING_REVIEW', 'UNRESOLVED', ['MA_TUY']);
    await addCase(day, 'MOI_TRUONG', 'DRAFT');
    await addCase(day, 'MOI_TRUONG', 'VERIFIED', 'DUPLICATE_NO_RECOUNT');
    await addCase(prior, 'PPHS');
    await addCase(prior, 'MA_TUY');
    await addCase(prior, 'MOI_TRUONG');
    await addCase(prior, 'MOI_TRUONG');
    await database.query(`insert into daily_report_metrics
      (id,unit_id,report_day,metric_code,metric_values,state,created_by)
      values($1,114,$2,'DAILY_POLICE_WORK','{"patrol_rounds":2}','PENDING_REVIEW',$3)`, [workId, day, creator]);
    const read = async span => {
      const result = await request(`${endpoint}?day=${day}&span=${span}`, { cookie: admin });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return result.data;
    };
    let result = await read(1);
    assert.equal(result.cases.current, 2);
    assert.equal(result.cases.previous, 4);
    assert.equal(result.cases.percent, -50);
    assert.equal(result.cases.excluded, 1);
    assert.equal(result.domains.find(domain => domain.code === 'PPHS').direction, 'up');
    assert.equal(result.domains.find(domain => domain.code === 'PPHS').percent, 100);
    assert.equal(result.domains.find(domain => domain.code === 'MA_TUY').direction, 'flat');
    assert.equal(result.domains.find(domain => domain.code === 'MOI_TRUONG').percent, -100);
    const domainPoint = code => result.domains.find(domain => domain.code === code).series.at(-1);
    assert.equal(domainPoint('PPHS').current, 2);
    assert.equal(domainPoint('PPHS').previous, 1);
    assert.equal(domainPoint('MA_TUY').current, 1);
    assert.equal(domainPoint('MA_TUY').previous, 1);
    assert.equal(domainPoint('MOI_TRUONG').current, 0);
    assert.equal(domainPoint('MOI_TRUONG').previous, 2);
    assert.equal(result.domains.find(domain => domain.code === 'MOI_TRUONG').excluded, 1);
    let unit = result.units.find(item => item.id === '114');
    assert.equal(unit.status, 'complete');
    assert.equal(unit.items.length, 4);
    assert.equal(unit.counts.pending, 2);
    assert.ok(result.units.filter(item => item.id !== '114' && item.expected)
      .every(item => item.status === 'missing'));
    for (const span of [7, 30]) {
      result = await read(span);
      assert.equal(result.cases.current, 6);
      assert.equal(result.cases.previous, 0);
      assert.equal(result.cases.direction, 'unknown');
      assert.equal(result.cases.percent, null);
      assert.equal(result.from, shiftDay(day, 1 - span));
      assert.equal(result.previousTo, shiftDay(day, -span));
      assert.equal(result.previousFrom, shiftDay(day, 1 - span * 2));
      assert.equal(result.series.length, span);
    }
    await database.query("update daily_report_metrics set state='RETURNED' where id=$1", [workId]);
    assert.equal((await read(1)).units.find(item => item.id === '114').status, 'returned');
    await database.query("update daily_report_metrics set state='DRAFT' where id=$1", [workId]);
    assert.equal((await read(1)).units.find(item => item.id === '114').status, 'partial');
    await database.query("update daily_report_metrics set state='PENDING_REVIEW' where id=$1", [workId]);
    await database.query('update daily_report_cases set current_state=\'DRAFT\' where id=any($1::uuid[]) and report_day=$2',
      [caseIds, prior]);
    await database.query(`insert into daily_report_situations
      (id,unit_id,report_day,category_codes,narrative,state,created_by)
      values($1,114,$2,'["NORMAL_DAY"]','Ngày không có vụ việc','VERIFIED',$3)`, [situationId, prior, creator]);
    result = await read(1);
    assert.equal(result.cases.direction, 'up');
    assert.equal(result.cases.delta, 2);
    assert.equal(result.cases.percent, null);
    check('Dashboard counts unique non-draft/non-duplicate cases, multi-domain cases, periods and zero baselines correctly');
    check('Dashboard distinguishes complete, partial, returned and missing reports and lists submitted content');

    await mkdir(output + '/dashboard', { recursive: true });
    await page.locator('[data-page=home]').click();
    await page.locator('#dashDay').fill(day);
    await page.locator('#dashDay').dispatchEvent('change');
    await page.waitForFunction(expected => document.querySelector('#dashUnitsTitle')?.textContent
      .includes(expected), day.split('-').reverse().join('/'));
    assert.equal(await page.locator('.dash-kpi[data-tone=blue]').getAttribute('data-direction'), 'up');
    await verifyDashboardMotion({ page, data: result, check });
    await verifyDomainFilter({ page, data: result, output, audience: 'command', check });
    await page.locator('[data-status-filter=sent]').click();
    assert.equal(await page.locator('#dashUnitRows tr[data-unit]').count(), 1);
    await page.locator('[data-unit-detail="114"]').click();
    assert.equal(await page.locator('#dashDetail114 .dash-source').count(), 4);
    assert.equal(await page.locator('#dashDetail114 script').count(), 0);
    assert.match(await page.locator('#dashDetail114').innerText(), /<script>unsafe<\/script>/);
    await page.locator('#dashUnitSearch').fill('khong tim thay don vi');
    assert.equal(await page.locator('#dashUnitRows tr[data-unit]').count(), 0);
    await page.locator('#dashUnitSearch').fill('');
    await page.locator('[data-status-filter=all]').click();
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['dark', 'light']) {
        await page.evaluate(async mode => {
          const appearance = await import('/assets/js/standalone/appearance.js');
          appearance.previewAppearance({ palette: 'charcoal', mode });
        }, mode);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        const fits = await page.locator('.dash-kpi').evaluateAll(cards => cards.every(card => {
          const bounds = card.getBoundingClientRect();
          return [...card.children].every(child => child.getBoundingClientRect().right <= bounds.right + 1);
        }));
        assert.equal(fits, true, `Dashboard cards fit at ${width}px in ${mode}`);
        await page.locator('.dash-header').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/dashboard/${mode}-${width}.png` });
        await page.locator('#dashUnitsTitle').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/dashboard/units-${mode}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const span of [7, 30, 1]) {
      const response = page.waitForResponse(response => response.url().includes('/dashboard?')
        && new URL(response.url()).searchParams.get('span') === String(span));
      await page.locator(`[data-span="${span}"]`).click();
      assert.equal((await response).status(), 200);
      await page.locator('#dashData[aria-busy=false]').waitFor();
    }
    check('Dashboard filters, expanded report contents, colour changes and period controls work on desktop and mobile');

    await page.route('**/api/bao-cao-ngay/dashboard?*', route => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ error: 'Lỗi kiểm chứng kết nối' }) }));
    await page.locator('#dashRefresh').click();
    await page.getByText('Chưa cập nhật được', { exact: false }).waitFor();
    assert.ok(await page.locator('#dashUnitRows tr[data-unit]').count() > 0);
    await page.unroute('**/api/bao-cao-ngay/dashboard?*');
    await page.route('**/api/bao-cao-ngay/dashboard?*', route => route.fulfill({ status: 403,
      contentType: 'application/json', body: JSON.stringify({ error: 'Không đủ quyền' }) }));
    await page.locator('#dashRefresh').click();
    await page.getByText('Chưa có quyền xem dashboard', { exact: true }).waitFor();
    assert.equal(await page.locator('#dashUnitRows').count(), 0);
    await page.unroute('**/api/bao-cao-ngay/dashboard?*');
    check('Dashboard retains dated data on network failure and clears it immediately when access is denied');
  } finally {
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [caseIds]);
    await database.query('delete from daily_report_metrics where id=$1', [workId]);
    await database.query('delete from daily_report_situations where id=$1', [situationId]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await page.screenshot({ path: output + '/dashboard/current-overview.png' });
    await page.locator('#dashUnitsTitle').scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/dashboard/current-units.png' });
    await page.locator('.dash-header').scrollIntoViewIfNeeded();
  }
}
