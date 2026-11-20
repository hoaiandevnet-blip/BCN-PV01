// Shared by the preview, draft validation and Word export.
export const reportAlignmentParts = {
  title: { label: 'Tên loại văn bản', default: 'center' },
  subtitle: { label: 'Trích yếu / dòng ngày', default: 'center' },
  audience: { label: 'Kính gửi', default: 'left' },
  heading: { label: 'Các đề mục', default: 'justify' },
  body: { label: 'Nội dung báo cáo', default: 'justify' },
  recipients: { label: 'Nơi nhận', default: 'left' },
  signature: { label: 'Khối người ký', default: 'center' }
};

export const reportAlignmentOptions = {
  left: { label: 'Căn trái', short: 'Trái', icon: 'align-left' },
  center: { label: 'Căn giữa', short: 'Giữa', icon: 'align-center' },
  right: { label: 'Căn phải', short: 'Phải', icon: 'align-right' },
  justify: { label: 'Căn đều hai bên', short: 'Đều', icon: 'align-justify' }
};

export function normalizeReportAlignment(input = {}) {
  return Object.fromEntries(Object.entries(reportAlignmentParts).map(([key, part]) => [key,
    Object.hasOwn(reportAlignmentOptions, input?.[key]) ? input[key] : part.default
  ]));
}

export function validReportAlignment(input) {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input)
    && Object.entries(input).every(([key, value]) => Object.hasOwn(reportAlignmentParts, key)
      && typeof value === 'string' && Object.hasOwn(reportAlignmentOptions, value)));
}

export function reportAlignmentIndent(part, alignment) {
  return ['heading', 'body'].includes(part) && ['left', 'justify'].includes(alignment);
}
