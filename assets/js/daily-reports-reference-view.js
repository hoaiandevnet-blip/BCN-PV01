(() => {
  'use strict';
  const pages = {
    input: ['TIẾP NHẬN BÁO CÁO', 'Nhập báo cáo ngày',
      'Báo cáo tình hình trong ngày và nhập đầy đủ kết quả công tác công an của đơn vị.', 'file-plus-2'],
    registry: ['KHO DỮ LIỆU NGHIỆP VỤ', 'Tra cứu vụ việc',
      'Tìm theo hệ vụ việc, đơn vị báo cáo, thời gian và trạng thái cập nhật.', 'database'],
    approval: ['XỬ LÝ BÁO CÁO', 'Phê duyệt vụ việc',
      'Duyệt hồ sơ hoặc trả lại kèm yêu cầu bổ sung; theo dõi các phiên bản đơn vị gửi lại.', 'badge-check'],
    legal: ['DANH MỤC DÙNG CHUNG', 'Pháp luật & Phân loại vụ việc',
      'Tra cứu tội danh theo số điều luật và hệ nghiệp vụ;'
      + ' quản lý phiên bản khi có văn bản sửa đổi, bổ sung.', 'scale'],
    returned: ['KIỂM SOÁT CHẤT LƯỢNG', 'Trả lại & báo cáo bổ sung',
      'PV01 ghi lý do chưa đạt; đơn vị chỉnh sửa chính hồ sơ đã gửi, phản hồi và gửi lại để kiểm tra.', 'rotate-ccw'],
    updates: ['LỊCH SỬ DIỄN BIẾN', 'Cập nhật & bổ sung vụ việc',
      'Mỗi vụ việc có mã cố định, không tự tạo bản ghi mới khi bổ sung.', 'git-commit'],
    unlock: ['THEO DÕI ĐỀ NGHỊ', 'Lịch sử đề nghị',
      'Theo dõi đề nghị đã gửi từ Nhập báo cáo ngày và kết quả xử lý của PV01.', 'history'],
    duplicates: ['RÀ SOÁT CHẤT LƯỢNG BÁO CÁO', 'Kiểm tra trùng',
      'Đối chiếu hồ sơ, kiểm tra dấu hiệu trùng và ghi kết luận xử lý trước khi tổng hợp báo cáo.', 'copy-check'],
    composer: ['BIÊN TẬP BÁO CÁO NGÀY', 'Chọn từng ý → Biên tập → Xuất Word',
      'Lọc nội dung các đơn vị, tích chọn từng ý, biên tập, xem trước đầy đủ thể thức và xuất Word.', 'file-text'],
    permissions: ['PHÂN QUYỀN', 'Phân công tài khoản & phạm vi báo cáo',
      'Giao vai trò cho từng tài khoản, quản lý phạm vi và thời hạn phân công.', 'shield-check'],
    history: ['GIÁM SÁT THAO TÁC', 'Lịch sử xử lý',
      'Theo dõi truy cập, các lần thay đổi và kết quả xử lý trong phạm vi được phân công.', 'history']
  };
  function panel(title, description = '') {
    const section = document.createElement('section');
    section.className = 'card daily-report-list-card';
    const header = document.createElement('div');
    header.className = 'bcn-panel-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    header.append(heading);
    if (description) {
      const text = document.createElement('p');
      text.className = 'bcn-panel-description';
      text.textContent = description;
      header.append(text);
    }
    section.append(header);
    return section;
  }
  const timeline = rows => `<ol class="bcn-timeline">${rows.map(([title, text]) =>
    `<li><strong>${title}</strong><p>${text}</p></li>`).join('')}</ol>`;

  const emptyDuplicates = `<div class="table-wrap" data-empty-duplicates><table class="data-table"><thead><tr>
    <th>Vụ được đối chiếu</th><th>Đã báo trước đó</th><th>Độ tương đồng</th><th>Gợi ý</th><th>Hướng xử lý</th>
    </tr></thead><tbody><tr><td colspan="5" class="empty-row">Chưa có cặp nghi vấn được hiển thị.</td></tr>
    </tbody></table></div>`;
  function mount(root, { getScope } = {}) {
    const $ = selector => root.querySelector(selector);
    const pane = name => $(`[data-bcn-pane="${name}"]`);
    root.classList.add('bcn-reference');
    $('.bcn-hero').innerHTML = `<div><small>NGHIỆP VỤ · QUẢN LÝ TẬP TRUNG</small>
      <h1>BÁO CÁO NGÀY</h1><p>Tiếp nhận dữ liệu · Theo dõi diễn biến · Biên tập và xuất báo cáo</p></div>
      <div class="bcn-hero-seal"><div class="bcn-seal-ring">
        <img src="/assets/img/huy-hieu-cand.png" alt="Huy hiệu Công an nhân dân"></div>
        <div><small>CÔNG AN TP. ĐỒNG NAI</small><strong>PHÒNG PV01</strong>
        <span>Trung tâm Thông tin Chỉ huy</span></div></div>`;
    const headingActions = document.createElement('div');
    headingActions.id = 'bcnPageActions';
    headingActions.className = 'bcn-toolbar';
    $('.daily-report-heading').append(headingActions);
    $('#dailyReportRefresh').innerHTML = '<span class="bcn-refresh-icon">↻</span> Cập nhật';
    headingActions.append($('#dailyReportRefresh'));

    const headingLead = $('.daily-report-heading > div');
    if (headingLead && !headingLead.classList.contains('bcn-heading-lead')) {
      headingLead.classList.add('bcn-heading-lead');
      const iconWrap = document.createElement('div');
      iconWrap.className = 'bcn-heading-icon-wrap';
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.innerHTML = '<i data-lucide="file-plus-2"></i>';
      headingLead.prepend(iconWrap);
      window.lucide?.createIcons({ root: iconWrap, attrs: { 'stroke-width': 2.2, focusable: 'false' } });
    }

    const filters = $('#bcnCaseFilters');
    const filterPanel = panel('Bộ lọc dữ liệu', 'Tra cứu trong phạm vi quyền truy cập');
    filterPanel.id = 'bcnRegistryFilters';
    filterPanel.append(filters);
    const actionRow = filters.querySelector('.bcn-toolbar');
    const extraFilters = document.createElement('details');
    extraFilters.className = 'bcn-extra-filters';
    extraFilters.innerHTML = '<summary>Lọc thêm loại vụ việc và thống kê</summary>';
    extraFilters.append(filters.elements.category_code.closest('label'),
      filters.elements.counted_as_pphs.closest('label'));
    filters.append(extraFilters);
    filters.insertBefore(actionRow, filters.elements.from_day.closest('label'));
    filters.elements.from_day.closest('label').classList.add('bcn-date-filter');
    filters.elements.to_day.closest('label').classList.add('bcn-date-filter');
    pane('intake').prepend(filterPanel);
    const caseCard = $('#dailyReportCaseRows').closest('.card');
    caseCard.id = 'bcnRegistryList';
    $('#dailyReportCaseCount').classList.add('bcn-panel-description');
    caseCard.querySelector('thead').innerHTML = `<tr><th>STT</th>
      <th>Hệ / lĩnh vực</th><th>Tóm tắt</th><th>Đơn vị</th><th>Trạng thái</th><th>Thao tác</th></tr>`;
    const period = document.createElement('div');
    period.id = 'bcnCaseListPeriod';
    period.className = 'bcn-registry-period';
    period.setAttribute('aria-live', 'polite');
    $('#bcnCaseListTitle').after(period);

    const caseTableWrap = caseCard.querySelector('.table-wrap');
    caseTableWrap.id = 'bcnRegistryCasesWrap';

    const tabsBar = document.createElement('div');
    tabsBar.className = 'bcn-registry-tabs-bar';
    tabsBar.innerHTML = `<button type="button" class="bcn-reg-tab-btn active" id="bcnTabCases" data-target="cases">
        <i data-lucide="folder" aria-hidden="true"></i> Vụ việc phát sinh (<span id="bcnRegCasesCount">0</span>)
      </button>
      <button type="button" class="bcn-reg-tab-btn" id="bcnTabMetrics" data-target="metrics">
        <i data-lucide="shield" aria-hidden="true"></i>
        Kết quả công tác Công an xã (<span id="bcnRegMetricsCount">0</span>)
      </button>`;
    caseTableWrap.before(tabsBar);

    const metricsWrap = document.createElement('div');
    metricsWrap.id = 'bcnRegistryMetricsWrap';
    metricsWrap.className = 'bcn-registry-metrics-wrap';
    metricsWrap.hidden = true;
    metricsWrap.innerHTML = `<div id="bcnMetricsAggregateBanner" class="bcn-metrics-aggregate-banner" hidden></div>
      <div id="bcnRegistryMetricRows" class="bcn-registry-metrics-list">
        <div class="bcn-empty-card">Chưa có kết quả công tác công an xã phù hợp với bộ lọc đã chọn.</div>
      </div>`;
    caseTableWrap.after(metricsWrap);

    tabsBar.querySelectorAll('.bcn-reg-tab-btn').forEach(btn => {
      btn.onclick = () => {
        tabsBar.querySelectorAll('.bcn-reg-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isCases = btn.dataset.target === 'cases';
        caseTableWrap.hidden = !isCases;
        metricsWrap.hidden = isCases;
        const pagination = $('#bcnCasePagination');
        if (pagination) pagination.hidden = !isCases;
      };
    });
    window.lucide?.createIcons({ root: tabsBar, attrs: { width: 16, height: 16, focusable: 'false' } });
    const updateColumns = document.createElement('div');
    updateColumns.id = 'bcnUpdatesColumns';
    updateColumns.className = 'bcn-two-col';
    updateColumns.hidden = true;
    const updates = panel('Vụ việc cần theo dõi', 'Hồ sơ có diễn biến hoặc cần kiểm tra');
    updates.id = 'bcnUpdatesPanel';
    const updatesHeader = updates.querySelector('.bcn-panel-header');
    const updatesHeading = document.createElement('div');
    updatesHeading.append(...updatesHeader.childNodes);
    updatesHeader.innerHTML = '<span class="bcn-process-symbol" aria-hidden="true">'
      + '<i data-lucide="git-commit"></i></span>';
    updatesHeader.append(updatesHeading);
    updates.innerHTML += '<div id="bcnUpdateRows"></div>';
    window.lucide?.createIcons({ root: updatesHeader, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
    const rules = panel('Quy tắc ghi nhận vụ việc', 'Không đếm trùng – luôn theo dõi diễn biến');
    rules.id = 'bcnCaseRecordingRules';
    const rulesHeader = rules.querySelector('.bcn-panel-header');
    const rulesHeading = document.createElement('div');
    rulesHeading.append(...rulesHeader.childNodes);
    rulesHeader.innerHTML = '<span class="bcn-process-symbol" aria-hidden="true">'
      + '<i data-lucide="clipboard-check"></i></span>';
    rulesHeader.append(rulesHeading);
    const recordingSteps = [
      { tone: 'blue', icon: 'folder-plus', title: 'Tiếp nhận lần đầu',
        description: 'Lưu hồ sơ và nguồn báo cáo; chưa đủ điều kiện thì không ghi nhận thống kê PPHS.' },
      { tone: 'amber', icon: 'file-plus-2', title: 'Bổ sung quyết định',
        description: 'Nhập loại, số, ngày, cơ quan ban hành và nội dung bổ sung cho cùng mã hồ sơ.' },
      { tone: 'violet', icon: 'bell-ring', title: 'Thông báo cho PV01',
        description: 'Diễn biến mới chờ duyệt; cán bộ tổng hợp nhận thông báo tại quả cầu.' },
      { tone: 'green', icon: 'badge-check', title: 'PV01 xác nhận',
        description: 'Chọn diễn biến vào báo cáo ngày bổ sung; thống kê theo quy tắc nghiệp vụ đã phê duyệt.' }
    ];
    rules.innerHTML += `<ol class="bcn-timeline bcn-process-steps">${recordingSteps.map((step, index) =>
      `<li data-process-tone="${step.tone}">
        <span class="bcn-process-icon" aria-hidden="true"><i data-lucide="${step.icon}"></i></span>
        <div class="bcn-process-content">
          <div class="bcn-process-meta"><span class="bcn-process-number">Bước ${index + 1}</span>
            <h4>${step.title}</h4></div>
          <p>${step.description}</p>
        </div>
      </li>`).join('')}</ol>`;
    updateColumns.append(updates, rules);
    pane('intake').append(updateColumns);
    window.lucide?.createIcons({ root: rules, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
    const notice = $('.daily-report-notice');
    if (notice) pane('intake').append(notice);

    const legalSearch = $('#bcnLegalSearch');
    const lawResults = $('#bcnLawResults');
    const lawMetrics = $('#bcnLegalMetrics');
    const lawCount = $('#bcnLawResultCount');
    const petitions = $('#bcnPetitionCatalog');
    const importCard = $('#bcnLegalForm').closest('.card');
    const exportButton = $('#bcnLegalExportJson');
    const catalogue = panel('Danh mục tội danh theo Bộ luật Hình sự',
      'Phân loại nghiệp vụ, số điều luật và văn bản căn cứ được lưu độc lập.');
    catalogue.append(legalSearch, lawResults, lawCount);
    const legalColumns = document.createElement('div');
    legalColumns.className = 'bcn-two-col';
    const petitionPanel = panel('Tình hình khiếu kiện', 'Các loại tình hình để nhập và báo cáo, không phải tội danh');
    petitionPanel.append(petitions);
    const manage = panel('Quản lý văn bản sửa đổi & phiên bản',
      'Chỉ tài khoản được phân công mới được nhập, thẩm định hoặc công bố phiên bản');
    manage.id = 'bcnLegalVersionGuide';
    const manageHeader = manage.querySelector('.bcn-panel-header');
    const manageHeading = document.createElement('div');
    manageHeading.append(...manageHeader.childNodes);
    manageHeader.innerHTML = '<span class="bcn-process-symbol" aria-hidden="true">'
      + '<i data-lucide="files"></i></span>';
    manageHeader.append(manageHeading);
    const versionSteps = [
      ['blue', 'file-up', 'Nhập danh mục từ tệp',
        'Chọn tệp danh mục do cán bộ quản lý cung cấp hoặc đã tải từ phần mềm.'],
      ['violet', 'git-compare-arrows', 'Kiểm tra khác biệt',
        'Đối chiếu số điều, tên điều, hiệu lực và phân loại nghiệp vụ.'],
      ['green', 'badge-check', 'Công bố phiên bản mới',
        'Giữ phiên bản cũ, ngày hiệu lực, nguồn và người thẩm định.']
    ];
    manage.innerHTML += `<ol class="bcn-timeline bcn-process-steps">${versionSteps.map((step, index) =>
      `<li data-process-tone="${step[0]}">
        <span class="bcn-process-icon" aria-hidden="true"><i data-lucide="${step[1]}"></i></span>
        <div class="bcn-process-content"><div class="bcn-process-meta">
          <span class="bcn-process-number">Bước ${index + 1}</span><h4>${step[2]}</h4></div>
          <p>${step[3]}</p></div>
      </li>`).join('')}</ol>`;
    const manageActions = document.createElement('div');
    manageActions.className = 'bcn-toolbar bcn-version-actions';
    manageActions.innerHTML = `<button class="primary" id="bcnLawImportOpen" type="button">
      <i data-lucide="file-up" aria-hidden="true"></i> Nhập danh mục từ tệp</button>`;
    exportButton.innerHTML = '<i data-lucide="download" aria-hidden="true"></i> Tải danh mục về máy';
    manageActions.append(exportButton);
    manage.append(manageActions);
    window.lucide?.createIcons({ root: manage, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
    const importDetails = document.createElement('details');
    importDetails.id = 'bcnLawImportDetails';
    importDetails.className = 'bcn-management-details';
    importDetails.innerHTML = '<summary>Nhập, thẩm định và lịch sử phiên bản</summary>';
    importDetails.append(importCard);
    legalColumns.append(petitionPanel, manage);
    pane('legal').replaceChildren(lawMetrics, catalogue, legalColumns, importDetails);
    $('#bcnLawImportOpen').onclick = () => {
      importDetails.open = true;
      $('#bcnLegalForm input').focus();
    };
    petitions.querySelectorAll('div').forEach(item => {
      item.insertAdjacentHTML('afterbegin', '<span aria-hidden="true">◈</span>');
    });

    const entryTabs = $('.bcn-entry-tabs');
    $('#dailyReportCaseForm').closest('.card').prepend(entryTabs);
    $('[data-entry-mode="situation"]').hidden = true;
    const petitionOption = new Option('Tình hình khiếu kiện', '__PETITION');
    $('#dailyReportCaseForm [name="business_code"]').append(petitionOption);
    $('#dailyReportCaseForm').closest('.card').querySelector('h3').textContent = 'Tạo mới vụ việc';
    $('#dailyReportCaseForm').closest('.card').querySelector('.card-head p').innerHTML =
      `Các trường có dấu ${window.DailyReportsUI.requiredMarker} là bắt buộc;`
      + ' trước khi nhập mới cần kiểm tra vụ việc đã tồn tại.';
    const caseForm = $('#dailyReportCaseForm');
    const titleField = caseForm.elements.title.closest('label');
    caseForm.insertBefore($('#bcnEntryLegal').closest('label'), titleField);
    const initialState = document.createElement('label');
    initialState.innerHTML = 'Trạng thái xử lý ban đầu<input value="Bản nháp – kiểm tra trước khi gửi" readonly>';
    caseForm.insertBefore(initialState, caseForm.elements.decision_type.closest('label'));
    caseForm.insertBefore(caseForm.elements.decision_number.closest('label'),
      caseForm.elements.decision_type.closest('label'));
    $('#dailyReportCaseForm [name="category_code"]').closest('label').classList.add('bcn-entry-category');
    const entryExtra = document.createElement('details');
    entryExtra.className = 'daily-report-wide bcn-extra-filters';
    entryExtra.innerHTML = '<summary>Mã phân loại nghiệp vụ</summary>';
    entryExtra.append($('#dailyReportCaseForm [name="category_code"]').closest('label'));
    $('#dailyReportCaseForm').append(entryExtra);
    const sourcePanel = $('#bcnSourceRows').closest('.card');
    sourcePanel.classList.add('bcn-entered-sources');
    sourcePanel.querySelector('h3').textContent = 'Kết quả đã nhập';
    const tabsSlot = document.createElement('div');
    tabsSlot.id = 'bcnEntryTabsSlot';
    tabsSlot.className = 'bcn-entry-tabs-slot';
    tabsSlot.append(entryTabs);
    pane('input').prepend(tabsSlot);
    const petitionNavigation = document.createElement('div');
    petitionNavigation.className = 'bcn-toolbar';
    petitionNavigation.innerHTML = `<button type="button" class="ghost" id="bcnSituationBack">
      <i data-lucide="arrow-left" aria-hidden="true"></i>Quay lại nhập vụ việc</button>`;
    $('#bcnSituationForm').closest('.card').prepend(petitionNavigation);
    window.lucide?.createIcons({ root: petitionNavigation, attrs: { width: 18, height: 18, focusable: 'false' } });
    const metricForm = $('#bcnMetricForm');
    const metricUnit = document.createElement('label');
    metricUnit.innerHTML = 'Đơn vị báo cáo<input id="bcnMetricUnitLabel" readonly>';
    metricForm.prepend(metricUnit);
    metricForm.insertBefore(metricForm.elements.report_day.closest('label'),
      metricForm.elements.metric_code.closest('label'));
    const entryReadOnly = document.createElement('p');
    entryReadOnly.id = 'bcnEntryReadOnly';
    entryReadOnly.className = 'bcn-callout';
    entryReadOnly.textContent = 'Tài khoản hiện tại được rà soát dữ liệu.'
      + ' Quyền nhập mới cần được phân công cho đơn vị.';
    caseForm.before(entryReadOnly);

    const unlockCard = $('#dailyReportUnlockRows').closest('.card');
    unlockCard.querySelector('h3').textContent = 'Các yêu cầu mở khóa';
    unlockCard.insertAdjacentHTML('beforeend', '<p class="bcn-panel-description">Mỗi lần mở khóa chỉ áp dụng'
      + ' đúng đơn vị, ngày và đối tượng được duyệt; hết hạn tự đóng.</p>');
    const auditCard = $('#bcnAuditRows')?.closest('.card');
    if (auditCard?.querySelector('h3')) {
      auditCard.querySelector('h3').textContent = 'Dòng thời gian tác vụ';
    }
    const auditLoad = $('#bcnAuditLoad');
    if (auditLoad) auditLoad.textContent = '↻ Cập nhật lịch sử';
    const permissionPane = pane('permissions');
    permissionPane.firstElementChild.remove();
    window.DailyReportsReferencePanels.permissions(root, { panel, timeline });
    window.DailyReportsReferencePanels.composer(root, { panel });

    function formatReportDay(value) {
      if (!value) {
        value = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
      }
      const str = String(value).trim();
      const parts = str.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return str;
    }

    function activate(view) {
      const [eyebrow, title, description, iconName = 'file-plus-2'] = pages[view] || pages.input;
      $('.daily-report-eyebrow').textContent = eyebrow;
      const formattedDay = formatReportDay(getScope?.()?.reportDay);
      const displayTitle = (view === 'input' && formattedDay)
        ? `${title} ${formattedDay}`
        : title;
      $('.daily-report-heading h2').textContent = displayTitle;
      $('#bcnPageDescription').textContent = description;
      const iconWrap = $('.bcn-heading-icon-wrap');
      if (iconWrap) {
        iconWrap.innerHTML = `<i data-lucide="${iconName}"></i>`;
        window.lucide?.createIcons({ root: iconWrap, attrs: { 'stroke-width': 2.2, focusable: 'false' } });
      }
      headingActions.querySelectorAll('[data-bcn-go]').forEach(button => button.remove());
      $('#dailyReportRefresh').hidden = ['input', 'registry', 'approval'].includes(view);
      if (view === 'history') {
        $('#dailyReportRefresh').innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i>'
          + ' Cập nhật lịch sử';
      } else {
        $('#dailyReportRefresh').innerHTML = '<span class="bcn-refresh-icon">↻</span> Cập nhật';
      }
      const actions = view === 'updates' ? [['registry', 'Tra cứu đầy đủ →']] : [];
      for (const [destination, label, iconName] of actions) {
        const menu = document.querySelector(`[data-bcn-view="${destination}"]`);
        if (menu?.hidden) continue;
        const button = document.createElement('button');
        button.className = destination === 'input' ? 'primary' : 'ghost';
        button.textContent = label;
        if (iconName) {
          const icon = document.createElement('i');
          icon.className = 'bcn-page-action-icon';
          icon.dataset.lucide = iconName;
          icon.setAttribute('aria-hidden', 'true');
          button.prepend(icon);
        }
        button.dataset.bcnGo = destination;
        headingActions.insertBefore(button, $('#dailyReportRefresh'));
      }
      window.lucide?.createIcons({ root: headingActions, attrs: { 'stroke-width': 2, focusable: 'false' } });
      filterPanel.hidden = !['registry', 'approval', 'updates'].includes(view);
      if (filters?.elements?.business_code) {
        const isUpdates = view === 'updates';
        filters.elements.business_code.disabled = isUpdates;
        if (isUpdates) filters.elements.business_code.value = 'TINH_HINH_KHAC';
        const label = filters.elements.business_code.closest('label');
        if (label) label.hidden = isUpdates;
      }
      const filterTitle = filterPanel.querySelector('h3');
      const filterDesc = filterPanel.querySelector('.bcn-panel-description');
      if (view === 'updates') {
        if (filterTitle) filterTitle.textContent = 'Bộ lọc vụ việc theo dõi & cập nhật';
        if (filterDesc) filterDesc.textContent =
          'Lọc theo ngày ghi nhận, ngày cập nhật diễn biến, đơn vị hoặc từ khóa vụ việc.';
      } else {
        if (filterTitle) filterTitle.textContent = 'Bộ lọc dữ liệu';
        if (filterDesc) filterDesc.textContent = 'Tra cứu trong phạm vi quyền truy cập';
      }
      caseCard.hidden = view === 'updates';
      updateColumns.hidden = view !== 'updates';
      if (view === 'approval') {
        $('#bcnCaseListTitle').innerHTML = 'Hồ sơ phê duyệt '
          + '<span class="bcn-approval-badge" id="bcnApprovalTitleBadge" hidden></span>';
      } else {
        $('#bcnCaseListTitle').textContent = view === 'returned'
          ? 'Hồ sơ có yêu cầu bổ sung' : 'Danh sách vụ việc';
      }
      $('#bcnCaseListGuidance').textContent = view === 'returned'
        ? 'Hồ sơ có lịch sử trả lại, phản hồi và gửi lại để duyệt.'
        : view === 'approval' ? 'Duyệt hoặc trả lại hồ sơ kèm lý do; không sửa nội dung đơn vị đã gửi.'
        : 'Tra cứu và xem nội dung, tài liệu, diễn biến và lịch sử hồ sơ.';
    }
    root.addEventListener('bcn:navigate', event => activate(event.detail));
    activate('input');
  }
  window.DailyReportsReferenceView = { mount, pages, emptyDuplicates };
})();
