(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const key = article => article.reference_id ? 'reference:' + article.reference_id : article.id;
  const label = article => article ? `Điều ${article.article_code}`
    + (article.clause_code ? ` · Khoản ${article.clause_code}` : '') : 'Điều luật đã liên kết';
  const fromSaved = selection => {
    const article = selection.legal_reference || selection.article_snapshot;
    return { ...(article || {}), id: selection.legal_article_id,
      reference_id: selection.legal_reference?.reference_id,
      title: article?.title || 'Phiên bản lịch sử đã liên kết' };
  };
  function selected(group, readOnly) {
    return [...group.selected].map(([value, article]) => `<span class="bcn-law-chip">
      <span>${escape(label(article))}</span>${readOnly ? '' : `<button type="button" data-law-remove="${escape(value)}"
        aria-label="Bỏ ${escape(label(article))}">×</button>`}</span>`).join('')
      || '<span class="bcn-classification-empty">Chưa chọn điều / khoản</span>';
  }
  function options(group) {
    const normalize = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd').toLocaleLowerCase('vi');
    const query = normalize(group.query || '');
    const matches = [...group.options.values()].filter(article =>
      normalize(`${label(article)} ${article.title} ${article.document_number}`).includes(query));
    if (!matches.length) return '<p class="bcn-classification-empty">Không có điều / khoản phù hợp.</p>';
    return matches.map(article => `<label class="bcn-law-choice">
      <input type="checkbox" data-law-key="${escape(key(article))}" ${group.selected.has(key(article)) ? 'checked' : ''}>
      <span><strong>${escape(label(article))}</strong><span>${escape(article.title)}</span>
        <small>${escape(article.document_number || 'Phiên bản lịch sử')}</small></span></label>`).join('');
  }
  function body(group, readOnly) {
    if (readOnly) return `<div class="bcn-law-readonly">${[...group.selected.values()].map(article =>
      `<p><strong>${escape(label(article))}</strong> · ${escape(article.title)}
        <small>${escape(article.document_number || '')}</small></p>`).join('')
      || '<p class="bcn-classification-empty">Chưa xác định điều / khoản pháp luật.</p>'}</div>`;
    if (!group.code) return '<p class="bcn-classification-empty">Chọn hệ vụ việc để xem danh sách điều / khoản.</p>';
    return `<div class="bcn-law-selection" aria-live="polite">${selected(group, false)}</div>
      <div class="bcn-law-search-row"><label>Tìm điều / khoản
        <input type="search" data-law-search placeholder="Số điều, số khoản hoặc tên tội danh"
          value="${escape(group.query || '')}"></label>
        <span class="bcn-law-count">Đã chọn ${group.selected.size}</span></div>
      <div class="bcn-law-options" aria-label="Điều khoản của ${escape(ui().domainName(group.code))}">
        ${group.loading ? '<p class="bcn-classification-empty" role="status">Đang tải điều / khoản…</p>'
    : group.error ? '<p class="bcn-classification-empty">Chưa tải được danh sách. <button type="button"'
      + ' data-law-retry>Thử lại</button></p>' : options(group)}</div>`;
  }
  function card(group, groups, readOnly) {
    const selectedCodes = groups.filter(value => value !== group).map(value => value.code);
    return `<article class="bcn-classification-card" data-group-id="${group.id}">
      <header><label>${ui().fieldLabel('Hệ vụ việc *')}<select data-group-code required ${readOnly ? 'disabled' : ''}>
        <option value="">Chọn hệ vụ việc</option>${Object.entries(ui().domains).map(([code, title]) =>
          `<option value="${code}" ${group.code === code ? 'selected' : ''}
            ${selectedCodes.includes(code) ? 'disabled' : ''}>${escape(title)}</option>`).join('')}</select></label>
        ${readOnly ? '' : `<button type="button" class="ghost" data-group-remove
          ${groups.length === 1 ? 'disabled' : ''} aria-label="Bỏ hệ ${escape(ui().domainName(group.code) || 'chưa chọn')}">
          <i data-lucide="trash-2" aria-hidden="true"></i>Bỏ hệ</button>`}</header>
      <div data-group-body>${body(group, readOnly)}</div></article>`;
  }
  window.DailyReportsClassificationView = { key, label, fromSaved, selected, options, body, card };
})();
