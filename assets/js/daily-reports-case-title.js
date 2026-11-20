(() => {
  'use strict';

  function mount(form, { businessCode, readOnly = false } = {}) {
    const input = form.elements.title;
    const label = input.closest('label');
    label.classList.add('bcn-case-title');
    const caption = document.createElement('span');
    const hint = document.createElement('small');
    hint.id = `${form.id}-title-hint`;
    input.setAttribute('aria-describedby', hint.id);
    label.replaceChildren(caption, input, hint);
    function validate() {
      input.setCustomValidity(input.required && !input.value.trim() ? 'Vui lòng nhập tên vụ việc.' : '');
    }
    function update() {
      const codes = window.DailyReportsClassifications?.codes(form)
        || [businessCode ?? form.elements.business_code?.value];
      const other = codes.includes('TINH_HINH_KHAC');
      input.disabled = !other;
      input.readOnly = readOnly;
      input.required = other && !readOnly;
      validate();
      caption.innerHTML = window.DailyReportsUI.fieldLabel(input.required ? 'Tên vụ việc *' : 'Tên vụ việc');
      input.placeholder = other ? 'Nhập tên vụ việc' : 'Chỉ nhập khi chọn hệ “Tình hình khác”';
      hint.textContent = other ? 'Nhập tên ngắn gọn để nhận biết vụ việc.'
        : 'Trường này chỉ được nhập với hệ vụ việc “Tình hình khác”.';
    }
    input.addEventListener('input', validate);
    form.elements.business_code?.addEventListener('change', update);
    form.addEventListener('bcn:classifications', update);
    form.addEventListener('reset', () => queueMicrotask(update));
    update();
  }

  window.DailyReportsCaseTitle = { mount };
})();
