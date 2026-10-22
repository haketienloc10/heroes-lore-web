# SCN-0004 follow-up — state transition caller attribution, 2026-10-23

## Mục tiêu và cách đo

Kiểm tra lại trong runtime caller của state setter ở transition `2→4`. Probe hook entry/exit bình thường của `m.i()V` và `m.n()V`, rồi ghi span đang hoạt động ngay sau store gốc `m.e:I` trong `m.a(I)V`. Nó không dùng reflection, không gọi method game trực tiếp và không ghi field game. Cùng route state-triggered trên một bản copy `HOUSE-INPUT-001`, profile Motorola, chỉ giúp game tự nhiên tới state 4; AWT W được xếp sau store gốc state 4 để xác nhận bypass.

## Kết quả

Trong trace, năm sequence liên tiếp trên `EventProcessing-Thread` là: 2707 `m.i()` entry → 2708 `m.n()` entry (parent span `m.i`, id 231) → 2709 setter `m.e:I=2→4` trong span `m.n`, id 232 → 2710 `m.n()` exit → 2711 `m.i()` exit. Đây là lần lặp attribution caller thứ hai trong một route độc lập; ba route khác trước đó lặp lại state `2→4→1`, nhưng không hook caller.

Trace có 2.955 event, sequence liên tục, dropped=0; 262 `m.i/m.n` spans normal return và không có transition stack error. [Analysis](M15-SCN-0004-E-transition-attribution-R01/analysis.json), [raw trace](M15-SCN-0004-E-transition-attribution-R01/trace.jsonl), [run manifest](M15-SCN-0004-E-transition-attribution-R01/manifest.json), [build manifest](../../../../../reference/recordings/scheduler-probe-followup-20261023-transition-attribution-r1/build-manifest.json) và [top manifest](manifest.json) giữ nguồn.

## Giới hạn

Đây là một route/profile. Hook exit chỉ phủ normal `RETURN`, không exceptional exit; kết luận áp dụng cho span quan sát được. Bằng chứng không phủ transition khác, mọi caller/state, bàn phím vật lý hoặc presentation compositor. Input route tổng hợp và game chạy trong bản copy instrumented.
