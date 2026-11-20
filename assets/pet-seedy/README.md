# Seedy trong BCNPV01

Thú cưng dùng bộ ảnh Seedy gốc từ ứng dụng OpenAI đang cài trên máy.
`seedy.webp` được sao chép nguyên byte từ
`/Applications/ChatGPT.app/Contents/Resources/app.asar`, mục
`webview/assets/seedy-spritesheet-v10.c613f3fce1.webp`.

## Sử dụng

- Sau khi đăng nhập, Seedy tự chớp mắt và chuyển động.
- Bấm vào pet để trò chuyện với trợ lý AI local; kéo pet để đổi vị trí. Vị trí được lưu tại trình duyệt.
- Pet nhìn theo con trỏ ở gần. Nút `···` mở lời chào, về góc màn hình và ẩn pet.
- Nút mầm cây trên thanh công cụ dùng để ẩn/hiện; trên màn hình rộng tối đa 600px,
  nút chuyển vào menu bên trái với tên **Thú cưng Seedy**.
- Khi pet được chọn bằng bàn phím, dùng phím mũi tên để di chuyển, Shift để di chuyển nhanh,
  Home để về góc màn hình, Enter/Space để mở trợ lý.
- Pet tự nhường chỗ cho nút và ô nhập liệu khi nội dung thay đổi hoặc cuộn.
  Nếu không còn chỗ trống, pet tạm ẩn đến khi có chỗ; vị trí người dùng lưu vẫn được giữ.
- Tùy chọn giảm chuyển động của hệ điều hành được tôn trọng; tab ẩn dừng bộ hẹn giờ ảnh động.

## Cấu trúc

- `main.js`: khởi tạo, vòng đời đăng nhập, chuột, cảm ứng và bàn phím.
- `state.js`: tùy chọn localStorage, giới hạn và tọa độ tương đối theo viewport.
- `animation.js`: tải ảnh, thời lượng khung hình và 16 hướng nhìn.
- `ui.js`: thành phần DOM và điều khiển menu.
- `avoidance.js`: tránh các nút và trường nhập liệu đang hiển thị.
- `style.css`: bố cục và lớp ghi đè giới hạn trong pet để tương thích giao diện glass.

Ảnh v2 có kích thước 1536 × 2288, gồm 8 cột × 11 hàng, mỗi ô 192 × 208.
Hiển thị CSS dùng `background-size: 800% 1100%`. Tọa độ nền theo phần trăm là
`column / 7 × 100` và `row / 10 × 100`; tỷ lệ ảnh được giữ nguyên.
Các hàng 0–4 lần lượt là idle, chạy phải, chạy trái, vẫy tay và nhảy.
Các hàng 9–10 chứa 16 hướng nhìn cách nhau 22,5°.

Hai dòng nạp CSS/module trong `index.html` nối tính năng vào phần mềm.
Pet chỉ dùng tài nguyên nội bộ và tùy chọn hiển thị trong trình duyệt.
Phần trợ lý được mô tả trong `assets/seedy-assistant/README.md`.

## Kiểm chứng

Chạy `npm test` và `npm run verify` từ thư mục gốc BCNPV01.
`tests/pet-seedy/verify.mjs` được gọi trong bộ verify chung, sử dụng Chrome thật
và database tạm của bộ kiểm chứng. Ảnh chụp nằm tại `outputs/pet-seedy/`.
