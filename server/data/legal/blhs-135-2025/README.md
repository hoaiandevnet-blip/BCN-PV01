# Danh mục tra cứu tội danh kèm dự án

Nguồn: Văn bản hợp nhất **135/VBHN-VPQH**, Văn phòng Quốc hội, ngày **05/09/2025**.
Đối chiếu nguồn ngày 29/10/2026:

- Trang công bố: https://vanban.chinhphu.vn/?docid=215260&pageid=27160
- PDF gốc: https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/9/135-vbhn-vpqh.pdf

## Các tệp cần giữ khi chuyển máy chủ

- `source.pdf`: nguyên bản 277 trang từ Cổng thông tin điện tử Chính phủ.
- `catalogue.json`: 315 mục tội danh, số điều, chương, trang nguồn và nhóm tra cứu gợi ý.
- `manifest.json`: SHA-256 của PDF và JSON; máy chủ kiểm tra trước khi trả dữ liệu.

Giữ toàn bộ thư mục này trong mã nguồn. Dockerfile hiện tại dùng `COPY . .` và không loại thư mục này.
Ứng dụng đọc tệp tương đối với module máy chủ, không phụ thuộc đường dẫn máy lập trình hoặc thư mục chạy.
Không cần Internet, Python hoặc nhập database để hiển thị bản tra cứu này trên máy chủ.
Không tự tải văn bản mới hay tự thay đổi phiên bản pháp luật khi khởi động.

## Phạm vi và cách lọc

Trích các tiêu đề bắt đầu bằng “Tội” trong Phần thứ hai, Chương XIII–XXVI, Điều 108–425,
bao gồm Điều 217a và 256a. Có 320 tiêu đề điều trong phạm vi, loại 5 điều:

- 122: hình phạt bổ sung;
- 292: đã bãi bỏ;
- 352 và 367: khái niệm chung;
- 392: những người phải chịu trách nhiệm hình sự về các tội thuộc chương.

Mỗi dòng là **một điều có tội danh**, không phải một khoản hay thống kê số hành vi phạm tội riêng biệt.
Không cắt ghép nội dung khung hình phạt; liên kết tại chi tiết mở nguyên bản PDF đúng trang để đọc đầy đủ.
Chú thích sửa đổi và quy định chuyển tiếp vẫn nằm trong PDF gốc.

Nhóm nghiệp vụ là gợi ý tra cứu dựa trên chương và nhóm điều, **không phải phân công nghiệp vụ đã phê duyệt**.
Không dùng ngày hợp nhất làm ngày hiệu lực chung. Trạng thái `REFERENCE` chỉ dùng cho bản tra cứu từ tệp.
Không tự chèn vào bảng pháp luật nghiệp vụ, không tự duyệt/công bố và không đổi căn cứ của hồ sơ đã lưu.
Muốn dùng làm căn cứ gắn hồ sơ: người có quyền nhập, thẩm định nhóm và hiệu lực, rồi công bố qua luồng sẵn có.

## Tạo lại và kiểm tra

Công cụ trích nằm tại `scripts/daily-reports/legal/build-catalogue.py`, cần Python với `pdfplumber`.
Chỉ chạy khi chủ động cập nhật gói; không chạy trong lúc khởi động máy chủ.

```sh
python3 scripts/daily-reports/legal/build-catalogue.py
node --test tests/daily-reports-bundled-legal.test.mjs
node tests/daily-reports-integration.mjs --browser
node tests/daily-reports-main-app.mjs
npm run verify:ai
```

Công cụ bỏ ký hiệu chú thích nhỏ và ghép các dòng tiêu đề, kiểm đủ số điều và đủ 14 chương.
Khi đổi nguồn phải cập nhật URL, số/ngày văn bản, quy tắc trích và kiểm tra lại với bản gốc.

API dùng quyền truy cập Báo cáo ngày hiện có:

- `GET /api/bao-cao-ngay/legal/bundled`: thông tin nguồn.
- `GET /api/bao-cao-ngay/legal/bundled/articles?q=&business_code=`: tra cứu.
- `GET /api/bao-cao-ngay/legal/bundled/source`: PDF nguyên bản.
- `GET /api/bao-cao-ngay/legal/bundled/download`: toàn bộ JSON, không bị giới hạn bởi bộ lọc.

Màn hình Danh mục pháp luật tự chọn bản kèm dự án khi chưa có phiên bản đã công bố.
Khi có phiên bản nghiệp vụ đã công bố, giao diện ưu tiên luồng hiện tại; bản kèm dự án vẫn chọn được ở ô Phiên bản.
