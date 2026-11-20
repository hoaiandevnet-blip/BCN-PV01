(() => {
  'use strict';
  function render(host, row, { unitName, busy, saving }) {
    const ui = window.DailyReportsUI;
    const model = window.DailyReportsDuplicatesModel;
    const escape = ui.escape;
    if (!row) {
      host.innerHTML = window.DailyReportsDuplicatesView.empty('Chọn một cặp hồ sơ',
        'Đọc hai nội dung cạnh nhau, xem dấu hiệu trùng rồi ghi phương án xử lý.', 'panels-left-bottom');
      return;
    }
    const source = row.details?.source || row.source;
    const candidate = row.details?.candidate || row.candidate;
    const matches = new Set(row.candidate.matching_fields.flatMap(field => field.split(',')));
    const field = (label, value, key) => `<div class="${matches.has(key) ? 'is-match' : ''}">
      <dt>${label}${matches.has(key) ? '<span class="bcn-dup-match">Có dấu hiệu trùng</span>' : ''}</dt>
      <dd>${escape(value || 'Chưa có thông tin')}</dd></div>`;
    const card = (item, label, kind) => `<article class="bcn-dup-document" data-dup-document="${kind}">
      <header><span>${label}</span><button type="button" class="ghost" data-dup-open="${escape(item.id)}">
        <i data-lucide="external-link" aria-hidden="true"></i>Mở hồ sơ</button></header>
      <h4>${escape(model.title(item))}</h4>
      <p class="bcn-dup-code">${escape(item.stable_code || '')}</p>
      <dl>${field('Ngày báo cáo', ui.date(String(item.report_day).slice(0, 10)), 'report_day')}
        ${field('Đơn vị', item.unit_name || (item.unit_id ? unitName(item.unit_id) : ''), 'unit_id')}
        ${field('Hệ nghiệp vụ', item.business_code ? ui.domainName(item.business_code) : '', 'business_code')}
        ${field('Địa điểm', item.location_general, 'location_general')}
        ${field('Thời điểm xảy ra', item.occurred_at ? ui.date(item.occurred_at) : '', 'occurred_at')}
        ${field('Số hồ sơ nguồn', item.external_reference, 'external_reference')}
        ${field('Đối tượng', item.persons?.map(person => person.name).filter(Boolean).join(', '), 'persons')}</dl>
      <section class="bcn-dup-narrative ${matches.has('summary') ? 'is-match' : ''}">
        <h5>Nội dung hồ sơ</h5><p>${escape(item.summary || 'Chưa có nội dung')}</p></section>
    </article>`;
    let conclusion;
    if (row.decision) {
      conclusion = `<section class="bcn-dup-conclusion"><i data-lucide="circle-check" aria-hidden="true"></i>
        <div><h4>Đã ghi: ${escape(model.actions[row.decision.action][0])}</h4>
        <p>${escape(row.decision.reason)}</p><small>Kết luận đã được lưu vào hệ thống.</small></div></section>`;
    } else if (row.covered) {
      conclusion = `<section class="bcn-dup-conclusion"><div><h4>Hồ sơ đang xét đã có kết luận ở cặp khác</h4>
        <p>${escape(row.covered)}. Mở hồ sơ để xem trạng thái mới trước khi rà soát tiếp.</p></div></section>`;
    } else if (!row.details) {
      conclusion = `<p class="bcn-dup-detail-status" role="status">${row.error
        ? escape(row.error) : 'Đang tải thông tin hai hồ sơ để đối chiếu…'}</p>`
        + (row.error ? '<button class="ghost" type="button" data-dup-retry>Thử tải lại hồ sơ</button>' : '');
    } else {
      conclusion = `<form id="bcnDuplicateDecisionForm" class="bcn-dup-decision">
        <div><h4>Kết luận đối chiếu</h4><p>Áp dụng cho hồ sơ đang xét. Chọn phương án và ghi rõ căn cứ.</p></div>
        <fieldset><legend>Phương án xử lý</legend><div class="bcn-dup-choices">
          ${Object.entries(model.actions).map(([value, [label, description]]) => `<label>
            <input type="radio" name="action" value="${value}" required ${row.action === value ? 'checked' : ''}>
            <span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}
        </div></fieldset>
        <label>Lý do và căn cứ đối chiếu <span aria-hidden="true">*</span>
          <textarea name="reason" required maxlength="2000" rows="3"
            placeholder="Nêu dấu hiệu đã đối chiếu và căn cứ chọn phương án…">${escape(row.reason || '')}</textarea></label>
        <p class="bcn-dup-error" data-dup-save-error role="alert" ${row.saveError ? '' : 'hidden'}>
          ${escape(row.saveError || '')}</p>
        <footer><small>Kết luận được lưu kèm người xử lý và căn cứ.</small>
          <button type="submit" id="bcnDuplicateSave" class="primary" ${busy || saving ? 'disabled' : ''}>
            <i data-lucide="save" aria-hidden="true"></i>${saving ? 'Đang ghi…' : 'Ghi kết luận'}</button></footer>
      </form>`;
    }
    host.innerHTML = `<header class="bcn-dup-comparison-heading"><div><span class="bcn-dup-kicker">ĐỐI CHIẾU HỒ SƠ</span>
      <h3>Kiểm tra dấu hiệu trùng</h3></div><span class="bcn-dup-score ${row.candidate.important ? 'is-priority' : ''}">
      <strong>${escape(row.candidate.score)}</strong> điểm đối chiếu</span></header>
      <section class="bcn-dup-evidence" aria-label="Dấu hiệu từ hệ thống">
        <h4>${row.candidate.important ? 'Ưu tiên kiểm tra' : 'Cần đối chiếu thủ công'}</h4>
        <ul>${row.candidate.reasons.map(reason => `<li><i data-lucide="check" aria-hidden="true"></i>
          ${escape(reason)}</li>`).join('')}</ul>
        <p>Các dấu hiệu là gợi ý rà soát. Cùng đối tượng chưa đủ để kết luận cùng vụ việc.</p>
      </section>
      <div class="bcn-dup-documents">${card(source, 'HỒ SƠ ĐANG XÉT', 'source')}
        ${card(candidate, 'HỒ SƠ ĐỐI CHIẾU', 'candidate')}</div>
      <details class="bcn-dup-history"><summary>Lịch sử báo cáo của hồ sơ đối chiếu</summary>
        <p>Các ngày có diễn biến: ${row.candidate.previous_report_days.length
          ? row.candidate.previous_report_days.map(day => ui.date(String(day).slice(0, 10))).join(' · ')
          : 'Chưa có diễn biến được ghi nhận.'}</p>
        <p>Đã xuất hiện trong ${row.candidate.previous_export_ids.length} bản xuất báo cáo.</p></details>
      ${conclusion}`;
    window.lucide?.createIcons({ root: host });
  }
  window.DailyReportsDuplicatesComparison = { render };
})();
