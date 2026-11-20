# Dashboard đơn vị báo cáo

Dashboard được chọn bởi máy chủ từ vai trò đang có hiệu lực:

- Admin hoặc tài khoản có quyền tổng hợp: dashboard tiếp nhận hiện tại.
- `UNIT_REPORTER` không có quyền tổng hợp: dashboard đơn vị công tác.
- Không có quyền Báo cáo ngày hoặc quyền đọc báo cáo: không trả dữ liệu dashboard.

Đơn vị luôn lấy từ tài khoản và phân công, không lấy từ tham số trình duyệt.
Không thêm bảng cơ sở dữ liệu, không thay đổi tài khoản hoặc phân công hiện có.

## Bố cục

Tên đơn vị, biểu tượng và trạng thái sẵn sàng báo cáo được gộp vào thanh trên.
Dashboard hiển thị bộ lọc kỳ, các số tổng hợp, biểu đồ và kết quả công tác.
Tài khoản có quyền Nhập báo cáo ngày có thêm bảng “Theo dõi báo cáo của đơn vị”:
trạng thái trong ngày được chọn, số nội dung đã gửi, thời gian ghi nhận và nút Chi tiết để xem lại.
Bảng và các chỉ tiêu kết quả công tác nằm chung một khung dưới biểu đồ, dùng dữ liệu một đơn vị
đã được máy chủ giới hạn; không có bộ lọc tìm các đơn vị khác.
Khung chỉ có một tiêu đề/ngày chung khi xem trong ngày. Kỳ 7/30 ngày được ghi riêng ở phần kết quả
công tác để phân biệt tổng kỳ với nội dung báo cáo của ngày theo dõi.
Đổi ngày sẽ thu gọn chi tiết cũ; cập nhật hoặc đổi kỳ vẫn giữ trạng thái mở chi tiết.
Ngày chưa được giao báo cáo và không có nội dung hiển thị thông báo trống;
chỉ ngày thuộc phạm vi giao nhập mà chưa có nội dung mới mang trạng thái “Chưa gửi”.
Tài khoản chỉ có quyền tra cứu không hiển thị bảng này.
Hàng phím tắt, Việc cần làm, khung tiến độ cũ và Báo cáo gần đây vẫn được bỏ.
Các nghiệp vụ được mở từ menu bên trái hoặc thông báo.

`topbar.js` gắn thông tin đơn vị khi xem dashboard và khôi phục thanh trên khi
chuyển phân hệ, đăng xuất hoặc quyền xem bị thu hồi. Dashboard tổng hợp giữ bố cục riêng.

## Nguồn và cách tính

- Tiến độ theo ngày: tình hình/vụ việc và `DAILY_POLICE_WORK`. Một nhóm bị trả lại
  vẫn cần xử lý, dù có nội dung khác đã gửi. Không phát sinh vụ việc được thể hiện
  bằng báo cáo tình hình, không suy ra từ việc chưa có hồ sơ.
- Vụ việc và biểu đồ: dùng cùng quy tắc của dashboard tổng hợp, loại bản nháp và
  hai quyết định trùng không cộng lại. Các hệ nghiệp vụ dùng phân loại đang có.
- Số bản nháp và bị trả lại: tính các nội dung của đơn vị đến ngày được chọn,
  kể cả ngày cũ. Đây là trạng thái hiện tại, không phải ảnh chụp lịch sử trạng thái.
- Kết quả công tác: cộng trường số trong các bản kết quả đã gửi/chờ xác minh/đã
  xác minh thuộc kỳ. Không cộng bản nháp hoặc bị trả lại; không cộng lần nữa các
  dòng lĩnh vực đã nằm trong tổng. `0` là số được báo cáo, `—` là chưa có giá trị.
  CBCS tham gia là lượt được báo cáo, không phải số người duy nhất.
- Giờ nhập: trước 10:00 ngày hiện tại theo giờ Việt Nam; mở khóa chỉ áp dụng
  phạm vi được duyệt. Biểu mẫu tiếp tục kiểm tra quyền và thời hạn khi ghi dữ liệu.
- Tài khoản chỉ có quyền tra cứu không nhận nội dung kết quả công tác/tình hình.

## Các module

- `server/daily-reports/dashboard/unit/data.js`: đọc dữ liệu trong một giao dịch
  nhất quán, chỉ một đơn vị.
- `server/daily-reports/dashboard/unit/model.js`: tiến độ, việc cần làm và chỉ tiêu.
- `view.js`, `sections.js`, `style.css`: bố cục, trạng thái và giao diện sáng/tối.
- Controller dashboard chung quản lý tải lại, hủy yêu cầu, kỳ thống kê và liên kết.

Kiểm chứng: `npm test` và `npm run verify`. Kịch bản
`tests/verify-unit-dashboard.mjs` dùng cơ sở dữ liệu bản sao và Chrome thật.
