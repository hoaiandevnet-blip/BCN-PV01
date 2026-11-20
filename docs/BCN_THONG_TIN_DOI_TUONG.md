# Thông tin đối tượng trong Báo cáo ngày

Cập nhật và kiểm chứng ngày 29/10/2026.

## Cách sử dụng

- Trong Nhập dữ liệu → Tạo mới vụ việc, chọn số đối tượng từ 1 đến 100.
- Sau khi chọn, biểu mẫu hiện đúng số nhóm thông tin tương ứng.
- Mỗi đối tượng bắt buộc có họ tên, giới tính, ngày sinh, số CCCD, thường trú và nơi ở hiện tại.
- Các trường bắt buộc có dấu sao đỏ. CCCD gồm 12 chữ số, giữ nguyên số 0 đầu; ngày sinh phải hợp lệ,
  không ở tương lai. Các trường văn bản không chấp nhận chỉ có khoảng trắng.
- Khi giảm rồi tăng số lượng trước khi lưu, thông tin đã nhập được giữ tạm trong biểu mẫu.
  Chỉ số đối tượng đang chọn được lưu. Lưu thành công hoặc đặt lại biểu mẫu sẽ xóa phần nhập tạm.
- Chi tiết hồ sơ cho phép sửa theo quyền và trạng thái hiện có. Hồ sơ đã gửi hiển thị thông tin để xem lại.

## Dữ liệu và tương thích

Thông tin được lưu trong cột JSONB `daily_report_cases.persons` hiện có, không cần migration mới.
API tạo/sửa gửi `person_count` và mảng `persons` có số phần tử khớp nhau. Mỗi phần tử gồm:
`name`, `gender`, `date_of_birth`, `identity_number`, `permanent_address`, `current_address`.
Giới tính dùng `MALE`, `FEMALE`, `OTHER`. Mã tham chiếu cũ được giữ nếu có.

API kiểm tra lại toàn bộ dữ liệu; không chỉ dựa vào kiểm tra của trình duyệt.
Thông tin đối tượng được lưu vào bản chụp khi gửi báo cáo. Tra cứu và đối chiếu trùng hỗ trợ CCCD.

Hồ sơ cũ vẫn đọc được, không tự thêm thông tin giả. Khi sửa các trường khác qua API, phần đối tượng
không gửi lên được giữ nguyên. Hồ sơ nháp cũ thiếu thông tin đối tượng cần bổ sung trước khi gửi lại.
Quyền xem/sửa, phạm vi đơn vị và giờ khóa báo cáo tiếp tục theo quy tắc hiện có.

## Kết quả kiểm chứng

| Lệnh / kiểm tra | Kết quả |
| --- | --- |
| `node tests/daily-reports-integration.mjs` | PASS — 369 kiểm tra |
| `node tests/daily-reports-main-app.mjs` | PASS — 103 kiểm tra, không có lỗi |
| `npm run verify:ai` | Exit 0 — 57 kiểm tra đạt |
| Trình duyệt trên máy chủ hiện tại, đăng nhập tài khoản demo cấp xã | PASS — 100 lựa chọn và một lựa chọn trống, 6 trường bắt buộc/đối tượng |
| Xem hồ sơ cũ và kiểm đếm bộ dữ liệu test đã tạo | PASS — 21 vụ việc vẫn còn, không có lỗi JavaScript |

Đã kiểm tra tạo 100 đối tượng, nhập thiếu/sai bị từ chối, sửa địa chỉ, giữ số 0 đầu CCCD, xem sau khi gửi,
phạm vi truy cập khác đơn vị, biểu mẫu trên màn hình máy tính và điện thoại, cùng các luồng hồi quy hiện có.

Bằng chứng:

- `outputs/daily-reports-qa/integration-results.json`
- `outputs/daily-reports-menu-qa/main-app-results.json`
- `outputs/bcn-persons-qa/verify-ai.log`
- `outputs/bcn-persons-qa/live-results.json`
- `outputs/bcn-persons-qa/entry-desktop.png`
- `outputs/bcn-persons-qa/entry-mobile.png`
- `outputs/bcn-persons-qa/saved-persons.png`

Máy chủ phát triển đã được khởi động lại để nạp kiểm tra API mới. Không publish, deploy hoặc push.
Không có lỗi còn ghi nhận trong phạm vi thay đổi này. Chưa kiểm thử triển khai trên máy chủ production.
