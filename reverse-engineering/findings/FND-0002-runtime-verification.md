# FND-0002 — Milestone 1.5: Runtime Verification

**Ngày:** 2026-10-21. **Phiên bản:** Heroes Lore v2.1.2. **Cập nhật:** đối chiếu tĩnh hoàn tất; lượt tiếp tục đã chạy FreeJ2ME-Plus và có quan sát một phần cho SCN-0001/0002/0005, **chưa có scenario đạt toàn bộ, milestone chưa hoàn thành**. Báo cáo thực nghiệm tại [FND-0003](FND-0003-emulator-smoke.md). Phần dưới giữ bằng chứng và giới hạn của lượt chuẩn bị ban đầu; 4 điểm CF vẫn chưa có trace runtime trực tiếp.

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
| **Emulator — lượt chuẩn bị** | Chưa launch ở thời điểm lập phần đối chiếu này | Không hỗ trợ kết luận runtime khi đó | Lượt tiếp tục đã có build/profile/log/ảnh, ghi riêng ở FND-0003; chưa có trace CF |

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

**Runtime cần thu:** [SCN-0001](../../reference/scenarios/SCN-0001-startup.md), [SCN-0008](../../reference/scenarios/SCN-0008-control-flow.md): cùng invocation đi `92→96→99` rồi tới `208/211`, kèm input/fixture/exception. **Hiện chưa xác minh.**

### CF-02 — `bt.run()V`, worker mode `a:B=1`

**JADX:** `bt.java:60–87` có `?? r0`, type warnings, `r0.printStackTrace()` không phải Java hợp lệ; dòng `87` đặt `break` sau khi tạo `/sgui/q…` và `q.k()`, làm đoạn `j()/k()/m.b()/q.b=true` trông chỉ chạy sau exception.

**javap:** BCI `146: goto 150`, handler `Exception` tại `149: pop` cũng tới `150`; `151` gọi `j()V`, `155` gọi `k()V`, `168` gọi `m.b(BBBB)V`, `172` store `q.b:Z=true`, `175: return`. Bytecode `94–96` xử lý `InterruptedException` bằng `Throwable.printStackTrace`; không suy diễn pseudo-variable `r0` thành type đúng để port.

**Ảnh hưởng tới port — suy luận:** giữ `break` sai có thể bỏ hậu xử lý worker/tín hiệu hoàn tất trên đường load thành công, khiến chuỗi điều khiển không tiến tiếp đúng như bytecode. Thân các helper chưa được giải nghĩa mechanics; chưa khẳng định đó là load map hay tạo nhân vật chỉ từ mode số.

**Runtime cần thu:** [SCN-0002](../../reference/scenarios/SCN-0002-menu.md), SCN-0008: đường UI thật chạm worker mode `1`, load thành công rồi hậu xử lý và store cờ. **Hiện chưa xác minh.**

### CF-03 — `m.e()V` khi pending `m.b:B=0`

**JADX:** `m.java:153–156` in `if (f273b == 0) {}` rỗng, rồi đọc lại slot, ghi `0` và switch. `f273b` là alias của pending **`m.b:B`**, không phải state **`m.e:I`**.

**javap:** `0: getstatic b:B`, `3: ifne 7`, `6: return`. Chỉ khi pending khác `0` mới đi `7` đọc slot vào local, `12` reset slot và dispatch.

**Ảnh hưởng tới port — có giới hạn:** cần giữ guard return để đúng control flow và không thêm read/store trên đường slot rỗng. Nếu slot giữ `0` và không có interleaving, Java in ra đi `switch(0)` default rồi kết thúc, nên **chưa có bằng chứng khác biệt gameplay quan sát được** chỉ vì thiếu return. Khi worker có thể ghi giữa các lần đọc/reset, các thao tác thêm tạo một interleaving khác có khả năng tiêu thụ/xóa command; đây là rủi ro suy luận, chưa phải race đã quan sát và không chứng minh bytecode gốc hoàn toàn an toàn. Đừng đổi pending slot thành queue hoặc tự thêm default transition vì cho rằng source block rỗng là thiếu logic.

**Runtime cần thu:** [SCN-0004](../../reference/scenarios/SCN-0004-game-loop.md), SCN-0008: BCI trace/step của invocation pending `0`, return tại `6` và không qua `12`. Log “không có worker” hoặc video đứng yên không phân biệt được hai flow. **Hiện chưa xác minh.**

### CF-04 — `m.e()V`, command `21`, param `m.c:B=2`

**JADX hiện có:** `m.java:231–235` gọi `c()`, `ah.a().a(false)`, `a(1)`, `bt.d()`; sau dấu `}` dòng `236`, source tiếp tục qua `a(1)`, `br.f()`, `bt.a()` ở `237–239`. **Thiếu `return` sau `bt.d()`**, không phải có `break` tại dòng `235`. Đây là đính chính cách mô tả trong FND-0001 trước lượt M1.5; kết luận bytecode cũ về return vẫn đúng.

**javap:** `439: m.c()V`, `446: ah.a(Z)V` với false, `450: m.a(I)V` với state `1`, `453: bt.d()V`, **`456: return`**. Param `0/1` hoặc giá trị khác có đường tới `457–467`; `464: br.f()V`, `467: bt.a()V` không thuộc invocation param `2`.

**Ảnh hưởng tới port — suy luận:** nếu chép source in sai, sau `bt.d()` còn gọi `br.f()/bt.a()`, làm phát sinh thêm worker. Bytecode `bt.d()` đặt mode `5`, `bt.a()` đặt mode `1` và cả hai tạo Thread; mode là static `bt.a:B`. Chuỗi sai có thể ghi đè mode dùng chung và thay đổi nhánh worker/tài nguyên/UI/pacing. Đây là rủi ro khi tái dựng sai control flow, **không phải bằng chứng game gốc đã chạy hai worker hoặc có bug runtime đó**.

**Runtime cần thu:** SCN-0008: trace pending `21/2` được tiêu thụ, đi `453→456`, không qua `464/467`, worker mode `5`. `ar.keyPressed` state `14` là một seed tĩnh; chưa biết đường UI nào tới state đó. Injection command không thay thế chứng minh reachability từ UI. **Hiện chưa xác minh.**

## Scenario và điều kiện thực nghiệm

Bộ [8 scenario](../../reference/scenarios/README.md) bao phủ startup, menu, input, loop, gameplay, save/load, visibility và 4 điểm CFG. [Protocol](../../reference/scenarios/J2ME-RUNTIME-PROTOCOL.md) ghi profile dự kiến FreeJ2ME-Plus AWT, P1 LCD `240×320`, scale `2`, Default keys, tắt fast-forward, limiter dự kiến `60`; build/commit/hash và mọi thông số hiệu lực **chưa được chốt bằng lượt chạy**. P2/P3 là bổ sung, không tuyên bố native resolution.

Protocol yêu cầu đo mapping host/raw/gameAction, release replay, callback/thread/correlation IDs, clock monotonic, cadence từng miền, input latency, overhead và snapshot RMS khi tiến trình dừng. Không dùng target `1000/i` làm FPS đã đo; không suy từ `repaint` thành `paint` 1:1; không dùng timestamp gần nhau để chứng minh happens-before giữa thread.

Preflight ban đầu chỉ tìm kiếm có giới hạn: không thấy emulator trong PATH/các search roots đã ghi; GUI khi đó chưa kiểm tra dù có biến DISPLAY. **Kết quả này chỉ áp dụng cho lượt chuẩn bị**, không phải kết luận JAR không tương thích. Lượt tiếp tục tìm thấy emulator tại `/home/locdt/tools/`, xác minh release/hash/commit và chạy game trên WSLg; xem FND-0003. Save fixture và trace CF vẫn chưa có.

## Kết luận và điều kiện hoàn thành

**Đã xác minh tĩnh:** cả 4 sai lệch vẫn được bytecode trực tiếp làm rõ; CF-04 cần mô tả là thiếu return. Ảnh hưởng tới port đã được ghi là suy luận từ flow, không phải kết quả gameplay thực nghiệm. REA chỉ đóng góp evidence archive từ M1; đối chiếu mới là JADX đọc qua shell + `javap` độc lập.

**Chưa xác minh runtime ở mức cần để đóng milestone:** trace thực thi từng CF, ordering của bootstrap/Canvas height, callback ordering, cadence/FPS/latency, input repeat/multiple keys, visibility/resume và save/load. Gameplay/startup/menu đã có quan sát một phần trong lượt tiếp tục; không còn mô tả toàn bộ gameplay là chưa từng chạy. Chưa có kết luận “đã đạt runtime verification”.

Để hoàn thành: chốt emulator/JVM/profile/mapping bằng lượt thực tế; tạo fixture tái lập; chạy đủ scenario/biến thể với 3 lượt độc lập; thu trace trực tiếp cho 4 CF và scheduler/input/visibility; đo timing kèm sai số/overhead; chứng minh save/load sau dừng tiến trình; cập nhật findings/overview/baseline với evidence và các giới hạn còn lại. Checklist chi tiết tại [index scenario](../../reference/scenarios/README.md#điều-kiện-hoàn-thành-milestone). Khi thiếu một điều kiện trọng tâm, milestone vẫn **chưa hoàn thành**. `web/` không cần thay đổi để đóng phần xác minh bản gốc này.
