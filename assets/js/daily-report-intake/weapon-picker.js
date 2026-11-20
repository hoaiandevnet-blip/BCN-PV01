(() => {
  'use strict';
  const options = ['Dao', 'Kiếm', 'Mã tấu', 'Giáo', 'Thương', 'Nỏ', 'Khác'];
  const fold = value => value.toLocaleLowerCase('vi').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const identity = value => value.normalize('NFC').toLocaleLowerCase('vi');

  function mount(form) {
    const root = form.querySelector('.bcn-weapon-picker');
    const input = root.querySelector('input');
    const toggle = root.querySelector('.bcn-weapon-toggle');
    const list = form.querySelector('#bcnWeaponOptions');
    const chips = form.querySelector('[data-weapon-selected]');
    const selected = [];
    let matches = [];
    let active = -1;

    const contains = value => selected.some(item => identity(item) === identity(value));
    function validate() {
      const pending = input.value.trim();
      const values = pending && !contains(pending) ? [...selected, pending] : selected;
      input.setCustomValidity(values.length > 20 || values.join(', ').length > 200
        ? 'Chọn tối đa 20 loại, tổng tên không quá 200 ký tự.' : '');
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function renderChips() {
      chips.replaceChildren();
      chips.hidden = !selected.length;
      for (const value of selected) {
        const chip = document.createElement('span');
        chip.className = 'bcn-weapon-chip';
        const text = document.createElement('span');
        text.textContent = value;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Bỏ ${value}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          selected.splice(selected.indexOf(value), 1);
          renderChips();
          validate();
          input.focus();
          render();
        });
        chip.append(text, remove);
        chips.append(chip);
      }
    }
    function select(value) {
      const name = value.trim();
      if (!name) return;
      if (contains(name)) selected.splice(selected.findIndex(item => identity(item) === identity(name)), 1);
      else if (selected.length < 20 && [...selected, name].join(', ').length <= 200) selected.push(name);
      else {
        input.setCustomValidity('Chọn tối đa 20 loại, tổng tên không quá 200 ký tự.');
        input.reportValidity();
        return;
      }
      input.value = '';
      validate();
      renderChips();
      input.focus();
      render();
    }
    function render(query = '') {
      const search = query.trim();
      matches = options.filter(option => fold(option).includes(fold(search)));
      list.replaceChildren();
      active = -1;
      for (const [index, value] of matches.entries()) {
        const option = document.createElement('button');
        option.type = 'button';
        option.id = `bcnWeaponOption${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(contains(value)));
        const label = document.createElement('span');
        label.textContent = value;
        const mark = document.createElement('span');
        mark.className = 'bcn-weapon-check';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = contains(value) ? '✓' : '';
        option.append(label, mark);
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => select(value));
        list.append(option);
      }
      if (search && !options.some(option => identity(option) === identity(search))) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'bcn-weapon-add';
        add.textContent = `Thêm “${search}”`;
        add.addEventListener('mousedown', event => event.preventDefault());
        add.addEventListener('click', () => select(search));
        list.append(add);
      } else if (!matches.length) {
        const empty = document.createElement('span');
        empty.className = 'bcn-weapon-empty';
        empty.textContent = 'Không có gợi ý.';
        list.append(empty);
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    }
    function highlight() {
      const buttons = [...list.querySelectorAll('[role="option"]')];
      buttons.forEach((button, index) => button.classList.toggle('is-active', index === active));
      const current = buttons[active];
      if (current) {
        input.setAttribute('aria-activedescendant', current.id);
        current.scrollIntoView({ block: 'nearest' });
      }
    }
    input.addEventListener('focus', () => render());
    input.addEventListener('input', () => { validate(); render(input.value); });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) render(input.value);
        if (!matches.length) return;
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        highlight();
      } else if (event.key === 'Enter' && !list.hidden) {
        event.preventDefault();
        if (active >= 0) select(matches[active]);
        else if (matches.length === 1) select(matches[0]);
        else if (input.value.trim()) select(input.value);
        else close();
      }
    });
    toggle.addEventListener('click', () => {
      if (!list.hidden) close();
      else { input.focus(); render(); }
    });
    document.addEventListener('pointerdown', event => {
      if (!root.contains(event.target) && !chips.contains(event.target) && !list.contains(event.target)) close();
    });
    form.addEventListener('reset', () => {
      selected.splice(0);
      chips.replaceChildren();
      chips.hidden = true;
      input.setCustomValidity('');
      close();
    });
    return {
      set(values) {
        selected.splice(0);
        for (const value of values || []) {
          if (typeof value === 'string' && value.trim() && !contains(value.trim())) selected.push(value.trim());
        }
        input.value = '';
        validate();
        renderChips();
        close();
      },
      read() {
        const pending = input.value.trim();
        return pending && !contains(pending) ? [...selected, pending] : [...selected];
      }
    };
  }
  window.DailyReportWeaponPicker = { mount };
})();
