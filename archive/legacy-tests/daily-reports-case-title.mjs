export async function runCaseTitleChecks({ ok, call, expect, database, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const other = { ...body, business_code: 'TINH_HINH_KHAC' };
  for (const title of [undefined, '', '   ']) {
    expect((await call(2, '/cases', { ...other, title })).status, 422,
      'other-situation case requires a nonblank title');
  }
  expect((await call(2, '/cases', { ...body, title: 'Tên không được phép nhập' })).status, 422,
    'non-other case cannot bypass the title restriction through API');
  const normal = (await ok(2, '/cases', body)).case;
  expect((await ok(2, `/cases/${normal.id}`)).case.title, '', 'non-other case saves without a title');
  expect((await call(2, `/cases/${normal.id}`, {
    version: normal.version, business_code: 'TINH_HINH_KHAC', title: 'Giả hệ để sửa tên'
  }, 'PATCH')).status, 422, 'edit uses the stored business system, not a spoofed request value');
  expect((await ok(2, `/cases/${normal.id}`)).case.version, normal.version,
    'rejected title edit leaves case version unchanged');
  await database.query('update daily_report_cases set title=$2 where id=$1', [normal.id, 'Tên hồ sơ cũ']);
  await ok(2, `/cases/${normal.id}`, { version: normal.version, summary: 'Nội dung được phép cập nhật' }, 'PATCH');
  let detail = (await ok(2, `/cases/${normal.id}`)).case;
  expect(detail.title, 'Tên hồ sơ cũ', 'editing other fields preserves legacy non-other titles');
  expect((await call(2, `/cases/${normal.id}`, { version: detail.version, title: '' }, 'PATCH')).status, 422,
    'legacy title cannot be erased through an otherwise valid edit');
  const item = (await ok(2, '/cases', { ...other, title: '  Tình hình khác kiểm thử  ' })).case;
  detail = (await ok(2, `/cases/${item.id}`)).case;
  expect(detail.title, 'Tình hình khác kiểm thử', 'other-situation title persists and is trimmed');
  expect((await call(2, `/cases/${item.id}`, { version: detail.version, title: '   ' }, 'PATCH')).status, 422,
    'other-situation title remains mandatory on edit');
  await ok(2, `/cases/${item.id}`, { version: detail.version, title: 'Tên đã chỉnh sửa' }, 'PATCH');
  expect((await ok(2, `/cases/${item.id}`)).case.title, 'Tên đã chỉnh sửa', 'other-situation title can be edited');
}
