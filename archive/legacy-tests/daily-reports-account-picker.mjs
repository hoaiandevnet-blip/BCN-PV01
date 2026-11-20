import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Use only the disposable database created by daily-reports-main-app.mjs.
export async function runAccountPickerChecks({ page, database, hash, checks }) {
  const output = 'outputs/bcn-account-picker-qa';
  await mkdir(output, { recursive: true });
  const start = checks.length;
  const department = (await database.query(`insert into departments(name,unit_type)
    values('Đơn vị kiểm thử gợi ý','Phòng') returning id`)).rows[0];
  const units = (await database.query(`insert into teams(name,department_id)
    values('PV01 thử gợi ý',$1),('PC02 thử gợi ý',$1) returning id,name`, [department.id])).rows;
  const accounts = (await database.query(`insert into users(username,password_hash,full_name,team_id)
    values('qa-picker.an',$1,'Nguyễn Văn An',$2),('qa-picker.anh',$1,'Nguyễn Văn Anh',$3),
      ('qa-picker.binh',$1,'Đặng Thị Bình',$2) returning id,username`, [hash, units[0].id, units[1].id])).rows;
  const accountId = username => String(accounts.find(item => item.username === username).id);
  await page.reload();
  await page.locator('#dailyReportNavToggle').waitFor({ state: 'visible' });
  await page.locator('#dailyReportNavToggle').click();
  await page.locator('[data-bcn-view="permissions"]').click();
  if (!await page.locator('#bcnRoleManagement').evaluate(element => element.open)) {
    await page.locator('#bcnRoleManagement > summary').click();
  }
  await page.waitForFunction(() => document.querySelector('#bcnRoleAccountSearch').dataset.loaded === 'true');
  const input = page.locator('#bcnRoleAccountSearch');
  const options = page.locator('#bcnRoleAccountOptions [role="option"]');
  const hidden = page.locator('#bcnRoleUser');
  const panel = page.locator('#bcnRoleAccountPanel');
  assert.equal(await hidden.inputValue(), '');
  assert.equal(await hidden.isVisible(), false);
  await input.fill('Nguyen van an');
  assert.equal(await options.count(), 2);
  assert.match(await options.first().innerText(), /qa-picker.an\s+PV01 thử gợi ý\s+Nguyễn Văn An/);
  assert.match(await options.last().innerText(), /PC02 thử gợi ý/);
  const coverage = await options.first().evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const ancestors = [];
    for (let node = element.parentElement; node && ancestors.length < 9; node = node.parentElement) {
      const style = getComputedStyle(node);
      ancestors.push({ id: node.id, className: node.className, overflow: style.overflow,
        position: style.position, zIndex: style.zIndex });
    }
    return { visible: element.contains(hit), hit: hit?.outerHTML.slice(0, 180), ancestors };
  });
  await writeFile(`${output}/suggestion-coverage.json`, JSON.stringify(coverage, null, 2));
  assert.equal(coverage.visible, true, 'upward suggestions are not clipped or covered by the surrounding panels');
  await page.screenshot({ path: `${output}/desktop-suggestions.png` });
  checks.push('account picker loads on opening assignments and finds full names without Vietnamese accents');

  const writes = [];
  const observe = request => {
    if (request.method() === 'PUT' && request.url().endsWith('/user-roles')) writes.push(request.postDataJSON());
  };
  page.on('request', observe);
  try {
    await input.press('ArrowDown');
    await input.press('Enter');
    assert.equal(await hidden.inputValue(), accountId('qa-picker.an'));
    assert.equal(await panel.isVisible(), false);
    assert.equal(writes.length, 0, 'selecting a suggestion does not submit the role form');
    checks.push('keyboard arrows and Enter select the correct account ID without assigning a role');

    await input.fill('tai khoan khong ton tai');
    assert.equal(await hidden.inputValue(), '', 'editing the selected label clears the previous account ID');
    assert.equal(await options.count(), 0);
    assert.match(await page.locator('#bcnRoleAccountStatus').innerText(), /Không tìm thấy/);
    await page.locator('#bcnRoleForm [name="role_code"]').selectOption('AUDITOR');
    assert.equal(await page.locator('#bcnRoleForm button.primary').isDisabled(), true);
    assert.equal(await input.evaluate(element => element.validity.valid), false);
    assert.equal(writes.length, 0, 'unselected free text cannot submit the previous account ID');
    const before = await database.query('select count(*)::int as count from daily_report_user_roles where user_id=$1',
      [accountId('qa-picker.an')]);
    assert.equal(before.rows[0].count, 0);
    checks.push('unknown or edited free text cannot accidentally assign permissions to the previous selection');

    await input.fill('dang thi binh');
    assert.equal(await options.count(), 1);
    await options.first().click();
    assert.equal(await hidden.inputValue(), accountId('qa-picker.binh'));
    await page.locator('#bcnRoleForm [name="role_code"]').selectOption('AUDITOR');
    await page.locator('#bcnRoleUnit').selectOption('');
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url().endsWith('/user-roles') && result.request().method() === 'PUT'),
      page.locator('#bcnRoleForm').getByRole('button', { name: 'Cấp vai trò', exact: true }).click()
    ]);
    assert.equal(response.status(), 201);
    assert.equal(String((await response.json()).role.user_id), accountId('qa-picker.binh'));
    const role = page.locator('#bcnRoleRows [data-role-row]').filter({ hasText: 'qa-picker.binh' });
    await role.waitFor({ state: 'visible' });
    assert.equal(await hidden.inputValue(), accountId('qa-picker.binh'), 'reload keeps the selected account');
    const saved = await database.query('select user_id,role_code from daily_report_user_roles where user_id=$1',
      [accountId('qa-picker.binh')]);
    assert.equal(saved.rows[0].role_code, 'AUDITOR');
    await Promise.all([
      page.waitForResponse(result => result.url().endsWith('/user-roles') && result.request().method() === 'DELETE'),
      role.getByRole('button', { name: /^Thu hồi/ }).click()
    ]);
    await role.waitFor({ state: 'detached' });
    checks.push('mouse selection grants the chosen fixture account only, preserves selection and supports revocation');

    await input.fill('PC02 thu goi y');
    assert.equal(await options.count(), 1);
    assert.match(await options.first().innerText(), /qa-picker.anh/);
    await options.first().click();
    await page.locator('#bcnRoleAccountClear').click();
    assert.equal(await hidden.inputValue(), '');
    assert.equal(await input.inputValue(), '');
    await input.fill('qa-picker.anh');
    assert.equal(await options.count(), 1);
    await input.press('Escape');
    assert.equal(await panel.isVisible(), false);
    checks.push('username and unit lookup, clear selection and Escape work without changing assignments');

    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await input.scrollIntoViewIfNeeded();
    await input.fill('PV01 thu goi y');
    assert.equal(await options.count(), 2);
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'suggestions fit phone width');
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 845, 'suggestions fit phone height');
    await page.screenshot({ path: `${output}/mobile-suggestions.png` });
    await options.last().click();
    assert.equal(await hidden.inputValue(), accountId('qa-picker.binh'));
    await page.setViewportSize(viewport);
    checks.push('suggestions remain readable, inside the viewport and selectable on a phone');
  } finally {
    page.off('request', observe);
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(),
    checks: checks.slice(start), roleAssignments: writes }, null, 2));
}
