(() => {
  'use strict';
  const schema = window.DailyReportIntakeSchema;
  const marker = '<span class="bcn-intake-required" aria-label="bắt buộc">*</span>';
  const otherDomain = 'Lĩnh vực khác';
  const sortedDomains = schema.workDomains.filter(name => name !== otherDomain)
    .sort((left, right) => left.localeCompare(right, 'vi', { sensitivity: 'base' }));
  if (schema.workDomains.includes(otherDomain)) sortedDomains.push(otherDomain);

  function mount(root) {
    const list = root.querySelector('[data-domain-entries]');
    const add = root.querySelector('[data-domain-add]');

    function update() {
      const rows = [...list.querySelectorAll('[data-domain-row]')];
      const selected = rows.map(row => row.querySelector('select').value).filter(Boolean);
      for (const row of rows) {
        const select = row.querySelector('select');
        const duplicate = select.value && selected.filter(value => value === select.value).length > 1;
        select.setCustomValidity(duplicate ? 'Mỗi lĩnh vực chỉ được chọn một lần.' : '');
        for (const option of select.options) {
          option.disabled = Boolean(option.value && option.value !== select.value && selected.includes(option.value));
        }
        const fields = row.querySelector('[data-domain-fields]');
        fields.hidden = !schema.workDomains.includes(select.value);
        fields.querySelectorAll('input').forEach(input => { input.disabled = fields.hidden; });
        row.querySelector('[data-domain-prompt]').hidden = !fields.hidden;
        row.querySelector('[data-domain-remove]').hidden = rows.length === 1;
      }
      add.disabled = rows.length >= schema.workDomains.length;
    }

    function addRow() {
      const row = document.createElement('div');
      row.className = 'bcn-domain-row';
      row.dataset.domainRow = '';
      row.innerHTML = `<div class="daily-report-form">
        <label class="daily-report-wide"><span>Lĩnh vực ${marker}</span>
          <select data-domain-select required><option value="">Chọn lĩnh vực</option>
            ${sortedDomains.map(name => `<option value="${name}">${name}</option>`).join('')}
          </select></label>
        <div class="daily-report-wide daily-report-form bcn-domain-fields" data-domain-fields hidden>
          ${schema.administrativeFields.map(([key, label, unit]) => `<label>
            <span>${label} (${unit}) ${marker}</span>
            <input data-domain-value="${key}" type="text" inputmode="numeric" required
              placeholder="${key === 'administrative_fines' ? 'Nhập số tiền (đồng)' : ''}">
          </label>`).join('')}
        </div><p class="daily-report-wide bcn-domain-prompt" data-domain-prompt>
          Chọn lĩnh vực để nhập các chỉ tiêu.</p>
        <div class="daily-report-wide bcn-domain-actions"><button type="button" class="ghost"
          data-domain-remove>Xóa lĩnh vực này</button></div>
      </div>`;
      row.querySelector('select').addEventListener('change', update);
      row.querySelector('[data-domain-remove]').addEventListener('click', () => {
        row.remove();
        update();
      });
      row.querySelectorAll('input').forEach(input => {
        const money = input.dataset.domainValue === 'administrative_fines';
        input.addEventListener('beforeinput', event => {
          const text = event.data ?? event.dataTransfer?.getData('text/plain');
          if (event.inputType.startsWith('insert') && text != null && /[^0-9]/.test(text)) event.preventDefault();
        });
        const sanitize = () => {
          const rawDigits = input.value.replace(/[^0-9]/g, '');
          if (money) {
            input.dataset.amount = rawDigits;
            if (rawDigits) {
              const formatted = Number(rawDigits).toLocaleString('en-US');
              input.value = formatted;
            } else {
              input.value = '';
            }
            const value = Number(rawDigits);
            input.setCustomValidity(!Number.isSafeInteger(value)
              ? 'Giá trị vượt quá giới hạn cho phép.' : '');
          } else {
            const cursor = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[^0-9]/g, '').length;
            input.value = rawDigits;
            input.setSelectionRange(cursor, cursor);
            const value = Number(rawDigits);
            input.setCustomValidity(!Number.isSafeInteger(value)
              ? 'Giá trị vượt quá giới hạn cho phép.' : '');
          }
        };
        input.addEventListener('input', sanitize);
        input.addEventListener('compositionend', sanitize);
      });
      list.append(row);
      update();
      return row;
    }

    add.addEventListener('click', () => {
      if (!add.disabled) addRow().querySelector('select').focus();
    });
    addRow();
    return {
      set(entries) {
        list.replaceChildren();
        for (const entry of entries || []) {
          const row = addRow();
          row.querySelector('select').value = entry.domain;
          row.querySelectorAll('[data-domain-value]').forEach(input => {
            const amount = entry.values?.[input.dataset.domainValue];
            input.value = amount == null ? '' : String(amount);
            if (input.dataset.domainValue === 'administrative_fines') input.dataset.amount = input.value;
          });
        }
        if (!list.children.length) addRow();
        update();
      },
      read() {
        return [...list.querySelectorAll('[data-domain-row]')].map(row => ({
          domain: row.querySelector('select').value,
          values: Object.fromEntries([...row.querySelectorAll('[data-domain-value]')]
            .map(input => [input.dataset.domainValue, input.dataset.domainValue === 'administrative_fines'
              ? Number(input.dataset.amount || input.value.replace(/[^0-9]/g, '')) : Number(input.value)]))
        }));
      },
      reset() {
        list.replaceChildren();
        addRow();
      }
    };
  }
  window.DailyReportDomainEntries = { mount };
})();
