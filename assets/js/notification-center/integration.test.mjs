import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');

function harness() {
  const storage = new Map();
  const handlers = {};
  const paints = [];
  const popups = [];
  let popupResets = 0;
  let callbacks;
  let resets = 0;
  let viewCreates = 0;
  const context = vm.createContext({
    window: {
      localStorage: {
        getItem: key => storage.get(key),
        setItem: (key, value) => storage.set(key, value)
      },
      addEventListener: (event, callback) => { handlers[event] = callback; },
      NotificationPopup: {
        create() {
          return {
            enqueue: items => popups.push(items),
            reset: () => { popupResets += 1; }
          };
        }
      },
      NotificationView: {
        create(options) {
          viewCreates += 1;
          callbacks = options;
          return {
            update: value => paints.push(value),
            reset: () => { resets += 1; },
            open() {}
          };
        }
      }
    },
    document: { getElementById: id => ({ id }) }
  });
  for (const file of ['../dashboard-data.js', 'model.js', 'controller.js']) {
    vm.runInContext(source(file), context);
  }
  const center = context.window.NotificationCenter;
  const snapshot = (status = 'Hư hỏng') => ({
    data: { rows: [{ id: 1, source: 'assets', type: 'PC', code: 'PC-1', status }] },
    busy: false, error: '', updatedAt: 1000
  });
  return {
    center, context, snapshot, paints, handlers, storage, popups,
    popupResets: () => popupResets,
    callbacks: () => callbacks, resets: () => resets, viewCreates: () => viewCreates
  };
}

test('controller binds the notification globe before an account session starts', () => {
  const h = harness();
  assert.equal(h.viewCreates(), 1);
  h.center.start({ username: 'alice', navigate() {}, refresh() {}, icons() {} });
  assert.equal(h.viewCreates(), 1);
});

test('controller keeps alerts on failed refresh, routes read actions and isolates account changes', () => {
  const h = harness();
  const routes = [];
  let refreshes = 0;
  const start = username => h.center.start({
    username, navigate: target => routes.push(target), refresh: () => { refreshes += 1; }, icons() {}
  });
  start('alice');
  h.center.update(h.snapshot());
  assert.equal(h.paints.at(-1).unread, 1);
  const alert = h.paints.at(-1).items[0];
  h.callbacks().onRead(alert.id);
  assert.equal(h.paints.at(-1).unread, 0);
  h.callbacks().onNavigate(alert.target);
  assert.deepEqual(routes, ['assetCategoryManager']);
  h.callbacks().onNavigate('untrusted-route');
  assert.equal(routes.length, 1);
  h.callbacks().onRefresh();
  assert.equal(refreshes, 1);
  h.center.update({ ...h.snapshot(), data: null, error: 'Mất kết nối' });
  assert.equal(h.paints.at(-1).assetCount, 1);
  assert.equal(h.paints.at(-1).items.length, 2);
  assert.equal(h.paints.at(-1).error, 'Mất kết nối');
  h.center.update({ ...h.snapshot(), error: '' });
  assert.equal(h.paints.at(-1).items.length, 1);
  h.center.update({ ...h.snapshot(), error: 'Mất kết nối' });
  assert.equal(h.paints.at(-1).items.length, 2);
  start('bob');
  assert.equal(h.paints.at(-1).items.length, 0);
  h.center.update(h.snapshot());
  assert.equal(h.paints.at(-1).unread, 1);
  h.center.reset();
  const count = h.paints.length;
  h.center.publish({ title: 'Late event' });
  h.center.update(h.snapshot());
  assert.equal(h.paints.length, count);
  assert.ok(h.resets() >= 2);
  start('alice');
  h.center.update(h.snapshot());
  assert.equal(h.paints.at(-1).items.find(item => item.kind === 'asset').read, true);
});

test('controller synchronizes read state from another tab without duplicating events', () => {
  const h = harness();
  h.center.start({ username: 'alice', navigate() {}, refresh() {}, icons() {} });
  h.center.update(h.snapshot());
  const key = [...h.storage.keys()][0];
  const saved = JSON.parse(h.storage.get(key));
  Object.values(saved.records).forEach(item => { item.read = true; });
  h.storage.set(key, JSON.stringify(saved));
  h.handlers.storage({ key });
  assert.equal(h.paints.at(-1).unread, 0);
  h.handlers.storage({ key: 'other-account' });
  assert.equal(h.paints.at(-1).unread, 0);
});

test('controller loads shared account notifications and persists their read state on the server', async () => {
  const h = harness();
  const requests = [];
  let isRead = false;
  h.context.window.fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (options.method === 'POST') {
      isRead = true;
      return { ok: true };
    }
    return {
      ok: true,
      json: async () => ({ items: [{
        id: '44', kind: 'asset', title: 'Có cập nhật trạng thái tài sản',
        message: 'staff1 đã cập nhật Camera · CAM-1 · Hư hỏng', label: 'Cập nhật trạng thái',
        level: 'info', target: 'assetCategoryManager', createdAt: Date.now(), read: isRead
      }] })
    };
  };
  h.center.start({ username: 'admin', navigate() {}, refresh() {}, icons() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.paints.at(-1).unread, 1);
  assert.equal(h.paints.at(-1).items[0].id, 'server:44');
  assert.equal(requests[0].options.credentials, 'same-origin');
  h.callbacks().onRead('server:44');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.some(request => request.path === '/api/notifications/44/read'), true);
  assert.equal(h.paints.at(-1).items[0].read, true);
  assert.equal(h.paints.at(-1).unread, 0);
});

test('unread status updates are announced on login and as new events arrive, while login events stay in the bell', async () => {
  const h = harness();
  const announcements = [];
  let items = [
    {
      id: '51', eventType: 'login', kind: 'system', title: 'Đăng nhập thành công',
      message: 'Bạn vừa đăng nhập vào hệ thống.', label: 'Đăng nhập',
      createdAt: Date.now(), read: false
    },
    {
      id: '52', eventType: 'asset-status', kind: 'asset', title: 'Có cập nhật trạng thái tài sản',
      message: 'staff1 đã cập nhật Camera · CAM-1 · Hư hỏng', label: 'Cập nhật trạng thái',
      createdAt: Date.now() - 1, read: false
    }
  ];
  h.context.window.fetch = async () => ({ ok: true, json: async () => ({ items }) });
  h.center.start({
    username: 'admin', navigate() {}, refresh() {}, icons() {},
    announce: received => announcements.push(received)
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(h.paints.at(-1).unread, 2);
  assert.equal(announcements.length, 1);
  assert.deepEqual(announcements[0].map(item => item.id), ['server:52']);
  assert.match(announcements[0][0].message, /CAM-1/);

  items = [...items, {
    id: '53', eventType: 'asset-status', kind: 'asset', title: 'Có cập nhật trạng thái tài sản',
    message: 'staff2 đã cập nhật PC · PC-2 · Bảo trì', label: 'Cập nhật trạng thái',
    createdAt: Date.now() + 1, read: false
  }];
  h.handlers.focus();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(announcements.length, 2);
  assert.equal(announcements[1][0].id, 'server:53');

  h.handlers.focus();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(announcements.length, 2);
});

test('an earlier account feed request cannot block or replace the current account feed', async () => {
  const h = harness();
  const pending = [];
  h.context.window.fetch = () => new Promise(resolve => pending.push(resolve));
  const start = username => h.center.start({ username, navigate() {}, refresh() {}, icons() {} });
  start('alice');
  start('bob');
  assert.equal(pending.length, 2);
  const payload = username => ({
    ok: true,
    json: async () => ({ items: [{
      id: username === 'alice' ? '11' : '22', kind: 'system',
      title: `${username} login`, message: `${username} notification`, label: 'Đăng nhập',
      level: 'info', target: '', createdAt: Date.now(), read: false
    }] })
  });
  pending[1](payload('bob'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.paints.at(-1).items[0].id, 'server:22');
  pending[0](payload('alice'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.paints.at(-1).items[0].id, 'server:22');
});

test('dashboard publishes updates while another page is active and stops when signed out', async () => {
  let callbacks;
  let scope = 'alice:user';
  let renders = 0;
  const updates = [];
  const context = vm.createContext({
    window: {
      DashboardSync: {
        create(options) {
          callbacks = options;
          return { read: () => ({ data: null }), enter() {}, reset() {} };
        }
      },
      DashboardView: { render: () => { renders += 1; } }
    },
    document: { hidden: false }
  });
  vm.runInContext(source('../dashboard.js'), context);
  context.window.AssetDashboard.open({
    getScope: () => scope, isActive: () => false, onData() {},
    onState: state => updates.push(state), root: () => null
  });
  assert.equal(callbacks.isActive(), true);
  callbacks.onChange({ data: { rows: [] }, updatedAt: 100 });
  assert.equal(updates.at(-1).updatedAt, 100);
  assert.equal(renders, 0);
  scope = '';
  assert.equal(callbacks.isActive(), false);
  scope = 'alice:user';
  context.document.hidden = true;
  assert.equal(callbacks.isActive(), false);
});

test('login activation scopes the durable notification feed and restore does not invent another login', () => {
  const app = source('../app.js');
  const start = app.indexOf('function activateUserSession(');
  const implementation = app.slice(start, app.indexOf('async function restoreLoginSession(', start));
  const events = [];
  const scopes = [];
  const starts = [];
  const toastCalls = [];
  const noop = () => {};
  const element = { classList: { add: noop, remove: noop }, style: { setProperty: noop } };
  const context = vm.createContext({
    window: {
      scrollTo: noop,
      NotificationCenter: {
        start: options => { scopes.push(options.username); starts.push(options); },
        publish: value => events.push(value)
      }
    },
    document: { documentElement: {}, body: {} },
    sessionStorage: { getItem: () => null },
    sessionTimeoutConfig: { adminMs: 10000, userMs: 10000 },
    sharedLogin: { begin: () => true },
    sessionTransition: 0, currentUser: null, activePage: 'dashboard', reloadRestorePageKey: 'restore',
    assets: [], handoverRecipients: [], renderAssets: noop, isAdminUser: () => false,
    $: () => element, setLoginSession: noop, renderHeaderMeta: noop, loadStaffDataForCurrentUser: noop,
    updateAdminVisibility: noop, updateModuleVisibility: noop, renderDashboard: noop, refreshIcons: noop,
    showPage: noop, requestAnimationFrame: noop, refreshHandoverDataForCurrentUser: noop,
    refreshSessionTimer: noop, recordActivity: noop, location: { protocol: 'http:' },
    toast: (...args) => toastCalls.push(args)
  });
  vm.runInContext(implementation, context);
  context.activateUserSession({ u: 'alice', name: 'Alice' });
  assert.deepEqual(scopes, ['alice']);
  assert.equal(starts[0].announce, undefined);
  assert.equal(toastCalls.length, 0);
  assert.equal(events.length, 0);
  context.activateUserSession({ u: 'alice', name: 'Alice' }, { restore: true });
  assert.equal(events.length, 0);
  assert.equal(toastCalls.length, 0);
});

test('a successful login does not show a login-status toast', async () => {
  const app = source('../app.js');
  const start = app.indexOf('async function login(event) {');
  const implementation = app.slice(start, app.indexOf('\nfunction logout(', start));
  const usernameInput = { value: 'alice' };
  const passwordInput = { value: 'secret' };
  const accounts = [];
  const notices = [];
  let activated = null;
  const account = { u: 'alice', name: 'Alice', role: 'User' };
  const context = vm.createContext({
    window: { LoginFeedback: { clear() {}, showError(error) { throw error; } } },
    $: selector => selector === '#loginAccount' ? usernameInput : passwordInput,
    sanitizeUsernameInput: value => value,
    location: { protocol: 'http:' },
    serverLogoutPromise: Promise.resolve(),
    sendApi: async path => {
      assert.equal(path, '/api/login');
      return { account };
    },
    normalizeApiAccount: value => value,
    accounts,
    activateUserSession: value => { activated = value; return true; },
    toast: (...args) => notices.push(args)
  });
  vm.runInContext(implementation, context);

  await context.login({ preventDefault() {} });

  assert.equal(activated.name, 'Alice');
  assert.equal(notices.length, 0);
});

test('global toasts use the shared popup and preserve notification-history preferences', () => {
  const app = source('../app.js');
  const start = app.indexOf('function toast(');
  const implementation = app.slice(start, app.indexOf('\nfunction showAssetImportResult(', start));
  const notices = [];
  const history = [];
  const context = vm.createContext({
    currentUser: null,
    window: {
      NotificationPopup: { getShared: () => ({ notify: (message, options) => notices.push({message, options}) }) },
      NotificationCenter: { publish: event => history.push(event) }
    }
  });
  vm.runInContext(implementation, context);

  context.toast('Có thông báo mới: CAM-1 · Hư hỏng', { notify: false, notification: true });

  assert.equal(notices[0].message, 'Có thông báo mới: CAM-1 · Hư hỏng');
  assert.equal(notices[0].options.source, 'Hệ thống');
  assert.equal(notices[0].options.openNotifications, true);
  assert.equal(notices[0].options.durationMs, 10000);
  assert.equal(history.length, 0);
  context.currentUser = { u: 'alice' };
  context.toast('Đã lưu thành công');
  assert.equal(history.length, 1);
  assert.equal(history[0].message, 'Đã lưu thành công');
  context.toast('Lỗi kiểm thử', { notify: false, duration: 9000 });
  assert.equal(notices.length, 3);
  assert.equal(notices[2].options.durationMs, 9000);
  assert.equal(history.length, 1);
});

test('own updates refresh immediately and remote updates use the poll without duplicate popups', async () => {
  const h = harness();
  let poll;
  let interval;
  let items = [];
  let requests = 0;
  h.context.window.setInterval = (callback, delay) => {
    poll = callback;
    interval = delay;
    return 1;
  };
  h.context.window.fetch = async () => {
    requests += 1;
    return { ok: true, json: async () => ({ items }) };
  };
  h.center.start({ username: 'admin', navigate() {}, refresh() {}, icons() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(interval, 5000);
  assert.equal(h.popups.length, 0);
  const own = {
    id: '71', eventType: 'asset-status', kind: 'asset', own: true, actorUsername: 'admin',
    title: 'Có cập nhật trạng thái tài sản', message: 'Bạn đã cập nhật PC · Bảo trì',
    createdAt: Date.now(), read: false
  };
  items = [own];
  h.handlers['asset-inventory-changed']();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.popups.length, 1);
  assert.equal(h.popups[0][0].own, true);
  assert.match(h.popups[0][0].message, /Bạn đã cập nhật/);
  items = [own, { ...own, id: '72', own: false, actorUsername: 'staff1', message: 'staff1 cập nhật Camera' }];
  poll();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.popups.length, 2);
  assert.equal(h.popups[1].length, 1);
  assert.equal(h.popups[1][0].actorUsername, 'staff1');
  poll();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.popups.length, 2);
  h.context.document.hidden = true;
  const beforeHiddenPoll = requests;
  poll();
  assert.equal(requests, beforeHiddenPoll);
  const beforeReset = h.popupResets();
  h.center.reset();
  assert.equal(h.popupResets(), beforeReset + 1);
  h.handlers['asset-inventory-changed']();
  assert.equal(requests, beforeHiddenPoll);
});

test('a mutation during a pending feed schedules a fresh request and cannot miss its status event', async () => {
  const h = harness();
  const pending = [];
  h.context.window.fetch = () => new Promise(resolve => pending.push(resolve));
  h.center.start({ username: 'alice', navigate() {}, refresh() {}, icons() {} });
  h.handlers['asset-inventory-changed']();
  assert.equal(pending.length, 1);
  pending[0]({ ok: true, json: async () => ({ items: [] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1]({ ok: true, json: async () => ({ items: [{
    id: '73', eventType: 'asset-status', kind: 'asset', own: true,
    title: 'Có cập nhật trạng thái tài sản', message: 'Bạn đã cập nhật Camera',
    createdAt: Date.now(), read: false
  }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.popups.length, 1);
  assert.equal(h.popups[0][0].id, 'server:73');
});


test('BCN feed keeps its kind, refreshes after changes, opens deep link and persists namespaced receipts', async () => {
  const h = harness();
  const requests = [];
  const navigations = [];
  const reference = { caseId: 'case-id', eventId: 'event-id', reportDay: '2026-10-28', view: 'updates' };
  let read = false;
  h.context.window.fetch = async (path, options = {}) => {
    requests.push(path);
    if (options.method === 'POST') {
      read = true;
      return { ok: true };
    }
    return { ok: true, json: async () => ({ items: [{ id: 'bcn:44', kind: 'daily-report',
      eventType: 'CASE_DECISION_ADDED', title: 'Bổ sung quyết định', message: 'Hồ sơ cũ',
      dailyReportRef: reference, target: 'dailyReports', createdAt: Date.now(), read }] }) };
  };
  h.center.start({ username: 'compiler', navigate: (...args) => navigations.push(args) });
  await new Promise(resolve => setImmediate(resolve));
  const item = h.paints.at(-1).items[0];
  assert.equal(item.kind, 'daily-report');
  assert.equal(item.id, 'server:bcn:44');
  assert.equal(h.popups.at(-1)[0].eventType, 'CASE_DECISION_ADDED');
  h.callbacks().onNavigate('dailyReports', item);
  assert.equal(navigations[0][1].dailyReportRef, reference);
  h.callbacks().onRead(item.id);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(requests.includes('/api/notifications/bcn%3A44/read'));
  assert.equal(h.paints.at(-1).unread, 0);
  const count = requests.length;
  h.handlers['daily-reports-changed']();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, count + 1);
});
