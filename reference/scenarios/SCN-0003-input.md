# SCN-0003 — Press/release, repeat và nhiều phím

**Bản gốc:** chưa chạy; mapping/runtime chưa xác minh. **Web:** chưa chạy. Dùng JAR/hash và P1 trong [quy trình](J2ME-RUNTIME-PROTOCOL.md), [mẫu run](RUN_TEMPLATE.md); mỗi biến thể 3 lượt. Cần fixture chơi được từ SCN-0005, đứng ở khoảng trống với ảnh và trạng thái đầu đã ghi; restore trước từng biến thể để tránh ảnh hưởng vị trí.

## Biến thể bắt buộc

| Mã | Chuỗi input dự kiến sau `wait(2000)` | Câu hỏi/bằng chứng cần thu |
| --- | --- | --- |
| A | Lần lượt `tap(2,100)`, `tap(4,100)`, `tap(6,100)`, `tap(8,100)`, nghỉ 500 ms giữa tap | Raw `50/52/54/56`, action byte, phản ứng và dừng sau release; chưa mặc định tốc độ/hướng nhân vật |
| B | Giữ `6` 1000 ms, thả, chờ 2000 ms | Callback repeat có thực sự phát không; game nhận bao nhiêu press/repeat; frame đổi đầu/cuối |
| C | `tap(6,20)`, `wait(1000)` | Press/release ngắn hơn target period; release có vào slot rồi được `q.i` phát lại không |
| D | Down `2` ở 0 ms, down `6` ở 50 ms, up `2` ở 100 ms, up `6` ở 150 ms, chờ 2000 ms | Thứ tự callback thực tế; slot đơn có ghi đè không, action cuối, có còn phản ứng sau thả cả hai không |
| E | `tap(5,100)`, nghỉ 1000 ms, rồi Back đã hiệu chuẩn | Phản ứng theo state và ảnh trước/sau; chưa đặt tên hành động từ key code |

Đo mapping mỗi phím như quy trình. Thực hiện thêm A/E bằng D-pad/OK trên profile phụ Nokia nếu Default chỉ phát số; chỉ báo đã phủ gameAction khi raw code/trace chứng minh. Với repeat, ghi thiết lập repeat host/emulator; không tắt repeat ở baseline rồi suy ra game không hỗ trợ repeat.

## Alias và kiểm tra nội bộ

Biến thể F dành cho `±21`, `±22`: dùng profile thật phát mã hoặc injection có ghi nhãn; từng mã press rồi release, chờ 1000 ms, restore fixture trước từng mã. Nếu chưa có nguồn phát mã, ghi F **chưa xác minh**, không coi hiệu chuẩn num-row thay thế. Kết quả injection chỉ áp dụng cho phép thử có injection.

Trace phải có `ar.keyPressed/keyReleased`, mã trước/sau normalize, state `m.e:I`, cờ release `q.a:Z`, slot `q.f:I`, `q.i`, `m.h()` và pending action lúc update. Phân biệt release vật lý và lời gọi lại virtual `keyReleased` từ `q.i`; không đếm chúng là hai lần thả của người chơi.

**Giả thuyết tĩnh:** input state `2` có release trì hoãn một slot; normalize alias trước dispatch. Đây chưa chứng minh debounce, không mất phím hoặc xử lý hai phím đúng một quy tắc gameplay cụ thể. Đo latency theo quy trình; ghi cỡ mẫu thay vì kết luận từ một tap.

**Tiêu chí đóng:** A–E có ảnh/video và input log; trace đủ kiểm release/repeat/slot và đường số. Báo D-pad/alias còn thiếu riêng; các nhánh cần thiết chưa có dữ liệu vẫn là chưa xác minh. Chưa có kết quả hoặc mức sai lệch web để chấp nhận.
