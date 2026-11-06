# HOUSE-EXIT-001 — Từ giường ra cửa dưới

**Loại:** fixture bằng replay từ startup sạch; chưa phải snapshot state/RNG. **Profile:** P1M, FreeJ2ME-Plus 1.52, Motorola, LCD 240×320, limiter 60 (không phải FPS). JAR game SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`; emulator SHA-256 `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e`.

## Điều kiện và chuỗi chuẩn

Mỗi lượt tạo **tiến trình và working directory mới, RMS sạch**, dùng argv/encoding tại [protocol](../J2ME-RUNTIME-PROTOCOL.md#cấu-hình-đã-chạy-trong-lượt-tiếp-tục). Không thao tác tay. Input là AWT KeyListener tổng hợp, bypass focus; không gọi method hoặc ghi state game.

| Giai đoạn | Input yêu cầu và checkpoint |
| --- | --- |
| Startup | Chờ 10 giây; kiểm ảnh logo. Enter `10` giữ 100 ms, nghỉ 2 giây; kiểm menu |
| Menu | Down `40`, Up `38`, Enter `10`, W `87`, Enter ×4, Right `39`, Enter `10`, Left `37`, Enter `10`; mỗi tap 100 ms, nghỉ ít nhất 700 ms và chụp sau mỗi bước |
| Lựa chọn | Ảnh phải xác nhận New Game → Ronin → Back → Ronin → GUARDIANS SELECTION → danh sách → Hestia → Ron → ARE YOU SURE? → Yes → loading |
| Intro | Sau xác nhận cuối, chờ 10 giây; kiểm ảnh hội thoại Roah/Ronin trước Skip |
| BED (điểm neo trong nhà) | W `87` giữ 100 ms, nghỉ ít nhất 10 giây; ảnh phải có nhân vật cạnh chân giường ở gian trên, thảm đỏ nối xuống gian dưới và cửa giữa phía dưới. Chưa phát phím di chuyển |
| Lần Down thứ nhất | Down `40` giữ yêu cầu 1000 ms, **release**, chờ ít nhất 1000 ms; ảnh còn trong nhà, nhân vật ở gian dưới. Không gọi đây là giữ 2 giây liên tục |
| Lần Down thứ hai | Down `40` giữ yêu cầu 1000 ms, **release**, chờ ít nhất 5000 ms; ảnh phải chuyển sang ngoài nhà/đường phố |

Thời gian yêu cầu là recipe; attach, capture và scheduling làm thời gian thực tế khác. Lưu cả down/up/gap thực tế; không gọi hai execution là replay thời gian chính xác. Nếu ảnh không đúng checkpoint, dừng chuỗi và ghi sai khác. Không thêm phím ngầm để cứu một run rồi vẫn tính cùng biến thể.

**BED** dùng cho SCN-0003 trước khi đi cửa. **OUTSIDE** là endpoint HOUSE-EXIT-001, không dùng thay fixture trong nhà cho input test. Nếu đã load từ save, phải ghi fixture khác và provenance snapshot; không gộp vào nhóm startup sạch.

## Chứng cứ ba session đã lưu

Nguồn đầy đủ: [session-audit.json](../../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/session-audit.json), [71 cặp input CSV](../../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/session-inputs.csv). Đây là phân tích dẫn xuất từ log đã có, không phải runtime log mới. Manifest nguồn kiểm 164 mục size/hash đều khớp tại lúc audit.

| Session | Khởi tạo được ghi | Từ Skip release đến movement đầu (monotonic) | Kết quả và khả năng so sánh |
| --- | --- | --- | --- |
| P1M-R02 | RMS mới, cùng argv/profile; BED trong `03-after-load.png` | 63.737638972 giây | Down → Right → Up → Left; trong nhà; không thực hiện HOUSE-EXIT-001 |
| P1M-R03 | RMS mới, cùng argv/profile; BED trong `03-after-load.png` | 11.102502671 giây | Cùng thứ tự bốn hướng với R02, timing khác; không thực hiện HOUSE-EXIT-001 |
| P1M-R04 | RMS mới, cùng argv/profile; BED trong `02-bed-start.png` | 11.390434631 giây | Down → Down; ra ngoài trong `04-Down-two-holds.png`; một lượt cửa ra đã quan sát |

R04: Down đầu `15:08:58.889013441Z` → `15:08:59.926765073Z`, bracket log **1037.721205 ms**; khoảng thả đến Down kế **1719.101485 ms**; Down hai `15:09:01.645896032Z` → `15:09:02.647555846Z`, bracket **1001.718762 ms**. Ảnh BED `15:08:58.040542904Z`; ảnh trong nhà sau Down đầu `15:09:01.284787465Z`; ảnh ngoài nhà `15:09:07.958948405Z`. Các mốc là ngày 2026-10-21 UTC.

### Lượt live bổ sung M1028 — P1M-R17

Một tiến trình và working directory mới được tạo bằng smoke setup New Game hiện có. Sau khi tới intro, W giữ 100 ms đưa game tới Map 64/BED; Down giữ 1000 ms rồi thả, nghỉ 1 giây, Down giữ 1000 ms rồi thả, nghỉ 5 giây và chụp OUTSIDE. Console ghi Map 0 → Map 64 → Map 0. Đây là lượt cửa ra live thứ hai đã quan sát; nó không bổ sung vào các log R02–R04 được lập trước đó.

Ảnh BED và first-Down lần này cũng byte-identical với ảnh source R04 tương ứng; BED RGB-identical với ảnh web M1018. Ảnh OUTSIDE 240×320 khớp toàn bộ 76,800 pixel RGB với ảnh web M753 (0 changed pixels, MAE 0) và byte-identical với ảnh source R04 `04-Down-two-holds.png` (SHA-256 `ff2c0e389e249a72a5569e1b6fcf063d25ede395a7dcf25a9ba5d8da8625fcf3`). Ảnh browser first-Down cũ của M461 lệch live/source 761 pixel (0.9909%; RGB MAE 0.91503); lượt chụp web mới M1029 chưa lấy được canvas 240×320 nên chưa biết sai khác đó còn tồn tại ở build hiện tại hay không ([M1029 notes](../../screenshots/web-render/M1029-web-first-down/attempt-notes.md)). Xem [M1028 evidence](../../screenshots/web-render/M1028-live-j2me-map0-outside/evidence-notes.md) và [comparison metrics](../../screenshots/web-render/M1028-live-j2me-map0-outside/attempt-1/analysis.json). Đây là ba still frame, không chứng minh cadence, state nội bộ hay parity của các màn khác. Không dùng Save/Load, không truy cập save cục bộ có sẵn, không sửa JAR; thư mục runtime mới được xóa mà không kiểm tra nội dung.


### Lượt web bổ sung M1030 — so sánh framebuffer native

M1030 chụp trực tiếp WebGL drawing buffer 240×320 của Phaser, không lấy kích thước CSS canvas. Lượt đầu có ảnh BED, first-Down và OUTSIDE trên build hiện tại. So với ảnh R04, cả ba khung trùng chính xác ở 76.575 pixel ngoài ô kỹ năng HUD đầu tiên `[7,299,21,313]`; tổng sai khác 188–199 pixel nằm hết trong ô này. Lựa chọn kỹ năng của lượt web không được đồng bộ với ảnh R04, nên đây là đối chiếu khung cảnh và HUD ngoài ô kỹ năng, chưa phải đối chiếu cùng trạng thái HUD. Hai lượt chẩn đoán sau chỉ ở menu và không tính là replay gameplay. Xem [M1030 evidence](../../screenshots/web-render/M1030-native-webgl-house-route/evidence-notes.md). Lượt web dùng profile Chromium tạm mới, không đọc storage/save, không dùng Save/Load, không sửa hoặc đọc JAR, và không seed state.


### Lượt web M1031 — đồng bộ lựa chọn kỹ năng

Lượt tiếp theo dùng cùng chụp WebGL native 240×320 nhưng điều khiển menu theo trạng thái hiển thị, chọn Ronin, Hestia, Ran và Yes. Đọc runtime mới tạo xác nhận `heroClassId=6`, `guardianIndices=[0,1]`, `skillIds=[0,1]`, `activeSkillId=0`, level 1; không dùng hồ sơ test hoặc seed. Ảnh first-Down map 64/(9,15) và OUTSIDE map 0/(26,24) khớp R04/live J2ME toàn bộ 76.800 pixel. BED chênh 89 pixel chỉ trong icon skill khi bộ đếm charge còn 34; bộ đếm tự về 0 trước first-Down. M751 xác nhận toàn bộ HUD khớp sau cooldown. Chi tiết tại [M1031 evidence](../../screenshots/web-render/M1031-matched-skill-native-house-route/evidence-notes.md) và [analysis](../../screenshots/web-render/M1031-matched-skill-native-house-route/attempt-1/analysis.json). Không đọc storage/save, không Save/Load, không truy cập/sửa JAR.

Bracket down/up bao gồm dispatch KeyListener: down được log trước gọi listener, up sau gọi listener. Chưa đo thời gian callback MIDlet, input latency, độ phân giải đồng hồ, overhead hoặc FPS. Console R04 có `map : 64` rồi `map : 0`; ảnh xác nhận chuyển nội thất → ngoài nhà, số map không xác nhận tên địa điểm hay state nội bộ.

Không có snapshot byte trước launch của ba session cũ; RMS sạch là điều kiện được khai báo trong launch. RMS container sau dừng có hash khác nhau, không dùng làm bằng chứng cùng save/state, cũng không tự suy nội dung khác chỉ từ hash. RNG, toàn bộ state khởi tạo và callback ordering **chưa xác minh**. Ba session cũ **không phải ba replay tương đương HOUSE-EXIT-001**.
