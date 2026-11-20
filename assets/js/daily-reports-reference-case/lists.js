(() => {
  'use strict';
  const model = window.DailyReportSubjectFields;
  const star = '<span class="bcn-required" aria-label="bắt buộc">*</span>';
  const escape = value => window.DailyReportsUI.escape(value);
  let cachedProvincesWards = null;
  function getProvincesWards() {
    if (!cachedProvincesWards) {
      cachedProvincesWards = fetch('/assets/data/vietnam-provinces-wards.json')
        .then(r => r.json())
        .catch(() => []);
    }
    return cachedProvincesWards;
  }

  function mount(form, initial = {}, { readOnly = false } = {}) {
    const count = form.querySelector('[data-reference-count="subjects"]');
    const trigger = form.querySelector('[data-reference-edit="subjects"]');
    const summary = form.querySelector('[data-reference-summary="subjects"]');
    let records = [];
    let quantity = 0;
    let opened;

    function renderSummary() {
      count.value = String(quantity);
      const active = records.slice(0, quantity);
      const incomplete = active.filter(person => Object.keys(model.issues(person)).length).length;
      const names = active.map(person => person.name.trim()).filter(Boolean);
      summary.textContent = names.join('; ') || (readOnly ? 'Xem danh sách' : 'Nhập thông tin đối tượng');
      if (incomplete) summary.textContent += ` · ${incomplete} hồ sơ chưa đầy đủ`;
    }

    function reset() {
      records = Array.isArray(initial.subject_details)
        ? initial.subject_details.map(model.blank)
        : (initial.subjects || []).map(name => model.blank({ name }));
      quantity = records.length;
      count.setCustomValidity('');
      renderSummary();
    }

    count.addEventListener('input', () => {
      const value = Number(count.value);
      if (!/^\d+$/.test(count.value) || !Number.isInteger(value) || value < 0 || value > 100) {
        count.setCustomValidity('Nhập số đối tượng từ 0 đến 100.');
        return;
      }
      count.setCustomValidity('');
      quantity = value;
      while (records.length < quantity) records.push(model.blank());
      renderSummary();
    });

    function open(validateImmediately = false) {
      if (opened?.open) return;
      const dialog = document.createElement('dialog');
      dialog.className = 'bcn-dialog card bcn-subject-dialog';
      dialog.setAttribute('aria-label', 'Thông tin đối tượng');
      dialog.innerHTML = `<header class="bcn-subject-header">
        <div class="bcn-subject-header-title">
          <div class="bcn-subject-header-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h3>Thông tin đối tượng</h3>
            <p>Năm sinh bắt buộc. Ngày, tháng sinh có thể để trống nếu chưa rõ thông tin.</p>
          </div>
        </div>
        <button type="button" class="bcn-subject-close-btn" data-close aria-label="Đóng">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </header>
      <form novalidate class="bcn-subject-form">
        <div class="bcn-subject-body" data-subject-rows></div>
        <footer class="bcn-subject-footer">
          <p role="alert" data-subject-error></p>
          <div class="bcn-subject-footer-bar">
            <div class="bcn-subject-count-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span data-subject-count>0 đối tượng</span>
            </div>
            <div class="bcn-subject-actions">
              ${readOnly ? '' : `<button type="button" class="ghost bcn-btn-add-subject" data-add>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Thêm đối tượng
              </button>`}
              <button type="button" class="ghost bcn-btn-cancel" data-cancel>${readOnly ? 'Đóng' : 'Hủy'}</button>
              ${readOnly ? '' : `<button type="submit" class="primary bcn-btn-save-subject" data-save>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Lưu danh sách
              </button>`}
            </div>
          </div>
        </footer>
      </form>`;
      const editor = dialog.querySelector('form');
      const rows = dialog.querySelector('[data-subject-rows]');
      const error = dialog.querySelector('[data-subject-error]');
      const addButton = dialog.querySelector('[data-add]');
      const cards = () => [...rows.querySelectorAll('[data-subject-card]')];
      const collect = card => Object.fromEntries(model.keys.map(key => [key,
        card.querySelector(`[data-subject-field="${key}"]`).value.trim()]));
      const renumber = () => {
        cards().forEach((card, index) => {
          card.querySelector('legend').textContent = `Đối tượng ${index + 1}`;
          card.querySelector('[data-remove]')?.setAttribute('aria-label', `Xóa đối tượng ${index + 1}`);
        });
        dialog.querySelector('[data-subject-count]').textContent = `${cards().length} đối tượng`;
        if (addButton) addButton.disabled = cards().length >= 100;
      };
      function add(person = model.blank()) {
        if (cards().length >= 100) return;
        const card = document.createElement('fieldset');
        card.dataset.subjectCard = '';
        card.innerHTML = `<div class="bcn-subject-card-head">
          <legend></legend>
          ${readOnly ? '' : `<button type="button" class="bcn-subject-remove-btn" data-remove title="Xóa đối tượng">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span>Xóa đối tượng</span>
          </button>`}
        </div>
        <!-- Hàng 1: Họ và tên, Giới tính, Ngày tháng năm sinh, Căn cước công dân trên cùng 1 hàng ngang -->
        <div class="bcn-subject-row bcn-subject-row-identity">
          <label class="bcn-subject-field-wrap bcn-field-name">
            <span class="bcn-subject-field-label">Họ và tên ${star}</span>
            <input data-subject-field="name" maxlength="180" required autocomplete="off"
              placeholder="Nhập đầy đủ họ và tên" value="${escape(person.name)}" ${readOnly ? 'disabled' : ''}>
          </label>
          <label class="bcn-subject-field-wrap bcn-field-gender">
            <span class="bcn-subject-field-label">Giới tính ${star}</span>
            <select data-subject-field="gender" required ${readOnly ? 'disabled' : ''}>
              <option value="">Chọn giới tính</option>${Object.entries(model.genders).map(([value, label]) =>
                `<option value="${value}" ${person.gender === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <div class="bcn-subject-field-wrap bcn-field-birth" role="group" aria-label="Ngày tháng năm sinh">
            <div class="bcn-subject-birth-inputs">
              ${[['birth_day', 'Ngày', 2, 'DD'], ['birth_month', 'Tháng', 2, 'MM'], ['birth_year', 'Năm', 4, 'YYYY']]
                .map(([key, label, length, ph]) => `<label class="bcn-subject-birth-item">
                  <span class="bcn-birth-sublabel">${label} ${key === 'birth_year' ? star : ''}</span>
                  <input type="text" inputmode="numeric" pattern="[0-9]+" maxlength="${length}"
                    placeholder="${ph}" data-subject-field="${key}" value="${escape(person[key])}" autocomplete="off"
                    ${key === 'birth_year' ? 'required' : ''} ${readOnly ? 'disabled' : ''}>
                </label>`).join('')}
            </div>
          </div>
          <label class="bcn-subject-field-wrap bcn-field-idcard">
            <span class="bcn-subject-field-label">Căn cước công dân (12 số) ${star}</span>
            <input data-subject-field="identity_number" maxlength="12" minlength="12" inputmode="numeric" pattern="[0-9]{12}"
              required placeholder="Nhập đủ 12 số CCCD" value="${escape(person.identity_number || '')}"
              autocomplete="off" ${readOnly ? 'disabled' : ''}>
          </label>
        </div>

        <!-- Hàng 3: Hộ khẩu thường trú (Chi tiết, Xã/Phường, Tỉnh/Thành phố) -->
        <div class="bcn-subject-row-address">
          <div class="bcn-address-header">
            <span class="bcn-address-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Hộ khẩu thường trú ${star}
            </span>
          </div>
          <div class="bcn-address-3col">
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Địa chỉ chi tiết</span>
              <input data-subject-field="permanent_detail" maxlength="300"
                placeholder="Số nhà, đường, thôn/xóm, khu phố..."
                value="${escape(person.permanent_detail || person.permanent_address || '')}" ${readOnly ? 'disabled' : ''}>
            </label>
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Xã / Phường</span>
              <div class="bcn-custom-select" data-type="ward">
                <input data-subject-field="permanent_ward" maxlength="150" autocomplete="off"
                  placeholder="Nhập hoặc chọn xã/phường"
                  value="${escape(person.permanent_ward || '')}" ${readOnly ? 'disabled' : ''}>
                <div class="bcn-select-dropdown" hidden></div>
              </div>
            </label>
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Tỉnh / Thành phố</span>
              <div class="bcn-custom-select" data-type="province">
                <input data-subject-field="permanent_province" maxlength="150" autocomplete="off"
                  placeholder="Nhập hoặc chọn tỉnh/thành phố"
                  value="${escape(person.permanent_province || '')}" ${readOnly ? 'disabled' : ''}>
                <div class="bcn-select-dropdown" hidden></div>
              </div>
            </label>
          </div>
          <!-- Hidden full field for legacy serialization fallback -->
          <input type="hidden" data-subject-field="permanent_address" value="${escape(person.permanent_address || '')}">
        </div>

        <!-- Hàng 4: Nơi ở hiện tại (Chi tiết, Xã/Phường, Tỉnh/Thành phố) -->
        <div class="bcn-subject-row-address">
          <div class="bcn-address-header">
            <span class="bcn-address-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              Nơi ở hiện tại ${star}
            </span>
          </div>
          <div class="bcn-address-3col">
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Địa chỉ chi tiết</span>
              <input data-subject-field="current_detail" maxlength="300"
                placeholder="Số nhà, đường, thôn/xóm, chỗ ở thực tế..."
                value="${escape(person.current_detail || person.current_address || '')}" ${readOnly ? 'disabled' : ''}>
            </label>
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Xã / Phường</span>
              <div class="bcn-custom-select" data-type="ward">
                <input data-subject-field="current_ward" maxlength="150" autocomplete="off"
                  placeholder="Nhập hoặc chọn xã/phường"
                  value="${escape(person.current_ward || '')}" ${readOnly ? 'disabled' : ''}>
                <div class="bcn-select-dropdown" hidden></div>
              </div>
            </label>
            <label class="bcn-subject-field-wrap">
              <span class="bcn-sublabel-addr">Tỉnh / Thành phố</span>
              <div class="bcn-custom-select" data-type="province">
                <input data-subject-field="current_province" maxlength="150" autocomplete="off"
                  placeholder="Nhập hoặc chọn tỉnh/thành phố"
                  value="${escape(person.current_province || '')}" ${readOnly ? 'disabled' : ''}>
                <div class="bcn-select-dropdown" hidden></div>
              </div>
            </label>
          </div>
          <!-- Hidden full field for legacy serialization fallback -->
          <input type="hidden" data-subject-field="current_address" value="${escape(person.current_address || '')}">
        </div>`;
        card.querySelector('[data-remove]')?.addEventListener('click', () => {
          card.remove();
          error.textContent = '';
          renumber();
        });
        rows.append(card);
        renumber();
      }
      records.slice(0, quantity).forEach(add);
      if (!quantity && !readOnly) add();
      renumber();
      addButton?.addEventListener('click', () => {
        add();
        cards().at(-1)?.querySelector('input').focus();
      });
      editor.addEventListener('beforeinput', event => {
        const field = event.target.dataset.subjectField;
        if (!field) return;
        if (field.startsWith('birth_') || field === 'identity_number') {
          const value = event.data ?? event.dataTransfer?.getData('text/plain');
          if (event.inputType.startsWith('insert') && value != null && /[^0-9]/.test(value)) event.preventDefault();
        }
      });
      editor.addEventListener('input', event => {
        const field = event.target.dataset.subjectField;
        if (field?.startsWith('birth_') || field === 'identity_number') {
          event.target.value = event.target.value.replace(/[^0-9]/g, '');
        }
        for (const f of event.target.closest('[data-subject-card]')?.querySelectorAll('input,select,textarea') || []) {
          f.setCustomValidity('');
          f.removeAttribute('aria-invalid');
        }
        error.textContent = '';
      });
      function validate() {
        let first;
        for (const [index, card] of cards().entries()) {
          const issues = model.issues(collect(card));
          for (const field of card.querySelectorAll('[data-subject-field]')) {
            const message = issues[field.dataset.subjectField] || '';
            field.setCustomValidity(message);
            if (message) field.setAttribute('aria-invalid', 'true');
            else field.removeAttribute('aria-invalid');
            if (message && !first) first = { field, message: `Đối tượng ${index + 1}: ${message}` };
          }
        }
        error.textContent = first?.message || '';
        if (first) {
          first.field.focus();
          first.field.reportValidity();
        }
        return !first;
      }
      editor.addEventListener('submit', event => {
        event.preventDefault();
        if (readOnly || !validate()) return;
        records = cards().map(collect);
        quantity = records.length;
        renderSummary();
        dialog.close();
      });
      for (const button of dialog.querySelectorAll('[data-close], [data-cancel]')) {
        button.onclick = () => dialog.close();
      }
      dialog.addEventListener('close', () => {
        dialog.remove();
        opened = null;
        trigger.focus();
      }, { once: true });
      form.closest('#dailyReports').append(dialog);
      opened = dialog;

      getProvincesWards().then(rows => {
        if (!Array.isArray(rows) || !rows.length) return;
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const provinceNames = rows.map(p => p.name);

        function bindCustomSelects(rootEl) {
          rootEl.querySelectorAll('.bcn-custom-select').forEach(container => {
            if (container.dataset.bound) return;
            container.dataset.bound = 'true';
            const input = container.querySelector('input');
            const dropdown = container.querySelector('.bcn-select-dropdown');
            const type = container.dataset.type;

            function renderOptions(query = '') {
              const q = norm(query);
              let items = [];
              if (type === 'province') {
                items = q ? provinceNames.filter(name => norm(name).includes(q)) : provinceNames;
              } else {
                // ward: nếu đã chọn tỉnh thì lấy danh sách xã của tỉnh đó, không thì lấy toàn bộ
                const card = container.closest('[data-subject-card]');
                const provInput = card?.querySelector(
                  container.querySelector('[data-subject-field="permanent_ward"]')
                    ? '[data-subject-field="permanent_province"]'
                    : '[data-subject-field="current_province"]'
                );
                const selectedProvName = provInput?.value?.trim();
                const matchedProv = selectedProvName ? rows.find(p => norm(p.name) === norm(selectedProvName)) : null;

                if (matchedProv) {
                  items = (matchedProv.wards || []).map(w => w.name);
                } else {
                  const set = new Set();
                  for (const p of rows) {
                    for (const w of p.wards || []) set.add(w.name);
                  }
                  items = [...set];
                }
                if (q) items = items.filter(name => norm(name).includes(q));
              }

              const maxDisplay = 60;
              const displayItems = items.slice(0, maxDisplay);

              if (!displayItems.length) {
                dropdown.innerHTML = '<div class="bcn-select-empty">Không tìm thấy kết quả</div>';
              } else {
                dropdown.innerHTML = displayItems.map(item =>
                  `<div class="bcn-select-item" data-value="${escape(item)}">${escape(item)}</div>`
                ).join('');
              }
            }

            input.addEventListener('focus', () => {
              if (readOnly) return;
              renderOptions(input.value);
              dropdown.hidden = false;
            });

            input.addEventListener('input', () => {
              if (readOnly) return;
              renderOptions(input.value);
              dropdown.hidden = false;
            });

            dropdown.addEventListener('mousedown', e => {
              const item = e.target.closest('.bcn-select-item');
              if (item) {
                input.value = item.dataset.value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                dropdown.hidden = true;
              }
            });
          });
        }

        bindCustomSelects(dialog);
        // Bind for newly added cards
        const observer = new MutationObserver(() => bindCustomSelects(dialog));
        observer.observe(rows, { childList: true });
      }).catch(() => {});

      // Close custom dropdowns when clicking outside
      dialog.addEventListener('click', e => {
        if (!e.target.closest('.bcn-custom-select')) {
          dialog.querySelectorAll('.bcn-select-dropdown').forEach(d => { d.hidden = true; });
        }
      });

      dialog.showModal();
      if (validateImmediately) validate();
    }
    trigger.onclick = () => open();
    reset();
    return {
      reset,
      validate() {
        if (!count.reportValidity()) return false;
        if (!records.slice(0, quantity).some(person => Object.keys(model.issues(person)).length)) return true;
        open(true);
        return false;
      },
      read() {
        const details = records.slice(0, quantity).map(model.serialize);
        return { subjects: details.map(person => person.name), subject_details: details };
      }
    };
  }
  window.DailyReportReferenceLists = { mount };
})();
