import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { ensureApprovalSplit } from '../server/daily-reports/approval-schema.js';

export async function verifyApprovalPermissions({ request, login, admin, reporter, compiler,
  database, browser, base, password, output, check, errors }) {
  const api = '/api/bao-cao-ngay';
  const reporterScope = (await request(api + '/scope', { cookie: reporter })).data;
  const compilerScope = (await request(api + '/scope', { cookie: compiler })).data;
  const catalogue = (await request('/api/accounts', { cookie: admin })).data.permissions;
  const approval = catalogue.filter(item => item.module_key === 'dailyReportApproval');
  assert.equal(approval.length, 1);
  assert.equal(approval[0].name, 'Phê duyệt vụ việc');
  const permissionIds = catalogue.filter(item => ['dailyReports', 'dailyReportApproval'].includes(item.module_key))
    .map(item => Number(item.id));
  const username = 'verify.approval.' + Date.now();
  const created = await request('/api/accounts', { cookie: admin, method: 'POST', body: {
    username, password, full_name: 'Kiểm chứng quyền phê duyệt riêng', team_id: compilerScope.unitId,
    status: 'Hoạt động', is_admin: false, permission_ids: permissionIds
  } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const account = created.data;
  const granted = await request(api + '/user-roles', { cookie: admin, method: 'PUT', body: {
    user_id: account.id, role_code: 'PV01_COMPILER', unit_id: reporterScope.unitId, submodules: ['approval']
  } });
  assert.equal(granted.status, 201, JSON.stringify(granted.data));
  const contexts = [];
  const openPage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const [name, value] = cookie.split('=');
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await page.locator('#dashData[aria-busy=false]').waitFor();
    return page;
  };
  const folder = output + '/approval-split-20261117';
  await mkdir(folder, { recursive: true });
  try {
    const administrator = await openPage(admin);
    await administrator.locator('[data-page=accounts]').click();
    await administrator.locator(`[data-edit="${account.id}"]`).click();
    const editor = administrator.locator('dialog[open]');
    const checkbox = editor.getByRole('checkbox', { name: 'Phê duyệt vụ việc', exact: true });
    assert.equal(await checkbox.isChecked(), true);
    await checkbox.scrollIntoViewIfNeeded();
    await administrator.screenshot({ path: folder + '/account-permission.png' });
    await checkbox.uncheck();
    await editor.getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    let cookie = await login(username);
    assert.equal((await request(api + '/cases?workspace=approval', { cookie })).status, 403);
    assert.ok(!(await request(api + '/scope', { cookie })).data.compilerModules.includes('approval'));
    await ensureApprovalSplit(database);
    assert.equal((await request(api + '/cases?workspace=approval', { cookie })).status, 403);
    check('Approval appears in account permissions; revoking the checkbox blocks API access and survives schema reruns');

    await administrator.locator(`[data-edit="${account.id}"]`).click();
    await checkbox.check();
    await editor.getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    cookie = await login(username);
    const reviewer = await openPage(cookie);
    await reviewer.locator('#sidebar [data-bcn-view=approval]').click();
    await reviewer.locator('#dailyReports[data-bcn-active-view=approval]').waitFor();
    assert.equal(await reviewer.locator('#sidebar [data-bcn-view=registry]').isVisible(), false);
    const result = await request(api + '/cases?workspace=approval', { cookie });
    assert.equal(result.status, 200);
    assert.ok(result.data.cases.every(item => String(item.unit_id) === String(reporterScope.unitId)));
    const metrics = await request(api + '/work-results?workspace=approval', { cookie });
    assert.equal(metrics.status, 200);
    await reviewer.screenshot({ path: folder + '/approval-only.png' });
    await administrator.locator('#sidebar [data-bcn-view=permissions]').click();
    await administrator.locator('#bcnRoleRows [data-role-row]').first().waitFor();
    assert.equal(await administrator.locator('#bcnCompilerModules [value=approval]').count(), 1);
    check('Saving and signing in with Approval alone opens its workspace, with scoped case/work reads and a role assignment option');
  } finally {
    for (const context of contexts) await context.close();
  }
}
