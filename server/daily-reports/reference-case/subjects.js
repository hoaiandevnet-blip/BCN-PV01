export function validateReferenceSubjects(info, { fail, cleanText, today }) {
  const names = info.subjects;
  const details = info.subject_details ?? (names.length ? null : []);
  if (!Array.isArray(details) || details.length !== names.length || details.length > 100) {
    fail(422, 'SUBJECT_DETAILS_REQUIRED', 'Phải nhập đầy đủ thông tin của từng đối tượng theo số lượng đã chọn.');
  }
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  return details.map((person, index) => {
    const prefix = `Đối tượng ${index + 1}`;
    if (!person || typeof person !== 'object' || Array.isArray(person)) {
      fail(422, 'INVALID_SUBJECT', `${prefix}: thông tin không hợp lệ.`);
    }
    const text = (key, label, limit) => {
      if (typeof person[key] !== 'string') fail(422, 'INVALID_SUBJECT', `${prefix}: ${label} không hợp lệ.`);
      return cleanText(person[key], limit, `${prefix}: ${label}`, true);
    };
    const name = text('name', 'họ và tên', 180);
    const gender = text('gender', 'giới tính', 20);
    if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      fail(422, 'INVALID_SUBJECT_GENDER', `${prefix}: chọn giới tính trong danh sách.`);
    }
    const number = (key, label, max, required = false) => {
      const value = person[key];
      if (!required && (value === undefined || value === null || value === '')) return null;
      if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))
        || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
        fail(422, 'INVALID_SUBJECT_BIRTH', `${prefix}: ${label} phải là số từ 1 đến ${max}.`);
      }
      return Number(value);
    };
    const year = number('birth_year', 'năm sinh', currentYear, true);
    const month = number('birth_month', 'tháng sinh', 12);
    const day = number('birth_day', 'ngày sinh', 31);
    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month && day && day > days[month - 1]) {
      fail(422, 'INVALID_SUBJECT_BIRTH', `${prefix}: ngày sinh không tồn tại trong tháng đã chọn.`);
    }
    if (year === currentYear && (month > currentMonth || (month === currentMonth && day > currentDay))) {
      fail(422, 'INVALID_SUBJECT_BIRTH', `${prefix}: ngày tháng năm sinh không được ở tương lai.`);
    }
    const identityNumber = person.identity_number !== undefined && person.identity_number !== null
      ? String(person.identity_number).trim()
      : '';
    if (!/^\d{12}$/.test(identityNumber)) {
      fail(422, 'INVALID_SUBJECT_IDENTITY', `${prefix}: số căn cước phải nhập đủ đúng 12 chữ số.`);
    }
    const addressParts = {};
    const address = (kind, label) => {
      const full = text(`${kind}_address`, label, 500);
      for (const [part, limit] of [['detail', 300], ['ward', 150], ['province', 150]]) {
        const key = `${kind}_${part}`;
        if (person[key] === undefined) continue;
        if (typeof person[key] !== 'string') {
          fail(422, 'INVALID_SUBJECT', `${prefix}: thành phần ${label} không hợp lệ.`);
        }
        addressParts[key] = cleanText(person[key], limit, `${prefix}: thành phần ${label}`);
      }
      const combined = ['detail', 'ward', 'province'].map(part => addressParts[`${kind}_${part}`])
        .filter(Boolean).join(', ');
      return cleanText(combined || full, 500, `${prefix}: ${label}`, true);
    };
    const permanentAddress = address('permanent', 'hộ khẩu thường trú');
    const currentAddress = address('current', 'nơi ở hiện tại');
    return { name, gender, birth_year: year, birth_month: month, birth_day: day,
      identity_number: identityNumber,
      permanent_address: permanentAddress, current_address: currentAddress, ...addressParts };
  });
}
