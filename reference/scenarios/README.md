# Milestone 1.5 — Runtime Verification v2.1.2

**Ngày chuẩn bị:** 2026-10-21. **Trạng thái:** đã chuẩn bị kiểm thử và đối chiếu tĩnh; **chưa xác minh runtime, chưa hoàn thành milestone**. Đã chạy **0/8 scenario** trên emulator; không có số đo FPS, latency hoặc callback ordering. Các file scenario là kế hoạch, không phải biên bản đã chạy.

**JAR dùng chung:** `original/heroes-lore-v2.1.2.jar`, 554715 byte, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.

Đã đọc [game overview](../../docs/architecture/game-overview.md), [FND-0001](../../reverse-engineering/findings/FND-0001-game-loop.md), [baseline REA](../../docs/rea-evaluation/baseline.md). Kết quả kiểm tra lại và ảnh hưởng tới port nằm trong [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). Cấu hình dự kiến, input mapping, phép đo và cách lưu bằng chứng: [quy trình J2ME](J2ME-RUNTIME-PROTOCOL.md).

| Scenario | Phạm vi | Điều kiện đầu vào | Trạng thái bản gốc |
| --- | --- | --- | --- |
| [SCN-0001](SCN-0001-startup.md) | Startup sạch, startup có dữ liệu, `bf→ar`, kích thước Canvas | Emulator/profile đã hiệu chuẩn; RMS sạch hoặc snapshot | Chưa chạy |
| [SCN-0002](SCN-0002-menu.md) | Menu, chọn/quay lại, tải vào màn chơi | Có đường vào menu được ghi bằng ảnh/input | Chưa chạy |
| [SCN-0003](SCN-0003-input.md) | Press/release, giữ phím, repeat, hai phím, alias | Có fixture đứng yên; log callback nếu cần kết luận nội bộ | Chưa chạy |
| [SCN-0004](SCN-0004-game-loop.md) | Scheduler/update/render, pending rỗng, pacing | Trace method/state và cửa sổ đo ổn định | Chưa chạy |
| [SCN-0005](SCN-0005-gameplay.md) | Di chuyển, vật cản, thao tác chính và tương tác | Fixture chơi được; xác định hành vi bằng quan sát | Chưa chạy |
| [SCN-0006](SCN-0006-save-load.md) | Save/load sau thoát tiến trình, snapshot RMS | Xác định đường save/load thật trong UI | Chưa chạy |
| [SCN-0007](SCN-0007-visibility.md) | Hide/show, pause/resume khi đang tải/đang chơi | Cơ chế phát lifecycle/visibility của emulator đã kiểm tra | Chưa chạy |
| [SCN-0008](SCN-0008-control-flow.md) | Phủ runtime cả 4 sai lệch JADX/javap | Trace BCI hoặc method và fixture chạm nhánh | Chưa chạy |

Chạy theo thứ tự `0001 → 0002 → 0005` để tạo fixture, sau đó `0003/0004/0006/0007`; `0008` tận dụng các lượt trước và bổ sung nhánh chưa chạm. Một fixture chỉ hợp lệ sau khi có đường tạo lại từ RMS sạch hoặc snapshot có hash. Chưa biết map, nhân vật, cấp độ, trang bị, ngôn ngữ và RNG; không điền chúng bằng suy đoán.

## Điều kiện hoàn thành milestone

- [x] Đọc ba tài liệu nền; kiểm tra lại JAR identity và 4 sai lệch bằng `javap` trực tiếp, ghi ảnh hưởng tới port và giới hạn.
- [x] Chuẩn bị scenario cho sáu nhóm startup/menu/input/game loop/gameplay/save-load, bổ sung visibility và kiểm tra nhánh.
- [x] Ghi cấu hình dự kiến, mapping, phương pháp timing/ordering, mẫu run và yêu cầu evidence.
- [ ] Có emulator chạy được JAR; chốt build/commit, hash emulator, JVM, profile, LCD thực đo và mapping đã hiệu chuẩn. Cấu hình dự kiến chưa đáp ứng mục này.
- [ ] Chạy đủ 8 scenario, gồm các biến thể bắt buộc ở profile chính, tối thiểu 3 lần độc lập mỗi biến thể. Lưu input thực tế, fixture, ảnh/video, log, cấu hình, hash và kết quả từng lượt. Nhánh chưa chạm/không đo được phải ghi chưa xác minh, không đánh dấu đạt.
- [ ] Có bằng chứng runtime trực tiếp cho cả 4 điểm control flow; có trace scheduler/paint/update/release và hide/show. Ảnh/video đơn lẻ không chứng minh đường nhánh hoặc thứ tự callback nội bộ.
- [ ] Báo cáo cadence, input latency và callback ordering kèm cỡ mẫu, độ phân giải đồng hồ, overhead và phạm vi. Tách target period tĩnh với FPS đo được.
- [ ] Xác nhận round-trip save/load sau khi tiến trình đã dừng, có snapshot RMS trước/sau và bảng trạng thái quan sát được; chưa cần suy ra toàn bộ save format.
- [ ] Cập nhật finding/overview/baseline bằng kết quả thực nghiệm, giải thích mọi khác biệt hoặc ghi thành vấn đề còn mở. Khi thiếu bằng chứng trọng tâm, giữ milestone chưa hoàn thành.
- [x] Không thay đổi gameplay hay file trong `web/`. Kiểm thử fidelity bản web thuộc bước sau; hiện tất cả kết quả web là **chưa chạy**.

## Quy ước kết quả

`Chưa chạy` = chưa có lượt emulator; `chưa xác minh` = thiếu bằng chứng cho một kết luận; `bị chặn` = lượt đã chuẩn bị nhưng thiếu điều kiện để tiếp tục; `đã quan sát` = có evidence hành vi nhưng chưa đủ phủ; `đạt/không đạt` chỉ dùng khi đã thực hiện và có tiêu chí đối chiếu rõ. Khác giả thuyết tĩnh cần điều tra cả emulator và cách đo, không tự coi game gốc sai.

Số `0/8` là số scenario đã chạy, không phải fidelity hoặc accuracy. Không tính emulator, JADX hay `javap` thành đóng góp REA.
