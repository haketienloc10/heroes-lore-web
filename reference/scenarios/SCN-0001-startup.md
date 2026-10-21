# SCN-0001 — Startup và chuyển Canvas

**Trạng thái bản gốc:** đã quan sát một phần; **chưa đạt toàn bộ**. Startup sạch có R02/R03/R04; cold startup/load với snapshot có save đã quan sát ở SCN-0006. Trace CF-01/ordering chưa xác minh. **Web:** chưa chạy. Kế hoạch ban đầu và biên bản thực nghiệm tách riêng bên dưới.

## Điều kiện và input

Biến thể bắt buộc A: working directory mới, RMS sạch. B: khởi động lạnh tiến trình với RMS fixture đã tạo ở SCN-0006. Fixture B trong lượt tiếp tục là BED-SAVE-001/HOUSE-INPUT-001 tạo qua UI save và snapshot sau dừng JVM; xem SCN-0006. Kế hoạch trace vẫn chưa thực hiện. Profile P2/P3 là bổ sung theo quy trình.

1. Bắt đầu console/capture/trace trước launch. Ghi `t0` launch, `startApp`, `setCurrent(bf)`, `bf.paint` đầu tiên và kích thước/clip.
2. Không input 10 giây; chụp mọi màn chuyển và trạng thái cuối khoảng chờ. Nếu màn chờ phím đã xuất hiện sớm, vẫn lưu mốc xuất hiện.
3. Khi màn yêu cầu xác nhận được quan sát, `tap(5,100)`, `wait(1000)`; tiếp tục từng lần xác nhận khi UI thực sự yêu cầu. Ghi ảnh trước/sau và đầy đủ input. Không spam phím để vượt startup.
4. Theo dõi `bf→ar`, lần `ar.paint` đầu và màn ổn định kế tiếp. Dừng thu sau 5 giây ổn định; giới hạn quan sát 60 giây. Nếu cần thêm thời gian, tạo lượt mới với giới hạn ghi rõ. Timeout là dữ kiện cần điều tra, chưa chứng minh JAR lỗi.
5. Đóng emulator, lưu trạng thái RMS/config rồi chạy lại từ cùng điều kiện A hoặc B; không biến lượt A tiếp theo thành warm start.

## Cần kiểm tra

- UI thực tế, thời gian đến từng mốc, exception, màn đứng yên; startup A/B có khác nhau không.
- Trace CF-01: `bf.run() a:B=0,b:B=1`, resource load thành công rồi tới `cd.y()/A()`, các bước sau và `bf.b()`. Nhánh exception chỉ xem là đã phủ nếu có exception thực tế; không làm hỏng JAR gốc để tạo lỗi.
- Thứ tự `q.h` được cập nhật trong `bf.paint` so với constructor `ar`; ghi `getHeight`, clipHeight, `q.g/h` lúc constructor. Không có paint log thì câu hỏi kích thước vẫn chưa xác minh.
- Ghi các worker/thread và `setCurrent`, không suy ra callback tuần tự chỉ vì màn hình hợp lý. Nếu gặp đường `bf.a=3` sau input mà worker không làm gì, lưu trace và chuỗi UI; chưa gán nguyên nhân.

**Cơ sở tĩnh:** FND-0001 E01–E07; CF-01 trong [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). Dự đoán bytecode là giả thuyết cần đối chiếu runtime, không phải kết quả của scenario.

**Tiêu chí đóng:** có run A/B tái lập, ảnh và console startup; trace các mốc Canvas/chiều cao và CF-01 trên đường thành công. Mỗi lần chưa tới `ar` phải báo điểm dừng. Lượt chuẩn bị ban đầu chưa có evidence runtime; kết quả lượt tiếp tục nằm dưới đây.

## Thực nghiệm 2026-10-21

**Phiên bản và cấu hình:** game SHA-256 ở [index](README.md); FreeJ2ME-Plus release 1.52, tag commit `8f87bf1497e7a9738a32d1909379376a1faca7dd`, emulator SHA-256 `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e`. P1M Motorola, LCD 240×320, limiter 60, encoding ISO_8859_1; OpenJDK 21.0.12.1/WSLg. Cấu hình RAM, config disk và giới hạn input/ảnh tại [FND-0003](../../reverse-engineering/findings/FND-0003-emulator-smoke.md).

| Run | Điều kiện / thao tác | Kết quả quan sát | Evidence |
| --- | --- | --- | --- |
| M15-SCN-0001-P1-R01 | Launch UTF-8 mặc định | Auto-restart vì encoding; không giữ đầy đủ console/profile; ảnh Robot đen không dùng để chứng minh UI | launch/console/input-host; ảnh XGetImage logo; lượt khám phá |
| M15-SCN-0001-P1-R02 | Standard, encoding đặt từ launch | Log MIDlet/Canvas, vào menu và chơi được sau đó; có cả input OS khó đối chiếu và injection, không dùng làm lượt lặp chuẩn | console, snapshot, ảnh host; liên kết các run menu/gameplay P1-R01 |
| M15-SCN-0001-P1M-R01 | Motorola, có thao tác tay | AWT Enter ngoài harness lúc 14:55:13Z; người dùng xác nhận điều khiển tay | probe.log; lượt hỗn hợp, loại khỏi lặp có kiểm soát |
| M15-SCN-0001-P1M-R02 / R03 / R04 | Ba working directory/RMS sạch độc lập; không input 10 giây; capture; injection Enter AWT 10 giữ 100 ms, chờ 2 giây; capture/snapshot | Có logo ở checkpoint; sau xác nhận vào menu. Snapshot trước input có controller `bf`, sau startup có `ar`, `q.g/h=240/320`; không quan sát fatal crash ngăn tiếp tục | Mỗi run có launch.json, console.log, input.log, framebuffer.log, state-before-input.log, state-after-startup.log, window-tree.txt và manifest |

Thời gian trên là **lịch checkpoint/wait của harness**, không phải latency startup hoặc thời điểm đầu tiên frame xuất hiện. Không dùng các checkpoint để báo FPS hoặc suy callback ordering. Ảnh sau Enter xác nhận đã vào menu tại mốc capture, chưa đo chính xác thời gian hoàn tất startup.

Ảnh local `reference/screenshots/<run-id>/02-10s-framebuffer.png`, `03-after-startup-Enter.png`; ảnh host `01-10s-X11.png` có producer riêng. Metadata/hash ảnh và log tại [runtime evidence](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/README.md); ảnh ignored, chưa được phân phối trong Git.

**Lỗi đã ghi:** auto-restart encoding ở lượt mặc định; Tone/MIDI không mở được; RecordStore `_c` vắng ở RMS sạch rồi có bước tạo/ghi. Game vẫn tiếp tục. Không kết luận game crash từ exception đã log; audio chưa xác minh.

**Còn thiếu để đạt:** startup B với save fixture hợp lệ; trace constructor/clip/paint và CF-01 theo invocation/BCI; hiệu chuẩn đường input vật lý. Snapshot `q.h=320` sau startup không chứng minh nó được gán đúng trước constructor `ar`.

## Bổ sung cold startup có save

Lượt R05 sạch tạo save cạnh giường; PID cũ đã dừng trước snapshot. R05L dùng bản sao BED-SAVE-001 và PID mới, menu chọn sẵn Load Game thay vì New Game. Đường tạo/load/ảnh/hash xem [SCN-0006](SCN-0006-save-load.md#thực-nghiệm-tiếp-tục--cold-load-đã-quan-sát). Đây là quan sát biến thể có save, không thay trace CF-01/Canvas/ordering hoặc ba chu kỳ độc lập. Audit R02/R03/R04 nằm ở [HOUSE-EXIT-001](fixtures/HOUSE-EXIT-001.md); không gộp ba session thành ba replay cửa ra.
