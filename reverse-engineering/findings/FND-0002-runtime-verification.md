# FND-0002 — Milestone 1.5: Runtime Verification

**Ngày:** 2026-10-21. **Phiên bản:** Heroes Lore v2.1.2. **Cập nhật 2026-10-22:** đối chiếu tĩnh hoàn tất; lượt tiếp tục đã chạy FreeJ2ME-Plus và có quan sát một phần cho SCN-0001/0002/0003/0005/0006. CF-01 đã xác nhận nhánh startup success trong ba cold start không input; CF-02 đã xác nhận nhánh success mode 1 trong ba UI save-load run; CF-03 có marker runtime cho return sớm. CF-04 có một trace thân nhánh bằng controlled injection; reachability tự nhiên và tiêu chí lặp chưa đạt. **Chưa có scenario đạt toàn bộ, milestone chưa hoàn thành.** Báo cáo thực nghiệm tại [FND-0003](FND-0003-emulator-smoke.md).

**Artifact:** `original/heroes-lore-v2.1.2.jar`, 554715 byte, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`. Lần kiểm tra này tính lại hash bằng Python; khớp fingerprint Milestone 1. Không sửa JAR hoặc `web/`.

## Câu hỏi và provenance

Đã đọc [game-overview.md](../../docs/architecture/game-overview.md), [FND-0001](FND-0001-game-loop.md), [baseline.md](../../docs/rea-evaluation/baseline.md). Mục tiêu là kiểm tra 4 điểm control flow và chuẩn bị phép thử runtime; không dùng output decompile thay thế quan sát game.

| Nguồn | Việc đã thực hiện/được tái sử dụng | Kết luận được hỗ trợ | Giới hạn |
| --- | --- | --- | --- |
| **REA MCP — M1** | Tái sử dụng log/bundle đã lưu trong [baseline](../../docs/rea-evaluation/baseline.md); M1.5 không gọi lại REA | Identity/inventory ZIP, trạng thái provider tại lần M1 | Không có decompilation/call graph J2ME hoặc runtime; không coi readiness cũ là phép đo mới |
| **JADX — source có sẵn** | Đọc source hiện tại `bf/bt/m/ar/q/br/at`, ghi hash | Java được decompiler in ra và vị trí sai khác | Không chạy lại JADX; chưa biết phiên bản/lệnh tạo source; placeholders/type warnings còn tồn tại |
| **javap — chạy mới M1.5** | `javap 21.0.12.1 -c -p -s` trực tiếp trên JAR cho `bf bt m ar q br at` | Branch/goto/return, descriptor, call/store ở các BCI cần kiểm | Phân tích tĩnh; không chứng minh nhánh được chạm từ UI, timing hay interleaving thật |
| **Local/Python** | Hash JAR/source/log; kiểm PATH, tìm file có giới hạn, ghi JVM/OS | Artifact identity và kết quả preflight trong phạm vi đã tìm | Không phải REA, JADX, hay emulator; có DISPLAY chưa chứng minh GUI chạy được |
| **Tài liệu upstream emulator** | Đọc README/KEYMAP FreeJ2ME-Plus để chuẩn bị [profile](../../reference/scenarios/J2ME-RUNTIME-PROTOCOL.md) | Cơ sở chọn cách launch/mapping dự kiến | Không phải evidence Heroes Lore đã chạy hoặc tương thích |
| **Emulator — lượt chuẩn bị và follow-up** | Lượt chuẩn bị chưa launch; follow-up chạy FreeJ2ME-Plus và có các trace scheduler/control-flow đã lưu | CF-01 startup success được đánh dấu trong ba cold start; CF-02 success branch được đánh dấu trong ba UI save-load run; CF-03 có marker return | CF-01 không input/fixture; CF-02 dùng AWT tổng hợp. Xem branch audit và FND-0004. CF-04 cùng các miền khác còn mở |

Không có kết quả đo accuracy/fidelity. Không chuyển thành phần trăm 0/8 hay gộp thành hiệu quả REA.

## Bằng chứng mới và khả năng tái lập

- `V1`: [preflight.json](evidence/milestone-1.5/preflight.json) — lệnh/phiên bản, JAR hash, source hashes, emulator search roots/exclusions, trạng thái runtime; có snapshot hash 17 file `web/` tại thời điểm bắt đầu phần ghi tài liệu.
- `V2`: [javap-runtime-targets.txt](evidence/milestone-1.5/javap-runtime-targets.txt) — stdout nguyên vẹn, exit `0`, stderr rỗng; SHA-256 `32672db8837277805ec66185357b3e52a3a6dfedf2af48de1a1e76c8f4c75cc2`.
- `S2`: source đã có tại `reverse-engineering/decompiled/sources/defpackage/{bf,bt,m,ar,q,br,at}.java`, hash trong `V1`. Source ignored/local; `V2` là output độc lập, không sinh từ source này.
- `V3`: [verification.json](evidence/milestone-1.5/verification.json) — kiểm tra local các đường dẫn Markdown, hash JAR/log, source không thay đổi, 4 mẫu branch trong bytecode và 17 hash file `web/` không thay đổi; **không phải kết quả chạy emulator**. `git diff --check` cũng không báo lỗi whitespace. Không chạy test/build web vì không có thay đổi mã ứng dụng.

Lệnh local chính đã chạy từ repo root:

```bash
java -version
javap -version
javap -classpath original/heroes-lore-v2.1.2.jar -c -p -s bf bt m ar q br at
```

Python chuẩn dùng `hashlib`, `shutil.which`, `os.walk`, `subprocess`; phạm vi và công cụ tìm trong `V1`. Không tải/cài provider hoặc emulator. Không có lệnh launch game nào được thực hiện. Các lệnh emulator trong protocol là **dự kiến**.

## Kiểm tra lại 4 sai lệch control flow

Trong `V2`, `bf.run()` bắt đầu dòng `111`, `bt.run()` dòng `952`, `m.e()` dòng `3708`. BCI là offset riêng trong method. Dùng tên class gốc ở root JAR, không dùng package `defpackage` hoặc alias JADX khi chọn symbol bytecode.

### CF-01 — `bf.run()V`, mode `a:B=0,b:B=1`

**JADX:** `bf.java:76–80` đặt `break` sau load `/itm/itmtp`, `/itm/itmatt` và `q.k()`, khiến đường thành công nhìn như thoát inner switch, bỏ phần `cd.y()/A()` và phần tiếp theo.

**javap:** BCI `92: goto 96`; handler `IOException` tại `95: pop` cũng nối về `96`. BCI `96` gọi `cd.y()V`, `99` gọi `cd.A()V`; sau logic có điều kiện liên quan storage, `207: aload_0`, `208: bf.b()V`, `211: q.k()V`, `214: return`. Vì vậy đường thành công **vẫn thực hiện đoạn nối**, không có early break như source in ra.

**Ảnh hưởng tới port — suy luận có cơ sở tĩnh:** chép nguyên `break` có thể bỏ các bước hoàn tất startup/khởi tạo và dẫn tới state/resource/UI chưa chuẩn bị. Chưa nghiên cứu đầy đủ thân `cd.y/A` trong finding này nên không khẳng định tên màn hoặc loại resource cụ thể bị thiếu. Không đồng nhất đường thành công với exception; ghi hai đường riêng nếu có phép thử.

**Runtime:** Ba cold start độc lập, mỗi lượt trong working directory mới và không có input, ghi `bf.a:B=0,b:B=1`, success `goto` BCI 92, rồi trong cùng invocation/thread gọi `cd.y` BCI 96, `cd.A` BCI 99, `bf.b` BCI 208, `q.k` BCI 211 và return bình thường. Không có marker handler IOException BCI 95. Ảnh checkpoint 12 giây hiện logo; đây không phải phép đo presentation vật lý. Xem [audit ba lượt](evidence/milestone-1.5/scheduler-followup-20261022/cf-01-branch-proof.json), [trace R02](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF01-startup-R02/manifest.json), [R03](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF01-startup-R03/manifest.json), [R04](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF01-startup-R04/manifest.json) và [build](../../reference/recordings/scheduler-cf01-startup-20261022/build-manifest.json). CF-01 đạt tiêu chí success route startup đã thử; exception route không bị kích hoạt.

### CF-02 — `bt.run()V`, worker mode `a:B=1`

**JADX:** `bt.java:60–87` có `?? r0`, type warnings, `r0.printStackTrace()` không phải Java hợp lệ; dòng `87` đặt `break` sau khi tạo `/sgui/q…` và `q.k()`, làm đoạn `j()/k()/m.b()/q.b=true` trông chỉ chạy sau exception.

**javap:** BCI `146: goto 150`, handler `Exception` tại `149: pop` cũng tới `150`; `151` gọi `j()V`, `155` gọi `k()V`, `168` gọi `m.b(BBBB)V`, `172` store `q.b:Z=true`, `175: return`. Bytecode `94–96` xử lý `InterruptedException` bằng `Throwable.printStackTrace`; không suy diễn pseudo-variable `r0` thành type đúng để port.

**Ảnh hưởng tới port — suy luận:** giữ `break` sai có thể bỏ hậu xử lý worker/tín hiệu hoàn tất trên đường load thành công, khiến chuỗi điều khiển không tiến tiếp đúng như bytecode. Thân các helper chưa được giải nghĩa mechanics; chưa khẳng định đó là load map hay tạo nhân vật chỉ từ mode số.

**Runtime — ba nhánh success được xác nhận:** probe targeted ghi trực tiếp marker ngay trước `goto` BCI `146`, handler BCI `149`, điểm hợp nhất BCI `150`, các call `j/k/m.b`, store `q.b:Z`, và return. Ba worker mode 1 ở ba lần khởi chạy độc lập đều ghi BCI `146`, không có BCI `149`, sau đó chạy common suffix và store `q.b:Z=true` trước return bình thường. Trace không reflection hoặc ghi field game. Xem [CF-02 branch audit](evidence/milestone-1.5/scheduler-followup-20261022/cf-02-branch-proof.json), các manifest [R02](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF02-branch-R02/manifest.json), [R03](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF02-branch-R03/manifest.json), [R04](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF02-branch-R04/manifest.json) và [build manifest](../../reference/recordings/scheduler-cf02-branch-20261022/build-manifest.json). Mỗi run bắt đầu từ fixture đã xác minh và dùng AWT sidecar để đi qua UI; input không phải phím vật lý. Lượt R01 bị loại do lỗi timeline logging sau khi trace và screenshot đã hoàn tất; ba lượt sau được giữ riêng và hợp lệ.

### CF-03 — `m.e()V` khi pending `m.b:B=0`

**JADX:** `m.java:153–156` in `if (f273b == 0) {}` rỗng, rồi đọc lại slot, ghi `0` và switch. `f273b` là alias của pending **`m.b:B`**, không phải state **`m.e:I`**.

**javap:** `0: getstatic b:B`, `3: ifne 7`, `6: return`. Chỉ khi pending khác `0` mới đi `7` đọc slot vào local, `12` reset slot và dispatch.

**Ảnh hưởng tới port — có giới hạn:** cần giữ guard return để đúng control flow và không thêm read/store trên đường slot rỗng. Nếu slot giữ `0` và không có interleaving, Java in ra đi `switch(0)` default rồi kết thúc, nên **chưa có bằng chứng khác biệt gameplay quan sát được** chỉ vì thiếu return. Khi worker có thể ghi giữa các lần đọc/reset, các thao tác thêm tạo một interleaving khác có khả năng tiêu thụ/xóa command; đây là rủi ro suy luận, chưa phải race đã quan sát và không chứng minh bytecode gốc hoàn toàn an toàn. Đừng đổi pending slot thành queue hoặc tự thêm default transition vì cho rằng source block rỗng là thiếu logic.

**Runtime:** marker của scheduler trace ghi **6.911 invocation return tại BCI gốc 6** và không có marker reset BCI 12 trong cùng span; 30 invocation khác có marker reset. Đây là quan sát runtime trực tiếp, không phải chứng minh mọi interleaving. Thống kê, mẫu trace và giới hạn trong [FND-0004](FND-0004-runtime-scheduler.md). SCN-0008 còn yêu cầu các run có input/fixture liên kết và kiểm tra đối chứng; vì vậy chưa xem CF-03 là đã đóng theo scenario.

### CF-04 — `m.e()V`, command `21`, param `m.c:B=2`

**JADX hiện có:** `m.java:231–235` gọi `c()`, `ah.a().a(false)`, `a(1)`, `bt.d()`; sau dấu `}` dòng `236`, source tiếp tục qua `a(1)`, `br.f()`, `bt.a()` ở `237–239`. **Thiếu `return` sau `bt.d()`**, không phải có `break` tại dòng `235`. Đây là đính chính cách mô tả trong FND-0001 trước lượt M1.5; kết luận bytecode cũ về return vẫn đúng.

**javap:** `439: m.c()V`, `446: ah.a(Z)V` với false, `450: m.a(I)V` với state `1`, `453: bt.d()V`, **`456: return`**. Param `0/1` hoặc giá trị khác có đường tới `457–467`; `464: br.f()V`, `467: bt.a()V` không thuộc invocation param `2`.

**Ảnh hưởng tới port — suy luận:** nếu chép source in sai, sau `bt.d()` còn gọi `br.f()/bt.a()`, làm phát sinh thêm worker. Bytecode `bt.d()` đặt mode `5`, `bt.a()` đặt mode `1` và cả hai tạo Thread; mode là static `bt.a:B`. Chuỗi sai có thể ghi đè mode dùng chung và thay đổi nhánh worker/tài nguyên/UI/pacing. Đây là rủi ro khi tái dựng sai control flow, **không phải bằng chứng game gốc đã chạy hai worker hoặc có bug runtime đó**.

**Runtime — thân nhánh được xác nhận bằng controlled injection:** từ fixture `HOUSE-INPUT-001`, probe đợi gameplay state 2 với pending rỗng rồi chèn `(21,2)` đúng một lần tại `ar.paint`; trace ghi setter, pending command/param trong `m.e()`, `m.c()` (BCI gốc 439), state setter 1 (450), `bt.d()` (453), mode 5, return ngay sau `bt.d()` (456), rồi worker object cùng identity chạy case 5 tại BCI 190 trên thread riêng. Xem [analysis R01](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF04-injected-R01/analysis.json), [manifest](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF04-injected-R01/manifest.json) và [build manifest](../../reference/recordings/scheduler-cf04-injected-v5-20261022/build-manifest.json). Đây chỉ chứng minh thân nhánh thực thi được trên bản sao có probe.

Lượt New Game sạch R01 không injection ghi 22 event liên tục; sau chuỗi UI được ghi ở SCN-0002, state cuối là 4. Trong 30 giây không input, không thấy state 12/13, call site text-completion `ar.e(Graphics)` hoặc setter `(21,2)`. Xem [analysis](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF04-natural-R01/analysis.json) và [manifest](evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF04-natural-R01/manifest.json). Đây không chứng minh route tự nhiên không tồn tại; run chỉ không tới target. Không gửi W trong state 4 và không thử thao tác canh 0,9 giây theo yêu cầu skip. Chưa có ba run tự nhiên theo SCN-0008. CF-04 **chưa đóng**.

## Scenario và điều kiện thực nghiệm

Bộ [8 scenario](../../reference/scenarios/README.md) bao phủ startup, menu, input, loop, gameplay, save/load, visibility và 4 điểm CFG. [Protocol](../../reference/scenarios/J2ME-RUNTIME-PROTOCOL.md) ghi profile dự kiến FreeJ2ME-Plus AWT, P1 LCD `240×320`, scale `2`, Default keys, tắt fast-forward, limiter dự kiến `60`; build/commit/hash và mọi thông số hiệu lực **chưa được chốt bằng lượt chạy**. P2/P3 là bổ sung, không tuyên bố native resolution.

Protocol yêu cầu đo mapping host/raw/gameAction, release replay, callback/thread/correlation IDs, clock monotonic, cadence từng miền, input latency, overhead và snapshot RMS khi tiến trình dừng. Không dùng target `1000/i` làm FPS đã đo; không suy từ `repaint` thành `paint` 1:1; không dùng timestamp gần nhau để chứng minh happens-before giữa thread.

Preflight ban đầu chỉ tìm kiếm có giới hạn: không thấy emulator trong PATH/các search roots đã ghi; GUI khi đó chưa kiểm tra dù có biến DISPLAY. **Kết quả này chỉ áp dụng cho lượt chuẩn bị**, không phải kết luận JAR không tương thích. Lượt tiếp tục tìm thấy emulator tại `/home/locdt/tools/`, xác minh release/hash/commit và chạy game trên WSLg; xem FND-0003. Trace CF-01/02 success branch, CF-03 return, thân nhánh CF-04 bằng injection và một route New Game không tới target được cập nhật dưới đây/FND-0004; reachability tự nhiên CF-04 và các điều kiện khác vẫn mở.

## Kết luận và điều kiện hoàn thành

**Đã xác minh tĩnh:** cả 4 sai lệch vẫn được bytecode trực tiếp làm rõ; CF-04 cần mô tả là thiếu return. Ảnh hưởng tới port đã được ghi là suy luận từ flow, không phải kết quả gameplay thực nghiệm. REA chỉ đóng góp evidence archive từ M1; đối chiếu mới là JADX đọc qua shell + `javap` độc lập.

**Chưa xác minh runtime ở mức cần để đóng milestone:** CF-01 đã xác nhận nhánh startup success; CF-02 đã xác nhận success mode 1 cho route save-load đã thử; CF-03 đã thấy early return nhưng chưa đạt mọi điều kiện lặp/đối chứng của SCN-0008; CF-04 mới xác nhận thân nhánh bằng injection, chưa xác nhận route tự nhiên/ba lần lặp. Còn thiếu ordering bootstrap/Canvas height, callback ordering, cadence/FPS/latency, callback repeat/multiple keys, visibility/resume và đầy đủ chu kỳ save/load. Gameplay/startup/menu/input/cold load đã có quan sát một phần trong lượt tiếp tục; không còn mô tả toàn bộ gameplay là chưa từng chạy. Chưa có kết luận “đã đạt runtime verification”.

Để hoàn thành: chốt emulator/JVM/profile/mapping bằng lượt thực tế; tạo fixture tái lập; chạy đủ scenario/biến thể với 3 lượt độc lập; hoàn tất CF-04 và các điều kiện lặp/đối chứng CF-03; xác minh scheduler/input/visibility; đo timing kèm sai số/overhead; chứng minh save/load sau dừng tiến trình; cập nhật findings/overview/baseline với evidence và giới hạn còn lại. CF-01 startup success và CF-02 save-load success đều có ba lượt riêng. Checklist chi tiết tại [index scenario](../../reference/scenarios/README.md#điều-kiện-hoàn-thành-milestone). Khi thiếu một điều kiện trọng tâm, milestone vẫn **chưa hoàn thành**. `web/` không cần thay đổi để đóng phần xác minh bản gốc này.
