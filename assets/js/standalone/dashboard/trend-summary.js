import { date, number, count, icon } from './format.js';

export function trendSummary(data) {
  const cases = data.cases;
  const currentKnown = Boolean(data.coverage.currentDays);
  const previousKnown = Boolean(data.coverage.previousDays);
  const maximum = Math.max(1, cases.current, cases.previous);
  const direction = cases.direction;
  const period = data.span === 1 ? date(data.day) : `${date(data.from)} – ${date(data.day)}`;
  const prior = data.span === 1 ? date(data.previousTo) : `${date(data.previousFrom)} – ${date(data.previousTo)}`;
  const movement = direction === 'up' ? 'Tăng' : direction === 'down' ? 'Giảm' : 'Không đổi';
  const symbol = direction === 'up' ? 'trending-up' : direction === 'down' ? 'trending-down' : 'minus';
  const percent = cases.percent === null
    ? (cases.delta === 0 ? 'Không thay đổi so với kỳ trước' : 'Phát sinh mới từ mức 0')
    : `${direction === 'flat' ? '' : 'Tương đương '}${number(Math.abs(cases.percent))}%`;
  const metric = (kind, label, value, known, range) => `<div class="dash-compare-period is-${kind}">
    <span class="dash-compare-label">${icon('calendar-days')}${label}</span>
    <time>${range}</time><div class="dash-compare-number"><strong>${known ? count(value) : '—'}</strong>
      <span>${known ? 'vụ việc' : 'Chưa có báo cáo'}</span></div>
    <div class="dash-compare-track" aria-hidden="true"><span style="width:${known ? value / maximum * 100 : 0}%">
      </span></div></div>`;
  return `<div class="dash-comparison" data-direction="${direction}">
    ${metric('current', data.span === 1 ? 'Ngày theo dõi' : 'Kỳ đang chọn', cases.current, currentKnown, period)}
    ${metric('previous', data.span === 1 ? 'Ngày liền trước' : 'Kỳ liền trước', cases.previous, previousKnown, prior)}
    <div class="dash-compare-result" role="status">
      <span class="dash-compare-label">So với ${data.span === 1 ? 'ngày' : 'kỳ'} liền trước</span>
      ${direction === 'unknown' ? `<strong class="dash-compare-empty">Chưa đủ dữ liệu</strong>
        <p>Cần báo cáo của cả hai kỳ để so sánh.</p>`
        : `<div class="dash-compare-delta">
            <span class="dash-compare-delta-icon">${icon(symbol)}</span>
            <strong>${movement}
              ${direction === 'flat' ? '' : count(Math.abs(cases.delta)) + ' vụ'}</strong></div>
          <span class="dash-compare-percent">${percent}</span>
          <p>${direction === 'flat' ? `Cả hai kỳ đều có ${number(cases.current)} vụ`
            : `Từ <b>${number(cases.previous)}</b> lên <b>${number(cases.current)}</b> vụ`
              .replace(' lên ', direction === 'down' ? ' xuống ' : ' lên ')}</p>`}
    </div>
  </div>`;
}
