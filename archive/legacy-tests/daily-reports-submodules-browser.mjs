import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

export async function runSubmoduleBrowser({ page, database, base, hash, password, checks }) {
  const output = 'outputs/bcn-submodules-qa';
  await mkdir(output, { recursive: true });
  const department = (await database.query(`insert into departments(name,unit_type)
    values('PV01 kiểm thử quyền mục con','Phòng') returning id`)).rows[0];
  const unit = (await database.query(`insert into teams(name,department_id)
    values('PV01 kiểm thử mục con',$1) returning id`, [department.id])).rows[0];
  const compiler = (await database.query(`insert into users(username,password_hash,full_name,team_id)
    values('qa-submodule-compiler',$1,'Cán bộ kiểm thử mục con',$2) returning id`, [hash, unit.id])).rows[0];
  await page.locator('[data-bcn-view="permissions"]').click();
  await page.locator('#bcnRolesLoad').click();
  await page.locator('#bcnRoleAccountSearch').fill('qa-submodule-compiler');
  await page.locator('#bcnRoleAccountOptions [role="option"]').first().click();
  await page.locator('#bcnRoleForm [name="role_code"]').selectOption('PV01_COMPILER');
  await page.locator('#bcnCompilerModules').waitFor({ state: 'visible' });
  for (const input of await page.locator('[name="compiler_module"]').all()) await input.uncheck();
  await page.locator('[name="compiler_module"][value="unlock"]').check();
  const granted = page.waitForResponse(response => response.url().endsWith('/user-roles')
    && response.request().method() === 'PUT');
  await page.locator('#bcnRoleForm button.primary').click();
  assert.equal((await granted).status(), 201);
  const stored = (await database.query('select submodules from daily_report_user_roles where user_id=$1',
    [compiler.id])).rows[0];
  assert.deepEqual(stored.submodules, ['unlock']);
  await page.locator('#bcnRoleForm').screenshot({ path: `${output}/grant-unlock-only.png` });

  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const compilerPage = await context.newPage();
  const errors = [];
  compilerPage.on('pageerror', error => errors.push(error.message));
  try {
    await compilerPage.goto(base);
    await compilerPage.locator('#loginAccount').fill('qa-submodule-compiler');
    await compilerPage.locator('#loginPassword').fill(password);
    await compilerPage.locator('#loginForm button[type="submit"]').click();
    await compilerPage.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await compilerPage.locator('#dailyReportNavToggle').click();
    await compilerPage.locator('[data-bcn-view="unlock"]').waitFor({ state: 'visible' });
    const visible = await compilerPage.locator('#dailyReportNavSubmenu [data-bcn-view]:visible')
      .evaluateAll(nodes => nodes.map(node => node.dataset.bcnView));
    assert.deepEqual(visible, ['unlock']);
    await compilerPage.locator('[data-bcn-view="unlock"]').click();
    await compilerPage.screenshot({ path: `${output}/compiler-unlock-only.png`, fullPage: true });
    assert.equal(await compilerPage.locator('#dailyReports').getAttribute('data-bcn-active-view'), 'unlock');
    assert.equal(await compilerPage.locator('#dailyReportUnlockRows').isVisible(), true);
    const denied = await context.request.get(base + '/api/bao-cao-ngay/drafts');
    assert.equal(denied.status(), 403);
    checks.push('PV01 assigned only Unlock sees and defaults to Unlock; direct composer navigation/API denied');

    const row = page.locator('[data-role-row]').filter({ hasText: 'qa-submodule-compiler' });
    await row.locator('[data-role-modules]').click();
    const dialog = page.locator('.bcn-action-dialog[open]');
    await dialog.locator('[name="module_registry"]').check();
    const saved = page.waitForResponse(response => response.url().endsWith('/user-roles')
      && response.request().method() === 'PUT');
    await dialog.locator('button[type="submit"]').click();
    assert.equal((await saved).status(), 201);
    await compilerPage.reload();
    await compilerPage.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
    await compilerPage.locator('#dailyReportNavToggle').click();
    await compilerPage.locator('[data-bcn-view="registry"]').waitFor({ state: 'visible' });
    assert.equal(await compilerPage.locator('[data-bcn-view="composer"]').isVisible(), false);
    checks.push('editing saved PV01 submodules persists and exposes Registry after permission refresh');

    const reporter = (await database.query(`insert into users(username,password_hash,full_name,team_id)
      values('qa-submodule-reporter',$1,'Đơn vị nhận yêu cầu bổ sung',$2) returning id`, [hash, unit.id])).rows[0];
    await database.query(`insert into daily_report_user_roles(user_id,role_code,unit_id)
      values($1,'UNIT_REPORTER',$2)`, [reporter.id, unit.id]);
    await database.query('insert into user_permissions select $1,id from permissions', [reporter.id]);
    const scope = await (await context.request.get(base + '/api/bao-cao-ngay/scope')).json();
    const caseId = randomUUID();
    await database.query(`insert into daily_report_cases
      (id,stable_code,title,unit_id,business_code,category_code,report_day,summary,current_state,created_by)
      values($1,$2,'QA yêu cầu bổ sung',$3,'TINH_HINH_KHAC','QA',$4,'Hồ sơ thử nghiệm','VERIFIED',$5)`,
    [caseId, 'QA-SUBMODULE-' + caseId, unit.id, scope.reportDay, reporter.id]);
    await compilerPage.locator('[data-bcn-view="registry"]').click();
    await compilerPage.locator(`[data-request-supplement="${caseId}"]`).click();
    const requestDialog = compilerPage.locator('.bcn-action-dialog[open]');
    await requestDialog.locator('[name="reason"]').fill('Đề nghị bổ sung biên bản và thời gian xảy ra.');
    const sent = compilerPage.waitForResponse(response => response.url().endsWith('/request-supplement'));
    await requestDialog.locator('button[type="submit"]').click();
    assert.equal((await sent).status(), 201);
    const outbox = (await database.query(`select recipient_unit_id,safe_payload from daily_report_outbox
      where resource_id=$1 and event_type='CASE_SUPPLEMENT_REQUESTED'`, [caseId])).rows;
    assert.equal(outbox.length, 1);
    assert.equal(String(outbox[0].recipient_unit_id), String(unit.id));
    assert.equal(outbox[0].safe_payload.reason, 'Đề nghị bổ sung biên bản và thời gian xảy ra.');
    checks.push('PV01 sends supplement request from actual registry action to the correct unit with content retained');
    const reporterContext = await page.context().browser().newContext();
    try {
      const reporterPage = await reporterContext.newPage();
      await reporterPage.goto(base);
      await reporterPage.locator('#loginAccount').fill('qa-submodule-reporter');
      await reporterPage.locator('#loginPassword').fill(password);
      await reporterPage.locator('#loginForm button[type="submit"]').click();
      await reporterPage.locator('#notificationToggle').waitFor({ state: 'visible' });
      await reporterPage.locator('#notificationToggle').click();
      await reporterPage.locator('[data-notification-kind="daily-report"]').click();
      const notice = reporterPage.locator('[data-notification-item]')
        .filter({ hasText: 'Đề nghị bổ sung biên bản và thời gian xảy ra.' });
      await notice.waitFor({ state: 'visible' });
      await reporterPage.screenshot({ path: `${output}/reporter-supplement-notice.png`, fullPage: true });
      await notice.locator('[data-notification-open]').click();
      await reporterPage.locator('#bcnDetail[open]').waitFor();
      assert.equal(await reporterPage.locator('#bcnDetail [name="title"]').inputValue(), 'QA yêu cầu bổ sung');
      const feed = await (await reporterContext.request.get(base + '/api/notifications')).json();
      assert.ok(feed.items.filter(item => item.kind === 'daily-report').every(item =>
        ['CASE_RETURNED', 'SOURCE_RETURNED', 'CASE_SUPPLEMENT_REQUESTED'].includes(item.eventType)));
      if (!scope.beforeCutoff) {
        const response = await reporterContext.request.post(base + '/api/bao-cao-ngay/unlock-requests', {
          data: { report_day: scope.reportDay, scope: { kind: 'CASE', id: caseId },
            reason: 'Xin mở lại hồ sơ để nhập thêm theo yêu cầu PV01' }
        });
        assert.equal(response.status(), 201);
        const request = await response.json();
        const compilerFeed = await (await context.request.get(base + '/api/notifications')).json();
        const notices = compilerFeed.items.filter(item => item.kind === 'daily-report');
        assert.ok(notices.every(item => item.eventType === 'UNLOCK_REQUESTED'));
        assert.ok(notices.some(item => item.dailyReportRef.resourceId === request.id));
      }
      checks.push('reporter globe displays PV01 supplement request and opens the exact case; feeds remain role-specific');
    } finally {
      await reporterContext.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
