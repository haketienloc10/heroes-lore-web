# SCN-0007 — Visibility, pause/resume và worker

**Bản gốc:** chưa chạy; callback runtime chưa xác minh. **Web:** chưa chạy. JAR/hash, P1, 3 lượt/biến thể theo [quy trình](J2ME-RUNTIME-PROTOCOL.md); dùng [mẫu run](RUN_TEMPLATE.md).

Cần trace lifecycle/Canvas/thread/state và cách điều khiển emulator phát callback đã kiểm tra. Mất focus, minimize, pause emulator và gọi MIDlet pause là các thao tác khác nhau; trước hết ghi thao tác host nào thực sự tạo `hideNotify/showNotify/pauseApp/startApp`. Nếu không phát được callback thì ghi chưa phủ, không tự gọi chúng tương đương.

1. A: từ fixture chơi được, `wait(2000)`, giữ `6` 500 ms; khi còn giữ thì thực hiện hide qua cơ chế đã hiệu chuẩn, thả `6` lúc hidden; chờ 2000 ms, show/resume, không input 3000 ms. Ghi release, pending command, UI khi quay lại và có còn phản ứng giữ phím không.
2. B: từ cùng fixture, hide/show khi **không có phím giữ**, khoảng hidden 2000 ms. So sánh A/B bằng trace thực, không mặc định input được giữ hoặc bị xóa bởi host.
3. C: trigger tải/chuyển màn từ SCN-0002/0006, hide sau input xác nhận khoảng 100 ms, show sau 2000 ms. Ghi thời điểm thực, worker mode/state lúc callback; nếu chưa chạm state `1` thì chạy lại từ fixture và ghi chưa phủ tới khi trace xác nhận.
4. D: dùng lifecycle pause/resume của emulator nếu có, không đổi Display một cách giả định. Trace `startApp` lần sau, guard một lần, số bootstrap/scheduler chain đang hoạt động; quan sát ít nhất 5 giây sau resume. Nếu emulator chỉ pause toàn bộ VM, lưu giới hạn đó.

**Giả thuyết tĩnh cần kiểm:** `ar.hideNotify` state `2` gọi release `-8`, gửi **command 13**; show ở state `2` cũng gửi command 13; khi được xử lý, command này đưa tới **state 5**. `ar.hideNotify` state `1` ghi state `15`. `pauseApp()` chỉ log không chứng minh game không pause. State `15`, command `13` và worker mode phải ở các cột khác nhau.

**Tiêu chí đóng:** có callback thực và input/order/thread evidence cho A–D, gồm lúc gameplay và lúc tải; nêu state/callback không chạm được. Mỗi cơ chế không được emulator hỗ trợ giữ trạng thái chưa xác minh và cần runtime khác; không diễn giải trace được tiêm thủ công là quan sát hide/show tự nhiên.
