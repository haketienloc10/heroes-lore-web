# FND-0001 — Lifecycle, Canvas và game loop

**Ngày:** 2026-10-21. **Phạm vi:** Milestone 1, Game Architecture Discovery. **Trạng thái:** đã xác minh cấu trúc tĩnh trọng tâm; chưa xác minh hành vi runtime.

**Artifact:** `original/heroes-lore-v2.1.2.jar` — SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`, 554715 byte. Hash khớp `original/SHA256.txt`, `sha256sum`, Python `hashlib` và `REA.open_binary`.

## Câu hỏi và kết quả

| Câu hỏi | Kết quả | Công cụ tạo bằng chứng |
| --- | --- | --- |
| Entry point và lifecycle? | Manifest chọn `rpg.GameMIDlet`; start một lần, pause chỉ log, destroy gọi `notifyDestroyed()` | Python `zipfile`; source JADX qua shell; `javap` |
| Canvas nào được tạo? | `bf` trước; có nhánh worker chuyển sang `ar`; cả hai kế thừa `q extends Canvas` | Source JADX qua shell; `javap` |
| Thread/game loop? | Thread khởi động `br`; mỗi `run()` gọi `q.i()`, `q.j()`, `Display.callSerially(this)`; `bf` và `bt` có workers riêng | Source JADX qua shell; `javap` |
| Update/render? | `ar.paint()` xử lý pending transition trước state switch; state `2` gọi update trước render; pacing ở cuối đường thông thường | Source JADX qua shell; `javap` |
| Input/state? | Press dispatch theo state, release có slot trì hoãn; state `int` và pending command `byte` là hai miền khác nhau | Source JADX qua shell; `javap` |
| REA phân tích J2ME trực tiếp? | Mở/inventory JAR như ZIP được; chưa phân tích bytecode qua provider trong session này | REA MCP thực tế; chi tiết [baseline](../../docs/rea-evaluation/baseline.md) |

Tổng quan và sơ đồ: [game-overview.md](../../docs/architecture/game-overview.md).

## Provenance và log

| Mã nguồn bằng chứng | Producer và nội dung | Artifact lưu lại |
| --- | --- | --- |
| `R1` | REA MCP: catalog/session trước và sau mở JAR, JEB probes, Android probe, lỗi trả về | [rea-probes.json](evidence/milestone-1/rea-probes.json) |
| `R2` | REA MCP: ba Evidence records inventory/inspection/summary | [rea-evidence-bundle.json](evidence/milestone-1/rea-evidence-bundle.json) |
| `L1` | Shell `sha256sum`; Python `zipfile/hashlib`: identity, manifest, hash source và so sánh extracted class | [local-evidence.json](evidence/milestone-1/local-evidence.json) |
| `J1` | `javap 21.0.12.1`: bytecode trực tiếp `rpg.GameMIDlet br q bf bt` | [javap-lifecycle-loop.txt](evidence/milestone-1/javap-lifecycle-loop.txt) |
| `J2` | `javap 21.0.12.1`: bytecode trực tiếp `ar m` | [javap-ar-m.txt](evidence/milestone-1/javap-ar-m.txt) |
| `S1` | Output JADX có sẵn, đọc bằng `rg`, `nl -ba`, `sed`; không chạy lại decompiler | Các vị trí source trong bảng dưới, fingerprint ở `L1` |

`S1`, `J1`, `J2`, `L1` **không phải kết quả REA**. Không có log phiên bản/lệnh JADX ban đầu nên không khẳng định phiên bản đã tạo source. Header source ghi tên JAR; bảy extracted `.class` khớp byte JAR, nhưng tính đúng của Java decompiled phải kiểm riêng. `defpackage/` không phải package xuất hiện trong tên member JAR: ví dụ `ar.class` ở root. Alias field/method của JADX không phải original symbol; bytecode descriptor giúp phân biệt các tên trùng.

REA Evidence IDs trong `R2`:

- Inventory: `ev_2b2d621e1d3e9b798c02223f09e2b01eef6f2515d7c7bcdcae9a2ba60dc242c8`.
- Inspection: `ev_c9012956b190fbc3e6046d525bec51a96112d83a9f3708a55cd6aae01cb08276`.
- Summary projection: `ev_e15ff1be198582797cae5b46c63da01b110c60219872a9baf7b331fba1549f21`.
- Graph manifest: `agm_6ba713d1c1c48f6571b0e524d05956df7963dc38f18b62ac5965014365a4520e`.

Các lệnh local trọng tâm đã chạy (chỉ đọc artifact):

```bash
sha256sum original/heroes-lore-v2.1.2.jar
javap -version
javap -classpath original/heroes-lore-v2.1.2.jar -c -p -s rpg.GameMIDlet br q bf bt
javap -classpath original/heroes-lore-v2.1.2.jar -c -p -s ar m
```

Ngoài ra dùng Python chuẩn để đọc manifest, đếm `.class`, tính hash/so sánh bảy class; dùng `rg`, `nl -ba`, `sed` để tìm call site và đọc source. Không cài provider/dependency, không chạy game, không sửa JAR hoặc `web/`.

## Bản đồ vị trí đã xác minh

Mọi path source trong bảng có tiền tố `reverse-engineering/decompiled/sources/`. Dòng log bytecode là vị trí trong output `javap` lưu ở trên; **BCI** bên dưới là offset trong method bytecode, không phải offset tuyệt đối trong JAR. Producer cho bảng này là `S1` với đối chiếu `J1/J2`, không phải `R1/R2`.

| ID | Class / method | Path và dòng source | Log bytecode / điểm đối chiếu |
| --- | --- | --- | --- |
| `E01` | `rpg.GameMIDlet.<init>/startApp/pauseApp/destroyApp/a()` | `rpg/GameMIDlet.java:15–42` | `J1:11–67`; `startApp()` tại dòng `23` |
| `E02` | `br.a(Display)`, constructor | `defpackage/br.java:53–70` | `J1:126–190` |
| `E03` | `br.c()` / `br.run()` | `defpackage/br.java:116–119,73–90` | `J1:300–312,192–252`; `run()` BCI `71–90`: `q.i`, `q.j`, `callSerially` |
| `E04` | `br.d()` | `defpackage/br.java:121–126` | `J1:313–332`; BCI `1`: `new ar`, `29`: `setCurrent`, `32`: `m.p` |
| `E05` | `q.<init>/i/j/m115a(int)` | `defpackage/q.java:20–33,185–197` | `J1:655–698,1248–1274`; `m115a` có tên bytecode `a:(I)V` |
| `E06` | `bf.a()/run()/a(boolean,byte)` | `defpackage/bf.java:199–218,68–120,262–277` | `J1:2113–2169,1628–1725,2300–2342` |
| `E07` | `bf.paint()/keyPressed()` | `defpackage/bf.java:122–197,40–65` | `J1:1727–2111,1567–1626` |
| `E08` | `bt.a/b/c/d()` / `run()` | `defpackage/bt.java:35–114` | `J1:2399–2556`; mode `2` BCI `48–76`, mode `1` BCI `77–175` |
| `E09` | `ar.<init>/paint(Graphics)` | `defpackage/ar.java:52–156` | `J2:77–323`; `paint()` tại `J2:133`; BCI `6`: `m.e()`, `9`: state `m.e:I` |
| `E10` | `ar.keyPressed/keyReleased/a(int,int)` | `defpackage/ar.java:189–340` | `J2:403` press; `J2:543` release; helper ngay sau release |
| `E11` | `ar.hideNotify/showNotify` | `defpackage/ar.java:168–187` | `J2:342–402` |
| `E12` | `m.a(byte...):void`, `m.a(int)`, `m.e()` | `defpackage/m.java:117–143,271–273,152–242` | `J2:2868–2919,3169–3175,2933–3103` |
| `E13` | `m.g/i/j/q/n/h/b(byte)` | `defpackage/m.java:266–269,330–347,467–475,313–316,299–311` | `J2`: các method tương ứng; tên source alias `m101a/m102b` tại `m.java:449–457` |
| `E14` | `m.p()` cuối method | `defpackage/m.java:766–768` | `J2:4568` bắt đầu method; BCI `286–290` enqueue `(2,9,3)` |

## Các kết luận tĩnh

### Lifecycle và scheduling (`E01–E08`)

**Bằng chứng:** `startApp()` có guard một lần và gọi `br.c()`. Thread `br` bootstrap `bf`; sau đó mỗi `run()` lấy shared lock, kiểm tra cờ `e`, ghi thời gian, xử lý release đang chờ, yêu cầu repaint và tự gửi lại chính Runnable qua `Display.callSerially`. Không có `while` trong method `br.run()` đã đối chiếu bytecode.

**Suy luận:** đây là loop dựa vào callback tự xếp lịch, có workers tách riêng cho khởi tạo/tải. Không gọi `br.run()` là một Thread update liên tục riêng sau bootstrap; chưa quan sát thread identity thực tế khi callback chạy. `br.d()` có thể được gọi từ worker `bf.run()`; chưa xác minh tính tuần tự với callback Display.

**Bằng chứng pacing:** `br.a(int)` đặt `d=1000/i` bằng phép chia nguyên; `e/f/g` chọn cấu hình/5/20 (`br.java:128–146`). `br.b()` gọi sleep/yield theo elapsed từ `System.currentTimeMillis()`, trừ khi `ag.f45a` (`93–114`). `ar.paint()` cuối đường thông thường và `bf.paint()` gọi `br.b()`. Nhánh return sớm `ar.java:90` bỏ qua pacing cuối method.

**Chưa xác minh:** FPS thực tế, callback paint có bị gộp hay không, deadline/độ trễ, resume, và cờ `br.e` được dùng thế nào ngoài vùng đã đọc. Không có bằng chứng fixed timestep accumulator trong các method scheduler/paint đã khảo sát.

### Update/render và state (`E09`, `E12–E14`)

**Bằng chứng:** `ar.paint()` gọi `m.e()` trước dispatch state; nhánh state `2` gọi `m.g()` và `m.i()` rồi mới render. `m.i()` có lời gọi update object qua `q()/n()/f269a.b()`. Thứ tự `m.g`/`m.i` đổi theo `br.f168a.f162d`. Sau update có kiểm tra lại state trước render. Vì vậy `paint` không phải render thuần.

**Bằng chứng:** state hiện tại là `m.e:I`; pending command là `m.b:B` trong bytecode, alias JADX `f273b`. Các overload `m.a(byte...):void` ghi một slot command/params; `m.a(int)` đổi state ngay. Method `m.e()` return nếu slot bằng 0, còn lại đọc/reset rồi switch. Không biến slot này thành giả định có queue nhiều command hoặc bảo đảm không mất command.

| Pending command | Hành vi được xác minh | Vị trí source / bytecode |
| --- | --- | --- |
| `1` | State `1`, `br.f()`, start `bt.b()` | `m.java:158–162`; `m.e()` BCI `116–129` |
| `2` | State bằng param thứ nhất; param thứ hai `0/1/2/3` chọn `br.a(param3)/e/f/g` | `m.java:163–173`; BCI `328–391` |
| `11` | Param `0/1/2` chọn state `6/7/8`, gọi init `bo/aw/z` | `m.java:175–190`; BCI `130–199` |
| `12` | State `2`, hook `aw/z` theo param | `m.java:191–201`; BCI `200–250` |
| `13` | State `5`, hook `ah` | `m.java:202–209`; BCI `251–297` |
| `14` | Param `1`: state `1`, worker `bt.d()`; còn lại gọi `ah.a().a(true)` | `m.java:210–218`; BCI `298–327` |
| `15` | Gọi `m.f()`; method này kết thúc bằng pending `(2,2,1)` | `m.java:219–221,250–264`; BCI `392–395` |
| `16` | State `10`, counter `ar.f82e=16` | `m.java:222–225`; BCI `396–406` |
| `21` | Param `0/1`: gọi `m.a()/b()`, rồi state `1`, `br.f()`, `bt.a()`; param `2`: gọi `m.c()`, hook `ah`, state `1`, `bt.d()`, **return** | `m.java:226–240` có sai lệch ở nhánh param `2`; BCI `407–470` là bằng chứng ưu tiên |

`bf.a/b`, `bt.a`, `m.e`, pending `f273b`, và cặp pending action `f277h/f278i` là các biến điều phối riêng. Không dùng một state diagram duy nhất với tất cả các số này.

### Input và visibility (`E05`, `E07`, `E10–E13`)

**Bằng chứng:** input `ar` cùng khóa `br.f167a` với `paint` và scheduler; normalize `±21→53`, `±22→-8`; dispatch theo state. Raw `50/52/54/56` và gameAction `1/2/5/6` route tới `m.b(1/3/4/2)`. Release có một slot `q.f`; `q.i()` phát lại sau khi xóa cờ `q.a`. `m.h()` lưu pending action để update xử lý tiếp. `bf.keyPressed()` dùng mode `bf.a` riêng và không dùng kết quả `getGameAction()`.

**Bằng chứng:** input state `11` gửi `(2,2,1)`; visibility state `2` gửi command `13`, dẫn đến state `5`. Visibility state `1` có đường ghi ngay state `15` (`ar.java:168–187,224–227`). `GameMIDlet.pauseApp()` chỉ log không phủ định các callback Canvas này.

**Chưa xác minh:** key repeat trên runtime, nhiều phím cùng lúc, trường hợp press/release giữa các callback, và ý nghĩa mechanics của các action byte. Không tìm thấy `keyRepeated` trong bounded search toàn bộ `decompiled/sources/`; không từ đó kết luận runtime không phát repeat.

## Sai lệch JADX được bytecode làm rõ

Các mục sau là phát hiện của **`javap` trực tiếp**, không phải REA. Không sửa lại source decompile; tài liệu ưu tiên bytecode tại điểm mâu thuẫn.

1. **`bf.run()` nhánh `a=0,b=1`:** JADX in `break` tại `defpackage/bf.java:80`, làm `cd.y()/cd.A()` có vẻ bị bỏ qua khi load thành công. `J1:1628`, BCI `92: goto 96`, BCI `96/99`: gọi `cd.y()/A()`; BCI `207–211`: gọi `b()/q.k()`. Exception handler `IOException` tại `95` cũng nối về `96`. Kết luận: đường load thành công tiếp tục qua các lệnh này, không break sớm như Java in ra.
2. **`bt.run()` mode `1`:** JADX có type warnings, `?? r0` và `break` tại `defpackage/bt.java:60–87`. `J1:2469`, BCI `146: goto 150` nối `j()`, `k()`, `m.b(BBBB)`, `q.b=true` ở BCI `150–172`. Đường thành công không dừng ở `break` được in. Không diễn giải `r0.printStackTrace()` như Java hợp lệ.
3. **`m.e()` khi không có pending:** JADX in `if (f273b == 0) {}` tại `defpackage/m.java:153–154`. `J2:2933`, BCI `0–6` xác nhận `return` nếu command bằng 0. Việc không làm gì khi không có pending có bằng chứng bytecode; không dựa vào block rỗng của JADX.
4. **`m.e()` command `21`, param `2`:** đính chính mô tả khi kiểm tra lại M1.5: source JADX hiện có **thiếu `return` sau `bt.d()`** tại `defpackage/m.java:235`, rồi tiếp tục tới `br.f()/bt.a()` tại dòng `238–239`; không có `break` tại dòng `235`. `J2`, BCI `439–456` gọi `m.c()`, `ah.a(false)`, đổi state `1`, `bt.d()`, rồi **return ở `456`**. Đường tới `br.f()/bt.a()` tại `457–467` thuộc các nhánh còn lại. Kiểm tra bytecode mới, ảnh hưởng tới port và giới hạn runtime: mục CF-04 trong [FND-0002](FND-0002-runtime-verification.md).

`bf.keyPressed()` mode `2` đặt `a=3` và start Thread (`bf.java:51–56`); bytecode `bf.run()` thực sự chỉ có outer case `0` (`J1:1628`, BCI `4`, default `237`). Đây là quan sát tĩnh đáng giữ lại, chưa gán nguyên nhân, bug hay mechanics. Các vùng `ar.g()/h()` và `m.p()` còn có type inference placeholders; chỉ dùng các đoạn đã đọc/đối chiếu, không coi toàn bộ output JADX là Java có thể biên dịch.

## Ranh giới và phần việc tiếp theo

Bắt đầu từ sáu seed được yêu cầu; chỉ mở rộng thân method của `m` vì có reference trực tiếp từ `br.d()`, `ar.paint()` và `bt.run()`. Các class khác chỉ xuất hiện dưới dạng call target; chưa nghiên cứu implementation của chúng. REA inventory không được dùng để suy ra call graph hay mechanics.

Để xác minh hành vi cần emulator/scenario cho start, `bf→ar`, input press/release, visibility và cadence; chưa có scenario đã chạy để liên kết. Cần audit workers/shared state trước khi mô tả bảo đảm concurrency. Map/resource format, collision, persistence và mechanics cần findings riêng. Không có coverage/accuracy/fidelity định lượng ở giai đoạn này.

**Cập nhật M1.5, 2026-10-21:** đã chuẩn bị [8 scenario và protocol](../../reference/scenarios/README.md), kiểm tra lại cả 4 sai lệch bằng `javap`; xem [FND-0002](FND-0002-runtime-verification.md). Chưa launch emulator, 0/8 scenario đã chạy; mọi kết luận runtime vẫn chưa xác minh.

**Lượt tiếp tục:** [FND-0003](FND-0003-emulator-smoke.md) đã có quan sát emulator cho startup/menu/gameplay (3 scenario một phần, chưa đạt toàn bộ), gồm chuyển từ giường ra ngoài nhà. Chưa có trace BCI cho 4 sai lệch hoặc callback ordering; không coi snapshot/ảnh là xác nhận mọi flow ở finding này. Đoạn cập nhật phía trên là lịch sử lượt chuẩn bị.
