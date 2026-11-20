import assert from 'node:assert/strict';
import { pool } from '../../server/db.js';
import { setupCommuneReportingAccounts } from './accounts.mjs';
import { seedCommuneCases } from './seed-cases.mjs';
import { loadDashboardData } from '../../server/daily-reports/dashboard/data.js';

console.log('=== BẮT ĐẦU TẠO TÀI KHOẢN VÀ SEED DỮ LIỆU BÁO CÁO CẤP XÃ ===');

const client = await pool.connect();
try {
  await client.query('begin');

  // Step 1: Accounts and permissions
  console.log('--- BƯỚC 1: XỬ LÝ TÀI KHOẢN & PHÂN QUYỀN BÁO CÁO ---');
  const accountResult = await setupCommuneReportingAccounts(client);
  console.log(`Đã bảo vệ 7 đơn vị active cũ: ${accountResult.protectedActiveUnits.length} đơn vị.`);
  console.log(`Đã cập nhật vai trò cho 12 tài khoản cũ: ${accountResult.updatedExistingUsers.length} tài khoản.`);
  console.log(`Đã tạo mới tài khoản cho 83 xã: ${accountResult.newCreatedUsers.length} tài khoản.`);
  console.log(`Tổng số đơn vị mục tiêu cần seed: ${accountResult.targetReportingUnits.length} đơn vị.`);

  // Step 2: Seed cases from 2026-11-01 to 2026-11-19
  console.log('--- BƯỚC 2: TẠO BÁO CÁO VỤ VIỆC TỪ 01/11 ĐẾN 19/11/2026 ---');
  const caseResult = await seedCommuneCases(client, accountResult.targetReportingUnits);
  console.log(`Đã tạo thành công: ${caseResult.totalInserted} vụ việc.`);
  console.log(`Đã bỏ qua (đã có): ${caseResult.totalSkipped} lượt.`);

  await client.query('commit');
  console.log('--- COMMIT GIAO DỊCH CƠ SỞ DỮ LIỆU THÀNH CÔNG ---');

  // Step 3: Verification
  console.log('--- BƯỚC 3: KIỂM CHỨNG KẾT QUẢ ---');

  const { rows: expectedUnits } = await client.query(`
    select count(*)::int as count
    from teams t
    join departments d on d.id = t.department_id
    where d.unit_type = 'Cấp xã'
      and exists (
        select 1 from daily_report_user_roles r
        join users u on u.id = r.user_id
        where r.unit_id = t.id and u.team_id = t.id and r.role_code = 'UNIT_REPORTER'
          and not u.is_deleted and u.status = 'Hoạt động'
      )
  `);
  console.log(`Số xã/phường có tài khoản báo cáo hợp lệ: ${expectedUnits[0].count} / 102 đơn vị.`);
  assert.equal(expectedUnits[0].count, 102, 'Tất cả 102 xã/phường phải có quyền báo cáo');

  const { rows: casesByDay } = await client.query(`
    select report_day::date::text as day, count(*)::int as count, count(distinct unit_id)::int as units
    from daily_report_cases
    where report_day >= '2026-11-01'
    group by report_day::date
    order by report_day::date
  `);
  console.log('\nSố liệu vụ việc báo cáo từng ngày (01/11 - 19/11):');
  console.table(casesByDay);

  const { rows: casesByDomain } = await client.query(`
    select business_code, count(*)::int as count
    from daily_report_cases
    where report_day >= '2026-11-01'
    group by business_code
    order by count desc
  `);
  console.log('\nPhân bổ vụ việc theo lĩnh vực (01/11 - 19/11):');
  console.table(casesByDomain);

  // Dashboard API verification
  const adminUser = {
    id: 1,
    username: 'admin',
    is_admin: true,
    roles: [{ role_code: 'PV01_COMPILER', unit_id: null }]
  };
  const dashData = await loadDashboardData(pool, adminUser, '2026-11-19', 1);
  const expectedCount = dashData.units.filter(u => u.expected).length;
  console.log(`\nKiểm tra API Dashboard: Tổng đơn vị expected: ${expectedCount} đơn vị.`);
  console.log(`Tổng nguồn dữ liệu nạp vào dashboard ngày 19/11: ${dashData.sources.length} bản ghi.`);

  console.log('\n=== TẤT CẢ CÁC BƯỚC ĐÃ HOÀN TẤT THÀNH CÔNG ===');
} catch (error) {
  await client.query('rollback');
  console.error('LỖI GIAO DỊCH, ĐÃ ROLLBACK:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
