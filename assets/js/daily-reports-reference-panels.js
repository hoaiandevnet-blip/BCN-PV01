(() => {
  'use strict';
  function permissions(root, { panel }) {
    const pane = root.querySelector('[data-bcn-pane="permissions"]');
    const matrix = panel('Ma trận phân quyền');
    matrix.id = 'bcnPermissionMatrix';
    const rows = [
      ['Admin', 'Toàn quyền theo tài khoản hệ thống', 'Toàn quyền', 'Tất cả đơn vị'],
      ['Công an xã, phường', 'Vụ việc, diễn biến; kết quả công tác thông thường', 'Không', 'Đúng đơn vị'],
      ['Phòng trực thuộc CATP', 'Vụ việc và kết quả công tác được phân công', 'Có, khi được giao', 'Theo phạm vi'],
      ['Đồn Công an', 'Vụ việc, diễn biến; kết quả công tác thông thường', 'Không', 'Đúng đồn'],
      ['Đơn vị cảng hàng không (cùng cấp đồn)', 'Vụ việc, diễn biến; kết quả công tác thông thường',
        'Không', 'Đúng đơn vị'],
      ['Đơn vị nhập báo cáo (kể cả PV01)', 'Nhập, sửa nháp, gửi và bổ sung báo cáo', 'Theo phân công', 'Đúng đơn vị'],
      ['Tài khoản PV01 được giao tổng hợp', 'Tra cứu, nhận yêu cầu và mở khóa 30 phút',
        'Kiểm tra / tổng hợp / xuất DOCX', 'Theo phân công']
    ];
    matrix.innerHTML += `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>Đơn vị / vai trò</th><th>Quyền nhập</th><th>Kết quả chuyên trách</th><th>Phạm vi tra cứu</th>
      </tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, index) =>
        `<td>${index ? cell : `<strong>${cell}</strong>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const columns = document.createElement('div');
    columns.id = 'bcnPermissionGuides';
    const metrics = panel('Chỉ tiêu dành cho cấp phòng',
      'Chỉ cấp phòng được phân công mới được nhập các nhóm chỉ tiêu này.');
    metrics.classList.add('bcn-guide-card', 'bcn-guide-card--metrics');
    const exceptions = panel('Mở khóa bổ sung sau 10:00',
      'Thực hiện theo 3 bước khi cần bổ sung sau giờ khóa.');
    exceptions.classList.add('bcn-guide-card', 'bcn-guide-card--unlock');
    for (const [card, icon] of [[metrics, 'building-2'], [exceptions, 'clock-3']]) {
      const header = card.querySelector('.bcn-panel-header');
      const copy = document.createElement('div');
      copy.className = 'bcn-guide-heading';
      copy.append(...header.childNodes);
      header.innerHTML = `<span class="bcn-guide-symbol" aria-hidden="true"><i data-lucide="${icon}"></i></span>`;
      header.append(copy);
    }
    const metricGroups = [
      ['custody', 'shield-check', 'Quản lý giam giữ',
        'Số tạm giữ, tạm giam, phạm nhân và các biến động nghiệp vụ.'],
      ['intake', 'inbox', 'Tiếp nhận, giải quyết tin báo, tố giác tội phạm',
        'Chỉ tiêu tiếp nhận mới và kết quả giải quyết.'],
      ['investigation', 'folder-search', 'Kết quả điều tra án',
        'Khởi tố vụ án / bị can; tạm đình chỉ, đình chỉ, kết luận điều tra vụ / bị can.']
    ];
    metrics.innerHTML += `<ul class="bcn-guide-metrics">${metricGroups.map(([key, icon, title, text]) =>
      `<li data-metric-group="${key}"><span class="bcn-guide-metric-icon" aria-hidden="true">
        <i data-lucide="${icon}"></i></span><div><strong>${title}</strong><p>${text}</p></div></li>`).join('')}</ul>`;
    const unlockSteps = [
      ['Đơn vị gửi yêu cầu', 'PV01 nhận thông báo; yêu cầu cần được phê duyệt.', ''],
      ['PV01 mở khóa', 'Chỉ mở đúng phạm vi được duyệt; hết hạn tự đóng.', 'Tối đa 30 phút'],
      ['Rà soát báo cáo', 'Hồ sơ bổ sung muộn hoặc dữ liệu sau xuất phải được đối chiếu.', '']
    ];
    exceptions.innerHTML += `<ol class="bcn-guide-steps">${unlockSteps.map(([title, text, badge], index) =>
      `<li><span class="bcn-guide-step-number" aria-hidden="true">${index + 1}</span><div>
        <div class="bcn-guide-step-title"><strong>${title}</strong>${badge
          ? `<span class="bcn-guide-time-limit">${badge}</span>` : ''}</div><p>${text}</p></div></li>`).join('')}</ol>
      <div class="bcn-guide-actions"><button class="primary" type="button" data-bcn-go="unlock">
        Đến yêu cầu mở khóa <i data-lucide="arrow-right" aria-hidden="true"></i></button></div>`;
    columns.append(metrics, exceptions);
    const management = document.createElement('details');
    management.id = 'bcnRoleManagement';
    management.className = 'bcn-management-details';
    management.innerHTML = '<summary>Quản lý phân công tài khoản</summary>';
    management.append(root.querySelector('#bcnRoleForm').closest('.card'));
    const reference = document.createElement('details');
    reference.id = 'bcnPermissionReference';
    reference.className = 'bcn-management-details';
    reference.innerHTML = '<summary>Quyền theo đơn vị và hướng dẫn</summary>';
    reference.append(matrix, columns);
    pane.replaceChildren(management, reference);
    window.lucide?.createIcons({ root: columns, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
    const leaderPane = root.querySelector('[data-bcn-pane="leaders"]');
    const leaders = document.createElement('details');
    leaders.id = 'bcnLeaderManagement';
    leaders.className = 'bcn-management-details';
    leaders.innerHTML = '<summary>Danh sách lãnh đạo và người ký</summary>';
    leaders.append(...leaderPane.children);
    leaderPane.append(leaders);
    pane.after(leaderPane);
  }

  function composer(root) {
    const $ = selector => root.querySelector(selector);
    const fieldsRoot = $('#bcnDocumentFields');
    const extra = document.createElement('div');
    extra.className = 'daily-report-wide bcn-composer-extra';
    const keys = ['advisory', 'steering', 'orders', 'duty', 'party', 'requests', 'conclusion'];
    for (const key of keys) extra.append($(`[data-document="${key}"]`).closest('label'));
    fieldsRoot.append(extra);
    fieldsRoot.closest('.card').querySelector('h3').textContent = '3. Thành phần bắt buộc của văn bản';
    $('#bcnComposerSources').classList.add('bcn-composer-source');
    $('#bcnPaperViewport').closest('.card').classList.add('bcn-composer-preview-panel');
    const previewCard = $('#bcnPaperViewport').closest('.card');
    const previewActions = $('#bcnPreviewRefresh').parentElement;
    const previewHeading = document.createElement('header');
    previewHeading.className = 'bcn-composer-preview-heading';
    previewHeading.append(previewCard.querySelector('h3'), previewActions);
    previewCard.prepend(previewHeading);
    previewHeading.insertAdjacentHTML('afterend', '<p class="bcn-preview-live">'
      + 'Tự cập nhật khi chọn hoặc chỉnh sửa nội dung bên trái.</p>');
    $('#bcnExport').classList.add('bcn-green');
    $('#bcnPreviewRefresh').textContent = '↻ Xem lại';
  }
  window.DailyReportsReferencePanels = { permissions, composer };
})();
