# Run — <run-id> / <scenario + biến thể>

**Đây là mẫu chưa chạy.** Sao chép và điền sau khi chạy; không dùng các ô trống làm kết quả.

- Ngày UTC / timezone host / người chạy:
- Kết quả: chưa chạy / bị chặn / đã quan sát / đạt / không đạt.
- JAR path, byte count, SHA-256; gốc hay instrumented:
- Emulator tên/version/commit/SHA-256; frontend; JVM và OS:
- Profile; config path/hash; limiter/audio/fast-forward; LCD/Canvas/clip thực tế:
- Mapping host → raw → normalize → gameAction đã đo:
- Probe/debugger version, patch/hash; đồng hồ, độ phân giải, overhead, event mất:
- Fixture/RMS path, manifest/hash; trạng thái đầu, nhân vật/map/vị trí/cấp độ/trang bị/ngôn ngữ; RNG biết hay không:
- Điều kiện kết thúc, số lần lặp và lượt hiện tại:

| Thời gian monotonic tương đối | Input/thao tác thực tế | Mốc UI/trace | File/seq bằng chứng |
| --- | --- | --- | --- |
| Chưa có | Chưa chạy | Chưa quan sát | Chưa có |

| Câu hỏi/tiêu chí | Giả thuyết tĩnh và nguồn | Kết quả bản gốc + bằng chứng | Giới hạn/nhánh chưa chạm |
| --- | --- | --- | --- |
| Chưa điền | Chưa điền | Chưa chạy | Chưa xác minh |

- Timing: cửa sổ/warm-up, N/T từng miền, interval median/p95/max, latency và cỡ mẫu; tách nguyên bản/trace.
- Callback ordering: các span/thread/request IDs hoặc BCI, điều gì xác minh được và điều gì chưa biết.
- Persistence: bảng trạng thái trước save/sau load, snapshot trước/sau và thời điểm đã dừng tiến trình.
- Kết quả web: **chưa chạy** trong M1.5; không dùng làm tiêu chí đạt bản gốc.
- Sai lệch/ảnh hưởng port; finding cần cập nhật:
- Manifest evidence: đường tương đối, producer (emulator/probe/capture/local), SHA-256, kích thước, timestamp; chỉ local hay có trong repo:
- Kết luận runtime có giới hạn; nếu chưa đủ dữ kiện ghi **chưa xác minh**:
