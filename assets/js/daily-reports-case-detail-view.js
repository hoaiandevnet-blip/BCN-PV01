(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const heading = (name, title, description = '') => `<header class="bcn-detail-section-heading">
    <span class="bcn-detail-section-icon">${icon(name)}</span><div><h4>${title}</h4>
    ${description ? `<p>${description}</p>` : ''}</div></header>`;
  const empty = text => `<p class="bcn-detail-empty">${text}</p>`;
  const eventKind = value => ({ INITIAL_REPORT: 'Báo cáo ban đầu', CASE_UPDATED: 'Cập nhật vụ việc',
    UPDATE: 'Diễn biến bổ sung' }[value] || 'Diễn biến bổ sung');

  function events(rows, item, canCompile, eventId, canCompose) {
    if (!rows.length) return empty('Chưa có diễn biến bổ sung.');
    return `<div class="bcn-detail-timeline">${rows.map(value => `<article class="bcn-detail-event"
      data-event-id="${escape(value.id)}" ${value.id === eventId ? 'data-notification-focus' : ''}>
      <header class="bcn-event-heading"><div class="bcn-event-date">
        ${icon('calendar-days')}<div><span>Ngày báo cáo</span><strong>${ui().date(value.report_day)}</strong></div>
        </div><div class="bcn-event-state"><span class="bcn-event-kind">${eventKind(value.event_kind)}</span>
        ${ui().status(value.state)}</div></header>
      ${window.DailyReportsCaseEventContent.render(value, item)}
      <div class="bcn-detail-actions">
        ${canCompile && item.current_state === 'VERIFIED' && value.state === 'PENDING_REVIEW'
          ? `<button class="ghost" data-event-verify="${escape(value.id)}">
            ${icon('badge-check')}Duyệt diễn biến</button>` : ''}
        ${canCompose && value.state === 'VERIFIED'
          ? `<button class="ghost" data-event-compose="${escape(value.id)}">
            ${icon('file-output')}Mở tổng hợp ngày ${ui().date(value.report_day)}</button>` : ''}
      </div><div data-event-files="${escape(value.id)}"></div></article>`).join('')}</div>`;
  }

  function history(result) {
    return `<div class="bcn-detail-history">
      <details class="bcn-detail-disclosure" ${result.returns.length ? 'open' : ''}>
        <summary>${icon('message-square-more')}Yêu cầu bổ sung
          <span class="bcn-detail-count">${result.returns.length}</span></summary>
        <div class="bcn-detail-disclosure-body">${result.returns.map(value => `<article class="bcn-detail-return">
          <header><strong>${escape(value.reason)}</strong><time>${ui().date(value.created_at)}</time></header>
          ${(value.requested_fields || []).length ? `<p>${escape(value.requested_fields.join(' · '))}</p>` : ''}
          <p><span>Phản hồi:</span> ${escape(value.response || 'Chưa phản hồi')}</p></article>`).join('')
          || empty('Chưa có yêu cầu bổ sung.')}</div></details>
      <details class="bcn-detail-disclosure">
        <summary>${icon('history')}Phiên bản đã gửi
          <span class="bcn-detail-count">${result.submissions.length}</span></summary>
        <div class="bcn-detail-disclosure-body">${result.submissions.map(value => `<details class="bcn-detail-version">
          <summary><strong>Phiên bản ${escape(value.version)}</strong>${ui().status(value.state)}
            <time>${ui().date(value.created_at)}</time></summary>
          <div><p class="bcn-detail-narrative">${escape(value.snapshot.summary)}</p>
            <p>${escape(value.snapshot.location_general)}</p>
            ${window.DailyReportsPersons.summary(value.snapshot.persons || [])}
            <details class="bcn-detail-integrity"><summary>Mã kiểm tra tính toàn vẹn</summary>
              <code>${escape(value.snapshot_sha256)}</code></details></div></details>`).join('')
          || empty('Chưa có phiên bản được gửi.')}</div></details></div>`;
  }

  function render({ result, canEdit, canCompile, canReport, focusEvent, reportDay, unitName,
    compilerModules = null, view, handlingUnitName = '' }) {
    const item = result.case;
    const permitted = key => canCompile && (compilerModules === null || compilerModules.includes(key));
    const reviewing = view === 'approval' && permitted('approval');
    const canSupplement = reviewing
      && ['PENDING_REVIEW', 'RESUBMITTED', 'SUBMITTED', 'VERIFIED'].includes(item.current_state);
    const canVerify = reviewing
      && ['PENDING_REVIEW', 'RESUBMITTED', 'SUBMITTED'].includes(item.current_state);
    return `<div class="bcn-case-detail" data-case-mode="${canEdit ? 'edit' : 'read'}">
      <header class="bcn-detail-header">
        <div class="bcn-detail-heading"><span class="bcn-detail-emblem">${icon('folder-open')}</span>
          <div><p class="bcn-detail-eyebrow">${reviewing ? 'Phê duyệt vụ việc' : 'Báo cáo ngày'}</p>
            <h3>Chi tiết vụ việc</h3></div></div>
        <div class="bcn-detail-header-actions">${ui().status(item.current_state)}
        </div>
        <button type="button" class="ghost bcn-case-close" data-case-close
          aria-label="Đóng chi tiết vụ việc" title="Đóng">${icon('x')}</button>
      </header>
      <nav class="bcn-detail-nav" aria-label="Nội dung hồ sơ">
        <button type="button" data-case-section="bcnDetailInformation" aria-current="location">
          ${icon('file-text')}Thông tin</button>
        <button type="button" data-case-section="bcnEditPersons">${icon('users-round')}Đối tượng
          <span>${item.reference_info?.subjects?.length ?? (item.persons || []).length}</span></button>
        <button type="button" data-case-section="bcnCaseAttachments">${icon('paperclip')}Tài liệu</button>
        <button type="button" data-case-section="bcnDetailEvents">${icon('list-tree')}Lịch sử xử lý</button>
      </nav>
      <div class="bcn-detail-scroll">
        <dl class="bcn-detail-meta">
          <div><dt>${icon('building-2')}Đơn vị báo cáo</dt><dd>${escape(unitName)}</dd></div>
          <div><dt>${icon('calendar-days')}Ngày báo cáo</dt><dd>${ui().date(item.report_day)}</dd></div>
          <div><dt>${icon('layers')}Phiên bản hiện tại</dt><dd>Phiên bản ${escape(item.version)}</dd></div>
        </dl>
        ${focusEvent ? `<aside class="bcn-detail-notice">${icon('bell-ring')}<div>
          <strong>Nội dung từ thông báo</strong><p>${escape(focusEvent.narrative)}</p>
          <p>Ghi nhận vào báo cáo ngày ${ui().date(reportDay)}.
          ${focusEvent.state === 'PENDING_REVIEW' ? 'Cần được duyệt trước khi chọn vào báo cáo.' : ''}</p>
          </div></aside>` : ''}
        ${item.reference_info && !canEdit
          ? window.DailyReportsCaseDossier.render(item, { unitName, handlingUnitName })
          : `<form id="bcnCaseEdit" class="daily-report-form bcn-detail-form">
          <section class="bcn-detail-section daily-report-wide" id="bcnDetailInformation" tabindex="-1">
            ${heading('file-text', 'Thông tin vụ việc', canEdit
              ? 'Cập nhật thông tin và lưu chỉnh sửa cho hồ sơ này.' : 'Thông tin đã được đơn vị gửi báo cáo.')}
            <div class="bcn-detail-fields">
              <label class="daily-report-wide">Tên vụ việc<input name="title" maxlength="200"
                value="${escape(item.title)}" ${canEdit ? '' : 'readonly'}></label>
              <label class="daily-report-wide">Nội dung vụ việc
                <textarea name="summary" ${canEdit ? '' : 'readonly'}>${escape(item.summary)}</textarea></label>
              ${canEdit || item.external_reference ? `<label class="daily-report-wide">Số hồ sơ nguồn
                <input name="external_reference" value="${escape(item.external_reference)}"
                  ${canEdit ? '' : 'readonly'}></label>` : ''}
            </div>
          </section>
          <section class="daily-report-wide" id="bcnEditClassifications"></section>
          <section class="daily-report-wide" id="bcnEditLocation"></section>
          <section class="daily-report-wide" id="bcnEditPersons" tabindex="-1"></section>
        </form>`}
        <section class="bcn-detail-section" id="bcnCaseAttachments" tabindex="-1"></section>
        <section class="bcn-detail-section" id="bcnDetailEvents" tabindex="-1">
          ${heading('list-tree', 'Diễn biến & xử lý', 'Theo dõi các nội dung bổ sung theo ngày báo cáo.')}
          ${events(result.events, item, reviewing, focusEvent?.id, permitted('composer'))}
          <div class="bcn-detail-actions bcn-detail-event-actions">
            ${canReport ? `<button class="ghost" id="bcnAddEvent">
              ${icon('file-pen-line')}Cập nhật</button>` : ''}
            ${permitted('composer') ? `<button class="ghost" id="bcnCountCase">
              ${icon('clipboard-check')}Xác nhận thống kê PPHS lần đầu</button>` : ''}</div>
        </section>
        ${history(result)}
        ${permitted('duplicates') ? `<section class="bcn-detail-section bcn-detail-duplicates">
          <div class="bcn-detail-duplicate-heading"><div><h4>${icon('scan-search')}Kiểm tra trùng</h4>
            <p>Đối chiếu hồ sơ này với các vụ việc đã báo cáo trước đó.</p></div>
            <button class="ghost" id="bcnDuplicateCheck">${icon('scan-search')}Đối chiếu các ngày trước</button>
          </div><div id="bcnDuplicateRows"></div></section>` : ''}
      </div>
      <footer class="bcn-detail-footer${!canEdit ? ' bcn-detail-footer-review' : ''}">
        ${icon(canEdit ? 'pencil-line' : 'shield-check')}
        <span>${canEdit ? (item.current_state === 'RETURNED'
          ? 'Cập nhật sẽ lưu sửa đổi và gửi lại hồ sơ cho Trung tâm.' : 'Cập nhật để lưu chỉnh sửa hồ sơ.')
          : reviewing ? 'Đối chiếu thông tin trước khi phê duyệt hồ sơ' : 'Chế độ xem hồ sơ'}</span>
        ${canEdit || canVerify || canSupplement ? `<div class="bcn-detail-footer-actions">
          ${canSupplement ? `<button type="button" class="ghost" id="bcnRequestSupplement">
            ${icon('corner-up-left')}Trả lại / Yêu cầu bổ sung</button>` : ''}
          ${canVerify ? `<button type="button" class="primary" id="bcnVerifyCase">
            ${icon('badge-check')}Duyệt hồ sơ</button>` : ''}
          ${canEdit ? `
          <button type="submit" class="primary" form="bcnCaseEdit" id="bcnCaseUpdate">
            ${icon('save')}Cập nhật</button>` : ''}
        </div>` : ''}</footer>
    </div>`;
  }

  function bind(container) {
    const dialog = container.closest('dialog');
    const scroll = container.querySelector('.bcn-detail-scroll');
    const buttons = [...container.querySelectorAll('[data-case-section]')];
    const select = active => buttons.forEach(button => {
      if (button === active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
    buttons.forEach(button => {
      button.onclick = () => {
        const section = container.querySelector(`#${button.dataset.caseSection}`);
        if (!section) return;
        if (button.dataset.caseSection === 'bcnDetailInformation') {
          scroll.scrollTo({ top: 0, behavior: 'instant' });
        } else {
          section.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
        select(button);
        section.tabIndex = -1;
        section.focus({ preventScroll: true });
      };
    });
    scroll.addEventListener('scroll', () => {
      const top = scroll.getBoundingClientRect().top + 40;
      const current = buttons.filter(button => {
        const section = container.querySelector(`#${button.dataset.caseSection}`);
        return section && section.getBoundingClientRect().top <= top;
      }).at(-1);
      select(current || buttons[0]);
    }, { passive: true });
    container.querySelector('[data-case-close]').onclick = () => dialog.close();
    window.lucide?.createIcons({ root: container, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
  }
  window.DailyReportsCaseDetailView = { render, bind };
})();
