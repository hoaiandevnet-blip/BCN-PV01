# Seedy — trợ lý AI local của BCNPV01

## Dùng trợ lý

Đăng nhập BCNPV01 rồi bấm vào Seedy, hoặc mở menu `···` → **Trò chuyện với Seedy**.
Nút mầm cây trên thanh công cụ (hoặc menu điện thoại) vẫn dùng để ẩn/hiện pet.

- **Hỏi đáp / hướng dẫn:** nhập câu hỏi, Enter để gửi; Shift+Enter xuống dòng.
- **Tiến độ gửi:** hỏi trực tiếp “Có bao nhiêu đơn vị đã gửi và chưa gửi?”; không cần bật ô tóm tắt.
  Mặc định xem hôm nay theo giờ Việt Nam. Có thể ghi “hôm qua”, `10/11/2026` hoặc `2026-11-10`.
  Hỏi tiếp “Những đơn vị nào chưa gửi?” để xem tên đơn vị của cùng ngày.
  Danh sách hiển thị tối đa 25 tên và ghi rõ tổng số; xem đầy đủ tại Tổng quan.
  Hỏi “Tuần này đơn vị nào thiếu báo cáo nhiều ngày nhất?”, rồi “Thế còn tuần trước?”.
  Tuần bắt đầu từ thứ Hai. “So sánh tiến độ tuần này với tuần trước” đối chiếu cùng số ngày đã qua.
  Có thể ghi “7 ngày qua” hoặc “từ 01/11 đến 10/11” (tối đa 31 ngày).
- **Tóm tắt:** chọn **Tóm tắt số liệu theo mẫu**, chọn ngày rồi bấm **Gửi**.
- **Soạn nháp:** nhập yêu cầu và dữ kiện vào ô trò chuyện. Dùng **Sao chép** để lấy văn bản.
- **Báo cáo bị trả lại:** “Mở hồ sơ bị trả lại hôm qua của đơn vị tôi” mở màn hình với bộ lọc ngày trả lại gần nhất (hoặc ghi rõ “ngày báo cáo”)
  và liệt kê tối đa 25 hồ sơ vụ việc đang bị trả lại. “Soạn bổ sung cho báo cáo thứ hai” dùng nội dung hiện tại và
  yêu cầu trả lại mới nhất của đúng hồ sơ. “Gửi báo cáo đó” mở biểu mẫu để xem, sửa và xác nhận gửi.
- **Dừng:** ngắt câu trả lời và giải phóng lượt xử lý đang chiếm trên máy chủ.
- **Xóa trò chuyện:** xóa nội dung trong phiên trang hiện tại.

Trong câu trả lời, số liệu, ngày và tỉ lệ được nhấn đậm bằng màu chủ đạo; địa danh hành chính và tên đơn vị
được nhấn màu xanh. Địa danh lấy từ danh mục có sẵn trong ứng dụng, tên đơn vị từ nguồn dữ liệu được cấp quyền.
Định dạng chỉ thay đổi cách hiển thị; sao chép vẫn giữ nguyên nội dung và con số.

Khi tra cứu, máy chủ tính số liệu theo quyền của phiên hiện tại. Một lượt trong thống kê theo kỳ là
một đơn vị cần gửi trong một ngày. Gửi một phần và có nội dung bị trả lại vẫn được tính là đã gửi.
Ollama diễn giải câu hỏi ngoài mẫu quen thuộc và soạn bản nháp. Mọi lần gửi lại đều qua biểu mẫu nghiệp vụ.
Trò chuyện giữ trong bộ nhớ của trang; tải lại, đăng xuất hoặc hết phiên sẽ xóa lịch sử.
Không lưu cuộc trò chuyện vào PostgreSQL hoặc ghi nội dung vào log máy chủ.

## Cấu hình theo máy hiện tại

Máy được kiểm tra: MacBook Pro Apple M1, 8 GiB RAM; Ollama 0.40.16.
Model mặc định `qwen3.5:4b-q4_K_M` đã cài sẵn, không cần tải thêm.
Có lựa chọn nhẹ hơn `qwen2.5:3b` trong danh sách model local đã cài.

Thiết lập trong `server/seedy-ai/config.js`:

- Một yêu cầu suy luận đồng thời cho toàn BCNPV01.
- Context 4096 token; tối đa 640 token trả lời; tắt phần thinking của Qwen3.5.
- Giữ model trong RAM 60 giây sau lượt dùng cuối, sau đó Ollama tự giải phóng.
- Mỗi câu hỏi tối đa 1800 ký tự; lịch sử gửi model tối đa 2400 ký tự từ các cặp hỏi/đáp hoàn thành gần nhất.
- Kết nối cố định tới `http://127.0.0.1:11434`; chỉ chấp nhận các model GGUF local trong danh sách cho phép.

Ollama cần đang chạy trên máy chủ BCNPV01 để hỏi hướng dẫn và soạn nháp. Khi chưa chạy,
tra cứu tiến độ gửi và tóm tắt số liệu vẫn dùng được; cửa sổ chat có nút **Kiểm tra lại**.
Ứng dụng không đổi cấu hình Ollama toàn máy hoặc tự tải model.

## Kiến trúc

- Backend `server/seedy-ai/`: cấu hình/giới hạn, nguồn hướng dẫn, lấy số liệu theo quyền,
  client Ollama dạng streaming và API xác thực.
- `server/seedy-ai/questions/`: nhận diện câu hỏi tiến độ, phân tích ngày và trả lời bằng dữ liệu gốc.
  Hỏi tiếp sử dụng ngày từ câu hỏi trước, không lấy quyền hoặc số liệu từ lịch sử hội thoại.
- Frontend `assets/seedy-assistant/`: API streaming, trạng thái hội thoại, DOM an toàn,
  controller và CSS theo giao diện hiện có.
- Pet gọi `initializeAssistant()`; động tác làm việc/chờ trả lời gắn với yêu cầu AI.
- `GET /api/seedy/status`: trạng thái Ollama/model, profile máy và tài khoản của phiên.
- `POST /api/seedy/chat`: gửi câu hỏi, lịch sử giới hạn, model và nguồn ngữ cảnh.
  Phản hồi NDJSON gồm `meta`, `delta`, `done` hoặc `error`.

Số liệu được đọc qua API dashboard hiện có bằng đúng cookie và account binding của phiên,
không lấy quyền từ nội dung câu hỏi. Các tổng số được dựng thành bản tóm tắt có cấu trúc ngay trên máy chủ;
khi soạn bổ sung, chỉ tiêu đề, phần nội dung và lý do trả lại của hồ sơ được chọn đi vào yêu cầu model cục bộ.
Module `server/seedy-ai/daily/` phân loại lệnh, giới hạn công cụ, tính kỳ và xử lý hồ sơ theo quyền.
Nguồn hướng dẫn được chọn từ `knowledge.js` theo nội dung câu hỏi để hạn chế context trên máy RAM 8 GB.
Văn bản model được dựng bằng text node cùng các thẻ nhấn mạnh cho phép; không thực thi HTML/JavaScript.

## Kiểm chứng và nguồn kỹ thuật

- `npm test`: kiểm tra giới hạn đầu vào, model local, streaming Unicode, lịch sử,
  câu hỏi tiến độ tự nhiên, ngày, câu hỏi tiếp và cách phân biệt số đơn vị/số vụ.
- `npm run verify`: Chrome thật, database tạm và Ollama thật; bao gồm quyền đọc số liệu,
  câu trả lời tiếng Việt, hủy yêu cầu, khóa xử lý đồng thời, giao diện và các chức năng BCNPV01.
- `node scripts/seedy-ai/benchmark.mjs`: đo hai model đã cài bằng dữ liệu giả.
- Kết quả, câu trả lời thật và ảnh chụp: `outputs/seedy-ai/`.

Tài liệu chính thức dùng cho phần tích hợp:
[Ollama Chat API](https://docs.ollama.com/api/chat),
[context và quản lý bộ nhớ](https://docs.ollama.com/faq),
[Qwen3.5](https://ollama.com/library/qwen3.5).
