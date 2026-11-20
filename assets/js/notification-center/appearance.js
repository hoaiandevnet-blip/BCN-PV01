(() => {
  const pending = new Set([
    'CASE_SUBMITTED', 'CASE_RESUBMITTED', 'SITUATION_PENDING_REVIEW', 'WORK_RESULT_PENDING_REVIEW',
    'LEGAL_CATALOG_PENDING_REVIEW', 'LEGAL_VERSION_PENDING_REVIEW'
  ]);
  const resolved = new Map([
    ['VERIFIED', 'Đã duyệt'], ['REVIEWED', 'Đã thẩm định'],
    ['PUBLISHED', 'Đã công bố'], ['APPROVED', 'Đã duyệt']
  ]);

  function describe(item) {
    const event = item.eventType || '';
    if (window.ReturnedReportAttention?.isReturned(item)) {
      return { tone: 'returned', label: event === 'CASE_SUPPLEMENT_REQUESTED' ? 'Yêu cầu bổ sung' : 'Bị trả lại',
        icon: 'corner-up-left' };
    }
    if (item.kind === 'daily-report') {
      const suffix = event.split('_').at(-1);
      if (resolved.has(suffix)) return { tone: 'success', label: resolved.get(suffix), icon: 'circle-check' };
      if (suffix === 'REJECTED') return { tone: 'returned', label: 'Từ chối', icon: 'circle-x' };
      if (suffix === 'EXPIRED') return { tone: 'warning', label: 'Hết hạn', icon: 'clock-alert' };
      if (event === 'UNLOCK_REQUESTED') return { tone: 'warning', label: 'Đề nghị mở khóa', icon: 'key-round' };
      if (pending.has(event)) return { tone: 'warning', label: 'Chờ rà soát', icon: 'clock-3' };
      if (event === 'DUPLICATE_CANDIDATE_FOUND') {
        return { tone: 'warning', label: 'Nghi trùng', icon: 'files' };
      }
      if (event === 'LATE_DATA_CHANGED_DRAFT') {
        return { tone: 'warning', label: 'Cần rà soát', icon: 'file-pen-line' };
      }
      return { tone: 'info', label: 'Cập nhật báo cáo', icon: 'file-text' };
    }
    if (item.level === 'danger') return { tone: 'returned', label: 'Cảnh báo', icon: 'triangle-alert' };
    if (item.level === 'warning') return { tone: 'warning', label: 'Lưu ý', icon: 'circle-alert' };
    return { tone: 'system', label: 'Hệ thống', icon: 'bell' };
  }

  window.NotificationAppearance = { describe };
})();
