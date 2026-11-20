(() => {
  'use strict';

  function mount({ root, getScope, unitName, request, decide, allowed }) {
    const view = window.DailyReportsUnlockView;
    const elements = view.mount(root);
    const { pane, rows } = elements;
    const $ = selector => pane.querySelector(selector);
    const statusFilter = $('#unlockStatus');
    const search = $('#unlockSearch');
    const dayFilter = $('#unlockDay');
    const pageSize = 8;
    let list = [];
    let page = 1;
    let generation = 0;
    let identity = '';
    let loading = false;
    let hasLoaded = false;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
    const icons = target => window.lucide?.createIcons({ root: target, attrs: { focusable: 'false' } });

    function filteredRows() {
      const keyword = normalize(search.value);
      return list.filter(item => (!statusFilter.value || view.effectiveStatus(item) === statusFilter.value)
        && (!dayFilter.value || String(item.report_day).slice(0, 10) === dayFilter.value)
        && (!keyword || normalize([
          unitName(item.unit_id), item.scope_id, item.reason, item.decision_reason, view.purpose(item)
        ].join(' ')).includes(keyword))).sort((first, second) => {
        const pending = Number(view.effectiveStatus(second) === 'REQUESTED')
          - Number(view.effectiveStatus(first) === 'REQUESTED');
        return pending || new Date(second.created_at) - new Date(first.created_at);
      });
    }

    function setReasonExpanded(row, expanded) {
      row.dataset.reasonExpanded = String(expanded);
      row.querySelector('.unlock-reason-text').classList.toggle('is-expanded', expanded);
      const button = row.querySelector('[data-unlock-reason-toggle]');
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Thu gọn' : 'Đọc đầy đủ';
      if (expanded) button.hidden = false;
    }

    function updateReasonControls() {
      rows.querySelectorAll('[data-unlock-id]').forEach(row => {
        if (row.dataset.reasonExpanded === 'true') return;
        const text = row.querySelector('.unlock-reason-text');
        if (!text.clientHeight) return;
        row.querySelector('[data-unlock-reason-toggle]').hidden = text.scrollHeight <= text.clientHeight + 1;
      });
    }

    function render() {
      const counts = Object.fromEntries(Object.keys(view.statuses).map(key => [key, 0]));
      list.forEach(item => { counts[view.effectiveStatus(item)] += 1; });
      pane.querySelectorAll('[data-unlock-count]').forEach(node => {
        node.textContent = hasLoaded ? counts[node.dataset.unlockCount] || 0 : '—';
      });
      pane.querySelectorAll('[data-unlock-filter]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.unlockFilter === statusFilter.value));
      });
      $('#unlockTotal').textContent = hasLoaded ? `${list.length} yêu cầu` : 'Đang tải…';
      const filtered = filteredRows();
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      page = Math.min(page, pages);
      const start = (page - 1) * pageSize;
      $('#unlockResultCount').textContent = loading ? 'Đang cập nhật yêu cầu…'
        : `${filtered.length} yêu cầu${statusFilter.value ? ' · ' + view.statuses[statusFilter.value][0] : ''}`;
      $('#unlockPageLabel').textContent = filtered.length
        ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} / ${filtered.length} · Trang ${page}/${pages}`
        : '0 yêu cầu';
      $('#unlockPrevious').disabled = page <= 1;
      $('#unlockNext').disabled = page >= pages;
      const openIds = new Set([...rows.querySelectorAll('details[open]')]
        .map(details => details.closest('[data-unlock-id]').dataset.unlockId));
      const expandedReasonIds = new Set([...rows.querySelectorAll('[data-reason-expanded="true"]')]
        .map(row => row.dataset.unlockId));
      const focus = rows.contains(document.activeElement) ? document.activeElement : null;
      const focusedId = focus?.closest('[data-unlock-id]')?.dataset.unlockId;
      const focusedControl = focus?.matches('[data-approve]') ? '[data-approve]'
        : focus?.matches('[data-reject]') ? '[data-reject]'
          : focus?.matches('[data-unlock-reason-toggle]') ? '[data-unlock-reason-toggle]' : 'summary';
      rows.setAttribute('aria-busy', String(loading));
      if (!hasLoaded) {
        rows.innerHTML = `<div class="unlock-empty">${view.icon('loader-circle')}
          <strong>${loading ? 'Đang tải đề nghị mở khóa' : 'Chưa tải được danh sách'}</strong>
          <p>${loading ? 'Đang lấy dữ liệu trong phạm vi của bạn.' : 'Chọn Thử lại để kết nối lại.'}</p></div>`;
      } else if (!filtered.length) {
        const narrowed = search.value || statusFilter.value || dayFilter.value;
        rows.innerHTML = `<div class="unlock-empty">${view.icon(narrowed ? 'search-x' : 'inbox')}
          <strong>${narrowed ? 'Không có đề nghị phù hợp' : 'Chưa có đề nghị mở khóa'}</strong>
          <p>${narrowed ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem tất cả yêu cầu.'
            : 'Các đề nghị trong phạm vi của bạn sẽ xuất hiện tại đây.'}</p>
          ${narrowed ? '<button type="button" class="ghost" data-clear-filters>Xóa bộ lọc</button>' : ''}</div>`;
      } else {
        rows.innerHTML = filtered.slice(start, start + pageSize).map(item => view.row(item, {
          unitName, isCompiler: Boolean(getScope()?.roles?.includes('PV01_COMPILER'))
        })).join('');
      }
      rows.querySelectorAll('[data-unlock-id]').forEach(row => {
        if (openIds.has(row.dataset.unlockId)) row.querySelector('details').open = true;
        if (expandedReasonIds.has(row.dataset.unlockId)) setReasonExpanded(row, true);
      });
      icons(rows);
      updateReasonControls();
      const focusedRow = [...rows.querySelectorAll('[data-unlock-id]')]
        .find(row => row.dataset.unlockId === focusedId);
      focusedRow?.querySelector(focusedControl)?.focus({ preventScroll: true });
    }

    function clearFilters() {
      search.value = '';
      statusFilter.value = '';
      dayFilter.value = '';
      page = 1;
      render();
    }

    function reset() {
      generation += 1;
      list = [];
      loading = false;
      hasLoaded = false;
      $('#unlockLoadFeedback').hidden = true;
      clearFilters();
    }

    async function load() {
      const scope = getScope();
      const nextIdentity = JSON.stringify([scope?.userId, scope?.unitId, scope?.roles, scope?.compilerModules,
        scope?.submodules]);
      if (identity !== nextIdentity) {
        identity = nextIdentity;
        reset();
      }
      if (!allowed() || !scope?.roles?.some(role => ['UNIT_REPORTER', 'PV01_COMPILER'].includes(role))) {
        reset();
        return;
      }
      const current = ++generation;
      loading = true;
      $('#unlockLoadFeedback').hidden = true;
      render();
      try {
        const data = await request('/unlock-requests');
        if (current !== generation) return;
        list = data.requests || [];
        hasLoaded = true;
      } catch (error) {
        if (current !== generation) return;
        $('#unlockLoadFeedback').hidden = false;
        $('#unlockLoadFeedback p').textContent = `${error.message}${hasLoaded
          ? ' Danh sách bên dưới là dữ liệu đã tải trước đó.' : ''}`;
      } finally {
        if (current === generation) {
          loading = false;
          render();
        }
      }
    }

    for (const control of [search, statusFilter, dayFilter]) {
      control.addEventListener(control === search ? 'input' : 'change', () => {
        page = 1;
        render();
      });
    }
    $('#unlockClear').onclick = clearFilters;
    $('#unlockRetry').onclick = load;
    $('#unlockPrevious').onclick = () => {
      page -= 1;
      render();
    };
    $('#unlockNext').onclick = () => {
      page += 1;
      render();
    };
    pane.querySelectorAll('[data-unlock-filter]').forEach(button => {
      button.onclick = () => {
        statusFilter.value = statusFilter.value === button.dataset.unlockFilter ? '' : button.dataset.unlockFilter;
        page = 1;
        render();
      };
    });
    rows.addEventListener('click', event => {
      if (event.target.closest('[data-clear-filters]')) clearFilters();
      const reasonToggle = event.target.closest('[data-unlock-reason-toggle]');
      if (reasonToggle) {
        const row = reasonToggle.closest('[data-unlock-id]');
        setReasonExpanded(row, row.dataset.reasonExpanded !== 'true');
        updateReasonControls();
        return;
      }
      const button = event.target.closest('[data-approve], [data-reject]');
      if (!button) return;
      const id = button.dataset.approve || button.dataset.reject;
      const item = list.find(entry => entry.id === id);
      if (item) decide(id, button.dataset.approve ? 'APPROVED' : 'REJECTED', item.purpose, item);
    });
    let reasonResizeFrame;
    const reasonResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(reasonResizeFrame);
      reasonResizeFrame = requestAnimationFrame(updateReasonControls);
    });
    reasonResizeObserver.observe(rows);
    icons(pane);
    // Keep expiry labels and counts correct while the workspace stays open.
    window.setInterval(() => {
      if (root.dataset.bcnActiveView !== 'unlock' || document.hidden || loading) return;
      if (list.some(item => item.status === 'APPROVED' && view.effectiveStatus(item) === 'EXPIRED')) {
        list = list.map(item => ({ ...item, status: view.effectiveStatus(item) }));
        render();
      }
    }, 15000);

    return {
      load, reset,
      decisionContext: item => item ? view.context(item, unitName) : ''
    };
  }
  window.DailyReportsUnlock = { mount };
})();
