(() => {
  'use strict';
  const genders = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
  const keys = ['name', 'gender', 'birth_day', 'birth_month', 'birth_year', 'identity_number',
    'permanent_address', 'permanent_detail', 'permanent_ward', 'permanent_province',
    'current_address', 'current_detail', 'current_ward', 'current_province'];
  const blank = value => {
    const raw = value || {};
    const obj = Object.fromEntries(keys.map(key => [key, String(raw[key] ?? '')]));
    if (!obj.permanent_detail && obj.permanent_address) obj.permanent_detail = obj.permanent_address;
    if (!obj.current_detail && obj.current_address) obj.current_detail = obj.current_address;
    return obj;
  };
  const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  function issues(person) {
    const errors = {};
    if (!person.name?.trim()) errors.name = 'Vui lòng nhập họ và tên.';
    else if (person.name.length > 180) errors.name = 'Họ và tên tối đa 180 ký tự.';

    if (!Object.hasOwn(genders, person.gender)) errors.gender = 'Vui lòng chọn giới tính.';

    if (!person.identity_number?.trim()) {
      errors.identity_number = 'Vui lòng nhập số căn cước công dân.';
    } else if (!/^\d{12}$/.test(person.identity_number.trim())) {
      errors.identity_number = 'Số căn cước phải nhập đủ đúng 12 chữ số.';
    }

    const permAddr = (person.permanent_address || [person.permanent_detail, person.permanent_ward, person.permanent_province].filter(Boolean).join(', ')).trim();
    if (!permAddr) errors.permanent_detail = 'Vui lòng nhập hộ khẩu thường trú.';
    else if (permAddr.length > 500) errors.permanent_detail = 'Hộ khẩu thường trú tối đa 500 ký tự.';

    const currAddr = (person.current_address || [person.current_detail, person.current_ward, person.current_province].filter(Boolean).join(', ')).trim();
    if (!currAddr) errors.current_detail = 'Vui lòng nhập nơi ở hiện tại.';
    else if (currAddr.length > 500) errors.current_detail = 'Nơi ở hiện tại tối đa 500 ký tự.';

    const [currentYear, currentMonth, currentDay] = today().split('-').map(Number);
    for (const [key, label, max, required] of [['birth_year', 'Năm sinh', currentYear, true],
      ['birth_month', 'Tháng sinh', 12, false], ['birth_day', 'Ngày sinh', 31, false]]) {
      const value = person[key];
      if (!value && !required) continue;
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
        errors[key] = `${label} phải là số từ 1 đến ${max}.`;
      }
    }
    const year = Number(person.birth_year);
    const month = Number(person.birth_month);
    const day = Number(person.birth_day);
    if (!Object.keys(errors).some(key => key.startsWith('birth_'))) {
      const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (month && day > days[month - 1]) errors.birth_day = 'Ngày sinh không tồn tại trong tháng đã chọn.';
      if (year === currentYear && month > currentMonth) errors.birth_month = 'Tháng sinh đang ở tương lai.';
      if (year === currentYear && month === currentMonth && day > currentDay) {
        errors.birth_day = 'Ngày sinh đang ở tương lai.';
      }
    }
    return errors;
  }

  const serialize = person => {
    const permParts = [person.permanent_detail?.trim(), person.permanent_ward?.trim(), person.permanent_province?.trim()].filter(Boolean);
    const permFull = permParts.length ? permParts.join(', ') : (person.permanent_address?.trim() || '');
    const currParts = [person.current_detail?.trim(), person.current_ward?.trim(), person.current_province?.trim()].filter(Boolean);
    const currFull = currParts.length ? currParts.join(', ') : (person.current_address?.trim() || '');

    return {
      name: person.name.trim(),
      gender: person.gender,
      birth_year: Number(person.birth_year),
      birth_month: person.birth_month ? Number(person.birth_month) : null,
      birth_day: person.birth_day ? Number(person.birth_day) : null,
      identity_number: person.identity_number ? person.identity_number.trim() : '',
      permanent_address: permFull,
      permanent_detail: person.permanent_detail ? person.permanent_detail.trim() : '',
      permanent_ward: person.permanent_ward ? person.permanent_ward.trim() : '',
      permanent_province: person.permanent_province ? person.permanent_province.trim() : '',
      current_address: currFull,
      current_detail: person.current_detail ? person.current_detail.trim() : '',
      current_ward: person.current_ward ? person.current_ward.trim() : '',
      current_province: person.current_province ? person.current_province.trim() : ''
    };
  };
  window.DailyReportSubjectFields = { genders, keys, blank, issues, serialize };
})();
