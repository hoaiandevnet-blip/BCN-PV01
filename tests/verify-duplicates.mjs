import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { shiftDay } from '../server/daily-reports/dashboard/statistics.js';

export async function verifyDuplicates({ page, request, admin, reporter, database, output, check }) {
  const folder = output + '/duplicates';
  await mkdir(folder, { recursive: true });
  const scope = (await request('/api/bao-cao-ngay/scope', { cookie: admin })).data;
  const day = shiftDay(scope.reportDay, -180);
  const prior = shiftDay(day, -1);
  const creator = (await database.query("select id from users where username='demo.canbo02'")).rows[0].id;
  const marker = 'DUP-' + randomUUID().slice(0, 8);
  const ids = [];
  const sources = [];
  const candidates = [];
  async function addCase(index, reportDay, role) {
    const id = randomUUID();
    ids.push(id);
    await database.query(`insert into daily_report_cases
      (id,stable_code,unit_id,business_code,category_code,report_day,summary,current_state,created_by,
       external_reference,location_general,title,classifications)
      values($1,$2,114,'PPHS',$3,$4,$5,'VERIFIED',$6,$7,$8,$9,$10::jsonb)`,
    [id, `${marker}-${role}-${String(index).padStart(2, '0')}`, `${marker}-${index}`, reportDay,
      `Nội dung đối chiếu số ${index}: ghi nhận vụ việc tại Xã Bình Tân. <img src=x onerror=alert(1)>`,
      creator, `${marker}-HS-${index}`, `Xã Bình Tân, địa điểm kiểm thử ${index}`,
      `Rà soát hồ sơ ${String(index).padStart(2, '0')} tại Xã Bình Tân`,
      JSON.stringify([{ business_code: 'PPHS', legal_selections: [] }])]);
    return id;
  }
  try {
    for (let index = 1; index <= 22; index += 1) {
      candidates.push(await addCase(index, prior, 'OLD'));
      sources.push(await addCase(index, day, 'NEW'));
    }
    assert.equal((await request(`/api/bao-cao-ngay/duplicates/candidates?case_id=${sources[0]}`,
      { cookie: reporter })).status, 403);
    const actual = (await request(`/api/bao-cao-ngay/duplicates/candidates?case_id=${sources[0]}`,
      { cookie: admin })).data.candidates.find(item => item.id === candidates[0]);
    assert.equal(actual.score, 185);
    assert.equal(actual.important, true);
    await page.locator('#sidebar [data-bcn-view=duplicates]').click();
    const workspace = page.locator('#bcnDuplicatesWorkspace');
    await workspace.waitFor({ state: 'visible' });
    await workspace.locator('#bcnDuplicateDay').fill(day);
    await workspace.locator('#bcnDuplicateUnit').selectOption('114');
    await workspace.locator('#bcnDuplicateLoad').click();
    await page.waitForFunction(() => document.querySelector('[data-dup-metric=scanned]')?.textContent === '20 / 22'
      && document.querySelector('#bcnDuplicateStop').hidden);
    assert.equal(await workspace.locator('#bcnDuplicateNext').isVisible(), true);
    await workspace.locator('#bcnDuplicateNext').click();
    await page.waitForFunction(() => document.querySelector('[data-dup-metric=scanned]')?.textContent === '22 / 22'
      && document.querySelector('#bcnDuplicateStop').hidden);
    assert.equal(await workspace.locator('#bcnDuplicateNext').isVisible(), false);
    assert.equal(await workspace.locator('[data-dup-metric=pending]').innerText(), '22');
    assert.equal(await workspace.locator('[data-dup-metric=priority]').innerText(), '22');
    assert.equal(await workspace.locator('[data-dup-pair]').count(), 12);
    await workspace.locator('[data-dup-page="1"]').click();
    assert.equal(await workspace.locator('[data-dup-pair]').count(), 10);
    await workspace.locator('#bcnDuplicateSearch').fill(`${marker}-NEW-01`);
    assert.equal(await workspace.locator('[data-dup-pair]').count(), 1);
    await workspace.locator('[data-dup-pair]').click();
    await workspace.locator('#bcnDuplicateDecisionForm').waitFor({ state: 'visible' });
    assert.match(await workspace.locator('.bcn-dup-score').innerText(), /185/);
    assert.match(await workspace.locator('#bcnDuplicateCoverage').innerText(), /không phải phần trăm/);
    assert.equal(await workspace.locator('.bcn-dup-documents img').count(), 0);
    assert.match(await workspace.locator('[data-dup-document=source]').innerText(), /Xã Bình Tân/);
    assert.ok(await workspace.locator('.is-match').count() >= 4);
    await page.screenshot({ path: folder + '/desktop.png', fullPage: true });
    check('Duplicate review uses real evidence scores, bounded batches, result paging, search and side-by-side safe text');

    await workspace.locator('#bcnDuplicateSearch').fill('');
    for (const [index, action] of ['SEPARATE_CASE', 'DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].entries()) {
      await workspace.locator('#bcnDuplicateSearch').fill(`${marker}-NEW-${String(index + 1).padStart(2, '0')}`);
      await workspace.locator('[data-dup-pair]').click();
      const form = workspace.locator('#bcnDuplicateDecisionForm');
      await form.waitFor({ state: 'visible' });
      await form.locator('#bcnDuplicateSave').click();
      assert.equal((await database.query('select count(*)::int as total from daily_report_duplicate_decisions '
        + 'where case_id=$1', [sources[index]])).rows[0].total, 0);
      await form.locator(`input[value=${action}]`).check();
      await form.locator('[name=reason]').fill('Đã đối chiếu số hồ sơ nguồn, địa điểm và nội dung; kết luận kiểm thử.');
      const saved = page.waitForResponse(response => response.url().endsWith('/duplicates/decisions')
        && response.request().method() === 'POST');
      await form.locator('#bcnDuplicateSave').click();
      assert.equal((await saved).status(), 201);
      await workspace.locator('.bcn-dup-conclusion').waitFor({ state: 'visible' });
      const stored = (await database.query('select action,reason from daily_report_duplicate_decisions where case_id=$1',
        [sources[index]])).rows;
      assert.equal(stored.length, 1);
      assert.equal(stored[0].action, action);
      assert.match(stored[0].reason, /Đã đối chiếu/);
    }
    assert.equal(await workspace.locator('[data-dup-metric=saved]').innerText(), '3');
    assert.equal((await database.query('select duplicate_state,counted_as_pphs from daily_report_cases where id=$1',
      [sources[1]])).rows[0].duplicate_state, 'DUPLICATE_NO_RECOUNT');
    assert.equal((await database.query("select count(*)::int as total from daily_report_case_events "
      + "where case_id=$1 and event_kind='PRIOR_DAY_UPDATE'", [candidates[2]])).rows[0].total, 1);
    await workspace.locator('#bcnDuplicateState').selectOption('saved');
    await workspace.locator('#bcnDuplicateSearch').fill('');
    assert.equal(await workspace.locator('[data-dup-pair]').count(), 3);
    await page.screenshot({ path: folder + '/conclusion.png', fullPage: true });
    check('All three duplicate conclusions require a choice and reason, persist once and retain existing counting/event rules');

    await page.reload();
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#sidebar [data-bcn-view=duplicates]').click();
    await workspace.locator('#bcnDuplicateDay').fill(day);
    await workspace.locator('#bcnDuplicateUnit').selectOption('114');
    let reject = true;
    await page.route('**/api/bao-cao-ngay/cases?*', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue().catch(() => {});
    });
    await workspace.locator('#bcnDuplicateLoad').click();
    await workspace.locator('#bcnDuplicateStop').click();
    await workspace.locator('#bcnDuplicateStop').waitFor({ state: 'hidden' });
    assert.equal(await workspace.locator('#bcnDuplicateNext').isVisible(), true);
    await page.unroute('**/api/bao-cao-ngay/cases?*');
    await page.route('**/api/bao-cao-ngay/duplicates/candidates?*', async route => {
      if (reject) {
        reject = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Lỗi kiểm thử tải dữ liệu"}' });
      } else await route.continue();
    });
    await workspace.locator('#bcnDuplicateLoad').click();
    await workspace.locator('#bcnDuplicateError').waitFor({ state: 'visible' });
    assert.match(await workspace.locator('#bcnDuplicateError').innerText(), /Lỗi kiểm thử/);
    assert.equal(await workspace.locator('[data-dup-metric=scanned]').innerText(), '0 / 22');
    await workspace.locator('#bcnDuplicateNext').click();
    await page.waitForFunction(() => document.querySelector('[data-dup-metric=scanned]')?.textContent === '20 / 22'
      && document.querySelector('#bcnDuplicateStop').hidden);
    await page.unroute('**/api/bao-cao-ngay/duplicates/candidates?*');
    await workspace.locator('#bcnDuplicateNext').click();
    await page.waitForFunction(() => document.querySelector('[data-dup-metric=scanned]')?.textContent === '22 / 22'
      && document.querySelector('#bcnDuplicateStop').hidden);
    assert.equal(await workspace.locator('[data-dup-metric=pending]').innerText(), '19');
    check('Reload respects saved decisions; a failed scan stays incomplete and resumes the failed source without losing results');

    await page.route('**/api/bao-cao-ngay/duplicates/candidates?*', async route => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.continue().catch(() => {});
    });
    await workspace.locator('#bcnDuplicateLoad').click();
    await workspace.locator('#bcnDuplicateStop').waitFor({ state: 'visible' });
    await workspace.locator('#bcnDuplicateStop').click();
    await workspace.locator('#bcnDuplicateStop').waitFor({ state: 'hidden' });
    assert.match(await workspace.locator('#bcnDuplicateStatus').innerText(), /Đã dừng/);
    await page.unroute('**/api/bao-cao-ngay/duplicates/candidates?*');
    await workspace.locator('#bcnDuplicateNext').click();
    await page.waitForFunction(() => !document.querySelector('#bcnDuplicateStop').hidden);
    await workspace.locator('#bcnDuplicateStop').waitFor({ state: 'hidden' });
    await workspace.locator('[data-dup-pair]').first().click();
    await workspace.locator('#bcnDuplicateDecisionForm').waitFor({ state: 'visible' });
    await page.evaluate(async () => {
      const { previewAppearance } = await import('/assets/js/standalone/appearance.js');
      previewAppearance({ palette: 'charcoal', mode: 'light' });
    });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    await page.evaluate(() => window.NotificationPopup.getShared().reset());
    await page.screenshot({ path: folder + '/light.png', fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const fits = await workspace.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
      });
      assert.equal(fits, true, `Duplicate workspace fits at ${width}px`);
      await workspace.screenshot({ path: `${folder}/mobile-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(async () => {
      const { cancelAppearancePreview } = await import('/assets/js/standalone/appearance.js');
      cancelAppearancePreview();
    });
    check('Duplicate scan cancellation, resumption, light/dark appearance and 320–390px layouts work in Chrome');
  } catch (error) {
    await page.screenshot({ path: folder + '/failure.png', fullPage: true });
    console.error('DUPLICATE UI:', (await page.locator('#bcnDuplicatesWorkspace').innerText()).slice(0, 5000));
    throw error;
  } finally {
    await page.unroute('**/api/bao-cao-ngay/cases?*');
    await page.unroute('**/api/bao-cao-ngay/duplicates/candidates?*');
    await database.query('delete from daily_report_duplicate_decisions where case_id=any($1::uuid[]) '
      + 'or candidate_case_id=any($1::uuid[])', [ids]);
    await database.query('delete from daily_report_case_events where case_id=any($1::uuid[])', [ids]);
    await database.query("delete from daily_report_outbox where resource_type='CASE' and resource_id=any($1::text[])", [ids]);
    await database.query('delete from daily_report_cases where id=any($1::uuid[])', [ids]);
  }
}
