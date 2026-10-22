# Milestone 1.5 — Runtime Verification v2.1.2

**Cập nhật:** 2026-10-22. **Trạng thái:** đã chạy FreeJ2ME-Plus 1.52 trên WSLg; **7/8 scenario có quan sát runtime một phần, 0 scenario được đánh dấu đạt toàn bộ; milestone chưa hoàn thành**. Có cadence scheduler và một số callback/control-flow ordering theo route; chưa đo FPS hiển thị vật lý, latency phản ứng và chưa phủ đầy đủ callback ordering. Phần kế hoạch và biên bản thực nghiệm được ghi riêng trong từng scenario; xem [FND-0003](../../reverse-engineering/findings/FND-0003-emulator-smoke.md).

**JAR dùng chung:** `original/heroes-lore-v2.1.2.jar`, 554715 byte, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.

Đã đọc [game overview](../../docs/architecture/game-overview.md), [FND-0001](../../reverse-engineering/findings/FND-0001-game-loop.md), [baseline REA](../../docs/rea-evaluation/baseline.md). Kết quả kiểm tra lại và ảnh hưởng tới port nằm trong [FND-0002](../../reverse-engineering/findings/FND-0002-runtime-verification.md). Cấu hình dự kiến, input mapping, phép đo và cách lưu bằng chứng: [quy trình J2ME](J2ME-RUNTIME-PROTOCOL.md).

| Scenario | Phạm vi | Điều kiện đầu vào | Trạng thái bản gốc |
| --- | --- | --- | --- |
| [SCN-0001](SCN-0001-startup.md) | Startup sạch, startup có dữ liệu, `bf→ar`, kích thước Canvas | Emulator/profile đã hiệu chuẩn; RMS sạch hoặc snapshot | Đã quan sát startup sạch; thiếu biến thể save/trace |
| [SCN-0002](SCN-0002-menu.md) | Menu, chọn/quay lại, tải vào màn chơi | Có đường vào menu được ghi bằng ảnh/input | Đã quan sát menu/New Game/Back/loading; chưa đạt toàn bộ |
| [SCN-0003](SCN-0003-input.md) | Press/release, giữ phím, repeat, hai phím, alias | Có fixture đứng yên; log callback nếu cần kết luận nội bộ | Đã thu A–E trong nhà; callback/repeat vật lý còn thiếu |
| [SCN-0004](SCN-0004-game-loop.md) | Scheduler/update/render, pending rỗng, pacing | Trace method/state và cửa sổ đo ổn định | Đã quan sát một phần: cadence/ordering ở một số route; nhiều nhánh và presentation còn mở |
| [SCN-0005](SCN-0005-gameplay.md) | Di chuyển, vật cản, thao tác chính và tương tác | Fixture chơi được; xác định hành vi bằng quan sát | Đã quan sát gameplay/di chuyển/Status; chưa đạt toàn bộ |
| [SCN-0006](SCN-0006-save-load.md) | Save/load sau thoát tiến trình, snapshot RMS | Xác định đường save/load thật trong UI | Đã cold load save cạnh giường và vị trí khác; chưa đủ 3 chu kỳ/biến thể |
| [SCN-0007](SCN-0007-visibility.md) | Hide/show, pause/resume khi đang tải/đang chơi | Cơ chế phát lifecycle/visibility của emulator đã kiểm tra | Chưa chạy |
| [SCN-0008](SCN-0008-control-flow.md) | Phủ runtime cả 4 sai lệch JADX/javap | Trace BCI hoặc method và fixture chạm nhánh | Đã quan sát một phần: CF-01/02/03 và CF-04 injected body; CF-04 natural còn mở |

Chạy theo thứ tự `0001 → 0002 → 0005` để tạo fixture, sau đó `0003/0004/0006/0007`; `0008` tận dụng các lượt trước và bổ sung nhánh chưa chạm. Đã ghi đường tạo phiên Ronin/Hestia/Ron từ RMS sạch và UI tiếng Anh. Đã có snapshot storage/cold load qua UI; tên map theo UI và RNG vẫn chưa biết; không điền chúng bằng suy đoán. Các lượt P1M-R02/R03/R04 có kiểm soát được tách khỏi lượt khám phá có cả thao tác tay và tự động.

## Điều kiện hoàn thành milestone

- [x] Đọc ba tài liệu nền; kiểm tra lại JAR identity và 4 sai lệch bằng `javap` trực tiếp, ghi ảnh hưởng tới port và giới hạn.
- [x] Chuẩn bị scenario cho sáu nhóm startup/menu/input/game loop/gameplay/save-load, bổ sung visibility và kiểm tra nhánh.
- [x] Ghi cấu hình dự kiến, mapping, phương pháp timing/ordering, mẫu run và yêu cầu evidence.
- [ ] Hoàn tất hiệu chuẩn môi trường/input. Đã xác minh emulator chạy JAR, release/commit/hash, JVM, LCD và mapping qua input tổng hợp; đường bàn phím vật lý và callback MIDlet chưa được hiệu chuẩn đầy đủ. Xem [cấu hình thực nghiệm](J2ME-RUNTIME-PROTOCOL.md#cấu-hình-đã-chạy-trong-lượt-tiếp-tục).
- [ ] Chạy đủ 8 scenario, gồm các biến thể bắt buộc ở profile chính, tối thiểu 3 lần độc lập mỗi biến thể. Lưu input thực tế, fixture, ảnh/video, log, cấu hình, hash và kết quả từng lượt. Nhánh chưa chạm/không đo được phải ghi chưa xác minh, không đánh dấu đạt.
- [ ] Có bằng chứng runtime trực tiếp cho cả 4 điểm control flow; có trace scheduler/paint/update/release và hide/show. Ảnh/video đơn lẻ không chứng minh đường nhánh hoặc thứ tự callback nội bộ.
- [ ] Báo cáo cadence, input latency và callback ordering kèm cỡ mẫu, độ phân giải đồng hồ, overhead và phạm vi. Tách target period tĩnh với FPS đo được.
- [ ] Hoàn tất round-trip save/load với đủ chu kỳ độc lập và bảng trạng thái/snapshot RMS. Đã xác nhận cold load S0 cạnh giường và điểm neo S2 sau khi JVM dừng; mỗi trạng thái mới save một chu kỳ, còn thiếu các chu kỳ lặp và trace RMS. Chưa cần suy toàn bộ save format.
- [ ] Cập nhật finding/overview/baseline bằng kết quả thực nghiệm, giải thích mọi khác biệt hoặc ghi thành vấn đề còn mở. Khi thiếu bằng chứng trọng tâm, giữ milestone chưa hoàn thành.
- [x] Không thay đổi gameplay hay file trong `web/`. Kiểm thử fidelity bản web thuộc bước sau; hiện tất cả kết quả web là **chưa chạy**.

## Quy ước kết quả

`Chưa chạy` = chưa có lượt emulator; `chưa xác minh` = thiếu bằng chứng cho một kết luận; `bị chặn` = lượt đã chuẩn bị nhưng thiếu điều kiện để tiếp tục; `đã quan sát` = có evidence hành vi nhưng chưa đủ phủ; `đạt/không đạt` chỉ dùng khi đã thực hiện và có tiêu chí đối chiếu rõ. Khác giả thuyết tĩnh cần điều tra cả emulator và cách đo, không tự coi game gốc sai.

Số `7/8` là số scenario có quan sát một phần, không phải tỷ lệ đạt, fidelity hoặc accuracy. Không tính emulator, JADX hay `javap` thành đóng góp REA.

## Fixture và audit lượt tiếp tục

- [HOUSE-EXIT-001](fixtures/HOUSE-EXIT-001.md): startup sạch → cạnh giường → Down/release → Down/release → ngoài nhà. R02/R03/R04 chỉ có **một** lượt cửa ra, không phải ba replay tương đương.
- [HOUSE-INPUT-001](fixtures/HOUSE-INPUT-001.md): snapshot tạo bằng UI save trong nhà, copy sau dừng JVM và cold load trước mỗi case A–E của SCN-0003. Không trộn với startup RMS sạch.
- [Audit ba session](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/session-audit.json) và [CSV input](../../reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/session-inputs.csv): trích từ evidence gốc, 71 cặp down/up, 164 mục size/hash khớp. Không phải runtime log mới.

SCN-0006 đã thấy save/cold load với hai điểm neo; JVM được dừng bằng harness trước snapshot, UI Exit riêng chưa kết thúc JVM. Còn thiếu ba chu kỳ save/load độc lập mỗi trạng thái và các trace trọng tâm, nên milestone vẫn chưa hoàn thành.
