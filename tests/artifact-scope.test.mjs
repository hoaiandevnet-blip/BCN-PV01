import test from 'node:test';
import assert from 'node:assert/strict';
import { assertArtifactScope } from '../server/daily-reports/artifact-scope.js';

const id = '9341934a-6ea5-414a-b296-64f7a1a245d6';
const scoped = { roles: [{ role_code: 'PV01_COMPILER', unit_id: 114 }] };
const global = { roles: [{ role_code: 'PV01_COMPILER', unit_id: null }] };
const item = (unit = 114, type = 'CASE_EVENT') => ({
  source_type: type, source_id: id, source_snapshot: { unit_id: unit }
});
const database = (unit = 114) => ({ query: async () => ({ rows: [{ id, unit_id: unit }] }) });
const denied = { status: 403, code: 'SOURCE_SCOPE_REVOKED' };

test('artifact permission covers event, work and situation sources', async () => {
  for (const type of ['CASE_EVENT', 'WORK_RESULT', 'SITUATION']) {
    await assertArtifactScope(database(), scoped, [item(114, type)]);
    await assert.rejects(assertArtifactScope(database(115), scoped, [item(115, type)]), denied);
    await assertArtifactScope(database(115), global, [item(115, type)]);
  }
});

test('moving a source does not reveal its earlier unit or a newly restricted unit', async () => {
  await assert.rejects(assertArtifactScope(database(114), scoped, [item(115)]), denied);
  await assert.rejects(assertArtifactScope(database(115), scoped, [item(114)]), denied);
});

test('missing sources and malformed snapshots fail closed; admin can inspect archives', async () => {
  await assert.rejects(assertArtifactScope({ query: async () => ({ rows: [] }) }, global, [item()]), denied);
  await assert.rejects(assertArtifactScope(database(), scoped, [{ source_type: 'UNKNOWN' }]), denied);
  await assert.rejects(assertArtifactScope(database(), scoped, null), denied);
  await assertArtifactScope(database(), { is_admin: true }, [{ source_type: 'LEGACY' }]);
  await assertArtifactScope(database(), scoped, []);
});
