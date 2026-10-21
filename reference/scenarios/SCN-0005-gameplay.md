# SCN-0005 — Gameplay quan sát tối thiểu

**Bản gốc:** đã quan sát gameplay trong nhà, di chuyển/Status và cửa ra ngoài; **chưa đạt toàn bộ**. Hai lượt lặp chuỗi trong nhà và một lượt cửa ra được ghi riêng; chưa có đặc tả combat/collision hoặc restore fixture cho từng biến thể. **Web:** chưa chạy.

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

## Thực nghiệm 2026-10-21

Game hash/emulator release 1.52/commit/SHA-256 và P1M Motorola như [SCN-0001](SCN-0001-startup.md#thực-nghiệm-2026-10-21). Các run kế thừa chuỗi startup/menu cùng hậu tố từ RMS sạch, dùng input tổng hợp qua emulator KeyListener; không thao tác tay và không ép tọa độ/state. Lượt khám phá P1-R01 chỉ tới/tiến hội thoại, không tính là biến thể gameplay đạt.

**Fixture tái tạo:** New Game → Ronin → chọn Hestia/Ron → Yes → intro Roah/Ronin → W giữ 100 ms để Skip → chờ 10 giây và chụp. Ảnh cho thấy căn nhà với giường/HUD; snapshot `m.e:int=2`. Tên map theo UI/RNG chưa biết. Đây là đường replay, **chưa có snapshot save/restore đã xác minh**.

| Run | Chuỗi thực tế | Kết quả và giới hạn |
| --- | --- | --- |
| M15-SCN-0005-P1M-R02 / R03 | Từ giường: Down, Right, Up, Left, mỗi hướng giữ 1000 ms; ảnh sau release và sau 1 giây idle; Enter 100 ms; W mở Status; W đóng; Right 1000 ms hai lần; Enter; W mở Status | Thấy nhân vật/camera đổi vị trí trong nhà. Hai ảnh ở mép phải không cho thấy tiến xuyên qua mép sau lần giữ Right thứ hai. Không restore fixture giữa từng hướng; không suy công thức tốc độ/hitbox hoặc timing dừng chính xác từ ảnh rời |
| M15-SCN-0005-P1M-R04 — cửa ra | Sau Skip trở về giường: Down giữ 1000 ms, thả/nghỉ 1 giây; Down giữ 1000 ms lần nữa, thả/nghỉ 5 giây | **Đã ra khỏi nhà qua lối giữa phía dưới.** Ảnh `02-bed-start` → `03-Down-one-second` → `04-Down-two-holds` chuyển từ nội thất sang đường phố/NPC; snapshot sau cửa vẫn `m.e:int=2`. Console có map `64` rồi `0`; không dùng số map đặt tên địa điểm |
| R04 — thử gần NPC | Ngoài nhà: Left 1000 ms, Enter 100 ms; tiếp Up 200 ms, Left 100 ms, Enter 100 ms; chụp sau mỗi nhóm | Có di chuyển ngoài phố; **chưa quan sát được hội thoại mới** từ hai lần thử này. Chưa xác minh đúng khoảng cách/hướng hay vai trò Enter cho NPC, không kết luận tương tác hỏng |

Biến thể cửa ra bổ sung theo hướng dẫn người dùng, đã đối chiếu bằng ảnh/log; lời hướng dẫn không được dùng thay bằng chứng. Hai lần Down là **hai khoảng giữ 1 giây có release/nghỉ giữa**, không mô tả thành giữ liên tục 2 giây.

Trong R02/R03, Status hiển thị Ronin, Rookie Swordsman, LV 1, EXP 0, NEXT 80, HP 74/74, SP 60/60, tiền 800. W đã mở/đóng UI. Enter có trong log nhưng ảnh sau thao tác chưa đủ xác nhận animation/cơ chế combat; chưa có số đo damage, AI, quest, EXP hoặc audio.

**Evidence:** `reference/screenshots/<run-id>/` chỉ local; native framebuffer 240×320. Mỗi run có input.log, framebuffer.log, launch.json nối tới console/config của session, state snapshots và manifest hash trong [runtime evidence](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md). Ảnh không được tính thành trace callback hay số đo FPS.

**Còn thiếu:** lặp độc lập tối thiểu 3 lần cho từng biến thể (hiện trong nhà 2, cửa ra 1); restore fixture trước từng hướng/điểm neo; tương tác NPC/mục tiêu có phản ứng được kiểm chứng và diễn tiến hành động chính. Collision chỉ được ghi ở mức quan sát ảnh; chưa có đặc tả mechanics. Vì vậy chưa đánh dấu đạt toàn bộ SCN-0005 hoặc milestone.
