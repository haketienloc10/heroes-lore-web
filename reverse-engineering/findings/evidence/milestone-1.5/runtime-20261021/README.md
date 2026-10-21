# Evidence thực nghiệm WSLg — 2026-10-21

**Kết quả:** FreeJ2ME-Plus 1.52 chạy game; 5 scenario quan sát một phần, **chưa đánh dấu đạt toàn bộ**. Báo cáo [FND-0003](../../../FND-0003-emulator-smoke.md), [SCN-0001](../../../../../reference/scenarios/SCN-0001-startup.md), [SCN-0002](../../../../../reference/scenarios/SCN-0002-menu.md), [SCN-0005](../../../../../reference/scenarios/SCN-0005-gameplay.md).

## Nguồn bằng chứng

| File / nhóm | Producer và phạm vi |
| --- | --- |
| [environment.json](environment.json) | Python/Git/zipfile, JVM version; hash game/emulator/archive, digest asset upstream, HEAD source riêng; snapshot hash web trước chạy |
| [upstream-tag.json](upstream-tag.json) | Payload GitHub API công khai: tag `1.52` trỏ commit `8f87bf1497e7a9738a32d1909379376a1faca7dd` |
| [xwininfo-root.txt](xwininfo-root.txt), [xdpyinfo.txt](xdpyinfo.txt) | Kết nối X11/WSLg thực tế; không phải FPS hoặc gameplay |
| [harness.json](harness.json) | Hash source/sidecar probe và giới hạn; không transform class hoặc sửa JAR game |
| [runs.json](runs.json) (đợt ban đầu) | Danh sách session/run có kiểm soát và lượt khám phá, liên kết console/config/ảnh |
| [verification.json](verification.json) | Hash sau chạy, file web không đổi, manifest/ảnh/log có tồn tại; **không phải kiểm chứng mechanics** |
| `<run-id>/launch.json` | PID, argv/cwd hoặc liên kết session cha, điều kiện RMS/profile/input |
| `<run-id>/console.log`, `artifacts/` | Console nguyên vẹn và bản sao log/config của session; warning agent tách khỏi lỗi game |
| `<run-id>/input*.log/jsonl` | Input host thử nghiệm hoặc injection qua KeyListener, nguồn ghi rõ; không giả thành callback game |
| `<run-id>/state*.log`, `probe.log` | Snapshot field/config, AWT observer khi có; field đọc riêng, không nguyên tử, không phải ordering trace |
| `<run-id>/framebuffer.log`, capture logs | Nguồn/giờ lấy ảnh; ảnh native 240×320 khác ảnh X11 drawable và ảnh Robot đen |
| `<run-id>/stop.json`, `storage-manifest.json` | Dừng session do harness bằng SIGTERM, snapshot metadata storage sau dừng. Không phải test thoát UI/save/load |
| `<run-id>/manifest.json` | Tên file/hash/size của bằng chứng và ảnh local; không ghi đè preflight/verification của lượt chuẩn bị |

Không có call REA mới. Các file ở đây là **emulator + GUI/probe/local**, không phải kết quả REA/JADX/`javap`. Khi giải thích source emulator, dùng `git show 1.52:...`, không mặc định HEAD source tương ứng JAR.

## Các lượt chạy

**Có kiểm soát sau khi người dùng chọn không thao tác tay:** ba session startup P1M-R02/R03/R04, mỗi session có ba record SCN-0001/0002/0005 cùng hậu tố. Startup/menu lặp cùng chuỗi; gameplay R02/R03 là chuỗi trong nhà, R04 là biến thể đi cửa giữa dưới ra ngoài và thử gần NPC. Không tính thành 3 lần lặp mọi biến thể gameplay.

**Khám phá/chẩn đoán:** P1-R01 (auto-restart encoding), session P1-R02 + menu/gameplay P1-R01, P1M-R01 + menu P1M-R01. Có input OS khó đối chiếu/thao tác tay/injection; không dùng làm lượt lặp có kiểm soát. Hai ảnh AWT Robot đen của P1-R01 bị loại khỏi evidence hành vi; ảnh XGetImage logo có nguồn riêng.

Ảnh nằm local trong `reference/screenshots/<run-id>/` và được Git ignore. RMS nằm local trong `reference/recordings/<session-id>/`; chỉ giữ manifest/hash, config và log phù hợp trong evidence. Không phân phối game JAR, probe binary hoặc RMS binary trong Git. Manifest ảnh local cho phép đối chiếu hash trên máy này; clone repo không tự có ảnh.

## Tái lập harness

Điều kiện: OpenJDK có `jdk.attach`, FreeJ2ME-Plus 1.52/JAR đúng hash, X11/WSLg; một emulator của harness tại mỗi thời điểm và không thao tác tay. Compile source sidecar, không sửa game:

```bash
mkdir -p /tmp/heroes-lore-runtime-probe
javac --add-modules jdk.attach -d /tmp/heroes-lore-runtime-probe \
  reverse-engineering/scripts/RuntimeStateProbe.java \
  reverse-engineering/scripts/RuntimeFramebufferProbe.java
```

Tạo manifest `Agent-Class: RuntimeStateProbe` và `Agent-Class: RuntimeFramebufferProbe` tương ứng, đóng JAR sidecar thành `/tmp/heroes-lore-runtime-probe/probe-current.jar` và `frame-probe.jar`; cả hai chỉ chứa class của chính helper. Hash bản đã dùng ghi trong harness.json. Không thêm transformer hoặc sửa member JAR gốc.

```bash
python3 reverse-engineering/scripts/run_runtime_smoke.py 05
# Xem ảnh 13-after-load trước khi tiếp tục; không đoán màn hiện tại.
python3 reverse-engineering/scripts/run_runtime_gameplay.py 05
python3 reverse-engineering/scripts/stop_runtime_session.py M15-SCN-0001-P1M-R05
```

`05` chỉ là **ví dụ lượt mới chưa chạy**, không nằm trong kết quả thực nghiệm. Runner từ chối ghi đè directory đã có. Chuỗi cửa ra R04 khác runner gameplay chuẩn: sau Skip/chờ 10 giây, phát Down 1000 ms → nghỉ 1 giây → Down 1000 ms → nghỉ 5 giây, chụp từng mốc; input còn lại có trong log R04. Input injection bypass OS focus; chưa đo callback MIDlet hoặc bàn phím vật lý. Không dùng attach/breakpoint/snapshot để công bố timing/FPS nếu chưa đánh giá overhead.

Không có video CFR hoặc trace BCI/callback trong đợt này. Ảnh rời, snapshot và limiter 60 không thay thế số đo FPS hoặc trace 4 CF. SCN-0004/0007/0008 vẫn chưa chạy; SCN-0003/0006 đã được bổ sung bên dưới nhưng chưa đạt toàn bộ protocol.

## Evidence bổ sung: audit, input trong nhà và cold save/load

- [session-audit.json](session-audit.json), [session-inputs.csv](session-inputs.csv): phân tích dẫn xuất R02/R03/R04, 71 cặp input, 164 hash/size nguồn khớp. Giữ nguyên log/manifest cũ. R02/R03 không thực hiện cửa ra; chỉ R04 là lượt HOUSE-EXIT-001 đã quan sát.
- [continuation-environment.json](continuation-environment.json): game/emulator/JVM/host và hash source/probe binary mới. Không cài lại emulator hoặc sửa JAR.
- [continuation-manifest.json](continuation-manifest.json): hash các phân tích dẫn xuất/index và manifest run mới.
- [continuation-runs.json](continuation-runs.json): index run mới, liên kết manifest. `runs.json`/`verification.json` trước đó giữ lịch sử đợt đầu.
- [input-case-analysis.json](input-case-analysis.json): derived analysis từ `sequence-input.log`, mốc trước/sau listener và hold bounds; không phải callback trace game.
- [continuation-verification.json](continuation-verification.json): kiểm artifact/hash/web và số case; không kiểm mechanics, FPS hoặc ordering.
- [review.json](review.json): biên bản đọc ảnh và kết luận có giới hạn, phân biệt quan sát với giả thuyết tĩnh.

`M15-SCN-0001/0002-P1M-R05` là startup/menu mới; `M15-SCN-0003-P1M-R05` khám phá cạnh giường; `M15-SCN-0006-P1M-R05` khám phá save/quit trong cùng PID. `M15-SCN-0006-P1M-R05L` là PID mới cold load BED-SAVE-001 rồi save S2. `M15-SCN-0003-P1M-{A…E}-R{01…03}` cold load HOUSE-INPUT-001 vào directory/PID riêng trước từng case, mỗi biến thể ba lượt. Không trộn nhóm snapshot load với startup sạch hoặc gọi 15 case là cùng một biến thể.

Snapshot local có manifest đầy đủ sau dừng JVM: [BED-SAVE-001](M15-SCN-0001-P1M-R05/BED-SAVE-001-storage.json), [HOUSE-INPUT-001](M15-SCN-0006-P1M-R05L/HOUSE-INPUT-001-storage.json). RMS binary vẫn chỉ local, không commit. UI Save hiện “Game saved”; PID cũ đã dừng bằng SIGTERM trước copy/load PID mới. UI Exit riêng chưa dừng JVM; không đổi tên thành thoát JVM bình thường qua UI.

Tái lập case sau khi đã tạo snapshot hợp lệ trên máy:

```bash
mkdir -p /tmp/heroes-lore-runtime-sequence
javac -d /tmp/heroes-lore-runtime-sequence \
  reverse-engineering/scripts/RuntimeSequenceProbe.java \
  reverse-engineering/scripts/RuntimeFramebufferProbe.java
```

Tạo manifest JAR với `Agent-Class: RuntimeSequenceProbe`, đóng hai class trên thành `/tmp/heroes-lore-runtime-sequence/sequence-probe.jar`; helper attach vẫn là RuntimeStateProbe trong thư mục probe cũ. Không dùng manifest Agent-Class của RuntimeStateProbe cho sequence JAR. Sau đó chọn **run ID chưa tồn tại**:

```bash
python3 reverse-engineering/scripts/run_runtime_input_case.py B 04 HOUSE-INPUT-001
```

`B-R04` là ví dụ chưa chạy, không nằm trong kết quả. Recipe tạo/copy snapshot, route UI và điều kiện điểm neo tại [HOUSE-INPUT-001](../../../../../reference/scenarios/fixtures/HOUSE-INPUT-001.md); đường từ startup sạch ra cửa tại [HOUSE-EXIT-001](../../../../../reference/scenarios/fixtures/HOUSE-EXIT-001.md). Cần xem ảnh checkpoint/kết quả trước kết luận. Runner ghi input qua listener, không sửa state để đạt ảnh mong muốn. Không có callback trace, video CFR, số đo FPS/latency hoặc physical auto-repeat trong đợt bổ sung.
