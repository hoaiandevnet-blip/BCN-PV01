import { isValidReportDay } from './rules.js';

export function validatePersons(value, count, fail, today) {
  const quantity = typeof count === 'number' || typeof count === 'string' ? Number(count) : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    fail(422, 'INVALID_PERSON_COUNT', 'Chọn số đối tượng từ 1 đến 100.');
  }
  if (!Array.isArray(value) || value.length !== quantity) {
    fail(422, 'PERSON_COUNT_MISMATCH', 'Số thông tin đối tượng phải khớp với số lượng đã chọn.');
  }
  return value.map((person, index) => {
    const text = (key, label, limit) => {
      const result = typeof person?.[key] === 'string' ? person[key].trim() : '';
      if (!result || result.length > limit) {
        fail(422, 'INVALID_PERSON', `Đối tượng ${index + 1}: ${label} là bắt buộc, tối đa ${limit} ký tự.`);
      }
      return result;
    };
    const name = text('name', 'họ và tên', 180);
    const gender = text('gender', 'giới tính', 20);
    if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      fail(422, 'INVALID_PERSON_GENDER', `Đối tượng ${index + 1}: chọn giới tính hợp lệ.`);
    }
    const birth = text('date_of_birth', 'ngày sinh', 10);
    if (!isValidReportDay(birth) || birth > today) {
      fail(422, 'INVALID_PERSON_BIRTH_DATE', `Đối tượng ${index + 1}: ngày sinh không hợp lệ hoặc ở tương lai.`);
    }
    const identity = text('identity_number', 'số CCCD', 12);
    if (!/^\d{12}$/.test(identity)) {
      fail(422, 'INVALID_PERSON_IDENTITY', `Đối tượng ${index + 1}: số CCCD phải gồm đúng 12 chữ số.`);
    }
    const permanent = text('permanent_address', 'thường trú', 500);
    const current = text('current_address', 'nơi ở hiện tại', 500);
    const reference = typeof person.reference === 'string' ? person.reference.trim().slice(0, 100) : '';
    return { name, gender, date_of_birth: birth, identity_number: identity,
      permanent_address: permanent, current_address: current, ...(reference ? { reference } : {}) };
  });
}
