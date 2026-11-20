const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);

// Numerical report summaries are constructed from authorized API values, never guessed by an LLM.
export function summarizeAuthorizedData(data) {
  const date = data.ngay.split('-').reverse().join('/');
  const cases = data.vu_viec;
  const units = data.don_vi;
  const lines = [
    `TÓM TẮT NGÀY ${date}`,
    'Phạm vi: dữ liệu được cấp quyền cho tài khoản hiện tại.',
    '',
    `• Vụ việc hiện tại: ${number(cases.hien_tai)} vụ; đã duyệt: ${number(cases.da_xac_minh)} vụ.`
  ];
  if (cases.chenh_lech === null) {
    lines.push('• Chưa đủ dữ liệu để kết luận mức tăng/giảm so với ngày trước.');
  } else {
    const change = cases.chenh_lech === 0 ? 'không đổi'
      : `${cases.chenh_lech > 0 ? 'tăng' : 'giảm'} ${number(Math.abs(cases.chenh_lech))} vụ`;
    const percent = cases.ty_le_phan_tram === null ? '' : ` (${number(Math.abs(cases.ty_le_phan_tram))}%)`;
    lines.push(`• Ngày trước: ${number(cases.ky_truoc)} vụ; ${change}${percent}.`);
  }
  lines.push(
    `• Đơn vị đã gửi: ${number(units.da_gui)}/${number(units.can_gui)}; chưa gửi: ${number(units.chua_gui)} đơn vị.`,
    `• Gửi đủ: ${number(units.gui_du)}; một phần: ${number(units.gui_mot_phan)}; `
      + `có nội dung bị trả lại: ${number(units.bi_tra_lai)} đơn vị.`
  );
  if (data.theo_he.length) {
    lines.push('', 'THEO HỆ NGHIỆP VỤ');
    for (const item of data.theo_he) lines.push(`• ${item.ten}: ${number(item.so_vu)} vụ.`);
    lines.push('Một vụ có thể thuộc nhiều hệ, nên không cộng các nhóm để tính lại tổng vụ.');
  }
  const actions = [];
  if (units.chua_gui > 0) actions.push('Theo dõi, nhắc các đơn vị chưa gửi báo cáo.');
  if (units.gui_mot_phan > 0) actions.push('Đối chiếu phần nội dung còn thiếu của đơn vị gửi một phần.');
  if (units.bi_tra_lai > 0) actions.push('Theo dõi việc chỉnh sửa và gửi lại nội dung bị trả lại.');
  if (cases.hien_tai > cases.da_xac_minh) {
    actions.push('Rà soát các vụ chưa ở trạng thái đã duyệt theo quyền được giao.');
  }
  if (actions.length) lines.push('', 'CẦN THEO DÕI', ...actions.map(action => `• ${action}`));
  return lines.join('\n');
}
