# Danh sách lãnh đạo tự tải và xóa

Cập nhật ngày 29/10/2026.

## Đã thực hiện

- Tự tải danh sách khi vào Phân quyền, Tổng hợp báo cáo hoặc mở mục Lãnh đạo & người ký.
- Giữ nút Cập nhật để tải lại thủ công khi cần; thêm, sửa, lưu trữ và xóa đều tự cập nhật danh sách.
- Thêm nút Xóa cho mỗi người ký, ô chọn từng dòng, Chọn tất cả và Xóa đã chọn.
- Hiện hộp xác nhận giữa màn hình với đúng tên những người sẽ xóa; có Hủy và hỗ trợ phím Escape.
- Xóa người đang được sửa sẽ đặt lại biểu mẫu. Người đã xóa không còn trong lựa chọn người ký.
- Chỉ admin được xóa. Tài khoản tổng hợp và đơn vị nhập báo cáo không được gọi API xóa.

## Dữ liệu và API

- Migration bổ sung `daily_report_leaders.deleted_at` trong `server/daily-reports/extended-schema.js`;
  được áp dụng tự động bằng cơ chế schema hiện có, chạy lại không tạo trùng.
- `DELETE /api/bao-cao-ngay/leaders/:id`: xóa một người khỏi danh sách.
- `DELETE /api/bao-cao-ngay/leaders` với `{ "ids": ["uuid", "uuid"] }`: xóa hàng loạt, tối đa 500 lựa chọn.
- Một giao dịch cho cả nhóm; mã trùng chỉ xử lý một lần. Nếu có mã không còn tồn tại/đã xóa,
  trả lỗi 409 và không xóa một phần. Mỗi người được xóa đều có nhật ký `LEADER_DELETED`.
- Đây là xóa khỏi danh sách bằng dấu `deleted_at`, không xóa vật lý hàng đang được báo cáo tham chiếu.
  Bản chụp người ký và tệp Word đã xuất được giữ nguyên. Người đã xóa không thể được chọn cho lần xuất mới,
  chỉnh sửa, lưu trữ hay khôi phục qua chức năng lưu trữ cũ.
- Mã chính: `server/daily-reports/leader-deletion.js`, `server/daily-reports/routes.js`,
  `assets/js/daily-reports-leaders.js`, `assets/js/daily-reports-workspace.js`,
  `assets/css/daily-reports-leaders.css`.

## Kiểm chứng thực tế

| Lệnh | Kết quả |
| --- | --- |
| `node tests/daily-reports-integration.mjs` | PASS, 471 kiểm tra, exit 0 |
| `node tests/daily-reports-main-app.mjs` | PASS, 119 kiểm tra, exit 0; không có lỗi trình duyệt/API ngoài dự kiến |
| `npm run verify:ai` | PASS, 57/57 kiểm tra, exit 0 |
| `git diff --check` | exit 0 |

Các thao tác xóa được chạy trên database/schema kiểm thử tạm. Đã kiểm tra tự tải ở cả hai trang,
hủy xóa, xóa đơn, xóa nhiều, giữ nguyên mục không chọn, chọn tất cả/chọn một phần,
đặt lại biểu mẫu, loại người đã xóa khỏi lựa chọn người ký và giao diện desktop/mobile.
API kiểm tra quyền, dữ liệu sai, tính nguyên tử, nhật ký, bản nháp và báo cáo lịch sử;
checksum tệp Word tải lại sau khi xóa người ký giống hệt trước khi xóa.

Lần kiểm tra giao diện đầu phát hiện CSS thẻ chung ghi đè căn giữa hộp xác nhận.
Đã sửa bằng CSS giới hạn trong hộp xác nhận của Báo cáo ngày và chạy lại thành công.

Máy chủ phát triển đã khởi động lại với migration và API mới. Kiểm tra lúc
2026-10-29T08:45:27Z xác nhận đủ 2 lãnh đạo và 21 vụ việc đang có, checksum dữ liệu giữ nguyên,
không xóa lãnh đạo thực tế nào; tài khoản đơn vị bị chặn xóa với HTTP 403.

Bằng chứng:

- `outputs/bcn-leader-delete-qa/browser-results.json`
- `outputs/bcn-leader-delete-qa/live-results.json`
- `outputs/bcn-leader-delete-qa/dialog-measurements.json` và ảnh desktop/mobile trong cùng thư mục
- `outputs/daily-reports-qa/integration-results.json`
- `outputs/daily-reports-menu-qa/main-app-results.json`

Không còn lỗi được ghi nhận trong phạm vi yêu cầu. Chưa kiểm thử trên máy chủ production;
không publish, deploy hoặc push.
