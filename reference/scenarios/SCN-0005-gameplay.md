# SCN-0005 — Gameplay quan sát tối thiểu

**Bản gốc:** chưa chạy; mechanics chưa xác minh. **Web:** chưa chạy. JAR/hash, P1 và quy tắc 3 lượt theo [quy trình](J2ME-RUNTIME-PROTOCOL.md); dùng [mẫu run](RUN_TEMPLATE.md).

## Tạo fixture

Theo đường menu đã ghi ở SCN-0002 vào một màn chơi được. Ghi nhân vật, map theo nhãn UI hoặc ảnh nếu chưa biết tên, vị trí so với mốc hình ảnh, cấp độ, HP/MP, tiền, trang bị/inventory nhìn thấy, ngôn ngữ, RNG nếu biết. Lưu đường đi từ startup/RMS sạch; chỉ lưu snapshot nếu cơ chế save thực tế đã được xác nhận. Hiện chưa có fixture nào và chưa biết các giá trị trên.

Tạo ba điểm neo: A khoảng trống; B gần vật thể có vẻ cản đường; C gần đối tượng có thể tương tác hoặc mục tiêu. Đây là lựa chọn khám phá, không coi hình ảnh vật thể là bằng chứng collision hay NPC AI.

## Biến thể và input

1. A: `wait(2000)`, giữ `6` 1000 ms, thả, `wait(1000)`; sau restore, làm tương tự cho `2/4/8`. Ghi frame/vị trí trước/sau và từng callback; không suy ra đơn vị tile hoặc công thức tốc độ từ khoảng dịch màn hình khi camera có thể di chuyển.
2. B: từ cùng điểm gần biên/vật thể, giữ phím theo hướng đã quan sát về phía vật thể 1000 ms, thả và chờ 1000 ms; ghi cả vùng map, camera và nhân vật. Nếu xuyên qua/không chạm được, giữ nguyên kết quả thay vì gọi đó là tường đã xác minh.
3. C: từ điểm neo tương tác, `tap(5,100)`, `wait(2000)`; chụp animation, dialogue/menu hoặc thay đổi chỉ số nếu xuất hiện. Nếu không có phản ứng, chưa kết luận “tấn công hỏng” vì vai trò phím chưa được xác minh.
4. Nếu quan sát được combat/tương tác, ghi thêm đường input đầy đủ tạo một lần hành động và phản ứng mục tiêu; lặp 3 lần từ fixture. Ghi biến động HP/MP/item/tiền/EXP nhìn thấy, không suy ra công thức damage/AI/quest từ mẫu ít.
5. Thử mở/quay lại màn UI bằng phím đã xác định ở SCN-0003; ghi gameplay có tiếp tục update trong lúc UI mở không bằng trace, không chỉ nhìn animation.

**Evidence:** video kèm input, ảnh các điểm neo, bảng trạng thái trước/sau, trace update/render/state khi có. Mechanics chưa xuất hiện hoặc chưa tiếp cận được ghi rõ chưa xác minh; không đặt tên state số theo cảm giác.

**Tiêu chí đóng:** tái lập được di chuyển/thả phím, khảo sát một biên/vật cản và một hành động/tương tác có phản ứng quan sát được; có đường tạo fixture và 3 lượt/biến thể. Đây là smoke verification gameplay cho milestone, không phải chứng minh full fidelity hoặc đặc tả toàn bộ gameplay. Chưa đặt tolerance cho web; không thay đổi `web/`.
