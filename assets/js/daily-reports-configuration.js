(() => {
  window.DailyReportConfiguration = {
    mount({ root, request, send, act, escape, admin }) {
      if (!admin()) return;
      const pane = root.querySelector('[data-bcn-pane="permissions"]');
      root.querySelector('#bcnConfiguration')?.remove();
      const section = document.createElement('details');
      section.id = 'bcnConfiguration';
      section.className = 'card';
      section.innerHTML = `<summary>Cấu hình nghiệp vụ</summary>
        <button class="ghost" id="bcnConfigurationLoad">Tải đơn vị và bộ chỉ tiêu</button>
        <form id="bcnUnitProfile" class="daily-report-form">
          <label>Đơn vị<select name="unit_id" id="bcnConfigUnit"></select></label>
          <label>Mã đơn vị<input name="unit_code" required></label>
          <label>Nhóm đơn vị<select name="unit_group"><option>XA_PHUONG</option><option>PHONG</option>
            <option>DON</option><option>CANG</option></select></label><button class="primary">Lưu nhóm đơn vị</button>
        </form><h4>Phiên bản chỉ tiêu</h4>
        <p>Khai báo theo bộ chỉ tiêu đã được phê duyệt. Mỗi trường gồm code và label;
          mỗi quy tắc tổng gồm total, parts và operator (EQ hoặc GTE).</p>
        <form id="bcnMetricDefinition" class="daily-report-form">
          <label>Mã nhóm chỉ tiêu<input name="code" required></label>
          <label>Tên nhóm<input name="label" required></label>
          <label>Nhóm đơn vị (phân cách dấu phẩy)<input name="owner_groups" required></label>
          <label>Hiệu lực từ<input name="effective_from" type="date" required></label>
          <label>Hiệu lực đến<input name="effective_to" type="date"></label>
          <label class="daily-report-wide">Định nghĩa trường (JSON)<textarea name="fields" required
            placeholder='[{"code":"received","label":"Tiếp nhận"}]'></textarea></label>
          <label class="daily-report-wide">Đối chiếu tổng (JSON)<textarea name="constraints">[]</textarea></label>
          <button class="primary">Lưu phiên bản dự thảo</button>
        </form><div id="bcnDefinitionRows"></div>`;
      pane.append(section);
      window.DailyReportsPermissionWorkspace.decorateSection(section, {
        icon: 'sliders-horizontal', title: 'Cấu hình nghiệp vụ',
        description: 'Quản lý nhóm đơn vị và các phiên bản chỉ tiêu đã được phê duyệt.'
      });
      const $ = selector => section.querySelector(selector);
      async function load() {
        const data = await request('/configuration');
        $('#bcnConfigUnit').innerHTML = data.units.map(unit => `<option value="${unit.id}">
          ${escape(unit.name)} · ${escape(unit.unit_group || 'Chưa cấu hình')}</option>`).join('');
        $('#bcnDefinitionRows').innerHTML = data.definitions.map(item => `<article class="bcn-item">
          <strong>${escape(item.code)} · v${item.version} · ${escape(item.label)}</strong>
          <p>${escape(item.status)} · ${escape(item.owner_groups.join(', '))} · ${escape(item.effective_from)}</p>
          <p>${escape(item.fields.map(field => field.label).join('; '))}</p>
          ${item.status === 'DRAFT' ? `<button class="ghost" data-publish-metric="${item.id}">Công bố</button>` : ''}
        </article>`).join('') || '<p>Chưa có bộ chỉ tiêu. Dữ liệu cấu hình không tự được công bố.</p>';
        section.querySelectorAll('[data-publish-metric]').forEach(button => {
          button.onclick = act(async () => {
            await send(`/configuration/metrics/${button.dataset.publishMetric}/publish`);
            await load();
          });
        });
      }
      $('#bcnConfigurationLoad').onclick = act(load);
      $('#bcnUnitProfile').onsubmit = act(async event => {
        const values = Object.fromEntries(new FormData(event.target));
        await send(`/configuration/units/${values.unit_id}`, values, 'PUT');
        await load();
      });
      $('#bcnMetricDefinition').onsubmit = act(async event => {
        const values = Object.fromEntries(new FormData(event.target));
        values.owner_groups = values.owner_groups.split(',').map(value => value.trim());
        values.fields = JSON.parse(values.fields);
        values.constraints = JSON.parse(values.constraints || '[]');
        await send('/configuration/metrics', values);
        await load();
      });
    }
  };
})();
