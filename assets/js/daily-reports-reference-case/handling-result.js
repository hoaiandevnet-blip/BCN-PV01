(() => {
  'use strict';
  const emptyDetails = () => ({
    form: '',
    prosecution_decision_number: '',
    prosecution_date: '',
    prosecution_authority: '',
    resolution: '',
    reason: '',
    detail: '',
    fine_million: ''
  });
  const keys = ['form', 'prosecution_decision_number', 'prosecution_date', 'prosecution_authority',
    'resolution', 'reason', 'detail', 'fine_million'];
  const requiredForms = new Set();
  const decisionConfigs = {
    'Khởi tố': {
      label: 'Số Quyết định khởi tố vụ án',
      placeholder: 'Nhập số quyết định khởi tố',
      prefix: 'Số QĐ khởi tố vụ án'
    },
    'Không khởi tố': {
      label: 'Số Quyết định không khởi tố vụ án',
      placeholder: 'Nhập số quyết định không khởi tố',
      prefix: 'Số QĐ không khởi tố vụ án'
    },
    'Tạm đình chỉ': {
      label: 'Số Quyết định tạm đình chỉ vụ án',
      placeholder: 'Nhập số quyết định tạm đình chỉ',
      prefix: 'Số QĐ tạm đình chỉ vụ án'
    },
    'Đình chỉ': {
      label: 'Số Quyết định đình chỉ vụ án',
      placeholder: 'Nhập số quyết định đình chỉ',
      prefix: 'Số QĐ đình chỉ vụ án'
    }
  };
  const normalizeResult = value => ({ 'Chưa khám phá': 'Đang giải quyết', 'Khám phá': 'Đã giải quyết' }
    [value] || value || 'Đang giải quyết');

  function mount(form, initial = {}, { readOnly = false } = {}) {
    const input = form.elements.handling_result;
    const summary = form.querySelector('[data-handling-summary]');
    const status = form.querySelector('[data-handling-status]');
    const facts = form.querySelector('[data-handling-facts]');
    const trigger = form.querySelector('[data-handling-open]');
    let details = emptyDetails();
    let locked = false;
    let previousResult = input.value || 'Đang giải quyết';

    function render() {
      if (locked) {
        status.textContent = 'Không áp dụng';
        status.dataset.locked = 'true';
        summary.dataset.handlingState = 'locked';
        summary.dataset.handlingLocked = 'true';
        facts.hidden = true;
        facts.replaceChildren();
        return;
      }
      delete status.dataset.locked;
      delete summary.dataset.handlingLocked;
      const resolved = input.value === 'Đã giải quyết';
      const entries = [];
      status.textContent = input.value || 'Đang giải quyết';
      summary.dataset.handlingState = resolved ? 'resolved' : 'pending';
      const add = (label, value) => {
        if (value) entries.push([label, value]);
      };
      if (resolved) {
        add('Hình thức xử lý', details.form);
        const config = decisionConfigs[details.form];
        if (config) {
          add(config.prefix, details.prosecution_decision_number);
          const date = details.prosecution_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
          add('Ngày quyết định', date);
        } else if (details.form === 'Xử lý hành chính') {
          add('Kết quả giải quyết', details.resolution);
          add('Hình thức chi tiết', details.detail);
          if (details.fine_million !== '') add('Tổng tiền phạt', `${details.fine_million} triệu đồng`);
        } else {
          add('Kết quả giải quyết', details.resolution);
        }
      }
      facts.replaceChildren(...entries.map(([label, value]) => {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = value;
        row.append(term, description);
        return row;
      }));
      facts.hidden = entries.length === 0;
    }

    function setLocked(isLocked) {
      const next = Boolean(isLocked);
      if (locked === next) return;
      locked = next;
      trigger.disabled = locked;
      if (locked) {
        if (input.value && input.value !== 'Không áp dụng') {
          previousResult = input.value;
        }
        input.value = 'Không áp dụng';
        trigger.setAttribute('aria-disabled', 'true');
        trigger.title = 'Không áp dụng cho lĩnh vực Tình hình khác';
        summary.title = 'Không áp dụng cho lĩnh vực Tình hình khác';
      } else {
        input.value = previousResult || 'Đang giải quyết';
        trigger.removeAttribute('aria-disabled');
        trigger.removeAttribute('title');
        summary.removeAttribute('title');
      }
      render();
    }

    function reset(value = initial) {
      input.value = normalizeResult(value.handling_result);
      if (input.value !== 'Không áp dụng') previousResult = input.value;
      const saved = value.handling_details && typeof value.handling_details === 'object'
        ? value.handling_details : {};
      details = Object.fromEntries(keys.map(key => [key, String(saved[key] ?? '')]));
      render();
    }

    trigger.addEventListener('click', () => {
      if (readOnly || locked) return;
      const dialog = document.createElement('dialog');
      dialog.className = 'bcn-dialog card bcn-handling-dialog';
      dialog.setAttribute('aria-label', 'Chỉnh sửa thông tin kết quả xử lý');
      dialog.innerHTML = `<div class="bcn-handling-header">
        <h3>Thông tin kết quả xử lý</h3>
        <button type="button" class="ghost" data-close aria-label="Đóng">×</button>
      </div><div class="bcn-handling-body">
        <label><span>Kết quả xử lý</span><select data-result>
          <option value="Đang giải quyết">Đang giải quyết</option><option value="Đã giải quyết">Đã giải quyết</option>
        </select></label>
        <div class="bcn-handling-details" data-details hidden>
          <label><span>Hình thức xử lý</span><select data-form>
            <option value="">Chọn hình thức xử lý</option>
            <option value="Khởi tố">Khởi tố</option>
            <option value="Xử lý hành chính">Xử lý hành chính</option>
            <option value="Không khởi tố">Không khởi tố</option>
            <option value="Tạm đình chỉ">Tạm đình chỉ</option>
            <option value="Đình chỉ">Đình chỉ</option></select></label>
          
          <!-- Nhóm khởi tố vụ án / Không khởi tố: Số QĐ, Ngày tháng năm -->
          <div class="bcn-prosecution-fields" data-prosecution hidden>
            <label><span data-prosecution-number-label>Số Quyết định khởi tố vụ án</span>
              <input data-prosecution-number type="text" maxlength="150" placeholder="Nhập số quyết định khởi tố"></label>
            <label><span>Ngày tháng năm</span>
              <input data-prosecution-date type="date"></label>
          </div>

          <!-- Các hình thức khác (Không khởi tố, Tạm đình chỉ, Đình chỉ...) -->
          <div class="bcn-non-prosecution-fields" data-non-prosecution>
            <label><span data-resolution-label>Kết quả giải quyết</span><textarea data-resolution rows="3" maxlength="4000"
              placeholder="Nhập kết quả giải quyết"></textarea></label>
            <label data-reason-group><span data-reason-label>Lý do</span><textarea data-reason rows="3" maxlength="4000"
              placeholder="Nhập lý do"></textarea></label>
          </div>

          <label data-administrative><span>Hình thức chi tiết</span><textarea data-detail rows="3" maxlength="4000"
            placeholder="Nhập hình thức chi tiết"></textarea></label>
          <label data-administrative><span>Tổng tiền phạt (triệu đồng)</span><input data-fine-million type="text"
            inputmode="decimal" maxlength="32" placeholder="Nhập số tiền phạt"></label>
        </div><p data-error role="alert"></p></div>
        <div class="bcn-handling-footer"><button type="button" class="ghost" data-cancel>Hủy</button>
          ${readOnly ? '' : '<button type="button" class="primary" data-save>Lưu</button>'}</div>`;
      const result = dialog.querySelector('[data-result]');
      if (!['Đang giải quyết', 'Đã giải quyết'].includes(input.value)) {
        result.add(new Option(`${input.value} (đã lưu)`, input.value));
      }
      result.value = input.value || 'Đang giải quyết';
      const fields = {
        form: dialog.querySelector('[data-form]'),
        prosecution_decision_number: dialog.querySelector('[data-prosecution-number]'),
        prosecution_date: dialog.querySelector('[data-prosecution-date]'),
        resolution: dialog.querySelector('[data-resolution]'),
        reason: dialog.querySelector('[data-reason]'),
        detail: dialog.querySelector('[data-detail]'),
        fine_million: dialog.querySelector('[data-fine-million]')
      };
      for (const key of keys) {
        if (fields[key]) fields[key].value = details[key];
      }
      const update = () => {
        const isResolved = result.value === 'Đã giải quyết';
        const config = decisionConfigs[fields.form.value];
        const isDecisionForm = Boolean(config);
        const isAdministrative = fields.form.value === 'Xử lý hành chính';

        dialog.querySelector('[data-details]').hidden = !isResolved;
        dialog.querySelector('[data-prosecution]').hidden = !isDecisionForm;
        if (isDecisionForm) {
          const numberLabel = dialog.querySelector('[data-prosecution-number-label]');
          if (numberLabel) numberLabel.textContent = config.label;
          if (fields.prosecution_decision_number) {
            fields.prosecution_decision_number.placeholder = config.placeholder;
          }
        }

        dialog.querySelector('[data-non-prosecution]').hidden = isDecisionForm || !isAdministrative;
        const reasonGroup = dialog.querySelector('[data-reason-group]');
        if (reasonGroup) {
          reasonGroup.hidden = true;
        }
        dialog.querySelectorAll('[data-administrative]').forEach(label => {
          label.hidden = !isAdministrative;
        });

        const required = isResolved && requiredForms.has(fields.form.value);
        fields.resolution.required = required;
        fields.reason.required = required;
        dialog.querySelector('[data-resolution-label]').innerHTML = `Kết quả giải quyết${required
          ? ' <span class="required-marker" aria-label="bắt buộc">*</span>' : ''}`;
        dialog.querySelector('[data-error]').textContent = '';
      };
      result.addEventListener('change', update);
      fields.form.addEventListener('change', update);
      dialog.querySelector('[data-close]').onclick = () => dialog.close();
      dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
      const save = dialog.querySelector('[data-save]');
      if (save) save.onclick = () => {
        if (result.value === 'Đã giải quyết' && requiredForms.has(fields.form.value)) {
          const missing = [fields.resolution, fields.reason].find(field => !field.value.trim());
          if (missing) {
            dialog.querySelector('[data-error]').textContent = 'Vui lòng nhập kết quả giải quyết.';
            window.NotificationPopup?.getShared().notify('Vui lòng nhập kết quả giải quyết.');
            missing.focus();
            return;
          }
        }
        const fine = fields.fine_million.value.trim();
        if (fields.form.value === 'Xử lý hành chính' && fine && !/^\d+(?:[.,]\d{1,6})?$/.test(fine)) {
          dialog.querySelector('[data-error]').textContent = 'Tiền phạt phải là số không âm (triệu đồng).';
          fields.fine_million.focus();
          return;
        }
        if (decisionConfigs[fields.form.value]) {
          fields.resolution.value = '';
          fields.reason.value = '';
        } else if (fields.form.value === 'Xử lý hành chính') {
          fields.reason.value = '';
        }
        input.value = result.value;
        details = Object.fromEntries(keys.map(key => [key, fields[key] ? fields[key].value.trim() : '']));
        details.fine_million = fine.replace(',', '.');
        render();
        dialog.close();
      };
      if (readOnly) dialog.querySelectorAll('input,select,textarea').forEach(element => { element.disabled = true; });
      dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); }, { once: true });
      form.closest('#dailyReports').append(dialog);
      update();
      dialog.showModal();
    });

    reset(initial);
    return {
      reset,
      read: () => (locked
        ? { handling_result: 'Không áp dụng', handling_details: {} }
        : { handling_result: input.value, handling_details: { ...details } }),
      requiresSupport: () => !locked && (['Đang giải quyết', 'Đã giải quyết'].includes(input.value)
        || keys.some(key => details[key] !== '')),
      setLocked,
      isLocked: () => locked
    };
  }

  window.DailyReportHandlingResult = { mount };
})();
