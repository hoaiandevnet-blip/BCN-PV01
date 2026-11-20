(() => {
  'use strict';
  const groups = {
    lookup: { label: 'Tra cứu', icon: 'search' },
    update: { label: 'Cập nhật', icon: 'file-pen-line' },
    export: { label: 'Xuất báo cáo', icon: 'file-output' },
    permissions: { label: 'Phân quyền', icon: 'shield-check' }
  };
  const resourceNames = {
    CASE: 'Hồ sơ vụ việc', CASE_EVENT: 'Diễn biến vụ việc', WORK_RESULT: 'Kết quả công tác',
    SITUATION: 'Tình hình khác', DRAFT: 'Bản nháp báo cáo', EXPORT: 'Tệp báo cáo',
    UNLOCK_REQUEST: 'Yêu cầu mở khóa', ACCOUNT: 'Phân công tài khoản', LEGAL_VERSION: 'Danh mục pháp luật',
    STATISTIC_RULE: 'Quy tắc thống kê', METRIC_DEFINITION: 'Bộ chỉ tiêu', UNIT: 'Đơn vị',
    LEADER: 'Lãnh đạo / người ký'
  };
  const actionNames = {
    ROLE_ASSIGNED: 'Cấp vai trò', ROLE_REVOKED: 'Thu hồi vai trò',
    SOURCE_SUBMITTED: 'Gửi báo cáo', SOURCE_VERIFIED: 'Duyệt báo cáo',
    SOURCE_EDITED: 'Chỉnh sửa báo cáo', SOURCE_RETURNED: 'Trả lại báo cáo',
    LEGAL_REVIEWED: 'Thẩm định danh mục', LEGAL_PUBLISHED: 'Công bố danh mục',
    LEGAL_ROLLED_BACK: 'Ngừng áp dụng phiên bản', STATISTIC_RULE_APPROVED: 'Phê duyệt quy tắc thống kê',
    LEADER_CREATED: 'Thêm lãnh đạo', LEADER_UPDATED: 'Cập nhật lãnh đạo',
    LEADER_ARCHIVED: 'Lưu trữ lãnh đạo', LEADER_RESTORED: 'Khôi phục lãnh đạo', LEADER_DELETED: 'Xóa lãnh đạo',
    UNIT_PROFILE_UPDATED: 'Cập nhật đơn vị', METRIC_DEFINITION_DRAFTED: 'Soạn bộ chỉ tiêu',
    METRIC_DEFINITION_PUBLISHED: 'Công bố bộ chỉ tiêu'
  };
  const format = new Intl.NumberFormat('vi-VN');
  const time = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' });
  const icons = root => window.lucide?.createIcons({ root, attrs: { 'stroke-width': 1.8, focusable: 'false' } });

  function actionLabel(item) {
    const known = actionNames[item.action] || window.DailyReportsUI.action(item.action);
    if (known !== item.action) return known;
    const method = String(item.action).split(':')[0];
    return { POST: 'Gửi yêu cầu xử lý', PUT: 'Lưu thay đổi', PATCH: 'Cập nhật dữ liệu',
      DELETE: 'Xóa hoặc thu hồi dữ liệu' }[method] || 'Cập nhật dữ liệu nghiệp vụ';
  }

  function mount(root) {
    const card = root.querySelector('#bcnAuditRows').closest('.card');
    card.id = 'bcnAuditCard';
    card.innerHTML = `<header class="bcn-audit-header">
      <span class="bcn-audit-symbol" aria-hidden="true"><i data-lucide="history"></i></span>
      <div class="bcn-audit-heading"><h3>Lịch sử xử lý</h3>
        <p>Theo dõi thao tác trong phạm vi được phân công</p></div>
      <button class="ghost" id="bcnAuditLoad" type="button">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>Cập nhật lịch sử</button>
    </header>
    <form id="bcnAuditFilters" class="bcn-audit-filters" role="search" aria-label="Lọc lịch sử xử lý">
      <label class="bcn-audit-search-label"><span>Tìm trong lịch sử</span>
        <span class="bcn-audit-search"><i data-lucide="search" aria-hidden="true"></i>
          <input id="bcnAuditSearch" type="search" maxlength="200"
            placeholder="Tài khoản, đơn vị hoặc mã hồ sơ…" autocomplete="off"></span></label>
      <label><span>Loại thao tác</span><select id="bcnAuditGroup">
        <option value="">Tất cả thao tác</option><option value="lookup">Tra cứu</option>
        <option value="update">Cập nhật</option><option value="export">Xuất báo cáo</option>
        <option value="permissions">Phân quyền</option></select></label>
      <label><span>Kết quả</span><select id="bcnAuditOutcome"><option value="">Tất cả kết quả</option>
        <option value="ALLOW">Thành công</option><option value="DENY">Bị từ chối</option></select></label>
      <button class="ghost" type="reset" id="bcnAuditClear" title="Đặt lại bộ lọc">
        <i data-lucide="rotate-ccw" aria-hidden="true"></i>Xóa lọc</button>
    </form>
    <div class="bcn-audit-caption"><span id="bcnAuditCount" role="status">Chưa tải lịch sử</span>
      <span>Mới nhất trước</span></div>
    <div class="bcn-audit-columns" aria-hidden="true"><span>Hoạt động</span><span>Tài khoản / đơn vị</span>
      <span>Thời gian</span><span>Kết quả</span></div>
    <div id="bcnAuditRows" aria-label="Danh sách lịch sử"></div>
    <footer class="bcn-audit-footer"><label>Số dòng / trang
      <select id="bcnAuditPageSize"><option>10</option><option>20</option><option>50</option></select></label>
      <nav id="bcnAuditPagination" aria-label="Phân trang lịch sử"></nav></footer>`;
    icons(card);
    return card;
  }

  function renderRows(root, events) {
    const escape = window.DailyReportsUI.escape;
    const rows = root.querySelector('#bcnAuditRows');
    rows.innerHTML = events.map(item => {
      const group = groups[item.action_group] || groups.update;
      const success = item.outcome === 'ALLOW';
      const date = new Date(item.created_at);
      const actor = item.actor_name || item.actor_username || (item.actor_id ? 'Tài khoản đã lưu trữ' : 'Hệ thống');
      const account = [item.actor_username, item.actor_unit_name].filter(Boolean).join(' · ');
      const resource = item.case_code || item.resource_id || resourceNames[item.resource_type] || group.label;
      return `<article class="bcn-audit-row" data-audit-id="${escape(item.id)}">
        <div class="bcn-audit-activity"><span class="bcn-audit-icon" data-tone="${escape(item.action_group)}"
          aria-hidden="true"><i data-lucide="${group.icon}"></i></span>
          <div><strong>${escape(actionLabel(item))}</strong><small title="${escape(resource)}">
            ${escape(resource)}</small></div></div>
        <div class="bcn-audit-actor"><strong>${escape(actor)}</strong><small>${escape(account)}</small></div>
        <time datetime="${escape(item.created_at)}"><strong>${time.format(date)}</strong>
          <small>${day.format(date)}</small></time>
        <span class="bcn-audit-result ${success ? 'is-success' : 'is-denied'}">
          <i data-lucide="${success ? 'circle-check' : 'shield-alert'}" aria-hidden="true"></i>
          ${success ? 'Thành công' : 'Bị từ chối'}</span>
      </article>`;
    }).join('') || `<div class="bcn-audit-empty"><i data-lucide="search-x" aria-hidden="true"></i>
      <strong>Không có lịch sử phù hợp</strong><p>Thử đổi bộ lọc hoặc bấm Cập nhật lịch sử.</p></div>`;
    icons(rows);
  }

  function renderPagination(root, pagination) {
    const { page, page_size: size, total, total_pages: pages } = pagination;
    const first = total ? (page - 1) * size + 1 : 0;
    const last = Math.min(page * size, total);
    root.querySelector('#bcnAuditCount').textContent =
      `${format.format(first)}–${format.format(last)} / ${format.format(total)} hoạt động`;
    const selected = new Set([1, pages]);
    const start = Math.max(1, Math.min(page - 1, pages - 2));
    for (let number = start; number <= Math.min(pages, start + 2); number += 1) selected.add(number);
    let previous = 0;
    const buttons = [...selected].sort((left, right) => left - right).map(number => {
      const gap = number - previous > 1 ? '<span class="bcn-audit-gap" aria-hidden="true">…</span>' : '';
      previous = number;
      return `${gap}<button type="button" class="ghost" data-audit-page="${number}"
        aria-label="Trang ${number}"${number === page ? ' aria-current="page" disabled' : ''}>${number}</button>`;
    }).join('');
    root.querySelector('#bcnAuditPagination').innerHTML = `
      <button type="button" class="ghost" data-audit-page="${page - 1}" aria-label="Trang trước"
        ${page === 1 ? 'disabled' : ''}><i data-lucide="chevron-left" aria-hidden="true"></i></button>
      ${buttons}<button type="button" class="ghost" data-audit-page="${page + 1}" aria-label="Trang sau"
        ${page === pages ? 'disabled' : ''}><i data-lucide="chevron-right" aria-hidden="true"></i></button>`;
    icons(root.querySelector('#bcnAuditPagination'));
  }
  window.DailyReportsHistoryView = { mount, renderRows, renderPagination };
})();
