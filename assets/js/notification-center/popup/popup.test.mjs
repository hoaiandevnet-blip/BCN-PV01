import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./view.js', import.meta.url), 'utf8');

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.events = new Map();
    this.dataset = {};
    this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value),
      remove: value => this.classes.delete(value)
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...nodes) {
    nodes.forEach(node => {
      node.remove();
      node.parent = this;
      node.parentElement = this;
      this.children.push(node);
    });
  }

  replaceChildren() {
    this.children.forEach(node => { node.parent = null; });
    this.children = [];
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
    this.parentElement = null;
  }

  contains(node) {
    return node === this || this.children.some(child => child.contains(node));
  }

  addEventListener(name, listener) {
    this.events.set(name, listener);
  }

  fire(name, extra = {}) {
    this.events.get(name)?.({ target: this, ...extra });
  }
}

function setup({ reduced = false } = {}) {
  let now = 0;
  let nextId = 0;
  let opened = 0;
  const sounds = [];
  const timers = new Map();
  const frames = new Map();
  const body = new Element('body');
  const documentEvents = new Map();
  const document = {
    body,
    activeElement: body,
    addEventListener: (name, callback) => documentEvents.set(name, callback),
    createElement: name => new Element(name),
    createElementNS: (namespace, name) => new Element(name),
    getElementById: () => null
  };
  const window = {
    NotificationSound: { play(options) { sounds.push(options); }, reset() {} },
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    matchMedia: () => ({ matches: reduced })
  };
  const context = vm.createContext({ window, document, Date: { now: () => now } });
  vm.runInContext(source, context);
  const popup = window.NotificationPopup.create({ onOpen: () => { opened += 1; } });
  const host = body.children[0];
  function advance(ms) {
    const target = now + ms;
    while (true) {
      const entry = [...timers.entries()].sort((left, right) => left[1].due - right[1].due)[0];
      if (!entry || entry[1].due > target) break;
      timers.delete(entry[0]);
      now = entry[1].due;
      entry[1].callback();
    }
    now = target;
  }
  function paint() {
    for (let index = 0; index < 2; index += 1) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    }
  }
  return {
    popup,
    host,
    advance,
    paint,
    timers,
    frames,
    sounds,
    document,
    documentEvents,
    opened: () => opened,
    card: () => host.children[0]
  };
}

function item(id, extra = {}) {
  return { id, eventType: 'asset-status', title: `Tài sản ${id}`, message: 'Đã cập nhật', ...extra };
}

test('new business batches sound while an older card is paused and never sound twice on display', () => {
  const h = setup();
  h.popup.notify('Thông báo đang được đọc');
  h.paint();
  h.card().fire('pointerenter');
  assert.equal(h.sounds.length, 1);
  h.popup.enqueue([item('bcn:new', { kind: 'daily-report' })]);
  assert.equal(h.sounds.length, 2, 'new batch sounds immediately while waiting in the queue');
  assert.equal(h.sounds[1].isCurrent(), true);
  h.popup.enqueue([item('bcn:new', { kind: 'daily-report' })]);
  assert.equal(h.sounds.length, 2, 'polling the same event does not sound again');
  find(h.card(), 'notification-popup-close').fire('click');
  h.advance(320);
  h.paint();
  assert.equal(h.sounds.length, 2, 'showing the queued card does not replay its sound');
  h.popup.reset();
  assert.equal(h.sounds[1].isCurrent(), false, 'pending audio cannot leak into the next account');
});

test('one popup host follows full screen and returns to the body without losing the visible message', () => {
  const h = setup();
  h.popup.notify('Đã lưu ghi chú');
  h.paint();
  const card = h.card();
  const surface = new Element('div');
  h.document.fullscreenElement = surface;
  h.documentEvents.get('fullscreenchange')();
  assert.equal(h.host.parentElement, surface);
  assert.equal(h.card(), card);
  assert.equal(h.document.body.children.length, 0);
  h.document.fullscreenElement = null;
  h.documentEvents.get('fullscreenchange')();
  assert.equal(h.host.parentElement, h.document.body);
  assert.equal(h.card(), card);
  assert.equal(h.document.body.children.length, 1);
  assert.equal(surface.children.length, 0);
});

function find(node, className) {
  if (node.className === className) return node;
  for (const child of node.children) {
    const result = find(child, className);
    if (result) return result;
  }
  return null;
}

test('groups each incoming batch, deduplicates IDs and displays subsequent batches in FIFO order', () => {
  const h = setup();
  h.popup.enqueue([item(1), item(2), item(2)]);
  h.popup.enqueue([item(2), item(3)]);
  assert.equal(h.host.children.length, 1);
  assert.equal(find(h.card(), 'notification-popup-summary').textContent, 'và 1 cập nhật khác');
  assert.equal(find(h.card(), 'notification-popup-open').disabled, true);
  h.paint();
  assert.equal(h.card().inert, false);
  h.advance(6499);
  assert.equal(h.card().classes.has('notification-popup-exiting'), false);
  h.advance(1);
  assert.equal(h.card().inert, true);
  h.advance(320);
  h.paint();
  assert.equal(find(h.card(), 'notification-popup-title').textContent, 'Tài sản 3');
  h.advance(6820);
  assert.equal(h.host.children.length, 0);
  h.popup.enqueue([item(1), item(2), item(3)]);
  assert.equal(h.host.children.length, 0);
});

test('hover and keyboard focus pause independently and resume only the remaining duration', () => {
  const h = setup();
  h.popup.enqueue([item(1)]);
  h.paint();
  h.advance(2000);
  h.card().fire('pointerenter');
  h.card().fire('focusin');
  h.advance(10000);
  h.card().fire('pointerleave');
  h.advance(10000);
  assert.equal(h.card().inert, false);
  h.card().fire('focusout', { relatedTarget: null });
  h.advance(4499);
  assert.equal(h.card().inert, false);
  h.advance(1);
  assert.equal(h.card().inert, true);
});

test('open invokes the callback once and closes; close never invokes open', () => {
  const h = setup();
  h.popup.enqueue([item(1)]);
  h.popup.enqueue([item(2)]);
  h.paint();
  find(h.card(), 'notification-popup-open').fire('click');
  assert.equal(h.opened(), 1);
  assert.equal(find(h.card(), 'notification-popup-open').disabled, true);
  h.advance(320);
  h.paint();
  find(h.card(), 'notification-popup-close').fire('click');
  h.advance(320);
  assert.equal(h.opened(), 1);
  assert.equal(h.host.children.length, 0);
});

test('reset cancels entry, display and exit work and allows IDs in the next account', () => {
  const h = setup();
  h.popup.enqueue([item(1)]);
  h.popup.enqueue([item(2)]);
  h.popup.reset();
  h.paint();
  h.advance(20000);
  assert.equal(h.host.children.length, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  h.popup.enqueue([item(1)]);
  h.paint();
  find(h.card(), 'notification-popup-close').fire('click');
  h.popup.reset();
  h.popup.enqueue([item(1)]);
  h.paint();
  h.advance(320);
  assert.equal(h.host.children.length, 1);
  assert.equal(h.card().inert, false);
  h.popup.reset();
  assert.equal(h.timers.size, 0);
});

test('untrusted title/message stay literal text, invalid and unrelated events do not display', () => {
  const h = setup();
  h.popup.enqueue([null, { id: 1, eventType: 'login' }, item(null), item('')]);
  assert.equal(h.host.children.length, 0);
  const unsafe = '<img src=x onerror=alert(1)>';
  h.popup.enqueue([item('safe', { title: unsafe, message: unsafe })]);
  assert.equal(find(h.card(), 'notification-popup-title').textContent, unsafe);
  assert.equal(find(h.card(), 'notification-popup-title').children.length, 0);
  assert.equal(find(h.card(), 'notification-popup-message').textContent, unsafe);
});

test('reduced motion removes dismissed content without an animation delay', () => {
  const h = setup({ reduced: true });
  h.popup.enqueue([item(1)]);
  h.paint();
  find(h.card(), 'notification-popup-close').fire('click');
  h.advance(0);
  assert.equal(h.host.children.length, 0);
});


test('BCN decision update uses its own popup label and does not get filtered as a non-asset event', () => {
  const h = setup();
  h.popup.enqueue([item('bcn:1', { kind: 'daily-report', eventType: 'CASE_DECISION_ADDED',
    title: 'Đơn vị bổ sung quyết định', message: 'Hồ sơ 2020, báo cáo hôm nay' })]);
  h.paint();
  assert.equal(find(h.card(), 'notification-popup-kicker').textContent, 'BÁO CÁO NGÀY');
  assert.equal(find(h.card(), 'notification-popup-title').textContent, 'Đơn vị bổ sung quyết định');
  assert.equal(find(h.card(), 'notification-popup-close').attributes.get('aria-label'),
    'Đóng thông báo Báo cáo ngày');
});

test('transient messages and business events share the queue without overlapping or changing event content', () => {
  const h = setup();
  const unsafe = '<img src=x onerror=alert(1)>';
  h.popup.notify('Phải gắn đơn vị công tác.', { source: 'Báo cáo ngày', durationMs: 1000 });
  h.popup.enqueue([item('server:next')]);
  h.popup.notify(unsafe, { source: 'Họp thông minh' });
  h.paint();
  assert.equal(h.host.children.length, 1);
  assert.equal(h.card().dataset.level, 'warning');
  assert.equal(find(h.card(), 'notification-popup-kicker').textContent, 'Báo cáo ngày');
  assert.equal(find(h.card(), 'notification-popup-open'), null);
  assert.equal(find(h.card(), 'notification-popup-pending').textContent, 'Còn 2 thông báo đang chờ');
  h.advance(1320);
  h.paint();
  assert.equal(find(h.card(), 'notification-popup-title').textContent, 'Tài sản server:next');
  find(h.card(), 'notification-popup-close').fire('click');
  h.advance(320);
  h.paint();
  assert.equal(find(h.card(), 'notification-popup-message').textContent, unsafe);
  assert.equal(find(h.card(), 'notification-popup-message').children.length, 0);
});

test('duplicate transient messages are coalesced only while pending and account reset removes every source', () => {
  const h = setup();
  h.popup.notify('Đã lưu');
  h.popup.notify('Đã lưu');
  h.popup.notify('Tiếp theo');
  h.popup.notify('Tiếp theo');
  h.paint();
  assert.equal(h.card().dataset.level, 'success');
  assert.equal(find(h.card(), 'notification-popup-pending').textContent, 'Còn 1 thông báo đang chờ');
  h.popup.reset();
  h.advance(20000);
  h.paint();
  assert.equal(h.host.children.length, 0);
  assert.equal(h.timers.size, 0);
  h.popup.notify('Đã lưu');
  h.paint();
  assert.equal(find(h.card(), 'notification-popup-message').textContent, 'Đã lưu');
});

test('transient popup keeps its requested lifetime when reading pauses and supports the globe action', () => {
  const h = setup();
  h.popup.notify('Thông báo thử', { durationMs: 1000, openNotifications: true });
  h.paint();
  h.advance(300);
  h.card().fire('pointerenter');
  h.advance(2000);
  assert.equal(h.card().inert, false);
  h.card().fire('pointerleave');
  h.advance(699);
  assert.equal(h.card().inert, false);
  find(h.card(), 'notification-popup-open').fire('click');
  assert.equal(h.opened(), 1);
  h.advance(320);
  assert.equal(h.host.children.length, 0);
});
