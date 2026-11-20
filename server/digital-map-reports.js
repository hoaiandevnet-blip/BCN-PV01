import { readFileSync } from 'node:fs';
import { reportDay, isValidReportDay } from './daily-reports/rules.js';
import { domains, shiftDay } from './daily-reports/dashboard/statistics.js';
import { canonicalBusinessCode } from './daily-reports/business-codes.js';

const provinces = JSON.parse(readFileSync(new URL('../assets/data/vietnam-provinces-wards.json', import.meta.url)));
const dongNai = provinces.find(province => String(province.code) === '75');
const official = new Map(dongNai.wards.map(ward => [String(ward.code), ward.name]));
const normalize = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('vi-VN').trim();
const shortName = value => normalize(value).replace(/^(phường|xã|thị trấn)\s+/u, '');
const provinceName = value => normalize(value).replace(/^(tỉnh|thành phố|tp\.?)\s+/u, '');
const statuses = {
  VERIFIED: 'Đã duyệt', PENDING_REVIEW: 'Chờ duyệt', RESUBMITTED: 'Gửi lại', SUBMITTED: 'Đã gửi'
};

function uniqueWard(name, index) {
  const matches = index.byExactName.get(normalize(name)) || index.byExactName.get(shortName(name));
  return matches?.length === 1 ? matches[0] : null;
}

export function locateReport(row, index) {
  if (row.province || row.province_name) {
    const local = row.province ? String(row.province) === '75' : provinceName(row.province_name) === 'đồng nai';
    if (!local) return { area: 'outside' };
    const name = row.official_code ? official.get(String(row.official_code)) : row.ward_name;
    const ward = name && uniqueWard(name, index);
    return ward ? { area: 'mapped', ward } : { area: 'unknown' };
  }
  // Historical free text is usable only when both administrative components identify one local ward.
  const parts = String(row.legacy || '').split(/[,;]/u).map(normalize);
  if (provinceName(parts.at(-1)) !== 'đồng nai') return { area: 'unknown' };
  const ward = parts.length > 1 && uniqueWard(parts.at(-2), index);
  return ward ? { area: 'mapped', ward } : { area: 'unknown' };
}

export function comparisonWindow(query, today = reportDay(new Date())) {
  const to = query.to ?? today;
  if (typeof to !== 'string' || !isValidReportDay(to) || to > today || to < '1900-01-01') return null;
  const from = query.from ?? shiftDay(to, -29);
  if (typeof from !== 'string' || !isValidReportDay(from) || from > to || from < '1900-01-01') return null;
  const days = 1 + Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  return { from, to, previousFrom: shiftDay(from, -days), previousTo: shiftDay(from, -1), days };
}

export async function readMapReports(pool, period, index) {
  const { rows } = await pool.query(`
    select report_day >= $2::date as current, business_code, current_state,
      location_address->>'province_code' as province, location_address->>'province_name' as province_name,
      location_address->>'ward_code' as official_code, location_address->>'ward_name' as ward_name,
      case when coalesce(location_address->>'province_code', location_address->>'province_name', '') = ''
        then location_general end as legacy,
      report_day - (case when report_day >= $2::date then $2::date else $1::date end) as day_index,
      count(*)::int as count
    from daily_report_cases
    where report_day between $1::date and $3::date
      and current_state in ('SUBMITTED','PENDING_REVIEW','RESUBMITTED','VERIFIED')
      and coalesce(duplicate_state,'') not in ('DUPLICATE_NO_RECOUNT','APPEND_EVENT_TO_EXISTING')
    group by 1,2,3,4,5,6,7,8,9
    `, [period.previousFrom, period.from, period.to]);
  const groups = new Map();
  for (const row of rows) {
    const { area, ward } = locateReport(row, index);
    const category = domains[canonicalBusinessCode(row.business_code)] || 'Chưa phân hệ';
    const status = statuses[row.current_state];
    const key = JSON.stringify([row.day_index, area, ward?.code, category, status]);
    const group = groups.get(key) || { area, ward_code: ward?.code ?? null, ward_name: ward?.name ?? null,
      dayIndex: row.day_index, category, status, current: 0, previous: 0 };
    group[row.current ? 'current' : 'previous'] += row.count;
    groups.set(key, group);
  }
  return { period, rows: [...groups.values()] };
}
