export async function runSubjectAddressChecks({ ok, call, expect }) {
  const person = {
    name: 'Đối tượng giả định', gender: 'MALE', identity_number: '000000000001',
    birth_year: 1990, birth_month: null, birth_day: null,
    permanent_detail: 'Địa chỉ thường trú thử', permanent_ward: 'Xã thử A', permanent_province: 'Tỉnh thử',
    current_detail: 'Nơi ở thử', current_ward: 'Xã thử B', current_province: 'Tỉnh thử',
    permanent_address: 'Địa chỉ thường trú thử, Xã thử A, Tỉnh thử',
    current_address: 'Nơi ở thử, Xã thử B, Tỉnh thử'
  };
  const body = { report_day: '2026-10-28', business_code: 'TINH_HINH_KHAC',
    title: 'Hồ sơ giả định kiểm thử địa chỉ', summary: 'Chỉ dùng trong schema cô lập',
    reference_info: { incident_status: 'Tiếp nhận vụ việc ban đầu',
      subjects: [person.name], subject_details: [person] } };
  const created = (await ok(2, '/reference-cases', body)).case;
  const loaded = (await ok(2, `/cases/${created.id}`)).case;
  expect(loaded.reference_info.subject_details, [person],
    'all six address components survive an actual create and subsequent GET');
  const edited = { ...person, current_ward: 'Xã đã sửa' };
  const saved = (await ok(2, `/reference-cases/${created.id}`, {
    ...body, version: loaded.version,
    reference_info: { ...body.reference_info, subject_details: [edited] }
  }, 'PATCH')).case;
  const again = (await ok(2, `/cases/${created.id}`)).case;
  expect(again.reference_info.subject_details[0].current_ward, 'Xã đã sửa',
    'editing one address component retains the other components');
  expect(again.reference_info.subject_details[0].current_address, 'Nơi ở thử, Xã đã sửa, Tỉnh thử',
    'combined address stays synchronized with its structured components');
  for (const invalid of [[], 123, 'x'.repeat(151)]) {
    const response = await call(2, `/reference-cases/${created.id}`, {
      ...body, version: saved.version,
      reference_info: { ...body.reference_info, subject_details: [{ ...edited, current_ward: invalid }] }
    }, 'PATCH');
    expect(response.status, 422, `invalid address component type or length is rejected: ${typeof invalid}`);
  }
  const legacy = Object.fromEntries(Object.entries(person)
    .filter(([key]) => !/_(detail|ward|province)$/.test(key)));
  const legacyCase = (await ok(2, '/reference-cases', {
    ...body, reference_info: { ...body.reference_info, subject_details: [legacy] }
  })).case;
  expect(legacyCase.reference_info.subject_details, [legacy],
    'legacy combined-only addresses remain readable without guessed components');
}
