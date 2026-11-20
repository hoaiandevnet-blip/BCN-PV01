import { reportDay } from './rules.js';
import { validReportAlignment } from '../../assets/js/daily-reports-document-format.mjs';

export function registerPresentationRoutes(app, services) {
  const { base, pool, wrap, requireRole, requireDay, clock } = services;
  app.get(`${base}/overview`, requireRole('UNIT_REPORTER', 'PV01_COMPILER'), wrap(async (req, res) => {
    const user = req.dailyActor;
    const date = requireDay(req.query.report_day || reportDay(clock()));
    const compilers = user.roles.filter(role => role.role_code === 'PV01_COMPILER');
    const all = compilers.some(role => role.unit_id === null);
    const units = compilers.map(role => Number(role.unit_id)).filter(Boolean);
    if (user.roles.some(role => role.role_code === 'UNIT_REPORTER'
      && Number(role.unit_id) === Number(user.unitId))) units.push(Number(user.unitId));
    const params = [date, all, [...new Set(units)]];
    const [totals, groups, recent] = await Promise.all([
      pool.query(`select count(*)::int as total,
        count(*) filter(where current_state='VERIFIED')::int as verified,
        count(*) filter(where business_code='TINH_HINH_KHAC'
          or classifications @> '[{"business_code":"TINH_HINH_KHAC"}]'::jsonb)::int as other,
        count(*) filter(where current_state in ('SUBMITTED','PENDING_REVIEW','RESUBMITTED','RETURNED'))::int as pending,
        count(*) filter(where current_state='RETURNED')::int as returned
        from daily_report_cases where report_day=$1 and ($2 or unit_id=any($3::bigint[]))`, params),
      pool.query(`select t.id,t.name,p.unit_group,d.unit_type,count(c.id)::int as cases
        from teams t left join departments d on d.id=t.department_id
        left join daily_report_unit_profiles p on p.unit_id=t.id
        left join daily_report_cases c on c.unit_id=t.id and c.report_day=$1
        where ($2 or t.id=any($3::bigint[])) group by t.id,t.name,p.unit_group,d.unit_type order by t.name`, params),
      pool.query(`select c.id,c.stable_code,c.title,c.summary,c.business_code,c.classifications,c.current_state,c.updated_at,t.name as unit_name
        from daily_report_cases c join teams t on t.id=c.unit_id
        where c.report_day=$1 and ($2 or c.unit_id=any($3::bigint[]))
        order by c.updated_at desc,c.id limit 5`, params)
    ]);
    res.json({ report_day: date, totals: totals.rows[0], units: groups.rows, recent: recent.rows });
  }));
}

export function validateDocumentFields(value, fail) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail(422, 'INVALID_DOCUMENT_FIELDS', 'Thành phần văn bản không hợp lệ.');
  }
  const limits = { number: 100, classification: 20, audience: 2000, recipients: 3000,
    advisory: 8000, steering: 8000, orders: 8000, duty: 8000, party: 8000, requests: 8000, conclusion: 3000 };
  const result = {};
  for (const [key, input] of Object.entries(value)) {
    if (key === 'alignment') {
      if (!validReportAlignment(input)) {
        fail(422, 'INVALID_DOCUMENT_ALIGNMENT', 'Cách căn chỉnh văn bản không hợp lệ.');
      }
      result.alignment = { ...input };
      continue;
    }
    if (!Object.hasOwn(limits, key) || typeof input !== 'string' || input.length > limits[key]) {
      fail(422, 'INVALID_DOCUMENT_FIELDS', 'Trường văn bản không hợp lệ hoặc vượt độ dài cho phép.');
    }
    result[key] = input.trim();
  }
  if (result.classification && !['KHÔNG MẬT', 'MẬT', 'TỐI MẬT', 'TUYỆT MẬT'].includes(result.classification)) {
    fail(422, 'INVALID_CLASSIFICATION', 'Độ mật không hợp lệ.');
  }
  return result;
}
