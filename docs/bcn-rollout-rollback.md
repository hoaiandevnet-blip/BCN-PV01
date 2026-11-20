# Vận hành và rollback Báo cáo ngày

## Phạm vi đã kiểm chứng

Mã được tích hợp trực tiếp vào `server/index.js`, `index.html`, route `dailyReports`
và sidebar hiện hữu. Không có ứng dụng production thứ hai. Các trang `/qa/*` chỉ tồn tại
trong chương trình kiểm thử, không được đăng ký ở server chính.

Kiểm thử dùng database/schema tạm và tài khoản giả; các chương trình tự dọn đúng database,
schema và tiến trình do mình tạo. Không import dữ liệu hồ sơ thật vào fixtures.

## Trước khi kích hoạt trên môi trường vận hành

1. Xác nhận môi trường được phép xử lý dữ liệu tương ứng, nơi lưu DOCX và renderer nội bộ.
2. Sao lưu bằng cơ chế được đơn vị chấp thuận; kiểm tra phục hồi trên database riêng.
   Migration của module không thay thế quy trình backup/restore đầy đủ của toàn hệ thống.
3. Chạy `node scripts/daily-reports/migrate.mjs`. Lệnh mặc định mở transaction, kiểm tra schema,
   rồi **ROLLBACK**, không ghi bền vững. Kết quả phải là `BCN_MIGRATION_VALIDATED_AND_ROLLED_BACK`.
4. Khi có backup đã kiểm chứng, đặt `BCN_BACKUP_FILE` đến backup và chạy
   `node scripts/daily-reports/migrate.mjs --apply` theo quy trình vận hành.
   Kiểm tra file tồn tại chỉ là điều kiện kỹ thuật; không chứng minh backup phục hồi được.
5. Server chính vốn chạy `ensureDailyReportSchema` khi khởi động; vì vậy phải hoàn thành
   bước backup trước khi restart bản mã mới. Môi trường demo local đã được người dùng cho phép áp dụng và restart; xem lịch sử kích hoạt bên dưới.
6. Cấp quyền phân hệ trong **Hệ thống & Phân quyền**, gắn đơn vị công tác cho tài khoản.
   Trong **Báo cáo ngày → Phân công**, cấp vai trò/phạm vi/ngày hiệu lực và mã chỉ tiêu.
   Admin không tự có quyền nhập hoặc xem mọi hồ sơ nghiệp vụ.
7. Khai báo mã/nhóm đơn vị và bộ chỉ tiêu đã duyệt tại **Phân công → Cấu hình nghiệp vụ**.
   Định nghĩa chỉ tiêu có phiên bản, trường số nguyên không âm, phạm vi nhóm đơn vị,
   khoảng hiệu lực, công thức đối chiếu tổng và bước công bố. `GENERAL` cũng cần được giao.
8. Nhập danh mục luật được thẩm định và lãnh đạo có hiệu lực. Không đưa dữ liệu giả từ QA vào vận hành.
9. Đối chiếu bốn mẫu Word chính thức; `technical-v1` hiện là profile kỹ thuật, chưa phải mẫu đã duyệt.

## Biến cấu hình

- `DAILY_REPORT_STORAGE_ROOT`: thư mục tuyệt đối được bảo vệ, bên ngoài web root là lựa chọn vận hành phù hợp.
  Mặc định là `.daily-report-files` trong repository, thư mục dotfile không được middleware static mặc định phục vụ.
  Tải/preview đi qua API kiểm tra phiên/quyền/chủ bản xuất và SHA-256; file được tạo với mode `0600`.
- `DAILY_REPORT_DOCX_RENDERER`: đường dẫn executable LibreOffice cục bộ được phê duyệt.
  Preview đọc đúng DOCX đã xuất, kiểm tra hash và render PDF trong thư mục tạm, giới hạn 45 giây.
  Không gửi tài liệu lên dịch vụ cloud. Môi trường demo local dùng renderer đã kiểm thử; môi trường vận hành thật cần cấu hình riêng.

## Thông báo và theo dõi

Outbox nằm cùng PostgreSQL. BCN được hợp nhất vào quả cầu qua `/api/notifications` với ID `bcn:<id>`;
feed giao diện cập nhật mỗi 5 giây khi trang đang hiển thị, cập nhật ngay sau thao tác trong phiên hiện tại.
Đã đọc/đọc tất cả dùng chung receipt với API BCN cũ, tách theo tài khoản. Feed luôn kiểm tra lại quyền phân hệ,
phân công còn hiệu lực và phạm vi đơn vị; receipt cũ không cấp lại quyền. Thông báo chưa đọc không bị cắt
ở 200 bản ghi hay giới hạn tuổi hồ sơ; thông báo đã đọc theo cửa sổ 30 ngày của quả cầu hiện hữu.
Maintenance chạy mỗi 30 giây,
đánh dấu giao feed và ghi hết hạn grant/audit đúng một lần; lỗi transaction được thử lại ở tick sau.
API ghi luôn kiểm tra mốc hết hạn theo đồng hồ server, không phụ thuộc tick maintenance.
Nếu database gián đoạn, theo dõi log `BCN maintenance failed; retry next tick`; không ghi nội dung hồ sơ vào log này.

Audit truy cập ghi allow/deny; thay đổi nghiệp vụ có audit riêng. DB chặn UPDATE/DELETE trên audit,
revision bản nháp và snapshot xuất. Quyền DBA vẫn cần được quản trị ở hạ tầng.
Các việc còn cần kiểm chứng vận hành: backup/restore thật, fault injection worker khi mất DB,
retention, tải lớn và sandbox/quota renderer theo hạ tầng được duyệt.

## Rollback không mất dữ liệu

- Ngừng nhận ghi vào phân hệ và quay lại bản mã ứng dụng đã xác nhận trước đó theo quy trình vận hành.
- Tắt hiển thị/quyền phân hệ nếu bản ứng dụng trước chưa có BCN.
- Giữ nguyên mọi bảng `daily_report_*`, audit, snapshot và thư mục bản xuất.
- Không DROP bảng, không sửa/xóa hồ sơ và không chạy restore đè lên database đang hoạt động để rollback module.
- Migration chỉ cộng thêm bảng/cột/index/trigger của module; không có down migration phá dữ liệu.
- Nếu cần phục hồi toàn database, thực hiện quy trình riêng sau khi backup/restore đã được kiểm chứng.

## Dữ liệu cần đơn vị chốt

Danh sách/mã/nhóm đơn vị; quy tắc ngày/ca báo cáo; bộ chỉ tiêu và người phụ trách; tiêu chí PPHS;
bốn mẫu Word/nơi nhận/số ký hiệu; danh sách lãnh đạo; nguồn luật và mapping hiệu lực;
chính sách bảo mật và môi trường được phép xử lý. Không tự suy diễn dữ liệu này từ UI hoặc tên đơn vị.


## Cập nhật môi trường demo ngày 28/10/2026

Người dùng xác nhận dữ liệu hiện tại là test và cho phép thử dữ liệu mới. Đã áp dụng V8 vào database local ttttch_demo và khởi động lại cổng 3000. Chỉ môi trường demo local được bỏ backup bằng --apply --test-data-no-backup; mặc định và production vẫn yêu cầu backup. Dữ liệu test tạm đã dọn và kiểm tra 29 bảng giữ nguyên số bản ghi. Bằng chứng: outputs/daily-reports-v8-qa/REPORT.md.


## Cập nhật thông báo ngày 29/10/2026

Đã hợp nhất thông báo BCN vào quả cầu chung, bổ sung liên kết đến hồ sơ/diễn biến, yêu cầu mở khóa,
nguồn tình hình/kết quả công tác, bản tổng hợp và danh mục pháp luật. Hồ sơ cũ được thêm diễn biến theo
ngày bổ sung; PV01 xác minh rồi lựa chọn vào báo cáo ngày đó. Không tự cộng thành vụ việc mới.

Đã áp dụng cập nhật trigger và restart local cổng 3000 theo quyền đã được người dùng cấp.
Không tạo dữ liệu QA trong database đang dùng ở lượt này; dữ liệu thử nằm trong database/schema riêng
và tự dọn. Bằng chứng lệnh, ảnh giao diện và đối chiếu dữ liệu:
[outputs/daily-reports-notifications-qa/REPORT.md](../outputs/daily-reports-notifications-qa/REPORT.md).
