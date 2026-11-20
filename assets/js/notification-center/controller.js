(() => {
  let model;
  let view;
  let popup;
  let returnedAttention;
  let context;
  let state = { busy: false, error: '', updatedAt: null };
  let data = null;
  let serverItems = [];
  let feedError = '';
  let feedUpdatedAt = null;
  let feedTimer = null;
  let loginExpiryTimer = null;
  let feedRequest = 0;
  let feedPendingRequest = null;
  let feedRefreshQueued = false;
  const destinations = new Set([
    'assetCategoryManager', 'tttcAssetCategories', 'stationHandovers', 'assets', 'reports', 'dashboard',
    'dailyReports', 'baoBan'
  ]);

  const allowed = item => !Array.isArray(context?.allowedModules)
    || context.allowedModules.includes(item.moduleKey || item.target);

  function paint() {
    if (!context || !view || !model) return;
    const snapshot = model.snapshot();
    const now = Date.now();
    const isLogin = item => item.eventType === 'login' || item.title === 'Đăng nhập thành công';
    const items = [...snapshot.items, ...serverItems].filter(allowed)
      .filter(item => !isLogin(item) || item.createdAt + 10000 > now).sort((left, right) =>
      Number(left.read) - Number(right.read) || right.createdAt - left.createdAt
      || left.title.localeCompare(right.title, 'vi'));
    if (loginExpiryTimer) window.clearTimeout?.(loginExpiryTimer);
    loginExpiryTimer = null;
    const expirations = items.filter(isLogin).map(item => item.createdAt + 10000);
    if (expirations.length && typeof window.setTimeout === 'function') {
      loginExpiryTimer = window.setTimeout(paint, Math.max(1, Math.min(...expirations) - now));
    }
    returnedAttention?.update(items);
    view.update({
      ...snapshot,
      items,
      unread: items.filter(item => !item.read).length,
      busy: feedPendingRequest === feedRequest,
      updatedAt: feedUpdatedAt || state.updatedAt,
      error: state.error || feedError
    });
  }

  function normalizeFeedItem(item) {
    const createdAt = Number(item?.createdAt);
    if (!item || !/^(?:bcn:)?[1-9]\d{0,18}$/.test(String(item.id || '')) || !Number.isFinite(createdAt)) return null;
    return {
      ...item,
      id: `server:${item.id}`,
      serverId: String(item.id),
      createdAt,
      read: item.read === true,
      kind: ['asset', 'daily-report'].includes(item.kind) ? item.kind : 'system'
    };
  }

  async function refreshFeed({ afterMutation = false } = {}) {
    if (!context || !model || typeof window.fetch !== 'function') return;
    const username = context.username;
    const request = feedRequest;
    if (feedPendingRequest === request) {
      if (afterMutation) feedRefreshQueued = true;
      return;
    }
    feedPendingRequest = request;
    try {
      const response = await (window.BcnSession?.fetch || window.fetch)('/api/notifications', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (request !== feedRequest || context?.username !== username) return;
      if (!response.ok) throw new Error(`Notification feed returned ${response.status}`);
      const payload = await response.json();
      if (request !== feedRequest || context?.username !== username) return;
      const nextItems = Array.isArray(payload?.items)
        ? payload.items.map(normalizeFeedItem).filter(Boolean).filter(allowed) : [];
      const existingIds = new Set(serverItems.map(item => item.id));
      const newUnreadItems = nextItems.filter(item => !item.read
        && !existingIds.has(item.id)
        && item.eventType !== 'login'
        && item.label !== 'Đăng nhập');
      serverItems = nextItems;
      feedUpdatedAt = Date.now();
      feedError = '';
      if (newUnreadItems.length) {
        popup?.enqueue(newUnreadItems);
        context?.announce?.(newUnreadItems);
      }
    } catch (_) {
      if (request === feedRequest && context?.username === username) {
        feedError = 'Chưa thể đồng bộ thông báo mới từ máy chủ.';
      }
    } finally {
      if (feedPendingRequest === request) feedPendingRequest = null;
      if (request === feedRequest && context?.username === username) {
        paint();
        if (feedRefreshQueued) {
          feedRefreshQueued = false;
          void refreshFeed();
        }
      }
    }
  }

  async function writeRead(path, previousItems, nextItems) {
    const request = feedRequest;
    const username = context?.username;
    serverItems = nextItems;
    feedError = '';
    paint();
    try {
      const response = await (window.BcnSession?.fetch || window.fetch)(path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (request !== feedRequest || context?.username !== username) return;
      if (!response.ok) throw new Error(`Notification read returned ${response.status}`);
      await refreshFeed();
    } catch (_) {
      if (request !== feedRequest || context?.username !== username) return;
      serverItems = previousItems;
      feedError = 'Chưa lưu được trạng thái đã đọc. Vui lòng thử lại.';
      paint();
    }
  }

  function markRead(id) {
    const target = serverItems.find(item => item.id === id);
    if (!target) {
      model.markRead(id);
      paint();
      return;
    }
    if (target.read) return;
    const previousItems = serverItems.map(item => ({ ...item }));
    const nextItems = serverItems.map(item => item.id === id ? { ...item, read: true } : item);
    void writeRead(`/api/notifications/${encodeURIComponent(target.serverId)}/read`, previousItems, nextItems);
  }

  function markAllRead() {
    model.markAllRead();
    if (!serverItems.some(item => !item.read)) {
      paint();
      return;
    }
    const previousItems = serverItems.map(item => ({ ...item }));
    const nextItems = serverItems.map(item => ({ ...item, read: true }));
    void writeRead('/api/notifications/read-all', previousItems, nextItems);
  }

  function bindView() {
    if (!returnedAttention && window.ReturnedReportAttention?.create) {
      returnedAttention = window.ReturnedReportAttention.create();
    }
    if (!popup && window.NotificationPopup?.create) {
      popup = window.NotificationPopup.getShared?.() || window.NotificationPopup.create({
        onOpen() {
          if (context) view?.open();
        }
      });
    }
    if (view) return true;
    const button = document.getElementById('notificationToggle');
    const panel = document.getElementById('notificationPanel');
    if (!button || !panel || !window.NotificationView?.create) return false;
    view = window.NotificationView.create({
      button,
      panel,
      onRead: markRead,
      onReadAll: markAllRead,
      onNavigate(target, item) {
        if (context && destinations.has(target)) {
          view?.close?.();
          context.navigate(target, item);
        }
      },
      onRefresh() {
        context?.refresh();
        void refreshFeed();
      },
      icons: () => context?.icons()
    });
    return Boolean(view);
  }

  function start(options) {
    if (!model) {
      let storage;
      try {
        storage = window.localStorage;
      } catch (_) {
        storage = {
          getItem() { throw new Error('Storage unavailable'); },
          setItem() { throw new Error('Storage unavailable'); }
        };
      }
      model = window.NotificationModel.create({ storage });
    }
    const changedAccount = context?.username !== options.username;
    if (changedAccount) {
      view?.reset();
      popup?.reset();
      returnedAttention?.reset();
      state = { busy: true, error: '', updatedAt: null };
      data = null;
      serverItems = [];
      feedUpdatedAt = null;
      feedError = '';
      feedRequest += 1;
      feedRefreshQueued = false;
      if (feedTimer) window.clearInterval?.(feedTimer);
      feedTimer = null;
    }
    context = options;
    model.setScope(options.username);
    bindView();
    paint();
    if (changedAccount) {
      void refreshFeed();
      if (typeof window.setInterval === 'function') {
        feedTimer = window.setInterval(() => {
          if (!document.hidden) void refreshFeed();
        }, 5000);
      }
    }
  }

  function update(next) {
    if (!context || !model) return;
    state = { busy: next.busy, error: next.error, updatedAt: next.updatedAt };
    if (next.data && next.data !== data) {
      data = next.data;
      model.reconcile(data);
    }
    if (next.error) {
      model.publish({
        id: 'inventory-sync-error', title: 'Chưa cập nhật được cảnh báo tài sản',
        message: next.error, level: 'warning'
      });
    } else {
      model.resolve('inventory-sync-error');
    }
    paint();
  }

  window.addEventListener('storage', event => {
    if (!context || !model || event.key !== model.storageKey()) return;
    model.reload();
    if (data) model.reconcile(data);
    paint();
  });
  window.addEventListener('focus', () => void refreshFeed());
  window.addEventListener('asset-inventory-changed', () => {
    void refreshFeed({ afterMutation: true });
  });
  window.addEventListener('daily-reports-changed', () => void refreshFeed({ afterMutation: true }));
  document.addEventListener?.('visibilitychange', () => {
    if (!document.hidden) void refreshFeed();
  });

  window.NotificationCenter = {
    start,
    update,
    publish(event) {
      if (!context || !model) return;
      model.publish(event);
      paint();
    },
    open() {
      void refreshFeed();
      if (context) view?.open();
    },
    reset() {
      if (loginExpiryTimer) window.clearTimeout?.(loginExpiryTimer);
      loginExpiryTimer = null;
      context = null;
      data = null;
      serverItems = [];
      feedUpdatedAt = null;
      feedError = '';
      feedRequest += 1;
      feedRefreshQueued = false;
      if (feedTimer) window.clearInterval?.(feedTimer);
      feedTimer = null;
      state = { busy: false, error: '', updatedAt: null };
      model?.setScope('');
      view?.reset();
      popup?.reset();
      returnedAttention?.reset();
    }
  };
  bindView();
})();
