import JSZip from 'jszip';

export async function runV8Checks({ ok, call, expect, database, body, pvLeader }) {
  const own = await ok(2, '/overview?report_day=2026-10-28');
  const scoped = await ok(6, '/overview?report_day=2026-10-28');
  const global = await ok(4, '/overview?report_day=2026-10-28');
  expect(own.units.map(unit => Number(unit.id)), [10], 'V8 overview respects reporter unit scope');
  expect(scoped.totals, own.totals, 'V8 scoped compiler overview uses assigned units');
  expect(global.units.length, 4, 'V8 global compiler overview includes all authorized units');
  expect((await call(5, '/overview')).status, 403, 'V8 legal role cannot access operational overview');
  const counted = await database.query(`select count(*)::int as total from daily_report_cases
    where unit_id=10 and report_day='2026-10-28'`);
  expect(own.totals.total, counted.rows[0].total, 'V8 KPI derives from actual stored cases');
  const initial = { ...body, title: 'V8_TITLE_QA', summary: 'Nội dung hồ sơ thử V8 riêng biệt',
    business_code: 'TINH_HINH_KHAC', decision_type: 'KHỞI TỐ', decision_number: 'V8-QD-1',
    decision_date: '2026-10-28', decision_authority: 'Đơn vị giả kiểm thử' };
  const record = (await ok(2, '/cases', initial)).case;
  const detail = await ok(2, `/cases/${record.id}`);
  expect(detail.case.title, initial.title, 'V8 case title persists');
  expect(detail.events[0].decision_number, initial.decision_number, 'V8 initial decision persists atomically');
  expect((await ok(2, '/cases?q=V8_TITLE_QA')).cases[0].id, record.id, 'V8 registry searches title');
  expect((await call(2, '/cases', { ...initial, decision_authority: '' })).status, 422,
    'V8 initial decision without issuing authority is rejected');
  await ok(2, `/cases/${record.id}/submit`, {});
  await ok(4, `/cases/${record.id}/return`, { reason: 'Yêu cầu làm rõ thử V8', requested_fields: ['title'] });
  await ok(2, `/cases/${record.id}/submit`, { response: 'Đã rà soát nội dung theo yêu cầu thử V8' });
  await ok(4, `/cases/${record.id}/verify`, {});
  expect((await ok(2, '/cases?has_returns=true')).cases.some(item => item.id === record.id), true,
    'V8 returned history retains reverified cases');
  const event = (await ok(2, `/cases/${record.id}/events`, {
    narrative: 'Diễn biến mới V8 chưa xác minh', report_day: body.report_day
  })).event;
  const pending = (await ok(4, '/composer/items?report_day=2026-10-28&include_pending=true')).items
    .find(item => item.source_id === event.id);
  expect(pending.current_state, 'PENDING_REVIEW', 'V8 pending event remains pending under a verified case');
  expect((await ok(4, '/composer/items?report_day=2026-10-28')).items.some(item => item.source_id === event.id),
    false, 'V8 default composer excludes pending events');
  expect((await ok(2, '/cases?followup=true')).cases.some(item => item.id === record.id), true,
    'V8 updates view includes verified cases with new events');
  let draft = (await ok(4, '/drafts', { report_day: body.report_day, report_type: 'BCN_PV01' })).draft;
  expect((await call(4, `/drafts/${draft.id}/items`, { revision: draft.revision,
    items: [{ ...pending, included: true }] }, 'PUT')).status, 409, 'V8 server rejects selection of pending events');
  await ok(4, `/events/${event.id}/verify`, {});
  const source = (await ok(4, '/composer/items?report_day=2026-10-28')).items
    .find(item => item.source_id === event.id);
  const documentFields = { number: 'QA-V8/BC-PV01', classification: 'KHÔNG MẬT',
    audience: 'Kính gửi: Đơn vị kiểm thử giả', advisory: 'NỘI DUNG THAM MƯU V8',
    duty: 'NỘI DUNG TRỰC BAN V8', recipients: 'Đơn vị nhận giả;\nLưu: VT.', conclusion: 'KẾT LUẬN V8',
    alignment: { audience: 'center', subtitle: 'left', body: 'right' } };
  draft = (await ok(4, `/drafts/${draft.id}/items`, { revision: draft.revision,
    items: [{ ...source, included: true }], document_fields: documentFields, leader_id: pvLeader.id }, 'PUT')).draft;
  expect((await ok(4, `/drafts/${draft.id}`)).draft.document_fields, documentFields,
    'V8 document fields survive draft reload');
  expect((await ok(4, `/drafts/${draft.id}/history`)).history[0].snapshot.document_fields, documentFields,
    'V8 document fields are included in revision history');
  expect((await call(4, `/drafts/${draft.id}/items`, { revision: draft.revision, items: [],
    document_fields: { unknown: 'unexpected' } }, 'PUT')).status, 422, 'V8 unknown document fields rejected');
  expect((await call(4, `/drafts/${draft.id}/items`, { revision: draft.revision, items: [],
    document_fields: { alignment: { audience: 'arbitrary-css' } } }, 'PUT')).status, 422,
  'V8 unsupported document alignment rejected by API');
  const exported = (await ok(4, `/drafts/${draft.id}/exports`, { expected_revision: draft.revision,
    report_type: draft.report_type, leader_id: pvLeader.id })).export;
  expect(exported.document_snapshot, documentFields, 'V8 export captures immutable document metadata');
  const zip = await JSZip.loadAsync((await call(4, `/exports/${exported.id}/download`)).data);
  const xml = await zip.file('word/document.xml').async('string');
  expect(['QA-V8/BC-PV01', 'NỘI DUNG THAM MƯU V8', 'NỘI DUNG TRỰC BAN V8', 'KẾT LUẬN V8']
    .every(text => xml.includes(text)), true, 'V8 Word contains saved custom document components');
  const audienceParagraph = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/gu)]
    .find(match => match[0].includes(documentFields.audience))?.[0];
  expect(audienceParagraph?.includes('<w:jc w:val="center"/>'), true,
    'V8 Word export preserves saved audience alignment');
  const legal = (await ok(1, '/legal/import-drafts', { title: 'Nguồn luật giả V8', document_number: 'QA-V8-LAW',
    source_uri: 'https://example.invalid/v8', checksum: 'v8-fixture-checksum', effective_from: '2026-01-01',
    articles: [{ article_code: 'V8-1', title: 'Điều thử V8', business_codes: ['CONG_NGHE_CAO'],
      article_text: 'Nội dung đầy đủ giả dùng kiểm thử V8.' }] })).version;
  expect((await ok(1, `/legal/articles?version_id=${legal.id}`)).articles[0].article_text,
    'Nội dung đầy đủ giả dùng kiểm thử V8.', 'V8 legal catalog retains full article text');
  expect((await call(5, `/legal/versions/${legal.id}/discard`, {})).status, 409,
    'V8 another reviewer cannot discard the importer draft');
  await ok(1, `/legal/versions/${legal.id}/discard`, {});
  expect((await ok(1, '/legal/versions')).versions.find(item => item.id === legal.id).status, 'RETIRED',
    'V8 discarded import remains available for audit');
}
