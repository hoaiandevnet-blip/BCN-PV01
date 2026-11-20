import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function runPv01ChoiceBrowser({ page, database, base, hash, password, checks }) {
  const output = 'outputs/bcn-pv01-choice-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const department = (await database.query(`insert into departments(name,unit_type)
    values('Phòng kiểm thử phân công PV01','Phòng') returning id`)).rows[0];
  const unit = (await database.query(`insert into teams(name,department_id)
    values('PV01 kiểm thử chọn tài khoản',$1) returning id`, [department.id])).rows[0];
  const accounts = (await database.query(`insert into users(username,password_hash,full_name,team_id)
    values('qa-pv01-entry',$1,'PV01 chỉ nhập báo cáo',$2),
      ('qa-pv01-compiler',$1,'PV01 được chọn tổng hợp',$2),
      ('qa-pv01-unassigned',$1,'PV01 chưa được phân công',$2) returning id,username`, [hash, unit.id])).rows;
  const [entry, compiler, unassigned] = accounts;
  await database.query(`insert into user_permissions(user_id,permission_id)
    select $1,p.id from permissions p join modules m on m.id=p.module_id
    where m.module_key='dailyReports' on conflict do nothing`, [unassigned.id]);
  await page.reload();
  await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
  await page.locator('#dailyReportNavToggle').click();
  await page.locator('[data-bcn-view="permissions"]').click();
  if (!await page.locator('#bcnRoleManagement').evaluate(element => element.open)) {
    await page.locator('#bcnRoleManagement > summary').click();
  }
  await page.waitForFunction(() => document.querySelector('#bcnRoleAccountSearch').dataset.loaded === 'true');
  const role = page.locator('#bcnRoleForm [name="role_code"]');
  async function choose(account) {
    await page.locator('#bcnRoleAccountSearch').fill(account.username);
    await page.locator('#bcnRoleAccountOptions [role="option"]').first().click();
    assert.equal(await page.locator('#bcnRoleUser').inputValue(), String(account.id));
  }
  async function grant(account, code) {
    await choose(account);
    await role.selectOption(code);
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url().endsWith('/user-roles') && result.request().method() === 'PUT'),
      page.locator('#bcnRoleForm button.primary').click()
    ]);
    assert.equal(response.status(), 201);
    await page.locator('#bcnRoleRows [data-role-row]').filter({ hasText: account.username }).waitFor({ state: 'visible' });
  }
  await choose(entry);
  assert.equal(await role.inputValue(), 'UNIT_REPORTER');
  const available = await role.locator('option').evaluateAll(options => options.map(option => option.value));
  assert.ok(available.includes('UNIT_REPORTER') && available.includes('PV01_COMPILER'));
  assert.equal(await page.locator('#bcnRoleUnit').inputValue(), String(unit.id));
  assert.equal(await page.locator('#bcnRoleUnit').isDisabled(), true);
  await role.selectOption('PV01_COMPILER');
  assert.equal(await page.locator('#bcnRoleUnit').isDisabled(), false);
  assert.equal(await page.locator('#bcnRoleUnit').inputValue(), '');
  await choose(compiler);
  assert.equal(await role.inputValue(), 'UNIT_REPORTER', 'changing account must not carry over compiler selection');
  const before = await database.query(`select count(*)::int as count from daily_report_user_roles
    where user_id=any($1::bigint[])`, [accounts.map(account => account.id)]);
  assert.equal(before.rows[0].count, 0);
  checks.push('PV01 picker offers input and compilation; switching accounts resets the role without granting anything');
  await grant(entry, 'UNIT_REPORTER');
  await grant(compiler, 'PV01_COMPILER');
  await page.locator('#bcnRoleForm').screenshot({ path: `${output}/selected-compiler.png` });
  const assigned = (await database.query(`select user_id,role_code from daily_report_user_roles
    where user_id=any($1::bigint[]) order by user_id`, [accounts.map(account => account.id)])).rows;
  assert.deepEqual(assigned.map(item => [String(item.user_id), item.role_code]),
    [[String(entry.id), 'UNIT_REPORTER'], [String(compiler.id), 'PV01_COMPILER']]);
  checks.push('actual form grants reporting to one PV01 account and compilation only to the selected colleague');

  const contexts = [];
  const sessions = new Map();
  const errors = [];
  try {
    for (const account of accounts) {
      const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
      contexts.push(context);
      const memberPage = await context.newPage();
      sessions.set(account.username, memberPage);
      memberPage.on('pageerror', error => errors.push(error.message));
      await memberPage.goto(base);
      await memberPage.locator('#loginAccount').fill(account.username);
      await memberPage.locator('#loginPassword').fill(password);
      await memberPage.locator('#loginForm button[type="submit"]').click();
      await memberPage.locator('#appShell').waitFor({ state: 'visible' });
      const scope = await memberPage.request.get(`${base}/api/bao-cao-ngay/scope`);
      if (account.id === unassigned.id) {
        assert.equal(scope.status(), 403);
        assert.equal((await memberPage.request.get(`${base}/api/bao-cao-ngay/drafts`)).status(), 403);
        checks.push('another PV01 member with module access but no assigned role cannot compile');
        continue;
      }
      assert.equal(scope.status(), 200);
      assert.deepEqual((await scope.json()).roles,
        [account.id === entry.id ? 'UNIT_REPORTER' : 'PV01_COMPILER']);
      await memberPage.locator('#dailyReportNavToggle').click();
      await memberPage.locator('#dailyReports').waitFor({ state: 'visible' });
      if (account.id === entry.id) {
        await memberPage.locator('[data-bcn-view="input"]').click();
        assert.ok(await memberPage.locator('#dailyReportCaseForm').isVisible());
        assert.equal(await memberPage.locator('[data-bcn-view="composer"]').isVisible(), false);
        assert.equal((await memberPage.request.get(`${base}/api/bao-cao-ngay/drafts`)).status(), 403);
        await memberPage.screenshot({ path: `${output}/pv01-entry-account.png` });
        checks.push('PV01 reporter logs in to its entry form, without compilation menu or API access');
      } else {
        await memberPage.locator('[data-bcn-view="composer"]').click();
        const [response] = await Promise.all([
          memberPage.waitForResponse(result => result.url().includes('/composer/items?')),
          memberPage.locator('#bcnComposeLoad').click()
        ]);
        assert.equal(response.status(), 200);
        assert.ok(await memberPage.locator('#bcnDraftNew').isVisible());
        await memberPage.screenshot({ path: `${output}/pv01-compiler-account.png` });
        checks.push('selected PV01 compiler logs in and loads the real compilation screen');
      }
    }
    await page.locator('#bcnRoleListSearch').fill('PV01 chi nhap bao cao');
    assert.equal(await page.locator('#bcnRoleRows [data-role-row]:visible').count(), 1);
    assert.match(await page.locator('#bcnRoleRows [data-role-row]:visible').innerText(), /qa-pv01-entry/);
    await page.locator('#bcnRoleListSearch').fill('khong-co-tai-khoan-nao');
    assert.equal(await page.locator('#bcnRoleListEmpty').isVisible(), true);
    await page.locator('#bcnRoleListSearch').fill(compiler.username);
    assert.equal(await page.locator('#bcnRoleRows [data-role-row]:visible').count(), 1);
    const row = page.locator('#bcnRoleRows [data-role-row]').filter({ hasText: compiler.username });
    const [revoked] = await Promise.all([
      page.waitForResponse(result => result.url().endsWith('/user-roles') && result.request().method() === 'DELETE'),
      row.getByRole('button', { name: /^Thu hồi/ }).click()
    ]);
    assert.equal(revoked.status(), 200);
    await row.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#bcnRoleListEmpty').isVisible(), true);
    await page.locator('#bcnRoleListSearch').fill('');
    assert.equal((await sessions.get(compiler.username).request.get(`${base}/api/bao-cao-ngay/drafts`)).status(), 403);
    const entryScope = await sessions.get(entry.username).request.get(`${base}/api/bao-cao-ngay/scope`);
    assert.deepEqual((await entryScope.json()).roles, ['UNIT_REPORTER']);
    checks.push('revoking compilation blocks the existing session immediately and leaves the PV01 reporter unchanged');
    assert.deepEqual(errors, []);
  } finally {
    for (const context of contexts) await context.close();
  }
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start), errors }, null, 2));
}
