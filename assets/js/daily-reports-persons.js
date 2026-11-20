(() => {
  'use strict';
  const instances = new WeakMap();
  const genders = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
  const fields = [
    ['name', 'Họ và tên', 'text', 180], ['gender', 'Giới tính', 'select'],
    ['date_of_birth', 'Ngày tháng năm sinh', 'date'], ['identity_number', 'Số CCCD', 'text', 12],
    ['permanent_address', 'Thường trú', 'text', 500], ['current_address', 'Nơi ở hiện tại', 'text', 500]
  ];
  const escape = value => window.DailyReportsUI.escape(value);
  const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const display = (person, key) => {
    const value = person[key];
    if (!value) return 'Chưa có thông tin';
    if (key === 'gender') return genders[value] || value;
    if (key === 'date_of_birth' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
    return value;
  };

  function summary(persons = []) {
    if (!persons.length) return '<p class="bcn-persons-empty">Hồ sơ cũ chưa có thông tin đối tượng.</p>';
    return `<div class="bcn-persons-readonly">${persons.map((person, index) =>
      `<article class="bcn-person-summary"><h4>Đối tượng ${index + 1} · ${escape(person.name)}</h4>
        <dl>${fields.slice(1).map(([key, label]) => `<div><dt>${label}</dt>
          <dd>${escape(display(person, key))}</dd></div>`).join('')}
          ${person.reference ? `<div><dt>Mã tham chiếu cũ</dt><dd>${escape(person.reference)}</dd></div>` : ''}
        </dl></article>`).join('')}</div>`;
  }

  function mount(container, { persons = [], readOnly = false } = {}) {
    container.classList.add('bcn-persons', 'daily-report-wide');
    if (readOnly) {
      container.innerHTML = `<header><h4>Đối tượng liên quan</h4><span>${persons.length} đối tượng</span></header>`
        + summary(persons);
      return;
    }
    const form = container.closest('form');
    let records = persons.map(person => ({ ...person }));
    const hintId = `${form.id}-persons-hint`;
    container.innerHTML = `<header><div><h4>Đối tượng liên quan</h4>
      <p id="${hintId}">Chọn số lượng, sau đó nhập đầy đủ thông tin của từng đối tượng.</p></div>
      <label class="bcn-person-count">${window.DailyReportsUI.fieldLabel('Số đối tượng *')}
        <select name="person_count" required aria-describedby="${hintId}">
          <option value="">Chọn số đối tượng</option>${Array.from({ length: 100 }, (_, index) =>
            `<option value="${index + 1}">${index + 1} đối tượng</option>`).join('')}</select></label></header>
      <div class="bcn-person-fields"></div><p class="bcn-persons-help" hidden>
        Chỉ lưu số đối tượng đang chọn. Nếu tăng lại số lượng trước khi lưu, thông tin đã nhập sẽ được giữ.</p>`;
    const count = container.querySelector('[name="person_count"]');
    const list = container.querySelector('.bcn-person-fields');
    function collect() {
      for (const card of list.querySelectorAll('[data-person-index]')) {
        const index = Number(card.dataset.personIndex);
        const person = { ...records[index] };
        for (const field of card.querySelectorAll('[data-person-field]')) {
          person[field.dataset.personField] = field.value.trim();
        }
        records[index] = person;
      }
    }
    function render() {
      const quantity = Number(count.value);
      list.innerHTML = Array.from({ length: quantity }, (_, index) => {
        const person = records[index] || {};
        return `<fieldset class="bcn-person-card" data-person-index="${index}">
          <legend><span>${String(index + 1).padStart(2, '0')}</span>Đối tượng ${index + 1}</legend>
          <div class="bcn-person-grid">${fields.map(([key, label, type, length]) => {
            const name = `person_${index}_${key}`;
            const control = type === 'select'
              ? `<select name="${name}" data-person-field="${key}" required>
                  <option value="">Chọn giới tính</option>${Object.entries(genders).map(([value, title]) =>
                    `<option value="${value}" ${person[key] === value ? 'selected' : ''}>${title}</option>`).join('')}
                </select>`
              : `<input name="${name}" data-person-field="${key}" type="${type}" required
                  value="${escape(person[key] || '')}" ${length ? `maxlength="${length}"` : ''}
                  ${key === 'date_of_birth' ? `max="${today()}"` : ''}
                  ${key === 'identity_number' ? 'inputmode="numeric" pattern="[0-9]{12}" minlength="12"'
                    + ' title="Nhập đúng 12 chữ số CCCD"' : ''} autocomplete="off">`;
            return `<label>${window.DailyReportsUI.fieldLabel(label + ' *')}${control}</label>`;
          }).join('')}</div></fieldset>`;
      }).join('');
      list.hidden = !quantity;
    }
    count.value = persons.length ? String(persons.length) : '';
    count.addEventListener('change', () => {
      collect();
      container.querySelector('.bcn-persons-help').hidden = records.length <= Number(count.value);
      render();
    });
    list.addEventListener('input', event => {
      if (event.target.matches('input[type="text"]')) {
        event.target.setCustomValidity(event.target.value.trim() ? '' : 'Vui lòng nhập thông tin này.');
      }
    });
    form.addEventListener('reset', () => {
      queueMicrotask(() => {
        records = [];
        count.value = '';
        container.querySelector('.bcn-persons-help').hidden = true;
        render();
      });
    });
    instances.set(form, { read() {
      collect();
      return { person_count: Number(count.value), persons: records.slice(0, Number(count.value)) };
    } });
    render();
  }

  function apply(form, values) {
    const instance = instances.get(form);
    if (!instance) throw new Error('Chưa tải được phần thông tin đối tượng. Vui lòng mở lại biểu mẫu.');
    for (const key of Object.keys(values)) {
      if (key.startsWith('person_')) delete values[key];
    }
    Object.assign(values, instance.read());
  }
  window.DailyReportsPersons = { mount, apply, summary };
})();
