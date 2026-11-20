(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  function layout() {
    return `<section class="bcn-duplicates" id="bcnDuplicatesWorkspace" aria-label="Kiểm tra trùng">
      <form id="bcnDuplicateFilters" class="bcn-dup-filters">
        <label>Ngày báo cáo<input id="bcnDuplicateDay" name="report_day" type="date" required></label>
        <label>Đơn vị báo cáo<select id="bcnDuplicateUnit" name="unit_id"><option value="">Tất cả đơn vị được giao</option>
          </select></label>
        <label>Hệ nghiệp vụ<select id="bcnDuplicateBusiness" name="business_code">
          <option value="">Tất cả hệ nghiệp vụ</option>${ui().options(ui().domains)}</select></label>
        <button id="bcnDuplicateLoad" type="submit" class="primary">${icon('scan-search')}Kiểm tra trùng</button>
      </form>
      <div class="bcn-dup-metrics" aria-label="Kết quả lượt kiểm tra">
        ${[['scanned', 'Hồ sơ đã đối chiếu', 'files'], ['pending', 'Cặp cần rà soát', 'copy-check'],
          ['priority', 'Cặp ưu tiên kiểm tra', 'flag'], ['saved', 'Kết luận đã ghi', 'check-check']]
          .map(([key, label, symbol]) => `<article data-dup-metric-card="${key}">
            <span class="bcn-dup-metric-icon" aria-hidden="true">${icon(symbol)}</span>
            <span class="bcn-dup-metric-label">${label}</span>
            <strong data-dup-metric="${key}">—</strong></article>`).join('')}
      </div>
      <div class="bcn-dup-progress">
        <div><span id="bcnDuplicateStatus" role="status" aria-live="polite">Chọn phạm vi và bắt đầu kiểm tra.</span>
          <small id="bcnDuplicateCoverage">Mỗi lượt đối chiếu tối đa 20 hồ sơ.</small></div>
        <progress id="bcnDuplicateProgress" value="0" max="1" aria-label="Tiến độ đối chiếu"></progress>
        <button type="button" id="bcnDuplicateStop" class="ghost" hidden>Dừng</button>
        <button type="button" id="bcnDuplicateNext" class="ghost" hidden>Kiểm tra tiếp</button>
      </div>
      <p class="bcn-dup-error" id="bcnDuplicateError" role="alert" hidden></p>
      <div class="bcn-dup-layout">
        <section class="bcn-dup-results" aria-labelledby="bcnDuplicateResultsTitle">
          <header><h3 id="bcnDuplicateResultsTitle">Cặp hồ sơ cần đối chiếu</h3>
            <span id="bcnDuplicateResultCount">0 cặp</span></header>
          <div class="bcn-dup-result-filters">
            <label class="bcn-dup-search">Tìm trong kết quả<input id="bcnDuplicateSearch" type="search"
              placeholder="Nội dung, đơn vị, mã hồ sơ…" maxlength="120"></label>
            <label>Trạng thái<select id="bcnDuplicateState"><option value="pending">Chờ kết luận</option>
              <option value="">Tất cả</option><option value="saved">Đã xử lý trong lượt này</option></select></label>
            <label>Ưu tiên<select id="bcnDuplicatePriority"><option value="">Tất cả dấu hiệu</option>
              <option value="important">Ưu tiên kiểm tra</option></select></label>
          </div>
          <div id="bcnDuplicatePairs" class="bcn-dup-pairs"></div>
          <footer class="bcn-dup-pagination"><button type="button" class="ghost" data-dup-page="-1"
              aria-label="Trang kết quả trước">${icon('chevron-left')}</button><span id="bcnDuplicatePage"></span>
            <button type="button" class="ghost" data-dup-page="1" aria-label="Trang kết quả tiếp">
              ${icon('chevron-right')}</button></footer>
        </section>
        <section id="bcnDuplicateComparison" class="bcn-dup-comparison" aria-label="Đối chiếu hai hồ sơ"></section>
      </div>
      <details class="bcn-dup-receipts"><summary>Kết luận trong lượt kiểm tra này
        <span id="bcnDuplicateReceiptCount">0</span></summary><ol id="bcnDuplicateDecisions"></ol></details>
    </section>`;
  }
  function empty(title, description, symbol = 'scan-search') {
    return `<div class="bcn-dup-empty">${icon(symbol)}<strong>${ui().escape(title)}</strong>
      <p>${ui().escape(description)}</p></div>`;
  }
  function renderList(host, state) {
    const model = window.DailyReportsDuplicatesModel;
    const escape = ui().escape;
    const rows = model.visibleRows(state);
    const pages = Math.max(1, Math.ceil(rows.length / 12));
    state.page = Math.min(state.page, pages - 1);
    host.querySelector('#bcnDuplicateResultCount').textContent = `${rows.length} / ${state.rows.length} cặp`;
    host.querySelector('#bcnDuplicatePage').textContent = `Trang ${state.page + 1} / ${pages}`;
    host.querySelector('[data-dup-page="-1"]').disabled = state.page === 0;
    host.querySelector('[data-dup-page="1"]').disabled = state.page >= pages - 1;
    host.querySelector('#bcnDuplicatePairs').innerHTML = rows.slice(state.page * 12, state.page * 12 + 12)
      .map(row => `<button type="button" class="bcn-dup-pair ${state.selected === row.key ? 'is-selected' : ''}"
        data-dup-pair="${escape(row.key)}" aria-pressed="${state.selected === row.key}">
        <span class="bcn-dup-pair-top"><span class="bcn-dup-badge ${row.candidate.important ? 'is-priority' : ''}">
          ${row.decision || row.covered ? 'Đã xử lý' : row.candidate.important ? 'Ưu tiên kiểm tra' : 'Cần đối chiếu'}
          </span><b>${escape(row.candidate.score)} điểm</b></span>
        <strong>${escape(model.title(row.source))}</strong>
        <small>${escape(row.source.unit_name || '')} · ${ui().date(String(row.source.report_day).slice(0, 10))}</small>
        <span class="bcn-dup-versus">${icon('arrow-left-right')}Hồ sơ ngày
          ${ui().date(String(row.candidate.report_day).slice(0, 10))}</span>
        <span class="bcn-dup-excerpt">${escape(model.title(row.candidate))}</span>
        <small>${row.candidate.reasons.length} dấu hiệu đối chiếu</small></button>`).join('')
      || empty(state.busy ? 'Đang đối chiếu hồ sơ…' : !state.started ? 'Sẵn sàng rà soát'
        : state.rows.length ? 'Không có cặp phù hợp bộ lọc' : 'Chưa có cặp nghi vấn',
      !state.started ? 'Chọn ngày và đơn vị, sau đó bấm Kiểm tra trùng.'
        : 'Kết quả chỉ phản ánh các hồ sơ đã đối chiếu trong lượt này.');
    window.lucide?.createIcons({ root: host });
  }
  function renderStatus(host, state) {
    const pending = state.rows.filter(row => !row.decision && !row.covered);
    const values = { scanned: state.started ? `${state.scanned} / ${state.total ?? '…'}` : '—',
      pending: state.started ? pending.length : '—',
      priority: state.started ? pending.filter(row => row.candidate.important).length : '—',
      saved: state.receipts.length };
    for (const [key, value] of Object.entries(values)) {
      host.querySelector(`[data-dup-metric="${key}"]`).textContent = value;
    }
    const remaining = state.offset < state.queue.length || state.nextOffset !== null;
    const progress = host.querySelector('#bcnDuplicateProgress');
    progress.max = state.total || 1;
    progress.value = state.scanned;
    const status = !state.started ? 'Chọn phạm vi và bắt đầu kiểm tra.' : state.busy
      ? `Đang đối chiếu ${state.scanned} / ${state.total ?? '…'} hồ sơ…`
      : state.error ? `Tạm dừng ở ${state.scanned} hồ sơ. Có thể thử lại.`
        : state.stopped ? `Đã dừng · giữ lại kết quả của ${state.scanned} hồ sơ.`
          : remaining ? `Đã đối chiếu ${state.scanned} / ${state.total} hồ sơ. Còn hồ sơ chưa kiểm tra.`
            : `Hoàn tất đối chiếu ${state.scanned} hồ sơ trong phạm vi đã chọn.`;
    host.querySelector('#bcnDuplicateStatus').textContent = status;
    host.querySelector('#bcnDuplicateCoverage').textContent = state.started
      ? 'Điểm đối chiếu là tổng trọng số dấu hiệu, không phải phần trăm chắc chắn trùng.'
      : 'Mỗi lượt đối chiếu tối đa 20 hồ sơ. Kết luận do cán bộ rà soát ghi nhận.';
    host.querySelector('#bcnDuplicateStop').hidden = !state.busy;
    const resumable = remaining || state.error || (state.stopped && state.total === null);
    host.querySelector('#bcnDuplicateNext').hidden = state.busy || !state.started || !resumable;
    host.querySelector('#bcnDuplicateNext').disabled = state.saving;
    host.querySelector('#bcnDuplicateNext').textContent = state.error ? 'Thử lại' : 'Đối chiếu 20 hồ sơ tiếp';
    host.querySelectorAll('#bcnDuplicateFilters input,#bcnDuplicateFilters select,#bcnDuplicateLoad')
      .forEach(element => { element.disabled = state.busy || state.saving; });
    const error = host.querySelector('#bcnDuplicateError');
    error.textContent = state.error;
    error.hidden = !state.error;
    host.querySelector('#bcnDuplicatePairs').setAttribute('aria-busy', String(state.busy));
    const submit = host.querySelector('#bcnDuplicateSave');
    if (submit) submit.disabled = state.busy || state.saving;
    host.querySelectorAll('#bcnDuplicateDecisionForm input,#bcnDuplicateDecisionForm textarea')
      .forEach(element => { element.disabled = state.saving; });
    host.querySelector('#bcnDuplicateReceiptCount').textContent = state.receipts.length;
    host.querySelector('#bcnDuplicateDecisions').innerHTML = state.receipts.map(row => `<li>
      <strong>${ui().escape(window.DailyReportsDuplicatesModel.actions[row.decision.action][0])}</strong>
      <span>${ui().escape(window.DailyReportsDuplicatesModel.title(row.source))}</span>
      <p>${ui().escape(row.decision.reason)}</p></li>`).join('')
      || '<li>Chưa ghi kết luận trong lượt này. Kết luận đã lưu được ghi vào lịch sử xử lý của hệ thống.</li>';
  }
  window.DailyReportsDuplicatesView = { layout, empty, renderList, renderStatus };
})();
