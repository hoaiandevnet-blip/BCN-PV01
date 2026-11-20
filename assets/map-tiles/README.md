# Dữ liệu nền Bản đồ Camera (offline)

Thư mục này được phục vụ trực tiếp từ máy chủ nội bộ của phần mềm. Không cần kết nối Internet.

## Cấu trúc tile XYZ

Đặt các tile đã xuất theo cấu trúc:

```text
standard/{z}/{x}/{y}.png
dark/{z}/{x}/{y}.png
satellite/{z}/{x}/{y}.jpg
terrain/{z}/{x}/{y}.png
```

Phạm vi khuyến nghị: Đồng Nai và vùng đệm, zoom 8–19. Có thể chỉ cài `standard` ban đầu; những chế độ chưa có tile sẽ hiển thị nền dự phòng nội bộ.

## Ghi chú vận hành

- Leaflet được đóng gói trong `assets/js/leaflet.js`.
- Không cấu hình URL tile Internet trong ứng dụng.
- Nạp lại trang sau khi sao chép/chuyển tile vào đây.
