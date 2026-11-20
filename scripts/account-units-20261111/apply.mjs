import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pool } from '../../server/db.js';

const output = new URL('../../outputs/account-units-20261111/', import.meta.url);
const plan = JSON.parse(await readFile(new URL('plan.json', output), 'utf8'));
const assignments = plan.assignments;
const client = await pool.connect();
const state = async () => {
  const { rows: users } = await client.query(`select id,username,team_id,updated_at,
    md5((to_jsonb(u)-'team_id'-'updated_at')::text) as unchanged_fields
    from users u order by id`);
  const { rows: roles } = await client.query('select * from daily_report_user_roles order by id');
  const { rows: permissions } = await client.query('select * from user_permissions order by user_id,permission_id');
  return { users, roles, permissions };
};
try {
  assert.equal(assignments.length, 12);
  assert.equal(new Set(assignments.map(item => item.toUnitId)).size, 12);
  assert.ok(assignments.every(item => /^demo\.canbo(?:09|1[0-9]|20)$/.test(item.username)));
  assert.ok(assignments.every(item => ['14', '49', '106'].includes(item.fromUnitId)));
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('bcnpv01-account-admin'))");
  await client.query('select id from users order by id for update');
  const before = await state();
  for (const item of assignments) {
    const current = before.users.find(user => user.id === item.id);
    assert.equal(current?.username, item.username, 'Account identity changed');
    assert.equal(current?.team_id, item.fromUnitId, 'Account unit changed after preparing the plan');
    assert.equal(current?.updated_at.toISOString(), item.updatedAt, 'Account was edited after preparing the plan');
    const { rows: [unit] } = await client.query(`select t.id,t.name from teams t
      join departments d on d.id=t.department_id where t.id=$1 and d.unit_type='Cấp xã'
      and t.name like 'Xã %' and not exists(select 1 from users u where u.team_id=t.id and not u.is_deleted)`,
    [item.toUnitId]);
    assert.equal(unit?.name, item.toUnitName, 'Target unit is unavailable or changed');
  }
  await writeFile(new URL('before.json', output), JSON.stringify({
    at: new Date().toISOString(),
    users: before.users.map(({ unchanged_fields, ...user }) => user),
    roles: before.roles, permissions: before.permissions
  }, null, 2), { flag: 'wx', mode: 0o600 });
  for (const item of assignments) {
    const result = await client.query(`update users set team_id=$2,updated_at=now()
      where id=$1 and username=$3 and team_id=$4 and not is_admin and not is_deleted`,
    [item.id, item.toUnitId, item.username, item.fromUnitId]);
    assert.equal(result.rowCount, 1, 'Each assignment must update exactly one account');
    await client.query(`insert into activity_logs(actor_username,action,module_key,module_name,detail,metadata)
      values('codex-user-request','ACCOUNT_UNIT_REASSIGNED','permissions','Tài khoản & phân quyền',$1,$2::jsonb)`,
    [`Chuyển đơn vị ${item.username} sang ${item.toUnitName} theo yêu cầu người dùng.`, JSON.stringify({
      user_id: item.id, from_unit_id: item.fromUnitId, to_unit_id: item.toUnitId,
      reason: 'Giữ 7 tài khoản đang ở xã; chuyển 12 tài khoản cấp phòng sang các xã/phường khác nhau.'
    })]);
  }
  const after = await state();
  assert.deepEqual(after.roles, before.roles, 'Reporting roles must remain unchanged');
  assert.deepEqual(after.permissions, before.permissions, 'Module permissions must remain unchanged');
  for (const previous of before.users) {
    const current = after.users.find(user => user.id === previous.id);
    const change = assignments.find(item => item.id === previous.id);
    assert.equal(current?.unchanged_fields, previous.unchanged_fields, 'Only unit and timestamp may change');
    assert.equal(current?.team_id, change?.toUnitId || previous.team_id, 'Unexpected unit assignment');
    if (!change) assert.equal(current.updated_at.toISOString(), previous.updated_at.toISOString());
  }
  await client.query('commit');
  const result = { at: new Date().toISOString(), status: 'PASS', changed: assignments.length,
    protectedAccountsUnchanged: plan.protectedUsernames,
    assignments: assignments.map(({ id, username, fromUnitId, toUnitId, toUnitName }) =>
      ({ id, username, fromUnitId, toUnitId, toUnitName })) };
  await writeFile(new URL('applied.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, changed: result.changed,
    protectedUnchanged: result.protectedAccountsUnchanged.length }));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
