import { number, count, icon } from '../format.js';

export function workPanel(data, period, embedded = false) {
  const work = data.unitDashboard.work;
  const container = embedded ? 'div' : 'section';
  const heading = embedded ? 'h3' : 'h2';
  return `<${container} class="${embedded ? 'unit-report-work' : 'dash-panel'}"
    ${embedded ? 'role="group"' : ''} aria-labelledby="unitWorkTitle">
    <header class="${embedded ? 'unit-work-heading' : 'dash-panel-head'}"><div>
      ${embedded ? '' : '<span class="dash-overline">HOẠT ĐỘNG CỦA ĐƠN VỊ</span>'}
      <${heading} id="unitWorkTitle">Kết quả công tác</${heading}>
      ${!embedded || data.span > 1 ? `<p>${embedded ? 'Kỳ ' : ''}${period}</p>` : ''}</div></header>
    ${!work.accessible ? '<p class="dash-footnote">Cần quyền Nhập báo cáo ngày để xem kết quả công tác.</p>'
      : `<div class="unit-work-values">${work.fields.map(field => `<article data-work-field="${field.key}">
        <span class="unit-work-icon" aria-hidden="true">${icon(field.icon)}</span>
        <span class="unit-work-label">${field.label}</span>
        <strong>${field.value === null ? '—' : count(field.value)}</strong>
        <small>${field.unit}</small></article>`).join('')}</div>
      <p class="dash-footnote">${work.sourceCount
        ? `${number(work.sourceCount)} bản kết quả đã gửi: ${number(work.verified)} đã duyệt,
          ${number(work.pending)} chờ duyệt. Cộng số đã báo cáo, không tính là số người duy nhất.`
        : 'Chưa có bản kết quả công tác đã gửi trong kỳ.'}
        ${work.returned ? `${number(work.returned)} bản bị trả lại chưa được cộng vào kết quả.` : ''}
        Dấu “—”: chưa có số liệu cho chỉ tiêu; số 0: đã báo cáo bằng 0.</p>`}</${container}>`;
}
