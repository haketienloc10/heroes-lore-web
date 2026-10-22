# SCN-0004 follow-up — FreeJ2ME repaint to AWT paint, 2026-10-23

## Câu hỏi và phương pháp

Trace scheduler trước chỉ ghép các `Canvas.repaint()` MIDP với `FreeJ2ME$LCD.paint()` thành candidate sets; nó không nhận diện request nào tạo paint event nào. Probe này theo seam thật của FreeJ2ME: `MobilePlatform.flushGraphics()` gọi painter; `FreeJ2ME$6.run()` gọi `LCD.repaint()`; trong `LCD.paint()`, probe đọc `EventQueue.getCurrentEvent()` và chỉ ghép request đang chờ khi event là `PaintEvent.UPDATE` có source đúng cùng LCD object.

Probe hook thêm `ar.paint(Graphics)` và đọc trực tiếp `m.e:I` tại entry, chỉ để xác nhận state trong cửa sổ gameplay. Không dùng reflection, không ghi field game và không inject state. Ba Enter tổng hợp tải save qua UI từ `HOUSE-INPUT-001`; profile thực tế của fixture là `Standard`.

## Kết quả

Run [R01](M15-SCN-0004-E-repaint-causality-R01/manifest.json) có 3.693 event liên tục, dropped=0, không có span-stack hoặc AWT lookup error. Có 446 lần `MobilePlatform.flushGraphics()` gọi `FreeJ2ME$6.run()`, tạo 446 repaint request ID cho cùng LCD. Mỗi ID được lấy lại trong một `PaintEvent.UPDATE` có source là đúng LCD object, rồi cùng event dispatch gọi `LCD.paint()`: **446/446 request-to-update-to-paint links**, mỗi event có đúng một request ID trong cửa sổ thu; không còn request hoặc update paint nào unmatched. Một `LCD.paint()` khác chạy trong `PaintEvent.PAINT` và không có request ticket.

Sau checkpoint ảnh xác nhận gameplay trong 10,457 ms, có 146 entry `ar.paint` với state 2 và 146 lần flush/request/update/paint tương ứng. Các span `ar.paint` không phải ancestor của flush request trong trace, nên số đếm trùng trong cửa sổ này không được diễn giải thành quan hệ nhân quả game-update-to-visible-frame. Một `ar.paint` state 2 cuối bị censor khi process dừng; nó không ảnh hưởng các link LCD đã hoàn tất.

Xem [analysis](M15-SCN-0004-E-repaint-causality-R01/analysis.json), [trace](M15-SCN-0004-E-repaint-causality-R01/trace.jsonl), [ảnh gameplay](../../../../../reference/screenshots/M15-SCN-0004-E-repaint-causality-R01/02-gameplay-after-load.png), [per-run manifest](M15-SCN-0004-E-repaint-causality-R01/manifest.json), [build manifest](../../../../../reference/recordings/scheduler-repaint-causality-20261023-r1/build-manifest.json) và [manifest evidence](manifest.json).

## Giới hạn

Kết quả xác nhận request `LCD.repaint()` tới AWT `PaintEvent.UPDATE` và `LCD.paint()` trên một route/profile đã thu. Một `UPDATE` có thể gom nhiều repaint request ở route hoặc phiên bản AWT khác; capture này tình cờ ghi một request cho mỗi event. Quan hệ `ar.paint` → flush/render request chưa được nối trong cùng span; AWT callback tới compositor/physical presentation, số frame hiển thị và latency input→visible cũng chưa đo. Input route là AWT tổng hợp; không phải repeat hoặc nhiều phím vật lý.
