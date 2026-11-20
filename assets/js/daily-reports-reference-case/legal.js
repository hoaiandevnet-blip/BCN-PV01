(() => {
  'use strict';
  const key = article => article.source_kind === 'REFERENCE'
    ? `reference:${article.reference_id}` : `published:${article.id}`;
  const label = article => `Điều ${article.article_code}`
    + (article.clause_code ? `, khoản ${article.clause_code}` : '') + ` — ${article.title}`;
  const name = value => String(value || '').replace(/^Điều\s+[^—–]+[—–]\s*/iu, '').replace(/^Tội\s+/iu, '').trim();
  window.DailyReportReferenceLegal = {
    mount({ form, item, readOnly, request, getScope }) {
      const field = form.elements.case_type;
      const business = form.elements.business_code;
      const status = form.querySelector('[data-case-type-status]');
      const retry = form.querySelector('[data-case-type-retry]');
      const title = form.elements.title;
      const list = form.querySelector('[data-case-type-selected]');
      const info = item?.reference_info;
      const saved = info?.case_types || (info?.case_type
        ? [{ key: info.case_type_key || '__legacy_saved', label: info.case_type }] : []);
      let generation = 0;
      let state = 'empty';
      let choices = new Map();
      let selected = [];
      function render() {
        if (!list) return;
        list.replaceChildren(...selected.map(entry => {
          const row = document.createElement('div');
          const text = document.createElement('span');
          const entryLabel = String(entry?.label || entry?.title || entry?.name || '');
          const parts = entryLabel.match(/^(Điều\s+[^—–]+)\s*[—–]\s*(.+)$/u);
          if (parts) {
            const article = document.createElement('strong');
            article.className = 'bcn-selected-article-number';
            article.textContent = parts[1].trim();
            const description = document.createElement('span');
            description.textContent = parts[2];
            text.append(article, description);
          } else {
            text.textContent = entryLabel;
          }
          text.className = 'bcn-selected-article-text';
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'ghost';
          remove.textContent = 'Bỏ chọn';
          remove.setAttribute('aria-label', `Bỏ chọn ${entryLabel}`);
          remove.disabled = readOnly;
          remove.onclick = () => {
            selected = selected.filter(value => value.key !== entry.key);
            render();
          };
          row.append(text, remove);
          return row;
        }));
        for (const option of field.options) option.disabled = selected.some(entry => entry.key === option.value);
        title.readOnly = readOnly || Boolean(selected.length);
        if (selected.length) {
          const names = selected.map(entry => name(entry.label));
          const combined = names.join('; ');
          const unit = form.elements.unit_id.selectedOptions[0]?.textContent || '';
          title.value = `${combined.charAt(0).toLocaleUpperCase('vi')}${combined.slice(1)} (${unit})`;
          title.setCustomValidity('');
        } else if (title.dataset.automatic === 'true') {
          title.value = '';
        }
        title.dataset.automatic = String(Boolean(selected.length));
      }
      async function load(restore = false) {
        const current = ++generation;
        const code = business.value;
        choices = new Map();
        selected = [];
        field.replaceChildren(new Option(code ? 'Đang tải điều luật…' : 'Chọn lĩnh vực trước', ''));
        field.disabled = true;
        render();
        retry.hidden = true;
        status.textContent = '';
        state = code ? 'loading' : 'empty';
        field.dataset.legalState = state;
        if (!code) return;
        try {
          const day = item?.report_day?.slice(0, 10) || getScope()?.reportDay;
          const query = new URLSearchParams({ business_code: code, effective_on: day || '' });
          const response = await request(`/legal/entry-options?${query}`);
          if (current !== generation || business.value !== code) return;
          choices = new Map(response.articles.map(article => [key(article), article]));
          field.replaceChildren(new Option(choices.size ? 'Chọn thêm điều luật / loại vụ việc' : 'Chưa có điều luật phù hợp', ''),
            ...[...choices].map(([value, article]) => new Option(label(article), value)));
          if (restore && code === item?.business_code) selected = saved.map(entry => ({ ...entry }));
          field.disabled = readOnly || !choices.size;
          status.textContent = choices.size ? 'Có thể chọn nhiều điều trong cùng lĩnh vực.'
            : 'Lĩnh vực này chưa có điều luật trong danh mục hiện có.';
          state = 'ready';
        } catch (error) {
          if (current !== generation) return;
          field.replaceChildren(new Option('Không tải được danh mục', ''));
          status.textContent = error.message;
          retry.hidden = readOnly;
          state = 'error';
        }
        field.dataset.legalState = state;
        render();
      }
      field.addEventListener('change', () => {
        const article = choices.get(field.value);
        if (article && !selected.some(entry => entry.key === key(article))) {
          selected.push({ key: key(article), label: label(article) });
        }
        field.value = '';
        render();
      });
      form.elements.unit_id.addEventListener('change', render);
      business.addEventListener('change', () => load(false));
      retry.onclick = () => load(Boolean(item && business.value === item.business_code));
      return {
        reset: () => load(true),
        apply(info) {
          if (state === 'loading' || state === 'error') {
            throw new Error(state === 'loading' ? 'Danh sách điều luật đang tải. Vui lòng đợi.'
              : 'Chưa tải được danh sách điều luật. Bấm Thử lại trước khi lưu.');
          }
          info.case_types = selected.map(entry => ({ ...entry }));
          info.case_type = selected.map(entry => entry.label).join('; ');
          info.case_type_key = selected[0]?.key || '';
        }
      };
    }
  };
})();
