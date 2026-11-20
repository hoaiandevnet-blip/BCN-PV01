import { confirmAccountDeletion } from './account-deletion.js';

export async function renderAccounts({ api, directory, escapeHtml: escape, notify, icons }) {
  const host = document.getElementById('accounts');
  const data = await api('/api/accounts');
  const selected = new Set();
  const isCurrent = user => String(user.id) === data.current_account_id;
  let currentPage = 1;
  let pageSize = 15;

  const teams = (directory?.teams || []).slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'vi')
  );

  const getFilteredAccounts = () => {
    const searchVal = (host.querySelector('#accountSearch')?.value || '').trim().toLocaleLowerCase('vi');
    const teamVal = host.querySelector('#accountFilterTeam')?.value || '';
    const roleVal = host.querySelector('#accountFilterRole')?.value || '';
    const statusVal = host.querySelector('#accountFilterStatus')?.value || '';

    return data.accounts.filter(user => {
      if (searchVal) {
        const fullSearch = (
          (user.username || '') + ' ' +
          (user.full_name || '') + ' ' +
          (user.team || '') + ' ' +
          (user.phone || '')
        ).toLocaleLowerCase('vi');
        if (!fullSearch.includes(searchVal)) return false;
      }
      if (teamVal && String(user.team_id || '') !== String(teamVal)) return false;
      if (roleVal === 'admin' && !user.is_admin) return false;
      if (roleVal === 'staff' && user.is_admin) return false;
      if (statusVal && user.status !== statusVal) return false;
      return true;
    });
  };

  const visibleAccounts = () => getFilteredAccounts();

  const pagedAccounts = filtered => {
    if (pageSize === 'all') return filtered;
    const size = Number(pageSize) || 15;
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * size;
    return filtered.slice(start, start + size);
  };

  const totalCount = data.accounts.length;
  const activeCount = data.accounts.filter(u => u.status === 'Hoạt động').length;
  const lockedCount = data.accounts.filter(u => u.status === 'Tạm khóa').length;
  const adminCount = data.accounts.filter(u => u.is_admin).length;

  host.innerHTML = `<div class="bcn-account-kpis">
      <div class="bcn-kpi-item" data-kpi-filter="all" title="Bấm để xem tất cả tài khoản">
        <span class="bcn-kpi-icon"><i data-lucide="users"></i></span>
        <div><strong>${totalCount}</strong><span>Tổng tài khoản</span></div>
      </div>
      <div class="bcn-kpi-item success" data-kpi-filter="active" title="Bấm để lọc tài khoản đang hoạt động">
        <span class="bcn-kpi-icon"><i data-lucide="check-circle-2"></i></span>
        <div><strong>${activeCount}</strong><span>Đang hoạt động</span></div>
      </div>
      <div class="bcn-kpi-item warning" data-kpi-filter="locked" title="Bấm để lọc tài khoản tạm khóa">
        <span class="bcn-kpi-icon"><i data-lucide="lock"></i></span>
        <div><strong>${lockedCount}</strong><span>Tạm khóa</span></div>
      </div>
      <div class="bcn-kpi-item gold" data-kpi-filter="admin" title="Bấm để lọc quản trị viên">
        <span class="bcn-kpi-icon"><i data-lucide="shield-check"></i></span>
        <div><strong>${adminCount}</strong><span>Quản trị viên</span></div>
      </div>
    </div>
    <header class="bcn-toolbar">
      <div class="bcn-toolbar-title">
        <h2>Tài khoản & phân quyền</h2>
      </div>
      <div class="bcn-toolbar-actions">
        <button class="primary" id="addAccount">
          <i data-lucide="user-plus"></i><span>Tạo tài khoản</span>
        </button>
      </div>
    </header>
    <div class="bcn-account-filter-bar" role="search" aria-label="Bộ lọc danh sách tài khoản">
      <div class="bcn-filter-search-wrap">
        <i data-lucide="search" class="bcn-filter-search-icon"></i>
        <input id="accountSearch" type="search"
          placeholder="Tìm tên, tài khoản, đơn vị, SĐT…" aria-label="Tìm tài khoản"/>
      </div>
      <div class="bcn-filter-group">
        <select id="accountFilterTeam" aria-label="Lọc theo đơn vị">
          <option value="">Tất cả đơn vị</option>
          ${teams.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join('')}
        </select>
        <select id="accountFilterRole" aria-label="Lọc theo vai trò">
          <option value="">Tất cả vai trò</option>
          <option value="admin">Quản trị viên</option>
          <option value="staff">Cán bộ nghiệp vụ</option>
        </select>
        <select id="accountFilterStatus" aria-label="Lọc theo trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="Hoạt động">Đang hoạt động</option>
          <option value="Tạm khóa">Tạm khóa</option>
        </select>
        <button type="button" class="ghost" id="resetAccountFilters"
          title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc">
          <i data-lucide="rotate-ccw"></i><span>Đặt lại</span>
        </button>
      </div>
      <div class="bcn-filter-badge-wrap">
        <span id="accountFilterResultBadge" class="bcn-filter-badge">${totalCount} tài khoản</span>
      </div>
    </div>
    <div class="bcn-account-selection">
      <span id="accountSelectionCount" role="status">Chưa chọn tài khoản</span>
      <button type="button" class="ghost" id="clearAccountSelection" disabled>Bỏ chọn tất cả</button>
      <button type="button" class="ghost bcn-account-danger" id="deleteSelectedAccounts" disabled>
        Xóa tài khoản đã chọn</button>
    </div>
    <div class="bcn-table-card bcn-accounts-table-card">
      <div class="bcn-accounts-table-scroll">
        <table>
          <thead>
            <tr>
              <th class="bcn-account-check">
                <input id="selectAllAccounts" type="checkbox" aria-label="Chọn tất cả tài khoản đang hiển thị">
              </th>
              <th>TÀI KHOẢN</th>
              <th>ĐƠN VỊ</th>
              <th>VAI TRÒ</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody id="accountRows"></tbody>
        </table>
      </div>
      <div class="bcn-account-pagination" id="accountPagination">
        <div class="bcn-pagination-info" id="accountPaginationInfo"></div>
        <div class="bcn-pagination-controls">
          <button type="button" class="ghost bcn-page-btn" id="prevAccountPage" title="Trang trước">
            <i data-lucide="chevron-left"></i><span>Trước</span>
          </button>
          <div class="bcn-page-numbers" id="accountPageNumbers"></div>
          <button type="button" class="ghost bcn-page-btn" id="nextAccountPage" title="Trang sau">
            <span>Sau</span><i data-lucide="chevron-right"></i>
          </button>
          <select id="accountPageSize" aria-label="Số dòng mỗi trang">
            <option value="15" selected>15 / trang</option>
            <option value="30">30 / trang</option>
            <option value="50">50 / trang</option>
            <option value="100">100 / trang</option>
            <option value="all">Tất cả</option>
          </select>
        </div>
      </div>
    </div>`;

  function updateKpis() {
    const total = data.accounts.length;
    const active = data.accounts.filter(u => u.status === 'Hoạt động').length;
    const locked = data.accounts.filter(u => u.status === 'Tạm khóa').length;
    const admins = data.accounts.filter(u => u.is_admin).length;
    const kpiEls = host.querySelectorAll('.bcn-kpi-item strong');
    if (kpiEls.length === 4) {
      kpiEls[0].textContent = total;
      kpiEls[1].textContent = active;
      kpiEls[2].textContent = locked;
      kpiEls[3].textContent = admins;
    }
  }

  function syncSelection() {
    const filtered = visibleAccounts().filter(user => !isCurrent(user));
    const paged = pagedAccounts(filtered);
    const checked = paged.filter(user => selected.has(String(user.id))).length;
    const all = host.querySelector('#selectAllAccounts');
    if (all) {
      all.checked = paged.length > 0 && checked === paged.length;
      all.indeterminate = checked > 0 && checked < paged.length;
      all.disabled = paged.length === 0;
    }
    const countEl = host.querySelector('#accountSelectionCount');
    if (countEl) {
      countEl.textContent = selected.size
        ? `Đã chọn ${selected.size} tài khoản` : 'Chưa chọn tài khoản';
    }
    const clearBtn = host.querySelector('#clearAccountSelection');
    if (clearBtn) clearBtn.disabled = selected.size === 0;
    const deleteBtn = host.querySelector('#deleteSelectedAccounts');
    if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    host.querySelectorAll('[data-account-select]').forEach(input => {
      input.checked = selected.has(input.dataset.accountSelect);
      const row = input.closest('tr');
      if (row) row.dataset.selected = String(input.checked);
    });
  }

  function removeAccounts(accounts, trigger) {
    confirmAccountDeletion({ accounts, api, escapeHtml: escape, notify, trigger,
      onDeleted: ids => {
        const removed = new Set(ids);
        data.accounts = data.accounts.filter(user => !removed.has(String(user.id)));
        ids.forEach(id => selected.delete(id));
        updateKpis();
        paint();
        if (!trigger?.isConnected) host.querySelector('#accountSearch')?.focus();
      }
    });
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function paint() {
    const filtered = visibleAccounts();
    const totalFiltered = filtered.length;
    const size = pageSize === 'all' ? totalFiltered : (Number(pageSize) || 15);
    const totalPages = Math.max(1, Math.ceil(totalFiltered / (size || 1)));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * size;
    const paged = pageSize === 'all' ? filtered : filtered.slice(startIdx, startIdx + size);

    const badge = host.querySelector('#accountFilterResultBadge');
    if (badge) {
      if (totalFiltered === data.accounts.length) {
        badge.textContent = `${data.accounts.length} tài khoản`;
      } else {
        badge.textContent = `Đã lọc: ${totalFiltered} / ${data.accounts.length} tài khoản`;
      }
    }

    const tbody = host.querySelector('#accountRows');
    tbody.innerHTML = paged.map(user => `<tr>
      <td class="bcn-account-check"><input type="checkbox" data-account-select="${user.id}"
        aria-label="Chọn ${escape(user.username)}" ${isCurrent(user) ? 'disabled' : ''}></td>
      <td>
        <div class="bcn-user-cell">
          <span class="bcn-user-avatar">${escape(initials(user.full_name))}</span>
          <div class="bcn-user-info">
            <strong class="bcn-user-name">${escape(user.full_name)}</strong>
            <small class="bcn-user-sub">${escape(user.username)}
              ${isCurrent(user) ? ' · <span class="bcn-current-pill">Đang đăng nhập</span>' : ''}</small>
          </div>
        </div>
      </td>
      <td><span class="bcn-unit-text">${escape(user.team || '—')}</span></td>
      <td><span class="bcn-role-badge ${user.is_admin ? 'admin' : 'staff'}">
        ${user.is_admin ? 'Quản trị viên' : 'Cán bộ nghiệp vụ'}</span></td>
      <td><span class="bcn-status-pill ${user.status === 'Hoạt động' ? 'active' : 'locked'}">
        <i class="status-dot"></i><span>${escape(user.status)}</span></span></td>
      <td><div class="bcn-account-actions">
        <button class="ghost" data-edit="${user.id}">Quản lý</button>
        <button type="button" class="ghost bcn-account-danger" data-delete-account="${user.id}"
          aria-label="Xóa tài khoản ${escape(user.username)}" ${isCurrent(user) ? 'disabled' : ''}>Xóa</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="6" class="bcn-empty-table">Không có tài khoản phù hợp với bộ lọc.</td></tr>';

    const info = host.querySelector('#accountPaginationInfo');
    if (info) {
      if (totalFiltered === 0) {
        info.textContent = '0 tài khoản';
      } else {
        const from = startIdx + 1;
        const to = Math.min(startIdx + paged.length, totalFiltered);
        const totalText = totalFiltered !== data.accounts.length ? ` (tổng ${data.accounts.length})` : '';
        info.textContent = `Hiển thị ${from}–${to} trong số ${totalFiltered} tài khoản${totalText}`;
      }
    }

    const prevBtn = host.querySelector('#prevAccountPage');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    const nextBtn = host.querySelector('#nextAccountPage');
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    const pageNumbersEl = host.querySelector('#accountPageNumbers');
    if (pageNumbersEl) {
      if (totalPages <= 1) {
        pageNumbersEl.innerHTML = '';
      } else {
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            pages.push(i);
          } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
          }
        }
        pageNumbersEl.innerHTML = pages.map(p => {
          if (p === '...') return '<span class="bcn-page-ellipsis">…</span>';
          return `<button type="button" class="bcn-page-num ${p === currentPage ? 'active' : ''}"
            data-goto-page="${p}">${p}</button>`;
        }).join('');

        pageNumbersEl.querySelectorAll('[data-goto-page]').forEach(btn => {
          btn.onclick = () => {
            currentPage = Number(btn.dataset.gotoPage);
            paint();
            host.querySelector('.bcn-accounts-table-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
          };
        });
      }
    }

    host.querySelectorAll('[data-account-select]').forEach(input => {
      input.onchange = () => {
        if (input.checked && selected.size >= 100) {
          notify('Chọn tối đa 100 tài khoản mỗi lần.');
        } else if (input.checked) {
          selected.add(input.dataset.accountSelect);
        } else {
          selected.delete(input.dataset.accountSelect);
        }
        syncSelection();
      };
    });

    host.querySelectorAll('[data-delete-account]').forEach(button => {
      button.onclick = () => {
        const user = data.accounts.find(account => String(account.id) === button.dataset.deleteAccount);
        if (user && !isCurrent(user)) removeAccounts([user], button);
      };
    });

    host.querySelectorAll('[data-edit]').forEach(button => {
      button.onclick = async () => {
        try { await editor(await api('/api/accounts/' + button.dataset.edit)); }
        catch (error) { notify(error.message); }
      };
    });

    syncSelection();
    icons();
  }

  function select(label, name, rows, current) {
    return `<label>${label}<select name="${name}"><option value="">Chưa gắn</option>
      ${rows.map(row => `<option value="${row.id}" ${String(row.id) === String(current) ? 'selected' : ''}>
        ${escape(row.name)}</option>`).join('')}</select></label>`;
  }

  async function editor(user = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'bcn-dialog bcn-account-dialog';
    const assigned = new Set((user.permissions || []).map(item => String(item.id)));
    dialog.innerHTML = `<form>
      <h2>${user.id ? 'Quản lý tài khoản' : 'Tạo tài khoản'}</h2>
      <div class="bcn-dialog-grid">
        <label>Tên đăng nhập
          <input name="username" value="${escape(user.username)}" required
            pattern="[a-z0-9._-]{3,32}" ${user.id ? 'readonly' : ''}/>
        </label>
        <label>Họ và tên
          <input name="full_name" value="${escape(user.full_name)}" required maxlength="200"/>
        </label>
        <label>${user.id ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}
          <input name="password" type="password" autocomplete="new-password"
            minlength="8" ${user.id ? '' : 'required'}/>
        </label>
        <label>Số điện thoại
          <input name="phone" value="${escape(user.phone)}" maxlength="30"/>
        </label>
        ${select('Đơn vị / đội công tác', 'team_id', directory.teams, user.team_id)}
        ${select('Cấp bậc', 'rank_id', directory.ranks, user.rank_id)}
        ${select('Chức vụ', 'position_id', directory.positions, user.position_id)}
        <label>Trạng thái
          <select name="status">
            <option>Hoạt động</option>
            <option ${user.status === 'Tạm khóa' ? 'selected' : ''}>Tạm khóa</option>
          </select>
        </label>
      </div>
      <div class="bcn-dialog-checks">
        <label class="bcn-check">
          <input type="checkbox" name="is_admin" ${user.is_admin ? 'checked' : ''}/>
          <span>Quản trị viên</span>
        </label>
        <label class="bcn-check">
          <input type="checkbox" name="session_unlimited" ${user.session_unlimited ? 'checked' : ''}/>
          <span>Phiên đăng nhập không giới hạn thời gian</span>
        </label>
      </div>
      <h3>Quyền truy cập chức năng</h3>
      <div class="bcn-permission-list">
        ${data.permissions.map(permission => `<label class="bcn-check">
          <input type="checkbox" name="permission_ids" value="${permission.id}"
            ${assigned.has(String(permission.id)) ? 'checked' : ''}/>
          <span>${escape(permission.name)}</span>
        </label>`).join('')}
      </div>
      <p class="bcn-hint-text">Vai trò và phạm vi nghiệp vụ được quản lý tại Báo cáo ngày → Phân quyền.</p>
      <p class="bcn-error" role="alert"></p>
      <footer>
        <button class="ghost" type="button" data-cancel>Hủy</button>
        <button class="primary" type="submit">Lưu tài khoản</button>
      </footer>
    </form>`;

    document.body.append(dialog);
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form);
      payload.permission_ids = form.getAll('permission_ids').map(Number);
      payload.is_admin = form.has('is_admin');
      payload.session_unlimited = form.has('session_unlimited');
      const button = dialog.querySelector('[type=submit]');
      button.disabled = true;
      try {
        await api('/api/accounts' + (user.id ? '/' + user.id : ''), {
          method: user.id ? 'PUT' : 'POST', body: JSON.stringify(payload)
        });
        dialog.close();
        notify('Đã lưu tài khoản và quyền truy cập.');
        await renderAccounts({ api, directory, escapeHtml: escape, notify, icons });
      } catch (error) {
        dialog.querySelector('[role=alert]').textContent = error.message;
      } finally { button.disabled = false; }
    };
    dialog.showModal();
    icons();
  }

  host.querySelectorAll('[data-kpi-filter]').forEach(item => {
    item.onclick = () => {
      const type = item.dataset.kpiFilter;
      const statusSelect = host.querySelector('#accountFilterStatus');
      const roleSelect = host.querySelector('#accountFilterRole');
      if (type === 'all') {
        host.querySelector('#resetAccountFilters').click();
      } else if (type === 'active') {
        statusSelect.value = 'Hoạt động';
        roleSelect.value = '';
        currentPage = 1;
        paint();
      } else if (type === 'locked') {
        statusSelect.value = 'Tạm khóa';
        roleSelect.value = '';
        currentPage = 1;
        paint();
      } else if (type === 'admin') {
        roleSelect.value = 'admin';
        statusSelect.value = '';
        currentPage = 1;
        paint();
      }
    };
  });

  host.querySelector('#accountSearch').oninput = () => {
    currentPage = 1;
    paint();
  };

  host.querySelector('#accountFilterTeam').onchange = () => {
    currentPage = 1;
    paint();
  };

  host.querySelector('#accountFilterRole').onchange = () => {
    currentPage = 1;
    paint();
  };

  host.querySelector('#accountFilterStatus').onchange = () => {
    currentPage = 1;
    paint();
  };

  host.querySelector('#resetAccountFilters').onclick = () => {
    host.querySelector('#accountSearch').value = '';
    host.querySelector('#accountFilterTeam').value = '';
    host.querySelector('#accountFilterRole').value = '';
    host.querySelector('#accountFilterStatus').value = '';
    currentPage = 1;
    paint();
  };

  host.querySelector('#prevAccountPage').onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      paint();
      host.querySelector('.bcn-accounts-table-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  host.querySelector('#nextAccountPage').onclick = () => {
    const filtered = visibleAccounts();
    const size = pageSize === 'all' ? filtered.length : (Number(pageSize) || 15);
    const totalPages = Math.max(1, Math.ceil(filtered.length / (size || 1)));
    if (currentPage < totalPages) {
      currentPage++;
      paint();
      host.querySelector('.bcn-accounts-table-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  host.querySelector('#accountPageSize').onchange = event => {
    pageSize = event.target.value;
    currentPage = 1;
    paint();
  };

  host.querySelector('#selectAllAccounts').onchange = event => {
    const filtered = visibleAccounts().filter(user => !isCurrent(user));
    const targetItems = pagedAccounts(filtered);
    if (event.target.checked) {
      const next = new Set([...selected, ...targetItems.map(user => String(user.id))]);
      if (next.size > 100) {
        notify('Chọn tối đa 100 tài khoản mỗi lần. Hãy lọc danh sách để chọn ít hơn.');
      } else {
        next.forEach(id => selected.add(id));
      }
    } else {
      targetItems.forEach(user => selected.delete(String(user.id)));
    }
    syncSelection();
  };

  host.querySelector('#clearAccountSelection').onclick = () => {
    selected.clear();
    syncSelection();
  };

  host.querySelector('#deleteSelectedAccounts').onclick = event => {
    removeAccounts(data.accounts.filter(user => selected.has(String(user.id))), event.currentTarget);
  };

  host.querySelector('#addAccount').onclick = () => editor();
  paint();
  icons();
}
