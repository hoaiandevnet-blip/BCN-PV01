import assert from 'node:assert/strict';

export async function runExtendedChecks({ ok, call, expect, database, body, savedDraft, pvLeader, setNow }) {
  expect((await call(4, '/exports/not-a-uuid/download')).status, 422, 'invalid file reference rejected before storage access');
  expect((await call(2, '/cases', { ...body, occurred_at: 'invalid' })).status,
    422, 'invalid event timestamp returns validation error');
  expect((await ok(2, '/cases?q=' + encodeURIComponent("' OR 1=1 --"))).cases.length,
    0, 'search input remains a bound literal, not SQL');
  expect((await call(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER', unit_id: 11 }, 'PUT')).status,
    422, 'role assignment cannot silently change account unit');
  await ok(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER', unit_id: 10,
    metric_code: 'GENERAL', effective_to: '2026-10-27' }, 'PUT');
  expect((await call(2, '/work-results', { metric_code: 'GENERAL', values: { activities: 1 } })).status,
    403, 'expired metric assignment no longer grants permission');
  await ok(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER', unit_id: 10, metric_code: 'GENERAL' }, 'PUT');
  await ok(1, '/configuration/units/11', { unit_code: 'DON-QA', unit_group: 'DON' }, 'PUT');
  expect((await ok(3, '/scope')).unitGroup, 'DON', 'unit profile overrides ambiguous legacy department names');
  await ok(1, '/user-roles', { user_id: 3, role_code: 'UNIT_REPORTER', unit_id: 11, metric_code: 'DETENTION' }, 'PUT');
  expect((await call(3, '/work-results', { metric_code: 'DETENTION', values: { received: 1 } })).status,
    403, 'DON cannot bypass room-only metrics even with a metric assignment');
  await ok(1, '/configuration/units/11', { unit_code: 'CANG-QA', unit_group: 'CANG' }, 'PUT');
  expect((await call(3, '/work-results', { metric_code: 'DETENTION', values: { received: 1 } })).status,
    403, 'CANG has same metric restriction as DON');
  await ok(1, '/configuration/units/11', { unit_code: 'XA-B-QA', unit_group: 'XA_PHUONG' }, 'PUT');
  expect((await call(2, '/work-results', { metric_code: 'GENERAL', values: { hidden: 9 } })).status,
    422, 'unconfigured metric fields rejected');
  expect((await call(2, '/work-results', { metric_code: 'GENERAL', values: { activities: -1 } })).status,
    422, 'negative metric rejected');
  expect((await call(3, '/work-results', { metric_code: 'GENERAL', values: { activities: 1 } })).status,
    403, 'general metric requires explicit assignment too');
  const statistic = (await ok(4, '/statistics?report_day=2026-10-28')).statistics;
  expect(statistic.verified_metrics['GENERAL:v1'].activities, 2, 'statistics includes only verified metric values');
  const balanced = (await ok(1, '/configuration/metrics', {
    code: 'QA_TOTAL', label: 'Chỉ tiêu đối chiếu giả', owner_groups: ['XA_PHUONG'],
    fields: [{ code: 'total', label: 'Tổng' }, { code: 'first', label: 'Thành phần A' },
      { code: 'second', label: 'Thành phần B' }],
    constraints: [{ total: 'total', parts: ['first', 'second'], operator: 'EQ' }], effective_from: '2026-01-01'
  })).definition;
  await ok(1, '/configuration/metrics/' + balanced.id + '/publish', {});
  await ok(1, '/user-roles', { user_id: 2, role_code: 'UNIT_REPORTER', unit_id: 10, metric_code: 'QA_TOTAL' }, 'PUT');
  expect((await call(2, '/work-results', { metric_code: 'QA_TOTAL', values: { total: 9, first: 1, second: 2 } })).status,
    422, 'published total equation enforced server-side');
  expect((await call(2, '/work-results', { metric_code: 'QA_TOTAL', values: { total: 3, first: 1, second: 2 } })).status,
    201, 'published total equation accepts consistent data');
  const history = await ok(4, `/drafts/${savedDraft.id}/history`);
  expect(history.history[0].snapshot.statistics.selected_cases, 3, 'saved revision aggregate uses selected sources only');
  expect(history.history[0].snapshot.statistics.watermark.length, 3, 'revision records source version watermark');
  const count = await database.query(`select statistics_snapshot from daily_report_exports where report_type='BCN_PV01'`);
  expect(count.rows[0].statistics_snapshot.selected_cases, 3, 'export holds immutable aggregate snapshot');
  let immutable = false;
  try { await database.query(`update daily_report_audit set outcome='CHANGED' where id=(select min(id) from daily_report_audit)`); }
  catch (error) { immutable = error.message.includes('append-only'); }
  expect(immutable, true, 'database rejects audit mutation');
  setNow('2026-10-28T04:00:00Z');
  await ok(2, '/notifications');
  await ok(2, '/notifications');
  const expiry = await database.query(`select count(*)::int as count from daily_report_audit where action='UNLOCK_EXPIRED'`);
  expect(expiry.rows[0].count, 1, 'grant expiry writes audit once despite retry');
  expect((await ok(2, '/unlock-requests')).requests.some(item => item.status === 'EXPIRED'), true,
    'expired grant is visible as expired in UI API');
  setNow('2026-10-28T02:00:00Z');
  const legalBody = { title: 'Luật giả liên kết', document_number: 'QA-LINK', source_uri: 'https://example.invalid/qa',
    checksum: 'fixture-checksum', effective_from: '2026-01-01',
    articles: [{ article_code: 'TEST-LINK', title: 'Không có giá trị pháp luật', business_codes: ['PPHS'] }] };
  expect((await call(1, '/legal/import-drafts', { ...legalBody, articles: [] })).status, 422, 'empty legal catalog rejected');
  const legal = (await ok(1, '/legal/import-drafts', legalBody)).version;
  await ok(5, `/legal/versions/${legal.id}/review`, {});
  expect((await call(5, `/legal/versions/${legal.id}/publish`, { effective_from: '2026-02-01' })).status,
    409, 'publish cannot silently alter reviewed effective date');
  await ok(5, `/legal/versions/${legal.id}/publish`, {});
  const article = (await ok(2, `/legal/articles?version_id=${legal.id}&effective_on=2026-10-28`)).articles[0];
  const linked = (await ok(2, '/cases', { ...body, summary: 'Hồ sơ liên kết pháp luật giả',
    external_reference: 'EXT-QA-1', persons: [{ ...body.persons[0], name: 'Đối tượng giả', reference: 'SUB-QA' }],
    legal_article_id: article.id })).case;
  const detail = await ok(2, `/cases/${linked.id}`);
  expect(detail.case.legal_article_id, article.id, 'case retains exact article version reference');
  expect((await ok(2, '/cases?q=SUB-QA')).cases.some(item => item.id === linked.id), true,
    'registry searches structured subject reference');
  expect((await call(5, `/legal/versions/${legal.id}/rollback`, { reason: 'Thử rút phiên bản đã sử dụng' })).status,
    409, 'linked legal version cannot be rolled back');
  setNow('2026-10-27T02:00:00Z');
  const prior = (await ok(2, '/cases', { ...body, report_day: '2026-10-27', external_reference: 'DUP-QA-REF',
    summary: 'Vụ giả đối chiếu riêng', location_general: 'Vị trí đối chiếu riêng' })).case;
  await ok(2, `/cases/${prior.id}/submit`, {});
  await ok(4, `/cases/${prior.id}/verify`, {});
  setNow('2026-10-28T02:00:00Z');
  const next = (await ok(2, '/cases', { ...body, external_reference: 'DUP-QA-REF',
    summary: 'Diễn biến mới cần đối chiếu', location_general: 'Nơi khác' })).case;
  await ok(2, `/cases/${next.id}/submit`, {});
  await ok(4, `/cases/${next.id}/verify`, {});
  const candidates = (await ok(4, `/duplicates/candidates?case_id=${next.id}`)).candidates;
  expect(candidates.find(item => item.id === prior.id).important, true, 'external reference is important duplicate evidence');
  const source = (await ok(4, '/composer/items?report_day=2026-10-28&unit_id=10')).items
    .find(item => item.stable_code === next.stable_code);
  let draft = (await ok(4, '/drafts', { report_day: '2026-10-28', report_type: 'BCN_PV01' })).draft;
  draft = (await ok(4, `/drafts/${draft.id}/items`, { revision: draft.revision,
    items: [{ ...source, included: true, section_code: 'NOI_DUNG' }] }, 'PUT')).draft;
  expect((await call(4, `/drafts/${draft.id}/exports`, { expected_revision: draft.revision,
    report_type: 'BCN_PV01', leader_id: pvLeader.id })).status, 409, 'important unresolved duplicate blocks official export');
  await ok(4, '/duplicates/decisions', { case_id: next.id, candidate_case_id: prior.id,
    action: 'APPEND_EVENT_TO_EXISTING', reason: 'Bổ sung diễn biến vào vụ cũ theo kiểm thử' });
  const appended = (await ok(2, `/cases/${prior.id}`)).events.find(item => item.event_kind === 'PRIOR_DAY_UPDATE');
  expect(appended.report_day.slice(0, 10), '2026-10-28', 'prior-day append creates current-day event under stable original ID');
  await ok(4, `/events/${appended.id}/verify`, {});
  await ok(2, `/cases/${prior.id}/events`, { report_day: '2026-10-28', narrative: 'Quyết định giả',
    decision_number: 'QD-QA-27', decision_authority: 'Cơ quan giả', decision_date: '2026-10-28' });
  expect((await ok(2, '/cases?from_day=2026-10-27&to_day=2026-10-28&q=QD-QA-27')).cases
    .some(item => item.id === prior.id), true, 'registry searches decision number across days');
  const response = await call(2, '/cases', { ...body, persons: [{ name: '', reference: 'X' }] });
  expect(response.status, 422, 'invalid structured subject rolls back entire intake');
  const record = await database.query(`select count(*)::int as count from daily_report_cases where persons @> $1::jsonb`,
    [JSON.stringify([{ reference: 'X' }])]);
  assert.equal(record.rows[0].count, 0);
}
