# Cài đặt giao diện BCNPV01

Admin mở **QUẢN TRỊ → Cài đặt** để chọn bộ màu và chế độ sáng/tối.
Sáu bộ màu: Glass hiện tại, Đỏ CAND, Vàng đồng, Xanh nghiệp vụ, Trung thu, Hồng 20/10.
Màu gốc lấy từ bộ chọn giao diện của phần mềm trung tâm; bề mặt glass vẫn được giữ.
Chữ trên nền tối được làm sáng để bảo đảm dễ đọc.

Chọn màu chỉ xem thử trên trình duyệt của admin. **Lưu giao diện** áp dụng chung cho mọi tài khoản
và màn hình đăng nhập. **Hủy thay đổi** hoặc chuyển sang phân hệ khác sẽ bỏ phần xem thử chưa lưu.
**Mặc định** chọn lại Glass hiện tại / Tối; cần bấm Lưu để áp dụng chung.
Máy đang mở nhận màu mới trong lần đồng bộ tiếp theo (tối đa khoảng 30 giây khi trang đang hoạt động)
hoặc ngay khi tải lại trang. Mặc định ban đầu vẫn là Glass hiện tại / Tối.

Chỉ tài khoản có `users.is_admin = true` được xem và sửa Cài đặt. Quyền được kiểm tra ở cả menu,
điều hướng và API; vai trò nghiệp vụ báo cáo không thay thế quyền quản trị hệ thống.

## Lưu trữ và API

- `bcn_system_settings`: một bản ghi cấu hình hệ thống, tự tạo khi máy chủ khởi động.
- `GET /api/appearance`: chỉ công bố mã màu, chế độ và phiên bản cấu hình để dựng giao diện đăng nhập.
- `GET /api/settings`: admin, bao gồm người và thời gian cập nhật.
- `PUT /api/settings`: admin, kiểm tra nguồn gửi, mã màu, chế độ và phiên bản cấu hình.
- Thay đổi được lưu cùng nhật ký `activity_logs` trong một giao dịch.
- Hai admin lưu đồng thời: yêu cầu dùng phiên bản cũ nhận 409, không ghi đè âm thầm.

## Kiểm chứng

`npm run verify` dùng bản sao database tạm, kiểm tra quyền truy cập, 12 phối hợp màu/chế độ,
xem thử/hủy/lưu, tải lại, tài khoản thường, màn hình nhỏ và các luồng nghiệp vụ hiện có.
Ảnh kiểm tra lưu ở `outputs/theme/settings-*.png`, `report-light.png`, `map-light.png`.
Database và mật khẩu thật không được dùng để ghi dữ liệu thử.

Bảng thông báo đã bỏ bộ lọc Tài sản, dòng đếm tài sản và chữ tài sản trong ô tìm kiếm.
Cụm nhận diện ở đầu menu dùng tiêu đề 20px, tên đơn vị 11px và huy hiệu 44 × 50px.
