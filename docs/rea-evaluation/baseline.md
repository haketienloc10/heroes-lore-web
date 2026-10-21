# Baseline đánh giá REA

**JAR chuẩn:** `original/heroes-lore-v2.1.2.jar` — SHA-256: _chưa xác nhận_.

**Trạng thái:** chưa thực hiện điều tra hay kiểm thử REA. Không có số đo coverage hoặc fidelity.

## Phân loại bằng chứng

| Nguồn | Vai trò | Tính là REA? |
| --- | --- | --- |
| REA + provider tương thích | Điều tra bằng MCP / CLI; lưu transcript và evidence | Có, nếu có log gọi tool |
| JADX | Decompile Java class | Không |
| JEB độc lập | Decompile / inspect | Không |
| REA qua JEB MCP | Điều tra bằng REA + JEB provider | Có, cần log xác minh |
| Emulator J2ME | Quan sát hành vi bản gốc | Không |
| Phaser / Vitest | Triển khai và kiểm thử bản web | Không |

## Thước đo sau khi triển khai

- **Coverage:** các cơ chế có evidence / tổng cơ chế kiểm kê.
- **Accuracy:** kết luận RE khớp quan sát thực tế.
- **Fidelity:** scenario đạt / tổng scenario chạy trên cả hai bản.
- **Traceability:** tỷ lệ implementation có liên kết evidence.
- **REA effectiveness:** bằng chứng REA thực sự cung cấp, lỗi/hạn chế, so sánh với phương án không dùng REA.

Không gộp hiệu quả của JADX hoặc JEB độc lập vào REA.
