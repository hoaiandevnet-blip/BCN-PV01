import { readFile } from 'node:fs/promises';

export async function runLocationChecks({ ok, call, expect, body, setNow }) {
  setNow('2026-10-28T02:00:00Z');
  const provinces = JSON.parse(await readFile('assets/data/vietnam-provinces-wards.json', 'utf8'));
  const province = provinces[0];
  const other = provinces[1];
  const ward = province.wards[0];
  const address = { province_code: String(province.code), ward_code: String(ward.code), detail: '12 Đường thử' };
  const expected = { ...address, province_name: province.name, ward_name: ward.name };
  const general = [address.detail, ward.name, province.name].join(', ');
  const item = (await ok(2, '/cases', { ...body, location_address: { ...address,
    province_name: 'Tên giả không được tin cậy', ward_name: 'Xã giả' }, location_general: 'Giá trị giả' })).case;
  let detail = (await ok(2, `/cases/${item.id}`)).case;
  expect(detail.location_address, expected, 'location saves canonical names and separate province, ward and detail');
  expect(detail.location_general, general, 'display address is assembled on server, not trusted from the client');
  expect((await ok(2, `/cases?q=${encodeURIComponent(address.detail)}`)).cases.some(value => value.id === item.id),
    true, 'existing address search finds new structured locations');
  for (const invalid of [[], 'bad', { province_code: '99999' }, { ...address, ward_code: String(other.wards[0].code) },
    { ward_code: address.ward_code }, { province_code: {} }, { ...address, detail: 123 },
    { ...address, detail: 'a'.repeat(500) }]) {
    expect((await call(2, '/cases', { ...body, location_address: invalid })).status, 422,
      'invalid, mismatched or oversized structured location is rejected');
  }
  const mismatch = await call(2, `/cases/${item.id}`, { version: detail.version,
    location_address: { ...address, province_code: String(other.code) } }, 'PATCH');
  expect(mismatch.status, 422, 'edit rejects a ward from a different province');
  expect((await ok(2, `/cases/${item.id}`)).case.version, detail.version, 'invalid location never changes case version');
  expect((await call(3, `/cases/${item.id}`, { version: detail.version, location_address: address }, 'PATCH')).status,
    404, 'structured location does not bypass unit permissions');
  await ok(2, `/cases/${item.id}`, { version: detail.version, summary: 'Sửa nội dung giữ nguyên địa điểm' }, 'PATCH');
  detail = (await ok(2, `/cases/${item.id}`)).case;
  expect(detail.location_address, expected, 'partial case edits retain the structured address');
  const changed = { province_code: String(other.code), ward_code: String(other.wards[0].code), detail: '25 Đường mới' };
  await ok(2, `/cases/${item.id}`, { version: detail.version, location_address: changed }, 'PATCH');
  detail = (await ok(2, `/cases/${item.id}`)).case;
  expect(detail.location_address, { ...changed, province_name: other.name, ward_name: other.wards[0].name },
    'editing province, ward and detail round-trips all fields');
  await ok(2, `/cases/${item.id}/submit`, {});
  const submitted = await ok(2, `/cases/${item.id}`);
  expect(submitted.submissions[0].snapshot.location_address, detail.location_address,
    'submitted snapshot freezes all structured location fields');
  expect(submitted.submissions[0].snapshot.location_general, detail.location_general,
    'submitted snapshot retains the formatted address');
  const legacy = (await ok(2, '/cases', { ...body, location_general: 'Địa chỉ cũ tự do, chưa tách tỉnh và xã' })).case;
  await ok(2, `/cases/${legacy.id}`, { version: legacy.version, summary: 'Sửa nội dung hồ sơ cũ' }, 'PATCH');
  const old = (await ok(2, `/cases/${legacy.id}`)).case;
  expect(old.location_general, 'Địa chỉ cũ tự do, chưa tách tỉnh và xã', 'legacy free-text address remains intact');
  expect(old.location_address, null, 'no province or ward is guessed for a legacy address');
  const empty = (await ok(2, '/cases', { ...body, location_address: {} })).case;
  expect((await ok(2, `/cases/${empty.id}`)).case.location_general, '', 'optional empty address can still be saved');
  const cleared = (await ok(2, '/cases', { ...body, location_address: address })).case;
  await ok(2, `/cases/${cleared.id}`, { version: cleared.version, location_address: null }, 'PATCH');
  expect((await ok(2, `/cases/${cleared.id}`)).case.location_address, null, 'explicit clearing removes all address parts');
  const text = (await ok(2, '/cases', { ...body, location_address: address })).case;
  await ok(2, `/cases/${text.id}`, { version: text.version, location_general: 'Địa điểm mới từ máy khách cũ' }, 'PATCH');
  expect((await ok(2, `/cases/${text.id}`)).case.location_address, null,
    'legacy client change clears stale structured fields rather than returning contradictory addresses');
}
