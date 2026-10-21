# Findings

Mỗi phát hiện cần ghi: ID, vấn đề cần xác minh, phiên bản JAR/SHA-256, công cụ, các lệnh đã chạy, vị trí class/method/offset, bằng chứng, kết luận và giới hạn. Không coi suy luận của AI là bằng chứng độc lập.

| Finding | Phạm vi | Trạng thái |
| --- | --- | --- |
| [FND-0001](FND-0001-game-loop.md) | Lifecycle, Canvas và game loop — M1 | Xác minh tĩnh trọng tâm; runtime chưa xác minh |
| [FND-0002](FND-0002-runtime-verification.md) | Runtime Verification — M1.5; 4 sai lệch và ảnh hưởng port | Đối chiếu tĩnh xong; CF chưa có trace runtime; milestone chưa hoàn thành |
| [FND-0003](FND-0003-emulator-smoke.md) | FreeJ2ME-Plus/WSLg và thực nghiệm SCN-0001/0002/0003/0005/0006 | Game chạy được; 5 scenario có quan sát một phần, chưa đạt toàn bộ; có log/ảnh/config/input và lỗi audio |

Kịch bản và điều kiện hoàn thành M1.5: [reference/scenarios](../../reference/scenarios/README.md). Không dùng kết quả JADX/`javap` hoặc inventory REA như quan sát emulator.
