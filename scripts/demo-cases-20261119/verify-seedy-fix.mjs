import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../../server/db.js';
import { createLocalRunner } from './runner.mjs';
import { directTool } from '../../server/seedy-ai/daily/planner.js';
import { executeDomainCasesTool } from '../../server/seedy-ai/daily/domain-cases.js';
import { resolvePeriod } from '../../server/seedy-ai/daily/period.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const storageRoot = path.join(root, '.private/report-files');

const local = createLocalRunner(pool, storageRoot);
local.setClockTime('2026-11-19T10:30:00+07:00');

try {
  const mockRead = async (resource, params) => {
    if (resource === 'cases') {
      let query = `
        select c.id, c.title, c.stable_code, (select name from teams where id = c.unit_id) as unit_name,
          c.business_code, c.current_state, c.summary
        from daily_report_cases c
        where c.report_day = $1
      `;
      const args = [params.from_day];
      if (params.business_code) {
        args.push(params.business_code);
        query += ` and c.business_code = $${args.length}`;
      }
      if (params.state) {
        args.push(params.state);
        query += ` and c.current_state = $${args.length}`;
      }
      query += ' order by c.unit_id, c.created_at';
      const { rows } = await pool.query(query, args);
      return { cases: rows, total: rows.length };
    }
    if (resource.startsWith('cases/')) {
      const id = resource.replace('cases/', '');
      const { rows } = await pool.query(`
        select r.reason from daily_report_returns r
        join daily_report_submissions s on s.id = r.submission_id
        where s.case_id = $1 order by r.created_at desc limit 1
      `, [id]);
      return { case: {}, returns: [{ reason: rows[0]?.reason }] };
    }
    if (resource === 'dashboard') {
      const { rows } = await pool.query(`
        select t.id, t.name, true as expected
        from teams t
        where t.id in (114, 124, 151, 113, 143, 149, 147)
        order by t.name
      `);
      return { units: rows };
    }
    return { cases: [], total: 0 };
  };

  // Test 1: Query about PPHS
  const q1 = 'hôm nay trong 7 đơn vị báo cáo lên có những đơn vị nào có vụ việc liên quan đến hệ vụ việc phạm pháp hình sự';
  assert.equal(directTool(q1, null), 'domain_cases');
  const res1 = await executeDomainCasesTool({
    query: q1,
    period: resolvePeriod(q1, '2026-11-19'),
    memory: null,
    read: mockRead,
    sources: () => []
  });
  console.log('=== TEST 1 (PPHS) OUTPUT ===');
  console.log(res1.text);

  // Test 2: Query about returned units/cases
  const q2 = 'trong ngày hôm nay đối với tất cả các đơn vị có đơn vị nào bị trả lại vụ việc ko';
  assert.equal(directTool(q2, null), 'domain_cases');
  const res2 = await executeDomainCasesTool({
    query: q2,
    period: resolvePeriod(q2, '2026-11-19'),
    memory: null,
    read: mockRead,
    sources: () => []
  });
  console.log('\n=== TEST 2 (RETURNED) OUTPUT ===');
  console.log(res2.text);

  assert.ok(res2.text.includes('có 1 đơn vị có vụ việc bị trả lại (cần bổ sung):'));
  assert.ok(res2.text.includes('• Xã Bàu Hàm (1 vụ):'));
  assert.ok(res2.text.includes('Gây ô nhiễm môi trường (Xã Bàu Hàm) — bị trả lại'));
  assert.ok(res2.text.includes('Lý do trả lại:'));
  assert.ok(res2.text.includes('Các đơn vị còn lại (6 đơn vị:'));

  console.log('\n>>> ALL REAL RUN CHECKS PASSED 100% <<<');
} finally {
  local.close();
  await pool.end();
}
