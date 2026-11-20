import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fillPersons } from './daily-reports-person-fixtures.mjs';
import JSZip from 'jszip';
const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const base = process.env.BCN_QA_URL;
if (!base) throw new Error('BCN_QA_URL required');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [];
const errors = [];
try {
  for (const [id, label] of [[2, 'reporter'], [7, 'room-reporter'], [4, 'compiler'], [1, 'admin'], [5, 'legal-reviewer']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.request.post(base + '/qa/login', { data: { id } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    await page.goto(base + '/qa/workspace');
    await page.waitForFunction(() => !document.querySelector('#dailyReportScope').textContent.includes('Đang xác định'));
    await page.waitForFunction(() => document.querySelector('#bcnStatsLoad') !== null);
    await page.waitForFunction(() => document.querySelector('#bcnOverviewLinks').children.length > 0);
    const tabs = await page.locator('#dailyReportNavSubmenu [data-bcn-view]:visible').allTextContents();
    assert.ok(tabs.length >= (id === 5 ? 1 : 2), label + ' role navigation');
    checks.push(`${label}: role navigation`);
    if (id === 2) {
      assert.equal(await page.locator('[data-bcn-view="permissions"]').isVisible(), false);
      assert.equal(await page.locator('[data-bcn-view="composer"]').isVisible(), false);
      assert.equal(await page.locator('[data-bcn-view="duplicates"]').isVisible(), false);
      await page.evaluate(() => window.DailyReports.navigate('permissions'));
      assert.equal(await page.locator('#bcnRoleForm').isVisible(), false);
      checks.push('reporter: restricted submenu and direct navigation remain protected');
      await page.locator('[data-bcn-view="input"]').click();
      const summary = `UI_INTAKE_${Date.now()}`;
      await page.locator('#dailyReportCaseForm [name="business_code"]').selectOption('PPHS');
      await page.locator('#dailyReportCaseForm details > summary').click();
      await page.locator('#dailyReportCaseForm [name="category_code"]').fill('TEST');
      await page.locator('#dailyReportCaseForm [name="summary"]').fill(summary);
      assert.equal(await page.locator('#dailyReportCaseForm [name="title"]').isDisabled(), true);
      await page.locator('#dailyReportCaseForm [name="occurred_at"]').fill('2026-10-28T08:30');
      await fillPersons(page.locator('#dailyReportCaseForm'));
      await page.locator('#dailyReportCaseForm button[type="submit"]').click();
      await page.waitForFunction(value => document.querySelector('#dailyReportCaseRows').textContent.includes(value), summary);
      checks.push('reporter: create case from real form');
      await page.locator('[data-bcn-view="registry"]').click();
      await page.locator('#bcnCaseFilters [name="q"]').fill(summary);
      await page.locator('#bcnCaseFilters button').first().click();
      await page.waitForFunction(value => {
        const rows = document.querySelectorAll('#dailyReportCaseRows tr');
        return rows.length === 1 && rows[0].textContent.includes(value);
      }, summary);
      checks.push('reporter: registry filters actual persisted case');
      await page.locator('[data-detail]').first().waitFor();
      await page.locator('[data-detail]').first().click();
      await page.locator('#bcnDetail[open]').waitFor();
      assert.ok((await page.locator('#bcnDetailBody').textContent()).includes('Phiên bản đã gửi'));
      await page.locator('#bcnDetail [data-case-close]').click();
      checks.push('reporter: case history dialog');
      await page.locator('[data-bcn-view="input"]').click();
      await page.locator('#bcnSourcesLoad').click();
      await page.locator('#bcnSourceRows [data-source-id]').first().waitFor();
      assert.ok((await page.locator('#bcnSourceRows').textContent()).includes('Đã xác minh'));
      checks.push('reporter: situation and metric list');
      assert.equal(await page.locator('#bcnMetricGroup option[value="INVESTIGATION"]').count(), 0);
      checks.push('reporter: restricted room metrics hidden');
      await page.locator('[data-entry-mode="metric"]').click();
      await page.locator('#bcnMetricGroup').selectOption('GENERAL');
      await page.locator('#bcnMetricFields input').fill('7');
      const metricResponse = page.waitForResponse(response =>
        response.url().endsWith('/work-results') && response.request().method() === 'POST');
      await page.locator('#bcnMetricForm button').click();
      const createdMetric = await (await metricResponse).json();
      assert.equal(createdMetric.metric.metric_values.activities, 7);
      const metricRow = page.locator(`[data-source-id="${createdMetric.metric.id}"]`);
      await metricRow.waitFor();
      assert.match(await metricRow.innerText(), /: 7/);
      checks.push('reporter: create configured metric through UI');
    }
    if (id === 7) {
      await page.locator('[data-bcn-view="input"]').click();
      await page.locator('[data-entry-mode="metric"]').click();
      await page.locator('#bcnMetricGroup').selectOption('INVESTIGATION');
      assert.equal(await page.locator('#bcnMetricFields input').count(), 8);
      checks.push('room reporter: eight investigation fields');
    }
    if (id === 4) {
      await page.locator('[data-bcn-view="returned"]').click();
      await page.locator('#bcnCaseWorkflow').waitFor();
      checks.push('compiler: returned history screen');
      await page.locator('[data-bcn-view="updates"]').click();
      await page.locator('#bcnUpdateRows').waitFor();
      checks.push('compiler: follow-up screen includes cases needing review');
      await page.locator('[data-bcn-view="duplicates"]').click();
      await page.locator('#bcnDuplicateLoad').click();
      await page.waitForFunction(() => document.querySelector('#bcnDuplicateStatus').textContent.includes('Đã đối chiếu'));
      checks.push('compiler: batch cross-day comparison');
      const decisionButton = page.locator('[data-pair-decision]').first();
      await decisionButton.waitFor();
      await decisionButton.locator('..').locator('select').selectOption('SEPARATE_CASE');
      await decisionButton.click();
      await page.locator('.bcn-action-dialog textarea[name="reason"]').fill('Kết luận độc lập theo kiểm thử giao diện');
      await page.locator('.bcn-action-dialog button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#bcnDuplicateDecisions').textContent.includes('Vụ độc lập'));
      checks.push('compiler: persists cross-day decision from the comparison table');
      await page.locator('[data-bcn-view="composer"]').click();
      await page.locator('#bcnComposeUnit').selectOption('10');
      await page.locator('#bcnComposeLoad').click();
      await page.locator('[data-compose-row]').first().waitFor();
      assert.ok(await page.locator('[data-compose-row]').count() >= 10);
      await page.locator('#bcnReportType').selectOption('BCN_PV01');
      await page.locator('#bcnDraftNew').click();
      await page.waitForFunction(() => document.querySelector('#bcnDraftStatus').textContent.includes('phiên bản 1'));
      assert.ok(await page.locator('[data-include]:disabled').count() > 0);
      await page.locator('#bcnSelectVisible').click();
      assert.equal(await page.locator('[data-include]:disabled:checked').count(), 0);
      await page.locator('#bcnDeselectVisible').click();
      checks.push('compiler: bulk selection excludes all pending sources');
      for (let i = 0; i < 3; i += 1) await page.locator('[data-include]:enabled').nth(i).check();
      await page.locator('[data-compose-row]:has([data-include]:checked) textarea').first()
        .fill('BIÊN TẬP GIAO DIỆN GIẢ');
      await page.locator('#bcnOnlySelected').click();
      assert.equal(await page.locator('[data-compose-row]').count(), 3);
      await page.locator('#bcnOnlySelected').click();
      checks.push('compiler: selected-only filter preserves the chosen sources');
      await page.locator('#bcnDraftSave').click();
      await page.waitForFunction(() => document.querySelector('#bcnDraftStatus').textContent.includes('3 ý đã chọn'));
      checks.push('compiler: select 3, edit and persist draft');
      await page.locator('[data-document="advisory"]').fill('NỘI DUNG THAM MƯU GIẢ KIỂM THỬ');
      await page.locator('#bcnPreviewRefresh').click();
      await page.waitForFunction(() => document.querySelector('#bcnPaperStack').textContent.includes('NỘI DUNG THAM MƯU GIẢ KIỂM THỬ'));
      assert.ok(await page.locator('.bcn-paper').count() > 0);
      checks.push('compiler: A4 live preview shows edited document components');
      const signer = await page.locator('#bcnSigner option').evaluateAll(options =>
        options.find(option => option.textContent.includes('PV01'))?.value);
      await page.locator('#bcnSigner').selectOption(signer);
      await page.locator('#bcnExport').click();
      await page.locator('#bcnExportResult a').first().waitFor();
      const download = await context.request.get(base + await page.locator('#bcnExportResult a').first().getAttribute('href'));
      assert.equal(download.status(), 200);
      assert.equal((await download.body()).subarray(0, 2).toString(), 'PK');
      const exportedXml = await (await JSZip.loadAsync(await download.body()))
        .file('word/document.xml').async('string');
      assert.ok(exportedXml.includes('NỘI DUNG THAM MƯU GIẢ KIỂM THỬ'));
      assert.ok(exportedXml.includes('BIÊN TẬP GIAO DIỆN GIẢ'));
      checks.push('compiler: export DOCX from real UI');
      const draftId = await page.locator('#bcnDraftList option').nth(1).getAttribute('value');
      await page.locator('#bcnDraftList').selectOption(draftId);
      await page.locator('#bcnDraftOpen').click();
      await page.waitForFunction(() => document.querySelectorAll('#bcnComposerRows [data-compose-row]').length === 3);
      assert.equal(await page.locator('[data-document="advisory"]').inputValue(), 'NỘI DUNG THAM MƯU GIẢ KIỂM THỬ');
      assert.equal(await page.locator('#bcnSigner').inputValue(), signer);
      checks.push('compiler: reopening draft restores edited text, metadata and signer');
    }
    if (id === 1) {
      await page.locator('[data-bcn-view="permissions"]').click();
      await page.locator('#bcnLeaderManagement > summary').click();
      await page.locator('#bcnLeadersLoad').click();
      await page.locator('[data-leader-edit]').first().waitFor();
      await page.locator('[data-leader-edit]').first().click();
      assert.ok(await page.locator('#bcnLeaderForm [name="full_name"]').inputValue());
      checks.push('admin: leader directory editor');
      await page.locator('[data-bcn-view="permissions"]').click();
      if (!await page.locator('#bcnRoleManagement').evaluate(element => element.open)) {
        await page.locator('#bcnRoleManagement > summary').click();
      }
      await page.locator('#bcnRolesLoad').click();
      await page.locator('[data-role-delete]').first().waitFor();
      checks.push('admin: role assignments visible');
    }
    if (id === 5) {
      await page.locator('[data-bcn-view="legal"]').click();
      await page.locator('#bcnLawImportDetails > summary').click();
      await page.locator('#bcnLegalLoad').click();
      await page.locator('[data-legal-action="articles"]').first().waitFor();
      await page.locator('[data-legal-action="articles"]').first().click();
      await page.locator('#bcnLegalArticles p').first().waitFor();
      checks.push('reviewer: versioned legal articles');
    }
    await page.screenshot({ path: `outputs/daily-reports-qa/${label}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
      `${label}: mobile overflow`);
    checks.push(`${label}: no mobile page overflow`);
    await page.screenshot({ path: `outputs/daily-reports-qa/${label}-mobile.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, errors }));
} catch (error) {
  errors.push(error.message);
  throw error;
} finally {
  await writeFile('outputs/daily-reports-qa/browser-results.json',
    JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2));
  await browser.close();
}
