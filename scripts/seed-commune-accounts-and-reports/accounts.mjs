import assert from 'node:assert/strict';

export const DEMO_PASSWORD_HASH =
  'scrypt$2df8f7531b9a7e1f3bc6f68871622f94$7bd080266d974ac34959aabca0882ddd' +
  '23b374a3e488badabd3efd825fd447c2acb10415678cef9a042342d9278b955cc3ce8f6d' +
  '845c67ac4fe19834e88fad96';

export const REPORTING_PERMISSIONS = [
  3503, // Báo cáo ngày
  4282, // Nhập dữ liệu
  4283, // Tra cứu vụ việc
  4284, // Danh mục pháp luật
  4285, // Báo cáo bị trả lại
  4286, // Cập nhật / Bổ sung
  4287  // Lịch sử đề nghị
];

export const SUBMODULES = [
  'input',
  'registry',
  'legal',
  'returned',
  'updates',
  'unlock'
];

export async function setupCommuneReportingAccounts(client) {
  // 1. Identify all commune units
  const { rows: allCommuneTeams } = await client.query(`
    select t.id, t.name, d.unit_type
    from teams t
    join departments d on d.id = t.department_id
    where d.unit_type = 'Cấp xã'
    order by t.id
  `);
  assert.equal(allCommuneTeams.length, 102, 'Expected 102 commune teams');

  // 2. Identify 7 protected active demo units
  const { rows: activeDemoUnits } = await client.query(`
    select distinct u.id as user_id, u.username, t.id as unit_id, t.name as unit_name
    from users u
    join teams t on t.id = u.team_id
    join daily_report_user_roles r on r.user_id = u.id and r.role_code = 'UNIT_REPORTER'
    where u.username in ('demo.canbo02', 'demo.canbo03', 'demo.canbo04',
                         'demo.canbo05', 'demo.canbo06', 'demo.canbo07', 'demo.canbo08')
    order by u.username
  `);
  assert.equal(activeDemoUnits.length, 7, 'Expected 7 active demo units');
  const activeUnitIds = new Set(activeDemoUnits.map(item => String(item.unit_id)));

  // 3. Identify the 12 existing demo accounts (demo.canbo09 .. demo.canbo20)
  const { rows: existingCommuneUsers } = await client.query(`
    select u.id as user_id, u.username, u.full_name, t.id as unit_id, t.name as unit_name
    from users u
    join teams t on t.id = u.team_id
    where u.username >= 'demo.canbo09' and u.username <= 'demo.canbo20'
      and not u.is_deleted
    order by u.username
  `);
  assert.equal(existingCommuneUsers.length, 12, 'Expected 12 existing commune accounts');

  // Assign reporting roles and permissions to the 12 existing accounts
  for (const user of existingCommuneUsers) {
    const roleCheck = await client.query(`
      select id from daily_report_user_roles
      where user_id = $1 and role_code = 'UNIT_REPORTER'
    `, [user.user_id]);

    if (!roleCheck.rows.length) {
      await client.query(`
        insert into daily_report_user_roles
          (user_id, role_code, unit_id, assigned_by, submodules, effective_from)
        values
          ($1, 'UNIT_REPORTER', $2, 1, $3::jsonb, '2026-10-19')
      `, [user.user_id, user.unit_id, JSON.stringify(SUBMODULES)]);
    }

    for (const permId of REPORTING_PERMISSIONS) {
      await client.query(`
        insert into user_permissions (user_id, permission_id)
        values ($1, $2)
        on conflict (user_id, permission_id) do nothing
      `, [user.user_id, permId]);
    }
  }

  // 4. Identify remaining commune teams without an account
  const { rows: unassignedTeams } = await client.query(`
    select t.id, t.name
    from teams t
    join departments d on d.id = t.department_id
    where d.unit_type = 'Cấp xã'
      and not exists (
        select 1 from users u
        where u.team_id = t.id and not u.is_deleted
      )
    order by t.id
  `);
  assert.equal(unassignedTeams.length, 83, 'Expected 83 unassigned commune teams');

  // 5. Create accounts for the 83 unassigned commune teams
  const newCreatedUsers = [];
  let userNumber = 21;
  for (const team of unassignedTeams) {
    const username = `demo.canbo${String(userNumber).padStart(2, '0')}`;
    const fullName = `Cán bộ Công an ${team.name}`;

    const { rows: [insertedUser] } = await client.query(`
      insert into users
        (username, password_hash, full_name, team_id, role_name, status, is_admin, is_deleted)
      values
        ($1, $2, $3, $4, 'Cán bộ nghiệp vụ', 'Hoạt động', false, false)
      returning id, username, full_name, team_id
    `, [username, DEMO_PASSWORD_HASH, fullName, team.id]);

    await client.query(`
      insert into daily_report_user_roles
        (user_id, role_code, unit_id, assigned_by, submodules, effective_from)
      values
        ($1, 'UNIT_REPORTER', $2, 1, $3::jsonb, '2026-10-19')
    `, [insertedUser.id, team.id, JSON.stringify(SUBMODULES)]);

    for (const permId of REPORTING_PERMISSIONS) {
      await client.query(`
        insert into user_permissions (user_id, permission_id)
        values ($1, $2)
        on conflict (user_id, permission_id) do nothing
      `, [insertedUser.id, permId]);
    }

    newCreatedUsers.push({
      user_id: insertedUser.id,
      username: insertedUser.username,
      full_name: insertedUser.full_name,
      unit_id: team.id,
      unit_name: team.name
    });
    userNumber += 1;
  }

  // Return the 95 units that need cases seeded (12 existing + 83 new)
  const targetReportingUnits = [...existingCommuneUsers, ...newCreatedUsers];
  assert.equal(targetReportingUnits.length, 95, 'Expected 95 target units');

  return {
    protectedActiveUnits: activeDemoUnits,
    updatedExistingUsers: existingCommuneUsers,
    newCreatedUsers,
    targetReportingUnits
  };
}
