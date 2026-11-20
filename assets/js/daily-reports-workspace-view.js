(() => {
  const field = (label, name, type = 'text', extra = '') =>
    `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
  const form = (id, content) => `<form id="${id}" class="daily-report-form">${content}</form>`;
  const card = (title, content) => `<section class="card daily-report-list-card"><h3>${title}</h3>${content}</section>`;
  window.DailyReportsWorkspaceView = {
    mount(root) {
      const workspace = root.querySelector('.daily-report-workspace');
      const intake = document.createElement('div');
      intake.dataset.bcnPane = 'intake';
      intake.className = 'daily-report-workspace';
      [...workspace.children].filter(node => node.tagName !== 'HEADER').forEach(node => intake.append(node));
      workspace.append(intake);
      const panes = {
        input: '',
        unlock: '', 
        sources: card('Tình hình khiếu kiện', form('bcnSituationForm', `
          <label class="daily-report-wide">Nhãn tình hình<select name="categories" multiple required size="6">
            <option value="KHIEU_KIEN_DONG_NGUOI">Khiếu kiện đông người</option>
            <option value="KHIEU_KIEN_LEN_TRUNG_UONG">Khiếu kiện lên Trung ương</option>
            <option value="KHIEU_KIEN_PHUC_TAP_ANTT">Khiếu kiện phức tạp ANTT</option>
            <option value="BIEU_TINH">Biểu tình</option><option value="PHA_ROI_ANTT">Phá rối ANTT</option>
            <option value="DINH_CONG">Đình công</option></select></label>
          ${field('Ngày báo cáo', 'report_day', 'date', 'required')}
          <label class="daily-report-wide">Nội dung<textarea name="narrative" rows="4" required></textarea></label>
          <button class="primary">Lưu nháp tình hình</button>`))
          + card('Kết quả công tác', form('bcnMetricForm', `
            <label>Nhóm công tác<select name="metric_code" id="bcnMetricGroup"></select></label>
            ${field('Ngày báo cáo', 'report_day', 'date', 'required')}
            <div id="bcnMetricFields" class="daily-report-wide daily-report-form"></div>
            <button class="primary">Lưu nháp kết quả</button>`))
          + card('Rà soát dữ liệu nguồn', `<div class="bcn-toolbar">
            <input id="bcnSourceDay" type="date" aria-label="Ngày nguồn">
            <select id="bcnSourceUnit" aria-label="Đơn vị nguồn"></select>
            <button class="ghost" id="bcnSourcesLoad">Tải dữ liệu</button></div><div id="bcnSourceRows"></div>`),
        composer: window.DailyReportsComposerView.controls() + `
          <div id="bcnComposerRows"></div>
          <div class="bcn-toolbar"><button id="bcnDraftHistory" class="ghost">Lịch sử biên tập</button><button id="bcnDraftSave" class="primary">Lưu lựa chọn & biên tập</button>
            <select id="bcnSigner" aria-label="Người ký"><option value="">Chọn người ký</option></select>
            <input id="bcnReportNumber" placeholder="Số ký hiệu" aria-label="Số ký hiệu">
            <button id="bcnExport" class="primary">Xuất Word</button></div><div id="bcnExportResult"></div>`,
        leaders: card('Danh sách lãnh đạo', form('bcnLeaderForm', `
          <input name="id" type="hidden">${field('Họ tên', 'full_name', 'text', 'required')}
          ${field('Cấp bậc', 'rank_name')}${field('Chức danh', 'title', 'text', 'required')}
          <label>Phạm vi ký<select name="signer_scope"><option>PV01</option><option>CATP</option></select></label>
          ${field('Hiệu lực từ', 'effective_from', 'date', 'required')}${field('Hiệu lực đến', 'effective_to', 'date')}
          <button class="primary">Lưu lãnh đạo</button><button class="ghost" type="reset">Nhập mới</button>`)
          + '<button class="ghost" id="bcnLeadersLoad">Tải danh sách (gồm lưu trữ)</button><div id="bcnLeaderRows"></div>'),
        legal: card('Nhập phiên bản danh mục luật', form('bcnLegalForm', `
          ${field('Tên văn bản', 'title', 'text', 'required')}${field('Số văn bản', 'document_number', 'text', 'required')}
          ${field('Đường dẫn nguồn chính thức', 'source_uri', 'url', 'required')}
          ${field('Hiệu lực từ đã thẩm định', 'effective_from', 'date', 'required')}
          ${field('Mã kiểm tra văn bản', 'checksum', 'text', 'required')}
          <label class="daily-report-wide">Tệp danh mục điều luật
            <input name="articles" type="file" accept=".json,application/json"
              aria-describedby="bcnLegalFileHint" required>
            <small id="bcnLegalFileHint">Chọn tệp danh mục đã tải từ phần mềm hoặc do cán bộ quản lý cung cấp.
              Dung lượng tối đa 2 MB.</small></label>
          <button class="primary">Lưu bản nháp và xem thay đổi</button>`)
          + '<pre id="bcnLegalDiff"></pre><button class="ghost" id="bcnLegalLoad">Tải phiên bản</button>'
          + '<div id="bcnLegalRows"></div><div id="bcnLegalArticles"></div>'),
        notifications: ''
          + card('Nhật ký truy cập và thay đổi',
            '<button class="ghost" id="bcnAuditLoad">Xem nhật ký được phân công</button><div id="bcnAuditRows"></div>'),
        permissions: card('Phân công vai trò theo đơn vị', `
          <p>Admin có toàn quyền theo tài khoản hệ thống, không cần cấp vai trò riêng.
            Từng tài khoản, kể cả PV01, có thể được giao Đơn vị nhập báo cáo.
            Chỉ tài khoản thuộc PV01 được chọn và cấp Cán bộ tổng hợp PV01 mới có quyền tổng hợp.
            Phân công chỉ áp dụng cho tài khoản đang chọn.</p>
          ${form('bcnRoleForm', `<div class="bcn-account-field">
            <label for="bcnRoleAccountSearch">Tài khoản</label>
            <div class="bcn-account-picker" id="bcnRoleAccountPicker">
              <input id="bcnRoleAccountSearch" type="text" role="combobox" aria-autocomplete="list"
                aria-haspopup="listbox" aria-expanded="false" aria-controls="bcnRoleAccountOptions"
                aria-describedby="bcnRoleAccountHint" autocomplete="off" spellcheck="false" required disabled
                placeholder="Nhập tài khoản, họ tên hoặc đơn vị…">
              <button id="bcnRoleAccountClear" type="button" aria-label="Xóa tài khoản đã chọn" hidden>×</button>
              <div id="bcnRoleAccountPanel" class="bcn-account-panel" hidden>
                <ul id="bcnRoleAccountOptions" role="listbox" aria-label="Tài khoản gợi ý"></ul>
                <p id="bcnRoleAccountStatus" role="status" aria-live="polite"></p>
              </div>
            </div>
            <select name="user_id" id="bcnRoleUser" hidden aria-hidden="true" tabindex="-1"></select>
            <small id="bcnRoleAccountHint">Tìm không dấu; chọn tài khoản trong danh sách gợi ý.</small>
          </div>
            <label>Vai trò<select name="role_code"><option>UNIT_REPORTER</option><option>PV01_COMPILER</option>
              <option>LEGAL_REVIEWER</option><option>AUDITOR</option></select></label>
            <p id="bcnRoleEligibility" class="daily-report-wide" role="status">
              Chọn tài khoản để xem vai trò phù hợp với đơn vị công tác.</p>
            <label>Đơn vị phạm vi<select name="unit_id" id="bcnRoleUnit"></select></label>
            <label>Mã chỉ tiêu được giao<input name="metric_code" placeholder="Để trống nếu chỉ cấp vai trò"></label>
            ${field('Phân công từ ngày', 'effective_from', 'date')}
            ${field('Phân công đến ngày', 'effective_to', 'date')}
            <button class="primary">Cấp vai trò</button>`)}
          <button class="ghost" id="bcnRolesLoad">Tải phân công</button><div id="bcnRoleRows"></div>`)
      };
      for (const [key, html] of Object.entries(panes)) {
        const pane = document.createElement('div');
        pane.dataset.bcnPane = key;
        pane.className = 'daily-report-workspace';
        pane.hidden = true;
        pane.innerHTML = html;
        workspace.append(pane);
      }
      const inputPane = root.querySelector('[data-bcn-pane="input"]');
      const unlockPane = root.querySelector('[data-bcn-pane="unlock"]');
      inputPane.append(root.querySelector('#dailyReportCaseForm').closest('.card'));
      unlockPane.append(root.querySelector('#dailyReportUnlockRows').closest('.card'));
      intake.querySelector('.daily-report-grid').remove();
      const caseTitle = root.querySelector('#dailyReportCaseRows').closest('.card').querySelector('h3');
      caseTitle.id = 'bcnCaseListTitle';
      const guidance = document.createElement('p');
      guidance.id = 'bcnCaseListGuidance';
      caseTitle.after(guidance);
      const filters = document.createElement('form');
      filters.id = 'bcnCaseFilters';
      filters.className = 'bcn-toolbar';
      filters.innerHTML = `<input name="from_day" type="date" aria-label="Từ ngày">
        <input name="to_day" type="date" aria-label="Đến ngày"><select name="unit_id" id="bcnCaseUnit"></select>
        <input name="business_code" placeholder="Hệ nghiệp vụ" aria-label="Hệ nghiệp vụ">
        <input name="category_code" placeholder="Mã loại vụ việc" aria-label="Loại vụ việc">
        <select name="state" aria-label="Trạng thái hồ sơ"><option value="">Mọi trạng thái</option>
          <option value="DRAFT">Bản nháp</option><option value="PENDING_REVIEW">Chờ rà soát</option>
          <option value="RETURNED">Trả lại</option><option value="VERIFIED">Đã duyệt</option></select>
        <select name="counted_as_pphs" aria-label="Thống kê PPHS"><option value="">Mọi trạng thái thống kê</option>
          <option value="true">Đã ghi nhận PPHS</option><option value="false">Chưa ghi nhận PPHS</option></select>
        <input name="q" placeholder="Mã, đối tượng, quyết định, nội dung" aria-label="Tìm hồ sơ">
        <button class="ghost">Tra cứu</button>`;
      root.querySelector('#dailyReportCaseRows').closest('.table-wrap').before(filters);
      const registryFields = document.createElement('div');
      registryFields.className = 'daily-report-wide daily-report-form';
      registryFields.innerHTML = `${field('Số hồ sơ nguồn', 'external_reference')}
        <label class="daily-report-wide">Đối tượng (mỗi dòng: tên | mã tham chiếu nội bộ)
          <textarea name="persons_text"></textarea></label>`;
      root.querySelector('#dailyReportCaseForm button[type="submit"]').before(registryFields);
      const details = document.createElement('dialog');
      details.id = 'bcnDetail';
      details.setAttribute('aria-label', 'Chi tiết báo cáo ngày');
      details.className = 'bcn-dialog card';
      details.innerHTML = '<button class="ghost" id="bcnDetailClose">Đóng</button><div id="bcnDetailBody"></div>';
      root.append(details);
      details.querySelector('button').onclick = () => details.close();
    }
  };
})();
