(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const number = value => new Intl.NumberFormat('vi-VN').format(value || 0);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function create({ button, panel, onRead, onReadAll, onNavigate, onRefresh, icons }) {
    let items = [];
    let kind = 'all';
    let unreadOnly = false;
    let query = '';
    let limit = 30;
    let open = false;
    let renderKey = '';
    if (!button || !panel) return { update() {}, open() {}, close() {}, reset() {} };

    panel.innerHTML = `<div class="notification-card">
      <header class="notification-heading">
        <div><h2 id="notificationTitle">Thông báo và cảnh báo</h2>
          <p data-notification-summary aria-live="polite"></p></div>
        <button class="notification-icon-button" type="button" data-notification-close
          aria-label="Đóng thông báo">${icon('x')}</button>
      </header>
      <div class="notification-toolbar">
        <button class="notification-action" type="button" data-notification-read-all>
          ${icon('check-check')}Đánh dấu tất cả đã đọc</button>
        <button class="notification-action" type="button" data-notification-refresh>
          ${icon('refresh-cw')}Cập nhật</button>
      </div>
      <label class="notification-search">${icon('search')}
        <span class="notification-visually-hidden">Tìm thông báo</span>
        <input type="search" placeholder="Tìm báo cáo, nội dung thông báo…" data-notification-search
          autocomplete="off"/></label>
      <nav class="notification-filters" aria-label="Lọc thông báo">
        <button type="button" data-notification-kind="all" aria-pressed="true">Tất cả</button>
        <button type="button" data-notification-unread aria-pressed="false">Chưa đọc</button>
        <button type="button" data-notification-kind="daily-report" aria-pressed="false">Báo cáo ngày</button>
        <button type="button" data-notification-kind="returned" aria-pressed="false">Bị trả lại</button>
        <button type="button" data-notification-kind="system" aria-pressed="false">Hệ thống</button>
      </nav>
      <p class="notification-status" data-notification-status role="status"></p>
      <div class="notification-list" data-notification-list></div>
      <button class="notification-load-more" type="button" data-notification-more hidden>
        Xem thêm thông báo</button>
      <footer data-notification-storage hidden>Trình duyệt đang chặn lưu trạng thái đã đọc.</footer>
    </div>`;

    const search = panel.querySelector('[data-notification-search]');
    const list = panel.querySelector('[data-notification-list]');
    const badge = button.querySelector('[data-notification-badge]');
    const summary = panel.querySelector('[data-notification-summary]');
    const status = panel.querySelector('[data-notification-status]');
    const more = panel.querySelector('[data-notification-more]');
    const readAll = panel.querySelector('[data-notification-read-all]');

    function visibleItems() {
      const needle = query.toLocaleLowerCase('vi');
      return items.filter(item => (!unreadOnly || !item.read)
        && (kind === 'all' || item.kind === kind
          || kind === 'returned' && window.ReturnedReportAttention?.isReturned(item))
        && (!needle || `${item.title} ${item.message}`.toLocaleLowerCase('vi').includes(needle)));
    }

    function drawList(force = false) {
      const matched = visibleItems();
      const signature = JSON.stringify([matched.slice(0, limit).map(item =>
        [item.id, item.title, item.message, item.read, item.level, item.kind,
          item.target, item.assetRef, item.dailyReportRef, item.createdAt, item.eventType]), limit]);
      if (!force && renderKey === signature) return;
      renderKey = signature;
      const scrollTop = list.scrollTop;
      const active = document.activeElement;
      const hadSearchFocus = active === search;
      list.innerHTML = matched.length ? matched.slice(0, limit).map(item => {
        const appearance = window.NotificationAppearance.describe(item);
        const time = new Intl.DateTimeFormat('vi-VN', {
          hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
        }).format(new Date(item.createdAt));
        return `<article class="notification-item ${escape(item.level)} ${escape(item.kind)}${item.read ? ' is-read' : ''}"
          data-notification-item="${escape(item.id)}" data-notification-tone="${appearance.tone}">
          <span class="notification-item-icon" aria-hidden="true">${icon(appearance.icon)}</span>
          <div class="notification-item-copy">
            <div class="notification-item-meta">
              <span class="notification-type">${appearance.label}</span>
              <time datetime="${new Date(item.createdAt).toISOString()}">${escape(time)}</time>
            </div>
            <strong>${escape(item.title)}</strong>
            <p>${escape(item.message)}</p>
            <div class="notification-item-actions">
              ${item.target ? `<button type="button" data-notification-open>${item.kind === 'daily-report'
                ? 'Mở nội dung' : 'Đi tới phân hệ'}</button>` : ''}
              ${item.read ? '' : '<button type="button" data-notification-read>Đã xem</button>'}
            </div>
          </div>
          ${item.read ? '' : '<span class="notification-unread-dot" aria-label="Chưa đọc"></span>'}
        </article>`;
      }).join('') : `<div class="notification-empty">
        ${icon(query || unreadOnly || kind !== 'all' ? 'search-x' : 'check-circle-2')}
        <strong>${query || unreadOnly || kind !== 'all'
          ? 'Không tìm thấy thông báo phù hợp' : 'Bạn đã cập nhật thông báo'}</strong>
        <p>${query || unreadOnly || kind !== 'all'
          ? 'Thử đổi từ khóa hoặc bộ lọc.' : 'Khi có nội dung mới, thông báo sẽ hiện tại đây.'}</p>
      </div>`;
      list.scrollTop = scrollTop;
      more.hidden = matched.length <= limit;
      if (hadSearchFocus) search.focus({ preventScroll: true });
      if (icons) icons();
    }

    function setOpen(next, { restoreFocus = true } = {}) {
      open = next;
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-open', open);
      if (open) {
        drawList(true);
        panel.querySelector('[data-notification-close]').focus({ preventScroll: true });
      } else if (restoreFocus) {
        button.focus({ preventScroll: true });
      }
    }

    function syncFilters() {
      panel.querySelectorAll('[data-notification-kind]').forEach(control => {
        control.setAttribute('aria-pressed', String(control.dataset.notificationKind === kind));
      });
      panel.querySelector('[data-notification-unread]').setAttribute('aria-pressed', String(unreadOnly));
    }

    button.addEventListener('click', () => setOpen(!open));
    panel.querySelector('[data-notification-close]').addEventListener('click', () => setOpen(false));
    panel.querySelector('[data-notification-refresh]').addEventListener('click', () => onRefresh?.());
    readAll.addEventListener('click', () => onReadAll?.());
    search.addEventListener('input', () => {
      query = search.value.trim();
      limit = 30;
      drawList(true);
    });
    panel.querySelectorAll('[data-notification-kind]').forEach(control => {
      control.addEventListener('click', () => {
        kind = control.dataset.notificationKind;
        unreadOnly = false;
        limit = 30;
        syncFilters();
        drawList(true);
      });
    });
    panel.querySelector('[data-notification-unread]').addEventListener('click', event => {
      unreadOnly = !unreadOnly;
      event.currentTarget.setAttribute('aria-pressed', String(unreadOnly));
      drawList(true);
    });
    more.addEventListener('click', () => {
      limit += 30;
      drawList(true);
    });
    list.addEventListener('click', event => {
      if (!event.target.closest('[data-notification-open], [data-notification-read]')) return;
      const row = event.target.closest('[data-notification-item]');
      if (!row) return;
      const item = items.find(candidate => candidate.id === row.dataset.notificationItem);
      if (!item) return;
      const navigate = Boolean(event.target.closest('[data-notification-open]') && item.target);
      onRead?.(item.id);
      if (navigate) onNavigate?.(item.target, item);
    });
    document.addEventListener('keydown', event => {
      if (open && event.key === 'Escape') setOpen(false);
      if (open && event.key === 'Tab' && !panel.contains(event.target)) {
        event.preventDefault();
        panel.querySelector('[data-notification-close]').focus();
      }
    });
    document.addEventListener('click', event => {
      // Capture before open/read handlers redraw icons or replace notification rows.
      // The original event path stays valid even if its target is removed from the DOM.
      const path = event.composedPath();
      if (open && !path.includes(panel) && !path.includes(button)) {
        setOpen(false, { restoreFocus: false });
      }
    }, { capture: true });

    button.title = 'Thông báo và cảnh báo';
    button.setAttribute('aria-haspopup', 'dialog');

    return {
      update(next) {
        items = next.items || [];
        const count = next.unread || 0;
        badge.hidden = count === 0;
        badge.textContent = count > 99 ? '99+' : number(count);
        button.setAttribute('aria-label', count
          ? `Thông báo và cảnh báo, ${number(count)} chưa đọc` : 'Thông báo và cảnh báo');
        summary.textContent = `${number(count)} chưa đọc · ${number(items.length)} thông báo`;
        status.textContent = next.error || (next.busy ? 'Đang đồng bộ dữ liệu…'
          : next.updatedAt ? `Đồng bộ lúc ${new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit', minute: '2-digit'
          }).format(new Date(next.updatedAt))}` : 'Đang chờ dữ liệu');
        status.classList.toggle('is-error', Boolean(next.error));
        readAll.disabled = count === 0;
        panel.querySelector('[data-notification-storage]').hidden = next.storageAvailable !== false;
        drawList();
      },
      open() {
        if (!open) setOpen(true);
      },
      openReturned() {
        kind = 'returned';
        unreadOnly = true;
        query = '';
        search.value = '';
        limit = 30;
        syncFilters();
        setOpen(true);
      },
      close() {
        if (open) setOpen(false);
      },
      reset() {
        items = [];
        kind = 'all';
        unreadOnly = false;
        limit = 30;
        syncFilters();
        query = '';
        search.value = '';
        button.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Thông báo và cảnh báo');
        badge.hidden = true;
        summary.textContent = '';
        panel.hidden = true;
        open = false;
        renderKey = '';
        drawList(true);
      }
    };
  }

  window.NotificationView = { create };
})();
