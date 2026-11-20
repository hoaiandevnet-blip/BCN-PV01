import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { runComposerLayoutChecks } from './daily-reports-composer-layout.mjs';
import { runFormattingBrowser } from './daily-reports-formatting-browser.mjs';

// Runs only against the disposable database created by daily-reports-main-app.mjs.
export async function runReferenceUI({ page, database, base, checks, userId }) {
  const output = 'outputs/bcn-reference-interface-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const scopeResponse = await page.request.get(`${base}/api/bao-cao-ngay/scope`);
  const scope = await scopeResponse.json();
  const reporter = (await database.query(`select id,team_id from users
    where username='qa-notification-reporter'`)).rows[0];
  const unit = reporter.team_id;
  await database.query('update users set team_id=$1 where id=$2', [unit, userId]);
  await database.query(`insert into daily_report_user_roles(user_id,role_code,unit_id)
    values($1,'UNIT_REPORTER',$2)`, [userId, unit]);
  for (const [index, state, business] of [[1, 'VERIFIED', 'PPHS'], [2, 'PENDING_REVIEW', 'TINH_HINH_KHAC']]) {
    await database.query(`insert into daily_report_cases
      (id,stable_code,title,unit_id,business_code,category_code,report_day,summary,current_state,
        created_by,external_reference,location_general)
      values($1,$2,$3,$4,$5,'QA',$6,$7,$8,$9,'HS-QA-REFERENCE','Địa điểm kiểm thử')`,
    [randomUUID(), `QA-REF-${index}`, `Vụ việc kiểm thử bố cục ${index}`, unit, business, scope.reportDay,
      'Nội dung giả để kiểm tra cách hiển thị hồ sơ, thông tin bổ sung và bảng tra cứu.', state, reporter.id]);
  }
  await database.query(`insert into daily_report_metrics
    (id,unit_id,report_day,metric_code,metric_values,state,created_by)
    values($1,$2,$3,'GENERAL','{"activities":7}','VERIFIED',$4)`,
  [randomUUID(), unit, scope.reportDay, reporter.id]);
  const legalId = randomUUID();
  await database.query(`insert into daily_report_legal_versions
    (id,title,document_number,source_uri,checksum,status,imported_by,effective_from)
    values($1,'Danh mục kiểm thử giao diện – không có giá trị pháp luật','QA-UI',
      'https://example.invalid/qa','qa-ui','PUBLISHED',$2,$3)`, [legalId, userId, scope.reportDay]);
  for (const number of ['QA1', 'QA2']) {
    await database.query(`insert into daily_report_legal_articles
      (id,version_id,article_code,title,business_codes,article_text)
      values($1,$2,$3,$4,'["PPHS"]','Nội dung điều luật giả dùng riêng cho kiểm thử giao diện.')`,
    [randomUUID(), legalId, number, `Điều ${number} – dữ liệu giả`]);
  }
  await page.reload();
  await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
  await page.locator('#dailyReportNavToggle').click();
  await page.locator('[data-bcn-view="input"]').waitFor({ state: 'visible' });
  await page.locator('#dailyReportCaseForm').waitFor({ state: 'visible' });

  // Read both states in one frame so sidebar hover transitions cannot advance between samples.
  const outsideStyles = await page.evaluate(() => {
    const outside = () => [...document.querySelectorAll(
      '#mainSidebar, #mainSidebar .nav-item, .topbar, .topbar button, #staffDirectory .card, #staffDirectory input'
    )].map(element => {
      const style = getComputedStyle(element);
      return ['background', 'color', 'border', 'borderRadius', 'font', 'padding', 'boxShadow', 'display']
        .map(property => style[property]);
    });
    const sheet = document.querySelector('link[href*="daily-reports-reference.css"]').sheet;
    const withReference = outside();
    sheet.disabled = true;
    try {
      return { withReference, withoutReference: outside() };
    } finally {
      sheet.disabled = false;
    }
  });
  assert.deepEqual(outsideStyles.withoutReference, outsideStyles.withReference);
  const unscoped = await page.evaluate(() => {
    const sheet = document.querySelector('link[href*="daily-reports-reference.css"]').sheet;
    const invalid = [];
    const inspect = rules => [...rules].forEach(rule => {
      if (rule.selectorText && rule.selectorText.split(',').some(value => !value.trim().startsWith('#dailyReports'))) {
        invalid.push(rule.selectorText);
      }
      if (rule.cssRules) inspect(rule.cssRules);
    });
    inspect(sheet.cssRules);
    return invalid;
  });
  assert.deepEqual(unscoped, []);
  checks.push('reference styles are confined to BCN; computed sidebar, topbar and staff UI styles remain identical');
  await page.locator('[data-bcn-view="registry"]').click();
  await page.waitForFunction(() => document.querySelector('#dailyReports').dataset.bcnActiveView === 'registry');
  const palette = await page.evaluate(() => {
    const get = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
    return { background: get('#dailyReports', 'backgroundColor'), card: get('#dailyReports .card', 'backgroundColor'),
      primary: get('#bcnPageActions .primary', 'backgroundImage'),
      table: get('#bcnRegistryList th', 'backgroundColor') };
  });
  assert.equal(palette.background, 'rgb(242, 244, 248)');
  assert.equal(palette.card, 'rgb(255, 255, 255)');
  assert.match(palette.primary, /167, 104, 36/);
  assert.equal(palette.table, 'rgb(245, 247, 251)');
  checks.push('actual Chrome colors match reference grey background, white cards, gold buttons and pale table headers');

  const navigate = async view => {
    await page.locator(`[data-bcn-view="${view}"]`).click();
    await page.waitForFunction(value => document.querySelector('#dailyReports').dataset.bcnActiveView === value, view);
  };
  const dismissPopup = async () => {
    const close = page.locator('.notification-popup-close:visible').first();
    if (!await close.isVisible()) return;
    try {
      await close.click({ timeout: 1000 });
    } catch (error) {
      // The notification also closes automatically; only ignore that specific race.
      if (await close.isVisible()) throw error;
    }
  };
  const capture = async view => {
    await dismissPopup();
    await page.locator('#dailyReports').evaluate(element => element.closest('.main').scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${view}-top.png` });
    const panes = page.locator('#dailyReports [data-bcn-pane]:visible');
    await panes.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${view}-content.png` });
    await panes.last().evaluate(element => {
      const container = element.closest('.main');
      container.scrollTop = container.scrollHeight;
    });
    await page.screenshot({ path: `${output}/${view}-bottom.png` });
  };
  const views = ['input', 'registry', 'legal', 'returned', 'updates', 'unlock',
    'duplicates', 'composer', 'permissions', 'history'];
  for (const view of views) {
    await navigate(view);
    if (view === 'input') {
      assert.equal(await page.locator('[data-entry-mode]:visible').count(), 2);
      await page.locator('#dailyReportCaseForm').waitFor({ state: 'visible' });
      const columns = await page.locator('#dailyReportCaseForm').evaluate(element =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, 3);
      await page.locator('#bcnSourcesLoad').click();
      await page.locator('#bcnSourceRows [data-source-id]').first().waitFor();
      assert.equal(await page.locator('#bcnSourceRows th').count(), 6);
      await capture('input-case');
      await page.locator('[data-entry-mode="metric"]').click();
      await page.locator('#bcnMetricForm').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#bcnMetricUnitLabel').inputValue(), 'Đơn vị QA thông báo');
      await capture('input-metric');
      await page.locator('[data-entry-mode="case"]').click();
      await page.locator('[data-classification-petition]').click();
      await page.locator('#bcnSituationForm').waitFor({ state: 'visible' });
      await capture('input-petition');
      await page.locator('[data-entry-mode="case"]').click();
    } else if (view === 'registry' || view === 'returned') {
      assert.equal(await page.locator('#bcnRegistryFilters').isVisible(), view === 'registry');
      assert.equal(await page.locator('#bcnRegistryList th').count(), 7);
    } else if (view === 'legal') {
      await page.locator('[data-law-detail]').first().waitFor();
      assert.equal(await page.locator('#bcnLegalMetrics .bcn-kpi').count(), 4);
      assert.equal(await page.locator('#bcnLawResults th').count(), 4);
      assert.equal(await page.locator('#bcnPetitionCatalog > div').count(), 6);
      await page.locator('#bcnLegalSearch [name="q"]').fill('QA2');
      await page.locator('#bcnLegalSearch button').first().click();
      await page.waitForFunction(() => document.querySelectorAll('[data-law-detail]').length === 1);
      assert.match(await page.locator('#bcnLawResults').innerText(), /QA2/);
      await page.locator('[data-law-detail]').click();
      await page.locator('#bcnDetail[open]').waitFor();
      assert.match(await page.locator('#bcnDetailBody').innerText(), /Nội dung điều luật giả/);
      await page.locator('#bcnDetailClose').click();
    } else if (view === 'updates') {
      await page.locator('#bcnUpdateRows [data-detail]').first().waitFor();
      assert.equal(await page.locator('#bcnRegistryList').isVisible(), false);
      assert.equal(await page.locator('#bcnUpdatesColumns > .card').count(), 2);
    } else if (view === 'unlock') {
      assert.equal(await page.locator('#dailyReportUnlockRows th').count(), 5);
    } else if (view === 'duplicates') {
      await page.locator('#bcnDuplicateLoad').click();
      await page.waitForFunction(() => document.querySelector('#bcnDuplicateStatus').textContent.startsWith('Đã đối chiếu'));
      assert.equal(await page.locator('#bcnDuplicatePairs table').first().locator('th').count(), 5);
      assert.equal(await page.locator('#bcnDuplicatePairs table').count(), 1);
    } else if (view === 'composer') {
      await page.locator('#bcnComposeLoad').click();
      await page.locator('[data-compose-row]').first().waitFor();
      assert.equal(await page.locator('.bcn-composer-toolbar > label').count(), 6);
      assert.ok(await page.locator('.bcn-composer-group-title').count() > 0);
      assert.equal(await page.locator('#bcnComposerMetrics .bcn-kpi').count(), 4);
      await page.locator('#bcnSelectVisible').click();
      assert.ok(await page.locator('[data-include]:checked').count() > 0);
      await page.locator('#bcnPreviewRefresh').click();
      await page.locator('#bcnPaperStack .bcn-paper').first().waitFor();
      await runComposerLayoutChecks({ page, checks });
      await runFormattingBrowser({ page, base, checks });
    } else if (view === 'permissions') {
      assert.equal(await page.locator('#bcnPermissionMatrix th').count(), 4);
      assert.equal(await page.locator('#bcnPermissionMatrix tbody tr').count(), 7);
      assert.equal(await page.locator('#bcnRoleManagement').evaluate(element => element.open), true);
      assert.equal(await page.locator('#bcnPermissionReference').evaluate(element => element.open), false);
      await page.locator('#bcnPermissionReference > summary').click();
      assert.equal(await page.locator('#bcnPermissionMatrix').isVisible(), true);
      assert.equal(await page.locator('#bcnPermissionGuides').isVisible(), true);
      await capture('permissions-guidance');
      await page.locator('#bcnPermissionReference > summary').click();
    } else if (view === 'history') {
      await page.locator('#bcnAuditLoad').click();
      await page.locator('#bcnAuditRows article').first().waitFor();
      assert.equal(await page.locator('#bcnNotificationRows').count(), 0);
    }
    await capture(view);
    checks.push(`${view}: reference layout and real data controls verified in main application`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of views) {
    // Exercise the same router without changing the mobile sidebar's already-covered interaction.
    await page.evaluate(value => window.DailyReports.navigate(value), view);
    await dismissPopup();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), view);
    await page.screenshot({ path: `${output}/${view}-mobile.png` });
  }
  checks.push('all ten BCN operational pages fit mobile viewport without document horizontal overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (await page.locator('#dailyReportNavToggle').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#dailyReportNavToggle').click();
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(), palette,
    checks: checks.slice(start) }, null, 2));
}
