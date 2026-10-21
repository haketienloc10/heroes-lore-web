# SCN-0001 — Startup và chuyển Canvas

**Trạng thái bản gốc:** chưa chạy; runtime chưa xác minh. **Web:** chưa chạy. Dùng JAR/hash, P1, mapping và quy tắc 3 lượt trong [quy trình](J2ME-RUNTIME-PROTOCOL.md); ghi kết quả bằng [mẫu run](RUN_TEMPLATE.md).

## Điều kiện và input

Biến thể bắt buộc A: working directory mới, RMS sạch. B: khởi động lạnh tiến trình với RMS fixture đã tạo ở SCN-0006. Hiện chưa có fixture B; không giả tạo save. Profile P2/P3 là bổ sung theo quy trình.

1. Bắt đầu console/capture/trace trước launch. Ghi `t0` launch, `startApp`, `setCurrent(bf)`, `bf.paint` đầu tiên và kích thước/clip.
2. Không input 10 giây; chụp mọi màn chuyển và trạng thái cuối khoảng chờ. Nếu màn chờ phím đã xuất hiện sớm, vẫn lưu mốc xuất hiện.
3. Khi màn yêu cầu xác nhận được quan sát, `tap(5,100)`, `wait(1000)`; tiếp tục từng lần xác nhận khi UI thực sự yêu cầu. Ghi ảnh trước/sau và đầy đủ input. Không spam phím để vượt startup.
4. Theo dõi `bf→ar`, lần `ar.paint` đầu và màn ổn định kế tiếp. Dừng thu sau 5 giây ổn định; giới hạn quan sát 60 giây. Nếu cần thêm thời gian, tạo lượt mới với giới hạn ghi rõ. Timeout là dữ kiện cần điều tra, chưa chứng minh JAR lỗi.
5. Đóng emulator, lưu trạng thái RMS/config rồi chạy lại từ cùng điều kiện A hoặc B; không biến lượt A tiếp theo thành warm start.

## Cần kiểm tra

- UI thực tế, thời gian đến từng mốc, exception, màn đứng yên; startup A/B có khác nhau không.
- Trace CF-01: `bf.run() a:B=0,b:B=1`, resource load thành công rồi tới `cd.y()/A()`, các bước sau và `bf.b()`. Nhánh exception chỉ xem là đã phủ nếu có exception thực tế; không làm hỏng JAR gốc để tạo lỗi.
- Thứ tự `q.h` được cập nhật trong `bf.paint` so với constructor `ar`; ghi `getHeight`, clipHeight, `q.g/h` lúc constructor. Không có paint log thì câu hỏi kích thước vẫn chưa xác minh.
- Ghi các worker/thread và `setCurrent`, không suy ra callback tuần tự chỉ vì màn hình hợp lý. Nếu gặp đường `bf.a=3` sau input mà worker không làm gì, lưu trace và chuỗi UI; chưa gán nguyên nhân.

**Cơ sở tĩnh:** FND-0001 E01–E07; CF-01 trong [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). Dự đoán bytecode là giả thuyết cần đối chiếu runtime, không phải kết quả của scenario.

**Tiêu chí đóng:** có run A/B tái lập, ảnh và console startup; trace các mốc Canvas/chiều cao và CF-01 trên đường thành công. Mỗi lần chưa tới `ar` phải báo điểm dừng. Hiện không có evidence runtime, chưa có thời gian startup để báo cáo.
