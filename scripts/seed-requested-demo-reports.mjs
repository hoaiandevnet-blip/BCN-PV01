import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../server/db.js';
import { intakeSchema } from '../server/daily-reports/intake/validation.js';
import { createLocalReportRequest } from './lib/local-report-request.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs/demo-reports-20261110');
const local = createLocalReportRequest(pool, path.join(root, '.private/report-files'));
const request = local.request;
const marker = 'BÁO CÁO THỬ — dữ liệu giả lập để tập tổng hợp, không phải vụ việc thực tế.';
const note = text => `${marker}\n${text}`;
const definitions = [
  {
    username: 'demo.canbo02', unit_id: '114', unit_name: 'Xã An Phước', mode: 'INCIDENTS',
    incidents: [
      { code: 'TTXH', narrative: note('Tình huống AP-01: giả lập tiếp nhận 01 tin báo mất tài sản tại '
        + 'địa điểm thử. Đã ghi nhận thông tin, xác minh ban đầu và thu hồi 01 tài sản giả định. '
        + 'Không sử dụng danh tính, địa chỉ hoặc hồ sơ của người thật.') },
      { code: 'MA_TUY', narrative: note('Tình huống AP-02: giả lập tiếp nhận 01 vụ việc nghi vấn về ma túy. '
        + 'Đã lập hồ sơ ban đầu, chuyển bộ phận chuyên môn và đang chờ kết quả xác minh. '
        + 'Mọi tình tiết và số liệu chỉ phục vụ thử chức năng tổng hợp.') }
    ],
    values: { primitive_weapons: 2, community_sentences: 3, released_prisoners: 2,
      suspected_drug_users: 1, administrative_checks: 6, administrative_violation_records: 2,
      administrative_penalty_decisions: 1, administrative_fines: 1500000,
      patrol_officers: 8, patrol_rounds: 2, patrol_vehicles_checked: 20,
      patrol_vehicles_detained: 1, patrol_violations: 2, patrol_documents_detained: 1 }
  },
  {
    username: 'demo.canbo03', unit_id: '124', unit_name: 'Xã An Viễn', mode: 'INCIDENTS',
    incidents: [
      { code: 'GIAO_THONG', narrative: note('Tình huống AV-01: giả lập 01 vụ va chạm giao thông giữa '
        + '02 phương tiện tại tuyến đường thử; không có người chết hoặc bị thương. '
        + 'Đã phân luồng giao thông, ghi nhận hiện trường và hướng dẫn các bên giải quyết. '
        + 'Không sử dụng biển số hoặc danh tính thật.') }
    ],
    values: { community_sentences: 2, released_prisoners: 1, delinquent_youth: 2,
      administrative_checks: 4, administrative_violation_records: 1,
      patrol_officers: 10, patrol_rounds: 3, patrol_vehicles_checked: 30, patrol_violations: 1 }
  },
  {
    username: 'demo.canbo04', unit_id: '151', unit_name: 'Xã Bàu Hàm', mode: 'NORMAL', incidents: [],
    situation_narrative: note('Tình huống BH-01: giả lập ngày bình thường, không phát sinh vụ việc. '
      + 'Đơn vị duy trì tuần tra, kiểm soát và công tác quản lý địa bàn theo các chỉ tiêu thử kèm theo.'),
    values: { community_sentences: 1, released_prisoners: 2, community_rehabilitation: 1,
      administrative_checks: 3, patrol_officers: 6, patrol_rounds: 2, patrol_vehicles_checked: 12 }
  }
];

try {
  const scope = await request('ttttch.pv01', '/scope');
  assert.ok(scope.roles.includes('PV01_COMPILER') && scope.compilerModules.includes('composer'));
  assert.equal(scope.reportDay, '2026-11-10', 'This requested demo is only for 10/11/2026');
  await mkdir(output, { recursive: true });
  const planFile = path.join(output, 'plan.json');
  let plan;
  try {
    plan = JSON.parse(await readFile(planFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = { label: marker, report_day: scope.reportDay, compiler: 'ttttch.pv01',
      reports: definitions.map(({ username, unit_id, unit_name, mode, incidents, situation_narrative, values }) => ({
        username, unit_name, payload: {
          id: randomUUID(), unit_id, report_day: scope.reportDay, mode, incidents,
          ...(situation_narrative ? { situation_narrative } : {}),
          work_domain: 'Lĩnh vực ANTT - ATXH',
          values: { ...Object.fromEntries(intakeSchema.entryFields.map(([key]) => [key, 0])), ...values },
          primitive_weapon_types: values.primitive_weapons ? ['Dao (số liệu thử)'] : [], attachments: []
        }
      })) };
    await writeFile(planFile, JSON.stringify(plan, null, 2));
  }
  assert.equal(plan.report_day, scope.reportDay);
  for (const report of plan.reports) {
    const unitScope = await request(report.username, '/scope');
    assert.equal(String(unitScope.unitId), report.payload.unit_id);
    assert.ok(unitScope.roles.includes('UNIT_REPORTER'));
    assert.equal(unitScope.beforeCutoff, true, 'Demo submission requires the real reporting window');
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ plan: planFile, reports: plan.reports.length, ready: true }, null, 2));
  } else {
    const results = [];
    for (const report of plan.reports) {
      const submitted = await request(report.username, '/daily-intake', { method: 'POST', body: report.payload });
      const resources = [
        ...submitted.case_ids.map(id => ['cases', id]),
        ['work-results', submitted.id],
        ...(submitted.situation_id ? [['situations', submitted.situation_id]] : [])
      ];
      for (const [resource, id] of resources) {
        const table = { cases: 'daily_report_cases', 'work-results': 'daily_report_metrics',
          situations: 'daily_report_situations' }[resource];
        const column = resource === 'cases' ? 'current_state' : 'state';
        const { rows: [stored] } = await pool.query(`select ${column} as state from ${table} where id=$1`, [id]);
        if (stored.state !== 'VERIFIED') await request('admin', `/${resource}/${id}/verify`, { method: 'POST', body: {} });
      }
      results.push({ username: report.username, unit: report.unit_name, ...submitted, state: 'VERIFIED' });
      await writeFile(path.join(output, 'results.json'), JSON.stringify({
        label: marker, report_day: scope.reportDay, reports: results
      }, null, 2));
      console.log('CREATED', report.unit_name, submitted.id);
    }
    const feed = await request('ttttch.pv01', `/composer/items?report_day=${scope.reportDay}`);
    const expected = results.reduce((total, result) => total + result.case_ids.length + 1
      + Number(Boolean(result.situation_id)), 0);
    assert.equal(feed.items.length, expected);
    assert.ok(feed.items.every(item => item.current_state === 'VERIFIED'));
    assert.ok(feed.items.filter(item => item.source_type !== 'WORK_RESULT')
      .every(item => item.source_text.includes('BÁO CÁO THỬ')));
    await writeFile(path.join(output, 'compiler-feed.json'), JSON.stringify(feed, null, 2));
    console.log(JSON.stringify({ report_day: scope.reportDay, reports: results.length,
      composer_items: feed.items.length, compiler: 'ttttch.pv01', status: 'READY' }, null, 2));
  }
} finally {
  local.close();
  await pool.end();
}
