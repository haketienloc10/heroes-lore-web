# Quy trình chạy và đo J2ME — Milestone 1.5

**Cập nhật 2026-10-21:** đã chạy game bằng FreeJ2ME-Plus 1.52; SCN-0001/0002/0003/0005/0006 có quan sát một phần. Mục “Môi trường đã kiểm tra” và profile dự kiến dưới đây giữ bối cảnh lượt chuẩn bị; **cấu hình thực tế ở cuối tài liệu** thay thế các thông số chưa chốt. Chưa có số đo FPS/callback ordering. JAR/SHA-256 và trạng thái milestone tại [index](README.md).

## Môi trường đã kiểm tra

[preflight.json](../../reverse-engineering/findings/evidence/milestone-1.5/preflight.json) ghi Linux WSL2 x86_64, OpenJDK `21.0.12.1`, `javap 21.0.12.1`, có JADX CLI. Không tìm thấy `microemulator`, `freej2me`, `freej2me-plus`, `kemulator`, `j2me-loader`, `adb` trong PATH. Tìm tên file có giới hạn trong `/opt`, `/usr/share`, `/usr/local/bin`, `~/.local/share`, `~/.cache`, `~/Downloads`, repo cũng không tìm được emulator theo các từ khóa đã ghi. Không quét filesystem Windows; không khẳng định toàn máy không có emulator.

`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0` có giá trị nhưng **chưa kiểm tra truy cập GUI**. Không có `Xvfb`, `xvfb-run`, `ffmpeg`, `xdotool` trong PATH; đây là công cụ hỗ trợ, không phải điều kiện duy nhất để chạy game. Chưa tải/cài emulator, chưa thử launch, chưa có log game runtime. `java -jar original/...jar` bằng Java SE không thay thế được một runtime MIDP/CLDC.

## Profile chính P1 và profile bổ sung

Ứng viên là **FreeJ2ME-Plus, frontend AWT**. Theo [README chính thức](https://github.com/TASEmulators/freej2me-plus/blob/devel/README.md#-how-to-use-the-awt-frontend), frontend nhận JAR, kích thước LCD và scale; dữ liệu/cấu hình ở working directory, cấu hình đã lưu có thể ghi đè CLI. Chưa có build được chọn: **version/commit và SHA-256 emulator còn trống**; phải điền trước lượt hợp lệ.

Các giá trị sau do phép thử này lựa chọn, không khẳng định là cấu hình điện thoại gốc:

| Thuộc tính | P1 dự kiến | Cần xác nhận khi chạy |
| --- | --- | --- |
| LCD logic | `240×320`, portrait, không xoay | `Canvas.getWidth/getHeight`, clip lúc paint, vùng LCD trong ảnh |
| Cửa sổ host | Scale `2`, windowed | Scale chỉ phóng ảnh; LCD vẫn 240×320 |
| Profile MIDlet | `MIDP-2.0`, `CLDC-1.0` theo manifest | Ghi property thực tế, API thiếu/lỗi nếu có |
| Layout phím | Default; đường num-row là chuẩn thao tác | Raw code, gameAction trước/sau normalize |
| Tốc độ | Tắt fast-forward; limiter 60 nếu build có tùy chọn | Lưu giá trị hiệu lực; limiter là biến gây nhiễu, không phải FPS game |
| JVM | Thử JVM hiện có; ghi chính xác JVM chạy được | Không suy ra emulator chạy được vì `javap` chạy được |
| Audio | Bật ở baseline; ghi backend/lỗi | Nếu cần tắt để chẩn đoán, tạo profile riêng, không gộp timing |
| Locale/thời gian | Ghi locale host, lựa chọn ngôn ngữ UI, múi giờ | Không giả định RNG seed kiểm soát được |
| RMS | Một working directory riêng cho mỗi run/fixture | Ghi đường thực tế, trạng thái sạch hoặc hash snapshot |
| Instrumentation | Lượt nguyên bản và lượt trace tách riêng | Hash game gốc giữ nguyên; hash emulator/patch/probe phải ghi |

Sau khi có build, lệnh khởi động **dự kiến, chưa chạy** từ working directory mới của run:

```bash
java -jar /duong-dan-tuyet-doi/freej2me.jar \
  'file:///home/locdt/heroes-lore-web/original/heroes-lore-v2.1.2.jar' \
  0 240 320 2 > emulator-console.log 2>&1
```

Chốt layout/limiter trong UI hoặc config của đúng build; lưu bản config sau khi áp dụng và kiểm tra lại khi relaunch. Không dựa riêng vào tham số CLI. Tạo directory mới trước lượt RMS sạch; khi dùng fixture thì sao chép snapshot lúc emulator đã dừng. Không xóa dữ liệu đang dùng để tạo baseline sạch.

P2 `176×208` để khảo sát layout khác; P3 `240×400` để chạm nhánh chiều cao quanh ngưỡng `350` trong `q.a(I)V` (alias JADX `m115a`). Hai profile này là phép thử bổ sung, chưa biết native resolution của JAR. Nếu P1 lỗi layout, ghi lỗi trước khi đổi profile. Không gộp số đo giữa các profile; nhánh `q.h` phụ thuộc **clipHeight** nữa, không chỉ LCD height.

## Hiệu chuẩn input trước khi chạy scenario

Bảng host theo [KEYMAP chính thức](https://github.com/TASEmulators/freej2me-plus/blob/devel/KEYMAP.md); mã số phía game lấy từ `ar` trong JADX và bytecode đã lưu, chưa phải mã callback đã đo trên emulator.

| Phím host | Phím máy ảo dự kiến | Raw code/đường game cần kiểm |
| --- | --- | --- |
| Hàng số `0…9` | `0…9` | ASCII `48…57`; dùng hàng số, tránh nhầm numpad |
| `2/4/6/8` | `2/4/6/8` | `50/52/54/56` → `m.b(B)V` với `1/3/4/2` ở state `2` |
| `5` | `5` | `53`; không đặt tên mechanics trước quan sát |
| Mũi tên, Enter | Với Standard: `2/8/4/6`, `5` | Hiệu chuẩn riêng; không mặc định chạm nhánh gameAction |
| `E`, `R` | `*`, `#` | Dự kiến `42`, `35`; ghi callback thực tế |
| `Q`, `W` | Options, Back theo emulator | Mã vendor chưa biết; không mặc định là `-8` |
| Esc | Options của emulator | Ghi là thao tác host, không tính thành phím game |

Muốn kiểm tra đường D-pad/gameAction độc lập, dùng profile phụ có Nokia keybindings rồi đo raw code và kết quả `getGameAction`; giữ nguyên fixture. Game normalize `±21→53`, `±22→-8` trước dispatch. Chỉ kiểm tra alias bằng thiết bị/profile thực sự phát chúng hoặc lượt injection được đánh dấu rõ; không giả vờ phím host đã tạo mã vendor. Không sửa logic game để làm alias test đạt.

Với mỗi phím, log `host_key`, raw code đầu callback, code sau normalize, gameAction và press/release/repeat. Trước khi log được, mapping chỉ ở trạng thái dự kiến. Num-row và D-pad có thể chung đường ở Default; không tính chúng thành hai nhánh đã phủ.

## Fixture, thao tác và bằng chứng

Mỗi run dùng ID `M15-SCN-xxxx-P1-R01`, thời điểm UTC và timezone host. Lưu JAR hash, emulator version/commit/hash, JVM/OS, config hiệu lực, kích thước thực, input mapping, audio/limiter, instrumentation, hash fixture và chuỗi input theo thời gian thực tế.

Quy ước kế hoạch: `tap(K,100)` = keyDown, giữ 100 ms, keyUp; `wait(500)` = không input 500 ms. Thời gian thực tế phải ghi lại, không coi thao tác tay đúng chính xác kế hoạch. Mỗi biến thể bắt buộc chạy 3 lượt từ cùng fixture; RNG chưa biết ghi `không biết`. Ổn định màn hình chỉ là điểm neo quan sát; không mặc định đó là state `m.e` nào nếu không có trace.

- Ảnh theo mốc, video CFR tối thiểu 60 Hz nếu host đáp ứng, console stdout/stderr, log input, trace và config; khai báo frame drop/độ phân giải capture thực tế.
- Lưu local trong `reference/screenshots/<run-id>/`, `reference/recordings/<run-id>/`. Hai thư mục đang ignored; finding phải có manifest tên file/hash và ghi rõ hiện vật chỉ có local. Không tạo link đến file chưa tồn tại.
- Lưu manifest đã điền và kết quả tổng hợp vào `reverse-engineering/findings/evidence/milestone-1.5/<run-id>/`. Không commit JAR, save nhị phân hoặc dữ liệu game; chỉ metadata/kết quả phù hợp.
- Snapshot toàn bộ RMS/storage cần thiết lúc tiến trình đã dừng; hash từng file theo đường tương đối. Hash thay đổi không tự chứng minh nội dung save đúng. Trước/sau dùng cùng suite identity, JAR path/profile.
- Mỗi lượt ghi kết quả bản gốc, dự đoán tĩnh được kiểm tra, giới hạn và kết quả web `chưa chạy`. Mẫu [RUN_TEMPLATE.md](RUN_TEMPLATE.md).

## Đo timing và callback ordering

**Hai loại lượt:** nguyên bản để quan sát UI/cadence bên ngoài; emulator có probe/debug để xem lời gọi nội bộ. Ưu tiên probe tại dispatch emulator hoặc debugger mà không sửa JAR. Khả năng hook method/BCI **chưa triển khai/chưa kiểm tra**. Nếu phải tạo JAR instrumented thì dùng bản sao với hash/patch riêng, đối chiếu lại lượt nguyên bản; kết quả chỉ áp dụng cho bản đã instrument. Chỉ video thì kết luận được hình ảnh/latency ở mức capture, không kết luận internal ordering.

Trace dự kiến là JSONL, không tạo sample giả thành log thật. Mỗi event cần `run_id`, `seq` tăng nguyên tử, `t_mono_ns=System.nanoTime()`, `thread_id/name`, `event`, `phase=entry/exit`, `span_id`, `parent_span_id`, `class`, `method+descriptor`, BCI nếu có. Thêm Canvas identity, state `m.e:I`, pending `m.b:B` và params, mode worker cùng descriptor, cờ release và key, LCD/clip, exception, enqueue/request IDs nếu hook hỗ trợ. Đọc các field bằng descriptor để tránh collision. `null` nghĩa không thu được, không thay bằng `0`.

Các điểm hook cần có:

| Miền | Điểm quan sát |
| --- | --- |
| Lifecycle/Canvas | `GameMIDlet.startApp/pauseApp/destroyApp`, `Display.setCurrent`, `bf/ar.showNotify/hideNotify`, constructor `q/ar` |
| Scheduler | `br.c/run`, `q.i/j`, enqueue `Display.callSerially` và callback Runnable entry |
| Paint/update | enqueue `Canvas.repaint`, callback `bf/ar.paint`, `m.e()`, `m.g/i`, `m.q/n`, các call render trong `ar.paint` |
| Pacing | `br.a()` ghi timestamp; `br.a(I)V` đặt period, `br.b()`, sleep/yield, cờ bypass `ag.a:Z` (alias `f45a`) |
| Workers/nhánh | `bf.run`, `bt.run`, các call mục CF-01…04 trong [SCN-0008](SCN-0008-control-flow.md) |
| Input/persistence | `keyPressed/keyReleased/keyRepeated`, `getGameAction`, `m.h()`, `RecordStore.open/add/set/delete/close` |

Kiểm tra lại descriptor trong bytecode trước gắn probe; bảng là danh sách cần đo, không khẳng định hook đã tồn tại. Log qua buffer, không ghi file trong shared lock mỗi event nếu tránh được; ghi số event mất và buffer overflow. Đo overhead bằng 3 lượt có/không trace cùng profile, fixture và capture; công bố chênh lệch median/p95 và giới hạn khi RNG khác. Breakpoint dừng thread chỉ dùng kiểm nhánh, không dùng lấy FPS/cadence.

Quy tắc phân tích:

1. Cửa sổ ổn định: sau 5 giây warm-up, đo 30 giây mỗi trạng thái có thể giữ, tối thiểu 3 lượt. Đo riêng startup/loading, không bỏ chúng khỏi báo cáo startup.
2. Dùng đồng hồ monotonic cho khoảng thời gian; lưu `System.currentTimeMillis()` của game ở cột riêng và một cặp mốc UTC/monotonic để đồng bộ capture. Kiểm tra độ phân giải đồng hồ và ghi độ chính xác thực tế; không giả định nanoTime chính xác 1 ns.
3. Tách `N(br.run)`, `N(repaint request)`, `N(paint entry)`, `N(m.i update)`, `N(present host)` và số ảnh khác nhau. Báo `rate=N/T` trên cửa sổ định nghĩa rõ; dùng các entry liên tiếp cùng miền để tính median/p95/max interval. Màn đứng yên có thể vẫn update, ảnh giống nhau không chứng minh thiếu callback.
4. Latency: từ key callback entry tới update đầu phản ánh input (khi quan sát được), tới render, và tới frame hiển thị đầu tiên. Tách cả host keyDown→callback. Báo cỡ mẫu, median/p95/max; video 60 Hz chỉ lượng tử thời gian theo frame khoảng 16,7 ms cộng sai số đồng bộ, không chứng minh latency sub-frame.
5. Pacing tĩnh là `1000/i` nguyên: `5→200 ms`, `20→50 ms`, cấu hình khởi tạo `14→71 ms`. Đo giá trị hiệu lực `d`, elapsed/sleep/yield, early return và bypass. Không công bố `5/14/20 FPS` như số đo và không đặt hard assertion cadence bằng period.
6. Trong cùng invocation/thread, kiểm tra `q.i → q.j → enqueue callSerially`, `ar.paint entry → m.e → dispatch state`; khi state `2` còn hiệu lực, ghi thứ tự `m.g/m.i` theo cờ rồi render, hoặc nhánh bỏ render. Correlate release vật lý → slot `q.f` nếu có → `q.i` phát lại → pending action/update.
7. `seq`/timestamp chỉ cho thứ tự log. Quan hệ giữa thread phải có enqueue/callback IDs, span/monitor hoặc bằng chứng đồng bộ; không suy ra happens-before từ thời gian gần nhau. Paint có thể gộp request; không ép repaint↔paint 1:1 và không gán paint cho request gần nhất nếu không có correlation.
8. Thu trạng thái/command ở entry/exit và tại nhánh cần kiểm; không giả định mọi pending được tiêu thụ đúng một lần vì chỉ có một slot. Visibility và worker phải nằm trên cùng timeline nhưng vẫn tách thread. Chưa quan sát race không chứng minh không có race.

Không có số đo thực nghiệm trong tài liệu này. Kết luận runtime chỉ được cập nhật từ run có evidence theo mẫu và phạm vi tương ứng.

## Cấu hình đã chạy trong lượt tiếp tục

Đã tìm thấy emulator ngoài phạm vi preflight cũ: `/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar`. SHA-256 `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e`; release `1.52`, tag commit `8f87bf1497e7a9738a32d1909379376a1faca7dd`. Archive khớp digest upstream; checkout source HEAD riêng khác release, không dùng làm version binary. Xem [environment.json](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/environment.json) và [FND-0003](../../reverse-engineering/findings/FND-0003-emulator-smoke.md).

**P1M thực nghiệm** tách khỏi P1 Standard dự kiến: LCD 240×320, Motorola (layout CLI `2` ở release 1.52), rotate 0, scale yêu cầu 2, sound on, limiter 60, fast-forward false. JVM OpenJDK 21.0.12.1; property MIDP-2.0/CLDC-1.1, game manifest MIDP-2.0/CLDC-1.0. Native framebuffer và field kích thước khớp 240×320. Limiter 60 **không phải FPS thực tế**.

```bash
java -Dfile.encoding=ISO_8859_1 -Dsun.java2d.uiScale=1 \
  -jar /home/locdt/tools/freej2me-plus-v1.52/freej2me.jar \
  file:///home/locdt/heroes-lore-web/original/heroes-lore-v2.1.2.jar \
  0 240 320 2 2 60
```

Cần truyền encoding từ đầu để tránh auto-restart làm mất chuỗi log/profile của lượt mặc định. Lưu config disk **và** snapshot config hiệu lực trong RAM: disk có thể còn Standard/fps0 trong khi CLI đã đặt Motorola/fps60. Bản 1.52 có key phụ width/height từ parse khác với scrwidth/scrheight; không dùng riêng các key phụ để suy LCD.

Input có kiểm soát: AWT `38/40/37/39/10/87` tương ứng Up/Down/Left/Right/Enter/W; mapper P1M tính raw `-1/-6/-2/-4/-20/-22`. Điều khiển qua KeyListener của emulator trên AWT EventQueue bằng sidecar, không ép state hoặc sửa JAR. Đây là **input tổng hợp**, chưa chứng minh đường bàn phím vật lý hay callback game. Standard phát W `-7`; P1M phát W `-22` và ảnh xác nhận quay lại/Skip/Status. Hàng số/numpad chưa được xác minh đầy đủ; không dùng bảng KEYMAP devel thay phép đo của release này.

Ảnh native frontbuffer 240×320 là nguồn chính để đọc UI. Ảnh X11 là nguồn host riêng; ảnh AWT Robot đen do ScreencastHelper bị loại. Không suy cadence/present timing từ các ảnh rời. Audio có lỗi mở Tone/MIDI nhưng game vẫn chạy; chưa xác minh nghe được âm thanh.

Các lượt khám phá P1-R01/R02 và P1M-R01 có thao tác hỗn hợp. Sau xác nhận của người dùng, P1M-R02/R03/R04 dùng RMS sạch và input tự động; log từng phím/ảnh/snapshot riêng. Tài liệu tái lập và manifest bằng chứng tại [runtime-20261021](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md). Các phép đo timing/BCI/callback trong phần kế hoạch vẫn chưa thực hiện.

## Hiệu chuẩn bổ sung: snapshot và numpad

SCN-0003 dùng [HOUSE-INPUT-001](fixtures/HOUSE-INPUT-001.md), khác [HOUSE-EXIT-001](fixtures/HOUSE-EXIT-001.md) từ startup sạch. Snapshot chỉ copy sau xác nhận JVM dừng, mỗi case kiểm hash/size rồi khởi chạy working directory mới. Với snapshot có save, menu chọn sẵn Load Game; kiểm ảnh trước replay. SCN-0006 đã cold load qua UI; điều này không xác minh toàn bộ state/schema/RNG.

Mapper P1M thực đo: AWT numpad `98/100/102/104/101` → raw `56/52/54/50/53`; ảnh A cho Down/Left/Right/Up theo thứ tự đó. Numpad 2/8 ở build này không khớp ASCII nhãn phím. Q `81` → `-21`; W `87` → `-22`. Các giá trị vẫn là mapper emulator, chưa phải callback entry/normalize/gameAction runtime. Hàng số và numpad chưa được chứng minh tương đương.

Sequence sidecar mới chụp trong khi hold và ghi trước/sau mỗi dispatch listener trên EventQueue. Không transform class, không gọi method/ghi field game, không tự phát repeat. B gồm hai wait 500 ms cộng overhead capture/log nên phải đọc hold bounds từ log. Không công bố physical repeat, callback ordering, release-slot behavior, FPS, latency hoặc độ chính xác đồng hồ từ phép thử này. Xem [SCN-0003](SCN-0003-input.md#thực-nghiệm-tiếp-tục--fixture-trong-nhà) và [SCN-0006](SCN-0006-save-load.md#thực-nghiệm-tiếp-tục--cold-load-đã-quan-sát).
