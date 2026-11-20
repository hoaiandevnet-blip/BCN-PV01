import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');

const root = fileURLToPath(new URL('../', import.meta.url));
const screenshotPath = '/Users/apple/.gemini/antigravity/brain/436da96b-9411-47a3-a44e-e5bbb07a82f2/approval_count_verified.png';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4310...');
  await page.goto('http://localhost:4310');

  await page.locator('#loginScreen').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#loginAccount').fill('demo.canbo01');
  await page.locator('#loginPassword').fill('123456');
  await page.locator('#loginForm button[type=submit]').click();

  await page.locator('#appShell').waitFor({ state: 'visible', timeout: 15000 });
  console.log('Logged in as demo.canbo01');

  // Check sidebar navigation item for approval
  const sidebarApprovalBtn = page.locator('#sidebar [data-bcn-view="approval"]');
  await sidebarApprovalBtn.waitFor({ state: 'visible', timeout: 10000 });

  const sidebarBadge = sidebarApprovalBtn.locator('[data-approval-badge]');
  await sidebarBadge.waitFor({ state: 'visible', timeout: 10000 });
  const sidebarCountText = (await sidebarBadge.textContent()).trim();
  console.log('Sidebar approval badge text:', sidebarCountText);
  assert.match(sidebarCountText, /^\d+$/, 'Sidebar approval badge must be strictly digits');
  assert.ok(Number(sidebarCountText) > 0, 'Sidebar approval count must be > 0');

  // Click on "Phê duyệt vụ việc"
  console.log('Clicking "Phê duyệt vụ việc" button...');
  await sidebarApprovalBtn.click();
  await page.waitForTimeout(1000);

  // Check #dailyReportCaseCount in approval view
  const caseCountEl = page.locator('#dailyReportCaseCount');
  await caseCountEl.waitFor({ state: 'visible', timeout: 10000 });
  const caseCountText = (await caseCountEl.textContent()).trim();
  console.log('#dailyReportCaseCount in approval view text:', caseCountText);
  assert.match(caseCountText, /^\d+$/, '#dailyReportCaseCount must be strictly digits (only number!)');
  assert.equal(caseCountText, sidebarCountText, '#dailyReportCaseCount must match sidebar badge');

  // Check #bcnApprovalTitleBadge in approval view
  const titleBadge = page.locator('#bcnApprovalTitleBadge');
  await titleBadge.waitFor({ state: 'visible', timeout: 10000 });
  const titleBadgeText = (await titleBadge.textContent()).trim();
  console.log('#bcnApprovalTitleBadge text:', titleBadgeText);
  assert.match(titleBadgeText, /^\d+$/, '#bcnApprovalTitleBadge must be strictly digits');
  assert.equal(titleBadgeText, sidebarCountText, '#bcnApprovalTitleBadge must match sidebar badge');

  // Take screenshot
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Saved screenshot to:', screenshotPath);

  await browser.close();
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
