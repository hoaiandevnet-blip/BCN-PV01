export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const numericFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
export const number = value => numericFormat.format(value);
export function count(value) {
  const formatted = number(value);
  const target = Number(value);
  return Number.isFinite(target) && target !== 0
    ? `<bdi data-count-to="${target}">${formatted}</bdi>` : formatted;
}
export const date = value => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
export const timestampDate = value => value ? new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric'
}).format(new Date(value)) : '—';
export const time = value => value ? new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date(value)) : '—';
export const localDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
export const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const states = {
  missing: ['Chưa gửi', 'circle-dashed'], complete: ['Đã gửi đủ', 'circle-check'],
  partial: ['Gửi một phần', 'circle-dot'], returned: ['Cần bổ sung', 'circle-alert']
};
export const sourceStates = {
  SUBMITTED: 'Đã gửi', PENDING_REVIEW: 'Chờ duyệt', RESUBMITTED: 'Đã gửi lại',
  VERIFIED: 'Đã duyệt', RETURNED: 'Bị trả lại'
};
export function change(item) {
  if (item.direction === 'unknown') return '<span class="dash-change">Chưa có đủ dữ liệu so sánh</span>';
  const symbol = item.direction === 'up' ? 'trending-up' : item.direction === 'down' ? 'trending-down' : 'minus';
  const delta = item.delta > 0 ? '+' + number(item.delta) : number(item.delta);
  const percent = item.percent === null ? (item.delta > 0 ? 'Phát sinh mới' : 'Không đổi')
    : (item.percent > 0 ? '+' : '') + number(item.percent) + '%';
  return `<span class="dash-change" data-direction="${item.direction}">${icon(symbol)}
    <b>${delta}</b><span>${percent}</span></span>`;
}
