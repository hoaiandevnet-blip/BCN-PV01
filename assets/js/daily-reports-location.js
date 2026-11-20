(() => {
  'use strict';
  let catalogPromise;
  const controllers = new WeakMap();
  function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('/assets/data/vietnam-provinces-wards.json').then(async response => {
        if (!response.ok) throw new Error('Không tải được danh mục địa điểm.');
        const rows = await response.json();
        if (!Array.isArray(rows) || !rows.length || rows.some(item => !Array.isArray(item.wards))) {
          throw new Error('Danh mục địa điểm không hợp lệ.');
        }
        return rows;
      }).catch(error => {
        catalogPromise = null;
        throw error;
      });
    }
    return catalogPromise;
  }

  function mount(container, { address = null, legacy = '', readOnly = false } = {}) {
    container.classList.add('bcn-location');
    container.dataset.bcnLocation = '';
    container.innerHTML = `<fieldset><legend>Địa điểm</legend><div class="bcn-location-fields">
      <label>Tỉnh / thành phố<select name="location_province_code" disabled>
        <option value="">Chọn tỉnh / thành phố</option></select></label>
      <label>Xã / phường<select name="location_ward_code" disabled>
        <option value="">Chọn tỉnh / thành phố trước</option></select></label>
      <label>Địa chỉ chi tiết<input name="location_detail" maxlength="500"
        placeholder="Số nhà, đường, thôn / ấp, khu phố…"></label>
      </div><p class="bcn-location-status" role="status">Đang tải danh mục địa điểm…</p>
      <button class="ghost" type="button" data-location-retry hidden>Tải lại danh mục</button></fieldset>`;
    const province = container.querySelector('[name="location_province_code"]');
    const ward = container.querySelector('[name="location_ward_code"]');
    const detail = container.querySelector('[name="location_detail"]');
    const status = container.querySelector('[role="status"]');
    const retry = container.querySelector('[data-location-retry]');
    const initial = address || { province_code: '', ward_code: '', detail: legacy };
    let rows = [];
    let ready = false;
    detail.readOnly = readOnly;

    function options(select, items, placeholder, value, storedName) {
      select.replaceChildren(new Option(placeholder, ''));
      for (const item of items) select.add(new Option(item.name, String(item.code)));
      if (value && !items.some(item => String(item.code) === String(value))) {
        select.add(new Option(storedName || 'Địa điểm đã lưu', String(value)));
      }
      select.value = String(value || '');
    }
    function selectedProvince() {
      return rows.find(item => String(item.code) === province.value);
    }
    function wards(value = '', storedName = '') {
      const selected = selectedProvince();
      options(ward, selected?.wards || [], selected ? 'Chọn xã / phường' : 'Chọn tỉnh / thành phố trước',
        value, storedName);
      ward.disabled = readOnly || !selected;
    }
    function validateLength() {
      const parts = [detail.value.trim(), ward.value && ward.selectedOptions[0]?.textContent,
        province.value && province.selectedOptions[0]?.textContent].filter(Boolean);
      detail.setCustomValidity(parts.join(', ').length > 500
        ? 'Địa điểm đầy đủ tối đa 500 ký tự. Vui lòng rút gọn địa chỉ chi tiết.' : '');
    }
    function restore() {
      options(province, rows, 'Chọn tỉnh / thành phố', initial.province_code, initial.province_name);
      province.disabled = readOnly || !ready;
      wards(initial.ward_code, initial.ward_name);
      detail.value = initial.detail || '';
      validateLength();
    }
    province.onchange = () => {
      wards();
      validateLength();
    };
    ward.onchange = validateLength;
    detail.oninput = validateLength;
    container.closest('form').addEventListener('reset', () => queueMicrotask(restore));
    restore();

    async function load() {
      retry.hidden = true;
      status.hidden = false;
      status.textContent = 'Đang tải danh mục địa điểm…';
      try {
        rows = await catalog();
        const provinceCode = province.value;
        const wardCode = ward.value;
        ready = true;
        options(province, rows, 'Chọn tỉnh / thành phố', provinceCode, initial.province_name);
        province.disabled = readOnly;
        wards(wardCode, initial.ward_name);
        validateLength();
        status.hidden = true;
        container.dataset.locationState = 'ready';
      } catch (error) {
        status.textContent = `${error.message} Bấm Tải lại danh mục để chọn tỉnh và xã.`;
        retry.hidden = false;
        container.dataset.locationState = 'error';
      }
    }
    retry.onclick = load;
    controllers.set(container, () => ({ province_code: province.value, ward_code: ward.value,
      detail: detail.value.trim() }));
    container.dataset.locationState = 'loading';
    load();
  }

  function apply(form, values) {
    const container = form.querySelector('[data-bcn-location]');
    const read = controllers.get(container);
    if (!read) return;
    values.location_address = read();
    delete values.location_general;
    for (const key of ['location_province_code', 'location_ward_code', 'location_detail']) delete values[key];
  }
  window.DailyReportsLocation = { mount, apply };
})();
