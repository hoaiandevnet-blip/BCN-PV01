import { escape, date, number, count, time, timestampDate, localDay, icon, change } from './format.js';
import { domainChart } from './charts.js';
import { trendPanel } from './trend-panel.js';
import { unitSection } from './units.js';

export function dashboardShell(account, allowed) {
  return `<div class="bcn-dashboard">
    <header class="dash-header"><div><span class="dash-overline">TRUNG TÂM THEO DÕI BÁO CÁO</span>
      <h1>Tổng quan báo cáo ngày</h1><p>Xin chào, ${escape(account.full_name)}.
      Theo dõi tiếp nhận và diễn biến vụ việc trong phạm vi được giao.</p></div>
      <div class="dash-header-actions">${allowed('dailyReports')
        ? `<button class="ghost" data-dashboard-open="dailyReports">${icon('files')}<span>Không gian báo cáo</span></button>` : ''}
        ${account.is_admin ? `<button class="ghost" data-dashboard-open="digitalMap">
          ${icon('map-pinned')}<span>Bản đồ số</span></button>` : ''}</div></header>
    <div class="dash-controls"><label>Ngày theo dõi<input type="date" id="dashDay"
      value="${localDay()}" max="${localDay()}" required/></label>
      <div class="dash-period"><span>Kỳ thống kê vụ việc</span><div role="group" aria-label="Kỳ thống kê vụ việc">
        <button data-span="1" aria-pressed="true">Trong ngày</button>
        <button data-span="7" aria-pressed="false">7 ngày</button>
        <button data-span="30" aria-pressed="false">30 ngày</button></div></div>
      <div class="dash-refresh"><span id="dashRefreshTime" role="status">Đang tải dữ liệu…</span>
        <button class="ghost" id="dashRefresh" aria-label="Cập nhật dashboard">${icon('refresh-cw')}<span>Cập nhật</span></button>
      </div></div><div id="dashData" aria-busy="true"></div></div>`;
}

export function loadingView() {
  return `<div class="dash-loading" role="status">${icon('loader-circle')}
    Đang tổng hợp tiến độ và số liệu báo cáo…</div>`;
}

export function dashboardContent(data, trend = data) {
  const progress = data.progress;
  const period = data.span === 1 ? date(data.day) : `${date(data.from)} – ${date(data.day)}`;
  const sentText = progress.percent === null
    ? 'Chưa có đơn vị được giao'
    : `<b>${progress.percent}%</b> đã gửi`;
  const prevCases = data.coverage.previousDays
    ? `<b>${number(data.cases.previous)}</b>`
    : 'chưa có báo cáo';
  const normalUnits = (data.units || []).filter(u => u.counts.cases === 0 && (u.counts.situations > 0
    || u.items?.some(i => i.kind === 'SITUATION'))).length;
  return `<div class="dash-kpis">
    <article class="dash-kpi" data-tone="green"><div class="dash-kpi-label">${icon('send')}<h2>Đơn vị đã gửi</h2></div>
      <div class="dash-kpi-value">${count(progress.submitted)}<span>/ <b>${number(progress.expected)}</b></span></div>
      <div class="dash-progress" role="progressbar" aria-label="Tỷ lệ đơn vị đã gửi" aria-valuemin="0"
        aria-valuemax="100" aria-valuenow="${progress.percent || 0}"><span style="width:${progress.percent || 0}%"></span></div>
      <p>${sentText} · <b>${progress.complete}</b> đơn vị đủ nội dung</p><small>Ngày ${date(data.day)}</small></article>
    <article class="dash-kpi" data-tone="amber"><div class="dash-kpi-label">${icon('clock-3')}<h2>Đơn vị chưa gửi</h2></div>
      <div class="dash-kpi-value">${count(progress.missing)}<span>đơn vị</span></div>
      <p><b>${progress.partial}</b> gửi một phần · <b>${progress.returned}</b> cần bổ sung</p>
      <button class="dash-text-button" data-jump-missing>Xem đơn vị chưa gửi ${icon('arrow-right')}</button>
      <small>Ngày ${date(data.day)}</small></article>
    <article class="dash-kpi" data-tone="blue" data-direction="${data.cases.direction}">
      <div class="dash-kpi-label">${icon('files')}<h2>Vụ việc tiếp nhận</h2></div>
      <div class="dash-kpi-value">${count(data.cases.current)}<span>vụ việc</span></div>
      ${change(data.cases)}<p><b>${data.cases.verified}</b> đã duyệt · ${normalUnits
        ? `<b>${normalUnits}</b> đơn vị tình hình bình thường`
        : `Kỳ trước: ${prevCases}`}</p>
      <small>${period}</small></article>
    <article class="dash-kpi" data-tone="violet"><div class="dash-kpi-label">${icon('scan-search')}
      <h2>Nội dung chờ duyệt</h2></div><div class="dash-kpi-value">${count(progress.pending)}<span>nội dung</span></div>
      <p>Vụ việc, tình hình và kết quả công tác</p><p><b>${number(progress.verified)}</b> nội dung đã duyệt</p>
      <small>Ngày ${date(data.day)}</small></article></div>
    <div class="dash-analysis">${trendPanel(trend)}
    <section class="dash-panel dash-domains" aria-labelledby="dashDomainsTitle">
      <header class="dash-panel-head"><div class="dash-trend-heading-main">
        <span class="dash-trend-symbol">${icon('chart-bar')}</span>
        <div><span class="dash-overline">PHÂN BỐ NGHIỆP VỤ</span>
          <h2 id="dashDomainsTitle">Vụ việc theo hệ</h2></div></div>
        <span class="dash-period-label">${data.domains.length} hệ</span></header>
      <div class="dash-domain-list">${domainChart(data, trend.selectedDomain?.code)}</div></section></div>
    ${unitSection(data)}
    <footer class="dash-footer">${icon('shield-check')} Dữ liệu theo phạm vi phân quyền.
      Cập nhật ${time(data.generatedAt)} · ${timestampDate(data.generatedAt)}
      · Tự làm mới mỗi 60 giây khi đang xem.</footer>`;
}
