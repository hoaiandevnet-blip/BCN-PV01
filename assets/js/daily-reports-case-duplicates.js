(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function history(candidate) {
    const days = candidate.previous_report_days || [];
    const exports = candidate.previous_export_ids || [];
    return `<dl class="bcn-case-duplicate-history">
      <div><dt>${icon('calendar-days')}Các ngày đã báo cáo</dt><dd>${days.length
        ? days.map(day => `<span>${escape(ui().date(String(day).slice(0, 10)))}</span>`).join('')
        : 'Chưa ghi nhận'}</dd></div>
      <div><dt>${icon('file-output')}Bản xuất trước</dt><dd>${exports.length
        ? exports.map(id => `<code>${escape(id)}</code>`).join('') : 'Chưa có bản xuất'}</dd></div>
    </dl>`;
  }

  function candidateCard(candidate) {
    const id = escape(candidate.id);
    const day = escape(ui().date(String(candidate.report_day).slice(0, 10)));
    const reasons = candidate.reasons || [];
    return `<article class="bcn-case-duplicate-card" data-duplicate-candidate="${id}">
      <header class="bcn-case-duplicate-header">
        <div class="bcn-case-duplicate-identity">${icon('files')}<div>
          <h5>Hồ sơ ngày <time>${day}</time></h5>
          ${candidate.stable_code ? `<p>${escape(candidate.stable_code)}</p>` : ''}</div></div>
        <button type="button" class="ghost" data-duplicate-open="${id}">
          ${icon('external-link')}Mở hồ sơ đối chiếu</button>
      </header>
      <div class="bcn-case-duplicate-body">
        <section class="bcn-case-duplicate-summary">
          <h6>${icon('file-text')}Nội dung vụ việc</h6>
          <p>${escape(candidate.summary || 'Chưa có nội dung')}</p>
        </section>
        <section class="bcn-case-duplicate-evidence">
          <h6>${icon('scan-search')}Dấu hiệu nghi trùng</h6>
          <ul>${reasons.map(reason => `<li>${icon('check')}
            <span>${escape(reason)}</span></li>`).join('')
            || '<li>Chưa có dấu hiệu được ghi nhận</li>'}</ul>
          <p>Gợi ý để đối chiếu, chưa phải kết luận trùng.</p>
        </section>
      </div>
      ${history(candidate)}
      <footer class="bcn-case-duplicate-decision">
        <label for="bcnDuplicateAction-${id}">${icon('clipboard-check')}Quyết định đối chiếu</label>
        <div><select id="bcnDuplicateAction-${id}" data-duplicate-action="${id}">
          <option value="SEPARATE_CASE">Xác nhận vụ riêng</option>
          <option value="DUPLICATE_NO_RECOUNT">Báo trùng, không đếm lại</option>
          <option value="APPEND_EVENT_TO_EXISTING">Diễn biến vụ cũ</option>
        </select><button type="button" class="ghost" data-duplicate-decide="${id}">
          ${icon('save')}Ghi quyết định</button></div>
      </footer>
    </article>`;
  }

  function render(candidates) {
    if (!candidates.length) return `<p class="bcn-case-duplicate-empty" role="status">
      ${icon('search')}Không tìm thấy hồ sơ gợi ý theo tiêu chí hiện tại.</p>`;
    return `<p class="bcn-case-duplicate-count" role="status">
      <strong>${candidates.length}</strong> hồ sơ cần đối chiếu</p>
      <div class="bcn-case-duplicate-list">${candidates.map(candidateCard).join('')}</div>`;
  }

  window.DailyReportsCaseDuplicates = { render };
})();
