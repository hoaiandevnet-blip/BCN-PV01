(() => {
  'use strict';
  const controllers = new WeakMap();
  const view = () => window.DailyReportsClassificationView;
  const ui = () => window.DailyReportsUI;
  function savedGroups(item) {
    if (item?.classifications?.length) return item.classifications;
    return [{ business_code: item?.business_code || 'PPHS', legal_selections:
      item?.legal_article_id || item?.legal_reference ? [{ legal_article_id: item.legal_article_id,
        legal_reference: item.legal_reference }] : [] }];
  }
  function mount(host, { request, getDay, item, readOnly = false, onPetition, notify = () => {} }) {
    const form = host.closest('form');
    const initial = savedGroups(item);
    let sequence = 0;
    const makeGroup = data => {
      const selected = new Map((data.legal_selections || []).map(selection => {
        const article = view().fromSaved(selection);
        return [view().key(article), article];
      }));
      return { id: ++sequence, code: ui().canonicalBusinessCode(data.business_code || ''),
        selected, options: new Map(selected), day: '', loading: false, error: false, query: '', token: 0 };
    };
    let groups = initial.map(makeGroup);
    host.classList.add('bcn-classifications');
    host.innerHTML = `<header class="bcn-classifications-heading"><div>
      <h4>${ui().fieldLabel('Hệ vụ việc và điều / khoản pháp luật *')}</h4>
      <p>Chọn nhiều điều / khoản trong từng hệ. Thêm hệ khác nếu vụ việc liên quan nhiều lĩnh vực.</p>
      </div><span data-classification-count></span></header><div data-classification-groups></div>
      ${readOnly ? '' : `<footer><button type="button" class="ghost" data-classification-add>
        <i data-lucide="plus" aria-hidden="true"></i>Thêm hệ vụ việc</button>
        ${onPetition ? '<button type="button" class="ghost" data-classification-petition>'
          + 'Nhập tình hình khiếu kiện</button>' : ''}</footer>`}`;
    const list = host.querySelector('[data-classification-groups]');
    const card = group => list.querySelector(`[data-group-id="${group.id}"]`);
    function emit() {
      const first = groups[0]?.code || '';
      if (form.elements.business_code) form.elements.business_code.value = first;
      if (form.elements.category_code) form.elements.category_code.value = first;
      form.dispatchEvent(new CustomEvent('bcn:classifications', { detail: groups.map(group => group.code) }));
      host.querySelector('[data-classification-count]').textContent = `${groups.filter(group => group.code).length} hệ`;
      const add = host.querySelector('[data-classification-add]');
      if (add) add.disabled = groups.length >= Object.keys(ui().domains).length || groups.some(group => !group.code);
      host.dataset.legalState = groups.some(group => group.error) ? 'error'
        : groups.some(group => group.loading || (group.code && !group.day)) ? 'loading' : 'ready';
    }
    function render() {
      list.innerHTML = groups.map(group => view().card(group, groups, readOnly)).join('');
      window.lucide?.createIcons({ root: host });
      emit();
    }
    function renderBody(group) {
      const node = card(group);
      if (!node) return;
      node.querySelector('[data-group-body]').innerHTML = view().body(group, readOnly);
    }
    function updateSelected(group) {
      const node = card(group);
      node.querySelector('.bcn-law-selection').innerHTML = view().selected(group, false);
      node.querySelector('.bcn-law-count').textContent = `Đã chọn ${group.selected.size}`;
    }
    async function load(group) {
      const day = getDay();
      if (!group.code || !day) return;
      const token = ++group.token;
      group.loading = true;
      group.error = false;
      emit();
      renderBody(group);
      try {
        const query = new URLSearchParams({ effective_on: day, business_code: group.code });
        const { articles } = await request(`/legal/entry-options?${query}`);
        if (token !== group.token || !groups.includes(group)) return;
        group.options = new Map(articles.map(article => [view().key(article), article]));
        for (const [key, article] of group.selected) {
          if (group.options.has(key)) group.selected.set(key, group.options.get(key));
          else group.options.set(key, article);
        }
        group.day = day;
      } catch (error) {
        if (token !== group.token || !groups.includes(group)) return;
        group.error = true;
        notify(error.message);
      } finally {
        if (token === group.token && groups.includes(group)) {
          group.loading = false;
          renderBody(group);
          emit();
        }
      }
    }
    async function refresh() {
      await Promise.all(groups.filter(group => group.code && !group.loading
        && (!group.day || group.day !== getDay() || group.error)).map(load));
    }
    host.addEventListener('change', event => {
      if (readOnly) return;
      const node = event.target.closest('[data-group-id]');
      const group = groups.find(value => value.id === Number(node?.dataset.groupId));
      if (!group) return;
      if (event.target.matches('[data-group-code]')) {
        const code = event.target.value;
        if (groups.some(value => value !== group && value.code === code)) return;
        group.code = code;
        group.selected.clear();
        group.options.clear();
        group.query = '';
        group.day = '';
        group.token += 1;
        group.loading = false;
        render();
        load(group);
      }
      if (event.target.matches('[data-law-key]')) {
        const key = event.target.dataset.lawKey;
        if (event.target.checked && group.selected.size >= 100) {
          event.target.checked = false;
          notify('Mỗi hệ được chọn tối đa 100 điều / khoản.');
          return;
        }
        if (event.target.checked) group.selected.set(key, group.options.get(key));
        else group.selected.delete(key);
        updateSelected(group);
      }
    });
    host.addEventListener('input', event => {
      if (!event.target.matches('[data-law-search]')) return;
      const group = groups.find(value => value.id === Number(event.target.closest('[data-group-id]').dataset.groupId));
      group.query = event.target.value;
      if (!group.loading && !group.error) card(group).querySelector('.bcn-law-options').innerHTML = view().options(group);
    });
    host.addEventListener('click', event => {
      if (readOnly) return;
      const button = event.target.closest('button');
      if (!button) return;
      const group = groups.find(value => value.id === Number(button.closest('[data-group-id]')?.dataset.groupId));
      if (button.matches('[data-classification-add]')) {
        groups.push(makeGroup({ business_code: '' }));
        render();
        card(groups.at(-1)).querySelector('select').focus();
      } else if (button.matches('[data-group-remove]') && groups.length > 1) {
        group.token += 1;
        groups = groups.filter(value => value !== group);
        render();
      } else if (button.matches('[data-law-remove]')) {
        group.selected.delete(button.dataset.lawRemove);
        updateSelected(group);
        card(group).querySelector('.bcn-law-options').innerHTML = view().options(group);
      } else if (button.matches('[data-law-retry]')) load(group);
      else if (button.matches('[data-classification-petition]')) onPetition();
    });
    function reset() {
      groups.forEach(group => { group.token += 1; });
      groups = initial.map(makeGroup);
      render();
    }
    form.addEventListener('reset', () => queueMicrotask(() => { reset(); refresh(); }));
    const controller = {
      refresh, reset,
      codes: () => groups.map(group => group.code),
      apply(values) {
        if (groups.some(group => !group.code)) throw new Error('Vui lòng chọn hệ vụ việc hoặc bỏ nhóm chưa chọn.');
        if (groups.some(group => group.loading || !group.day || group.error)) {
          throw new Error('Danh sách điều luật chưa tải xong. Vui lòng đợi hoặc bấm Thử lại.');
        }
        values.classifications = groups.map(group => ({ business_code: group.code,
          legal_selections: [...group.selected.values()].map(article => article.reference_id
            ? { legal_reference_id: article.reference_id } : { legal_article_id: article.id }) }));
        values.business_code = groups[0].code;
        values.category_code ||= groups[0].code;
        delete values.legal_article_id;
        delete values.legal_reference_id;
      }
    };
    controllers.set(form, controller);
    render();
    return controller;
  }
  window.DailyReportsClassifications = {
    mount, savedGroups,
    codes: form => controllers.get(form)?.codes(),
    apply: (form, values) => controllers.get(form).apply(values)
  };
})();
