# SCN-0004 follow-up — state-triggered pacing bypass, 2026-10-23

## Mục tiêu

Xác nhận runtime nhánh `ag.a:Z=true` trong `br.b()V` mà không yêu cầu người điều khiển canh một cửa sổ ngắn bằng mắt. Mỗi run mở một bản copy độc lập của fixture `HOUSE-INPUT-001`, dùng profile Motorola và input AWT qua `RuntimeStateProbe` để đi tới cửa ra nhà. Probe game chỉ quan sát state setter gốc sau khi lưu `m.e:I=4`; khi thấy state 4, nó xếp đúng một sự kiện W vào Canvas KeyListener. Sự kiện đi qua mapping/emulator và handler game gốc; probe không reflection, không gọi trực tiếp method game, không sửa field game.

Đây là route có input tổng hợp được điều khiển theo state runtime, không phải bàn phím vật lý. Lần thử thủ công cần canh 0,9 giây vẫn được ghi nhận là skipped theo yêu cầu; lượt mới kiểm tra thân nhánh runtime bằng trigger đồng bộ.

## Kết quả

| Đoạn | Kết quả ở R01–R03 |
| --- | --- |
| Route | Mỗi fixture độc lập đi từ state 2 sang 4 rồi 1 |
| Right Soft | Mỗi lượt có một `ar.keyPressed` raw `-22` khi operand state là 4 |
| Handler | Mỗi lượt gọi `ag.a(II)V(-8,-8)` trên `EventProcessing-Thread` |
| Bypass | Mỗi lượt có 2 operand `ag.a:Z=true`; cả 2 `br.b()` span return mà không gọi `br.a(JJ)V` |
| Trace health | 1.693 / 1.743 / 1.758 event; sequence liên tục, dropped=0 mỗi lượt |
| State 4 timing | Down keydown→state 4: 586,803–645,844 ms; state 4→callback Right Soft: 71,386–71,465 ms; state 4→state 1 sau input: 175,936–178,296 ms |

Kết quả gộp và liên kết từng run nằm trong [aggregate](aggregate.json). Mỗi run có [analysis](M15-SCN-0004-E-bypass-state-triggered-R01/analysis.json), [trace](M15-SCN-0004-E-bypass-state-triggered-R01/trace.jsonl), [trigger action log](M15-SCN-0004-E-bypass-state-triggered-R01/trigger-actions.jsonl) và [manifest riêng](M15-SCN-0004-E-bypass-state-triggered-R01/manifest.json); cùng cấu trúc cho [R02](M15-SCN-0004-E-bypass-state-triggered-R02/manifest.json) và [R03](M15-SCN-0004-E-bypass-state-triggered-R03/manifest.json). Ảnh R01 ghi [gameplay trước cửa nhà](../../../../../reference/screenshots/M15-SCN-0004-E-bypass-state-triggered-R01/02-gameplay-before-exit.png) và [cảnh sau chuyển tiếp](../../../../../reference/screenshots/M15-SCN-0004-E-bypass-state-triggered-R01/03-after-exit-transition.png).

Build riêng từ game và emulator gốc đã khóa trong [build manifest](../../../../../reference/recordings/scheduler-probe-followup-20261023-bypass-state-trigger-r1/build-manifest.json). Source gồm [instrumenter](../../../scripts/StateTriggeredBypassInstrumenter.java), [probe](../../../scripts/StateTriggeredBypassTraceProbe.java), [builder](../../../scripts/build_state_triggered_bypass_probe.py), [runner](../../../scripts/run_state_triggered_bypass.py) và [analyzer](../../../scripts/analyze_state_triggered_bypass.py). Hash index toàn follow-up ở [manifest](manifest.json).

Một build follow-up tách riêng đã phân loại `Thread.sleep`/`Thread.yield` theo các state 1/2/4/9 trên ba route tương tự. Xem [evidence pacing theo state](../scheduler-followup-20261023-pacing-state/README.md) cùng raw trace và aggregate.

Một route bổ sung ghi trực tiếp đối số period `br.d:I` mà `br.b()` truyền vào `br.a(JJ)V`: state 1=200 ms, state 2/4=71 ms, state 9=50 ms. Xem [evidence period theo state](../scheduler-followup-20261023-pacing-period/README.md); đây là một route và không thay cho đo cadence/presentation.

Một trace độc lập bổ sung attribution caller cho transition `m.e:I=2→4`: setter chạy trong `m.n()` nested bên trong `m.i()`. Xem [evidence transition attribution](../scheduler-followup-20261023-transition-attribution/README.md).

## Giới hạn còn lại

Ba run xác nhận một route/profile và nhánh `ag.a:Z=true`; không chứng minh phím vật lý, mọi route hoặc mọi state. Evidence pacing bổ sung chỉ phủ các state xuất hiện trong route; các state khác và duration helper chưa đo. Quan hệ nhân quả repaint→paint, reachability tự nhiên CF-04, repeat/multi-key vật lý, presentation compositor và latency input→visible frame còn mở. SCN-0004 tiếp tục ở trạng thái **xác minh một phần**.
