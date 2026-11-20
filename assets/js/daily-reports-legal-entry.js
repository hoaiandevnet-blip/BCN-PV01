(() => {
  'use strict';
  const states = new WeakMap();
  const referencePrefix = 'reference:';
  const label = article => `Điều ${article.article_code}`
    + (article.clause_code ? ` · Khoản ${article.clause_code}` : '')
    + ` · ${article.title} · ${article.document_number}`;

  async function load(select, { request, day, businessCode, articleId, reference, readOnly = false,
    current = () => true }) {
    const key = `${day}:${businessCode}`;
    const previous = states.get(select);
    const selected = reference ? referencePrefix + reference.reference_id
      : articleId ?? (previous?.key === key ? (previous.loading ? previous.selected : select.value) : '');
    const state = { key, selected, loading: true, error: false };
    states.set(select, state);
    select.disabled = true;
    select.dataset.legalState = 'loading';
    select.replaceChildren(new Option('Đang tải điều / khoản pháp luật…', ''));
    try {
      const query = new URLSearchParams({ effective_on: day, business_code: businessCode });
      const { articles } = await request(`/legal/entry-options?${query}`);
      if (states.get(select) !== state || !current()) return;
      select.replaceChildren(new Option('Chưa xác định', ''));
      for (const [kind, title] of [['PUBLISHED', 'Danh mục đã thẩm định'],
        ['REFERENCE', 'Văn bản đính kèm · tham khảo']]) {
        const group = document.createElement('optgroup');
        group.label = title;
        for (const article of articles.filter(item => item.source_kind === kind)) {
          const value = kind === 'REFERENCE' ? referencePrefix + article.reference_id : article.id;
          group.append(new Option(label(article), value));
        }
        if (group.children.length) select.append(group);
      }
      if (selected && !Array.from(select.options).some(option => option.value === selected)
        && (reference || articleId)) {
        select.append(new Option(reference ? label(reference) : 'Phiên bản lịch sử đã liên kết', selected));
      }
      select.value = Array.from(select.options).some(option => option.value === selected) ? selected : '';
      state.loading = false;
      select.dataset.legalState = 'ready';
      select.disabled = readOnly;
      if (!articles.length && !selected) select.options[0].textContent = 'Chưa có điều luật cho hệ vụ việc này';
    } catch (error) {
      if (states.get(select) !== state || !current()) return;
      state.loading = false;
      state.error = true;
      select.dataset.legalState = 'error';
      select.replaceChildren(new Option('Chưa tải được danh sách — hãy bấm Cập nhật', ''));
      throw new Error(error instanceof TypeError
        ? 'Không tải được danh sách điều luật. Kiểm tra kết nối rồi bấm Cập nhật để thử lại.' : error.message);
    }
  }

  function applySelection(form, values) {
    const select = form.querySelector('[name="legal_article_id"]');
    const state = states.get(select);
    if (!state || state.loading || state.error) {
      throw new Error(state?.error ? 'Chưa tải được danh sách điều luật. Hãy cập nhật và thử lại.'
        : 'Danh sách điều luật đang tải. Vui lòng đợi rồi lưu hồ sơ.');
    }
    const selected = select.value;
    values.legal_article_id = selected.startsWith(referencePrefix) ? null : selected || null;
    values.legal_reference_id = selected.startsWith(referencePrefix) ? selected.slice(referencePrefix.length) : null;
  }

  function reset(root) {
    root.querySelectorAll('#bcnEntryLegal, #bcnCaseLegal').forEach(select => {
      states.delete(select);
      delete select.dataset.legalState;
      select.replaceChildren(new Option('Chưa xác định', ''));
    });
  }
  window.DailyReportsLegalEntry = { load, applySelection, reset };
})();
