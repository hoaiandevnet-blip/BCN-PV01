(() => {
  'use strict';
  const normalize = value => String(value ?? '').toLocaleLowerCase('vi').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
  const icons = root => window.lucide?.createIcons({ root, attrs: { 'stroke-width': 1.8, focusable: 'false' } });

  function decorateSection(section, { icon, title, description }) {
    section.classList.add('bcn-permission-section');
    const summary = section.querySelector(':scope > summary');
    summary.innerHTML = `<span class="bcn-permission-symbol" aria-hidden="true"><i data-lucide="${icon}"></i></span>
      <span class="bcn-permission-summary"><strong>${title}</strong><small>${description}</small></span>
      <i class="bcn-permission-chevron" data-lucide="chevron-down" aria-hidden="true"></i>`;
    icons(summary);
  }

  function mount(root) {
    const $ = selector => root.querySelector(selector);
    const management = $('#bcnRoleManagement');
    management.open = true;
    decorateSection(management, { icon: 'user-round-cog', title: 'Phân công tài khoản',
      description: 'Chọn tài khoản, giao vai trò và quản lý phạm vi sử dụng.' });
    decorateSection($('#bcnPermissionReference'), { icon: 'book-open-check', title: 'Quyền theo đơn vị & hướng dẫn',
      description: 'Tra cứu bảng quyền, chỉ tiêu cấp phòng và quy trình mở khóa.' });
    decorateSection($('#bcnLeaderManagement'), { icon: 'contact-round', title: 'Lãnh đạo & người ký',
      description: 'Quản lý danh sách, chức vụ và thời gian áp dụng khi xuất báo cáo.' });
    const card = management.querySelector(':scope > .card');
    card.classList.add('bcn-assignment-workspace');
    const form = $('#bcnRoleForm');
    const identity = document.createElement('fieldset');
    identity.className = 'bcn-assignment-fields';
    identity.innerHTML = '<legend><span>1</span>Tài khoản & vai trò</legend>';
    identity.append($('.bcn-account-field'), form.elements.role_code.closest('label'), $('#bcnRoleEligibility'));
    const scope = document.createElement('fieldset');
    scope.className = 'bcn-assignment-fields';
    scope.innerHTML = '<legend><span>2</span>Phạm vi & thời hạn</legend>';
    for (const key of ['unit_id', 'metric_code']) {
      scope.append(form.elements[key].closest('label'));
    }
    const dates = document.createElement('div');
    dates.className = 'bcn-assignment-date-fields';
    dates.append(form.elements.effective_from.closest('label'), form.elements.effective_to.closest('label'));
    scope.append(dates);
    const submit = form.querySelector('button.primary');
    const modules = document.createElement('fieldset');
    modules.id = 'bcnCompilerModules';
    modules.className = 'bcn-assignment-fields';
    modules.hidden = true;
    form.replaceChildren(identity, scope, modules, submit);
    const syncModules = () => { modules.hidden = form.elements.role_code.value !== 'PV01_COMPILER'; };
    form.elements.role_code.addEventListener('change', syncModules);
    root.querySelector('#bcnRoleUser').addEventListener('change', syncModules);
    const editor = document.createElement('section');
    editor.className = 'bcn-assignment-editor';
    editor.innerHTML = '<h3>Giao quyền nghiệp vụ</h3><p class="bcn-assignment-note">'
      + 'Admin có toàn quyền hệ thống. Chỉ tài khoản PV01 được chọn mới được giao tổng hợp.</p>';
    editor.append(form);
    const list = document.createElement('section');
    list.className = 'bcn-assignment-list';
    const refresh = $('#bcnRolesLoad');
    refresh.type = 'button';
    refresh.innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i>Cập nhật';
    refresh.setAttribute('aria-label', 'Cập nhật danh sách phân công');
    list.innerHTML = `<header class="bcn-assignment-list-heading"><div><h3>Danh sách phân công</h3>
      <p id="bcnRoleListCount" role="status">Đang tải danh sách…</p></div></header>
      <label class="bcn-assignment-search" for="bcnRoleListSearch">Tìm phân công
        <input id="bcnRoleListSearch" type="search" placeholder="Tài khoản, đơn vị hoặc vai trò…"
          autocomplete="off"></label>`;
    list.querySelector('header').append(refresh);
    list.append($('#bcnRoleRows'));
    const empty = document.createElement('p');
    empty.id = 'bcnRoleListEmpty';
    empty.className = 'bcn-assignment-empty';
    empty.hidden = true;
    list.append(empty);
    card.replaceChildren(editor, list);
    icons(management);

    function filter() {
      const search = normalize($('#bcnRoleListSearch').value.trim());
      const rows = [...$('#bcnRoleRows').querySelectorAll('[data-role-row]')];
      let visible = 0;
      for (const row of rows) {
        row.hidden = !normalize(row.textContent).includes(search);
        if (!row.hidden) visible += 1;
      }
      $('#bcnRoleListCount').textContent = search
        ? `${visible} / ${rows.length} phân công phù hợp` : `${rows.length} phân công đã lưu`;
      empty.hidden = visible > 0;
      empty.textContent = rows.length ? 'Không có phân công phù hợp với từ khóa.'
        : 'Chưa có phân công. Chọn tài khoản và vai trò để bắt đầu.';
    }
    $('#bcnRoleListSearch').oninput = filter;

    function renderRoles({ roles, accounts, compilerModules = {}, roleModules = {} }, unitName) {
      if (!modules.children.length) {
        modules.innerHTML = '<legend><span>3</span>Mục con được phép sử dụng</legend>'
          + '<p>Chỉ áp dụng cho Cán bộ tổng hợp PV01.</p>'
          + Object.entries(compilerModules).map(([key, label]) =>
            `<label class="bcn-submodule-choice"><input type="checkbox" name="compiler_module" value="${key}" checked>${label}</label>`).join('');
      }
      syncModules();
      const ui = window.DailyReportsUI;
      const escape = ui.escape;
      const accountMap = new Map(accounts.map(account => [String(account.id), account]));
      const metricNames = { GENERAL: 'Kết quả công tác chung', DETENTION: 'Quản lý giam giữ',
        TIP_INTAKE_AND_RESOLUTION: 'Tiếp nhận, giải quyết tin báo', INVESTIGATION: 'Kết quả điều tra án' };
      const roleIcons = { UNIT_REPORTER: 'file-pen-line', PV01_COMPILER: 'layers',
        LEGAL_REVIEWER: 'scale', AUDITOR: 'scan-eye' };
      $('#bcnRoleRows').innerHTML = roles.map((item, index) => {
        const account = accountMap.get(String(item.user_id));
        const name = account?.full_name || account?.username || `Tài khoản ${item.user_id}`;
        const scopeName = item.unit_id ? unitName(item.unit_id) : 'Toàn phạm vi được giao';
        const dates = item.effective_from || item.effective_to
          ? `${item.effective_from ? 'Từ ' + ui.date(item.effective_from) : 'Không giới hạn ngày bắt đầu'}`
            + `${item.effective_to ? ' → ' + ui.date(item.effective_to) : ' · Chưa đặt ngày kết thúc'}`
          : 'Không giới hạn thời gian';
        return `<article class="bcn-assignment-row" data-role-row="${index}">
          <div class="bcn-assignment-account"><strong>${escape(name)}</strong>
            <small>${escape([account?.username, account?.unit_name].filter(Boolean).join(' · '))}</small></div>
          <button class="ghost bcn-assignment-revoke" type="button" data-role-delete="${index}"
            aria-label="Thu hồi vai trò ${escape(ui.roles[item.role_code])} của ${escape(name)}">Thu hồi</button>
          <span class="bcn-assignment-role" data-role="${escape(item.role_code)}">
            <i data-lucide="${roleIcons[item.role_code] || 'user-round'}" aria-hidden="true"></i>
            ${escape(ui.roles[item.role_code] || item.role_code)}</span>
          <div class="bcn-assignment-scope"><i data-lucide="building-2" aria-hidden="true"></i>
            <span>${escape(scopeName)}${item.metric_code
              ? ' · ' + escape(metricNames[item.metric_code] || item.metric_code) : ''}</span></div>
          ${item.role_code === 'PV01_COMPILER' ? `<div class="bcn-assignment-scope">
            <span>Mục con: ${escape((item.submodules ?? roleModules[item.role_code])
              .map(key => compilerModules[key]).join(', ') || 'Chưa được cấp module')}</span>
            <button type="button" class="ghost" data-role-modules="${index}">Sửa mục con</button>
          </div>` : ''}
          <div class="bcn-assignment-dates"><i data-lucide="calendar-days" aria-hidden="true"></i>
            <span>${escape(dates)}</span></div>
        </article>`;
      }).join('');
      icons($('#bcnRoleRows'));
      filter();
    }
    return { renderRoles, reset() {
      $('#bcnRoleListSearch').value = '';
      $('#bcnRoleRows').replaceChildren();
      $('#bcnRoleListCount').textContent = 'Đang tải danh sách…';
      empty.hidden = true;
      management.open = true;
      $('#bcnPermissionReference').open = false;
    } };
  }
  window.DailyReportsPermissionWorkspace = { mount, decorateSection };
})();
