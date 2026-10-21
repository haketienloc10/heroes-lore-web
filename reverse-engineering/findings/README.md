# Findings

Mỗi phát hiện cần ghi: ID, vấn đề cần xác minh, phiên bản JAR/SHA-256, công cụ, các lệnh đã chạy, vị trí class/method/offset, bằng chứng, kết luận và giới hạn. Không coi suy luận của AI là bằng chứng độc lập.

| Finding | Phạm vi | Trạng thái |
| --- | --- | --- |
| [FND-0001](FND-0001-game-loop.md) | Lifecycle, Canvas và game loop — M1 | Xác minh tĩnh trọng tâm; runtime chưa xác minh |
| [FND-0002](FND-0002-runtime-verification.md) | Runtime Verification — M1.5; 4 sai lệch và ảnh hưởng port | Đối chiếu tĩnh và scenario đã chuẩn bị; 0/8 scenario chạy; milestone chưa hoàn thành |

Kịch bản và điều kiện hoàn thành M1.5: [reference/scenarios](../../reference/scenarios/README.md). Không dùng kết quả JADX/`javap` hoặc inventory REA như quan sát emulator.
