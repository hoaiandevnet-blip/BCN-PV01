(() => {
  'use strict';
  const domains = {
    PPHS: 'Phạm pháp hình sự', TNXH: 'Tệ nạn xã hội', MA_TUY: 'Ma túy', KINH_TE: 'Kinh tế, chức vụ',
    MOI_TRUONG: 'Môi trường', ANQG: 'An ninh quốc gia', CONG_NGHE_CAO: 'Công nghệ cao',
    HOAT_DONG_TU_PHAP: 'Hoạt động tư pháp', TINH_HINH_KHAC: 'Tình hình khác'
  };
  const businessAliases = {
    KHAC: 'PPHS', PCCC_CNCH: 'PPHS', TNGT: 'PPHS', TTXH: 'PPHS', THAM_NHUNG: 'KINH_TE'
  };
  const canonicalBusinessCode = code => Object.hasOwn(businessAliases, code) ? businessAliases[code] : code;
  const domainName = code => domains[canonicalBusinessCode(code)];
  const states = { DRAFT: 'Bản nháp', SUBMITTED: 'Đã gửi', PENDING_REVIEW: 'Chờ duyệt',
    RESUBMITTED: 'Đã gửi lại', RETURNED: 'Đã trả lại – chờ bổ sung', VERIFIED: 'Đã duyệt',
    REQUESTED: 'Chờ PV01', APPROVED: 'Đang mở khóa', REJECTED: 'Từ chối', EXPIRED: 'Đã hết hạn',
    REVIEWED: 'Đã thẩm định', PUBLISHED: 'Đã công bố', RETIRED: 'Ngừng áp dụng',
    REFERENCE: 'Bản tra cứu kèm theo' };
  const roles = { UNIT_REPORTER: 'Đơn vị báo cáo', PV01_COMPILER: 'Cán bộ tổng hợp PV01',
    LEGAL_REVIEWER: 'Thẩm định pháp luật', AUDITOR: 'Kiểm tra nhật ký' };
  const actions = { CASE_CREATED: 'Tạo hồ sơ', CASE_UPDATED: 'Cập nhật hồ sơ', CASE_SUBMITTED: 'Gửi hồ sơ',
    ATTACHMENT_ADDED: 'Bổ sung văn bản đính kèm', ATTACHMENT_REMOVED: 'Xóa văn bản nháp',
    ATTACHMENT_DOWNLOADED: 'Mở / tải văn bản đính kèm',
    CASE_RETURNED: 'Trả lại hồ sơ', CASE_VERIFIED: 'Duyệt hồ sơ', CASE_RESUBMITTED: 'Gửi lại hồ sơ',
    CASE_EVENT_VERIFIED: 'Duyệt diễn biến', CASE_EVENT_UPDATED: 'Có diễn biến mới',
    PRIOR_DAY_CASE_UPDATED: 'Bổ sung diễn biến hồ sơ', UNLOCK_REQUESTED: 'Yêu cầu mở khóa',
    UNLOCK_APPROVED: 'Đã duyệt mở khóa', UNLOCK_REJECTED: 'Từ chối mở khóa', UNLOCK_EXPIRED: 'Mở khóa hết hạn',
    DRAFT_ITEMS_UPDATED: 'Lưu nội dung biên tập', DRAFT_STALE: 'Bản nháp cần rà soát nguồn mới',
    DOCX_EXPORTED: 'Xuất Word', LEGAL_IMPORTED: 'Nhập danh mục pháp luật',
    LEGAL_CATALOG_PENDING_REVIEW: 'Danh mục pháp luật chờ thẩm định', LEGAL_DRAFT_DISCARDED: 'Hủy bản nhập nháp',
    APPEND_EVENT_TO_EXISTING: 'Bổ sung vào hồ sơ cũ', DUPLICATE_NO_RECOUNT: 'Loại đếm trùng',
    SEPARATE_CASE: 'Xác nhận hồ sơ độc lập', PPHS_COUNT_CONFIRMED: 'Xác nhận thống kê PPHS' };
  const action = code => {
    if (actions[code]) return actions[code];
    const read = String(code).match(/^GET:\/api\/bao-cao-ngay\/(.+)/);
    if (read) {
      const labels = { scope: 'phạm vi phân công', overview: 'tổng quan', cases: 'hồ sơ vụ việc',
        'unlock-requests': 'yêu cầu mở khóa', configuration: 'cấu hình nghiệp vụ',
        'metric-definitions': 'bộ chỉ tiêu', units: 'đơn vị báo cáo', legal: 'danh mục pháp luật',
        'work-results': 'kết quả công tác', situations: 'tình hình khiếu kiện',
        drafts: 'bản nháp báo cáo', leaders: 'danh sách lãnh đạo', audit: 'lịch sử xử lý',
        notifications: 'thông báo', duplicates: 'đối chiếu trùng' };
      return 'Tra cứu ' + (labels[read[1].split('/')[0]] || 'dữ liệu nghiệp vụ');
    }
    for (const [prefix, label] of [['WORK_RESULT', 'Kết quả công tác'], ['SITUATION', 'Tình hình'],
      ['LEGAL_VERSION', 'Phiên bản pháp luật']]) {
      if (String(code).startsWith(prefix + '_')) return label + ' · ' + (states[code.slice(prefix.length + 1)] || code);
    }
    return code;
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const options = (values, empty = '') => (empty ? `<option value="">${escape(empty)}</option>` : '')
    + Object.entries(values).map(([key, label]) => `<option value="${escape(key)}">${escape(label)}</option>`).join('');
  const date = value => value ? new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
    ...(String(value).includes('T') ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(new Date(value)) : '—';
  const caseTimestamp = value => {
    if (!value) return '—';
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) return '—';
    const timeZone = 'Asia/Ho_Chi_Minh';
    const clock = new Intl.DateTimeFormat('vi-VN', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(instant);
    const day = new Intl.DateTimeFormat('vi-VN', {
      timeZone, day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(instant);
    return `<time class="bcn-case-timestamp" datetime="${instant.toISOString()}">`
      + `<span class="bcn-case-clock">${clock}</span><span class="bcn-case-date">${day}</span></time>`;
  };
  const status = value => `<span class="daily-report-state is-${escape(value?.toLowerCase())}">${escape(states[value] || value)}</span>`;
  const categoryBadge = code => {
    const value = canonicalBusinessCode(String(code ?? ''));
    const known = Object.hasOwn(domains, value);
    const key = known ? value : 'KHAC';
    const label = known ? domains[value] : value || 'Khác';
    return `<span class="bcn-category" data-bcn-domain="${key}">${escape(label)}</span>`;
  };
  const caseDomainCodes = item => item.classifications?.length
    ? [...new Set(item.classifications.map(group => canonicalBusinessCode(group.business_code)))]
    : [canonicalBusinessCode(item.business_code)];
  const caseCategoryBadges = item => '<span class="bcn-case-domain-badges">'
    + caseDomainCodes(item).map(categoryBadge).join('') + '</span>';
  const card = (title, body, extra = '') => `<section class="card daily-report-list-card ${extra}"><h3>${title}</h3>${body}</section>`;
  const requiredMarker = '<span class="required-marker" aria-hidden="true">*</span>';
  const fieldLabel = label => label.includes('*')
    ? `<span>${label.replaceAll('*', requiredMarker)}</span>` : label;
  const field = (name, label, type = 'text', extra = '') =>
    `<label>${fieldLabel(label)}<input name="${name}" type="${type}" ${extra}></label>`;
  const select = (name, label, values, empty = '') =>
    `<label>${fieldLabel(label)}<select name="${name}">${options(values, empty)}</select></label>`;
  const decisions = { NONE: 'Chưa có', ASSIGNMENT: 'Phân công điều tra viên',
    PROSECUTION_CASE: 'Khởi tố vụ án', PROSECUTION_ACCUSED: 'Khởi tố bị can', OTHER: 'Tài liệu khác' };

  async function form({ title, description = '', fields, submit = 'Lưu', attachments = false, onSubmit, parent }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'bcn-dialog bcn-action-dialog card';
    if (attachments) dialog.classList.add('bcn-attachment-dialog');
    dialog.innerHTML = `<h2>${escape(title)}</h2><p>${escape(description)}</p>
      <form class="daily-report-form">${fields}<div class="daily-report-wide bcn-toolbar">
      <button type="submit" class="primary">${escape(submit)}</button>
      <button type="button" class="ghost" data-cancel>Hủy</button></div></form>`;
    (parent || document.getElementById('dailyReports')).append(dialog);
    const formElement = dialog.querySelector('form');
    if (attachments) window.DailyReportAttachments.picker(formElement, formElement.querySelector('.bcn-toolbar'));
    return new Promise(resolve => {
      let value = null;
      formElement.onsubmit = async event => {
        event.preventDefault();
        if (formElement.dataset.attachmentSaving === 'true') return;
        const values = Object.fromEntries(new FormData(formElement));
        try {
          if (attachments) {
            await window.DailyReportAttachments.save(formElement, async files => {
              values.attachments = files;
              await onSubmit?.(values);
            });
          } else await onSubmit?.(values);
          value = values;
          dialog.close();
        } catch (error) {
          let message = formElement.querySelector('[data-submit-error]');
          if (!message) {
            message = document.createElement('p');
            message.dataset.submitError = '';
            message.className = 'daily-report-wide bcn-attachment-error';
            message.setAttribute('role', 'alert');
            formElement.append(message);
          }
          message.textContent = error.message;
        }
      };
      dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
      dialog.addEventListener('cancel', event => {
        if (formElement.dataset.attachmentSaving === 'true') event.preventDefault();
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(value);
      }, { once: true });
      dialog.showModal();
    });
  }
  window.DailyReportsUI = {
    domains, canonicalBusinessCode, domainName, states, roles, action, escape, options, date, status, categoryBadge,
    caseTimestamp, caseDomainCodes, caseCategoryBadges, card, field, fieldLabel, requiredMarker, select, decisions, form
  };
})();
