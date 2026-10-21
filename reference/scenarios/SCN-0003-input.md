# SCN-0003 — Press/release, repeat và nhiều phím

**Bản gốc:** đã thu runtime A–E từ fixture trong nhà; **chưa đạt toàn bộ**, chưa có trace callback MIDlet hoặc repeat vật lý. **Web:** chưa chạy. Dùng JAR/hash và P1 trong [quy trình](J2ME-RUNTIME-PROTOCOL.md), [mẫu run](RUN_TEMPLATE.md); mỗi biến thể 3 lượt. Cần fixture chơi được từ SCN-0005, đứng ở khoảng trống với ảnh và trạng thái đầu đã ghi; restore trước từng biến thể để tránh ảnh hưởng vị trí.

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

## Thực nghiệm tiếp tục — fixture trong nhà

Dùng [HOUSE-INPUT-001](fixtures/HOUSE-INPUT-001.md): snapshot sau khi JVM đã dừng, copy nguyên storage/config sang directory mới, kiểm hash trước launch, load Ronin qua UI rồi chụp điểm neo gian dưới. Các case `M15-SCN-0003-P1M-{A…E}-R{01…03}` được thu độc lập; so sánh trong từng biến thể và kiểm ảnh đầu. Không coi snapshot load là startup sạch của HOUSE-EXIT-001, hoặc suy toàn bộ RAM/RNG giống nhau từ ảnh/byte storage. Case R05 khám phá cạnh giường được ghi riêng, không tính vào nhóm A–E.

**Mapping đo ở mapper emulator**, qua input KeyListener tổng hợp:

| Host AWT | Raw mapper P1M | Quan sát/giới hạn |
| --- | --- | --- |
| Numpad 2 `98` | `56` | Đi xuống trong case A; khác raw ASCII của nhãn 2 |
| Numpad 4 `100` | `52` | Đi trái trong A |
| Numpad 6 `102` | `54` | Đi phải trong A/B/C |
| Numpad 8 `104` | `50` | Đi lên trong A; dùng cho Up của D |
| Numpad 5 `101` | `53` | Đã phát trong E; ảnh rời chưa đủ xác định animation/cơ chế combat |
| W `87` | `-22` | E mở Status; R05 dùng để Skip và mở Status |
| Q `81` | `-21` | R05: ở cạnh giường ảnh trước/sau không đủ xác nhận hành động; ở dialog Quit, Enter chưa đóng nhưng Q đóng và quay menu |

Nguồn gốc số liệu là `computed_emulator_mapping` trong log, **không phải raw tại entry callback game**. Các key mũi tên/Enter đã có mapping ở FND-0003; hàng số trên bàn phím chưa được đo trong đợt case này. Không coi numpad và hàng số là tương đương. Normalize `±21→53`, `±22→-8` là kết luận tĩnh từ JADX/javap; chưa có trace runtime sau normalize. `+21/+22` và nguồn phát chúng vẫn chưa xác minh.

| Case đã thu | Input thực tế của plan | Phạm vi kết luận |
| --- | --- | --- |
| A | Numpad 2 → 4 → 6 → 8; giữ yêu cầu 100 ms mỗi phím, nghỉ/chụp 500 ms | Ảnh/mapping bốn hướng; thứ tự raw thực tế `56→52→54→50`, khác thứ tự raw dự kiến ở kế hoạch đầu |
| B | Numpad 6; hai wait 500 ms, chụp khi đang giữ; release; ảnh nghỉ 1/2 giây | Có ảnh giữa/cuối hold. Capture/log làm hold dài hơn tổng wait; không khẳng định đúng 1000 ms hoặc có callback repeat |
| C | Numpad 6, wait 20 ms rồi release, chờ 1 giây | Input ngắn có log/ảnh; không suy release đã đi qua slot `q.f`, không đo callback latency |
| D | Down numpad 8 (raw 50), sau 50 ms down numpad 6 (54), sau 50 ms up numpad 8, sau 50 ms up numpad 6; chờ 2 giây | Có overlap ở listener; chưa chứng minh thứ tự callback game, quy tắc ưu tiên hướng hoặc ghi đè slot |
| E | Numpad 5 100 ms, chờ 1 giây; W 100 ms, chờ 1 giây | R01/R02 chụp Status, R03 gần đen có Ok/Back (xem sai khác dưới); chưa xác minh combat/damage |

Ở B-R01, ảnh ngay sau release còn cùng vị trí map với ảnh cuối hold; tới ảnh nghỉ 1 giây map còn dịch thêm, ảnh nghỉ 1/2 giây giữ cùng điểm neo. Đây là quan sát ảnh, **không phải dừng tức thì sau release**, không đủ định lượng trễ, vận tốc hoặc callback gây dịch chuyển. Không suy vị trí nhân vật trong map chỉ từ tọa độ màn hình vì camera cuộn.

Plan được lưu nguyên vào từng run. `sequence-input.log` ghi UTC/nanoTime trước/sau dispatch KeyListener; [input-case-analysis.json](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/input-case-analysis.json) là **phân tích dẫn xuất** và chứa khoảng bao thời gian giữ tại listener, không phải trace callback. Manifest/ảnh/log trong [evidence](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md). Không tự phát repeat trong sequence sidecar; vì vậy không có kết luận về auto-repeat host hoặc `keyRepeated` của game.

**Chưa đạt toàn bộ:** thiếu trace `ar.keyPressed/keyReleased/keyRepeated`, normalize/gameAction tại callback, release slot `q.f`, `q.i`, `m.h`, pending action; chưa đo FPS/latency/overhead/clock resolution, chưa hiệu chuẩn đường bàn phím vật lý, chưa phủ mọi alias/profile phụ. Giá trị field ở snapshot chỉ là mẫu đọc riêng lẻ tại mốc đó, không xác minh toàn bộ state hoặc ordering.

### Sai khác giữa các lượt cần giữ nguyên

A-R02/R03 kết thúc ở điểm neo khác A-R01 dù cùng snapshot và cùng thứ tự phím; không gọi ba đường đi/độ dịch chuyển tương đương, không tự quy nguyên nhân cho release slot hoặc game. E-R01/R02 chụp rõ Status, còn **E-R03 `E-W-status.png` gần như đen, chỉ còn Ok/Back**; snapshot sau đó đọc `m.e:int=5`. Field này không chứng minh nội dung ảnh đã hiển thị. Capture frontbuffer không đồng bộ paint nên đó là một khả năng cần kiểm, chưa phải nguyên nhân đã xác nhận. Không loại ảnh hoặc thay bằng ảnh từ lượt khác. [Biên bản review](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/review.json) ghi các sai khác và khoảng giữ phím thực tế.

B-R01/R02/R03 có hold bounds tại listener lần lượt **1032.583436–1035.174751**, **1043.727503–1046.071977**, **1030.692602–1033.960788 ms**. C-R01/R02/R03 lần lượt **21.335651–23.297180**, **20.879167–22.952297**, **21.231230–22.873798 ms**. Đây là khoảng bao từ log trước/sau listener, không phải độ chính xác callback game hoặc FPS.
