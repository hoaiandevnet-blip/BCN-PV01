import { readFileSync } from 'node:fs';

// Use the same bundled administrative directory as the existing staff module.
const provinces = JSON.parse(readFileSync(new URL('../../assets/data/vietnam-provinces-wards.json', import.meta.url)));
const byCode = new Map(provinces.map(province => [String(province.code), province]));

export function resolveCaseLocation(body, existing, { cleanText, fail }) {
  if (body.location_address === undefined) {
    const general = cleanText(body.location_general ?? existing?.location_general, 500, 'Địa điểm');
    return { general, address: general === existing?.location_general ? existing?.location_address || null : null };
  }
  const input = body.location_address;
  if (input === null) return { general: '', address: null };
  if (typeof input !== 'object' || Array.isArray(input)) {
    fail(422, 'INVALID_LOCATION', 'Địa điểm không hợp lệ. Vui lòng chọn lại tỉnh/thành phố và xã/phường.');
  }
  const code = value => {
    if (value === undefined || value === null || value === '') return '';
    if (!['string', 'number'].includes(typeof value) || !/^\d{1,5}$/.test(String(value))) {
      fail(422, 'INVALID_LOCATION', 'Mã tỉnh/thành phố hoặc xã/phường không hợp lệ.');
    }
    return String(Number(value));
  };
  const provinceCode = code(input.province_code);
  const wardCode = code(input.ward_code);
  const province = provinceCode ? byCode.get(provinceCode) : null;
  if (provinceCode && !province) fail(422, 'INVALID_PROVINCE', 'Tỉnh/thành phố không có trong danh mục.');
  const ward = wardCode ? province?.wards.find(item => String(item.code) === wardCode) : null;
  if (wardCode && !ward) fail(422, 'INVALID_WARD', 'Xã/phường không thuộc tỉnh/thành phố đã chọn.');
  if (input.detail !== undefined && typeof input.detail !== 'string') {
    fail(422, 'INVALID_LOCATION', 'Địa chỉ chi tiết phải là nội dung văn bản.');
  }
  const detail = cleanText(input.detail, 500, 'Địa chỉ chi tiết');
  const general = cleanText([detail, ward?.name, province?.name].filter(Boolean).join(', '), 500, 'Địa điểm đầy đủ');
  return { general, address: general ? {
    province_code: provinceCode, province_name: province?.name || '',
    ward_code: wardCode, ward_name: ward?.name || '', detail
  } : null };
}
