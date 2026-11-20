(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const value = content => escape(String(content ?? '').trim() || 'Chưa nhập');
  const date = content => content ? ui().date(content) : 'Chưa ghi thời gian';
  const kind = code => ({ INITIAL_REPORT: 'Báo cáo ban đầu', CASE_UPDATED: 'Cập nhật vụ việc',
    UPDATE: 'Diễn biến bổ sung' }[code] || 'Diễn biến bổ sung');
  const empty = message => `<p class="bcn-reader-history-empty">${message}</p>`;
  const count = (number, label) => `<span class="bcn-reader-history-count">${number} ${label}</span>`;
  const heading = (symbol, title, number, label) => `<h4 class="bcn-reader-history-heading">
    ${icon(symbol)}${title}${count(number, label)}</h4>`;

  function events(rows, item) {
    return `<section class="bcn-reader-history-block" aria-label="Diễn biến theo ngày">
      ${heading('list-tree', 'Diễn biến theo ngày', rows.length, 'diễn biến')}
      <div class="bcn-reader-event-list">${rows.map(row => `<article class="bcn-reader-event"
        data-reader-event="${escape(row.id)}">
        <header class="bcn-event-heading">
          <div class="bcn-event-date">${icon('calendar-days')}<div>
            <span>Ngày báo cáo</span><strong>${date(row.report_day)}</strong></div></div>
          <div class="bcn-event-state"><span class="bcn-event-kind">${kind(row.event_kind)}</span>
            ${ui().status(row.state)}</div>
        </header>
        ${window.DailyReportsCaseEventContent.render(row, item, { groupDecisions: true })}
        <div data-preview-event-files="${escape(row.id)}"></div>
      </article>`).join('') || empty('Chưa có diễn biến được ghi nhận.')}</div>
    </section>`;
  }

  function requests(rows) {
    const field = (label, content) => `<div><dt>${label}</dt><dd>${value(content)}</dd></div>`;
    return `<section class="bcn-reader-history-block" aria-label="Yêu cầu bổ sung">
      ${heading('message-square-more', 'Yêu cầu bổ sung', rows.length, 'yêu cầu')}
      <div class="bcn-reader-request-list">${rows.map((row, index) => `<article class="bcn-reader-request">
        <header><strong>Yêu cầu bổ sung ${index + 1}</strong><time>${date(row.created_at)}</time></header>
        <dl>${field('Nội dung yêu cầu', row.reason)}
          ${row.requested_fields?.length ? field('Thông tin cần bổ sung', row.requested_fields.join('\n')) : ''}
          ${field('Phản hồi của đơn vị', row.response || 'Chưa có phản hồi')}</dl>
      </article>`).join('') || empty('Chưa có yêu cầu bổ sung.')}</div>
    </section>`;
  }

  function versions(rows) {
    return `<details class="bcn-reader-versions bcn-reader-history-block">
      <summary>${icon('history')}Phiên bản đã gửi${count(rows.length, 'phiên bản')}</summary>
      <div class="bcn-reader-version-list">${rows.map(row => `<details class="bcn-reader-version">
        <summary><strong>Phiên bản ${escape(row.version)}</strong>${ui().status(row.state)}
          <time>${date(row.created_at)}</time></summary>
        <div class="bcn-reader-version-content"><h5>Nội dung đã gửi</h5>
          <p class="bcn-reader-narrative">${value(row.snapshot?.summary)}</p></div>
      </details>`).join('') || empty('Chưa có phiên bản được gửi.')}</div>
    </details>`;
  }

  window.DailyReportsCasePreviewHistory = {
    render: result => events(result.events || [], result.case)
      + requests(result.returns || []) + versions(result.submissions || [])
  };
})();
