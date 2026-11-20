# Tên vụ việc theo hệ vụ việc

Cập nhật ngày 29/10/2026.

- Đổi nhãn “Tên / tính chất vụ việc” thành “Tên vụ việc”.
- Chỉ hệ `TINH_HINH_KHAC` (Tình hình khác) được nhập tên. Trường này bắt buộc, có dấu sao đỏ.
- Với các hệ khác, ô bị khóa, có nền xám và hướng dẫn; không gửi giá trị ô khóa khi lưu biểu mẫu.
- Áp dụng cho cả nhập mới và chỉnh sửa. Đổi hệ tạm thời không làm mất tên đang nhập;
  chỉ lưu tên nếu hệ được chọn cuối cùng là Tình hình khác.
- API từ chối tên được nhập trái quy tắc. Chỉnh sửa sử dụng hệ đang lưu của hồ sơ,
  không chấp nhận giả hệ khác qua dữ liệu yêu cầu để mở quyền sửa tên.
- Tên đã có trong hồ sơ cũ thuộc hệ khác vẫn được giữ và hiển thị; không xóa hoặc đổi dữ liệu cũ.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `node tests/daily-reports-integration.mjs` | PASS — 381 kiểm tra |
| `node tests/daily-reports-main-app.mjs` | PASS — 106 kiểm tra; không có lỗi JavaScript |
| `npm run verify:ai` | Exit 0 — 57/57 kiểm tra |

Đã kiểm tra chọn/đổi hệ, tên trống hoặc chỉ có khoảng trắng, tạo mới và chỉnh sửa qua giao diện,
lưu sau bước xin mở khóa ngoài giờ, đặt lại biểu mẫu, API chặn sửa trái quy tắc và bảo toàn tên hồ sơ cũ.

Kết quả lưu tại `outputs/daily-reports-qa/integration-results.json`,
`outputs/daily-reports-menu-qa/main-app-results.json` và `outputs/bcn-case-title-qa/verify-ai.log`.
Ảnh kiểm tra và kiểm chứng trực tiếp máy chủ cục bộ tại `outputs/bcn-case-title-qa/`.

Máy chủ phát triển đã nạp backend mới. Không thay đổi schema database, không publish/deploy/push.
Không có lỗi còn ghi nhận trong phạm vi thay đổi này; chưa kiểm thử triển khai production.
