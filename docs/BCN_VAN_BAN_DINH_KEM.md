# Văn bản đính kèm trong Báo cáo ngày

## Sử dụng

- Trong **Nhập dữ liệu**, chọn văn bản tại phần cuối biểu mẫu vụ việc, tình hình khiếu kiện
  hoặc kết quả công tác. Có thể chọn nhiều lần và bỏ từng tệp trước khi lưu.
- Hồ sơ và tệp được lưu cùng một giao dịch. Nếu lưu bị từ chối do hết giờ, tệp đang chọn được giữ lại
  để đơn vị gửi yêu cầu mở khóa và thử lại.
- Trong chi tiết vụ việc hoặc nút **Văn bản đính kèm** của kết quả đã nhập, người được phân công
  có thể tải văn bản gốc. PDF và ảnh có thêm nút **Xem**.
- Khi hồ sơ còn nháp hoặc được trả lại, đơn vị có thể thêm văn bản. Chỉ văn bản chưa từng gửi
  mới được xóa. Văn bản đã gửi được giữ nguyên để đối chiếu phiên bản.
- Với vụ việc đã xác minh, sử dụng **Bổ sung diễn biến hôm nay** để đính kèm quyết định mới.
  Tệp gắn với diễn biến/ngày bổ sung, đi theo thông báo nghiệp vụ hiện có đến cán bộ tổng hợp.

Định dạng: PDF, DOC, DOCX, XLS, XLSX, JPG/JPEG, PNG. Tối đa 10 tệp và 20 MB cho mỗi nguồn;
mỗi tệp tối đa 10 MB. Word/Excel được tải về để mở bằng phần mềm tương ứng.

## Lưu trữ và vận hành

- Migration bổ sung nằm trong `server/daily-reports/attachment-schema.js`, được gọi từ
  `ensureDailyReportSchema` khi máy chủ khởi động; có thể chạy lặp lại, không xóa bảng/dữ liệu hiện hữu.
- Bảng `daily_report_attachments` lưu metadata, nội dung nguyên bản (`bytea`), SHA-256 và khóa ngoại
  đến vụ việc, diễn biến, tình hình hoặc kết quả công tác. Không có tệp công khai trong thư mục web.
- Sao lưu/khôi phục PostgreSQL của dự án bao gồm văn bản đính kèm. Khi chuyển máy chủ cần chuyển cả
  database; không chỉ sao chép mã nguồn. Không có thư mục upload riêng phải đồng bộ cho tính năng này.
- API JSON của BCN giới hạn 30 MB sau kiểm tra phiên đăng nhập; nội dung tệp nhị phân tối đa 20 MB
  được mã hóa trong request. Reverse proxy, nếu sử dụng, cần cho phép request ít nhất 30 MB.
- Kiểm tra định dạng được thực hiện ở máy chủ bằng tên mở rộng, chữ ký nội dung và cấu trúc Word/Excel
  dạng ZIP. Hạn mức được kiểm tra lại trong giao dịch khóa dòng nguồn.
- API dùng cùng phạm vi đơn vị, vai trò và cửa sổ nhập/mở khóa hiện có. Đường dẫn tải không phải
  liên kết công khai. Tải xuống, thêm và xóa được ghi nhật ký.
- Khi gửi hồ sơ, danh sách tệp và mã kiểm tra được đưa vào snapshot; tài liệu đã gửi bị khóa chỉnh sửa.
  Tệp đính kèm là tài liệu nguồn để đối chiếu; chức năng không tự trích nội dung tệp vào mẫu Word tổng hợp.

## API

Với `resource` là `cases`, `events`, `situations`, `work-results`:

- `GET /api/bao-cao-ngay/{resource}/{id}/attachments`: danh sách metadata và quyền chỉnh sửa.
- `GET /api/bao-cao-ngay/{resource}/{id}/attachments/{attachmentId}`: tải bản gốc;
  `?inline=1` xem PDF/ảnh sau xác thực.
- `POST /api/bao-cao-ngay/{resource}/{id}/attachments`: thêm tệp khi nguồn nháp/trả lại.
  Diễn biến đã gửi không cho phép thêm bằng API này.
- `DELETE /api/bao-cao-ngay/{resource}/{id}/attachments/{attachmentId}`: xóa tệp chưa gửi.
- API tạo vụ việc, tình hình, kết quả và bổ sung diễn biến nhận thêm trường tùy chọn
  `attachments: [{ name, content }]`, với `content` là base64 không có tiền tố data URL.

Mã nguồn giao diện dùng chung: `assets/js/daily-reports-attachments.js` và
`assets/css/daily-reports-attachments.css`; CSS giới hạn trong `#dailyReports`.

## Kiểm chứng

- `node tests/daily-reports-integration.mjs`: tạo schema tạm và kiểm tra API/phân quyền/giới hạn,
  lưu nguyên bản, snapshot, khóa giờ, mở khóa theo phạm vi và thông báo bổ sung hồ sơ cũ.
- `node tests/daily-reports-main-app.mjs`: đăng nhập thật trên Chrome với database tạm,
  chọn/lưu/tải/xóa tệp, nhập các nguồn, kiểm tra mobile và luồng PV01 mở thông báo.
- `npm run verify:ai`: bộ kiểm tra hồi quy bắt buộc của dự án.

Kết quả và ảnh: `outputs/bcn-attachments-qa/`; kết quả toàn bộ API và trình duyệt lần lượt ở
`outputs/daily-reports-qa/integration-results.json` và `outputs/daily-reports-menu-qa/main-app-results.json`.
