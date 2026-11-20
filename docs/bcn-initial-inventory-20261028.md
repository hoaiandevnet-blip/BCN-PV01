# Kiểm kê 13 miền Báo cáo ngày

Kiểm kê mã nguồn repository và test hiện hữu trước phần hoàn thiện ở lượt này.
`DONE` yêu cầu luồng UI/API/permission và test chạy; có bảng hoặc endpoint riêng lẻ
không đủ điều kiện DONE. Test ghi ở cột cuối là bằng chứng đã chạy, không phải đề xuất.

| STT | Nhóm chức năng | Model/DB | Service/API | Permission server | Menu/route UI | Test đã chạy | Trạng thái | Chứng cứ và thiếu sót |
|---:|---|---|---|---|---|---|---|---|
| 1 | Đơn vị và phân quyền | `daily_report_user_roles`; dùng `users.team_id`, `teams`, `departments` | `GET /scope`, `PUT/DELETE /user-roles` | `authorize`, `requireRole`, `canAccessUnitScope` | Sidebar `dailyReports`; chưa có màn hình gán scope | rules test scope | PARTIAL | [`server/daily-reports/routes.js`](server/daily-reports/routes.js), [`schema.js`](server/daily-reports/schema.js), [`rules.js`](server/daily-reports/rules.js). Không có UI gán unit/role; tài khoản thiếu `team_id` hiện trả `unitId:null`; mapping dữ liệu thật và cấp quyền vẫn cần cấu hình. |
| 2 | Tiếp nhận báo cáo ngày | cases, events, submissions, returns | `GET/POST /cases`, `GET/PATCH /cases/:id`, events, submit | reporter + unit scope + cutoff | `#dailyReports`, nhập vụ việc/danh sách | rules test state/cutoff | PARTIAL | Intake và gửi có API, nhưng form chưa hỗ trợ sửa/diễn biến/lịch sử; version event chưa có snapshot đầy đủ trường. |
| 3 | Kho vụ việc/tra cứu | `daily_report_cases`, events, submissions | `GET /cases`, `GET /cases/:id` | Own unit/assigned PV01 | Danh sách hồ sơ trong ngày | chưa có API integration | PARTIAL | Chỉ truy vấn ngày hiện tại với state/business/text; thiếu bộ lọc liên ngày, loại/tội danh/đối tượng/quyết định và trang lịch sử. |
| 4 | Tình hình khiếu kiện | `daily_report_situations` | `POST /situations`, `POST /situations/:id/verify` | reporter/unit, PV01 verify | Chưa có form/list trên UI | chưa có | PARTIAL | Sáu mã nhãn có validation; thiếu sửa/trả/lịch sử/UI và lưu tách biệt khỏi nhóm công tác khác. |
| 5 | Kết quả công tác/chỉ tiêu phòng | `daily_report_metrics` | `GET /metric-definitions`, `POST /work-results`, verify | `assertMetricPermission`, assignment | Chưa có UI | rules test cấp PHONG | PARTIAL | API giới hạn ba mã chuyên trách; thiếu định nghĩa chi tiết và UI. Hệ chỉ tiêu general chưa cấu hình theo đơn vị. |
| 6 | Khóa 10h/mở 30 phút | unlock requests, approved_at/expires_at | request/list/decide; `reportingScope` | unit-bound scope, PV01 decision | Form yêu cầu mở khóa/list | rules test cutoff và expiry; chưa test API | PARTIAL | Quy tắc giờ và grant có ở server. Chưa có UI chọn được ID scope trước khi tạo nguồn mới, hết hạn dẫn xuất chứ chưa có worker; không có test concurrency/API. |
| 7 | Trả/gửi lại/xác minh | submissions, returns, outbox | submit/return/verify | reporter own unit, PV01 review | nút gửi/xác minh/trả | rules test state machine | PARTIAL | Luồng case cơ bản có API; thiếu UI phản hồi/lịch sử và test route. Nguồn tình hình/metric chưa có submit/return workflow đầy đủ. |
| 8 | Trùng liên ngày | `daily_report_duplicate_decisions` | chỉ `POST /duplicates/decisions` | PV01 + unit access hai hồ sơ | Chưa có UI | chưa có | MISSING | Không có endpoint gợi ý candidates, matched reasons, prior-day evidence, cảnh báo draft hay test; quyết định API hiện tại không enforce hết hậu quả thống kê. |
| 9 | Danh mục luật/BLHS | legal_versions, legal_articles | import draft, publish | BCN_ADMIN/LEGAL_REVIEWER | Chưa có UI | chưa có | PARTIAL | Import chỉ tạo metadata; không import articles/mapping/diff/review endpoint; publish cho phép DRAFT trực tiếp và không có rollback/version browsing. |
| 10 | Composer/chọn ý/bản nháp | drafts, draft_items | create draft, list composer items, update draft items, export | PV01 | Chưa có UI | DOCX test không cover composer | PARTIAL | API có tích chọn/snapshot/edited_text, nhưng chưa có giao diện và export gate không chặn mọi trạng thái nguồn/duplicate unresolved; chưa có filter/stale alerts. |
| 11 | Danh sách lãnh đạo | leaders | list/create/archive/restore | PV01 read, BCN_ADMIN manage | Chưa có UI | chưa có | PARTIAL | API cơ bản; thiếu update/effective validation/UI; signer required khi xuất ngoài bản tin, nhưng lựa chọn chưa có trên màn hình. |
| 12 | 4 DOCX và preview NĐ30 | exports snapshot/hash, DOCX engine | create export/download/preview | PV01 | Chưa có UI | 2 test DOCX templates; sample render được tạo trước | PARTIAL | Bốn DOCX sinh được. Preview yêu cầu `DAILY_REPORT_DOCX_RENDERER`, chưa cấu hình trong môi trường; chưa đối chiếu mẫu chính thức/NĐ30 với đơn vị. |
| 13 | Notifications/audit | outbox, audit, notification reads | notifications/list/read; outbox writes | module + roles; file routes PV01 | Chưa có UI | chưa có | PARTIAL | API đọc thông báo và audit ghi rải rác; chưa có worker/retry/expiry/stale events đầy đủ hoặc lịch sử audit UI/test. |

## Kiểm thử nền trước lượt hoàn thiện

- `node --test tests/daily-reports-rules.test.mjs tests/daily-reports-docx.test.mjs`: 8/8 đạt.
- `node --check` cho route/schema/docx/client: đạt.
- `ensureDailyReportSchema` chạy trong transaction PostgreSQL rồi rollback: đạt; không lưu migration.
- Chưa có integration test HTTP trên DB fixture, browser test hay staging smoke.

## Ghi chú triển khai

Schema được gọi từ startup (`server/index.js`) và chưa có migration runner riêng.
Không chạy migration bền vững vì chưa có backup/restore drill an toàn. Mẫu DOCX hiện là
fixtures kỹ thuật, không thay thế mẫu gốc/được duyệt nêu trong handoff.
