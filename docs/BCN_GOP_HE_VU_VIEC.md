# Gộp hai nhóm Hệ vụ việc

Cập nhật ngày 29/10/2026.

| Trước đây | Hiển thị sau khi gộp |
| --- | --- |
| Phạm pháp hình sự, Khác, PCCC / CNCH, Tai nạn giao thông, Trật tự xã hội | Phạm pháp hình sự |
| Kinh tế, Tham nhũng / Chức vụ | Kinh tế, chức vụ |

Giữ nguyên Tệ nạn xã hội, Ma túy, Môi trường, An ninh quốc gia, Công nghệ cao, Hoạt động tư pháp,
Tình hình khác và lối vào Tình hình khiếu kiện. Tình hình khác không được gộp với Khác.

## Hành vi

- Danh sách nhập vụ việc chỉ còn một lựa chọn cho mỗi nhóm mới.
- Điều luật của mọi nhóm thành phần vẫn hiện khi chọn nhóm mới, gồm cả văn bản tham khảo đi kèm
  và danh mục đã thẩm định. Liên kết và nội dung nguồn được giữ nguyên.
- Tra cứu vụ việc, tra cứu luật và lọc nguồn tổng hợp dùng cùng nhóm. Hồ sơ mang mã hệ cũ vẫn được tìm thấy.
- Hồ sơ mới được lưu bằng mã `PPHS` hoặc `KINH_TE`. API vẫn nhận biết các mã cũ để tương thích.
- Không migration, không cập nhật hàng loạt hoặc xóa hồ sơ cũ; giữ nguyên bản chụp lịch sử và danh mục luật gốc.
- Quy tắc nhập Tên vụ việc chỉ dành cho Tình hình khác, phân quyền đơn vị và quy trình khiếu kiện vẫn giữ nguyên.
- Không đổi mẫu Word, quy tắc xác minh hoặc quy tắc ghi nhận thống kê.

## Kiểm chứng

- `node tests/daily-reports-integration.mjs`: PASS, 435 kiểm tra, bao gồm nhóm cũ/mới, các hệ giữ nguyên,
  chọn điều luật tham khảo/đã thẩm định và bảo toàn dữ liệu cũ.
- `node --test tests/daily-reports-bundled-legal.test.mjs`: PASS, 4/4 kiểm tra dữ liệu luật và checksum nguồn.
- `node tests/daily-reports-main-app.mjs`: PASS, 112 kiểm tra giao diện; gồm danh sách hệ, chọn điều luật,
  lọc hồ sơ cũ và lọc nguồn tổng hợp theo hai nhóm mới.
- `npm run verify:ai`: exit 0, 57/57 kiểm tra.
- Kiểm tra trình duyệt trực tiếp máy chủ hiện tại: danh sách mới đúng, đủ điều luật thành phần,
  Ma túy và luồng Tình hình khác/khiếu kiện hoạt động như trước; 21 hồ sơ test không bị thay đổi.

Bằng chứng tại `outputs/bcn-merged-domains-qa/`,
`outputs/daily-reports-qa/integration-results.json` và `outputs/daily-reports-menu-qa/main-app-results.json`.

Máy chủ phát triển đã nạp backend mới. Không publish/deploy/push; chưa kiểm thử triển khai production.
