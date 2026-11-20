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

export const scenarioList = [
  // 1-8: PPHS
  {
    domain: 'PPHS',
    articles: ['173'],
    title: 'Tiếp nhận tin báo mất trộm xe máy tại bãi xe nhà trọ',
    evidence: '01 kìm cộng lực mô hình; 01 đoản phá khóa thử',
    nature: 'Ít nghiêm trọng',
    damage: [15000000, 32000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'PPHS',
    articles: ['173'],
    title: 'Kiểm tra phản ánh cạy cửa đột nhập trộm cắp tài sản',
    evidence: '01 xà beng mô hình; 02 ảnh hiện trường thử',
    nature: 'Nghiêm trọng',
    damage: [35000000, 95000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'PPHS',
    articles: ['134'],
    title: 'Xác minh vụ việc xô xát gây thương tích tại quán ăn đêm',
    evidence: '01 gậy gỗ mô hình; 01 biên bản lời khai thử',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [1, 2],
    death: [0, 0],
    subjectCount: [1, 3]
  },
  {
    domain: 'PPHS',
    articles: ['168'],
    title: 'Tiếp nhận tin báo cướp tài sản trên đoạn đường vắng',
    evidence: '01 túi xách mẫu rỗng; 01 dao kim loại mô hình',
    nature: 'Rất nghiêm trọng',
    damage: [8000000, 25000000],
    injured: [0, 1],
    death: [0, 0],
    subjectCount: [2, 2]
  },
  {
    domain: 'PPHS',
    articles: ['171'],
    title: 'Xác minh vụ giật điện thoại của người tham gia giao thông',
    evidence: '01 điện thoại mô hình vỏ vỡ; 01 trích xuất camera thử',
    nature: 'Nghiêm trọng',
    damage: [12000000, 28000000],
    injured: [0, 1],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'PPHS',
    articles: ['178'],
    title: 'Kiểm tra phản ánh đập phá làm hư hỏng kính xe ô tô',
    evidence: '02 viên gạch mô hình; 03 ảnh xe bị hư hỏng thử',
    nature: 'Ít nghiêm trọng',
    damage: [10000000, 22000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'PPHS',
    articles: ['174'],
    title: 'Tiếp nhận tố giác lừa đảo chiếm đoạt tiền đặt cọc đất',
    evidence: '02 hợp đồng đặt cọc mẫu; 01 giấy nhận tiền giả định',
    nature: 'Nghiêm trọng',
    damage: [100000000, 350000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'PPHS',
    articles: ['175'],
    title: 'Xác minh hành vi thuê xe tự lái rồi đem cầm cố',
    evidence: '01 giấy đăng ký xe mô phỏng; 01 hợp đồng thuê xe mẫu',
    nature: 'Nghiêm trọng',
    damage: [250000000, 450000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },

  // 9-14: MA_TUY
  {
    domain: 'MA_TUY',
    articles: ['249'],
    title: 'Bắt quả tang đối tượng tàng trữ trái phép chất ma túy',
    evidence: '02 gói nylon chứa tinh thể màu trắng mẫu rỗng',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'MA_TUY',
    articles: ['249'],
    title: 'Kiểm tra hành chính phát hiện đối tượng giấu ma túy đá',
    evidence: '01 đoạn ống nhựa chứa bột màu trắng mô phỏng',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'MA_TUY',
    articles: ['251'],
    title: 'Triệt phá điểm mua bán trái phép chất ma túy cho công nhân',
    evidence: '05 gói nylon mẫu nhãn MÔ PHỎNG; 01 cân tiểu ly mô hình',
    nature: 'Rất nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 3]
  },
  {
    domain: 'MA_TUY',
    articles: ['255'],
    title: 'Kiểm tra phát hiện nhóm thanh niên tổ chức sử dụng ma túy',
    evidence: '01 đĩa sứ mô phỏng; 01 thẻ nhựa mẫu; loa nghe nhạc thử',
    nature: 'Rất nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [3, 5]
  },
  {
    domain: 'MA_TUY',
    articles: ['256'],
    title: 'Xác minh cơ sở nhà nghỉ có dấu hiệu chứa chấp sử dụng ma túy',
    evidence: '01 sổ theo dõi lưu trú thử; dụng cụ hút tự chế mô hình',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 4]
  },

  // 15-18: TNXH
  {
    domain: 'TNXH',
    articles: ['321'],
    title: 'Bắt quả tang nhóm đối tượng tụ tập đánh bạc ăn tiền',
    evidence: '01 bộ bài tây 52 lá mẫu; tiền giấy mô hình quy ước',
    nature: 'Ít nghiêm trọng',
    damage: [5000000, 18000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [3, 6]
  },
  {
    domain: 'TNXH',
    articles: ['321'],
    title: 'Triệt xóa tụ điểm ghi số đề qua tin nhắn điện thoại',
    evidence: '02 điện thoại di động mô hình; 01 sổ ghi phơi đề thử',
    nature: 'Ít nghiêm trọng',
    damage: [15000000, 45000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'TNXH',
    articles: ['322'],
    title: 'Xác minh sới gà cựa sắt tổ chức đá ăn tiền tại vườn điều',
    evidence: '02 cặp cựa sắt mô hình; 02 con gà mẫu; cân đồng hồ thử',
    nature: 'Nghiêm trọng',
    damage: [20000000, 70000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [4, 7]
  },
  {
    domain: 'TNXH',
    articles: ['328'],
    title: 'Kiểm tra cơ sở massage có hành vi môi giới hoạt động tệ nạn',
    evidence: '01 bảng chấm công mẫu; 01 nhật ký thanh toán giả định',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 3]
  },

  // 19-23: KINH_TE
  {
    domain: 'KINH_TE',
    articles: ['188'],
    title: 'Kiểm tra phương tiện chở lô thuốc lá ngoại không hóa đơn',
    evidence: '1500 bao thuốc lá mô hình mẫu; 01 biên bản tạm giữ thử',
    nature: 'Nghiêm trọng',
    damage: [60000000, 120000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'KINH_TE',
    articles: ['190'],
    title: 'Xác minh cơ sở tàng trữ pháo nổ tự chế trái phép',
    evidence: '03 hộp pháo mô hình không chứa thuốc nổ thật',
    nature: 'Nghiêm trọng',
    damage: [15000000, 40000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'KINH_TE',
    articles: ['192'],
    title: 'Phát hiện xưởng sang chiết dầu nhớt giả nhãn hiệu',
    evidence: '20 can dầu mẫu; tem nhãn giả lập không có giá trị',
    nature: 'Nghiêm trọng',
    damage: [45000000, 130000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'KINH_TE',
    articles: ['232'],
    title: 'Bắt giữ sà lan khai thác cát trái phép trên tuyến sông',
    evidence: '01 máy bơm cát mô hình; sơ đồ vị trí hút cát thử',
    nature: 'Nghiêm trọng',
    damage: [80000000, 200000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [2, 3]
  },

  // 24-27: MOI_TRUONG
  {
    domain: 'MOI_TRUONG',
    articles: ['235'],
    title: 'Kiểm tra cơ sở giặt tẩy xả nước thải bẩn ra kênh rạch',
    evidence: '02 chai mẫu nước thải rỗng dán nhãn THỬ; 01 sơ đồ thoát nước',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'MOI_TRUONG',
    articles: ['236'],
    title: 'Xác minh vụ xe tải đổ trộm bùn thải công nghiệp ra khu đất trống',
    evidence: '03 mẫu đất thử; 02 ảnh bãi bùn thải giả định',
    nature: 'Nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'MOI_TRUONG',
    articles: ['243'],
    title: 'Phát hiện phá rừng phòng hộ lấy gỗ và chiếm đất trái phép',
    evidence: '01 cưa lốc mô hình; 05 lóng gỗ mẫu có đánh số thử',
    nature: 'Rất nghiêm trọng',
    damage: [50000000, 160000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 3]
  },

  // 28-30: CONG_NGHE_CAO
  {
    domain: 'CONG_NGHE_CAO',
    articles: ['290'],
    title: 'Tiếp nhận tố giác thủ đoạn giả danh công an lừa chuyển tiền',
    evidence: '01 bảng sao kê tài khoản ngân hàng thử; 02 ảnh chụp tin nhắn',
    nature: 'Rất nghiêm trọng',
    damage: [150000000, 600000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 2]
  },
  {
    domain: 'CONG_NGHE_CAO',
    articles: ['290'],
    title: 'Xác minh phản ánh bị chiếm đoạt tài khoản mạng xã hội để vay tiền',
    evidence: '04 ảnh chụp màn hình tin nhắn vay tiền; 01 mã giao dịch thử',
    nature: 'Nghiêm trọng',
    damage: [25000000, 80000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'CONG_NGHE_CAO',
    articles: ['289'],
    title: 'Ghi nhận sự cố máy chủ công ty bị tấn công mã hóa tống tiền',
    evidence: '01 tệp nhật ký truy cập hệ thống mô phỏng',
    nature: 'Rất nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [0, 1]
  },

  // 31-32: HOAT_DONG_TU_PHAP
  {
    domain: 'HOAT_DONG_TU_PHAP',
    articles: ['380'],
    title: 'Xác minh hành vi tẩu tán tài sản không chấp hành bản án',
    evidence: '01 bản sao bản án mẫu; 01 biên bản xác minh tài sản thử',
    nature: 'Nghiêm trọng',
    damage: [120000000, 300000000],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [1, 1]
  },
  {
    domain: 'HOAT_DONG_TU_PHAP',
    articles: ['381'],
    title: 'Xử lý hành vi cản trở lực lượng thi hành án cưỡng chế tài sản',
    evidence: '01 biên bản sự việc; 01 đoạn video ghi hình diễn tập thử',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [0, 1],
    death: [0, 0],
    subjectCount: [1, 2]
  },

  // 33-35: TINH_HINH_KHAC
  {
    domain: 'TINH_HINH_KHAC',
    articles: [],
    title: 'Tiếp nhận thông tin va chạm giao thông trên tuyến đường liên xã',
    evidence: '01 sơ đồ hiện trường va chạm thử; 02 ảnh xe máy ngã',
    nature: 'Nghiêm trọng',
    damage: [5000000, 20000000],
    injured: [1, 2],
    death: [0, 1],
    subjectCount: [1, 2]
  },
  {
    domain: 'TINH_HINH_KHAC',
    articles: [],
    title: 'Xử lý sự cố cháy cơ sở tái chế phế liệu do chập điện',
    evidence: '01 biên bản khám nghiệm hiện trường cháy mô phỏng',
    nature: 'Nghiêm trọng',
    damage: [60000000, 180000000],
    injured: [0, 1],
    death: [0, 0],
    subjectCount: [0, 1]
  },
  {
    domain: 'TINH_HINH_KHAC',
    articles: [],
    title: 'Tiếp nhận tin báo người dân nhặt được bọc tiền đánh rơi',
    evidence: '01 túi niêm phong số tiền mô hình 50 triệu đồng',
    nature: 'Ít nghiêm trọng',
    damage: [0, 0],
    injured: [0, 0],
    death: [0, 0],
    subjectCount: [0, 1]
  }
];
