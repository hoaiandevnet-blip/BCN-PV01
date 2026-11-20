import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../server/db.js';
import { intakeSchema } from '../server/daily-reports/intake/validation.js';
import { createLocalReportRequest } from './lib/local-report-request.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs/pending-reports-20261110');
const local = createLocalReportRequest(pool, path.join(root, '.private/report-files'));
const marker = 'BÁO CÁO THỬ — CHỜ XÁC MINH. Dữ liệu giả lập, không phải vụ việc thực tế.';
const definitions = [
  { username: 'demo.canbo02', unit_id: '114', unit: 'Xã An Phước', code: 'TTXH',
    narrative: 'Tình huống AP-CXM-01: giả lập tiếp nhận 01 tin báo mất tài sản tại địa điểm thử. '
      + 'Đơn vị đã ghi nhận nội dung ban đầu và gửi báo cáo để PV01 rà soát; chưa xác minh kết luận.',
    values: { patrol_officers: 6, patrol_rounds: 2, patrol_vehicles_checked: 12,
      administrative_checks: 3, administrative_violation_records: 1 } },
  { username: 'demo.canbo03', unit_id: '124', unit: 'Xã An Viễn', code: 'MOI_TRUONG',
    narrative: 'Tình huống AV-CXM-01: giả lập tiếp nhận 01 phản ánh về đổ chất thải tại khu vực thử. '
      + 'Đơn vị đã lập hồ sơ ban đầu, gửi nội dung và đang chờ rà soát; không sử dụng địa chỉ hoặc danh tính thật.',
    values: { patrol_officers: 8, patrol_rounds: 2, patrol_vehicles_checked: 15,
      administrative_checks: 2, administrative_violation_records: 1 } },
  { username: 'demo.canbo04', unit_id: '151', unit: 'Xã Bàu Hàm', code: 'KINH_TE',
    narrative: 'Tình huống BH-CXM-01: giả lập tiếp nhận 01 tin báo về hàng hóa chưa rõ nguồn gốc. '
      + 'Đơn vị đã ghi nhận thông tin để kiểm tra, gửi báo cáo chờ PV01 xác minh; toàn bộ số liệu là dữ liệu thử.',
    values: { patrol_officers: 4, patrol_rounds: 1, patrol_vehicles_checked: 8,
      administrative_checks: 4, administrative_violation_records: 2 } }
];

try {
  const scope = await local.request('ttttch.pv01', '/scope');
  assert.equal(scope.reportDay, '2026-11-10');
  await mkdir(output, { recursive: true });
  const planFile = path.join(output, 'plan.json');
  let plan;
  try {
    plan = JSON.parse(await readFile(planFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = { report_day: scope.reportDay, label: marker,
      reports: definitions.map(({ username, unit_id, unit, code, narrative, values }) => ({ username, unit,
        payload: { id: randomUUID(), unit_id, report_day: scope.reportDay, mode: 'INCIDENTS',
          incidents: [{ code, narrative: `${marker}\n${narrative}` }],
          values: { ...Object.fromEntries(intakeSchema.entryFields.map(([key]) => [key, 0])), ...values },
          work_domain: 'Lĩnh vực ANTT - ATXH', primitive_weapon_types: [], attachments: [] }
      })) };
    await writeFile(planFile, JSON.stringify(plan, null, 2));
  }
  assert.equal(plan.report_day, scope.reportDay);
  for (const report of plan.reports) {
    const reporter = await local.request(report.username, '/scope');
    assert.equal(String(reporter.unitId), report.payload.unit_id);
    assert.equal(reporter.beforeCutoff, true, 'Must submit during the actual reporting window');
    assert.ok(reporter.roles.includes('UNIT_REPORTER'));
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ ready: true, reports: plan.reports.length, state: 'PENDING_REVIEW' }));
  } else {
    const results = [];
    for (const report of plan.reports) {
      const submitted = await local.request(report.username, '/daily-intake', {
        method: 'POST', body: report.payload
      });
      assert.equal(submitted.state, 'PENDING_REVIEW');
      results.push({ username: report.username, unit: report.unit, ...submitted });
      await writeFile(path.join(output, 'results.json'), JSON.stringify({
        label: marker, report_day: scope.reportDay, reports: results
      }, null, 2));
      console.log('SENT — PENDING_REVIEW', report.unit);
    }
    const caseIds = results.flatMap(result => result.case_ids);
    const workIds = results.map(result => result.id);
    const cases = await pool.query(`select id,current_state from daily_report_cases
      where id=any($1::uuid[])`, [caseIds]);
    const work = await pool.query(`select id,state from daily_report_metrics where id=any($1::uuid[])`, [workIds]);
    assert.equal(cases.rowCount, 3);
    assert.equal(work.rowCount, 3);
    assert.ok(cases.rows.every(item => item.current_state === 'PENDING_REVIEW'));
    assert.ok(work.rows.every(item => item.state === 'PENDING_REVIEW'));
    const feed = await local.request('ttttch.pv01',
      `/composer/items?report_day=${scope.reportDay}&include_pending=true`);
    const pending = feed.items.filter(item => item.current_state === 'PENDING_REVIEW');
    for (const id of workIds) assert.ok(pending.some(item => item.source_id === id));
    const narratives = pending.filter(item => item.source_text.includes('CHỜ XÁC MINH'));
    assert.equal(narratives.length, 3);
    await writeFile(path.join(output, 'verification.json'), JSON.stringify({
      at: new Date().toISOString(), status: 'PASS', reports: 3, cases: cases.rowCount,
      work_results: work.rowCount, compiler: 'ttttch.pv01', state: 'PENDING_REVIEW'
    }, null, 2));
    console.log('PASS: 3 reports, 3 cases and 3 work results remain PENDING_REVIEW.');
  }
} finally {
  local.close();
  await pool.end();
}
