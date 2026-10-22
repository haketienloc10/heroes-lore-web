# SCN-0004 — Evidence scheduler/runtime

Chiến dịch bắt đầu **2026-10-21 UTC**; thời điểm từng lượt lấy từ `launch.json`, không suy từ tên thư mục. Tài liệu kết luận: [FND-0004](../../../FND-0004-runtime-scheduler.md), [SCN-0004](../../../../../reference/scenarios/SCN-0004-game-loop.md). Số liệu được phân tích từ log đã thu; không dùng target pacing làm số đo.

## Producer và identity

- [REA identity](rea-identity.json): `open_binary` xác nhận JAR ZIP/hash. Đây **không phải trace Java hoặc phân tích scheduler của REA**. Đã đóng target. Thử lưu provider-neutral snapshot không thành công vì archive không có concrete provider analysis profile; response identity được lưu trực tiếp.
- [Build manifest](build-manifest.json), [danh sách hook](transform.log): bản game/emulator có probe được tạo riêng bằng ASM của JDK 21; nguyên bản dùng cho baseline. Không thay JAR gốc hoặc ép field game. Binary/probe chỉ local trong `reference/recordings/scheduler-probe-v3/`.
- [Bytecode game gốc](javap-original-game.txt), [bản đo](javap-instrumented-game.txt), [emulator gốc](javap-original-emulator.txt): producer `javap`, **bằng chứng tĩnh** để định vị probe/descriptor. Không chạy lại JADX; source JADX chỉ dùng định hướng từ các finding trước.
- [Môi trường](environment.json): JVM, OS, clock host và hash `web/` trước hoàn tất; lần xác minh cuối đối chiếu từng file. Profile P1M FreeJ2ME-Plus 1.52: phone `Standard` theo `config/Heroes Lore/game.conf` của các run, 240×320, limiter 60, sound on, không fast-forward; các launch ban đầu không lưu profile field. [Profile audit follow-up](../scheduler-followup-20261022/emulator-profile-audit.json) đối chiếu 40 bản sao run và sửa nhãn Motorola dùng trong phần mô tả trước đây. Config RAM đọc riêng ngoài cửa sổ đo.

## Recipe thực thi

Mỗi run dùng PID/working directory mới. Copy và kiểm từng size/SHA-256 từ snapshot đã dừng `HOUSE-INPUT-001`. Không dùng endpoint ngoài nhà của `HOUSE-EXIT-001` làm điểm bắt đầu. Load bằng UI: logo → Enter → menu chọn sẵn Load Game → Enter → Ronin → Enter → gameplay. Ảnh `04-fixture.png` và `05-before-input.png` dùng kiểm điểm neo trong nhà; ảnh không dùng chứng minh release.

Các biến thể `tap`/`hold` dùng numpad 6 AWT 102, raw game 54. Sau gameplay window, nghỉ 5 giây → down → wait 20 hoặc 1000 ms → up → nghỉ 5 giây → ảnh. Không tự phát repeat. Thời gian giữ thực lấy khoảng bao dispatch trong `sequence-input.log`, không thay bằng thời gian kế hoạch.

Tap có thêm cửa sổ menu; hold không lặp lại cửa sổ menu. Mỗi cửa sổ warm-up ít nhất 5 giây, đo đúng 30 giây bằng CLOCK_MONOTONIC. Chỉ một emulator thuộc chiến dịch chạy tại một thời điểm; thứ tự thực tế nằm trong launch UTC. Không có CPU pinning hoặc kiểm soát tải toàn host/RNG.

Runner: [run_scheduler_verification.py](../../../../scripts/run_scheduler_verification.py); bộ xây probe: [build_scheduler_probe.py](../../../../scripts/build_scheduler_probe.py); bộ phân tích: [analyze_scheduler_trace.py](../../../../scripts/analyze_scheduler_trace.py). Runner còn dùng các sidecar attach/capture của FND-0003 tại `/tmp/heroes-lore-runtime-probe` và `/tmp/heroes-lore-runtime-sequence`; identity/hash và hướng dẫn compile được giữ trong manifest/harness. Cần các binary/snapshot local đúng hash để chạy lại; repo Git không chứa game/save/emulator.

## Ý nghĩa trace và giới hạn

`trace.jsonl` là sự kiện thật từ probe Java, đệm RAM tối đa 1.000.000 dòng, flush khi shutdown. `trace-health.json` báo số retained/dropped và lỗi đọc field. `seq` tăng trong khóa probe; timestamp lấy sau khi vào khóa probe, vì vậy thời gian chờ khóa probe trước timestamp không được tính. Dòng exit đo trước lệnh return thường; không có hook exceptional exit. Span chưa đóng lúc SIGTERM không được tự tạo exit.

`class + method` giữ descriptor gốc. `thread_id/name`, `span_id` và `parent_span_id` của **entry/exit** cho nesting đồng bộ trên cùng thread. Với dòng `phase=point`, `parent_span_id` hiện trùng `span_id` do implementation; chỉ dùng `span_id` để gắn marker vào invocation, không dùng trường parent của marker để suy cây. Không suy happens-before liên thread từ seq hoặc timestamp.

`serial_enqueue_id` là ghép FIFO giữa entry `Display.callSerially` và `br.run` kế tiếp, **không có Runnable identity/token được mang qua queue**. Chỉ là correlation dẫn xuất khi workload không có enqueue khác; kết luận nesting/callback thread không phụ thuộc phép ghép này. Chưa có correlation repaint→paint; không gán paint cho request gần nhất. Hai overload repaint gọi lồng nhau nên không cộng chúng thành tổng request độc lập.

Các field `m.e:I`, `m.b:B`, `q.a:Z`, `q.f:I`, `br.d:I/Z` được chọn bằng tên **và type** qua reflection. `q` được chọn đúng superclass, tránh field cùng tên trong `ar`. Các lần đọc là tuần tự, không phải snapshot nguyên tử. Marker `monitor_acquired` ở `br.run`, `ar.paint`, input cho biết đã vào monitor của game; nó không loại trừ worker ghi ngoài monitor. `null` trước khi có class/instance là chưa đọc được, không phải 0. `m` chỉ được bind bằng StackWalker từ invocation của chính `m`, không ép khởi tạo sớm.

CF-03 có marker ngay trước **return đầu của `m.e()V`**, đối chiếu `javap` gốc là BCI 6, và ngay sau store reset slot gốc BCI 12. Đây là **probe điểm bytecode có ánh xạ về BCI gốc**, không phải debugger single-step hoặc BCI liên tục; BCI trong bản đo đã dịch chuyển. Không dùng entry/exit thuần để suy không có store.

`awt_paint_submission` đếm entry `FreeJ2ME$LCD.paint(Graphics)`; `frontbuffer_flush` đếm `MobilePlatform.flushGraphics`. Đây là các proxy phía emulator. `*-xdamage.json` ghi **thời gian nhận** XDamageReportNonEmpty ngoài JVM; server có thể gộp draw và scheduling/transport làm trễ nhận. Không phải vsync/compositor present, số ảnh khác nhau hoặc video CFR. Không đo được physical presentation rate/latency. Rà soát hash sau chiến dịch xác nhận 24 ảnh frontbuffer ở checkpoint `04/05` và 9 ảnh X11/diagnostic đều hiển thị căn phòng cùng nhân vật; các nhóm hash byte-identical. Ghi chú cũ “chỉ còn HUD” nhầm vùng đen quanh căn phòng là canvas trống; xem [review đã hiệu chỉnh](review.json) và [hash audit](../scheduler-followup-20261022/hud-after-load-hash-audit.json). X11 được bổ sung ngoài cửa sổ đo ở các lượt cuối; việc thêm capture không thay collector trong 30 giây. Các lượt đầu không có X11 ở mọi checkpoint.

Khoảng cách timestamp successive-read trong `clock.json` là hiệu chuẩn đọc đồng hồ, không phải accuracy tuyệt đối. CLOCK_MONOTONIC Python và nanoTime Java được dùng trên cùng Linux host; đã đo handshake bằng JVM riêng sau chiến dịch trong [clock-handshake.json](clock-handshake.json), nhưng chưa đo drift qua các lượt trước. Các cửa sổ chọn entry theo mốc host vì vậy có giới hạn biên; độ phân giải count là 1/30≈0,0333 Hz. Không khẳng định độ chính xác 1 ns.

## Thống kê và lưu trữ

`analysis.json` và `*/analysis.json` là **dẫn xuất**, không phải log runtime gốc. Rate=N/T; interval chỉ từ hai entry liên tiếp cùng miền **bên trong** cửa sổ, không nối interval qua run. Duration chỉ lấy span có exit trong cửa sổ; inclusive, có chi phí probe và pacing nếu method bao quanh pacing. Median theo định nghĩa chuẩn, p95 nearest-rank `ceil(.95*N)`. P95 của 3 trial là max; không suy percentile dân số hoặc khoảng tin cậy từ 3 mẫu. Kết quả gộp interval vẫn có tính tương quan trong cùng run.

Manifest từng run giữ size/hash file evidence và artifact local, bao gồm ảnh, config/storage, trace nguyên bản hoặc bản nén lossless. Trace đầy đủ và binary local không được thay bằng ví dụ giả. Hai pilot `PILOT-v1-linkage-failed`, `PILOT-v2-verifier-failed` có lỗi classloader/verifier, **loại khỏi mọi thống kê hợp lệ**; giữ log và lý do để audit.

Kết quả hoàn tất: **12 lượt, 18 window × 30 giây = 540 giây**, 269.207 event trace. Bảng [metrics](metrics.md), [aggregate](aggregate.json), [review ảnh](review.json), [manifest tổng](manifest.json) và `*/manifest.json` nối các kết luận với file/hash. Lượt `ABORTED-harness-baseline-hold-R03` chưa hoàn tất window được giữ riêng và loại khỏi thống kê; run cùng repeat được chạy lại từ snapshot. `valid_run_count` trong aggregate chỉ là số lượt hoàn tất được dùng phân tích, không có nghĩa toàn bộ tiêu chí SCN-0004 đã đạt.
