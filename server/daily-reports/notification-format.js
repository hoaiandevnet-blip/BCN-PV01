import { cleanReportText } from '../../assets/js/daily-reports-report-text.mjs';

const titles = {
  CASE_SUBMITTED: 'Đơn vị gửi hồ sơ chờ rà soát',
  CASE_RESUBMITTED: 'Đơn vị đã bổ sung và gửi lại hồ sơ',
  CASE_RETURNED: 'Hồ sơ bị trả lại, cần bổ sung',
  CASE_SUPPLEMENT_REQUESTED: 'PV01 yêu cầu bổ sung thông tin vụ việc',
  CASE_VERIFIED: 'Hồ sơ đã được duyệt',
  CASE_EVENT_UPDATED: 'Có nội dung cập nhật vụ việc',
  CASE_DECISION_ADDED: 'Đơn vị bổ sung quyết định',
  CASE_EVENT_VERIFIED: 'Diễn biến đã được duyệt',
  UNLOCK_REQUESTED: 'Đơn vị yêu cầu mở khóa để cập nhật / bổ sung',
  UNLOCK_APPROVED: 'Yêu cầu mở khóa đã được duyệt trong 30 phút',
  UNLOCK_REJECTED: 'Yêu cầu mở khóa bị từ chối',
  UNLOCK_EXPIRED: 'Quyền mở khóa đã hết hạn',
  SOURCE_RETURNED: 'Nội dung bị trả lại, cần bổ sung',
  LATE_DATA_CHANGED_DRAFT: 'Nguồn báo cáo thay đổi, cần rà soát bản tổng hợp',
  DUPLICATE_CANDIDATE_FOUND: 'Phát hiện hồ sơ có khả năng trùng liên ngày',
  LEGAL_CATALOG_PENDING_REVIEW: 'Danh mục pháp luật chờ thẩm định',
  LEGAL_DRAFT_DISCARDED: 'Bản nháp danh mục pháp luật đã được hủy'
};
const states = {
  DRAFT: 'có nội dung mới', UPDATED: 'đã cập nhật nội dung', PENDING_REVIEW: 'chờ duyệt',
  RETURNED: 'bị trả lại, cần bổ sung', VERIFIED: 'đã duyệt',
  REVIEWED: 'đã thẩm định', PUBLISHED: 'đã công bố', RETIRED: 'ngừng áp dụng'
};
function title(row) {
  if (['CASE_SUPPLEMENT', 'REPORT_SUPPLEMENT'].includes(row.safe_payload?.purpose)) {
    const names = { UNLOCK_REQUESTED: 'Đơn vị đề nghị bổ sung báo cáo',
      UNLOCK_APPROVED: 'Trung tâm đã duyệt đề nghị bổ sung', UNLOCK_REJECTED: 'Đề nghị bổ sung bị từ chối' };
    if (names[row.event_type]) return names[row.event_type];
  }
  if (titles[row.event_type]) return titles[row.event_type];
  for (const [prefix, label] of [['SITUATION', 'Tình hình khiếu kiện'],
    ['WORK_RESULT', 'Kết quả công tác'], ['LEGAL_VERSION', 'Phiên bản pháp luật']]) {
    if (row.event_type.startsWith(prefix + '_')) {
      return `${label} ${states[row.event_type.slice(prefix.length + 1)] || 'có thay đổi'}`;
    }
  }
  return 'Báo cáo ngày có cập nhật';
}
const dateKey = value => !value ? '' : value instanceof Date || /T\d{2}:/.test(String(value))
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : String(value).slice(0, 10);
const displayDay = value => dateKey(value).split('-').reverse().join('/');

export function formatDailyNotification(row) {
  const day = dateKey(row.safe_payload?.report_day || row.report_day);
  const originalDay = dateKey(row.original_day);
  const decision = row.safe_payload?.decision_number || row.decision_number;
  const parts = [row.unit_name, cleanReportText(row.case_title)];
  if (row.safe_payload?.reason) parts.push(cleanReportText(row.safe_payload.reason));
  if (row.business_code === 'TINH_HINH_KHAC') parts.push('Tình hình khác');
  if (originalDay && originalDay !== day) parts.push(`Hồ sơ ngày ${displayDay(originalDay)}`);
  if (decision) parts.push(`Quyết định số ${decision}`);
  if (day) parts.push(`Ngày báo cáo ${displayDay(day)}`);
  if (row.unlock_reason) parts.push(cleanReportText(row.unlock_reason).slice(0, 240));
  if (row.metric_code) parts.push(row.metric_code);
  if (row.document_number) parts.push(row.document_number);
  const view = row.resource_type === 'UNLOCK_REQUEST' ? 'unlock'
    : row.resource_type === 'LEGAL_VERSION' ? 'legal'
    : row.resource_type === 'DRAFT' ? 'composer'
    : ['CASE_SUBMITTED', 'CASE_RESUBMITTED', 'CASE_PENDING_REVIEW', 'CASE_EVENT_UPDATED', 'CASE_DECISION_ADDED',
      'WORK_RESULT_PENDING_REVIEW'].includes(row.event_type) ? 'approval'
    : ['SITUATION', 'WORK_RESULT'].includes(row.resource_type) ? 'input'
    : ['CASE_RETURNED', 'CASE_SUPPLEMENT_REQUESTED'].includes(row.event_type) ? 'returned'
    : row.resource_type === 'CASE_EVENT' ? 'updates' : 'registry';
  return {
    id: `bcn:${row.id}`, kind: 'daily-report', eventType: row.event_type,
    unitName: row.unit_name || '',
    title: title(row), message: parts.filter(Boolean).join(' · '), label: 'Báo cáo ngày',
    level: /RETURNED|REJECTED|EXPIRED|CHANGED|DUPLICATE/.test(row.event_type) ? 'warning' : 'info',
    target: 'dailyReports', createdAt: new Date(row.created_at).getTime(), read: row.is_read === true,
    dailyReportRef: { view, resourceType: row.resource_type, resourceId: row.resource_id,
      caseId: row.case_id || null, eventId: row.resource_type === 'CASE_EVENT' ? row.resource_id : null,
      reportDay: day, unitId: row.source_unit_id || null }
  };
}
