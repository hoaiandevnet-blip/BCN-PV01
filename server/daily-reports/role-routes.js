import { COMPILER_MODULES, ROLE_MODULES, validateSubmodules } from './submodule-permissions.js';
import { ASSIGNABLE_ROLES, isPv01Unit } from './role-policy.js';
import { pv01UnitIds } from './unit-ancestry.js';

export function registerRoleRoutes(app, services) {
  const { base, pool, wrap, requireRole, fail, audit, transaction, requireDay } = services;
  app.get(`${base}/role-assignments`, requireRole('BCN_ADMIN'), wrap(async (_req, res) => {
    const [accounts, roles] = await Promise.all([
      pool.query(`select u.id,u.username,u.full_name,u.team_id,u.is_admin,t.name as unit_name,
        d.name as department_name,p.unit_code from users u
        left join teams t on t.id=u.team_id left join departments d on d.id=t.department_id
        left join daily_report_unit_profiles p on p.unit_id=t.id
        where not u.is_deleted and u.status='Hoạt động' order by u.username`),
      pool.query(`select user_id,role_code,unit_id,metric_code,effective_from,effective_to,submodules
        from daily_report_user_roles where role_code=any($1::text[]) order by user_id`, [ASSIGNABLE_ROLES])
    ]);
    const pv01Units = await pv01UnitIds(pool, accounts.rows.map(account => account.team_id));
    res.json({ accounts: accounts.rows.map(account => ({ ...account,
      is_pv01: isPv01Unit(account) || pv01Units.has(String(account.team_id)) })),
      roles: roles.rows, assignableRoles: ASSIGNABLE_ROLES, compilerModules: COMPILER_MODULES, roleModules: ROLE_MODULES });
  }));

  app.put(`${base}/user-roles`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const userId = Number(req.body?.user_id);
    const roleCode = String(req.body?.role_code || '');
    let unitId = req.body?.unit_id ? Number(req.body.unit_id) : null;
    const metricCode = req.body?.metric_code ? String(req.body.metric_code) : null;
    if (req.body?.unit_id && (!Number.isSafeInteger(unitId) || unitId < 1)) {
      fail(422, 'INVALID_ROLE_UNIT', 'Đơn vị phạm vi không hợp lệ.');
    }
    if (roleCode === 'BCN_ADMIN') {
      fail(422, 'ADMIN_ROLE_INHERITED', 'Admin đã có toàn quyền; không cấp vai trò quản trị riêng trong Báo cáo ngày.');
    }
    if (!Number.isSafeInteger(userId) || userId < 1 || !ASSIGNABLE_ROLES.includes(roleCode)) {
      fail(422, 'INVALID_ROLE_GRANT', 'Tài khoản hoặc vai trò không hợp lệ.');
    }
    if (metricCode && (!/^[A-Z][A-Z0-9_]{0,79}$/.test(metricCode) || roleCode !== 'UNIT_REPORTER')) {
      fail(422, 'INVALID_METRIC', 'Chỉ giao mã chỉ tiêu cho vai trò Đơn vị nhập báo cáo.');
    }
    if (req.body?.submodules !== undefined && roleCode !== 'PV01_COMPILER') {
      fail(422, 'COMPILER_SUBMODULES_ONLY', 'Chỉ phân quyền mục con cho Cán bộ tổng hợp PV01.');
    }
    const submodules = validateSubmodules(
      req.body?.submodules ?? ROLE_MODULES[roleCode], fail, roleCode);
    const effectiveFrom = req.body.effective_from ? requireDay(req.body.effective_from) : null;
    const effectiveTo = req.body.effective_to ? requireDay(req.body.effective_to) : null;
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      fail(422, 'INVALID_EFFECTIVE_RANGE', 'Khoảng hiệu lực phân công không hợp lệ.');
    }
    const role = await transaction(async client => {
      const { rows: [account] } = await client.query(`select u.id,u.team_id,u.is_admin,t.name as unit_name,
        d.name as department_name,p.unit_code from users u left join teams t on t.id=u.team_id
        left join departments d on d.id=t.department_id
        left join daily_report_unit_profiles p on p.unit_id=t.id
        where u.id=$1 and not u.is_deleted and u.status='Hoạt động' for update of u`, [userId]);
      if (!account) fail(422, 'ACCOUNT_NOT_AVAILABLE', 'Tài khoản không tồn tại hoặc đã ngừng hoạt động.');
      if (account.is_admin) fail(422, 'ADMIN_ROLE_INHERITED', 'Tài khoản admin đã có toàn quyền, không cần cấp thêm.');
      if (roleCode === 'UNIT_REPORTER') {
        if (!account.team_id || (unitId && String(account.team_id) !== String(unitId))) {
          fail(422, 'ACCOUNT_UNIT_MISMATCH',
            'Phải gắn đơn vị công tác tại Hệ thống & Phân quyền trước khi phân công.');
        }
        unitId = Number(account.team_id);
      }
      const pv01Units = roleCode === 'PV01_COMPILER'
        ? await pv01UnitIds(client, [account.team_id]) : new Set();
      if (roleCode === 'PV01_COMPILER' && !isPv01Unit(account) && !pv01Units.has(String(account.team_id))) {
        fail(422, 'PV01_ACCOUNT_REQUIRED', 'Chỉ tài khoản thuộc PV01 được cấp vai trò Cán bộ tổng hợp PV01.');
      }
      if (unitId && (!Number.isSafeInteger(unitId) || unitId < 1
        || !(await client.query('select id from teams where id=$1', [unitId])).rowCount)) {
        fail(422, 'INVALID_ROLE_UNIT', 'Đơn vị phạm vi không hợp lệ.');
      }
      const { rows } = await client.query(`insert into daily_report_user_roles
        (user_id,role_code,unit_id,metric_code,assigned_by,effective_from,effective_to,submodules)
        values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        on conflict (user_id,role_code,(coalesce(unit_id,0)),(coalesce(metric_code,'')))
        do update set assigned_by=excluded.assigned_by,
          effective_from=excluded.effective_from,effective_to=excluded.effective_to,
          submodules=excluded.submodules
        returning user_id,role_code,unit_id,metric_code,submodules`,
      [userId, roleCode, unitId, metricCode, req.dailyActor.id, effectiveFrom, effectiveTo, JSON.stringify(submodules)]);
      await client.query(`insert into user_permissions(user_id,permission_id)
        select $1,p.id from permissions p join modules m on m.id=p.module_id
        where m.module_key='dailyReports' on conflict do nothing`, [userId]);
      if (roleCode === 'PV01_COMPILER' && submodules.includes('approval')) {
        await client.query(`insert into user_permissions(user_id,permission_id)
          select $1,p.id from permissions p join modules m on m.id=p.module_id
          where m.module_key='dailyReportApproval' on conflict do nothing`, [userId]);
      }
      await audit(client, req, 'ROLE_ASSIGNED', 'ACCOUNT', String(userId), 'ALLOW',
        { roleCode, unitId, metricCode, submodules, moduleAccess: true });
      return rows[0];
    });
    res.status(201).json({ role });
  }));

  app.delete(`${base}/user-roles`, requireRole('BCN_ADMIN'), wrap(async (req, res) => {
    const userId = Number(req.body?.user_id);
    const roleCode = String(req.body?.role_code || '');
    const unitId = req.body?.unit_id ? Number(req.body.unit_id) : null;
    const metricCode = req.body?.metric_code || null;
    if (!Number.isSafeInteger(userId) || userId < 1
      || ![...ASSIGNABLE_ROLES, 'BCN_ADMIN'].includes(roleCode)
      || (req.body?.unit_id && (!Number.isSafeInteger(unitId) || unitId < 1))) {
      fail(422, 'INVALID_ROLE_GRANT', 'Tài khoản, vai trò hoặc đơn vị thu hồi không hợp lệ.');
    }
    const removed = await transaction(async client => {
      const { rowCount } = await client.query(`delete from daily_report_user_roles
        where user_id=$1 and role_code=$2 and unit_id is not distinct from $3::bigint
          and metric_code is not distinct from $4::text`, [userId, roleCode, unitId, metricCode]);
      await audit(client, req, 'ROLE_REVOKED', 'ACCOUNT', String(userId), 'ALLOW', { roleCode, unitId, metricCode });
      return rowCount;
    });
    res.json({ removed });
  }));
}
