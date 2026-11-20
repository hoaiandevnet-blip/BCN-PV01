const accountLock = "select pg_advisory_xact_lock(hashtext('bcnpv01-account-admin'))";

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

function accountIds(values) {
  if (!Array.isArray(values) || !values.length || values.length > 100) {
    fail(422, 'INVALID_ACCOUNT_IDS', 'Chọn từ 1 đến 100 tài khoản để xóa.');
  }
  return [...new Set(values.map(value => {
    if (!['string', 'number'].includes(typeof value)
      || (typeof value === 'number' && !Number.isSafeInteger(value))
      || !/^[1-9]\d{0,18}$/.test(String(value)) || BigInt(value) > 9223372036854775807n) {
      fail(422, 'INVALID_ACCOUNT_IDS', 'Mã tài khoản không hợp lệ.');
    }
    return String(value);
  }))];
}

export async function deleteAccounts({ pool, actorId, ids: values }) {
  const ids = accountIds(values);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(accountLock);
    const { rows: [actor] } = await client.query(`select id,username from users
      where id=$1 and not is_deleted and is_admin and status='Hoạt động' for update`, [actorId]);
    if (!actor) fail(403, 'ADMIN_REQUIRED', 'Chỉ quản trị viên đang hoạt động được xóa tài khoản.');
    if (ids.includes(String(actor.id))) {
      fail(422, 'SELF_DELETE_FORBIDDEN', 'Không thể xóa tài khoản đang đăng nhập.');
    }
    const { rows: accounts } = await client.query(`select id,username,full_name,is_admin,status
      from users where id=any($1::bigint[]) and not is_deleted order by id for update`, [ids]);
    if (accounts.length !== ids.length) {
      fail(404, 'ACCOUNT_NOT_FOUND', 'Có tài khoản không còn tồn tại. Hãy tải lại danh sách trước khi xóa.');
    }
    const { rows: [remaining] } = await client.query(`select count(*)::int as count from users
      where not is_deleted and is_admin and status='Hoạt động' and not (id=any($1::bigint[]))`, [ids]);
    if (!remaining.count) {
      fail(409, 'LAST_ADMIN_REQUIRED', 'Phải giữ lại ít nhất một quản trị viên đang hoạt động.');
    }
    await client.query(`update users set is_deleted=true,status='Tạm khóa',updated_at=now()
      where id=any($1::bigint[])`, [ids]);
    await client.query(`insert into activity_logs(actor_username,action,module_key,module_name,detail,metadata)
      values($1,$2,'permissions','Tài khoản & phân quyền',$3,$4::jsonb)`, [
      actor.username,
      ids.length === 1 ? 'ACCOUNT_DELETED' : 'ACCOUNTS_BULK_DELETED',
      `Đã xóa ${accounts.length} tài khoản: ${accounts.map(account => account.username).join(', ')}`,
      JSON.stringify({ accounts: accounts.map(({ id, username, full_name }) => ({ id, username, full_name })) })
    ]);
    await client.query('commit');
    return { deleted_ids: accounts.map(account => String(account.id)), deleted_count: accounts.length };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function registerAccountDeletionRoutes(app, { pool, auth, wrap }) {
  const remove = bulk => wrap(async (req, res) => {
    const result = await deleteAccounts({ pool, actorId: req.cameraUser.id,
      ids: bulk ? req.body?.ids : [req.params.id] });
    result.deleted_ids.forEach(id => auth.revokeUser(id));
    res.json(result);
  });
  app.post('/api/accounts/bulk-delete', remove(true));
  app.delete('/api/accounts/:id', remove(false));
}
