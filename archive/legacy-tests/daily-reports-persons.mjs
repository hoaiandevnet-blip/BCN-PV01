import { randomUUID } from 'node:crypto';
import { testPersons } from './daily-reports-person-fixtures.mjs';

export async function runPersonsChecks({ ok, call, expect, database, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const invalid = [
    { person_count: undefined }, { person_count: 0, persons: [] }, { person_count: 101 },
    { person_count: 1.5 }, { person_count: true }, { person_count: 2 }, { persons: null },
    ...Object.keys(testPersons()[0]).map(key => ({ persons: [{ ...testPersons()[0], [key]: '' }] })),
    { persons: [{ ...testPersons()[0], name: '   ' }] },
    { persons: [{ ...testPersons()[0], gender: 'INVALID' }] },
    { persons: [{ ...testPersons()[0], date_of_birth: '2025-02-29' }] },
    { persons: [{ ...testPersons()[0], date_of_birth: '2099-01-01' }] },
    { persons: [{ ...testPersons()[0], identity_number: '123abc456789' }] },
    { persons: [{ ...testPersons()[0], identity_number: '123456789' }] },
    { persons: [{ ...testPersons()[0], permanent_address: 'x'.repeat(501) }] }
  ];
  for (const [index, input] of invalid.entries()) {
    const id = randomUUID();
    expect((await call(2, '/cases', { ...body, ...input, id })).status, 422,
      `persons validation rejects invalid input ${index + 1}`);
    expect((await database.query('select count(*)::int as total from daily_report_cases where id=$1', [id]))
      .rows[0].total, 0, `invalid persons input ${index + 1} leaves no partial case`);
  }
  const persons = testPersons(100);
  const item = (await ok(2, '/cases', { ...body, person_count: 100, persons })).case;
  let detail = await ok(2, `/cases/${item.id}`);
  expect(detail.case.persons, persons, 'all 100 people retain six required fields and leading CCCD zeroes');
  expect((await call(3, `/cases/${item.id}`)).status, 404, 'new personal information stays within unit access');
  const changed = testPersons(2);
  changed[0].name = '<img src=x onerror=alert(1)> Tên kiểm thử';
  changed[0].identity_number = '000000987654';
  await ok(2, `/cases/${item.id}`, { version: detail.case.version, person_count: 2, persons: changed }, 'PATCH');
  detail = await ok(2, `/cases/${item.id}`);
  expect(detail.case.persons, changed, 'editing count and all personal fields persists exactly');
  expect((await call(2, `/cases/${item.id}`, { version: detail.case.version,
    person_count: 1, persons: [{ name: 'Thiếu thông tin' }] }, 'PATCH')).status, 422,
  'partial person information cannot replace valid people');
  expect((await ok(2, `/cases/${item.id}`)).case.persons, changed, 'invalid edit preserves saved personal information');
  expect((await ok(2, '/cases?q=000000987654')).cases.some(record => record.id === item.id), true,
    'registry finds the new CCCD field without removing legacy reference search');
  await ok(2, `/cases/${item.id}/submit`, {});
  detail = await ok(2, `/cases/${item.id}`);
  expect(detail.submissions[0].snapshot.persons, changed, 'submission freezes all six personal fields');

  const legacyId = randomUUID();
  await database.query(`insert into daily_report_cases
    (id,stable_code,unit_id,business_code,category_code,report_day,summary,created_by,persons)
    values($1,$2,10,'PPHS','TEST','2026-10-28','Hồ sơ cũ giả',2,$3::jsonb)`,
  [legacyId, `LEGACY-PERSON-${legacyId}`, JSON.stringify([{ name: 'Hồ sơ đối tượng cũ', reference: 'OLD-REF' }])]);
  const legacy = await ok(2, `/cases/${legacyId}`);
  expect(legacy.case.persons[0].reference, 'OLD-REF', 'legacy subject and reference remain readable');
  await ok(2, `/cases/${legacyId}`, { version: legacy.case.version, summary: 'Sửa nội dung giữ dữ liệu cũ' }, 'PATCH');
  expect((await ok(2, `/cases/${legacyId}`)).case.persons, legacy.case.persons,
    'partial non-person edit never invents missing legacy fields');
  expect((await call(2, `/cases/${legacyId}/submit`, {})).status, 422,
    'legacy drafts must complete mandatory personal information before a new submission');
}
