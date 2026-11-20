import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { registerSmartMeetingRoutes } from '../../server/smart-meeting-routes.js';

const routes = new Map();
let account = null;
let access = { visible: true, is_admin_only: false, has_permission: false };
const pool = { query: async () => ({ rows: [access] }) };
const cameraAuth = { resolve: async () => account };
const app = {
  get(route, ...handlers) {
    routes.set(route, handlers.at(-1));
  }
};
registerSmartMeetingRoutes(app, { pool, cameraAuth, requireSameOrigin: () => {} });

async function request(route, params = {}) {
  const result = { status: 200, headers: {} };
  const response = {
    headersSent: false,
    set(name, value) {
      result.headers[name] = value;
      return response;
    },
    status(code) {
      result.status = code;
      return response;
    },
    json(payload) {
      result.payload = payload;
      return response;
    },
    download(filePath, sourceName) {
      result.filePath = filePath;
      result.sourceName = sourceName;
    }
  };
  await routes.get(route)({ params }, response, error => {
    throw error;
  });
  return result;
}

const endpoint = '/api/smart-meetings/nq57';
const downloadEndpoint = endpoint + '/documents/:documentId/download';
assert.equal((await request(endpoint)).status, 401);
assert.equal((await request(downloadEndpoint, { documentId: 'report' })).status, 401);
account = { id: 1, is_admin: false };
assert.equal((await request(endpoint)).status, 403);
assert.equal((await request(downloadEndpoint, { documentId: 'report' })).status, 403);
access.has_permission = true;
assert.equal((await request(endpoint)).status, 200);
access.is_admin_only = true;
assert.equal((await request(endpoint)).status, 403);
account.is_admin = true;
assert.equal((await request(endpoint)).status, 200);
access.visible = false;
assert.equal((await request(endpoint)).status, 403);
access.visible = true;
console.log('PASS authorization: unsigned, ungranted, granted, admin-only, admin, hidden module');

const response = await request(endpoint);
assert.equal(response.headers['Cache-Control'], 'private, no-store');
const documents = response.payload.documents;
assert.deepEqual(documents.map(document => document.blocks.length), [6, 100, 76, 35]);
assert.equal(documents[1].blocks.filter(block => block.noteNumber).length, 6);
for (const document of documents) {
  const ids = new Set(document.blocks.map(block => block.id));
  assert.equal(ids.size, document.blocks.length);
  for (const block of document.blocks) {
    for (const reference of block.footnoteRefs || []) assert.ok(ids.has(reference));
  }
  const original = await request(downloadEndpoint, { documentId: document.id });
  assert.equal(original.status, 200);
  const bytes = await readFile(original.filePath);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.ok(bytes.length > 1000);
}
assert.equal((await request(downloadEndpoint, { documentId: '__proto__' })).status, 404);
assert.equal((await request(downloadEndpoint, { documentId: 'unknown' })).status, 404);
console.log('PASS documents: 217 blocks, 6 linked footnotes, 4 downloadable originals, invalid IDs rejected');

const context = vm.createContext({ window: {}, Intl });
for (const name of ['smart-meeting-view.js', 'smart-meeting-reader.js']) {
  vm.runInContext(await readFile(new URL('../../assets/js/' + name, import.meta.url), 'utf8'), context);
}
const view = context.window.SmartMeetingView;
const reader = context.window.SmartMeetingReader;
assert.equal(view.escape('<script>&"'), '&lt;script&gt;&amp;&quot;');
const overview = view.renderOverview(documents);
assert.ok(overview.includes('98,19%'));
assert.ok(overview.includes('27,9%'));
for (const match of overview.matchAll(/data-sm-open="([^"]+)"(?:\s+data-sm-block="([^"]+)")?/g)) {
  const document = documents.find(item => item.id === match[1]);
  assert.ok(document, match[1]);
  if (match[2]) assert.ok(document.blocks.some(block => block.id === match[2]), match[2]);
}
for (const document of documents) {
  const html = reader.render(document, documents);
  const count = [...html.matchAll(/data-sm-block-id=/g)].length;
  assert.equal(count, document.blocks.length);
  for (const match of html.matchAll(/data-sm-jump="([^"]+)"/g)) {
    assert.ok(document.blocks.some(block => block.id === match[1]), match[1]);
  }
  assert.ok(html.includes('Hết tài liệu'));
}
console.log('PASS rendering: 4 complete documents, all outline/source links resolve, escaping, derived percentages');
console.log('PASS smart-meeting verification at ' + new Date().toISOString());
