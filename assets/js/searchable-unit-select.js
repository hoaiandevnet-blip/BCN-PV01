(() => {
  'use strict';

  const enhanced = new WeakSet();
  let listId = 0;

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('vi').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
  }

  function isUnitSelect(select) {
    if (select.multiple || select.dataset.searchableUnit === 'false') return false;
    if (select.dataset.searchableUnit === 'true') return true;
    const identity = `${select.id} ${select.name} ${select.getAttribute('aria-label') || ''}`;
    if (/unit.?type|department.?type|unit.?group|loại đơn vị|nhóm đơn vị/i.test(identity)) return false;
    if (/unit|department|team|don.?vi|dia.?ban/i.test(identity)) return true;
    const label = select.closest('label');
    const labelText = label ? [...label.childNodes]
      .filter(node => node !== select && node.nodeType !== Node.COMMENT_NODE)
      .map(node => node.textContent).join(' ').trim() : '';
    return /^(tên\s+)?đơn vị\b|^địa bàn\b|^đội\s*\/\s*trạm/i.test(labelText)
      && !/^(loại|nhóm)\s+đơn vị/i.test(labelText);
  }

  function enhance(select) {
    if (enhanced.has(select) || !isUnitSelect(select)) return;
    enhanced.add(select);
    const wrapper = document.createElement('span');
    wrapper.className = 'unit-search';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'unit-search-input';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    const label = select.getAttribute('aria-label') || select.closest('label')?.textContent
      .split('\n')[0].trim() || 'Đơn vị / địa bàn';
    input.setAttribute('aria-label', `${label} - nhập để tìm`);
    const list = document.createElement('span');
    list.className = 'unit-search-options';
    list.id = `unit-search-options-${++listId}`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.setAttribute('aria-controls', list.id);
    select.before(wrapper);
    wrapper.append(select, input, list);
    select.classList.add('unit-search-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    let active = -1;
    let matches = [];

    function sync() {
      if (document.activeElement !== input || list.hidden) {
        input.value = select.selectedOptions[0]?.textContent.trim() || '';
      }
      input.disabled = select.disabled;
      input.required = select.required;
      input.placeholder = select.options[0]?.textContent.trim() || 'Nhập để tìm đơn vị';
    }

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function choose(option) {
      if (!option || option.disabled || option.parentElement?.disabled) return;
      const changed = select.value !== option.value;
      select.value = option.value;
      close();
      input.value = option.textContent.trim();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    function draw(query = '') {
      const needle = normalize(query);
      matches = [...select.options].filter(option => !option.hidden
        && !option.disabled && !option.parentElement?.disabled
        && (!needle || normalize(option.textContent).includes(needle)));
      list.replaceChildren();
      matches.forEach((option, index) => {
        const item = document.createElement('span');
        item.className = 'unit-search-option';
        item.id = `${list.id}-${index}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.textContent = option.textContent.trim();
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => choose(option));
        list.append(item);
      });
      if (!matches.length) {
        const empty = document.createElement('span');
        empty.className = 'unit-search-empty';
        empty.textContent = 'Không tìm thấy đơn vị phù hợp';
        list.append(empty);
      }
      active = -1;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('focus', () => {
      sync();
      draw();
      input.select();
    });
    input.addEventListener('click', () => {
      if (list.hidden) draw();
    });
    input.addEventListener('input', () => draw(input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close();
        sync();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) draw();
        if (!matches.length) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        const item = list.querySelector(`#${list.id}-${active}`);
        list.querySelectorAll('.is-active').forEach(node => node.classList.remove('is-active'));
        item.classList.add('is-active');
        input.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && !list.hidden) {
        event.preventDefault();
        if (active >= 0) choose(matches[active]);
        else if (matches.length === 1) choose(matches[0]);
      }
    });
    input.addEventListener('blur', () => {
      close();
      sync();
    });
    select.addEventListener('change', sync);
    select.addEventListener('invalid', event => {
      event.preventDefault();
      input.focus();
      input.setCustomValidity('Vui lòng chọn đơn vị trong danh sách.');
      input.reportValidity();
      input.setCustomValidity('');
    });
    select.form?.addEventListener('reset', () => setTimeout(sync, 0));
    new MutationObserver(() => {
      sync();
      if (!list.hidden) draw(input.value);
    }).observe(select, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled', 'required', 'selected', 'label', 'hidden'] });
    sync();
  }

  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.matches?.('select')) enhance(root);
    root.querySelectorAll?.('select').forEach(enhance);
  }

  scan(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)))
    .observe(document.body, { childList: true, subtree: true });
})();
