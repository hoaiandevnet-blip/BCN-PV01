(() => {
  window.DailyReportsComposerView = {
    controls() {
      const ui = window.DailyReportsUI;
      const metrics = [
        ['sources', 'layers', 'Nguồn trong ngày'], ['selected', 'list-checks', 'Ý đã chọn'],
        ['units', 'building-2', 'Đơn vị đã chọn'], ['pending', 'clock-3', 'Cần duyệt']
      ];
      return `<section id="bcnComposerTools" aria-label="Thiết lập tổng hợp báo cáo">
        <dl id="bcnComposerMetrics" aria-label="Thống kê nguồn">
          ${metrics.map(([key, icon, label]) => `<div class="bcn-compose-metric" data-metric="${key}">
            <dt><i data-lucide="${icon}" aria-hidden="true"></i>${label}</dt>
            <dd><strong>0</strong>${key === 'pending' ? `<span id="bcnReviewShare" hidden
              title="Tỷ lệ cần duyệt trên tổng số nguồn đang tổng hợp">
              <span class="bcn-share-label"></span><span class="bcn-share-track" aria-hidden="true"></span>
            </span>` : ''}</dd></div>`).join('')}
        </dl>
        <div class="bcn-compose-body">
          <section class="bcn-compose-filters" aria-labelledby="bcnComposeTitle">
            <h3 id="bcnComposeTitle">Nguồn tổng hợp</h3>
            <div class="bcn-compose-fields">
              <label>Ngày báo cáo<input type="date" id="bcnComposeDay"></label>
              <label>Mẫu báo cáo<select id="bcnReportType">
                <option value="BCN_PV01">Báo cáo ngày PV01</option><option value="BANTIN_24H">Bản tin 24 giờ</option>
                <option value="BCN_BCA">Báo cáo ngày Bộ Công an</option>
                <option value="BCN_TUUB">Báo cáo Thành ủy / UBND</option>
              </select></label>
              <label>Đơn vị<select id="bcnComposeUnit" aria-label="Đơn vị tổng hợp"></select></label>
              <button class="primary" id="bcnComposeLoad"><i data-lucide="refresh-cw"></i>Tải nguồn</button>
            </div>
            <div class="bcn-compose-fields">
              <label>Từ khóa<input type="search" id="bcnComposeSearch" placeholder="Mã hoặc nội dung"></label>
              <label>Hệ / loại nguồn<select id="bcnComposeCategory">
                ${ui.options(ui.domains, 'Tất cả hệ')}
                <option value="SITUATION">Tình hình khiếu kiện</option>
                <option value="WORK_RESULT">Kết quả công tác</option>
              </select></label>
              <label>Trạng thái<select id="bcnComposeStatus"><option value="">Tất cả trạng thái</option>
                <option value="VERIFIED">Đã duyệt</option><option value="PENDING_REVIEW">Chờ duyệt</option>
                <option value="RESUBMITTED">Đã gửi lại</option><option value="RETURNED">Đã trả lại</option>
                <option value="LATE">Bổ sung muộn</option>
              </select></label>
              <button class="ghost bcn-compose-quiet" id="bcnComposeClear">Xóa lọc</button>
            </div>
            <div class="bcn-compose-selection" role="group" aria-label="Chọn ý theo bộ lọc">
              <span id="bcnComposeMatches" role="status">Chưa tải nguồn</span>
              <button class="ghost bcn-compose-quiet" id="bcnSelectVisible" disabled>Chọn tất cả</button>
              <button class="ghost bcn-compose-quiet" id="bcnDeselectVisible" disabled>Bỏ chọn</button>
              <button class="ghost" id="bcnOnlySelected" aria-pressed="false" disabled>Chỉ hiện ý đã chọn</button>
            </div>
          </section>
          <section class="bcn-compose-drafts" aria-labelledby="bcnComposeDraftTitle">
            <h3 id="bcnComposeDraftTitle"><i data-lucide="files"></i>Bản nháp</h3>
            <label>Bản nháp đã lưu<select id="bcnDraftList" disabled><option value="">Đang tải danh sách…</option>
            </select></label>
            <div class="bcn-compose-draft-actions">
              <button class="ghost" id="bcnDraftOpen" disabled>Mở bản nháp</button>
              <button class="ghost" id="bcnDraftNew"><i data-lucide="plus"></i>Tạo mới</button>
            </div>
            <p id="bcnDraftStatus" role="status">Chưa mở bản nháp</p>
          </section>
        </div></section>`;
    },
    mount(root) {
      const ui = window.DailyReportsUI;
      const $ = selector => root.querySelector(selector);
      const columns = document.createElement('div');
      columns.className = 'bcn-composer-columns';
      const sources = document.createElement('section');
      sources.id = 'bcnComposerSources';
      sources.className = 'card daily-report-list-card';
      sources.innerHTML = '<h3>2. Nội dung các đơn vị báo cáo</h3><p>Tích từng ý để đưa vào văn bản.</p>';
      sources.append($('#bcnComposerRows'));
      const right = document.createElement('div');
      right.className = 'daily-report-workspace';
      right.innerHTML = ui.card('3. Thành phần văn bản', `<div id="bcnDocumentFields" class="daily-report-form">
        <label>Số văn bản<div id="bcnNumberSlot"></div></label>
        <label>Độ mật<select data-document="classification"><option value="">Chưa xác định</option>
          <option>KHÔNG MẬT</option><option>MẬT</option><option>TỐI MẬT</option><option>TUYỆT MẬT</option></select></label>
        ${[['audience', 'Kính gửi'], ['recipients', 'Nơi nhận'], ['advisory', 'Tham mưu Thành ủy'],
          ['steering', 'Tham mưu UBND'], ['orders', 'Văn bản, chỉ đạo trong ngày'], ['duty', 'Công tác trực ban PV01'],
          ['party', 'Xây dựng Đảng, xây dựng lực lượng'], ['requests', 'Kiến nghị, đề xuất'],
          ['conclusion', 'Đoạn kết báo cáo']].map(([key, label]) => `<label class="daily-report-wide">${label}
            <textarea data-document="${key}" rows="2" maxlength="8000"></textarea></label>`).join('')}
        <label class="daily-report-wide">Người ký<div id="bcnSignerSlot"></div></label>
        <div class="daily-report-wide"><button id="bcnManageSigners" class="ghost">Quản lý danh sách người ký</button></div>
        </div><p id="bcnBulletinNote" hidden>Bản tin 24H không có khối trình ký. Dữ liệu được lưu theo từng bản nháp.</p>`)
        + ui.card('4. Xem trước văn bản hoàn chỉnh', `<div class="bcn-toolbar">
          <button id="bcnPreviewRefresh" class="ghost">Cập nhật bản xem trước</button>
          <button id="bcnPreviewZoom" class="ghost" aria-pressed="false">Xem 100%</button></div>
          <p class="bcn-preview-note">A4 · Times New Roman 14 · Trái 3 cm, phải 2 cm, trên/dưới 2 cm.
            Bản tin dùng lề 2 cm. Bản nháp để trống chữ ký.</p>
          <section id="bcnDocumentFormatting" aria-label="Căn chỉnh văn bản"></section>
          <div id="bcnPaperViewport"><div id="bcnPaperStack"></div></div><p id="bcnPreviewStatus" role="status"></p>`);
      const editor = document.createElement('div');
      editor.id = 'bcnComposerEditor';
      editor.className = 'daily-report-workspace';
      const documentFields = right.firstElementChild;
      documentFields.id = 'bcnComposerDocument';
      const preview = right.lastElementChild;
      preview.id = 'bcnComposerPreview';
      editor.append(sources, documentFields);
      columns.append(editor, preview);
      $('#bcnComposerTools').after(columns);
      window.lucide?.createIcons({ root: $('#bcnComposerTools') });
      documentFields.querySelector('#bcnNumberSlot').append($('#bcnReportNumber'));
      documentFields.querySelector('#bcnSignerSlot').append($('#bcnSigner'));
      const actions = $('#bcnExport').parentElement;
      actions.classList.add('bcn-composer-save-actions');
      preview.append(actions, $('#bcnExportResult'));
      $('#bcnReportType').value = 'BCN_PV01';
    }
  };
})();
