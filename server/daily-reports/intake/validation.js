import '../../../assets/js/daily-report-intake/schema.js';
export const intakeSchema = globalThis.DailyReportIntakeSchema;

export function validateWorkDomain(value, fail, required = false) {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || !intakeSchema.workDomains.includes(value)) {
    fail(422, 'INVALID_WORK_DOMAIN', 'Vui lòng chọn lĩnh vực hợp lệ.');
  }
  return value;
}

export function validateAdministrativeDomains(entries, values, workDomain, fail) {
  if (!Array.isArray(entries) || !entries.length || entries.length > intakeSchema.workDomains.length) {
    fail(422, 'INVALID_ADMINISTRATIVE_DOMAINS', 'Vui lòng nhập ít nhất một lĩnh vực hợp lệ.');
  }
  const seen = new Set();
  const keys = intakeSchema.administrativeFields.map(([key]) => key);
  const totals = Object.fromEntries(keys.map(key => [key, 0]));
  const result = entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(422, 'INVALID_ADMINISTRATIVE_DOMAINS', 'Dữ liệu lĩnh vực không hợp lệ.');
    }
    const domain = validateWorkDomain(entry.domain, fail, true);
    if (seen.has(domain)) fail(422, 'DUPLICATE_WORK_DOMAIN', 'Mỗi lĩnh vực chỉ được chọn một lần.');
    seen.add(domain);
    if (!entry.values || typeof entry.values !== 'object' || Array.isArray(entry.values)
      || Object.keys(entry.values).length !== keys.length
      || Object.keys(entry.values).some(key => !keys.includes(key))) {
      fail(422, 'INVALID_ADMINISTRATIVE_DOMAINS', 'Mỗi lĩnh vực phải có đủ bốn chỉ tiêu.');
    }
    for (const key of keys) {
      const value = entry.values[key];
      if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(totals[key] + value)) {
        fail(422, 'INVALID_ADMINISTRATIVE_DOMAINS', 'Chỉ tiêu từng lĩnh vực phải là số nguyên không âm hợp lệ.');
      }
      totals[key] += value;
    }
    return { domain, values: Object.fromEntries(keys.map(key => [key, entry.values[key]])) };
  });
  if (result[0].domain !== workDomain || keys.some(key => totals[key] !== values?.[key])) {
    fail(422, 'INCONSISTENT_ADMINISTRATIVE_DOMAINS', 'Tổng chỉ tiêu không khớp với các lĩnh vực.');
  }
  return result;
}

export function validatePrimitiveWeaponType(value, fail) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) {
    fail(422, 'INVALID_WEAPON_TYPE', 'Tên vũ khí thô sơ không hợp lệ (tối đa 200 ký tự).');
  }
  return value.trim();
}

export function validatePrimitiveWeaponTypes(value, legacy, fail) {
  if (value === undefined) {
    const old = validatePrimitiveWeaponType(legacy, fail);
    return old ? [old] : [];
  }
  if (!Array.isArray(value) || value.length > 20) {
    fail(422, 'INVALID_WEAPON_TYPES', 'Chọn tối đa 20 loại vũ khí thô sơ.');
  }
  const types = [];
  for (const entry of value) {
    const name = validatePrimitiveWeaponType(entry, fail);
    if (!name) fail(422, 'INVALID_WEAPON_TYPES', 'Tên loại vũ khí không được để trống.');
    if (!types.some(item => item.normalize('NFC').toLocaleLowerCase('vi')
      === name.normalize('NFC').toLocaleLowerCase('vi'))) types.push(name);
  }
  if (types.join(', ').length > 200) {
    fail(422, 'INVALID_WEAPON_TYPES', 'Tổng tên các loại vũ khí không được quá 200 ký tự.');
  }
  return types;
}

export function validateIntake(body, fail) {
  if (!['NORMAL', 'INCIDENTS', 'WORK_ONLY'].includes(body.mode)) {
    fail(422, 'INVALID_INTAKE_MODE', 'Chọn tình hình ngày bình thường hoặc thêm mới vụ việc.');
  }
  const values = body.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    fail(422, 'REQUIRED_WORK_RESULTS', 'Phải nhập đầy đủ kết quả công tác công an.');
  }
  const selectedDomain = Object.hasOwn(body, 'work_domain');
  if (selectedDomain) validateWorkDomain(body.work_domain, fail, true);
  const hasAdministrativeFields = intakeSchema.administrativeFields.some(([key]) => Object.hasOwn(values, key));
  const hasPatrolFields = intakeSchema.patrolFields.some(([key]) => Object.hasOwn(values, key));
  const hasVehiclesChecked = Object.hasOwn(values, 'patrol_vehicles_checked');
  const fields = selectedDomain ? [
    ...intakeSchema.legacyEntryFields,
    ...(hasAdministrativeFields ? intakeSchema.administrativeFields : []),
    ...(hasPatrolFields ? (hasVehiclesChecked ? intakeSchema.patrolFields : intakeSchema.legacyPatrolFields) : [])
  ] : intakeSchema.legacyFields;
  const keys = new Set(fields.map(([key]) => key));
  if (Object.keys(values).some(key => !keys.has(key))) {
    fail(422, 'UNKNOWN_WORK_FIELD', 'Chỉ tiêu kết quả công tác không hợp lệ.');
  }
  for (const [key, label, , decimal] of fields) {
    const value = values[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
      || value > Number.MAX_SAFE_INTEGER || (!decimal && !Number.isSafeInteger(value))) {
      fail(422, 'REQUIRED_WORK_FIELD', `${label}: phải nhập số ${decimal ? '' : 'nguyên '}không âm.`);
    }
  }
  if (Object.hasOwn(body, 'administrative_domains')) {
    validateAdministrativeDomains(body.administrative_domains, values, body.work_domain, fail);
  }
  if (!Array.isArray(body.incidents) || body.incidents.length > 11) {
    fail(422, 'INVALID_INCIDENTS', 'Danh sách nội dung vụ việc không hợp lệ.');
  }
  if ((body.mode !== 'INCIDENTS' && body.incidents.length)
    || (body.mode === 'INCIDENTS' && !body.incidents.length)) {
    fail(422, 'REQUIRED_INCIDENT', 'Có vụ việc: chọn ít nhất một mục và nhập nội dung.');
  }
  const seen = new Set();
  return body.incidents.map(item => {
    const category = intakeSchema.categories.flatMap(([, items]) => items).find(([key]) => key === item?.code);
    if (!category || seen.has(item.code)) fail(422, 'INVALID_CATEGORY', 'Mục vụ việc không hợp lệ hoặc bị lặp.');
    seen.add(item.code);
    if (typeof item.narrative !== 'string' || !item.narrative.trim() || item.narrative.length > 8000) {
      fail(422, 'REQUIRED_NARRATIVE', `${category[1]}: bắt buộc nhập nội dung vụ việc (tối đa 8.000 ký tự).`);
    }
    return { code: item.code, label: category[1], business: category[2], narrative: item.narrative.trim() };
  });
}
