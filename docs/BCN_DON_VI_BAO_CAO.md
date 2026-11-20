# Đơn vị báo cáo theo tài khoản

Cập nhật ngày 29/10/2026.

- Tài khoản thường thấy tên đơn vị được phân công điền sẵn và chỉ đọc; không cần chọn lại đơn vị.
- Áp dụng thống nhất cho nhập vụ việc, tình hình khiếu kiện, kết quả công tác và yêu cầu mở khóa.
- Đặt lại biểu mẫu vẫn giữ tên đơn vị. Danh sách chọn ẩn của tài khoản thường cũng chỉ chứa đơn vị của tài khoản.
- Chỉ admin được chọn tất cả đơn vị trong ô Đơn vị báo cáo; có hướng dẫn riêng để phân biệt với tài khoản đơn vị.
- Phạm vi tra cứu và tổng hợp PV01 tiếp tục theo phân công hiện có. Quyền tổng hợp không tự biến tài khoản thành admin.

Backend hiện có đã lấy đơn vị từ tài khoản đăng nhập và kiểm tra vai trò nhập báo cáo còn hiệu lực.
Các API tạo vụ việc, tình hình, kết quả công tác và yêu cầu mở khóa từ chối đơn vị ngoài phạm vi tài khoản.
Admin được chọn đơn vị; người tạo thực tế vẫn được ghi nhận để theo dõi lịch sử.
Không thay đổi schema, đơn vị của tài khoản, phân quyền hoặc dữ liệu hồ sơ.

## Kiểm chứng

- `node tests/daily-reports-integration.mjs`: PASS, 386 kiểm tra; gồm quyền xem danh sách đơn vị và chặn nhập chéo đơn vị.
- `node tests/daily-reports-main-app.mjs`: PASS, 108 kiểm tra; gồm admin chọn toàn bộ đơn vị và tài khoản thường chỉ đọc.
- `npm run verify:ai`: exit 0, 57/57 kiểm tra.
- Đăng nhập thực tế cả 7 tài khoản `demo.canbo02`–`demo.canbo08`: đều hiển thị đúng xã được giao,
  ô đơn vị chỉ đọc ở cả bốn biểu mẫu, không có đơn vị khác trong danh sách; không có lỗi JavaScript.
- 21 vụ việc test vẫn còn nguyên. Không tạo thêm hồ sơ trên database đang chạy trong kiểm tra này.

Bằng chứng tại `outputs/bcn-entry-units-qa/`, kết quả API tại
`outputs/daily-reports-qa/integration-results.json` và kiểm tra giao diện tại
`outputs/daily-reports-menu-qa/main-app-results.json`.

Thay đổi giao diện được nạp khi tải lại trang. Không publish/deploy/push; chưa kiểm thử triển khai production.
