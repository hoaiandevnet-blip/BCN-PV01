import { date, number, escape, icon } from './format.js';
import { trendSummary } from './trend-summary.js';
import { trendLevelLegend } from './trend-levels.js';

export function trendPanel(data) {
  const series = data.series;
  const reported = series.filter(point => point.hasCurrent);
  const highest = reported.length ? Math.max(...reported.map(point => point.current)) : null;
  const peakDays = reported.filter(point => point.current === highest);
  const peak = peakDays.length === 1 ? date(peakDays[0].day) : `${peakDays.length} ngày`;
  const range = `${date(series[0].day)} – ${date(series.at(-1).day)}`;
  const colorLegend = data.selectedDomain
    ? `<div class="dash-trend-levels" aria-label="Màu cột so với ngày đối chiếu">
        <span class="dash-domain-color-key"><i aria-hidden="true"></i>${escape(data.selectedDomain.label)}</span>
        <span class="dash-domain-decrease-key"><i aria-hidden="true"></i>Giảm so với ngày đối chiếu</span>
      </div>`
    : trendLevelLegend(series);
  return `<section class="dash-panel dash-chart-panel" id="dashTrendPanel" aria-labelledby="dashTrendTitle"
    ${data.selectedDomain ? `data-domain="${escape(data.selectedDomain.code)}"` : ''}>
    <header class="dash-panel-head dash-trend-heading">
      <div class="dash-trend-heading-main"><span class="dash-trend-symbol">${icon('chart-no-axes-combined')}</span>
        <div><span class="dash-overline">DIỄN BIẾN VỤ VIỆC</span>
          <h2 id="dashTrendTitle">Xu hướng ${series.length} ngày</h2></div></div>
      <span class="dash-trend-range">${icon('calendar-days')}<span>${range}</span></span>
    </header>
    <div class="dash-trend-filter">
      <span role="status" aria-live="polite" data-trend-domain>
        ${escape(data.selectedDomain?.label || 'Tất cả hệ nghiệp vụ')}</span>
      ${data.selectedDomain ? '<button type="button" class="ghost" data-domain-reset>Xem tất cả</button>'
        : '<span class="dash-trend-filter-hint">Chọn một hệ để xem chi tiết</span>'}
    </div>
    ${trendSummary(data)}
    <div class="dash-trend-toolbar"><div class="dash-trend-legend">
      <span><i class="dash-trend-key-bars"></i>Vụ việc ghi nhận</span>
      <span><i class="dash-trend-key-current" aria-hidden="true"></i>Xu hướng trong kỳ</span>
      <span><i class="dash-trend-key-line"></i>Đối chiếu: ${data.span === 1
        ? 'ngày liền trước' : `lùi ${data.span} ngày`}</span>
      </div><span class="dash-trend-unit">Đơn vị: vụ</span></div>
    ${colorLegend}
    <div class="dash-trend-plot" data-trend-plot>
      <div class="dash-trend-canvas" data-trend-canvas></div>
      <div class="dash-trend-tooltip" id="dashTrendTooltip" role="tooltip" hidden></div>
      <p class="dash-sr-only" id="dashTrendHelp">Rê chuột hoặc chạm để xem chi tiết.
        Dùng phím mũi tên trái, phải để chuyển ngày; Escape để đóng thông tin.</p>
    </div>
    <div class="dash-trend-insights">
      <div>${icon('chart-column-increasing')}<span>Cao nhất trong biểu đồ
        <strong>${highest === null ? 'Chưa có dữ liệu' : `${number(highest)} vụ <small>· ${peak}</small>`}</strong>
      </span></div>
      <div>${icon('calendar-check-2')}<span>Độ phủ dữ liệu
        <strong>${reported.length}<small>/ ${series.length} ngày có báo cáo</small></strong></span></div>
    </div>
  </section>`;
}

function trendFooterIcon(direction) {
  if (direction === 'up') {
    return `<svg class="dash-tooltip-trend-icon" viewBox="0 0 16 16" width="12" height="12"
      fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 3 13 L 13 3 M 6 3 L 13 3 L 13 10"/></svg>`;
  }
  if (direction === 'down') {
    return `<svg class="dash-tooltip-trend-icon" viewBox="0 0 16 16" width="12" height="12"
      fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 3 3 L 13 13 M 6 13 L 13 13 L 13 6"/></svg>`;
  }
  if (direction === 'flat') {
    return `<svg class="dash-tooltip-trend-icon" viewBox="0 0 16 16" width="12" height="12"
      fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 2 8 L 14 8 M 9 4 L 14 8 L 9 12"/></svg>`;
  }
  return `<svg class="dash-tooltip-trend-icon" viewBox="0 0 16 16" width="12" height="12"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="8" y1="4.5" x2="8.01" y2="4.5"/>
  </svg>`;
}

export function trendTooltip(point) {
  const comparable = point.hasCurrent && point.hasPrevious;
  const delta = point.current - point.previous;
  const direction = !comparable ? 'unknown' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const percentage = point.previous ? Math.abs(delta / point.previous * 100) : null;
  const difference = !comparable ? 'Chưa đủ dữ liệu so sánh'
    : delta === 0 ? 'Không thay đổi' : `${delta > 0 ? 'Tăng' : 'Giảm'} ${number(Math.abs(delta))} vụ`
      + (percentage === null ? ' · Phát sinh mới' : ` · ${number(percentage)}%`);
  const statusBadge = point.hasCurrent
    ? '<span class="dash-tooltip-badge is-ok">Đã ghi nhận</span>'
    : '<span class="dash-tooltip-badge is-missing">Chưa nộp</span>';
  return `<header><div class="dash-tooltip-date">
      <svg class="dash-tooltip-cal" viewBox="0 0 24 24" width="13" height="13" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
        <line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>
        <line x1="3" x2="21" y1="10" y2="10"/>
      </svg>
      <span>${date(point.day)}</span></div>${statusBadge}</header>
    <div><span><i class="dash-trend-key-bars"></i>Ghi nhận</span>
      <strong>${point.hasCurrent ? number(point.current) + ' vụ' : 'Chưa có báo cáo'}</strong></div>
    <div><span><i class="dash-trend-key-line"></i>${date(point.previousDay)}</span>
      <strong>${point.hasPrevious ? number(point.previous) + ' vụ' : 'Chưa có báo cáo'}</strong></div>
    <footer data-direction="${direction}">${trendFooterIcon(direction)}<span>${escape(difference)}</span></footer>`;
}
