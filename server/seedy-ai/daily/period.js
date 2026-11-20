import { requestedDay } from '../questions/date.js';

import { shiftDay as shift } from '../../daily-reports/dashboard/statistics.js';

export function resolvePeriod(query, today, fallback = today) {
  const weeks = [...query.matchAll(/\btuan (nay|truoc|vua qua)\b/g)];
  const compare = /\b(so sanh|so voi|doi chieu)\b/.test(query);
  if (weeks.length && !/\b(thang|quy|hom qua|hom kia)\b|\d+[/-]\d+/.test(query)) {
    const weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const monday = shift(today, -weekday);
    if (weeks.length === 1 || (compare && weeks.length === 2 && weeks[0][1] !== weeks[1][1])) {
      const current = weeks.some(match => match[1] === 'nay');
      return { from: current ? monday : shift(monday, -7), to: current ? today : shift(monday, -1),
        compare, weekly: true };
    }
  }
  const relative = query.match(/\b(\d{1,2}) ngay (qua|gan day)\b/);
  if (relative && Number(relative[1]) >= 1 && Number(relative[1]) <= 31
    && !/\b(tuan|thang|tu ngay|hom qua)\b|\d+[/-]\d+/.test(query)) {
    return { from: shift(today, 1 - Number(relative[1])), to: today, compare };
  }
  const range = query.match(/\btu (?:ngay )?(\d{1,2}\/\d{1,2}(?:\/\d{4})?) (?:toi|den) (?:ngay )?(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/);
  if (range) {
    const from = requestedDay(range[1], today).day;
    const to = requestedDay(range[2], today).day;
    if (from && to && from <= to && shift(from, 30) >= to) return { from, to, compare };
    return { clarification: 'Chọn hai ngày hợp lệ theo thứ tự, tối đa 31 ngày và không quá hôm nay.' };
  }
  const result = requestedDay(query, today, fallback);
  return result.day ? { from: result.day, to: result.day, compare } : result;
}

export async function progressPeriod(period, read) {
  async function count(from, to) {
    const units = new Map();
    let expected = 0;
    let submitted = 0;
    for (let day = from; day <= to; day = shift(day, 1)) {
      const data = await read('dashboard', { day, span: '1' });
      for (const unit of data.units.filter(item => item.expected)) {
        expected++;
        if (unit.status !== 'missing') {
          submitted++;
          continue;
        }
        const record = units.get(unit.id) || { name: unit.name, days: 0 };
        record.days++;
        units.set(unit.id, record);
      }
    }
    const ranking = [...units.values()].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'vi'));
    return { from, to, expected, submitted, missing: expected - submitted, ranking };
  }
  const current = await count(period.from, period.to);
  const describe = value => `${value.from} – ${value.to}: ${value.expected} lượt đơn vị cần gửi, `
    + `${value.submitted} đã gửi, ${value.missing} chưa gửi (mỗi đơn vị mỗi ngày là một lượt).`;
  const lines = [describe(current)];
  if (current.ranking.length) {
    lines.push('Xếp theo số ngày chưa gửi:');
    current.ranking.slice(0, 25).forEach(item => lines.push(`• ${item.name}: ${item.days} ngày`));
    if (current.ranking.length > 25) lines.push(`Hiển thị 25/${current.ranking.length} đơn vị.`);
  } else if (current.expected) lines.push('Không có đơn vị thiếu báo cáo trong kỳ.');
  if (period.compare) {
    const length = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86400000) + 1;
    const step = period.weekly ? 7 : length;
    const previous = await count(shift(period.from, -step), shift(period.to, -step));
    lines.push('Cùng số ngày kỳ trước: ' + describe(previous));
    const delta = current.missing - previous.missing;
    lines.push(delta ? `Lượt chưa gửi ${delta > 0 ? 'tăng' : 'giảm'} ${Math.abs(delta)}.` : 'Lượt chưa gửi bằng nhau.');
  }
  return lines.join('\n');
}
