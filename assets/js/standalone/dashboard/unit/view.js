import { escape, date, number, count, time, icon, change } from '../format.js';
import { trendPanel } from '../trend-panel.js';
import { domainChart } from '../charts.js';
import { workPanel } from './sections.js';
import { unitSection } from '../units.js';

function metric({ key, label, value, suffix, detail, tone, symbol, footer, extra = '' }) {
  return `<article class="dash-kpi unit-kpi" data-tone="${tone}" data-unit-kpi="${key}">
    <div class="dash-kpi-label">${icon(symbol)}<h2>${label}</h2></div>
    <div class="dash-kpi-value">${count(value)}<span>${suffix}</span></div>
    ${extra}<p>${detail}</p><small>${footer}</small></article>`;
}

export function unitContent(data, trend = data) {
  const unit = data.unitDashboard;
  const period = data.span === 1 ? date(data.day) : `${date(data.from)} – ${date(data.day)}`;
  const isNormalDay = data.cases.current === 0 && (unit?.sections?.situation?.status === 'complete'
    || unit?.sections?.situation?.sent || unit?.sources?.some(s => s.kind === 'SITUATION'));
  const casesDetail = isNormalDay
    ? '<span class="dash-content-pill dash-content-normal">✓ Tình hình ngày bình thường</span>'
    : `<b>${number(data.cases.verified)}</b> đã duyệt · <b>${number(data.cases.excluded)}</b> trùng đã loại`;
  return `<div class="dash-kpis">
      ${metric({ key: 'cases', label: 'Vụ việc đã gửi', value: data.cases.current, suffix: 'vụ',
        detail: casesDetail,
        tone: isNormalDay ? 'green' : 'blue', symbol: isNormalDay ? 'shield-check' : 'files',
        footer: period, extra: change(data.cases) })}
      ${metric({ key: 'pending', label: 'Chờ duyệt', value: unit.dayCounts.pending, suffix: 'nội dung',
        detail: 'Đã gửi, đang chờ cán bộ tổng hợp xử lý', tone: 'amber', symbol: 'clock-3', footer: date(data.day) })}
      ${metric({ key: 'returned', label: 'Bị trả lại', value: unit.tasks.returned, suffix: 'nội dung',
        detail: 'Cần xem lý do, chỉnh sửa và gửi lại', tone: 'red', symbol: 'corner-up-left',
        footer: 'Chưa xử lý · đến ' + date(data.day) })}
      ${metric({ key: 'drafts', label: 'Bản nháp chưa gửi', value: unit.tasks.drafts, suffix: 'nội dung',
        detail: 'Đã lưu trên hệ thống, chưa gửi báo cáo', tone: 'violet', symbol: 'file-pen-line',
        footer: 'Chưa xử lý · đến ' + date(data.day) })}
    </div>
    <div class="dash-analysis">${trendPanel(trend)}
      <section class="dash-panel dash-domains" aria-labelledby="unitDomainsTitle">
        <header class="dash-panel-head"><div><span class="dash-overline">TÌNH HÌNH ĐỊA BÀN</span>
          <h2 id="unitDomainsTitle">Theo hệ nghiệp vụ</h2><p>${period}</p></div></header>
        <div class="dash-domain-list">${domainChart(data, trend.selectedDomain?.code)}</div>
      </section>
    </div>
    ${unit.modules.includes('input')
      ? unitSection(data, workPanel(data, period, true)) : workPanel(data, period)}
    <footer class="dash-footer">${icon('shield-check')}<span>Chỉ dữ liệu ${escape(unit.unit.name)}.
      Cập nhật lúc ${time(data.generatedAt)} · Số liệu chờ duyệt được ghi rõ theo trạng thái.</span></footer>`;
}
