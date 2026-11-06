# Script điều tra

Các script biến đổi hoặc kiểm tra dữ liệu decompile/asset sẽ đặt tại đây. Ghi rõ input, output, cách chạy và fingerprint bản JAR đã dùng.

Runtime M1.5 dùng emulator local, không phải REA evidence và không sửa game JAR:

- `run_runtime_smoke.py` tạo session startup/menu RMS sạch, dừng ở intro để xem ảnh.
- `run_runtime_gameplay.py` là chuỗi bốn hướng cũ; **không** phải recipe cửa ra HOUSE-EXIT-001.
- `RuntimeStateProbe.java` đọc snapshot và phát tap qua LCD KeyListener; `RuntimeFramebufferProbe.java` đọc frontbuffer không khóa cùng paint. `runtime_x11.py focus WINDOW` raise cửa sổ emulator và xác nhận X11 focus mà không gửi phím vào game; `tap` tự raise/focus trước khi phát host key.
- `RuntimeSequenceProbe.java` phát plan down/up/wait/frame và `burst <awt-code|none> <duration-ms> <interval-ms> <prefix>`. Burst chụp/copy frontbuffer trong một attach, tự nhả phím trước khi encode PNG, và ghi thời điểm bắt đầu/kết thúc từng lần đọc theo `System.nanoTime()` của JVM đích. Đây là thời điểm đọc frontbuffer, không phải callback game, update tick hay thời điểm present vật lý; không tự phát repeat, gọi method game, ghi field game hoặc transform class.
- `run_runtime_sequence.py` nhận `HEROES_LORE_SEQUENCE_PROBE_JAR` để chọn sidecar đã build riêng; mặc định vẫn là `/tmp/heroes-lore-runtime-sequence/sequence-probe.jar`.
- `RuntimeEnemyAttackSampler.java` attach chỉ-đọc để lấy mẫu state/frame/cooldown và HP của player cho một enemy ID; dừng theo số attack bắt đầu, mức HP giảm hoặc timeout. Script build đã biên dịch sidecar, nhưng lượt route Map27→Map17 gần nhất không tới được target nên chưa có runtime sample từ probe này.
- `snapshot_runtime_storage.py SESSION SNAPSHOT` chỉ copy storage sau khi PID đã dừng; `start_runtime_from_snapshot.py RUN SNAPSHOT` kiểm hash rồi tạo cwd/PID mới. RMS binary chỉ local.
- `run_runtime_input_case.py B 04 HOUSE-INPUT-001` là ví dụ lượt mới, restore qua UI trước case; không gọi B-R04 là đã chạy. Runner từ chối ghi đè directory.
- `audit_runtime_sessions.py` trích 71 cặp input/ảnh/config/hash từ ba session cũ, kiểm manifest; chỉ tạo **phân tích dẫn xuất**, không tạo runtime log.
- `finalize_runtime_evidence.py` lập manifest/index và tính khoảng bao hold từ log đã tồn tại; kiểm JAR/web/hash, không kiểm mechanics/FPS/ordering. Chạy sau khi mọi PID liên quan đã dừng.

Điều kiện build sidecar và manifest `Agent-Class` tại [evidence README](../findings/evidence/milestone-1.5/runtime-20261021/README.md). Snapshot/route UI và giới hạn tại [HOUSE-INPUT-001](../../reference/scenarios/fixtures/HOUSE-INPUT-001.md), [HOUSE-EXIT-001](../../reference/scenarios/fixtures/HOUSE-EXIT-001.md). Không có snapshot RMS trong clone Git; phải tạo qua UI thật trước khi replay.
