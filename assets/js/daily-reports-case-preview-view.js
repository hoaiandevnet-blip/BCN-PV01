(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const value = content => escape(String(content ?? '').trim() || 'Chưa nhập');
  const date = content => content ? ui().date(content) : 'Chưa nhập';
  const fact = (label, content, wide = false) => `<div${wide ? ' class="bcn-reader-info-wide"' : ''}>
    <dt>${label}</dt><dd>${content}</dd></div>`;
  const section = (id, title, body) => `<section id="${id}" class="bcn-reader-section" tabindex="-1">
    <h3>${title}</h3>${body}</section>`;

  function information(item, info) {
    const group = (name, title, symbol, body) => `<article class="bcn-reader-info-group bcn-reader-info-${name}">
      <h4>${icon(symbol)}${title}</h4>${body}</article>`;
    const classification = `<dl class="bcn-reader-facts">
      ${fact('Lĩnh vực', ui().caseCategoryBadges(item))}
      ${fact('Trạng thái hồ sơ', ui().status(item.current_state))}
      ${fact('Loại vụ việc / Căn cứ pháp lý', value((info.case_types || []).map(entry => entry.label).join('; ')
        || item.legal_reference?.title || info.case_type), true)}</dl>`;
    const record = `<dl class="bcn-reader-facts">
      ${fact('Phiên bản', value(item.version))}
      ${fact('Số hồ sơ nguồn', value(item.external_reference))}</dl>`;
    const location = `<dl class="bcn-reader-facts">
      ${fact('Thời điểm xảy ra', date(item.occurred_at))}
      ${fact('Thời điểm kết thúc', date(info.ended_at))}
      ${fact('Địa điểm', value(item.location_general), true)}</dl>`;
    return `<div class="bcn-reader-info-groups">
      ${group('classification', 'Phân loại & trạng thái', 'tags', classification)}
      ${group('record', 'Thông tin hồ sơ', 'folder-open', record)}
      ${group('location', 'Thời gian & địa điểm', 'map-pinned', location)}
      ${group('narrative', 'Nội dung vụ việc', 'file-text',
        `<p class="bcn-reader-narrative">${value(item.summary)}</p>`)}</div>`;
  }

  function handlingResult(info) {
    const handling = info.handling_details || {};
    const present = content => String(content ?? '').trim() !== '';
    const tone = { 'Đã giải quyết': 'resolved', 'Đang giải quyết': 'pending' }[info.handling_result] || 'unknown';
    const decision = handling.prosecution_decision_number;
    const decisionValue = present(decision)
      ? `<strong class="bcn-reader-decision-number">${value(decision)}</strong>` : value(decision);
    const resolution = [['Kết quả giải quyết', handling.resolution], ['Lý do', handling.reason],
      ['Hình thức chi tiết', handling.detail]].filter(([, content]) => present(content));
    return `<dl class="bcn-reader-handling-summary">
        ${fact('Trạng thái xử lý', `<span class="bcn-reader-handling-state" data-tone="${tone}">
          ${value(info.handling_result)}</span>`)}
        ${fact('Hình thức xử lý', value(handling.form))}</dl>
      <div class="bcn-reader-handling-groups">
        <article class="bcn-reader-handling-group">
          <h4>${icon('file-badge')}Thông tin quyết định</h4>
          <dl>${fact('Số quyết định', decisionValue)}
            ${fact('Ngày quyết định', date(handling.prosecution_date))}
            ${fact('Cơ quan quyết định', value(handling.prosecution_authority))}</dl>
        </article>
        <article class="bcn-reader-handling-group">
          <h4>${icon('clipboard-check')}Nội dung giải quyết</h4>
          ${resolution.length ? `<dl>${resolution.map(([label, content]) =>
            fact(label, value(content))).join('')}</dl>` : '<p>Chưa nhập nội dung giải quyết.</p>'}
          ${present(handling.fine_million) ? `<dl class="bcn-reader-handling-fine">
            ${fact('Tổng tiền phạt', `${value(handling.fine_million)} triệu đồng`)}</dl>` : ''}
        </article>
      </div>`;
  }

  function render(result, unitName) {
    const item = result.case;
    const info = item.reference_info || {};
    const normalized = item.reference_info ? item : { ...item, reference_info: {
      subjects: (item.persons || []).map(person => person.name),
      subject_details: (item.persons || []).map(person => {
        const [birth_year, birth_month, birth_day] = String(person.date_of_birth || '').split('-');
        return { ...person, birth_year, birth_month, birth_day };
      })
    } };
    const summary = window.DailyReportIncidentSummary.renderCase(normalized, 0, { preview: true });
    return `<header class="bcn-reader-header"><div>
        <div class="bcn-reader-kicker">
          <p class="bcn-reader-eyebrow">${icon('folder-open')}Hồ sơ vụ việc</p>
          <span class="bcn-reader-mode">${icon('lock-keyhole')}Chỉ xem</span>
        </div>
        <h2 id="bcnCasePreviewTitle">${value(item.title || info.title || 'Chi tiết vụ việc')}</h2>
        <dl class="bcn-reader-metadata">
          ${fact(`${icon('building-2')}Đơn vị báo cáo`, value(unitName))}
          ${fact(`${icon('calendar-days')}Ngày báo cáo`, date(item.report_day))}
          ${fact(`${icon('layers')}Phiên bản`, value(item.version))}
        </dl>
      </div><button type="button" class="ghost" data-preview-close aria-label="Đóng chi tiết vụ việc">
        ${icon('x')}</button></header>
      <nav class="bcn-reader-nav" aria-label="Nội dung chi tiết">
        ${[['information', 'Thông tin', 'file-text'], ['subjects', 'Đối tượng & thiệt hại', 'users-round'],
          ['files', 'Tài liệu', 'paperclip'], ['history', 'Lịch sử', 'history']].map(([id, label, symbol]) =>
          `<button type="button" class="ghost" data-preview-section="${id}" aria-controls="preview-${id}"
            ${id === 'information' ? 'aria-current="location"' : ''}>${icon(symbol)}${label}</button>`).join('')}
      </nav><div class="bcn-reader-scroll">
        ${section('preview-information', 'Thông tin vụ việc', information(item, info))}
        ${section('preview-subjects', 'Đối tượng, thiệt hại và vật chứng', summary)}
        ${section('preview-handling', 'Kết quả xử lý', handlingResult(info))}
        ${section('preview-files', 'Tài liệu đính kèm', '<div data-preview-files></div>')}
        ${section('preview-history', 'Diễn biến và yêu cầu bổ sung',
          window.DailyReportsCasePreviewHistory.render(result))}
      </div><footer class="bcn-reader-footer"><p>${icon('lock-keyhole')}
        <span>Chỉ xem thông tin. Muốn chỉnh sửa, cần yêu cầu bổ sung.</span></p>
        <div data-preview-actions></div></footer>`;
  }
  window.DailyReportsCasePreviewView = { render };
})();
