export async function runLegalEntryChecks({ ok, call, expect, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const endpoint = '/legal/entry-options?effective_on=2026-10-28&business_code=';
  expect((await call(0, endpoint + 'MA_TUY')).status, 401, 'entry legal options require authentication');
  expect((await call(2, endpoint + 'UNKNOWN')).status, 422, 'entry legal options reject unknown business code');
  const options = (await ok(2, endpoint + 'MA_TUY')).articles;
  expect(options.length, 14, 'drug entry offers all fourteen bundled drug articles');
  expect(options.every(item => item.business_codes.includes('MA_TUY')), true, 'options match the chosen business');
  const article = options.find(item => item.article_code === '249');
  const referenceId = article.reference_id;
  const input = { ...body, business_code: 'MA_TUY', legal_reference_id: referenceId };
  expect((await call(2, '/cases', { ...input, business_code: 'PPHS' })).status, 422,
    'server rejects a bundled reference from another business');
  expect((await call(2, '/cases', { ...input, legal_reference_id: 'blhs-135-2025:9999' })).status, 422,
    'server rejects invented bundled references');
  expect((await call(2, '/cases', { ...input,
    legal_article_id: '11111111-1111-4111-8111-111111111111' })).status, 422,
  'server rejects simultaneous published and bundled selections');
  const created = (await ok(2, '/cases', { ...input,
    legal_reference: { title: 'FORGED CLIENT TITLE', source_sha256: 'forged' } })).case;
  let detail = (await ok(2, `/cases/${created.id}`)).case;
  expect(detail.legal_article_id, null, 'bundled choice does not impersonate an approved legal version');
  expect(detail.legal_reference.article_code, '249', 'created case retains chosen article');
  expect(detail.legal_reference.title, article.title, 'snapshot is derived from trusted server bundle');
  expect(detail.legal_reference.source_sha256.length, 64, 'snapshot includes original PDF checksum');
  expect((await call(3, `/cases/${created.id}`)).status, 404, 'source reference remains behind case unit scope');
  const snapshot = detail.legal_reference;
  await ok(2, `/cases/${created.id}`, { version: detail.version, summary: 'Sửa nội dung giả giữ điều luật' }, 'PATCH');
  detail = (await ok(2, `/cases/${created.id}`)).case;
  expect(detail.legal_reference, snapshot, 'ordinary edits preserve the original source snapshot');
  await ok(2, `/cases/${created.id}`, { version: detail.version, legal_reference_id: null,
    legal_article_id: null }, 'PATCH');
  detail = (await ok(2, `/cases/${created.id}`)).case;
  expect(detail.legal_reference, null, 'clearing selection removes the reference');
  await ok(2, `/cases/${created.id}`, { version: detail.version, legal_reference_id: referenceId }, 'PATCH');

  const version = (await ok(1, '/legal/import-drafts', { title: 'Luật kiểm thử lựa chọn — dữ liệu giả',
    document_number: 'QA-ENTRY', source_uri: 'https://example.invalid/entry', checksum: 'qa-entry',
    effective_from: '2026-01-01', articles: [
      { article_code: '249', title: 'Điều giả đã thẩm định', business_codes: ['MA_TUY'] },
      { article_code: '249', clause_code: '2', title: 'Khoản giả đã thẩm định', business_codes: ['MA_TUY'] },
      { article_code: 'FUTURE-QA', title: 'Điều giả tương lai', business_codes: ['MA_TUY'],
        effective_from: '2027-01-01' },
      { article_code: 'EXPIRED-QA', title: 'Điều giả hết hiệu lực', business_codes: ['MA_TUY'],
        effective_to: '2026-01-02' }
    ] })).version;
  expect((await ok(1, endpoint + 'MA_TUY')).articles.some(item => item.document_number === 'QA-ENTRY'), false,
    'even Admin cannot select draft law as an approved entry');
  await ok(5, `/legal/versions/${version.id}/review`, {});
  await ok(5, `/legal/versions/${version.id}/publish`, {});
  const published = (await ok(2, endpoint + 'MA_TUY')).articles;
  const approved = published.find(item => item.article_code === '249' && !item.clause_code);
  expect(approved.source_kind, 'PUBLISHED', 'approved mapping takes precedence over bundled reference');
  expect(published.filter(item => item.article_code === '249').length, 2,
    'approved whole article and clause are distinct, without duplicate bundle option');
  expect(published.some(item => ['FUTURE-QA', 'EXPIRED-QA'].includes(item.article_code)), false,
    'future and expired approved articles are excluded from entry options');
  detail = (await ok(2, `/cases/${created.id}`)).case;
  expect(detail.legal_reference, snapshot, 'publishing a catalogue does not rewrite saved references');
  await ok(2, `/cases/${created.id}/submit`, {});
  const submitted = await ok(2, `/cases/${created.id}`);
  expect(submitted.submissions[0].snapshot.legal_reference, snapshot, 'submission retains the source snapshot');
  const approvedCase = (await ok(2, '/cases', { ...input, legal_reference_id: null,
    legal_article_id: approved.id })).case;
  detail = (await ok(2, `/cases/${approvedCase.id}`)).case;
  expect(detail.legal_article_id, approved.id, 'approved article still saves through existing foreign key');
  expect(detail.legal_reference, null, 'approved selection does not also persist a bundled reference');
}
