# Evidence Milestone 1.5

Các file trong thư mục này do công cụ local tạo, **không phải kết quả REA hay emulator**. Kết luận và giới hạn tại [FND-0002](../../FND-0002-runtime-verification.md).

| File | Producer | Nội dung |
| --- | --- | --- |
| [preflight.json](preflight.json) | Python chuẩn, `java -version`, `javap -version` | Identity JAR, hash source, OS/JVM, tìm emulator có giới hạn, snapshot hash `web/` trước khi ghi tài liệu |
| [javap-runtime-targets.txt](javap-runtime-targets.txt) | `javap 21.0.12.1 -c -p -s` trên JAR | Output nguyên vẹn cho `bf bt m ar q br at`; hash và argv trong preflight |
| [verification.json](verification.json) | Python chuẩn, Git local | Kiểm tra liên kết tài liệu, hash, mẫu branch và `web/` không thay đổi; không xác nhận hành vi runtime |

Chưa có run emulator: **0/8 scenario đã chạy**. Không có fixture save, ảnh/video hoặc trace game để đưa vào evidence. Sau này mỗi run có subdirectory riêng chứa manifest/kết quả; hiện vật game chỉ local theo [protocol](../../../../reference/scenarios/J2ME-RUNTIME-PROTOCOL.md).

Đầu ra REA và javap của Milestone 1 nằm riêng ở `../milestone-1/`; chúng đã có trước nhiệm vụ này, được tái sử dụng làm baseline và không được ghi đè.
