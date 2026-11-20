# Địa điểm vụ việc theo tỉnh/thành phố và xã/phường

Cập nhật ngày 29/10/2026.

## Đã thực hiện

- Thay ô Địa điểm bằng Tỉnh/thành phố, Xã/phường và Địa chỉ chi tiết trong tạo mới và chi tiết vụ việc.
- Dùng chung danh mục đóng gói `assets/data/vietnam-provinces-wards.json` của hệ thống.
- Chưa chọn tỉnh thì chưa chọn được xã. Khi đổi hoặc xóa tỉnh, xã cũ được xóa để tránh sai địa bàn;
  nội dung địa chỉ chi tiết được giữ lại.
- Tự tải danh mục và có nút thử lại nếu tải lỗi. Bố cục ba cột trên máy tính, một cột trên điện thoại.
- Hồ sơ mới lưu từng phần địa chỉ, mở lại để xem/sửa được. Hồ sơ đã gửi hiển thị theo quyền hiện có.
- Không tự suy đoán tỉnh/xã của dữ liệu cũ; giữ nguyên địa điểm cũ trong ô địa chỉ chi tiết.
- Không đặt thêm yêu cầu bắt buộc cho trường Địa điểm vốn là tùy chọn.

## Lưu trữ và API

Migration bổ sung `daily_report_cases.location_address` kiểu JSONB, mặc định NULL.
Các API tạo và sửa vụ việc nhận `location_address` gồm `province_code`, `ward_code`, `detail`.
Máy chủ kiểm tra mã tỉnh và quan hệ xã–tỉnh, lấy tên từ danh mục dùng chung và ghi thêm
`province_name`, `ward_name`. Địa điểm đầy đủ được ghép vào `location_general` theo thứ tự
địa chỉ chi tiết, xã/phường, tỉnh/thành phố để giữ tương thích với tra cứu và xử lý hiện có.
Giới hạn tổng chiều dài vẫn là 500 ký tự.

Bản gửi báo cáo lưu bản chụp của cả địa chỉ có cấu trúc lẫn địa điểm đầy đủ.
API vẫn nhận địa điểm dạng văn bản từ máy khách cũ. Sửa nội dung khác không làm mất địa điểm;
nếu máy khách cũ thay địa điểm dạng văn bản, phần cấu trúc cũ được bỏ để tránh thông tin mâu thuẫn.

Mã chính: `assets/js/daily-reports-location.js`, `assets/css/daily-reports-location.css`,
`server/daily-reports/location.js`; tích hợp trong `daily-reports-workspace.js`, `daily-reports.js`
và `server/daily-reports/routes.js`.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `node tests/daily-reports-integration.mjs` | PASS, 494 kiểm tra, exit 0 |
| `node tests/daily-reports-main-app.mjs` | PASS, 125 kiểm tra, exit 0; không có lỗi trình duyệt ngoài dự kiến |
| `npm run verify:ai` | PASS, 57/57, exit 0 |
| `BCN_DEMO_PASSWORD=… node outputs/bcn-location-qa/live-check.mjs` | PASS trên máy chủ hiện tại; chỉ đọc và thao tác ô nhập, không lưu hồ sơ mới |
| `git diff --check` | exit 0 |

Đã kiểm tra: đổi tỉnh làm mới danh sách xã; không giữ xã của tỉnh cũ; lưu/mở lại/sửa qua API thật;
đặt lại biểu mẫu sau khi lưu; hiển thị hồ sơ đã gửi; chặn mã giả và xã sai tỉnh; giữ dữ liệu khi tải lại
danh mục bị lỗi; giao diện desktop/mobile; bản chụp địa điểm và dữ liệu cũ.

Máy chủ phát triển đã nạp migration và API mới. Đối chiếu checksum xác nhận 21 vụ việc hiện có
giữ nguyên nội dung và địa điểm. Không publish/deploy/push; chưa kiểm thử máy chủ production.

Bằng chứng tại `outputs/bcn-location-qa/`, `outputs/daily-reports-qa/integration-results.json`
và `outputs/daily-reports-menu-qa/main-app-results.json`.
