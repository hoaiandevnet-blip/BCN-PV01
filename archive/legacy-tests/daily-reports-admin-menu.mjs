import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runAdminMenu({ page, database, base, userId, checks }) {
  const output = 'outputs/bcn-admin-menu-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const menu = page.locator('#dailyReportNavSubmenu');
  const scope = await (await page.request.get(`${base}/api/bao-cao-ngay/scope`)).json();
  assert.equal(scope.isAdmin, true);
  for (const role of ['UNIT_REPORTER', 'PV01_COMPILER', 'LEGAL_REVIEWER', 'AUDITOR']) {
    assert.ok(scope.roles.includes(role));
  }
  assert.equal(scope.roles.includes('BCN_ADMIN'), false);
  const stored = await database.query('select count(*)::int as count from daily_report_user_roles where user_id=$1',
    [userId]);
  assert.equal(stored.rows[0].count, 0);
  checks.push('system Admin inherits all business capabilities without a stored BCN administrator assignment');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-bcn-view]')]
    .filter(button => !button.hidden).length === 10);
  assert.equal(await menu.locator('[data-bcn-access="required"]').count(), 0);
  for (const view of ['input', 'registry', 'returned', 'updates', 'unlock', 'duplicates', 'composer']) {
    await menu.locator(`[data-bcn-view="${view}"]`).click();
    assert.equal(await page.locator('#dailyReports').getAttribute('data-bcn-active-view'), view);
    assert.equal(await page.locator('#bcnAccessRequired').isVisible(), false);
  }
  checks.push('all ten Admin operational menu entries are enabled, with no role warning');
  const response = await page.request.get(`${base}/api/bao-cao-ngay/cases`);
  assert.equal(response.status(), 200);
  await page.locator('#bcnComposeLoad').waitFor({ state: 'visible' });
  checks.push('unassigned Admin can read cases and open the actual report composer');
  await menu.locator('[data-bcn-view="permissions"]').click();
  if (!await page.locator('#bcnRoleManagement').evaluate(element => element.open)) {
    await page.locator('#bcnRoleManagement > summary').click();
  }
  await page.waitForFunction(() => document.querySelector('#bcnRoleAccountSearch').dataset.loaded === 'true');
  const roleOptions = await page.locator('#bcnRoleForm [name="role_code"] option').allTextContents();
  assert.ok(roleOptions.includes('Đơn vị nhập báo cáo'));
  assert.ok(!roleOptions.some(label => /Quản trị|BCN_ADMIN/.test(label)));
  await page.locator('#bcnRoleAccountSearch').fill('admin');
  await page.locator('#bcnRoleAccountOptions [role="option"]').first().click();
  assert.equal(await page.locator('#bcnRoleForm button.primary').isDisabled(), true);
  assert.match(await page.locator('#bcnRoleEligibility').innerText(), /đã có toàn quyền/);
  checks.push('role picker excludes BCN administrator and explains inherited Admin privileges');
  await page.locator('#bcnRoleForm').screenshot({ path: `${output}/admin-full-access.png` });
  await page.locator('#bcnRoleAccountClear').click();
  await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start) }, null, 2));
}
