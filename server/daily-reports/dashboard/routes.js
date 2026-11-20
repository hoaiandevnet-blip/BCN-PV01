import { reportDay } from '../rules.js';
import { loadDashboardData } from './data.js';
import { summarizeDashboard } from './statistics.js';
import { loadUnitDashboard } from './unit/data.js';
import { reportingDashboard } from '../../../assets/js/standalone/dashboard/reporting-units.js';

export function registerDashboardRoutes(app, services) {
  const { base, pool, wrap, requireRole, requireDay, clock, fail } = services;
  app.get(`${base}/dashboard`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const now = clock();
    const day = requireDay(req.query.day || reportDay(now));
    const span = Number(req.query.span || 1);
    if (![1, 7, 30].includes(span) || day > reportDay(now)) {
      fail(422, 'INVALID_DASHBOARD_PERIOD', 'Chọn ngày không vượt quá hôm nay và kỳ 1, 7 hoặc 30 ngày.');
    }
    const user = req.dailyActor;
    const unitView = !user.is_admin && !user.roles.some(role => role.role_code === 'PV01_COMPILER');
    if (unitView) {
      return res.json(await loadUnitDashboard(pool, user, day, span, now));
    }
    const data = await loadDashboardData(pool, user, day, span);
    res.json(reportingDashboard({ ...summarizeDashboard({ ...data, day, span, now }), audience: 'command' }));
  }));
}
