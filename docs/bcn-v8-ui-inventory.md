# Đối chiếu giao diện BCN với HTML V8

Nguồn: `/Users/apple/Downloads/MO_THU_MODULE_BCN_V8_XEM_TRUOC_ND30.html`.
Chỉ áp dụng 11 màn hình của Báo cáo ngày; sidebar và shell dùng quy chuẩn hệ thống hiện tại.
Dữ liệu minh họa, đổi vai trò/giờ giả lập và tên lãnh đạo mẫu không nhập vào dữ liệu vận hành.

| Màn hình | Thiếu trước lượt này | Hướng tích hợp |
| --- | --- | --- |
| Tổng quan | KPI, phân bố đơn vị, hồ sơ gần đây, giờ tiếp nhận | Tổng hợp API theo scope, banner thời gian server |
| Nhập dữ liệu | Nhãn hệ, tên vụ việc, quyết định, lựa chọn luật, chuyển loại nhập | Form thật với dữ liệu danh mục, giữ scope/cutoff server |
| Tra cứu | Nhãn trạng thái, thời gian/đơn vị, xóa bộ lọc | Mở rộng bộ lọc và bảng đang có |
| Danh mục pháp luật | KPI, tra số điều/hệ, nội dung điều, nguồn, xuất JSON | Dùng phiên bản thật, thêm nội dung điều và nhập định dạng V8 |
| Báo cáo bị trả lại | Lịch sử trả lại và form phản hồi đầy đủ | Lọc hồ sơ đã từng bị trả, form lý do/yêu cầu/giải trình |
| Cập nhật / Bổ sung | Danh sách theo dõi, form quyết định, lịch sử | Lọc hồ sơ cần xử lý hoặc có diễn biến, giữ mã hồ sơ |
| Mở khóa 30 phút | Bảng trạng thái, nút duyệt/từ chối riêng | API grant theo đúng đơn vị/ngày/đối tượng |
| Kiểm tra trùng liên ngày | Bảng cặp ứng viên và kết luận | API ứng viên/decision hiện có, phân trang xét hồ sơ |
| Tổng hợp báo cáo | Chọn hàng loạt theo lọc, KPI, metadata, A4 live preview | Nháp/version thật, metadata/snapshot và cùng model nội dung DOCX |
| Phân quyền | Ma trận đọc được, danh sách user/unit có tên | Giữ phân công/cấu hình thật, bổ sung ma trận giải thích |
| Lịch sử xử lý | Timeline, lọc và thông báo dễ đọc | Dữ liệu audit/outbox thực tế |

Các quy tắc quyền, thời gian, xác minh và lịch sử server được giữ nghiêm hơn bản mô phỏng.

## Kết quả thực hiện V8

Cả 11 màn hình đã tích hợp vào `dailyReports` trong ứng dụng chính và mở được bằng sidebar theo quyền.
Không có ứng dụng độc lập, iframe demo hay cơ chế lưu dữ liệu nghiệp vụ bằng localStorage.

| Màn hình | Mã triển khai | API chính | Bằng chứng |
| --- | --- | --- | --- |
| Tổng quan | `daily-reports-v8-view.js`, `daily-reports-presentation.js` | `GET /overview`, `/scope` | API đối chiếu KPI với DB, giới hạn đơn vị; `main-overview.png` |
| Nhập dữ liệu | `daily-reports-v8-view.js`, `daily-reports.js`, `daily-reports-workspace.js` | `/cases`, `/situations`, `/work-results` | Chrome nhập hồ sơ có tên/thời gian, chỉ tiêu được giao; API lưu quyết định ban đầu |
| Tra cứu vụ việc | `daily-reports.js`, `daily-reports-workspace.js` | `GET /cases`, `/cases/:id` | Lọc đúng hồ sơ vừa nhập, tìm tên/số quyết định/đối tượng, mở lịch sử |
| Danh mục pháp luật | `daily-reports-presentation.js`, `legal-routes.js` | `/legal/articles`, `/legal/versions`, `/legal/import-drafts`, `/:id/discard` | Nội dung điều luật, nhập/diff/review/publish/retire; Chrome xem phiên bản |
| Báo cáo bị trả lại | `daily-reports-navigation.js`, `daily-reports.js` | `/cases?has_returns=true`, `/return`, `/submit` | API giữ hồ sơ từng bị trả sau xác minh lại; Chrome mở màn riêng |
| Cập nhật / Bổ sung | `daily-reports-workspace.js` | `/cases?followup=true`, `/cases/:id/events` | API giữ mã ổn định, có diễn biến mới; Chrome mở màn riêng |
| Mở khóa 30 phút | `daily-reports.js`, `rules.js`, `routes.js` | `/unlock-requests`, `/:id/decide` | API kiểm mốc 10h, hết hạn, duyệt/từ chối, ngày/phạm vi; màn riêng |
| Kiểm tra trùng liên ngày | `daily-reports-presentation.js`, `registry-services.js` | `/duplicates/candidates`, `/duplicates/decisions` | Chrome tải cặp và lưu kết luận độc lập; API ba hướng xử lý, chặn đếm/xuất trùng |
| Tổng hợp báo cáo | `daily-reports-composer*.js`, `daily-reports-preview.js`, `daily-reports-document-model.mjs` | `/composer/items`, `/drafts`, `/:id/items`, `/:id/exports` | Chrome chọn hàng loạt/lọc/biên tập/lưu/mở lại/A4/DOCX; metadata và người ký được giữ |
| Phân quyền | `daily-reports-configuration.js`, `daily-reports-workspace.js` | `/role-assignments`, `/user-roles`, `/configuration/*`, `/leaders` | Chrome quản trị; API từ chối ngoài vai trò/đơn vị; cấu hình và ma trận quyền |
| Lịch sử xử lý | `daily-reports-workspace.js` | `/notifications`, `/audit` | Timeline/lọc/đánh dấu đọc; API scope, audit bất biến, thông báo hết hạn chỉ một lần |

Tên file frontend trong bảng ở `assets/js/`; backend ở `server/daily-reports/`.
API có tiền tố `/api/bao-cao-ngay`. Ảnh và báo cáo nằm trong `outputs/daily-reports-v8-qa/`.

Sidebar chỉ dùng class mặc định `nav-group`, `nav-group-toggle`, `nav-submenu`, `nav-item`.
`daily-reports-navigation.css` không ghi đè màu, chữ, nền hay active state.
Test main app so sánh computed style với menu Quản lý cán bộ: cùng màu nền/chữ, font, bo góc và padding.

Phần dữ liệu thực tế cần người quản trị nhập/phê duyệt vẫn gồm danh mục luật, bộ chỉ tiêu,
phân công và lãnh đạo. Không tự đưa 126 điều mẫu chưa thẩm định trong HTML vào database.
Xem [báo cáo kiểm thử V8](../outputs/daily-reports-v8-qa/REPORT.md).
