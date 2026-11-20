import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL('../assets/js/notification-center/' + name, import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const notice = id => ({
  id: `bcn:${id}`, kind: 'daily-report', eventType: 'CASE_RETURNED', title: 'Cần bổ sung',
  message: 'Bổ sung nội dung', target: 'dailyReports', createdAt: Date.now(), read: false
});

function harness() {
  const updates = [];
  const handlers = {};
  let callbacks;
  const window = {
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener: (name, callback) => { handlers[name] = callback; },
    ReturnedReportAttention: {
      create: () => ({ update: items => updates.push(items), reset: () => updates.push([]) })
    },
    NotificationView: {
      create(options) {
        callbacks = options;
        return { update() {}, reset() {}, open() {}, close() {} };
      }
    }
  };
  const context = vm.createContext({ window, document: { getElementById: id => ({ id }) } });
  vm.runInContext(source('model.js'), context);
  vm.runInContext(source('controller.js'), context);
  return {
    window, handlers, updates,
    start: username => window.NotificationCenter.start({ username, icons() {}, navigate() {}, refresh() {} }),
    callbacks: () => callbacks
  };
}

test('only returned report events qualify, excluding other warnings and non-report messages', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(source('returned-attention.js'), context);
  const { isReturned } = context.window.ReturnedReportAttention;
  for (const eventType of ['CASE_RETURNED', 'CASE_SUPPLEMENT_REQUESTED', 'SOURCE_RETURNED',
    'SITUATION_RETURNED', 'WORK_RESULT_RETURNED']) {
    assert.equal(isReturned({ kind: 'daily-report', eventType }), true);
  }
  for (const eventType of ['CASE_SUBMITTED', 'UNLOCK_REJECTED', 'login']) {
    assert.equal(isReturned({ kind: 'daily-report', eventType }), false);
  }
  assert.equal(isReturned({ kind: 'system', eventType: 'CASE_RETURNED' }), false);
});

test('failed synchronization preserves unread returns and a failed read restores the reminder', async () => {
  const h = harness();
  let offline = false;
  h.window.fetch = async (_path, options = {}) => ({
    ok: !offline && options.method !== 'POST', status: 503,
    json: async () => ({ items: [notice(1)] })
  });
  h.start('reporter');
  await flush();
  assert.equal(h.updates.at(-1)[0].read, false);
  offline = true;
  h.handlers.focus();
  await flush();
  assert.equal(h.updates.at(-1)[0].read, false);
  h.callbacks().onRead('server:bcn:1');
  await flush();
  assert.equal(h.updates.at(-1)[0].read, false);
});

test('a delayed failed read cannot restore another account’s returned report reminder', async () => {
  const h = harness();
  let rejectRead;
  let items = [notice(1)];
  h.window.fetch = async (_path, options = {}) => options.method === 'POST'
    ? new Promise((_resolve, reject) => { rejectRead = reject; })
    : { ok: true, json: async () => ({ items }) };
  h.start('first');
  await flush();
  h.callbacks().onRead('server:bcn:1');
  items = [notice(2)];
  h.start('second');
  await flush();
  rejectRead(new Error('Disconnected'));
  await flush();
  assert.equal(h.updates.at(-1).length, 1);
  assert.equal(h.updates.at(-1)[0].id, 'server:bcn:2');
  h.window.NotificationCenter.reset();
  assert.equal(h.updates.at(-1).length, 0);
});
