import assert from 'node:assert/strict';

export async function verifyAccounts({ request, admin, reporter, compiler, page, password,
  database, output, check, login }) {
  const listing = await request('/api/accounts', { cookie: admin });
  const currentId = listing.data.current_account_id;
  const create = async suffix => {
    const result = await request('/api/accounts', { cookie: admin, method: 'POST', body: {
      username: `verify.delete.${suffix}`, full_name: `Kiểm chứng xóa ${suffix}`, password,
      status: 'Hoạt động', permission_ids: []
    } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data;
  };
  const single = await create('single');
  const batch = [await create('batch1'), await create('batch2')];
  const atomic = await create('atomic');
  const singleSession = await login(single.username);
  const batchSession = await login(batch[0].username);
  const { rows: [history] } = await database.query(`insert into daily_report_audit
    (actor_id,action,resource_type,outcome) values($1,'VERIFY_ACCOUNT_HISTORY','REQUEST','ALLOW') returning id`,
  [single.id]);
  for (const cookie of ['', reporter, compiler]) {
    const expected = cookie ? 403 : 401;
    assert.equal((await request(`/api/accounts/${single.id}`, { cookie, method: 'DELETE' })).status, expected);
    assert.equal((await request('/api/accounts/bulk-delete', {
      cookie, method: 'POST', body: { ids: [single.id] }
    })).status, expected);
  }
  assert.equal((await request(`/api/accounts/${single.id}`, { cookie: admin, method: 'DELETE',
    headers: { origin: 'https://invalid.example' } })).status, 403);
  assert.equal((await request('/api/accounts/bulk-delete', { cookie: admin, method: 'POST',
    headers: { origin: 'https://invalid.example' }, body: { ids: [single.id] } })).status, 403);
  for (const ids of [[], null, '1', [0], ['bad'], ['9223372036854775808'], Array(101).fill(single.id)]) {
    assert.equal((await request('/api/accounts/bulk-delete', {
      cookie: admin, method: 'POST', body: { ids }
    })).status, 422);
  }
  assert.equal((await request('/api/accounts/not-an-id', { cookie: admin, method: 'DELETE' })).status, 422);
  assert.equal((await request(`/api/accounts/${currentId}`, { cookie: admin, method: 'DELETE' })).status, 422);
  assert.equal((await request('/api/accounts/bulk-delete', { cookie: admin, method: 'POST',
    body: { ids: [atomic.id, currentId] } })).status, 422);
  assert.equal((await request('/api/accounts/bulk-delete', { cookie: admin, method: 'POST',
    body: { ids: [atomic.id, '9223372036854775807'] } })).status, 404);
  assert.equal((await request(`/api/accounts/${atomic.id}`, { cookie: admin })).status, 200);
  check('Account deletion rejects unauthorized, cross-origin, invalid, self and partial bulk requests');

  await page.locator('[data-page=accounts]').click();
  assert.equal(await page.locator(`[data-account-select="${currentId}"]`).isDisabled(), true);
  assert.equal(await page.locator(`[data-delete-account="${currentId}"]`).isDisabled(), true);
  await page.locator('#accountSearch').fill(single.username);
  await page.locator(`[data-delete-account="${single.id}"]`).click();
  const dialog = page.locator('.bcn-account-delete-dialog[open]');
  assert.equal(await dialog.locator('li').count(), 1);
  assert.ok((await dialog.innerText()).includes(single.username));
  await dialog.locator('[data-cancel]').click();
  assert.equal((await request(`/api/accounts/${single.id}`, { cookie: admin })).status, 200);
  await page.locator(`[data-delete-account="${single.id}"]`).click();
  const singleResponse = page.waitForResponse(response =>
    response.url().endsWith(`/api/accounts/${single.id}`) && response.request().method() === 'DELETE');
  await dialog.locator('[data-confirm-delete]').click();
  assert.equal((await singleResponse).status(), 200);
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator(`[data-delete-account="${single.id}"]`).count(), 0);
  assert.equal((await request('/api/me', { cookie: singleSession })).status, 401);
  assert.equal((await request('/api/login', { method: 'POST', body: {
    username: single.username, password
  } })).status, 401);
  assert.equal((await request(`/api/accounts/${single.id}`, { cookie: admin })).status, 404);
  const retained = await database.query(`select u.is_deleted,a.id from users u
    join daily_report_audit a on a.actor_id=u.id where u.id=$1 and a.id=$2`, [single.id, history.id]);
  assert.equal(retained.rows[0].is_deleted, true);
  check('Single-account confirmation supports cancel; deletion revokes login and preserves historical authorship');

  await page.locator('#accountSearch').fill('verify.delete.batch');
  await page.locator('#selectAllAccounts').check();
  assert.equal(await page.locator('#accountSelectionCount').innerText(), 'Đã chọn 2 tài khoản');
  await page.locator('#accountSearch').fill('verify.delete.batch1');
  assert.equal(await page.locator('#accountSelectionCount').innerText(), 'Đã chọn 2 tài khoản');
  await page.locator('#deleteSelectedAccounts').click();
  assert.equal(await dialog.locator('li').count(), 2);
  assert.ok((await dialog.innerText()).includes(batch[1].username));
  await page.screenshot({ path: output + '/theme/accounts-bulk-delete.png' });
  await dialog.locator('[data-cancel]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#deleteSelectedAccounts').click();
  await page.screenshot({ path: output + '/theme/accounts-delete-mobile.png' });
  assert.equal(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  }), true);
  const bulkResponse = page.waitForResponse(response => response.url().endsWith('/api/accounts/bulk-delete'));
  await dialog.locator('[data-confirm-delete]').click();
  const deleted = await bulkResponse;
  assert.equal(deleted.status(), 200);
  assert.equal((await deleted.json()).deleted_count, 2);
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#deleteSelectedAccounts').isDisabled(), true);
  assert.equal((await request('/api/me', { cookie: batchSession })).status, 401);
  const visible = (await request('/api/accounts', { cookie: admin })).data.accounts;
  assert.equal(visible.some(account => batch.some(item => String(item.id) === String(account.id))), false);
  const audit = await database.query(`select metadata from activity_logs where action='ACCOUNTS_BULK_DELETED'
    and metadata->'accounts' @> $1::jsonb`, [JSON.stringify([{ id: batch[0].id }])]);
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].metadata.accounts.length, 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#accountSearch').fill('');
  check('Bulk selection survives search; confirmation lists every account and mobile deletion records audit');
}
