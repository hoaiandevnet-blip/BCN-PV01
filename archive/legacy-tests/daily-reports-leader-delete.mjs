import { randomUUID, createHash } from 'node:crypto';

export async function runLeaderDeleteChecks({ ok, call, expect, database, pvLeader, savedDraft }) {
  const payload = { full_name: 'Lãnh đạo kiểm thử xóa', title: 'Chức danh kiểm thử',
    signer_scope: 'PV01', effective_from: '2026-01-01' };
  const make = async suffix => (await ok(1, '/leaders', { ...payload, full_name: payload.full_name + suffix })).leader;
  const single = await make(' đơn');
  const first = await make(' nhóm 1');
  const second = await make(' nhóm 2');
  for (const user of [0, 2, 4, 5]) {
    const status = user === 0 ? 401 : 403;
    expect((await call(user, `/leaders/${single.id}`, {}, 'DELETE')).status, status,
      `user ${user} cannot delete an individual leader`);
    expect((await call(user, '/leaders', { ids: [first.id, second.id] }, 'DELETE')).status, status,
      `user ${user} cannot bulk-delete leaders`);
  }
  for (const ids of [undefined, [], ['invalid'], [null], single.id, Array(501).fill(single.id)]) {
    expect((await call(1, '/leaders', { ids }, 'DELETE')).status, 422,
      'malformed or oversized leader delete selection is rejected');
  }
  expect((await call(1, '/leaders', { ids: [first.id, randomUUID()] }, 'DELETE')).status, 409,
    'mixed existing and missing batch fails atomically');
  expect((await ok(1, '/leaders')).leaders.some(item => item.id === first.id), true,
    'valid leader in a rejected batch remains available');
  expect((await ok(1, `/leaders/${single.id}`, {}, 'DELETE')).deleted_ids, [single.id],
    'individual delete returns the exact removed ID');
  expect((await call(1, `/leaders/${single.id}`, {}, 'DELETE')).status, 409,
    'repeated delete reports a conflict');
  expect((await call(1, `/leaders/${single.id}`, payload, 'PUT')).status, 404,
    'deleted leader cannot be edited');
  expect((await call(1, `/leaders/${single.id}/archive`, {})).status, 404,
    'deleted leader cannot be archived');
  expect((await call(1, `/leaders/${single.id}/restore`, {})).status, 404,
    'deleted leader cannot be restored through the archive action');
  await ok(1, `/leaders/${second.id}/archive`, {});
  const batch = await ok(1, '/leaders', { ids: [first.id, second.id, first.id] }, 'DELETE');
  expect(batch.deleted_ids.sort(), [first.id, second.id].sort(),
    'bulk delete removes selected active and archived leaders once each');
  expect(batch.deleted_count, 2, 'bulk count excludes duplicate selected IDs');
  for (const endpoint of ['/leaders', '/leaders?include_archived=true']) {
    const items = (await ok(1, endpoint)).leaders;
    expect(items.some(item => [single.id, first.id, second.id].includes(item.id)), false,
      'deleted leaders stay absent including archived listing');
    expect(items.some(item => item.id === pvLeader.id), true, 'unselected leader remains untouched');
  }
  expect((await database.query(`select count(*)::int as count from daily_report_audit
    where action='LEADER_DELETED' and resource_id=any($1::text[])`,
  [[single.id, first.id, second.id]])).rows[0].count, 3, 'each deletion is audited exactly once');

  // The fixture below has an actual Word export; this entire test runs in a disposable schema.
  const snapshot = (await database.query(`select * from daily_report_exports
    where report_type='BCN_PV01' and signer_snapshot->>'id'=$1 order by generated_at limit 1`, [pvLeader.id])).rows[0];
  expect(Boolean(snapshot), true, 'preservation test uses an existing export with this signer');
  const hash = data => createHash('sha256').update(data).digest('hex');
  const before = hash(await ok(4, `/exports/${snapshot.id}/download`));
  const current = (await ok(4, `/drafts/${savedDraft.id}`)).draft;
  await database.query('update daily_report_drafts set signer_id=$2 where id=$1', [current.id, pvLeader.id]);
  await ok(1, `/leaders/${pvLeader.id}`, {}, 'DELETE');
  expect((await database.query('select signer_id from daily_report_drafts where id=$1', [current.id]))
    .rows[0].signer_id, pvLeader.id, 'deletion preserves existing draft foreign keys');
  expect((await call(4, `/drafts/${current.id}/items`, {
    revision: current.revision, items: [], leader_id: pvLeader.id
  }, 'PUT')).status, 422, 'deleted signer cannot be explicitly selected for a draft');
  let newDraft = (await ok(4, '/drafts', { report_day: '2026-10-28', report_type: 'BCN_PV01' })).draft;
  const source = (await ok(4, '/composer/items?report_day=2026-10-28')).items
    .find(item => item.source_type === 'WORK_RESULT');
  expect(Boolean(source), true, 'export rejection is checked using a verified work result');
  newDraft = (await ok(4, `/drafts/${newDraft.id}/items`, {
    revision: newDraft.revision, items: [{ ...source, included: true, sort_index: 0 }]
  }, 'PUT')).draft;
  const rejected = await call(4, `/drafts/${newDraft.id}/exports`, {
    expected_revision: newDraft.revision, report_type: 'BCN_PV01', leader_id: pvLeader.id
  });
  expect(rejected.status, 422, 'deleted signer cannot be selected for a new export');
  expect(rejected.data.code, 'SIGNER_REQUIRED', 'new export is rejected specifically because the signer was deleted');
  expect((await database.query('select * from daily_report_exports where id=$1', [snapshot.id])).rows[0], snapshot,
    'deletion preserves the complete immutable export record and signer snapshot');
  expect(hash(await ok(4, `/exports/${snapshot.id}/download`)), before,
    'the historical Word download is byte-for-byte identical after signer deletion');
}
