import assert from 'node:assert/strict';
import { legalEntryOptions } from '../../server/daily-reports/legal-entry.js';

export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';
export const compiler = 'ttttch.pv01';

export const targetAccounts = [
  'demo.canbo02',
  'demo.canbo03',
  'demo.canbo04',
  'demo.canbo05',
  'demo.canbo06',
  'demo.canbo07',
  'demo.canbo08'
];

export const definitions = [
  ['PPHS', ['173'], 'Tiếp nhận tin báo mất máy tính tại cửa hàng mô phỏng', '01 máy tính mô hình; 02 ảnh hiện trường thử'],
  ['PPHS', ['134'], 'Xác minh xô xát tại khu dân cư mô phỏng', '01 biên bản mô phỏng; 01 bản ghi lời trình bày thử'],
  ['PPHS', ['178'], 'Kiểm tra phản ánh tài sản bị hư hỏng tại kho mô phỏng', '03 ảnh tài sản mẫu; 01 phiếu định giá thử'],
  ['PPHS', ['168'], 'Tiếp nhận phản ánh chiếm đoạt tài sản tại điểm thử', '01 túi vật chứng mô hình; 01 bản tường trình thử'],
  ['PPHS', ['173', '178'], 'Xác minh vụ mất tài sản kèm hư hỏng cửa tại địa điểm thử', '01 khóa mô hình; 02 ảnh dữ liệu thử'],
  ['TNXH', ['321'], 'Kiểm tra tin báo tụ tập đánh bạc tại địa điểm mô phỏng', '01 bộ thẻ mẫu; tiền giấy mô hình'],
  ['TNXH', ['322'], 'Xác minh phản ánh tổ chức đánh bạc tại cơ sở mô phỏng', '01 sổ ghi chép mẫu; 01 điện thoại mô hình'],
  ['MA_TUY', ['249', '251'], 'Tiếp nhận hồ sơ nghi vấn chất cấm tại khu vực thử', '02 gói vật chứng rỗng có nhãn MÔ PHỎNG'],
  ['KINH_TE', ['188'], 'Kiểm tra lô hàng không có chứng từ tại kho mô phỏng', '05 kiện hàng mô hình; 01 bảng kê mẫu'],
  ['KINH_TE', ['190'], 'Xác minh hàng hóa nghi thuộc danh mục cấm tại cơ sở thử', '03 hộp hàng mẫu không có hàng thật'],
  ['KINH_TE', ['192'], 'Tiếp nhận phản ánh hàng giả tại cửa hàng mô phỏng', '04 bao bì mẫu; 01 hóa đơn giả lập'],
  ['MOI_TRUONG', ['235'], 'Kiểm tra phản ánh xả thải tại cơ sở sản xuất mô phỏng', '02 chai mẫu rỗng; 01 sơ đồ vị trí thử'],
  ['MOI_TRUONG', ['236'], 'Xác minh việc tập kết chất thải tại địa điểm thử', '03 ảnh mô phỏng; 01 bảng kê chất thải thử'],
  ['MOI_TRUONG', ['235'], 'Tiếp nhận phản ánh ô nhiễm nguồn nước tại khu vực mô phỏng', '01 báo cáo quan trắc giả lập'],
  ['ANQG', ['110'], 'Diễn tập tiếp nhận thông tin thuộc hệ an ninh quốc gia', '01 tài liệu hoàn toàn hư cấu, không chứa bí mật'],
  ['CONG_NGHE_CAO', ['289'], 'Ghi nhận truy cập không được phép vào hệ thống thử cô lập', '01 nhật ký sự kiện giả lập'],
  ['CONG_NGHE_CAO', ['290'], 'Tiếp nhận phản ánh giao dịch giả mạo trên hệ thống mô phỏng', '02 ảnh giao dịch thử; 01 mã giao dịch giả lập'],
  ['HOAT_DONG_TU_PHAP', ['380'], 'Rà soát phản ánh không chấp hành quyết định giả lập', '01 quyết định mẫu không có giá trị pháp lý'],
  ['HOAT_DONG_TU_PHAP', ['381'], 'Xác minh phản ánh cản trở thi hành án trong tình huống diễn tập', '01 biên bản diễn tập; 02 lời trình bày giả lập'],
  ['TINH_HINH_KHAC', [], 'Tiếp nhận thông tin bất thường và hỗ trợ người dân trong diễn tập', '01 phiếu tiếp nhận mô phỏng']
];

export const handlingForms = ['', 'Khởi tố', 'Xử lý hành chính', 'Không khởi tố', 'Tạm đình chỉ', 'Đình chỉ'];

export async function loadCatalogue(pool, day = '2026-10-20') {
  const catalogue = new Map();
  for (const [domain] of definitions) {
    if (!catalogue.has(domain)) {
      catalogue.set(domain, await legalEntryOptions(pool, day, domain));
    }
  }
  return catalogue;
}
