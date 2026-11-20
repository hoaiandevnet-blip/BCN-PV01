# Bàn giao BCNPV01 — 09/11/2026

## Đã thực hiện

- Phần mềm riêng tại thư mục `BCNPV01`; mở bằng `Mở BCNPV01.command` hoặc `npm run open`.
- PostgreSQL database **BCNPV01** đã được tạo thật, không phải chỉ có file SQL mẫu.
- Đã chuyển 24 tài khoản với nguyên mật khẩu đã băm, 163 đơn vị/đội, 2 cấp đơn vị,
  6 cấp bậc, 4 chức vụ, 9 phân công Báo cáo ngày và 2 cấu hình người ký.
- Giữ quyền module và quyền mục con liên quan. Những quyền của hệ thống tài sản không đưa vào phần mềm mới.
- Toàn bộ API báo cáo ở `/api/bao-cao-ngay/*`; bản đồ ở `/api/digital-map/*`.
- API riêng cho đăng nhập, phiên, đăng xuất, đổi mật khẩu, tài khoản, danh mục và thông báo.
- Database mới không chứa hồ sơ báo cáo, file đính kèm, kỳ bản đồ hoặc số liệu vụ việc thử.
- Nền địa lý có bản sao riêng tại `assets/map-data`, cache ảnh nền tại `assets/map-tiles`;
  Docker dùng container/cổng riêng `bcnpv01-map-server:8082`.
- Gỡ Họp thông minh, Báo cáo ngày và Bản đồ số khỏi giao diện, API, registry quyền của hệ thống cũ.
  Xóa 28 bảng `daily_report_*`, `digital_map_*`, file nghiệp vụ thử và mã nguồn module đã rút.
- Dashboard cũ thay danh sách đơn vị gửi báo cáo bằng bảng chất lượng hồ sơ tài sản;
  số liệu lấy từ nguồn tài sản thực tế đã được phân quyền.

## Các chỉnh sửa khi tách

- Tách cookie đăng nhập thành `bcnpv01_session`, không dùng cookie của hệ thống cũ.
- Mọi API tài khoản và danh mục quản trị kiểm tra quyền quản trị tại server;
  API bản đồ kiểm tra phiên thật và quyền quản trị, bỏ tin cậy header `X-Actor`.
- Bảo vệ file riêng: server không công khai thư mục mã nguồn, `.env` hoặc file lưu trữ đính kèm.
- Sửa biến `roleModules` bị thiếu khi hiển thị danh sách phân công; kiểm chứng bắt cả lỗi được UI chuyển thành thông báo.
- Sửa phụ thuộc `requireRole` bị thiếu trong module nhập báo cáo, vốn làm bản mã tiếp nhận lỗi khi khởi động.
- API xem báo cáo gần nhất kiểm tra đúng phạm vi đơn vị; luồng sửa theo ID kiểm tra quyền sở hữu,
  đơn vị và cửa sổ nhập trước khi cập nhật.
- Khung đăng nhập, tài khoản và danh mục độc lập; CSS được giới hạn để tương thích các màn nghiệp vụ đã có.
- Trợ lý của hệ thống cũ không còn truy vấn các bảng đã xóa hoặc đọc tài liệu Họp thông minh.

## Kiểm chứng

- `npm test`: 42/42 kiểm thử quyền, khóa giờ, 4 mẫu Word và danh mục pháp luật đạt, exit 0.
- `npm run verify`: 16 kiểm chứng đạt, exit 0; đăng nhập admin/đơn vị/PV01; chặn truy cập trái quyền; mở 10 mục báo cáo;
  tạo tài khoản, đơn vị; bản đồ 95 địa bàn; nhập Excel qua giao diện; yêu cầu/duyệt mở khóa;
  gửi/đọc lại báo cáo; chặn chéo đơn vị; mobile; đăng xuất; không lỗi JavaScript.
- Hệ thống cũ: `npm run verify:ai` 58/58 đạt, exit 0.
- `node --test tests/dashboard-summary.test.mjs tests/dashboard-sync.test.mjs tests/dashboard-priorities.test.mjs` từ thư mục hệ thống cũ:
  25/25 đạt, exit 0.
- `node tests/verify-old.mjs`: 6 kiểm chứng đạt, exit 0; chạy trong thư mục BCNPV01 kiểm tra dashboard cũ, API đã gỡ và dữ liệu còn lại.
- Kiểm chứng trình duyệt dùng các database tạm, đã tự xóa; không đổi mật khẩu hoặc tạo dữ liệu thử trên database dùng thật.

Các bản ghi nghiệp vụ ngoài phạm vi chuyển giao giữ nguyên. Cơ chế khởi động sẵn có của hệ thống cũ
cập nhật `updated_at` tại tài sản, danh mục tài sản, cấp đơn vị và tăng `unit_directory_state.revision`.
Đã đối chiếu trước/sau bằng bản sao lưu để phân biệt metadata này với nội dung nghiệp vụ.

Chưa kiểm tra kết nối từ máy khác, vì phần mềm mới đang chạy cục bộ `127.0.0.1` theo phạm vi yêu cầu.
Không push/publish hệ thống lên Internet. Dịch vụ bản đồ chỉ chạy cục bộ trên máy.

Bản sao lưu tạm chứa dữ liệu thử của hệ thống cũ đã được xóa sau nghiệm thu. Bản sao khởi tạo sạch của BCNPV01 được lưu ở `.private/BCNPV01-initial.dump`.
