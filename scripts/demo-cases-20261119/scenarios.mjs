export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập ngày 19/11/2026, phục vụ kiểm thử số liệu báo cáo.';
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

export const targetDistribution = [
  { username: 'demo.canbo02', unitName: 'Công an xã An Phước', count: 4 },
  { username: 'demo.canbo03', unitName: 'Công an xã An Viễn', count: 2 },
  { username: 'demo.canbo04', unitName: 'Công an xã Bàu Hàm', count: 3 },
  { username: 'demo.canbo05', unitName: 'Công an xã Bình An', count: 4 },
  { username: 'demo.canbo06', unitName: 'Công an xã Bình Minh', count: 3 },
  { username: 'demo.canbo07', unitName: 'Công an xã Bình Tân', count: 2 },
  { username: 'demo.canbo08', unitName: 'Công an xã Bom Bo', count: 3 }
];

export const todayScenarios = [
  // 1. PPHS - Trộm cắp xe máy
  {
    domain: 'PPHS',
    articles: ['173'],
    title: 'Tiếp nhận tin báo mất trộm xe máy tại khu nhà trọ công nhân',
    evidence: '01 kìm bấm kim loại mô hình; 01 đoản sắt bẻ khóa mô phỏng',
    nature: 'Ít nghiêm trọng',
    damage: [18000000, 32000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2],
    handlingForm: 'Đang xác minh nguồn tin'
  },
  // 2. PPHS - Cố ý gây thương tích
  {
    domain: 'PPHS',
    articles: ['134'],
    title: 'Xác minh vụ xô xát gây thương tích tại quán nước giải khát',
    evidence: '01 gậy gỗ mô hình dài 80cm; 01 trích xuất camera thử',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [1, 2],
    death: [0, 0],
    subjectCount: [2, 3],
    handlingForm: 'Đang xác minh nguồn tin'
  },
  // 3. PPHS - Cướp giật tài sản
  {
    domain: 'PPHS',
    articles: ['171'],
    title: 'Xác minh vụ việc giật túi xách người đi đường lúc sáng sớm',
    evidence: '01 túi xách mẫu rỗng; 01 biên bản lời khai người làm chứng thử',
    nature: 'Nghiêm trọng',
    damage: [12000000, 25000000],
    injured: [0, 1],
    death: [0, 0],
    subjectCount: [2, 2],
    handlingForm: 'Đang xác minh nguồn tin'
  },
  // 4. PPHS - Hủy hoại tài sản
  {
    domain: 'PPHS',
    articles: ['178'],
    title: 'Kiểm tra hiện trường kính chắn gió xe tải bị ném vỡ',
    evidence: '02 mảnh đá xây dựng mô hình; 03 ảnh hiện trường chụp thử',
    nature: 'Ít nghiêm trọng',
    damage: [8000000, 15000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1],
    handlingForm: 'Đang xác minh nguồn tin'
  },
  // 5. MA_TUY - Tàng trữ trái phép
  {
    domain: 'MA_TUY',
    articles: ['249'],
    title: 'Bắt quả tang đối tượng tàng trữ trái phép chất ma túy',
    evidence: '02 túi nylon rỗng dán nhãn MÔ PHỎNG; 01 cân tiểu ly thử nghiệm',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1],
    handlingForm: 'Tạm giữ hình sự'
  },
  // 6. MA_TUY - Sử dụng trái phép chất ma túy
  {
    domain: 'MA_TUY',
    articles: ['249'],
    title: 'Kiểm tra phát hiện điểm tụ tập nghi vấn sử dụng ma túy tổng hợp',
    evidence: '01 bộ nỏ thủy tinh mô hình; 03 que test nhanh nước tiểu mẫu',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 4],
    handlingForm: 'Lập hồ sơ cai nghiện bắt buộc'
  },
  // 7. CONG_NGHE_CAO - Lừa đảo qua mạng
  {
    domain: 'CONG_NGHE_CAO',
    articles: ['290'],
    title: 'Tiếp nhận đơn trình báo bị lừa đảo giả danh nhân viên viễn thông',
    evidence: '05 trang sao kê tài khoản ngân hàng thử; 03 ảnh chụp màn hình Zalo giả',
    nature: 'Nghiêm trọng',
    damage: [45000000, 120000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2],
    handlingForm: 'Chuyển cơ quan điều tra'
  },
  // 8. CONG_NGHE_CAO - Đánh bạc qua mạng
  {
    domain: 'CONG_NGHE_CAO',
    articles: ['289'],
    title: 'Phát hiện đối tượng truy cập nền tảng cá cược trực tuyến',
    evidence: '01 điện thoại thông minh mô hình; 01 USB lưu lịch sử web thử',
    nature: 'Ít nghiêm trọng',
    damage: [5000000, 20000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2],
    handlingForm: 'Xử phạt vi phạm hành chính'
  },
  // 9. TNXH - Ghi số đề / đánh bạc
  {
    domain: 'TNXH',
    articles: ['321'],
    title: 'Triệt xóa tụ điểm ghi bán số đề tại quầy tạp hóa địa phương',
    evidence: '02 tờ phơi đề mẫu mô phỏng; 01 máy tính cầm tay Casio',
    nature: 'Ít nghiêm trọng',
    damage: [6000000, 16000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 3],
    handlingForm: 'Xử phạt vi phạm hành chính'
  },
  // 10. KINH_TE - Buôn bán hàng cấm / hàng lậu
  {
    domain: 'KINH_TE',
    articles: ['190'],
    title: 'Phát hiện phương tiện vận chuyển thuốc lá điếu nhập lậu',
    evidence: '06 thùng carton chứa vỏ bao thuốc lá mẫu; 01 xe máy mô phỏng',
    nature: 'Nghiêm trọng',
    damage: [28000000, 55000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2],
    handlingForm: 'Tịch thu tang vật, xử lý hành chính'
  },
  // 11. KINH_TE - Vận chuyển khoáng sản không rõ nguồn gốc
  {
    domain: 'KINH_TE',
    articles: ['188'],
    title: 'Kiểm tra xe ben chở đất đá không có hóa đơn chứng từ hợp pháp',
    evidence: '01 phiếu cân xe tải thử; 01 biên bản tạm giữ phương tiện mẫu',
    nature: 'Ít nghiêm trọng',
    damage: [15000000, 30000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1],
    handlingForm: 'Đang xác minh nguồn tin'
  },
  // 12. MOI_TRUONG - Xả nước thải trái phép
  {
    domain: 'MOI_TRUONG',
    articles: ['235'],
    title: 'Phát hiện cơ sở gia công xả nước thải chưa qua xử lý ra mương',
    evidence: '02 bình thủy tinh chứa mẫu nước thử; 01 sơ đồ vị trí xả thải mẫu',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2],
    handlingForm: 'Đang xác minh nguồn tin'
  }
];
