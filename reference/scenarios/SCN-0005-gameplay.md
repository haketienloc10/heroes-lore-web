# SCN-0005 — Gameplay quan sát tối thiểu

**Bản gốc:** đã quan sát gameplay trong nhà, di chuyển/Status, cửa ra ngoài và route tới map 27 có enemy HUD; **chưa đạt toàn bộ**. Hai lượt lặp chuỗi trong nhà và một lượt cửa ra được ghi riêng; chưa có đặc tả combat hoặc restore fixture cho từng biến thể. **Web:** đã capture route tới map 27 với static enemy sprite và một lần tải map 79 on demand; combat chưa triển khai hoặc so sánh. R08 mới lặp route map 27 và một phím Numpad5, nhưng vẫn không xác nhận hit/damage.

## Tạo fixture

Theo đường menu đã ghi ở SCN-0002 vào một màn chơi được. Ghi nhân vật, map theo nhãn UI hoặc ảnh nếu chưa biết tên, vị trí so với mốc hình ảnh, cấp độ, HP/MP, tiền, trang bị/inventory nhìn thấy, ngôn ngữ, RNG nếu biết. Lưu đường đi từ startup/RMS sạch; chỉ lưu snapshot nếu cơ chế save thực tế đã được xác nhận. Lượt tiếp tục đã có fixture replay HOUSE-EXIT-001 và snapshot HOUSE-INPUT-001; biên bản bên dưới phân biệt hai nguồn khởi tạo.

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
| M15-SCN-0005-P1M-R07 — map 27 | Từ outside map 0/tile `(26,24)`, đi theo ô marker `(20,1)` rồi lần theo map-00 script-0 transfer tới map 27/tile `(5,37)`; tiến gần creature, gửi AWT numpad 5 một lần | Ảnh xác nhận map 27 và creature có nhãn `Dust!`. Mapper tính AWT 101 → internal 18/raw 53. Nhãn đã có trước và sau phím; không xác nhận hit/damage. Key 87 mở màn `Are you Sure?`, nên lượt này không có so sánh HP/SP trước/sau. [Route](../../reference/screenshots/M15-SCN-0005-P1M-R07/map27-route-p7.png), [near creature](../../reference/screenshots/M15-SCN-0005-P1M-R07/map27-near-enemy.png), [before numpad 5](../../reference/screenshots/M15-SCN-0005-P1M-R07/map27-before-keypad5.png), [after numpad 5](../../reference/screenshots/M15-SCN-0005-P1M-R07/map27-after-keypad5.png), [input/mapping log](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0005-P1M-R07/sequence-input.log) |
| M15-SCN-0005-P1M-R08 — route replay | Fresh working directory, New Game/W skip/house exit, then preserved map-27 route segments p1–p7. This injected run needed three separate 1000 ms Down holds to leave the house; the R04 two-hold result was not reproduced. Near `Dust!`, send AWT Numpad5 `101` → internal `18`/raw `53` for 100 ms, then wait 800 ms. | Console records maps `0 → 64 → 0 → 27`. Before/after screenshots show scene motion, but no attributable hit indicator, damage, target death, or HP measurement. Combat remains unverified. [Run manifest](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0005-P1M-R08/manifest.json), [approach](../../reference/screenshots/M15-SCN-0005-P1M-R08/map27-near-enemy.png), [before](../../reference/screenshots/M15-SCN-0005-P1M-R08/map27-before-keypad5.png), [after](../../reference/screenshots/M15-SCN-0005-P1M-R08/map27-after-keypad5.png) |

Biến thể cửa ra bổ sung theo hướng dẫn người dùng, đã đối chiếu bằng ảnh/log; lời hướng dẫn không được dùng thay bằng chứng. Hai lần Down là **hai khoảng giữ 1 giây có release/nghỉ giữa**, không mô tả thành giữ liên tục 2 giây.

Trong R02/R03, Status hiển thị Ronin, Rookie Swordsman, LV 1, EXP 0, NEXT 80, HP 72/72, SP 60/60, tiền 800 ([R02 frame](../screenshots/M15-SCN-0005-P1M-R02/14-status-final.png)); bản ghi 74/74 trước đây là đọc nhầm ảnh. W đã mở/đóng UI. Enter có trong log nhưng ảnh sau thao tác chưa đủ xác nhận animation/cơ chế combat; chưa có số đo damage, AI, quest, EXP hoặc audio.

## Browser route M22 — map 27

Chromium headless 240×320 chạy New Game → Ronin → Hestia và Ran → Yes → W skip → hai lần giữ Down riêng biệt 1000 ms để ra map 0. Từ spawn ngoài cửa `(26,24)`, di chuyển tới marker `(20,1)` kích hoạt script 0 và chuyển tới map 27/tile `(5,37)`. Browser screenshot cho thấy cùng terrain và enemy placements; static sprite frames dùng enemy IDs 21/24. [Capture manifest và ảnh](../../reference/screenshots/web-render/M22-map27-route/capture.json).

Capture ghi không có page errors hoặc HTTP request failures. Đây mới là route rendering: enemies đứng yên ở điểm spawn frame đầu; AI, animation cadence, targeting, collision occupancy, HUD `Dust!`, damage và combat behavior chưa được port. Numpad-5 runtime probe ở R07 cũng chưa xác nhận hit/damage.

## Browser route M23 — dynamic map 79

Từ checkpoint ngoài nhà map 0/tile `(26,24)`, browser route tới marker âm type-3 ở `(14,7)` rồi chọn script 1 với game flag 0. Lần chuyển này tải map/collision/decoration/event JSON cho map 79 từ các asset trích xuất, sau đó đặt nhân vật tại tile `(10,18)`; bốn request trả HTTP 200. [Capture manifest và ảnh](../../reference/screenshots/web-render/M23-map79-dynamic-transition/capture.json) ghi state, request và frame. Input dùng KeyboardEvent tổng hợp trong Chromium; phím vật lý chưa được thử.

Đây chỉ xác nhận một transfer và static render trong Web. Map 79 chưa được so sánh với J2ME; dữ liệu variant theo region, NPC/enemy behavior, collision interactions và các map khác vẫn chưa xác minh. JAR không có `.evt` cho map 9, 28–30, 43–47, trong khi năm script đã giải mã có transfer command tới map 28, 29, 30 và 43. Reachability và cách game gốc xử lý các đích này chưa xác minh; loader Web hiện yêu cầu đủ bốn resource bundle để chuyển map.

**Evidence:** `reference/screenshots/<run-id>/` chỉ local; native framebuffer 240×320. Mỗi run có input.log, framebuffer.log, launch.json nối tới console/config của session, state snapshots và manifest hash trong [runtime evidence](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md). Ảnh không được tính thành trace callback hay số đo FPS.

**Còn thiếu:** lặp độc lập tối thiểu 3 lần cho từng biến thể (hiện trong nhà 2, cửa ra 1); restore fixture trước từng hướng/điểm neo; tương tác NPC/mục tiêu có phản ứng được kiểm chứng và diễn tiến hành động chính. R07 chưa xác minh combat dù đã tới màn có enemy HUD; M22 chỉ xác minh browser route/rendering. Collision chỉ được ghi ở mức quan sát ảnh; chưa có đặc tả mechanics. Vì vậy chưa đánh dấu đạt toàn bộ SCN-0005 hoặc milestone.

## Chuẩn hóa fixture và đối chiếu session

[HOUSE-EXIT-001](fixtures/HOUSE-EXIT-001.md) chốt đường startup sạch → cạnh giường → hai lần giữ Down có release → ngoài nhà; kèm mốc giờ thực R04, ảnh và liên kết audit 71 cặp input/164 hash đã kiểm. Chỉ R04 thực hiện cửa ra; R02/R03 đi bốn hướng và có timing khác, không phải ba replay HOUSE-EXIT-001 tương đương. Khởi tạo RAM/RNG giống nhau chưa được chứng minh.

Đã bổ sung snapshot [HOUSE-INPUT-001](fixtures/HOUSE-INPUT-001.md) ở gian dưới cho SCN-0003 và cold load qua SCN-0006. Đây là fixture có save, không tự tăng số lượt cửa ra từ startup sạch. Combat/collision formula/NPC và FPS/ordering vẫn chưa xác minh.
