# Kiểm tra trùng liên ngày

Giao diện sử dụng nguyên API và điểm đối chiếu hiện có. Điểm là tổng trọng số dấu hiệu, không phải xác suất.

- `model.js`: trạng thái lượt kiểm tra, lọc/sắp xếp và loại cặp hiển thị lặp theo hai mã hồ sơ.
- `view.js`: bộ lọc, tiến độ, chỉ số và danh sách cặp nghi vấn (12 cặp mỗi trang).
- `comparison.js`: hai hồ sơ cạnh nhau, dấu hiệu, lịch sử nguồn và biểu mẫu kết luận.
- `controller.js`: gọi API, kiểm tra 20 hồ sơ mỗi đợt, dừng/tiếp tục, đọc hồ sơ theo quyền và ghi kết luận.
- `style.css`: giao diện theo bảng màu ứng dụng, bố cục máy tính và điện thoại.

Danh sách nguồn lọc theo ngày, đơn vị và hệ nghiệp vụ. Dữ liệu kết quả trong bộ nhớ bị xóa khi đổi phạm vi
hoặc đổi phiên tài khoản. Kết luận được lưu qua API hiện có; mục kết luận trong màn hình chỉ liệt kê lượt hiện tại.
Hồ sơ đã loại tính lặp hoặc đã chuyển thành diễn biến được chặn ghi kết luận trái ngược trong lượt đang mở.
Các điều kiện phát hiện, ngưỡng ưu tiên, giới hạn 50 ứng viên mỗi hồ sơ và cách ghi dữ liệu không thay đổi.

Kiểm chứng bằng `npm run verify`: cơ sở dữ liệu tạm, Chrome thật, đối chiếu điểm, phân trang, ba phương án,
lưu dữ liệu, tải lại, lỗi mạng, dừng sớm, tiếp tục, giao diện sáng/tối và điện thoại.
