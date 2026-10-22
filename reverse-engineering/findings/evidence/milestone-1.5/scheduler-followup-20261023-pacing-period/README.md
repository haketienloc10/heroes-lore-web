# SCN-0004 follow-up — effective pacing period by state, 2026-10-23

## Mục tiêu và cách đo

Đo trực tiếp target period mà gameplay đưa vào `br.a(JJ)V`. Bytecode gốc trong `br.b()V` tải `br.d:I`, chuyển sang `long` rồi truyền làm đối số thứ hai của helper. Probe copy-only đọc đúng đối số đó tại entry `br.a`; không reflection, không gọi trực tiếp method game, không ghi field. Cùng trace có state setter `m.e:I`, branch `ag.a:Z`, helper sleep/yield và handler để ghép period với state trên cùng `EventProcessing-Thread`.

Một bản copy `HOUSE-INPUT-001`, `phone:Motorola`, chạy route save-exit đã dùng trong follow-up. State-triggered AWT W chỉ được xếp sau store gốc state 4; không sửa state để tạo route. Build instrumented riêng và hash inputs nằm trong [build manifest](../../../../../reference/recordings/scheduler-probe-followup-20261023-pacing-period-r1/build-manifest.json).

## Kết quả

Trace có 2.445 event liên tục, dropped=0. Mỗi 346 helper entry khớp đúng một marker target-period.

| State gần nhất được quan sát | `br.d:I` truyền vào helper | Số helper |
| --- | ---: | ---: |
| 1 | 200 ms | 35 |
| 2 | 71 ms | 130 |
| 4 | 71 ms | 2 |
| 9 | 50 ms | 43 |
| Trước setter `m.e:I` đầu tiên | 50 ms: 57; 66 ms: 74; 200 ms: 5 | 136 |

Đây là target pacing period, phân biệt với helper entry-to-exit elapsed, sleep duration, callback rate và physical FPS. [Analysis](M15-SCN-0004-E-pacing-period-R01/analysis.json), [raw trace](M15-SCN-0004-E-pacing-period-R01/trace.jsonl), [route](M15-SCN-0004-E-pacing-period-R01/route.json) và [manifest riêng](M15-SCN-0004-E-pacing-period-R01/manifest.json) giữ bằng chứng. [Aggregate](aggregate.json) và [manifest tổng](manifest.json) khóa kết quả.

## Giới hạn

Đo trực tiếp period trên một route/profile, không chứng minh state khác hoặc route khác dùng cùng giá trị. State được gán theo setter `m.a(I)V` mới nhất trên một thread. Các 136 helper span trước setter đầu tiên được để riêng; không gán state. Period là yêu cầu truyền vào pacing helper, không phải cadence callback hay tốc độ presentation. Input tổng hợp, không đo bàn phím vật lý, compositor hoặc latency hiển thị.
