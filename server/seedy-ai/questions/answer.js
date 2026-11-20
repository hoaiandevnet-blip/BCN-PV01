import { summarizeAuthorizedData } from '../summary.js';

const number = value => new Intl.NumberFormat('vi-VN').format(value);
const statusNames = { missing: 'chưa gửi', complete: 'gửi đủ', partial: 'gửi một phần', returned: 'có nội dung bị trả lại' };

// Carry the resolved day forward even when a long list no longer fits the chat's bounded model context.
export function dataHistory(data, plan) {
  const list = plan?.list;
  const label = list === 'all' ? 'đã gửi và chưa gửi' : list === 'submitted' ? 'đã gửi' : statusNames[list];
  const subject = list ? `Liệt kê đơn vị ${label}` : plan?.answer === 'units'
    ? 'Thống kê đơn vị đã gửi và chưa gửi' : 'Tóm tắt số liệu';
  return {
    question: `${subject} ngày ${data.ngay}`,
    answer: `Theo Tổng quan ngày ${data.ngay}, trong quyền tài khoản: ${data.don_vi.da_gui} đơn vị đã gửi, `
      + `${data.don_vi.chua_gui} chưa gửi, tổng ${data.don_vi.can_gui} cần gửi. `
      + (data.danh_sach ? `Danh sách ${label} có ${data.danh_sach.tong_so} đơn vị. ` : '')
      + 'Mỗi câu hỏi số liệu tiếp theo cần đọc lại nguồn hiện tại.'
  };
}

export function answerDataQuestion(data, plan) {
  if (plan.answer === 'summary') return summarizeAuthorizedData(data);
  const units = data.don_vi;
  const lines = [
    `Ngày ${data.ngay.split('-').reverse().join('/')}, trong phạm vi tài khoản của bạn:`,
    '',
    `• Đã gửi: ${number(units.da_gui)} đơn vị.`,
    `• Chưa gửi: ${number(units.chua_gui)} đơn vị.`,
    `• Tổng số đơn vị cần gửi: ${number(units.can_gui)}.`,
    '',
    `Trong số đã gửi: ${number(units.gui_du)} gửi đủ, ${number(units.gui_mot_phan)} gửi một phần, `
      + `${number(units.bi_tra_lai)} có nội dung bị trả lại.`
  ];
  if (!units.can_gui) {
    lines.push('Tổng quan chưa có đơn vị cần gửi trong phạm vi này; không có nghĩa là toàn hệ thống đã gửi đủ.');
  } else {
    lines.push('“Đã gửi” là đã có nội dung trên Tổng quan, chưa đồng nghĩa với gửi đủ hoặc được duyệt.');
  }
  if (data.danh_sach) {
    const list = data.danh_sach;
    const label = plan.list === 'all' ? 'cần gửi' : plan.list === 'submitted' ? 'đã gửi' : statusNames[plan.list];
    lines.push('', `Danh sách đơn vị ${label} (${number(list.tong_so)}):`);
    if (!list.tong_so) lines.push('Không có đơn vị nào trong nhóm này.');
    for (const unit of list.don_vi) lines.push(`• ${unit.ten} — ${statusNames[unit.trang_thai]}.`);
    if (list.tong_so > list.don_vi.length) {
      lines.push(`Đang hiển thị ${list.don_vi.length}/${list.tong_so} đơn vị. Xem đầy đủ tại Tổng quan, cùng ngày trên.`);
    }
  } else {
    lines.push('', 'Bạn có thể hỏi tiếp: “Những đơn vị nào chưa gửi?”');
  }
  return lines.join('\n');
}
