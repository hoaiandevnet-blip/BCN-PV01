(() => {
  'use strict';
  window.DailyReportsV8View = {
    mount(root) {
      const ui = window.DailyReportsUI;
      const $ = selector => root.querySelector(selector);
      const { card, field, select, options } = ui;
      const workspace = $('.daily-report-workspace');
      const hero = document.createElement('section');
      hero.className = 'bcn-hero';
      hero.innerHTML = `<div><small>NGHIỆP VỤ · QUẢN LÝ TẬP TRUNG</small><h1>BÁO CÁO NGÀY</h1>
        <p>Tiếp nhận dữ liệu · Theo dõi diễn biến · Biên tập và xuất báo cáo</p></div>
        <div class="bcn-hero-seal"><img src="/assets/img/huy-hieu-cand.png" alt="Huy hiệu CAND">
        <div><small>CÔNG AN TP. ĐỒNG NAI</small><strong>PHÒNG PV01</strong><p>Trung tâm Thông tin Chỉ huy</p></div></div>`;
      workspace.prepend(hero);
      $('.daily-report-heading h2').insertAdjacentHTML('afterend', '<p id="bcnPageDescription"></p>');


      const entryTabs = document.createElement('div');
      entryTabs.className = 'bcn-entry-tabs';
      entryTabs.setAttribute('role', 'tablist');
      entryTabs.setAttribute('aria-label', 'Loại dữ liệu báo cáo');
      const entryModes = [
        ['case', 'Vụ việc và diễn biến', 'files', 'Ghi nhận vụ việc, cập nhật diễn biến'],
        ['situation', 'Tình hình khiếu kiện', 'messages-square', 'Ghi nhận tình hình tại đơn vị'],
        ['metric', 'Kết quả công tác', 'chart-column', 'Nhập số liệu và kết quả thực hiện']
      ];
      entryTabs.innerHTML = entryModes.map(([key, label, icon, description]) =>
        `<button type="button" role="tab" data-entry-mode="${key}" aria-selected="false" aria-label="${label}">
          <span class="bcn-entry-tab-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
          <span class="bcn-entry-tab-copy"><strong>${label}</strong><small>${description}</small></span>
          <span class="bcn-entry-tab-state" aria-hidden="true"><i data-lucide="check"></i></span>
        </button>`).join('');
      window.lucide?.createIcons({ root: entryTabs, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
      $('[data-bcn-pane="input"]').prepend(entryTabs);
      $('#dailyReportCaseForm').innerHTML = `${field('unit_name', 'Đơn vị báo cáo', 'text', 'readonly')}
        ${select('business_code', 'Hệ vụ việc *', ui.domains)}
        ${field('occurred_at', 'Ngày, giờ xảy ra *', 'datetime-local', 'required')}
        <label class="daily-report-wide">Tên vụ việc
          <input name="title" maxlength="200" disabled></label>
        ${field('category_code', 'Loại vụ việc *', 'text', 'required maxlength="60" placeholder="Loại nghiệp vụ"')}
        <section class="daily-report-wide" id="bcnEntryLocation"></section>
        <label>Điều / khoản pháp luật<select name="legal_article_id" id="bcnEntryLegal">
          <option value="">Chưa xác định</option></select></label>
        <section class="daily-report-wide" id="bcnEntryPersons"></section>
        <label class="daily-report-wide">${ui.fieldLabel('Nội dung, diễn biến, tang vật và kết quả xử lý *')}
          <textarea name="summary" rows="5" required maxlength="8000"></textarea></label>
        ${select('decision_type', 'Loại quyết định', ui.decisions)}
        ${field('decision_number', 'Số văn bản / quyết định', 'text', 'maxlength="100"')}
        ${field('decision_date', 'Ngày ký / ban hành', 'date')}
        ${field('decision_authority', 'Cơ quan ban hành', 'text', 'maxlength="250"')}
        <div class="daily-report-wide bcn-callout">Hồ sơ được lưu nháp để kiểm tra trước khi gửi.
          Duyệt và ghi nhận thống kê do cán bộ được phân công thực hiện, không tự chuyển thành số liệu PPHS.</div>
        <div class="daily-report-wide bcn-toolbar"><button class="primary" type="submit">Lưu hồ sơ</button>
          <button class="ghost" type="button" data-bcn-go="registry">Xem danh sách vụ việc</button></div>`;
      const entryPanels = { case: 'dailyReportCaseForm', situation: 'bcnSituationForm', metric: 'bcnMetricForm' };
      for (const [key, id] of Object.entries(entryPanels)) $( `#${id}`).closest('.card').dataset.entryPanel = key;
      $('#bcnMetricForm').insertAdjacentHTML('beforebegin', `<p class="bcn-callout">
        Các chỉ tiêu giam giữ, tiếp nhận/giải quyết tin báo và điều tra án chỉ dành cho cấp phòng được giao.</p>`);
      $('#bcnMetricForm').insertAdjacentHTML('beforeend', '<p class="daily-report-wide" id="bcnMetricAvailability"></p>');

      const filters = $('#bcnCaseFilters');
      filters.className = 'bcn-filter-grid';
      filters.innerHTML = `<label data-return-date-label hidden>Lọc theo ngày
        <select name="date_basis" aria-label="Lọc theo ngày" disabled>
        <option value="">Ngày báo cáo</option><option value="returned">Ngày trả lại gần nhất</option></select>
        </label>${field('q', 'Từ khóa', 'search', 'placeholder="Mã, tên, đối tượng, quyết định…"')}
        ${select('business_code', 'Hệ vụ việc', ui.domains, 'Tất cả hệ')}
        <label>Đơn vị<select name="unit_id" id="bcnCaseUnit"></select></label>
        ${select('state', 'Trạng thái', Object.fromEntries(Object.entries(ui.states).slice(0, 6)), 'Tất cả trạng thái')}
        ${field('from_day', 'Từ ngày', 'date')}${field('to_day', 'Đến ngày', 'date')}
        ${field('category_code', 'Loại vụ việc')}
        ${select('counted_as_pphs', 'Thống kê PPHS', { true: 'Đã ghi nhận', false: 'Chưa ghi nhận' }, 'Tất cả')}
        <div class="bcn-toolbar"><button class="primary">Tra cứu</button>
        <button class="ghost" type="button" id="bcnClearFilters">Xóa lọc</button></div>`;
      $('#dailyReportCaseRows').closest('table').querySelector('thead').innerHTML = `<tr><th>Mã / thời điểm</th>
        <th>Hệ / đơn vị</th><th>Nội dung</th><th>Trạng thái</th><th>Phiên bản</th><th>Thao tác</th></tr>`;
      const extra = document.createElement('div');
      extra.id = 'bcnCaseWorkflow';
      extra.className = 'bcn-callout';
      extra.hidden = true;
      filters.before(extra);

      const legalPane = $('[data-bcn-pane="legal"]');
      const legalCatalog = document.createElement('div');
      legalCatalog.innerHTML = `<div id="bcnLegalMetrics" class="bcn-kpis"></div>
        ${card('Pháp luật & phân loại vụ việc', `
          <form id="bcnLegalSearch" class="bcn-filter-grid">
            ${field('q', 'Số điều / tên tội', 'search', 'placeholder="Ví dụ: Điều 173, tên tội…"')}
            ${select('business_code', 'Hệ nghiệp vụ', ui.domains, 'Tất cả hệ')}
            <label>Phiên bản<select name="version_id" id="bcnLegalVersion"></select></label>
            <div class="bcn-toolbar"><button class="primary">Tra cứu</button>
              <button type="reset" class="ghost">Xóa lọc</button></div></form>
          <div id="bcnLawResults"></div><div class="bcn-toolbar">
          <button id="bcnLegalExportJson" class="ghost">Tải danh mục về máy</button>
          <span id="bcnLawResultCount"></span></div>`)}
        ${card('Tình hình khiếu kiện', '<div id="bcnPetitionCatalog" class="bcn-petition-grid"></div>')}`;
      legalPane.prepend(legalCatalog);
      const importCard = $('#bcnLegalForm').closest('.card');
      importCard.querySelector('h3').textContent = 'Thông tin danh mục mới';
      $('#bcnLegalForm').insertAdjacentHTML('beforebegin', `<p>Nhập danh mục → Kiểm tra thay đổi → Thẩm định → Công bố.
        Phiên bản đã dùng trong hồ sơ được giữ nguyên.</p>`);
      $('#bcnLegalForm [name="checksum"]').placeholder = 'Mã do cán bộ quản lý cung cấp';
      $('#bcnPetitionCatalog').innerHTML = [...$('#bcnSituationForm [name="categories"]').options].map(item =>
        `<div><strong>${ui.escape(item.textContent)}</strong></div>`).join('');

      const duplicates = document.createElement('div');
      duplicates.dataset.bcnPane = 'duplicates';
      duplicates.className = 'daily-report-workspace';
      duplicates.hidden = true;
      duplicates.innerHTML = window.DailyReportsDuplicatesView.layout();
      workspace.append(duplicates);

      const matrix = document.createElement('div');
      matrix.innerHTML = card('Ma trận phạm vi và quyền nhập', `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Đơn vị / vai trò</th><th>Quyền nhập</th><th>Phạm vi xử lý</th></tr></thead><tbody>
        <tr><td>Xã, phường · Đồn · Cảng</td><td>Vụ việc, tình hình và chỉ tiêu được giao</td><td>Đúng đơn vị</td></tr>
        <tr><td>Phòng trực thuộc</td><td>Thêm chỉ tiêu chuyên trách khi được phân công</td><td>Đơn vị được giao</td></tr>
        <tr><td>PV01</td><td>Rà soát, mở khóa, đối chiếu và tổng hợp</td><td>Theo phạm vi phân công</td></tr>
        <tr><td>Quản trị / Pháp chế</td><td>Cấu hình / thẩm định danh mục</td><td>Theo vai trò được cấp</td></tr>
        </tbody></table></div><p>Phân quyền thực tế do máy chủ kiểm tra; mở khóa không cấp thêm quyền nghiệp vụ.</p>`);
      $('[data-bcn-pane="permissions"]').prepend(matrix);
      $('#bcnRoleForm [name="role_code"]').innerHTML = options(ui.roles);
      $('#bcnAuditRows').insertAdjacentHTML('beforebegin', '<label>Lọc lịch sử<input id="bcnAuditSearch" type="search" placeholder="Thao tác, tài khoản, mã hồ sơ"></label>');
      root.addEventListener('click', event => {
        const target = event.target.closest('[data-bcn-go]');
        if (target) window.DailyReports.navigate(target.dataset.bcnGo);
      });
    }
  };
})();
