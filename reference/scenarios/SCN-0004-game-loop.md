# SCN-0004 — Cadence và callback ordering

**Bản gốc:** chưa chạy; chưa có số đo. **Web:** chưa chạy. Dùng JAR/hash, P1, [phương pháp trace/timing](J2ME-RUNTIME-PROTOCOL.md) và [mẫu run](RUN_TEMPLATE.md).

## Điều kiện và thao tác

Cần emulator có trace method/field/callback, fixture menu và chơi được, bộ thu monotonic đã hiệu chuẩn. Thiếu probe thì vẫn thu video/console, nhưng không kết luận ordering nội bộ.

1. Biến thể A: từ startup thu liên tục không input; khi có màn ổn định giữ được, warm-up 5 giây rồi đo 30 giây. Ghi state và period hiệu lực, không mặc định menu là 20 FPS.
2. B: vào fixture chơi được, không input, warm-up 5 giây, đo 30 giây. Ghi hoạt động NPC/animation nếu có; “không input” không đồng nghĩa game không update.
3. C: từ cùng fixture, `wait(5000)`, giữ `6` 1000 ms, thả, `wait(5000)`; thu thứ tự input/release/update/render. Restore trước mỗi lượt.
4. D: thu một lần tải/chuyển màn thật từ SCN-0002 hoặc 0006, gồm pending command và worker. Không loại loading/transition ra khỏi trace.
5. Mỗi biến thể chạy 3 lượt nguyên bản và 3 lượt có probe để đánh giá overhead; breakpoint chỉ dùng chụp nhánh, không dùng lấy cadence. Nếu không thể giữ một state 30 giây, ghi thời lượng thực và lý do, không trộn state để đủ mẫu.

## Câu hỏi phải có bằng chứng

- `br.run()` thực sự chạy trên thread nào lúc bootstrap và các callback sau; trình tự trong từng invocation `q.i → q.j → callSerially`. Ghi request/callback IDs nếu có, không ép repaint 1:1 paint.
- `ar.paint` gọi `m.e()` trước state dispatch; state `2` còn hiệu lực thì thứ tự `m.g/m.i` theo cờ `br.d:Z`, rồi render. Khi state đổi trong update, đường render/pacing nào thực sự bị bỏ qua? Không ép cờ hoặc state trong lượt nguyên bản.
- CF-03: chụp ít nhất một invocation `m.e()` có `m.b:B=0`, return tại BCI `6`, không tới reset slot ở BCI `12`. Cần BCI/control-flow trace, trace entry/exit thông thường chưa đủ chứng minh không có store. Trong case rỗng không gọi worker/đổi state không đủ phân biệt Java in sai với bytecode, vì `switch(0)` cũng có thể không làm gì.
- Pacing hiệu lực `d`, nhánh sleep/yield/bypass `ag.a:Z`, early return `ar.paint`; phân biệt `1000/i` tĩnh với interval callback đã đo. Cờ `ag.a:Z` phải xác nhận bằng descriptor trước hook.
- Pending slot khi worker ghi/paint lấy: có overwrite hoặc thay đổi params nào quan sát được? Không tự biến slot thành queue; không thấy overwrite không chứng minh an toàn mọi interleaving.

**Đầu ra:** bảng N/T, interval median/p95/max mỗi miền, thời gian sleep/update/render, latency input với cỡ mẫu, event mất/overhead, timeline theo thread/span. Chưa thu được miền nào thì để trống kèm trạng thái, không điền bằng target period.

**Tiêu chí đóng:** có 3 lượt hợp lệ/biến thể và trace trả lời các câu hỏi trọng tâm với giới hạn rõ. Chỉ video không đóng được callback ordering hay CF-03. Xem [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md) cho rủi ro port; không sửa game loop trong `web/` ở bước này.
