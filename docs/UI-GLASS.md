# Giao diện kính mờ

## Thực hiện

- Tham khảo cách kết hợp RGBA, blur, viền và bóng tại
  [CSS Glass / Editor.vue](https://github.com/miketromba/css.glass/blob/main/components/Editor.vue).
- Viết riêng `assets/css/standalone-glass.css`; không thêm thư viện hoặc tải mã từ GitHub khi ứng dụng chạy.
- Áp dụng cho đăng nhập, sidebar, thanh công cụ, thẻ tổng quan, các khung báo cáo,
  bảng quản trị, nút, ô nhập, hộp thoại, thông báo, danh sách chọn và bảng điều khiển bản đồ.
- Nền từ 10/11/2026 dùng ánh sáng chuyển sắc, lưới mảnh và đường đồng mức trừu tượng theo yêu cầu mới.
  `standalone-background.css` và `bcn-contours.svg` dùng chung cho đăng nhập và các phân hệ.
  Nền tự nhận màu đang chọn; bên trong phần mềm giảm độ đậm để ưu tiên nội dung.
  Trang xem trước Word và bản đồ giữ nền riêng; lớp trang trí không nhận thao tác và không xuất khi in.
- Dùng viền sáng, bóng mềm và lớp trong nhẹ; nút chính giữ màu vàng nhạt và chữ tối rõ.
- Chỉ những khung lớn và bảng nổi dùng backdrop blur; ô nhập và hàng dữ liệu dùng lớp màu trong.
- Giảm blur trên màn hình nhỏ, hỗ trợ reduced motion, reduced transparency và fallback khi không hỗ trợ blur.
- Không áp dụng blur cho bản đồ, ranh giới, số liệu màu hoặc trang giấy xem trước Word.

## Kiểm chứng

- `npm run verify`: **18/18 PASS, exit 0**, log tại `outputs/verify-glass.log`.
- Kiểm tra trên trình duyệt: các màn báo cáo, bảng tài khoản, hộp đối tượng,
  danh sách chọn đơn vị, bản đồ 95 địa bàn, giao diện đăng nhập 390×844 không tràn ngang.
- Kiểm tra style thực tế: khung đăng nhập blur 22px trên desktop, 12px trên mobile;
  chú giải bản đồ blur 18px, vùng bản đồ không blur. Không có lỗi JavaScript trong lần kiểm tra.
- Ảnh thực tế: `outputs/login.png`, `outputs/home.png`, `outputs/report.png`, `outputs/map.png`,
  `outputs/mobile.png` và `outputs/theme/`.
- Các kiểm thử nghiệp vụ chạy trong database tạm; không thêm dữ liệu thử vào database dùng thật.

Chưa kiểm tra trên Safari/Firefox hoặc điện thoại vật lý; kiểm chứng hiện tại dùng Chromium.
Các nhánh reduced transparency và fallback trình duyệt cũ chưa được kiểm chứng trực tiếp bằng thiết bị.
