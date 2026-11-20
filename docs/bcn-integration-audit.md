# Audit tích hợp module Báo cáo ngày

Ngày audit: 2026-10-28

## Kiến trúc repository

- Ứng dụng chính là Node.js 24, Express 4, ES modules và PostgreSQL (`pg`).
- Server khởi tạo schema bằng các hàm `ensure*Schema` tại `server/index.js`; repository chưa có runner
  migration riêng cho các module hiện tại. Schema mới cần additive, idempotent và không backfill dữ liệu thật.
- Session hiện tại là cookie HTTP-only/SameSite Strict, xác thực qua `createSessionAuth` và bảng `users`.
- Tài khoản gắn với `teams` qua `users.team_id`; cấp đơn vị mô tả ở `departments.unit_type`; quyền module
  được cấp qua `modules`, `permissions`, `user_permissions`. Admin là quyền cấu hình hệ thống, không mặc
  định được đọc nội dung nghiệp vụ.
- Route modules được đăng ký trong `server/index.js` và dùng `auth.resolve`, `requireSameOrigin`, PostgreSQL.
- Giao diện hiện hữu là HTML tĩnh + vanilla JS/CSS; menu `data-module-key` và `data-page`, phân trang qua
  `showPage`, phân quyền module qua API quyền hiện có. Không dùng UI demo hoặc ứng dụng riêng.
- `docx` đã có trong dependencies. Không tìm thấy renderer trong PATH hệ điều hành mặc định; runtime
  Codex có `soffice` nhưng cần xác minh renderer production được phê duyệt trước khi dùng dữ liệu thật.
- Log chung có `activity_logs`; notification hiện tại dành cho login/tài sản, nên sự kiện Báo cáo ngày cần
  outbox riêng để không thay đổi ngữ nghĩa notification hiện hữu.

## Mapping tích hợp

| Nghiệp vụ | Tích hợp |
|---|---|
| Identity / đơn vị | `users`, `teams`, `departments`; bảng quyền theo vai trò Báo cáo ngày dùng ID tài khoản và team hiện có |
| API / auth | Router module mới đăng ký cạnh các route module; dùng session và SameSite/origin guard hiện có |
| Dữ liệu nghiệp vụ | Bảng `daily_report_*` additive: vụ việc, event, submission, tình hình, chỉ tiêu, mở khóa, đối chiếu, draft, lãnh đạo, luật, export |
| Audit / notification | Bảng audit/outbox riêng có redacted metadata và recipient scope |
| Giao diện | Thêm nav/page theo convention hiện tại, gọi API cùng origin, không lưu dữ liệu nghiệp vụ trong localStorage |
| Word | Một engine server-side `docx`, lưu artifact theo ID/hash/revision; preview chỉ từ DOCX đã tạo |

## Ràng buộc và rollout

- Repository tại thời điểm audit có nhiều thay đổi chưa commit, bao gồm `server/index.js`, `index.html`,
  package metadata và nhiều file mới. Không được reset/format/revert các thay đổi đó; tích hợp chỉ bằng các
  edit cục bộ, giữ nguyên phần không thuộc module.
- Tạo bảng/index và module permission bằng `IF NOT EXISTS`/`ON CONFLICT`, không xóa hay sửa dữ liệu cũ.
- Backup dùng quy trình sẵn có (`npm run backup` / `npm run db:backup`) trước khi chạy schema tại staging;
  chưa thực hiện backup hoặc migration trên production.
- Feature flag cần giữ ở trạng thái tắt cho đến khi đơn vị duyệt bộ chỉ tiêu, quy tắc PPHS, đơn vị thực,
  mẫu DOCX, danh sách lãnh đạo, nguồn pháp luật và môi trường phân loại dữ liệu.
- Rollback ứng dụng bằng cách tắt menu/route/module permission; giữ nguyên bảng và export mới. Không drop
  bảng trong rollback.

## Chưa đủ dữ liệu để nghiệm thu vận hành thật

Tài liệu bàn giao yêu cầu mẫu gốc 4 loại, cấu trúc báo cáo chính xác, bộ chỉ tiêu, mapping đơn vị, tiêu chí
thống kê PPHS, danh sách lãnh đạo và danh mục pháp luật đã thẩm định. Các nội dung đó chưa có trong bundle.
Không seed người thật hay tội danh giả làm dữ liệu production. Chỉ dùng fixture giả trong kiểm thử.
Không đưa dữ liệu mật ra cloud/AI/logs. Staging/production cần chủ quản xác nhận renderer Word và lưu trữ.
