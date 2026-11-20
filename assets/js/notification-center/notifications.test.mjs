import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const load = name => readFileSync(new URL(name, import.meta.url), 'utf8');

function setup({ failRead = false, failWrite = false } = {}) {
  const values = new Map();
  let now = 1000;
  const storage = {
    getItem(key) {
      if (failRead) throw new Error('read blocked');
      return values.get(key) || null;
    },
    setItem(key, value) {
      if (failWrite) throw new Error('write blocked');
      values.set(key, value);
    }
  };
  const context = vm.createContext({ window: {}, Intl, Date });
  vm.runInContext(load('../dashboard-data.js'), context);
  vm.runInContext(load('model.js'), context);
  const model = context.window.NotificationModel.create({ storage, now: () => now });
  const row = (id, status = 'Hư hỏng', extra = {}) => ({
    id, source: 'assets', code: `PC-${id}`, name: 'Máy tính', type: 'PC', status, ...extra
  });
  const reconcile = (rows, pending = 0) => model.reconcile({ rows, stations: { pending } });
  return {
    model,
    context,
    row,
    reconcile,
    values,
    setTime(value) { now = value; },
    restore() { return context.window.NotificationModel.create({ storage, now: () => now }); }
  };
}

test('account warnings persist independently and a new instance restores read state', () => {
  const h = setup();
  h.model.setScope('alice');
  h.reconcile([h.row(1)]);
  const id = h.model.snapshot().items[0].id;
  h.model.markRead(id);
  assert.equal(h.model.snapshot().unread, 0);
  const next = h.restore();
  next.setScope('alice');
  next.reconcile({ rows: [h.row(1)], stations: { pending: 0 } });
  assert.equal(next.snapshot().unread, 0);
  next.setScope('bob');
  next.reconcile({ rows: [h.row(1)], stations: { pending: 0 } });
  assert.equal(next.snapshot().unread, 1);
});

test('regular asset IDs stay stable when the union is reordered', () => {
  const h = setup();
  h.model.setScope('alice');
  const first = h.context.window.DashboardData.regular([
    { id: 1, category: 'PC', asset_code: 'PC-1', status: 'Hư hỏng' },
    { id: 2, category: 'PC', asset_code: 'PC-2', status: 'Bảo trì' }
  ]);
  h.reconcile(first);
  h.model.markRead(h.model.snapshot().items[0].id);
  h.reconcile([...first].reverse());
  assert.equal(h.model.snapshot().unread, 1);
  const readItem = h.model.snapshot().items.find(item => item.read);
  assert.match(readItem.title, /PC-1|PC-2/);
});

test('changed alerts become unread, resolved alerts disappear, and reopened alerts notify again', () => {
  const h = setup();
  h.model.setScope('alice');
  h.reconcile([h.row(1, 'Bảo trì')]);
  const id = h.model.snapshot().items[0].id;
  h.model.markRead(id);
  assert.equal(h.model.snapshot().unread, 0);
  h.reconcile([h.row(1, 'Hư hỏng')]);
  assert.equal(h.model.snapshot().unread, 1);
  assert.equal(h.model.snapshot().items[0].level, 'danger');
  h.model.markRead(id);
  h.reconcile([h.row(1, 'Đang sử dụng')]);
  assert.equal(h.model.snapshot().items.some(item => item.id === id), false);
  h.setTime(2000);
  h.reconcile([h.row(1, 'Hư hỏng')]);
  assert.equal(h.model.snapshot().unread, 1);
});

test('quantities, station status and stable target links represent the real dashboard snapshot', () => {
  const h = setup();
  h.model.setScope('admin');
  h.reconcile([h.row(1, 'Hư hỏng', { quantity: 4, source: 'equipment' })], 2);
  const state = h.model.snapshot();
  assert.equal(state.assetCount, 4);
  assert.equal(state.items.length, 2);
  const equipment = state.items.find(item => item.kind === 'asset' && item.id !== 'stations:pending');
  assert.match(equipment.message, /4 tài sản/);
  assert.equal(equipment.target, 'tttcAssetCategories');
  assert.equal(state.items.find(item => item.id === 'stations:pending').target, 'stationHandovers');
});

test('system events deduplicate, keep a useful history and mark all items read', () => {
  const h = setup();
  h.model.setScope('admin');
  h.model.publish({ title: 'Đăng nhập', message: 'Xin chào' });
  h.setTime(4000);
  h.model.publish({ title: 'Đăng nhập', message: 'Xin chào' });
  assert.equal(h.model.snapshot().items.length, 1);
  for (let index = 0; index < 45; index += 1) {
    h.setTime(10000 + index * 9000);
    h.model.publish({ title: `Sự kiện ${index}`, message: 'Đã cập nhật' });
  }
  assert.equal(h.model.snapshot().items.length, 46);
  h.model.markAllRead();
  assert.equal(h.model.snapshot().unread, 0);
});

test('corrupt or unavailable storage fails visibly without losing in-memory behavior', () => {
  const badJson = setup();
  badJson.values.set('ttttch.notifications.v1:alice', '{invalid');
  badJson.model.setScope('alice');
  badJson.reconcile([badJson.row(1)]);
  assert.equal(badJson.model.snapshot().unread, 1);
  const blocked = setup({ failRead: true, failWrite: true });
  blocked.model.setScope('alice');
  blocked.reconcile([blocked.row(1)]);
  assert.equal(blocked.model.snapshot().unread, 1);
  assert.equal(blocked.model.snapshot().storageAvailable, false);
  blocked.model.publish({ title: '<script>Unsafe</script>', message: '<b>Text only</b>' });
  assert.equal(blocked.model.snapshot().items.some(item => item.title.startsWith('<script>')), true);
});

test('every camera catalog alert opens the regular catalog while equipment stays in TTTC', () => {
  const h = setup();
  h.model.setScope('admin');
  const types = ['CAMERA LPR', 'CAMERA PTZ', 'TBOX', 'TTV-GLM-LPR', 'TTV-GLM-PTZ'];
  h.reconcile(types.map((type, index) => h.row(index, 'Hư hỏng', { source: 'camera', type }))
    .concat(h.row(99, 'Bảo trì', { source: 'equipment', type: 'Xe tác chiến' })));
  const items = h.model.snapshot().items;
  assert.equal(items.length, 6);
  for (const type of types) {
    const item = items.find(entry => entry.message.startsWith(type));
    assert.equal(item.target, 'assetCategoryManager', type);
  }
  assert.equal(items.find(entry => entry.message.startsWith('Xe tác chiến')).target, 'tttcAssetCategories');
});
