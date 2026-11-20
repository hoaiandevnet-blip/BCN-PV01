# Giao diện BCNPV01 — 09/11/2026

Tham chiếu giao diện người dùng chỉ định tại `http://127.0.0.1:11504/`, chế độ tối.
Áp dụng thiết kế các thành phần và bảng màu; nền trơn, không dùng họa tiết nền của mẫu.

## Đã thay đổi

- Nền xám than `#17181c`, sidebar `#1b1d21`, khung `#22252a`, ô nhập `#191b1f`.
- Điểm nhấn và nút chính vàng nhạt `#d6b882`, chữ chính `#ecebe6`, chữ phụ `#9b9a93`.
- Nút và ô nhập bo 10px; thẻ dữ liệu bo 14–18px; viền mảnh và bóng nhẹ.
- Đồng bộ đăng nhập, tổng quan, sidebar, cả 10 mục báo cáo, bản đồ số, tài khoản,
  danh mục đơn vị, các hộp thoại, thông báo, trạng thái hover/focus/disabled.
- Nút thao tác chính màu vàng; thao tác xóa/thu hồi đỏ; xác nhận/duyệt xanh.
- Sửa menu con báo cáo bị CSS cũ cắt chiều cao và thanh công cụ bị giãn trên điện thoại.
- Bổ sung class còn thiếu để bảng thông báo mở trong màn hình thay vì dưới cuối trang.
- Phần xem trước Word giữ giấy trắng/chữ đen; màu bản đồ nhiệt vẫn biểu diễn số liệu nghiệp vụ.

## Tổ chức file

- `assets/css/standalone.css`: bố cục, kích thước và responsive của khung phần mềm.
- `assets/css/standalone-theme.css`: bảng màu và thành phần dùng chung.
- `assets/css/standalone-reports.css`: các màn và hộp thoại báo cáo.
- `assets/css/standalone-map.css`: bảng dữ liệu và nút điều khiển bản đồ.

CSS giao diện được giới hạn trong `.bcn-standalone`. Lớp cascade `bcn-theme` giải quyết
các khai báo `!important` kế thừa mà không thay đổi CSS nghiệp vụ gốc.

## Kiểm chứng

- `npm run verify`: 18 kiểm chứng trình duyệt/API; kết quả tại `outputs/verify-theme.log`
  và `outputs/verification.json`. Database tạm tự xóa khi kiểm chứng kết thúc.
- Kiểm tra trực tiếp bằng trình duyệt: cả 10 mục báo cáo; hộp đối tượng, tạo tài khoản,
  danh mục đơn vị, bảng thông báo; bố cục điện thoại 390×844, không tràn ngang.
- Ảnh kiểm chứng: `outputs/home.png`, `report.png`, `map.png`, `mobile.png`, `outputs/theme/`.
- Không đổi schema, API nghiệp vụ, tài khoản, mật khẩu hoặc quyền trên database dùng thật.

Chưa kiểm tra trên thiết bị điện thoại vật lý; đã kiểm tra bằng viewport điện thoại trong Chromium.
