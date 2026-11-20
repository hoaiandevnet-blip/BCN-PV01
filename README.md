# BCNPV01 — Báo cáo ngày & Bản đồ số

Phần mềm độc lập chạy trên máy, có mã nguồn, thư viện, dữ liệu địa giới, bộ dựng nền bản đồ,
đăng nhập và database PostgreSQL riêng tên **BCNPV01**.

## Mở phần mềm

Nhấp đúp **Mở BCNPV01.command**, hoặc chạy trong thư mục này:

```sh
npm run open
```

Địa chỉ mặc định: **http://localhost:4310**. Dùng tài khoản và mật khẩu đã có ở hệ thống trung tâm.
Đăng nhập hai phần mềm độc lập; thay đổi tài khoản hoặc quyền sau chuyển giao chỉ áp dụng tại phần mềm đang sửa.
Quản trị viên mở **Tài khoản & quyền** để tạo, sửa, khóa tài khoản, đặt mật khẩu và cấp quyền chức năng.
**Báo cáo ngày → Phân quyền** quản lý vai trò và phạm vi nghiệp vụ như trước.

Để chạy riêng máy chủ:

```sh
npm start
```

PostgreSQL trên máy phải hoạt động. Nền bản đồ đầy đủ dùng Docker Desktop:

```sh
docker compose -f docker-compose.maps.yml up -d maps
```

Dịch vụ bản đồ riêng là `bcnpv01-map-server`, cổng 8082; dữ liệu nằm trong `assets/map-data`.
Ảnh nền lưu trong `assets/map-tiles`. Dữ liệu nền địa lý không phải dữ liệu vụ việc thử.

## Quyền và nghiệp vụ giữ lại

- Quyền theo đơn vị; các vai trò UNIT_REPORTER, PV01_COMPILER, LEGAL_REVIEWER, AUDITOR và quyền quản trị.
- Phân công các mục con, phạm vi đơn vị, chỉ tiêu, ngày hiệu lực; tổng hợp PV01 chỉ có hiệu lực đúng đơn vị PV01.
- Nhập báo cáo, vụ việc, thông tin đối tượng, kết quả công tác, lĩnh vực, vũ khí và tuần tra.
- Trả lại, bổ sung, đối chiếu trùng, yêu cầu mở khóa sau 10:00 và hạn mở khóa 30 phút.
- Danh mục pháp luật, lãnh đạo ký, tổng hợp, xuất Word, đính kèm, lịch sử và thông báo.
- Bản đồ 95 phường/xã, tìm địa bàn, bộ lọc, kỳ dữ liệu, nhập Excel và thống kê. Theo quyền hiện hành,
  phân hệ bản đồ dành cho quản trị viên; API kiểm tra phiên thật, không tin header tự khai tài khoản.

Tài liệu quy ước đã chuyển sang `docs/`. `docs/source-manifest.json` ghi checksum mã nguồn lúc tiếp nhận.
Các file đã sửa khi tách được mô tả trong `docs/HANDOVER.md`.

## Dữ liệu và vận hành

Tài khoản, mật khẩu đã băm, danh mục và phân công được chuyển; dữ liệu nghiệp vụ thử không được nhập vào database mới.
File cấu hình `.env` trỏ riêng tới `BCNPV01`. Mật khẩu không nằm trong frontend.
Bản đính kèm mới lưu ở `.private/report-files`, chỉ được truy cập qua API có kiểm tra quyền.
Máy chủ chỉ phục vụ `/assets`, trang chủ và API; không phục vụ cấu hình hoặc mã nguồn server.

`server/` giữ API và kiểm soát quyền; `assets/js/standalone/` giữ khung đăng nhập, tài khoản và danh mục.
Các module nghiệp vụ giữ cấu trúc `server/daily-reports/`, `assets/js/daily-reports*` và `digital-map*`.
Có thể di chuyển toàn bộ thư mục này; database PostgreSQL vẫn nằm trong dịch vụ PostgreSQL trên máy.
Cần sao lưu database riêng khi chuyển sang máy khác, cùng `.private/report-files` và các thư mục bản đồ.

## Kiểm chứng

```sh
npm test
npm run verify
```

`npm test` kiểm tra quyền, thời gian khóa, mẫu Word và danh mục luật.
`npm run verify` dùng database tạm `bcnpv01_test_*`, đặt mật khẩu ngẫu nhiên chỉ trong database tạm,
chạy Chrome thật và API rồi tự xóa database tạm. Không tạo dữ liệu thử trong BCNPV01.
Kiểm chứng trình duyệt hiện dùng Playwright được cài trong runtime Codex của máy này.
Kết quả và ảnh chụp nằm tại `outputs/`.

Các script `migrate.mjs`, `prepare-retirement.py`, `prepare-ai-retirement.py`, `retire-old.mjs`
là công cụ chuyển giao một lần, không chạy khi mở phần mềm. Không chạy lại migration trên database đang dùng.
