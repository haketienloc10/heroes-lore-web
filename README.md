# Heroes Lore: Wind of Soltia — Web Port

Dự án cá nhân nhằm **port đầy đủ cơ chế của Heroes Lore: Wind of Soltia v2.1.2 (J2ME) lên web** và đánh giá khả năng áp dụng REA trong quy trình reverse engineering.

> **Trạng thái:** mới khởi tạo cấu trúc. Trang web hiện chỉ hiển thị màn hình placeholder; chưa có gameplay, assets hoặc kết quả reverse engineering đã được xác minh.

## Yêu cầu

- Node.js **>=22.19.0** và npm (theo yêu cầu REA).
- `jadx` để decompile JAR khi cần; `unzip` hoặc công cụ tương đương để xem nội dung.
- REA: `npx rea-agents setup`. REA hiện không cung cấp workflow J2ME JAR trực tiếp; JEB/JADX là các công cụ bổ trợ, không được ghi nhận nhầm thành kết quả REA.

## Chạy dự án

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Vite sẽ in địa chỉ localhost. Chưa có assets hay gameplay trong bản khởi tạo này.

## Chuẩn bị game gốc

Đặt file vào `original/heroes-lore-v2.1.2.jar`, sau đó chạy:

```bash
npm run hash:original
unzip -l original/heroes-lore-v2.1.2.jar
jadx -d reverse-engineering/decompiled original/heroes-lore-v2.1.2.jar
```

`original/SHA256.txt` là fingerprint có thể commit; file JAR và đầu ra decompile được loại khỏi Git. Nếu tên JAR khác, chạy `node tools/hash-original.mjs <path>`.

## Tổ chức

```text
original/                   # JAR gốc trên máy; SHA256 để kiểm chứng phiên bản
reverse-engineering/        # Decompiled, extracted-assets (ignored), findings, scripts
docs/architecture/          # Kiến trúc game gốc (sau khi xác minh)
docs/mechanics/             # Đặc tả từng cơ chế + evidence
docs/asset-catalog/         # Danh mục assets
docs/rea-evaluation/       # Phạm vi, giới hạn, đóng góp REA
reference/screenshots/      # Ảnh tham chiếu chỉ lưu local
reference/recordings/       # Video tham chiếu chỉ lưu local
reference/scenarios/        # Kịch bản đối chiếu bản gốc ↔ bản web
web/src/core/              # Logic, thời gian, state độc lập engine
web/src/mechanics/         # Công thức combat, EXP, AI (sau khi có evidence)
web/src/world/             # Map, collision, NPC
web/src/entities/          # Entities
web/src/rendering/         # Phaser scenes, sprite rendering
web/src/input/             # Keyboard, touch
web/src/ui/                # HUD, dialogue
web/src/persistence/       # Save/load
web/public/assets/         # Assets gốc chỉ dùng local
web/tests/                 # Vitest
tools/                     # Công cụ hỗ trợ, tạo fingerprint
```

## Quy trình cho từng cơ chế

1. Ghi nhận hành vi trên emulator và tạo scenario trong `reference/scenarios/`.
2. Phân tích, lưu evidence trong `reverse-engineering/findings/` kèm **công cụ thực hiện** và vị trí trong JAR/decompiled code.
3. Viết đặc tả `docs/mechanics/<mechanic>.md`; đánh dấu nội dung chưa xác minh.
4. Triển khai logic độc lập Phaser trong `web/src/mechanics/` rồi nối với rendering.
5. Viết test, chơi lại cùng kịch bản trên cả hai bản, ghi kết quả vào `docs/rea-evaluation/`.

Không tự suy đoán gameplay rồi xem là hành vi gốc. Việc phân tích bằng JADX/JEB không tự động được tính là kết quả REA.

## Phạm vi và lưu ý

Mục tiêu cuối cùng là full port 1:1 (game loop, world, combat, AI, quest, inventory, UI, save/load, audio). Chỉ bắt đầu các hệ thống khi đã có bằng chứng từ bản v2.1.2 được cố định bởi SHA-256.

Các bản JAR và assets được giữ ngoài Git để tránh phân phối lại nội dung trò chơi.
