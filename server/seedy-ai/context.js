import { reportDay } from '../daily-reports/rules.js';

export function vietnamDay() {
  return reportDay(new Date());
}

export async function readReport(req, resource, params, signal) {
  const port = req.socket.localPort;
  const protocol = req.socket.encrypted ? 'https' : 'http';
  const endpoint = new URL(`${protocol}://127.0.0.1:${port}/api/bao-cao-ngay/${resource}`);
  endpoint.search = new URLSearchParams(params);
  const response = await fetch(endpoint, {
    headers: { Cookie: req.headers.cookie || '', 'X-BCN-Account-Id': String(req.account.id) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    redirect: 'error'
  });
  if (!response.ok) {
    const body = await response.json();
    throw Object.assign(new Error(body.error || 'Không đọc được số liệu trong phạm vi tài khoản.'), {
      status: response.status
    });
  }
  return response.json();
}

export async function loadContext(req, selection, signal) {
  if (selection.kind === 'none') return null;
  const dashboard = await readReport(req, 'dashboard', { day: selection.day, span: '1' }, signal);
  const data = {
    ngay: dashboard.day,
    pham_vi: 'Chỉ các đơn vị và nghiệp vụ được cấp quyền cho tài khoản hiện tại',
    don_vi: {
      can_gui: dashboard.progress.expected,
      da_gui: dashboard.progress.submitted,
      chua_gui: dashboard.progress.missing,
      gui_du: dashboard.progress.complete,
      gui_mot_phan: dashboard.progress.partial,
      bi_tra_lai: dashboard.progress.returned
    },
    vu_viec: {
      hien_tai: dashboard.cases.current,
      ky_truoc: dashboard.cases.previous,
      da_xac_minh: dashboard.cases.verified,
      chenh_lech: dashboard.cases.delta,
      ty_le_phan_tram: dashboard.cases.percent
    },
    theo_he: dashboard.domains.filter(item => item.current > 0)
      .map(item => ({ ten: item.label, so_vu: item.current }))
  };
  if (selection.list) {
    // Match the dashboard's progress denominator. Non-expected units are not part of these counts.
    const units = dashboard.units.filter(unit => unit.expected && (selection.list === 'all'
      || (selection.list === 'submitted' ? unit.status !== 'missing' : unit.status === selection.list)));
    data.danh_sach = {
      tong_so: units.length,
      don_vi: units.slice(0, 25).map(unit => ({ ten: unit.name, trang_thai: unit.status }))
    };
  }
  return data;
}
