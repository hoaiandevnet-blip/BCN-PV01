export async function renderDirectory({ api, escapeHtml: escape, notify, icons, refresh }) {
  const host = document.getElementById('directory');
  let directory = await refresh();
  const titles = {
    teams: 'Đơn vị / đội công tác',
    departments: 'Cấp phòng / cấp xã',
    ranks: 'Cấp bậc',
    positions: 'Chức vụ'
  };
  const iconsMap = {
    teams: 'users',
    departments: 'landmark',
    ranks: 'award',
    positions: 'briefcase'
  };
  let kind = host.querySelector('#directoryKind')?.value || 'teams';

  function renderHeader() {
    const counts = {
      teams: (directory.teams || []).length,
      departments: (directory.departments || []).length,
      ranks: (directory.ranks || []).length,
      positions: (directory.positions || []).length
    };
    const tabsHtml = Object.entries(titles).map(([key, name]) => {
      const active = key === kind ? 'active' : '';
      const icon = iconsMap[key] || 'folder';
      return `<button type="button" class="bcn-dir-tab ${active}" data-dir-kind="${key}">
        <i data-lucide="${icon}"></i>
        <span>${name}</span>
        <span class="bcn-tab-count">${counts[key]}</span>
      </button>`;
    }).join('');

    host.innerHTML = `<div class="bcn-dir-tabs" role="tablist" aria-label="Phân loại danh mục">
        ${tabsHtml}
      </div>
      <header class="bcn-toolbar">
        <select id="directoryKind" class="bcn-dir-kind-select" aria-label="Chọn loại danh mục">
          ${Object.entries(titles).map(([key, name]) =>
            `<option value="${key}" ${key === kind ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <input id="directorySearch" type="search" placeholder="Tìm ${titles[kind].toLowerCase()}…" `
          + `aria-label="Tìm danh mục"/>
        <button class="primary" id="addDirectory">
          <i data-lucide="plus"></i><span>Thêm mới</span>
        </button>
      </header>
      <div class="bcn-table-card">
        <table>
          <thead>
            <tr>
              <th>TÊN DANH MỤC</th>
              <th>ĐƠN VỊ CẤP TRÊN</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="directoryRows"></tbody>
        </table>
      </div>`;

    host.querySelectorAll('[data-dir-kind]').forEach(tab => {
      tab.onclick = () => {
        kind = tab.dataset.dirKind;
        const select = host.querySelector('#directoryKind');
        if (select) select.value = kind;
        host.querySelectorAll('[data-dir-kind]').forEach(t =>
          t.classList.toggle('active', t.dataset.dirKind === kind));
        host.querySelector('#directorySearch').placeholder = `Tìm ${titles[kind].toLowerCase()}…`;
        paint();
      };
    });

    host.querySelector('#directoryKind').onchange = event => {
      kind = event.target.value;
      host.querySelectorAll('[data-dir-kind]').forEach(t =>
        t.classList.toggle('active', t.dataset.dirKind === kind));
      paint();
    };
    host.querySelector('#directorySearch').oninput = paint;
    host.querySelector('#addDirectory').onclick = () => editor();
  }

  const parentName = row => row.parent_team_id
    ? directory.teams.find(team => team.id === row.parent_team_id)?.name
    : directory.departments.find(dept => dept.id === (row.department_id || row.parent_id))?.name;

  function paint() {
    const query = host.querySelector('#directorySearch').value.toLocaleLowerCase('vi');
    const filtered = (directory[kind] || []).filter(row =>
      row.name.toLocaleLowerCase('vi').includes(query));

    host.querySelector('#directoryRows').innerHTML = filtered.map(row => {
      const parent = parentName(row);
      const parentDisplay = parent
        ? `<span class="bcn-parent-badge"><i data-lucide="corner-down-right"></i><span>${escape(parent)}</span></span>`
        : (row.unit_type
            ? `<span class="bcn-unit-type-pill ${row.unit_type === 'Cấp phòng' ? 'dept' : 'ward'}">`
              + `${escape(row.unit_type)}</span>`
            : '<span class="bcn-empty-dash">—</span>');

      return `<tr>
        <td>
          <div class="bcn-dir-name-cell">
            <span class="bcn-dir-icon"><i data-lucide="${iconsMap[kind] || 'folder'}"></i></span>
            <strong>${escape(row.name)}</strong>
          </div>
        </td>
        <td>${parentDisplay}</td>
        <td>
          <div class="bcn-account-actions">
            <button class="ghost" data-edit="${row.id}">Sửa</button>
            <button class="ghost bcn-account-danger" data-delete="${row.id}">Xóa</button>
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="3">Không có danh mục phù hợp.</td></tr>';

    host.querySelectorAll('[data-edit]').forEach(button => {
      button.onclick = () => editor(directory[kind].find(row => row.id === button.dataset.edit));
    });
    host.querySelectorAll('[data-delete]').forEach(button => {
      button.onclick = async () => {
        if (!window.confirm('Xóa danh mục này? Danh mục đang được sử dụng sẽ không thể xóa.')) return;
        try {
          await api(`/api/manage-directory/${kind}/${button.dataset.delete}`, { method: 'DELETE' });
          directory = await refresh();
          renderHeader();
          paint();
        } catch (error) { notify(error.message); }
      };
    });
    icons();
  }

  function options(rows, value, excluded) {
    return '<option value="">Không có</option>' + rows.filter(row => row.id !== excluded).map(row =>
      `<option value="${row.id}" ${String(row.id) === String(value) ? 'selected' : ''}>`
      + `${escape(row.name)}</option>`).join('');
  }

  function editor(row = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'bcn-dialog bcn-dir-dialog';
    dialog.innerHTML = `<form>
      <h2>${row.id ? 'Sửa' : 'Thêm'} ${titles[kind].toLocaleLowerCase('vi')}</h2>
      <label>Tên
        <input name="name" value="${escape(row.name)}" maxlength="200" required/>
      </label>
      ${kind === 'teams' ? `<label>Cấp phòng / cấp xã
          <select name="department_id">${options(directory.departments, row.department_id)}</select>
        </label>
        <label>Đơn vị cha
          <select name="parent_team_id">${options(directory.teams, row.parent_team_id, row.id)}</select>
        </label>` : ''}
      ${kind === 'departments' ? `<label>Loại cấp
          <select name="unit_type">
            <option>Cấp phòng</option>
            <option ${row.unit_type === 'Cấp xã' ? 'selected' : ''}>Cấp xã</option>
          </select>
        </label>
        <label>Đơn vị cha
          <select name="parent_id">${options(directory.departments, row.parent_id, row.id)}</select>
        </label>` : ''}
      <p class="bcn-error" role="alert"></p>
      <footer>
        <button type="button" class="ghost">Hủy</button>
        <button type="submit" class="primary">Lưu danh mục</button>
      </footer>
    </form>`;

    document.body.append(dialog);
    dialog.querySelector('[type=button]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await api(`/api/manage-directory/${kind}` + (row.id ? '/' + row.id : ''), {
          method: row.id ? 'PUT' : 'POST', body: JSON.stringify(values)
        });
        dialog.close();
        directory = await refresh();
        renderHeader();
        paint();
      } catch (error) {
        dialog.querySelector('[role=alert]').textContent = error.message;
      }
    };
    dialog.showModal();
    icons();
  }

  renderHeader();
  paint();
  icons();
}
