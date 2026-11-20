(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

  window.DailyReportAccountPicker = {
    mount({ root, unitName }) {
      const $ = selector => root.querySelector(selector);
      const picker = $('#bcnRoleAccountPicker');
      const input = $('#bcnRoleAccountSearch');
      const select = $('#bcnRoleUser');
      const clearButton = $('#bcnRoleAccountClear');
      const panel = $('#bcnRoleAccountPanel');
      const list = $('#bcnRoleAccountOptions');
      const status = $('#bcnRoleAccountStatus');
      const escape = window.DailyReportsUI.escape;
      let accounts = [];
      let matches = [];
      let activeIndex = -1;

      function close() {
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
      }
      function clear() {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        input.value = '';
        input.title = '';
        input.setCustomValidity('');
        clearButton.hidden = true;
        close();
      }
      function highlight(index) {
        activeIndex = index;
        const options = [...list.querySelectorAll('[role="option"]')];
        options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
        const active = options[index];
        if (active) {
          input.setAttribute('aria-activedescendant', active.id);
          active.scrollIntoView({ block: 'nearest' });
        } else input.removeAttribute('aria-activedescendant');
      }
      function render() {
        if (input.disabled) return;
        const selected = accounts.find(item => item.id === select.value);
        const query = selected?.label === input.value ? '' : normalize(input.value);
        const terms = query.split(' ').filter(Boolean);
        const found = accounts.filter(item => terms.every(term => item.search.includes(term)));
        matches = found.slice(0, 20);
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        list.innerHTML = matches.map((item, index) =>
          `<li id="bcnRoleAccountOption${index}" role="option" aria-selected="false" data-account-index="${index}">
            <div class="bcn-account-option-top"><strong>${escape(item.username)}</strong>
              <span>${escape(item.unit)}</span></div>
            ${item.full_name ? `<small>${escape(item.full_name)}</small>` : ''}</li>`).join('');
        status.textContent = found.length > matches.length
          ? `Hiển thị ${matches.length}/${found.length} tài khoản. Nhập thêm để thu hẹp kết quả.`
          : found.length ? `${found.length} tài khoản phù hợp. Dùng ↑ ↓ và Enter để chọn.`
          : 'Không tìm thấy tài khoản phù hợp.';
        const bounds = picker.getBoundingClientRect();
        const below = window.innerHeight - bounds.bottom - 12;
        const above = bounds.top - 12;
        const openAbove = below < 200 && above > below;
        picker.classList.toggle('opens-up', openAbove);
        panel.style.maxHeight = `${Math.max(96, Math.min(320, openAbove ? above : below))}px`;
        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }
      function choose(index) {
        const account = matches[index];
        if (!account) return;
        select.value = account.id;
        input.value = account.label;
        input.title = account.label;
        input.setCustomValidity('');
        clearButton.hidden = false;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus({ preventScroll: true });
        close();
      }
      input.addEventListener('focus', render);
      input.addEventListener('click', () => { if (panel.hidden) render(); });
      input.addEventListener('input', () => {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        input.title = '';
        input.setCustomValidity(input.value ? 'Hãy chọn một tài khoản trong danh sách gợi ý.' : '');
        clearButton.hidden = !input.value;
        render();
      });
      input.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (panel.hidden) render();
          if (matches.length) {
            const next = event.key === 'ArrowDown' ? activeIndex + 1
              : activeIndex < 0 ? matches.length - 1 : activeIndex - 1;
            highlight((next + matches.length) % matches.length);
          }
        } else if (event.key === 'Enter' && !panel.hidden) {
          event.preventDefault();
          choose(activeIndex < 0 ? 0 : activeIndex);
        } else if (event.key === 'Escape' && !panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === 'Tab') close();
      });
      list.addEventListener('mousedown', event => event.preventDefault());
      list.addEventListener('click', event => {
        const option = event.target.closest('[data-account-index]');
        if (option) choose(Number(option.dataset.accountIndex));
      });
      clearButton.addEventListener('click', () => {
        clear();
        input.focus({ preventScroll: true });
        render();
      });
      picker.addEventListener('focusout', event => {
        if (!picker.contains(event.relatedTarget)) close();
      });
      document.addEventListener('pointerdown', event => {
        if (!picker.contains(event.target)) close();
      });
      window.addEventListener('resize', close);
      root.addEventListener('bcn:navigate', close);
      $('#bcnRoleManagement').addEventListener('toggle', event => { if (!event.target.open) close(); });
      $('#bcnRoleForm').addEventListener('reset', () => queueMicrotask(clear));

      return {
        selected() { return accounts.find(item => item.id === select.value) || null; },
        setAccounts(values) {
          const selectedId = select.value;
          accounts = values.map(item => {
            const unit = item.unit_name || (item.team_id ? unitName(item.team_id) : 'Chưa gắn đơn vị công tác');
            const label = [item.username, item.full_name, unit].filter(Boolean).join(' · ');
            return { ...item, id: String(item.id), unit, label, search: normalize(label) };
          });
          select.innerHTML = '<option value="">Chọn tài khoản</option>' + accounts.map(item =>
            `<option value="${escape(item.id)}">${escape(item.label)}</option>`).join('');
          const selected = accounts.find(item => item.id === selectedId);
          if (selected) {
            select.value = selected.id;
            input.value = selected.label;
            input.title = selected.label;
            input.setCustomValidity('');
          } else if (selectedId) clear();
          input.disabled = false;
          input.dataset.loaded = 'true';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          if (!panel.hidden) render();
        },
        validate() {
          const selected = accounts.find(item => item.id === select.value);
          const valid = Boolean(selected && input.value === selected.label);
          input.setCustomValidity(valid ? '' : 'Hãy chọn một tài khoản trong danh sách gợi ý.');
          if (!valid) input.reportValidity();
          return valid;
        },
        reset() {
          accounts = [];
          matches = [];
          select.innerHTML = '';
          list.innerHTML = '';
          status.textContent = '';
          clear();
          input.disabled = true;
          delete input.dataset.loaded;
        }
      };
    }
  };
})();
