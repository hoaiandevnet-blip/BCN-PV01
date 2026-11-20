import { ensureClassificationSchema } from '../server/daily-reports/classifications.js';

export async function runClassificationChecks({ ok, call, expect, database, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const endpoint = '/legal/entry-options?effective_on=2026-10-28&business_code=';
  const drugs = (await ok(2, endpoint + 'MA_TUY')).articles;
  const criminal = (await ok(2, endpoint + 'PPHS')).articles;
  const selection = article => article.source_kind === 'REFERENCE'
    ? { legal_reference_id: article.reference_id } : { legal_article_id: article.id };
  const drugA = drugs.find(article => article.article_code === '249' && !article.clause_code);
  const drugB = drugs.find(article => article.article_code === '249' && article.clause_code === '2');
  const criminalA = criminal.find(article => article.article_code === '173');
  const criminalB = criminal.find(article => article.article_code === '174');
  const classifications = [
    { business_code: 'PPHS', legal_selections: [selection(criminalA), selection(criminalB)] },
    { business_code: 'MA_TUY', legal_selections: [selection(drugA), selection(drugB)] }
  ];
  const input = { ...body, classifications, summary: 'QA-MULTI-LAW hai hệ và bốn điều khoản' };
  const created = (await ok(2, '/cases', input)).case;
  let detail = (await ok(2, `/cases/${created.id}`)).case;
  expect(detail.classifications.map(group => [group.business_code, group.legal_selections.length]),
    [['PPHS', 2], ['MA_TUY', 2]], 'one case saves multiple systems with multiple articles and clauses in each');
  expect(detail.classifications[1].legal_selections[1].article_snapshot.clause_code, '2',
    'published clause metadata is captured on the server');
  expect(detail.business_code, 'PPHS', 'legacy primary business remains compatible');
  expect(detail.legal_reference.article_code, '173', 'legacy primary article remains compatible');
  expect((await call(2, `/cases/${created.id}`, { version: detail.version,
    ...selection(criminalA) }, 'PATCH')).status, 422, 'old client cannot silently discard additional selections');
  for (const code of ['PPHS', 'MA_TUY']) {
    expect((await ok(2, `/cases?business_code=${code}&q=QA-MULTI-LAW`)).cases
      .filter(item => item.id === created.id).length, 1, `${code} filter finds the same case exactly once`);
  }
  expect((await call(3, `/cases/${created.id}`)).status, 404, 'multi-system case respects reporting-unit scope');
  const invalid = [[], {}, [null], [{ business_code: 'BAD', legal_selections: [] }],
    [classifications[0], { ...classifications[0], business_code: 'TTXH' }],
    [{ business_code: 'MA_TUY', legal_selections: [selection(criminalA)] }],
    [{ business_code: 'PPHS', legal_selections: [selection(criminalA), selection(criminalA)] }],
    [{ business_code: 'PPHS', legal_selections: [{ legal_article_id: 'bad-id' }] }],
    [{ business_code: 'PPHS', legal_selections: [{}] }],
    [{ business_code: 'PPHS', legal_selections: Array(101).fill(selection(criminalA)) }]];
  for (const value of invalid) {
    expect((await call(2, '/cases', { ...input, classifications: value })).status, 422,
      'reject empty, invalid, duplicate, mismatched and oversized classifications');
    expect((await call(2, `/cases/${created.id}`, { version: detail.version, classifications: value }, 'PATCH')).status,
      422, 'invalid classification edit is rejected atomically');
  }
  expect((await ok(2, `/cases/${created.id}`)).case.version, detail.version,
    'invalid edits leave original version and all selections unchanged');
  await ok(2, `/cases/${created.id}`, { version: detail.version, summary: input.summary + ' sửa nội dung' }, 'PATCH');
  let updated = (await ok(2, `/cases/${created.id}`)).case;
  expect(updated.classifications, detail.classifications, 'partial edit preserves every system and immutable legal reference');
  const reduced = [classifications[1], { ...classifications[0], legal_selections: [selection(criminalB)] }];
  await ok(2, `/cases/${created.id}`, { version: updated.version, classifications: reduced }, 'PATCH');
  updated = (await ok(2, `/cases/${created.id}`)).case;
  expect(updated.business_code, 'MA_TUY', 'primary business follows reordered systems');
  expect(updated.classifications[1].legal_selections.length, 1, 'remove one article without losing another system');
  const other = { business_code: 'TINH_HINH_KHAC', legal_selections: [] };
  expect((await call(2, '/cases', { ...input, classifications: [...classifications, other] })).status, 422,
    'adding other situations makes case title mandatory even when it is not the first system');
  const titled = (await ok(2, '/cases', { ...input, classifications: [...classifications, other],
    title: 'QA-MULTI tình hình khác' })).case;
  await ok(2, `/cases/${titled.id}`, { version: titled.version, classifications }, 'PATCH');
  expect((await ok(2, `/cases/${titled.id}`)).case.title, '', 'removing other system clears its inapplicable title');
  expect((await call(5, `/legal/versions/${drugA.version_id}/rollback`, { reason: 'QA check usage' })).status, 409,
    'published version linked only through secondary system cannot be rolled back');
  await ok(2, `/cases/${created.id}/submit`, {});
  detail = await ok(2, `/cases/${created.id}`);
  expect(detail.submissions[0].snapshot.classifications, updated.classifications,
    'submission snapshot retains all groups and legal selections');
  expect((await call(2, `/cases/${created.id}`, { version: detail.case.version, classifications }, 'PATCH')).status,
    409, 'submitted multi-system case remains immutable');
  await ok(4, `/cases/${created.id}/verify`, {});
  const source = (await ok(4, '/composer/items?report_day=2026-10-28')).items
    .find(item => item.stable_code === created.stable_code);
  expect(source.classifications, updated.classifications, 'composer receives all systems on a single source');
  let draft = (await ok(4, '/drafts', { report_day: '2026-10-28', report_type: 'BCN_PV01' })).draft;
  draft = (await ok(4, `/drafts/${draft.id}/items`, { revision: draft.revision, items: [
    { source_type: 'CASE_EVENT', source_id: source.source_id, included: true, section_code: 'NOI_DUNG' }
  ] }, 'PUT')).draft;
  expect(draft.statistics_snapshot.selected_cases, 1, 'four legal selections still count as one case');
  const saved = await ok(4, `/drafts/${draft.id}`);
  expect(saved.items.find(item => item.included).source_snapshot.classifications, updated.classifications,
    'report source snapshot keeps every selected article and clause');

  const legacy = (await ok(2, '/cases', { ...body, business_code: 'MA_TUY', ...selection(drugA) })).case;
  await database.query(`update daily_report_cases set classifications='[]' where id=$1`, [legacy.id]);
  await ensureClassificationSchema(database);
  await ensureClassificationSchema(database);
  const migrated = (await ok(2, `/cases/${legacy.id}`)).case;
  expect(migrated.classifications[0].legal_selections[0].legal_article_id, drugA.id,
    'idempotent additive migration preserves existing legal foreign key');
  expect(migrated.version, legacy.version, 'migration does not change legacy case versions');
}
