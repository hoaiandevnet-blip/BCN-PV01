import { randomBytes } from 'node:crypto';

const cookieName = 'bcnpv01_session';
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function cookieToken(req) {
  const values = String(req.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .filter(value => value.startsWith(`${cookieName}=`));
  return values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
}

export function createSessionAuth({ pool, now = Date.now, ttlMs = 8 * 60 * 60 * 1000 } = {}) {
  const sessions = new Map();
  const cookieOptions = req => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/api'
  });
  const sweep = () => {
    for (const [token, session] of sessions) {
      if (session.expires <= now()) sessions.delete(token);
    }
  };
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  const resolveSession = async req => {
    const token = cookieToken(req);
    const session = sessions.get(token);
    if (!session || session.expires <= now()) {
      sessions.delete(token);
      return { account: null, inactive: false };
    }
    // A tab remains bound to its displayed account when another tab changes the shared cookie.
    const expectedAccount = req.headers['x-bcn-account-id'];
    if (expectedAccount !== undefined && String(expectedAccount) !== String(session.userId)) {
      return { account: null, inactive: false };
    }
    const { rows } = await pool.query(
      `select id, username, is_admin, status, is_deleted, session_unlimited, notification_modules
        from users where id = $1 limit 1`,
      [session.userId]
    );
    const user = rows[0];
    if (!user || user.is_deleted || user.status !== 'Hoạt động') {
      sessions.delete(token);
      return { account: null, inactive: true };
    }
    return {
      account: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        status: user.status,
        ...(user.session_unlimited === true ? { session_unlimited: true } : {}),
        ...(Array.isArray(user.notification_modules) ? { notification_modules: user.notification_modules } : {})
      },
      inactive: false
    };
  };
  return {
    async resolve(req) {
      return (await resolveSession(req)).account;
    },
    issue(req, res, user) {
      sessions.delete(cookieToken(req));
      sweep();
      while (sessions.size >= 5000) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('hex');
      const unlimited = user.session_unlimited === true;
      sessions.set(token, { userId: user.id, expires: unlimited ? Infinity : now() + ttlMs });
      res.cookie(cookieName, token, { ...cookieOptions(req), ...(unlimited ? {} : { maxAge: ttlMs }) });
    },
    revokeUser(userId) {
      for (const [token, session] of sessions) {
        if (String(session.userId) === String(userId)) sessions.delete(token);
      }
    },
    revoke(req, res) {
      sessions.delete(cookieToken(req));
      res.clearCookie(cookieName, cookieOptions(req));
    },
    requireAdmin: wrap(async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      const { account: user, inactive } = await resolveSession(req);
      if (!user) {
        const error = inactive
          ? 'Tài khoản không còn hoạt động. Vui lòng đăng nhập lại.'
          : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.';
        return res.status(401).json({ error, code: 'login_required' });
      }
      if (!user.is_admin) {
        return res.status(403).json({
          error: 'Chỉ quản trị viên được thực hiện thao tác này.',
          code: 'admin_required'
        });
      }
      req.cameraUser = { id: user.id, username: user.username };
      next();
    }),
    close() {
      clearInterval(timer);
      sessions.clear();
    }
  };
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    return res.status(403).json({ error: 'Yêu cầu phải được gửi từ chính phần mềm này.', code: 'origin_rejected' });
  }
  if (origin) {
    try {
      if (new URL(origin).origin !== `${req.protocol}://${req.get('host')}`) throw new Error('origin');
    } catch {
      return res.status(403).json({ error: 'Nguồn gửi yêu cầu không hợp lệ.', code: 'origin_rejected' });
    }
  }
  next();
}

export function registerSessionRoutes(app, { auth, sameOrigin = requireSameOrigin } = {}) {
  const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  app.get('/api/session', noStore, sameOrigin, async (req, res, next) => {
    try {
      const account = await auth.resolve(req);
      if (!account) {
        return res.status(401).json({
          error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
          code: 'login_required'
        });
      }
      res.json({ account });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/logout', sameOrigin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    auth.revoke(req, res);
    res.json({ ok: true });
  });
}
