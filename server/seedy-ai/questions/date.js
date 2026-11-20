export function normalizeQuestion(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/\bguie\b/g, 'gui').replace(/\s+/g, ' ').trim();
}

const clarify = 'Bạn muốn xem ngày nào? Hiện Seedy tra cứu tiến độ gửi theo từng ngày. '
  + 'Bạn có thể ghi “hôm nay”, “hôm qua” hoặc một ngày dạng DD/MM/YYYY.';

export function requestedDay(text, today, fallback = today) {
  const query = normalizeQuestion(text);
  const dates = [...query.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/g)];
  const written = [...query.matchAll(/\bngay (\d{1,2}) thang (\d{1,2})(?: nam (\d{4}))?\b/g)];
  const relative = [...query.matchAll(/\b(hom nay|bay gio|hien tai|hom qua|hom kia|hom truoc)\b/g)];
  if (dates.length + written.length > 1 || (dates.length + written.length && relative.length)) {
    return { clarification: clarify };
  }
  const period = /\b(tuan|quy|thang nay|thang truoc|thang vua|nam nay|nam truoc|khoang|tu ngay)\b/;
  if (period.test(query) || /\b\d+ ngay\b/.test(query)
    || /\btu .+ den\b/.test(query) || relative.length > 1) return { clarification: clarify };
  let day = fallback;
  const match = dates[0];
  const word = written[0];
  if (match || word) {
    const year = match ? (match[1] || match[6] || today.slice(0, 4)) : (word[3] || today.slice(0, 4));
    const month = match ? (match[2] || match[5]) : word[2];
    const date = match ? (match[3] || match[4]) : word[1];
    day = `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`;
    const parsed = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== day) {
      return { clarification: 'Ngày bạn ghi không hợp lệ. Bạn nhập lại ngày theo dạng DD/MM/YYYY nhé.' };
    }
  } else if (relative.length) {
    const offset = { 'hom qua': -1, 'hom truoc': -1, 'hom kia': -2 }[relative[0][1]] || 0;
    const parsed = new Date(`${today}T00:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() + offset);
    day = parsed.toISOString().slice(0, 10);
  } else if (/\b(ngay|thang|nam)\s+\d|\b(mai|ngay mot|truoc do|ngay do)\b/.test(query)) {
    return { clarification: clarify };
  }
  if (day > today) {
    return { clarification: 'Ngày này chưa đến nên chưa có tiến độ gửi. Bạn chọn hôm nay hoặc một ngày trước đó nhé.' };
  }
  return { day };
}
