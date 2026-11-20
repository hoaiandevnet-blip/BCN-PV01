(() => {
  'use strict';

  const escape = value => window.DailyReportsUI.escape(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const statuses = {
    REQUESTED: ['Chờ duyệt', 'clock-3', 'warning'],
    APPROVED: ['Đã chấp thuận', 'check-check', 'success'],
    REJECTED: ['Đã từ chối', 'circle-x', 'danger'],
    EXPIRED: ['Hết hạn', 'timer-off', 'expired']
  };
  const kinds = { CASE: 'Vụ việc', SITUATION: 'Tình hình', WORK_RESULT: 'Kết quả công tác' };
  const purpose = item => ({
    CASE_SUPPLEMENT: 'Bổ sung vụ việc', REPORT_SUPPLEMENT: 'Bổ sung báo cáo'
  })[item.purpose] || 'Mở khóa nhập báo cáo';
  const day = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
  };
  const dateTime = value => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(value));
  };
  function effectiveStatus(item) {
    return item.status === 'APPROVED' && item.expires_at && new Date(item.expires_at).getTime() <= Date.now()
      ? 'EXPIRED' : item.status;
  }
  const viewTone = item => statuses[effectiveStatus(item)]?.[2] || 'muted';
  function status(item) {
    const [label, symbol, tone] = statuses[effectiveStatus(item)] || [item.status, 'circle-help', 'muted'];
    return `<span class="unlock-badge" data-tone="${tone}">${icon(symbol)}${escape(label)}</span>`;
  }
  function expiry(item) {
    if (item.expires_at) return `Hết hạn ${dateTime(item.expires_at)}`;
    if (item.status === 'APPROVED' && item.purpose === 'CASE_SUPPLEMENT') return 'Bổ sung theo hồ sơ được duyệt';
    if (item.status === 'REQUESTED') return item.purpose === 'CASE_SUPPLEMENT'
      ? 'Chờ PV01 duyệt bổ sung hồ sơ' : 'Mở 30 phút kể từ khi được duyệt';
    return item.status === 'REJECTED' ? 'Yêu cầu chưa được chấp thuận' : '';
  }
  function context(item, unitName) {
    return `<div class="unlock-decision-context daily-report-wide">
      <strong>${escape(unitName(item.unit_id))}</strong>
      <p>${escape(purpose(item))} · Ngày ${day(item.report_day)}</p>
      <p>${escape(kinds[item.scope_kind] || item.scope_kind)} · <code>${escape(item.scope_id)}</code></p>
      <p class="unlock-full-text">${escape(item.reason)}</p></div>`;
  }
  function row(item, { unitName, isCompiler }) {
    const id = escape(item.id);
    const pending = effectiveStatus(item) === 'REQUESTED';
    return `<article class="unlock-request" data-unlock-id="${id}">
      <div class="unlock-request-main">
        <div class="unlock-request-unit"><span class="unlock-unit-icon">${icon('building-2')}</span>
          <div><h4>${escape(unitName(item.unit_id))}</h4>
            <small>Ngày báo cáo <strong>${day(item.report_day)}</strong></small>
            <span class="unlock-purpose">${escape(purpose(item))}</span></div></div>
        <div class="unlock-request-reason"><span class="unlock-label">
          ${icon('message-square-text')}Lý do đề nghị</span>
          <p id="unlockReason-${id}" class="unlock-reason-text">${escape(item.reason)}</p>
          <div class="unlock-reason-meta"><small>${icon('clock-3')}Gửi lúc ${dateTime(item.created_at)}</small>
            <button type="button" class="unlock-reason-toggle" data-unlock-reason-toggle
              aria-controls="unlockReason-${id}" aria-expanded="false" hidden>Đọc đầy đủ</button>
          </div></div>
        <div class="unlock-request-status">${status(item)}<small>${expiry(item)}</small></div>
      </div>
      <div class="unlock-request-footer">
        <details class="unlock-details"><summary>${icon('chevron-down')}Chi tiết yêu cầu</summary>
          <dl><div class="unlock-detail-scope"><dt>${icon('focus')}Phạm vi mở khóa</dt>
              <dd>${escape(kinds[item.scope_kind] || item.scope_kind)}</dd></div>
            <div class="unlock-detail-wide unlock-detail-reason"><dt>${icon('message-square-text')}Lý do đề nghị</dt>
              <dd class="unlock-full-text">${escape(item.reason)}</dd></div>
            <div class="unlock-detail-wide unlock-detail-decision"><dt>${icon('shield-check')}Ý kiến xử lý của PV01</dt>
              <dd class="unlock-full-text">${escape(item.decision_reason || (pending
                ? 'Đang chờ xem xét.' : 'Không có ghi chú.'))}</dd></div>
            <div class="unlock-detail-time"><dt>${icon('calendar-check')}Thời điểm chấp thuận</dt>
              <dd>${item.approved_at ? dateTime(item.approved_at) : 'Chưa chấp thuận'}</dd></div>
            <div class="unlock-detail-expiry" data-tone="${viewTone(item)}"><dt>${icon('timer')}Thời hạn mở khóa</dt>
              <dd>${expiry(item) || 'Không áp dụng'}</dd></div>
          </dl></details>
        ${isCompiler && pending ? `<div class="unlock-actions">
          <button type="button" class="ghost" data-reject="${id}">Từ chối</button>
          <button type="button" class="primary" data-approve="${id}">${icon('lock-keyhole-open')}
            ${item.purpose === 'CASE_SUPPLEMENT' ? 'Duyệt bổ sung' : 'Mở 30 phút'}</button></div>` : ''}
      </div></article>`;
  }
  function mount(root) {
    const pane = root.querySelector('[data-bcn-pane="unlock"]');
    const rows = root.querySelector('#dailyReportUnlockRows');
    const listCard = rows.closest('.card');
    pane.classList.add('unlock-workspace');
    listCard.classList.add('unlock-list-card');
    listCard.querySelector('.card-head').innerHTML = `<div><h3>Lịch sử đề nghị</h3>
      <p id="unlockListCaption">Theo dõi tiến độ và kết quả xử lý của PV01.</p></div>
      <span class="unlock-list-total" id="unlockTotal">0 yêu cầu</span>`;
    listCard.querySelector(':scope > .bcn-panel-description')?.remove();
    rows.insertAdjacentHTML('beforebegin', `<div class="unlock-filters">
      <label class="unlock-search">Tìm kiếm<div>${icon('search')}
        <input id="unlockSearch" type="search" placeholder="Đơn vị, mã đối tượng, lý do…" autocomplete="off"></div></label>
      <label>Trạng thái<select id="unlockStatus"><option value="">Tất cả trạng thái</option>
        ${Object.entries(statuses).map(([key, [label]]) => `<option value="${key}">${label}</option>`).join('')}
      </select></label>
      <label>Ngày báo cáo<input id="unlockDay" type="date"></label>
      <button type="button" class="ghost" id="unlockClear" title="Xóa bộ lọc">${icon('filter-x')}Xóa lọc</button>
      </div><div class="unlock-results-line"><span id="unlockResultCount" role="status" aria-live="polite"></span>
        <small>Chờ duyệt trước · Mới nhất trước</small></div>
      <div id="unlockLoadFeedback" class="unlock-load-feedback" hidden>
        <p role="alert"></p><button type="button" class="ghost" id="unlockRetry">Thử lại</button></div>`);
    rows.insertAdjacentHTML('afterend', `<nav class="unlock-pagination" aria-label="Phân trang đề nghị mở khóa">
      <small id="unlockPageLabel"></small><div><button type="button" class="ghost" id="unlockPrevious"
        aria-label="Trang trước">${icon('chevron-left')}</button>
        <button type="button" class="ghost" id="unlockNext" aria-label="Trang sau">${icon('chevron-right')}</button>
      </div></nav><p class="unlock-list-note">Hiển thị tối đa 300 yêu cầu gần nhất trong phạm vi được cấp quyền.
        Thời gian theo múi giờ Việt Nam.</p>`);
    const stats = document.createElement('div');
    stats.className = 'unlock-stats';
    stats.setAttribute('aria-label', 'Thống kê yêu cầu đã tải');
    stats.innerHTML = Object.entries(statuses).map(([key, [label, symbol, tone]]) => `
      <button type="button" class="unlock-stat" data-unlock-filter="${key}" data-tone="${tone}"
        aria-pressed="false"><span class="unlock-stat-icon">${icon(symbol)}</span>
        <span class="unlock-stat-copy"><span>${label}</span><strong data-unlock-count="${key}">—</strong></span>
        ${icon('arrow-up-right')}</button>`).join('');
    const rule = document.createElement('div');
    rule.className = 'unlock-rule';
    rule.innerHTML = `${icon('shield-check')}<p><strong>Mở khóa có kiểm soát.</strong>
      Tạo đề nghị tại Nhập báo cáo ngày. Ngày đề nghị theo đúng ngày báo cáo đang nhập.
      Yêu cầu được mở trong 30 phút kể từ khi duyệt.
      Bổ sung vụ việc áp dụng riêng theo hồ sơ được chấp thuận.</p>`;
    const layout = document.createElement('div');
    layout.className = 'unlock-layout unlock-layout-review';
    layout.append(listCard);
    pane.append(stats, rule, layout);
    return { pane, rows, layout };
  }
  window.DailyReportsUnlockView = { mount, row, context, effectiveStatus, statuses, purpose, escape, icon };
})();
