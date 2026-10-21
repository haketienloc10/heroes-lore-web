# SCN-0006 — Save/load và vòng đời tiến trình

**Bản gốc:** chưa chạy; persistence runtime chưa xác minh. **Web:** chưa chạy. JAR/hash, P1, 3 lượt/biến thể và snapshot theo [quy trình](J2ME-RUNTIME-PROTOCOL.md); dùng [mẫu run](RUN_TEMPLATE.md).

## Điều kiện

Có fixture gameplay SCN-0005; đường save/load trong UI **chưa biết**, phải khám phá và ghi tên mục/ảnh/input trước khi replay. Không giả định có autosave, nhiều slot, hay save ở mọi map. Có thể xem lời gọi RMS để tìm mốc, nhưng file đổi không chứng minh UI đã save đúng.

Source JADX `at.java:24–34,41–60,71–77,88–108` có các lời gọi `RecordStore` và thay `/` bằng `_` trong tên. Đây là định hướng tĩnh, đã lưu bytecode `at` trong evidence M1.5; chưa xác minh save schema hoặc thời điểm game quyết định ghi. Không lấy tên `/c` hay `/o` làm tên slot gameplay chỉ từ chuỗi.

## Biến thể bắt buộc

**A — Lưu rồi khởi động lại tiến trình:**

1. Tạo trạng thái S0: chụp nhân vật/map/vị trí, HP/MP, level/EXP, tiền, item/trang bị và lựa chọn ngôn ngữ nếu UI hiển thị; trường không đọc được ghi không biết.
2. Dùng đường UI save đã ghi; thời gian `t_save` là input xác nhận. Không input tối thiểu 2 giây và chờ dấu hiệu hoàn tất có quan sát; 2 giây không tự bảo đảm flush. Trace RMS open/add/set/delete/close và exception, chụp thông báo nếu có.
3. Thoát bình thường bằng UI, chờ emulator/process dừng rồi snapshot toàn bộ dữ liệu RMS liên quan và config. Ghi đường, kích thước/hash từng file, suite identity và timestamp. Không copy khi còn ghi.
4. Relaunch cùng JAR identity/profile/storage; đi vào load/continue theo UI; không chỉ chuyển menu trong cùng tiến trình. Chụp bảng S1 và so với S0 từng trường. Ghi trường nào không được thiết kế lưu là chưa biết cho đến có bằng chứng.
5. Tạo lại từ fixture S0 cho hai lượt tiếp, tránh “test load” bằng RAM còn sống.

**B — Lưu trạng thái khác và kiểm tra khả năng ghi đè:**

Từ S0, tạo S2 bằng một thay đổi quan sát được (ví dụ vị trí và một thuộc tính UI khi có thao tác hợp lệ), ghi chính xác input; save qua cùng đường UI, dừng tiến trình/snapshot/relaunch/load như A. So sánh với S2 và S0. Chỉ gọi là overwrite cùng slot khi UI hoặc trace đã xác nhận cùng đích. Nếu UI có nhiều slot, thử thêm slot thứ hai trên bản sao fixture và kiểm tra slot cũ còn hay không.

**C — Storage sạch:**

Relaunch ở working directory mới, không phục hồi save; ghi menu/load/continue thực tế và exception. Không kết luận hành vi khi dữ liệu vắng mặt bằng tên mục. Kết quả C làm fixture sạch cho SCN-0001.

Crash/kill giữa lúc ghi, dữ liệu hỏng và cross-emulator migration là phép thử bổ sung trên **bản sao snapshot**, không phải tiêu chí chính hoặc lý do sửa save gốc. Không mặc định định dạng RMS dùng chung giữa các emulator.

**Tiêu chí đóng:** có round-trip A/B sau dừng tiến trình với bảng trường S0/S1/S2 và snapshot manifest; có C; xác định bước save/load thật, ghi lỗi nếu xảy ra. Nếu chưa tìm được cơ chế save, scenario bị chặn và milestone chưa hoàn thành; không suy ra “save không được hỗ trợ”.
