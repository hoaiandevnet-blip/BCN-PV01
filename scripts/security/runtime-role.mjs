import pg from 'pg';

export async function provisionRuntimeRole(client, { database, role, password }) {
  if (database !== 'BCNPV01' && !/^bcnpv01_test_[a-z0-9_]+$/.test(database)) {
    throw new Error('Chỉ cấp quyền trên database BCNPV01 hoặc database kiểm thử riêng.');
  }
  if (!/^bcnpv01_[a-z0-9_]{1,40}$/.test(role) || !/^[0-9a-f]{48,}$/.test(password)) {
    throw new Error('Tên role hoặc mật khẩu khởi tạo không hợp lệ.');
  }
  const quotedRole = pg.escapeIdentifier(role);
  const quotedDatabase = pg.escapeIdentifier(database);
  await client.query('begin');
  try {
    await client.query("set local password_encryption='scram-sha-256'");
    await client.query(`create role ${quotedRole} login nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls password ${pg.escapeLiteral(password)}`);
    await client.query(`grant connect on database ${quotedDatabase} to ${quotedRole}`);
    await client.query('revoke create on schema public from public');
    await client.query(`grant usage on schema public to ${quotedRole}`);
    await client.query(`grant select,insert,update,delete on all tables in schema public to ${quotedRole}`);
    await client.query(`grant usage,select on all sequences in schema public to ${quotedRole}`);
    await client.query(`alter default privileges in schema public
      grant select,insert,update,delete on tables to ${quotedRole}`);
    await client.query(`alter default privileges in schema public grant usage,select on sequences to ${quotedRole}`);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export function runtimeHbaRules(database, role) {
  // Place before existing rules. This affects only the new BCNPV01 runtime role.
  return [
    `local ${database} ${role} scram-sha-256`,
    `host ${database} ${role} 127.0.0.1/32 scram-sha-256`,
    `host ${database} ${role} ::1/128 scram-sha-256`,
    `local all ${role} reject`,
    `host all ${role} 0.0.0.0/0 reject`,
    `host all ${role} ::0/0 reject`
  ].join('\n') + '\n';
}
