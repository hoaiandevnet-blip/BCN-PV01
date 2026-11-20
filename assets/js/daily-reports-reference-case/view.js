(() => {
  'use strict';
  const star = '<span class="bcn-required" aria-label="bắt buộc">*</span>';
  const field = (name, label, { type = 'text', required = false, extra = '', wide = false } = {}) =>
    `<label class="${wide ? 'daily-report-wide' : ''}"><span>${label} ${required ? star : ''}</span>
      <input name="${name}" type="${type}" ${required ? 'required' : ''} ${extra}></label>`;
  const section = (title, body, id = '', className = '') => `<section
    class="bcn-reference-section daily-report-wide ${className}" ${id ? `id="${id}"` : ''}>
    <h3>${title}</h3><div class="daily-report-form">${body}</div></section>`;
  const list = (key, count, label, title) => section(title, `<label><span>${count}</span>
      <input type="number" data-reference-count="${key}" min="0" max="100" step="1" value="0"></label>
    <label><span>${label}</span><button class="ghost bcn-reference-list-button" type="button"
      data-reference-edit="${key}"><span data-reference-summary="${key}">Thêm hoặc chỉnh sửa</span>
      <span aria-hidden="true">☷</span></button></label>`, '', 'bcn-reference-people');
  window.DailyReportReferenceView = {
    render({ edit = false, readOnly = false } = {}) {
      const domains = window.DailyReportsUI.options(window.DailyReportsUI.domains, 'Chọn lĩnh vực');
      return section('THÔNG TIN CHÍNH', `
        <label><span>Lĩnh vực ${star}</span><select name="business_code" required>${domains}</select></label>
        <label><span>Loại vụ việc</span><select name="case_type" disabled>
          <option value="">Chọn lĩnh vực trước</option></select>
          <small data-case-type-status role="status"></small>
          <div data-case-type-selected></div>
          <button type="button" class="ghost" data-case-type-retry hidden>Thử lại</button></label>
        <label><span>Cơ quan tạo ${star}</span><select name="unit_id" required></select></label>
        <label><span>Trạng thái vụ việc ${star}</span>
          <select name="incident_status" required>
            <option value="">Chọn trạng thái vụ việc</option>
            <option>Tiếp nhận vụ việc ban đầu</option>
            <option>Giải quyết tin báo tố giác tội phạm</option>
            <option>Giai đoạn điều tra</option>
          </select></label>
        <input name="entered_at" type="hidden">
        ${field('occurred_at', 'Thời điểm xảy ra', { type: 'datetime-local' })}
        ${field('ended_at', 'Thời điểm kết thúc', { type: 'datetime-local' })}
        ${field('title', 'Tên vụ việc', { required: true, wide: true, extra: 'maxlength="32000" placeholder="Tự điền khi chọn loại vụ việc"' })}
        <label class="daily-report-wide">Nội dung vụ việc<textarea name="summary" rows="5" maxlength="8000"
          placeholder="Nhập nội dung vụ việc"></textarea></label>
        <label class="daily-report-wide bcn-reference-handling-unit">Đơn vị xử lý
          <select name="handling_unit_id"></select></label>`,
      edit ? 'bcnDetailInformation' : '', 'bcn-reference-main')
      + list('subjects', 'Số đối tượng', 'Đối tượng', 'THÔNG TIN ĐỐI TƯỢNG')
      + section('THÔNG TIN CHI TIẾT', `
        ${field('death_count', 'Người chết', { extra: 'inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Nhập số người"' })}
        ${field('injured_count', 'Bị thương', { extra: 'inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Nhập số người"' })}
        ${field('property_damage', 'Tài sản thiệt hại (đồng)', { extra: 'inputmode="numeric" autocomplete="off" placeholder="0 đồng"' })}
        <label class="daily-report-wide">Vật chứng
          <textarea name="evidence" maxlength="8000" rows="3" placeholder="Nhập thông tin vật chứng"></textarea></label>`,
      '', 'bcn-reference-details')
      + section('THÔNG TIN KẾT QUẢ XỬ LÝ', `<div class="daily-report-wide bcn-handling-field">
        <div class="bcn-handling-summary" data-handling-summary role="group" aria-label="Kết quả xử lý">
          <div class="bcn-handling-summary-header">
            <span class="bcn-handling-status" data-handling-status role="status"></span>
            <button type="button" class="ghost bcn-handling-open" data-handling-open
              aria-label="${readOnly ? 'Xem' : 'Chỉnh sửa'} thông tin kết quả xử lý">
              <i data-lucide="${readOnly ? 'eye' : 'pencil'}" aria-hidden="true"></i>
              <span>${readOnly ? 'Xem chi tiết' : 'Chỉnh sửa'}</span>
            </button>
          </div>
          <dl class="bcn-handling-facts" data-handling-facts hidden></dl>
        </div><input type="hidden" name="handling_result"></div>`,
      'bcnHandlingSection', 'bcn-reference-handling')
      + (readOnly ? '' : section('HÌNH ẢNH',
        `<label class="daily-report-wide">Tải tệp lên
          <input type="file" data-reference-files="images" multiple accept=".png,.jpg,.jpeg">
          <small>PNG, JPG · 10 MB/tệp; tối đa 10 tệp, tổng 20 MB cho hồ sơ.</small>
        </label><ul class="daily-report-wide" data-reference-queue="images"></ul>`))
      + `<div class="bcn-toolbar daily-report-wide">${readOnly || !edit ? '' : `
        <button type="reset" class="ghost">Hoàn tác</button>
        <button type="submit" class="primary">Lưu chỉnh sửa</button>`}</div>
        <p class="daily-report-wide" data-reference-status role="status"></p>`;
    }
  };
})();
