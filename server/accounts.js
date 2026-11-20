import { hashPassword, verifyPassword } from './passwords.js';
import { registerAccountDeletionRoutes } from './account-deletion.js';
import { securityEvent } from './security.js';

const usernamePattern = /^[a-z0-9._-]{3,32}$/;
const fields = `u.id,u.username,u.full_name,u.phone,u.rank_id,u.position_id,u.team_id,u.role_name,
  u.status,u.is_admin,u.session_unlimited,u.notification_modules,t.name as team`;

export function registerAccountRoutes(app, { pool, auth, sameOrigin, wrap }) {
  const attempts = new Map();
  const safeAccount = async id => {
    const { rows: [account] } = await pool.query(`select ${fields} from users u
      left join teams t on t.id=u.team_id where u.id=$1 and not u.is_deleted`, [id]);
    if (!account) return null;
    account.permissions = (await pool.query(`select p.id,p.name,m.module_key from user_permissions up
      join permissions p on p.id=up.permission_id join modules m on m.id=p.module_id
      where up.user_id=$1`, [id])).rows;
    return account;
  };
  const requireLogin = wrap(async (req, res, next) => {
    const user = await auth.resolve(req);
    if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập.', code: 'login_required' });
    req.account = user;
    next();
  });
  app.post('/api/login', sameOrigin, wrap(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const ip = req.ip;
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const limited = attempts.get(ip) || { count: 0, until: now + 900000 };
    if (limited.count >= 30) {
      if (!limited.logged) securityEvent('LOGIN_RATE_LIMITED', req);
      limited.logged = true;
      return res.status(429).json({ error: 'Thử lại sau 15 phút.' });
    }
    limited.count += 1;
    attempts.set(ip, limited);
    const client = await pool.connect();
    let authenticated;
    try {
      await client.query('begin');
      const { rows: [user] } = await client.query(
        'select * from users where username=$1 and not is_deleted for update', [username]);
      if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        await client.query('rollback');
        securityEvent('LOGIN_DENIED', req, { reason: 'ACCOUNT_LOCKED', accountId: user.id });
        return res.status(429).json({ error: 'Tài khoản tạm khóa 15 phút do đăng nhập sai nhiều lần.' });
      }
      if (!user || !verifyPassword(password, user.password_hash) || user.status !== 'Hoạt động') {
        if (user) await client.query(`update users set failed_login_count=failed_login_count+1,
          locked_until=case when failed_login_count>=4 then now()+interval '15 minutes' else null end
          where id=$1`, [user.id]);
        await client.query('commit');
        securityEvent('LOGIN_DENIED', req, { reason: 'INVALID_CREDENTIALS' });
        return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã khóa.' });
      }
      await client.query('update users set failed_login_count=0,locked_until=null where id=$1', [user.id]);
      await client.query('commit');
      authenticated = user;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    attempts.delete(ip);
    auth.issue(req, res, authenticated);
    securityEvent('LOGIN_SUCCEEDED', req, { accountId: authenticated.id });
    res.json({ account: await safeAccount(authenticated.id) });
  }));
  app.get('/api/me', requireLogin, wrap(async (req, res) => res.json(await safeAccount(req.account.id))));
  app.post('/api/change-password', sameOrigin, requireLogin, wrap(async (req, res) => {
    const { rows: [user] } = await pool.query('select password_hash from users where id=$1', [req.account.id]);
    if (!verifyPassword(req.body.currentPassword, user.password_hash)) {
      return res.status(403).json({ error: 'Mật khẩu hiện tại không đúng.' });
    }
    if (String(req.body.password || '').length < 8) {
      return res.status(422).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }
    await pool.query('update users set password_hash=$2,updated_at=now() where id=$1',
      [req.account.id, hashPassword(req.body.password)]);
    auth.revokeUser(req.account.id);
    auth.issue(req, res, req.account);
    res.json({ ok: true });
  }));
  app.get('/api/directory', requireLogin, wrap(async (_req, res) => {
    const results = await Promise.all(['departments', 'teams', 'ranks', 'positions'].map(async table =>
      [table, (await pool.query(`select * from ${table} order by id`)).rows]));
    res.json(Object.fromEntries(results));
  }));
  app.use('/api/accounts', sameOrigin, auth.requireAdmin);
  registerAccountDeletionRoutes(app, { pool, auth, wrap });
  app.get('/api/accounts', wrap(async (req, res) => {
    const { rows } = await pool.query(`select ${fields} from users u left join teams t on t.id=u.team_id
      where not u.is_deleted order by u.is_admin desc,u.username`);
    res.json({ accounts: rows, current_account_id: String(req.cameraUser.id),
      permissions: (await pool.query(`select p.id,p.name,m.module_key
      from permissions p join modules m on m.id=p.module_id order by m.id`)).rows });
  }));
  app.get('/api/accounts/:id', wrap(async (req, res) => {
    const account = await safeAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    res.json(account);
  }));
  const save = async (req, res) => {
    const data = req.body || {};
    const username = String(data.username || '').trim().toLowerCase();
    if (!usernamePattern.test(username) || !String(data.full_name || '').trim()) {
      return res.status(422).json({ error: 'Tên đăng nhập 3–32 ký tự không dấu; họ tên không được trống.' });
    }
    if ((!req.params.id || data.password) && String(data.password || '').length < 8) {
      return res.status(422).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }
    if (!['Hoạt động', 'Tạm khóa'].includes(data.status || 'Hoạt động')) {
      return res.status(422).json({ error: 'Trạng thái tài khoản không hợp lệ.' });
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('bcnpv01-account-admin'))");
      let id = req.params.id;
      if (id) {
        const { rows: [current] } = await client.query('select * from users where id=$1 and not is_deleted', [id]);
        if (!current) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
        if (String(id) === String(req.cameraUser.id) && (!data.is_admin || data.status !== 'Hoạt động')) {
          throw Object.assign(new Error('Không thể tự gỡ quyền quản trị hoặc khóa tài khoản đang dùng.'), { status: 422 });
        }
        await client.query(`update users set full_name=$2,phone=$3,team_id=$4,rank_id=$5,position_id=$6,
          status=$7,is_admin=$8,session_unlimited=$9,updated_at=now() where id=$1`,
        [id, data.full_name.trim(), data.phone || null, data.team_id || null, data.rank_id || null,
          data.position_id || null, data.status, data.is_admin === true, data.session_unlimited === true]);
        if (data.password) await client.query('update users set password_hash=$2 where id=$1',
          [id, hashPassword(data.password)]);
      } else {
        const inserted = await client.query(`insert into users(username,password_hash,full_name,phone,team_id,
          rank_id,position_id,status,is_admin,session_unlimited) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [username, hashPassword(data.password), data.full_name.trim(), data.phone || null, data.team_id || null,
          data.rank_id || null, data.position_id || null, data.status || 'Hoạt động',
          data.is_admin === true, data.session_unlimited === true]);
        id = inserted.rows[0].id;
      }
      const permissionIds = [...new Set((data.permission_ids || []).map(Number))];
      const valid = await client.query('select id from permissions where id=any($1::bigint[])', [permissionIds]);
      if (valid.rowCount !== permissionIds.length) {
        throw Object.assign(new Error('Quyền không hợp lệ.'), { status: 422 });
      }
      await client.query('delete from user_permissions where user_id=$1', [id]);
      await client.query(`insert into user_permissions(user_id,permission_id)
        select $1,unnest($2::bigint[])`, [id, permissionIds]);
      await client.query('commit');
      if (req.params.id) auth.revokeUser(id);
      if (String(id) === String(req.cameraUser.id)) auth.issue(req, res, await safeAccount(id));
      res.status(req.params.id ? 200 : 201).json(await safeAccount(id));
    } catch (error) {
      await client.query('rollback');
      if (error.code === '23505') error = Object.assign(new Error('Tên đăng nhập đã tồn tại.'), { status: 409 });
      if (error.code === '23503') error = Object.assign(new Error('Đơn vị hoặc danh mục không tồn tại.'), { status: 422 });
      throw error;
    } finally {
      client.release();
    }
  };
  app.post('/api/accounts', wrap(save));
  app.put('/api/accounts/:id', wrap(save));
  return { requireLogin };
}
