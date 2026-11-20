import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/standalone/session-binding.js', import.meta.url), 'utf8');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});
function harness(fetch) {
  const events = [];
  const window = { fetch, dispatchEvent: event => events.push(event.type) };
  vm.runInNewContext(source, { window, Headers, CustomEvent });
  window.BcnSession.setAccount({ id: '3' });
  return { session: window.BcnSession, events };
}

test('an old tab cannot retry a request as another signed-in account', async () => {
  const requests = [];
  const { session, events } = harness(async (path, options) => {
    requests.push({ path, expected: new Headers(options.headers).get('X-BCN-Account-Id') });
    return json({}, 401);
  });
  await assert.rejects(session.fetch('/api/notifications'), { code: 'ACCOUNT_SESSION_CHANGED' });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.expected === '3'));
  assert.deepEqual(events, ['bcn-session-expired']);
});

test('an expired request retries only after confirming the renewed cookie belongs to the same account', async () => {
  let attempts = 0;
  const { session, events } = harness(async path => {
    if (path === '/api/session') return json({ account: { id: '3' } });
    attempts += 1;
    return attempts === 1 ? json({}, 401) : json({ items: ['own notification'] });
  });
  const response = await session.fetch('/api/notifications');
  assert.deepEqual(await response.json(), { items: ['own notification'] });
  assert.equal(attempts, 2);
  assert.deepEqual(events, []);
});

test('responses from the previous account are rejected even if their JSON finishes after switching accounts', async () => {
  let finish;
  const { session } = harness(async () => ({ status: 200, json: () => new Promise(resolve => { finish = resolve; }) }));
  const response = await session.fetch('/api/notifications');
  const body = response.json();
  session.setAccount({ id: '4' });
  finish({ items: ['previous account'] });
  await assert.rejects(body, { code: 'ACCOUNT_SESSION_CHANGED' });
});

test('the session probe waits for an in-progress password change before retrying', async () => {
  let finishRotation;
  let attempts = 0;
  let probes = 0;
  const { session, events } = harness(async path => {
    if (path === '/api/change-password') return new Promise(resolve => { finishRotation = resolve; });
    if (path === '/api/session') {
      probes += 1;
      return json({ account: { id: '3' } });
    }
    return ++attempts === 1 ? json({}, 401) : json({ items: [] });
  });
  const rotating = session.fetch('/api/change-password', { method: 'POST' });
  const feed = session.fetch('/api/notifications');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(probes, 0);
  finishRotation(json({ ok: true }));
  await rotating;
  assert.equal((await feed).status, 200);
  assert.equal(probes, 1);
  assert.deepEqual(events, []);
});
