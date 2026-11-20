import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, URLSearchParams };
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../assets/js/dashboard-report-units.js', import.meta.url), 'utf8'), context);
const load = context.window.DashboardReportUnits.load;

test('uses server report day, collects all pages and deduplicates authorized units', async () => {
  const paths = [];
  const api = async path => {
    paths.push(path);
    if (path.endsWith('/scope')) return { isAdmin: true, reportDay: '2026-11-05' };
    if (path.endsWith('/units')) return { units: [{ id: 3, name: 'Xã C' }, { id: 2, name: 'Xã B' }] };
    if (path.includes('offset=0')) return { items: [{ unit_id: 2 }, { unit_id: 2 }], next_offset: 1000 };
    if (path.includes('offset=1000')) return { items: [{ unit_id: 3 }, { unit_id: 999 }], next_offset: null };
    throw new Error('unexpected request');
  };
  const result = await load(api, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reportDay, '2026-11-05');
  assert.deepEqual(Array.from(result.units, unit => unit.name), ['Xã B', 'Xã C']);
  assert.equal(paths.filter(path => path.includes('composer/items')).length, 2);
});

test('denied and unavailable states never present a false empty result', async () => {
  let calls = 0;
  const denied = await load(async () => { calls += 1; }, false);
  assert.equal(denied.status, 'denied');
  assert.equal(calls, 0);
  const restricted = await load(async () => ({ roles: ['UNIT_REPORTER'], compilerModules: [] }), true);
  assert.equal(restricted.status, 'denied');
  const failed = await load(async () => { throw new Error('offline'); }, true);
  assert.equal(failed.status, 'error');
});


test('registry submissions are combined and drafts excluded within permitted units', async () => {
  const api = async path => {
    if (path.endsWith('/scope')) return { isAdmin: true, reportDay: '2026-11-05' };
    if (path.endsWith('/units')) return { units: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] };
    if (path.includes('/composer/items')) return { items: [{ unit_id: 1 }], next_offset: null };
    if (path.includes('/cases')) return { cases: [{ unit_id: 2, current_state: 'SUBMITTED' },
      { unit_id: 3, current_state: 'DRAFT' }], next_offset: null };
    throw new Error('unexpected');
  };
  const result = await load(api, true, true);
  assert.deepEqual(Array.from(result.units, unit => unit.name), ['A', 'B']);
});
