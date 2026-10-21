# HOUSE-INPUT-001 — Điểm neo thử input trong nhà

**Loại:** snapshot storage lúc tiến trình đã dừng, load qua UI; khác fixture startup sạch [HOUSE-EXIT-001](HOUSE-EXIT-001.md). Snapshot nhị phân chỉ local, không đưa vào Git.

Nguồn: session `M15-SCN-0006-P1M-R05L`, kế thừa save cạnh giường từ `BED-SAVE-001`. Sau cold load: W đóng Status → Down giữ yêu cầu 1000 ms → release/nghỉ 1 giây → Left giữ yêu cầu 500 ms → release/nghỉ 1 giây. Ảnh `12-S2-input-room.png` xác nhận nhân vật ở gian dưới, bên trái bàn/ghế giữa nhà; vẫn trong nhà. W → Right ×5 → System/Save → Enter; ảnh `14-S2-saved.png` hiện “Game saved”. Sau đó dừng JVM bằng SIGTERM, xác nhận dừng rồi copy toàn bộ storage.

Manifest snapshot: [HOUSE-INPUT-001-storage.json](../../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0006-P1M-R05L/HOUSE-INPUT-001-storage.json). Bản local: `reference/recordings/snapshots/HOUSE-INPUT-001/`. Mỗi case copy nguyên snapshot sang working directory mới, kiểm từng hash/size trước launch, cùng game/emulator P1M và argv như HOUSE-EXIT-001; không dùng storage đã bị case trước thay đổi.

Đường restore đã quan sát: startup chờ 10 giây → Enter → menu **đã chọn Load Game** → Enter → chọn Ronin → Enter → chờ 10 giây → ảnh `04-restored-fixture.png`. Không thêm Down ở menu: với save này, Down sẽ chuyển sang Options. Ghi đầy đủ ảnh/input, không suy tên màn từ tên file chụp.

Case A–E dùng các [plan A](input-A.plan), [B](input-B.plan), [C](input-C.plan), [D](input-D.plan), [E](input-E.plan). Plan là lịch yêu cầu; `sequence-input.log` mới là dispatch đã xảy ra. `frame` trong lúc giữ phím có overhead, nên B gồm hai `wait(500)` cộng thời gian capture/log/dispatch; không gọi là đúng 1000 ms.

Sidecar gọi LCD KeyListener trên AWT EventQueue; không ép tọa độ, gọi method game, sửa JAR hoặc transform class. Mỗi down/up có mốc trước/sau gọi listener; mapping là kết quả mapper emulator, không phải trace `ar.keyPressed`. Không tự phát repeat khi đang giữ; chỉ phép thử tổng hợp này có cấu hình đó. Repeat bàn phím vật lý, callback game, normalize runtime, slot release, pending action, state/RNG đầy đủ, FPS và latency **chưa xác minh**.

Khởi tạo có cùng byte storage, profile, đường UI và điểm neo được chụp. Điều đó không chứng minh toàn bộ RAM/RNG/thread scheduling giống nhau. So sánh ba lượt chỉ trong từng biến thể, không gộp A–E, snapshot load và startup sạch thành cùng replay.
