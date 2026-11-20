import { BUSINESS_CODES } from '../rules.js';
import { resolveCaseLocation } from '../location.js';
import { validateReferenceSubjects } from './subjects.js';

export const INCIDENT_STATUSES = [
  'Tiếp nhận vụ việc ban đầu',
  'Giải quyết tin báo tố giác tội phạm',
  'Giai đoạn điều tra'
];

const requiredHandlingForms = new Set();
const normalizeHandlingResult = value => ({ 'Chưa khám phá': 'Đang giải quyết', 'Khám phá': 'Đã giải quyết' }
[value] || value || 'Đang giải quyết');

export function assertHandlingRequirements(info, fail) {
  const details = info.handling_details;
  if (normalizeHandlingResult(info.handling_result) !== 'Đã giải quyết'
    || !details || !requiredHandlingForms.has(details.form)) return;
  if (!String(details.resolution || '').trim() || !String(details.reason || '').trim()) {
    fail(422, 'HANDLING_DETAILS_REQUIRED', 'Phải nhập kết quả giải quyết và lý do cho hình thức xử lý đã chọn.');
  }
}

export function validateReferenceCase(body, { fail, cleanText, today = new Intl.DateTimeFormat('en-CA',
  { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()) }) {
  const info = body.reference_info;
  if (!info || Array.isArray(info) || typeof info !== 'object') {
    fail(422, 'REFERENCE_INFO_REQUIRED', 'Thiếu thông tin vụ việc.');
  }
  const business = cleanText(body.business_code, 80, 'Lĩnh vực', true);
  if (!BUSINESS_CODES.includes(business)) fail(422, 'INVALID_FIELD', 'Lĩnh vực không hợp lệ.');
  const title = cleanText(body.title, 32000, 'Tên vụ việc', !info.case_type_key && !info.case_type);
  const summary = cleanText(body.summary, 8000, 'Nội dung vụ việc');
  const timestamp = (value, label, required = false) => {
    if (!value && !required) return null;
    if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(new Date(value).getTime())) fail(422, 'INVALID_DATE', `${label} không hợp lệ.`);
    return new Date(value).toISOString();
  };
  const occurred = timestamp(body.occurred_at, 'Thời điểm xảy ra');
  const ended = timestamp(info.ended_at, 'Thời điểm kết thúc');
  if (occurred && ended && ended < occurred) {
    fail(422, 'INVALID_DATE_RANGE', 'Thời điểm kết thúc phải từ thời điểm xảy ra trở đi.');
  }
  const location = resolveCaseLocation(body, null, { fail, cleanText });
  const lists = {};
  for (const [key, label] of [['subjects', 'Đối tượng'], ['related_vehicles', 'Phương tiện liên quan'],
  ['vehicles', 'Biển số xe'], ['victims', 'Nạn nhân']]) {
    const values = info[key] === undefined && key !== 'subjects' ? [] : info[key];
    if (!Array.isArray(values) || values.length > 100) {
      fail(422, 'INVALID_LIST', `${label}: tối đa 100 mục.`);
    }
    lists[key] = values.map(value => cleanText(value, 1000, label));
  }
  const subjectDetails = validateReferenceSubjects({ ...info, subjects: lists.subjects }, { fail, cleanText, today });
  lists.subjects = subjectDetails.map(person => person.name);
  const nonnegativeInteger = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))
      || !Number.isSafeInteger(Number(value))) {
      fail(422, 'INVALID_DETAIL_NUMBER', `${label} phải là số nguyên không âm trong phạm vi cho phép.`);
    }
    return Number(value);
  };
  const normalized = {
    schema_version: 1,
    case_type: cleanText(info.case_type, 64000, 'Loại vụ việc'),
    category_group: cleanText(info.category_group, 200, 'Phân nhóm loại vụ việc'),
    workflow: cleanText(info.workflow, 200, 'Quy trình xử lý'),
    nature: cleanText(info.nature, 200, 'Tính chất vụ việc') || 'Chưa xác định',
    incident_status: cleanText(info.incident_status, 200, 'Trạng thái vụ việc', true),
    entered_at: null,
    recorded_at: timestamp(info.recorded_at, 'Ngày ghi nhận'),
    ended_at: ended,
    handling_unit_id: info.handling_unit_id || null,
    subordinate_unit_id: info.subordinate_unit_id || null,
    details: cleanText(info.details, 8000, 'Thông tin chi tiết'),
    death_count: nonnegativeInteger(info.death_count, 'Người chết'),
    injured_count: nonnegativeInteger(info.injured_count, 'Bị thương'),
    property_damage: nonnegativeInteger(info.property_damage, 'Tài sản thiệt hại'),
    evidence: cleanText(info.evidence, 8000, 'Vật chứng'),
    handling_result: normalizeHandlingResult(cleanText(info.handling_result, 4000, 'Kết quả xử lý')),
    ...lists
  };
  normalized.subject_details = subjectDetails;
  if (info.handling_details !== undefined) {
    const details = info.handling_details;
    if (!details || Array.isArray(details) || typeof details !== 'object') {
      fail(422, 'INVALID_HANDLING_DETAILS', 'Thông tin kết quả xử lý không hợp lệ.');
    }
    const form = cleanText(details.form, 100, 'Hình thức xử lý');
    if (form && !['Khởi tố', 'Xử lý hành chính', 'Không khởi tố', 'Tạm đình chỉ', 'Đình chỉ'].includes(form)) {
      fail(422, 'INVALID_HANDLING_FORM', 'Chọn hình thức xử lý trong danh sách.');
    }
    const fine = cleanText(details.fine_million, 32, 'Tổng tiền phạt');
    if (fine && !/^\d+(?:[.,]\d{1,6})?$/.test(fine)) {
      fail(422, 'INVALID_HANDLING_FINE', 'Tổng tiền phạt phải là số không âm (triệu đồng).');
    }
    normalized.handling_details = {
      form,
      prosecution_decision_number: cleanText(details.prosecution_decision_number, 150, 'Số Quyết định khởi tố'),
      prosecution_date: cleanText(details.prosecution_date, 50, 'Ngày ra quyết định khởi tố'),
      prosecution_authority: cleanText(details.prosecution_authority, 250, 'Đơn vị ra quyết định khởi tố'),
      resolution: cleanText(details.resolution, 4000, 'Kết quả giải quyết'),
      reason: cleanText(details.reason, 4000, 'Lý do'),
      detail: cleanText(details.detail, 4000, 'Hình thức chi tiết'),
      fine_million: fine.replace(',', '.')
    };
  }
  assertHandlingRequirements(normalized, fail);
  for (const key of ['handling_unit_id', 'subordinate_unit_id']) {
    if (normalized[key] !== null) {
      const id = Number(normalized[key]);
      if (!Number.isSafeInteger(id) || id < 1) fail(422, 'INVALID_UNIT', 'Đơn vị xử lý không hợp lệ.');
      normalized[key] = id;
    }
  }
  return { business, title, summary, occurred, location, info: normalized };
}

export function referenceNarrative(item) {
  const number = value => value.toLocaleString('vi-VN');
  const decisionPrefixes = {
    'Khởi tố': 'Số QĐ khởi tố vụ án',
    'Không khởi tố': 'Số QĐ không khởi tố vụ án',
    'Tạm đình chỉ': 'Số QĐ tạm đình chỉ vụ án',
    'Đình chỉ': 'Số QĐ đình chỉ vụ án'
  };
  const details = item.info.handling_details;
  const form = details?.form;
  const decisionPrefix = decisionPrefixes[form];
  return [item.title, item.summary, item.info.details,
    item.info.death_count != null ? `Người chết: ${number(item.info.death_count)}` : '',
    item.info.injured_count != null ? `Bị thương: ${number(item.info.injured_count)}` : '',
    item.info.property_damage != null ? `Tài sản thiệt hại: ${number(item.info.property_damage)} đồng` : '',
    item.info.evidence ? `Vật chứng: ${item.info.evidence}` : '',
    `Trạng thái vụ việc: ${item.info.incident_status}`,
    `Kết quả xử lý: ${item.info.handling_result}`,
    ...(normalizeHandlingResult(item.info.handling_result) === 'Đã giải quyết' && details ? [
      form ? `Hình thức xử lý: ${form}` : '',
      decisionPrefix && details.prosecution_decision_number
        ? `${decisionPrefix}: ${details.prosecution_decision_number}` : '',
      decisionPrefix && details.prosecution_date
        ? `Ngày tháng năm: ${details.prosecution_date}` : '',
      !decisionPrefix && details.resolution
        ? `Kết quả giải quyết: ${details.resolution}` : '',
      form === 'Xử lý hành chính' && details.detail
        ? `Hình thức chi tiết: ${details.detail}` : '',
      form === 'Xử lý hành chính' && details.fine_million
        ? `Tổng tiền phạt: ${details.fine_million} triệu đồng` : ''
    ] : [])].filter(Boolean).join('\n');
}
