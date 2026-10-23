# Heroes Lore: Wind of Soltia — Web Port

Dự án cá nhân nhằm **port đầy đủ cơ chế của Heroes Lore: Wind of Soltia v2.1.2 (J2ME) lên web** và đánh giá khả năng áp dụng REA trong quy trình reverse engineering.

> **Trạng thái:** trình duyệt chạy được tuyến New Game → Ronin → hai Guardian → xác nhận → cảnh mở đầu map 0/tile `(22,4)`. Enter/Next tiến qua các thoại đã trích từ script mở đầu; W hoặc nút Skip fast-forward cutscene sang map 64/tile `(9,8)` trong nhà. Hai lần giữ Down riêng biệt đưa nhân vật ra map 0/tile `(26,24)`. Trên màn hình cảm ứng, D-pad di chuyển, OK xác nhận, Attack gửi Numpad5 và System mở menu hệ thống; [M25 touch controls](reference/screenshots/web-render/M25-touch-controls/capture.json) ghi tuyến cảm ứng từ New Game qua house exit tới map 0/tile `(26,24)` và Save trong Chromium mobile emulation 360×640; chưa kiểm tra thiết bị thật hoặc browser khác. Enter cũng gọi các event script chỉ có thoại tại ô hiện tại (type 1) hoặc ô phía trước (type 2), khi cờ truyện khớp. HUD dùng frame, icon, digits, bars và initial Ronin status từ asset/fixture gốc. [M20-SCN-0001](reference/screenshots/web-render/M20-SCN-0001-hud-skill/capture.json) ghi tuyến gameplay; [M21-SCN-0001](reference/screenshots/web-render/M21-SCN-0001-dialogue-next/capture.json) ghi tiến thoại với Enter; [M23-SCN-0006](reference/screenshots/web-render/M23-map79-dynamic-transition/capture.json) ghi một type-3 event chuyển sang map 79 bằng cách tải dữ liệu đích on demand; [M24-SCN-0006](reference/screenshots/web-render/M24-browser-save-load/capture.json) ghi save/load giới hạn của trạng thái hiện được mô hình hóa qua localStorage, gồm cold load ở browser process mới. M69 thêm xử lý source `GAMEOVER` để chạy epilogue và credits theo locale cùng hero class, nhưng chưa có browser replay xác nhận ending và chưa hoàn tất tuyến New Game tới map 8. JAR thiếu `.evt` cho 9 map và có script chuyển tới một số map đó; khả năng truy cập và cách xử lý trong game gốc chưa xác minh. Đây mới là một số tuyến dọc, chưa phải game hoàn chỉnh: region-specific variants, cutscene movement, stat changes, NPC/enemy động, phần lớn combat, persistence cho toàn bộ game state, dialogue dispatcher chung và phần lớn campaign còn thiếu. Xem [roadmap](ROADMAP.md).

M26 records two source-emulator Numpad5/raw-key-53 hits that each reduced map-27 enemy 24 by 11 HP. The web now tracks enemy HP and connects Numpad5 to the starter adjacent attack path; [M27](reference/screenshots/web-render/M27-starter-melee/capture.json) records the browser result `43→32→21` from a seeded save position. M31 adds enemy experience awards and Ronin level bookkeeping from the source formulas, including HP/SP growth, refill and attribute points. Its seeded browser capture records 40/80 experience after a map-27 kill; a J2ME comparison remains open ([M31 manifest](reference/screenshots/web-render/M31-enemy-experience/capture.json)). A source runtime field snapshot reads 72/72 initial HP, while an earlier status screenshot was recorded as 74/74; that discrepancy remains unresolved. M32 adds source-derived ground loot, Numpad5 pickup, currency collection and saved raw inventory stacks; the browser capture records wallet 300→327 after a seeded map-27 kill. M33 adds quick-item category cycling (`#`), use (`9`), HUD selection, persistence of the chosen category and source-derived Potion/Wine effects; its seeded browser capture records HP 50→64, SP 20→38 and one Potion remaining ([M33 manifest](reference/screenshots/web-render/M33-quick-items/capture.json)). M34 implements the source successful-hit enemy reaction as four map updates with directional offsets on two rendered states; a seeded browser capture shows the `11` popup but does not compare frames with J2ME ([M34 manifest](reference/screenshots/web-render/M34-enemy-hit-reaction/capture.json), [FND-0012](reverse-engineering/findings/FND-0012-enemy-hit-reaction.md)). M35 extracts all source enemy sprite sequence tracks and animates the initial idle state at the 71 ms map update. M36 adds nearby source-field acquisition, path selection and 8-pixel pursuit steps, driving the extracted walking tracks ([FND-0013](reverse-engineering/findings/FND-0013-enemy-sprite-animation.md), [FND-0014](reverse-engineering/findings/FND-0014-enemy-pursuit.md)). M37 adds behavior 0/1 melee attack frames, source damage arithmetic, and Ronin HP/HUD updates for the fresh-game profile. Its controlled Chromium capture shows HP 72→68 at 2.4 seconds and 54 at 3.6 seconds. A FreeJ2ME R11 replay reached an adjacent behavior-1 enemy, but primitive snapshots 5.248 seconds apart retained player HP 72, enemy state 1 and cooldown 4; the source attack comparison is inconclusive ([browser capture](reference/screenshots/web-render/M37-enemy-melee/capture.json), [R11 source manifest](reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0005-P1M-R11/manifest.json), [FND-0015](reverse-engineering/findings/FND-0015-enemy-melee-attacks.md)). The M36 controlled browser capture failed before evidence was produced. M38 ports the source-derived 24-tick zero-HP delay, 16-frame game-over reveal and return to the title menu; a controlled Chromium replay shows the reveal, title return and New Game selection path, while J2ME comparison remains open; the separate death animation is absent ([M38 capture](reference/screenshots/web-render/M38-game-over/capture.json), [FND-0016](reverse-engineering/findings/FND-0016-game-over-flow.md)). M39 adds behavior-2 three-cell facing-lane attacks and damage to Ronin HP; its seeded Chromium replay records HP 500→25 over about 4.5 seconds, with individual hits not isolated and no J2ME comparison ([M39 capture](reference/screenshots/web-render/M39-behavior-2/capture.json), [FND-0017](reverse-engineering/findings/FND-0017-enemy-behavior-2-attacks.md)). M40 extracts the eight `/enm/atef/N` frame streams and implements behavior-2 effect type 9 plus behavior-3 projectile segments. A seeded map-22 Chromium replay records cumulative HP 500→480 over about four seconds; other enemies are present, so individual impacts were not isolated and no J2ME comparison was made ([M40 capture](reference/screenshots/web-render/M40-enemy-projectiles/capture.json), [FND-0018](reverse-engineering/findings/FND-0018-enemy-attack-effects-and-projectiles.md)). M41 connects behavior-1 hits to poison status 7, the source 80-update timer and original icon. A seeded map-19 Chrome replay shows the status marker and saves HP 295/500 after about 6.7 seconds; deterministic values forced the 15-percent branch, so this does not estimate natural frequency or compare timing with J2ME ([M41 capture](reference/screenshots/web-render/M41-player-poison/capture.json), [FND-0019](reverse-engineering/findings/FND-0019-player-poison-status.md)). M42's first `ak.r()` no-target port had its sign branch reversed; its map-19 screenshots are retained as historical evidence and do not verify current behavior. M43 corrects the branch polarity against JADX and `javap`, adds the initial action delay and `ak.h()` retarget counter, and has deterministic unit coverage. The full suite passes 120 tests and typecheck/build pass; no corrected browser capture or J2ME comparison exists yet. Moving-player no-target selection and any separate patrol behavior remain open ([FND-0020](reverse-engineering/findings/FND-0020-enemy-idle-wandering.md)). Attack/poison timing and visual parity, separate patrol behavior and other status effects remain open ([FND-0015](reverse-engineering/findings/FND-0015-enemy-melee-attacks.md)). High Potion/Antidote has unit coverage; M41 exercises poison and Antidote remains covered by unit tests. The equipment menu and derived stats are a partial M72 feature with no browser/J2ME comparison; the separate death animation, any separate patrol system and broader combat remain incomplete. See the [R10 source manifest](reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0005-P1M-R10/manifest.json) and [full roadmap](ROADMAP.md).

M43 corrects the M42 enemy idle/wander branch against both JADX output and `javap`: the positive random branch starts movement, while the idle branch sets the source action delay and rolls its attack cooldown. The web model now tracks the initial delay and the `ak.h()` retarget counter. The M42 map-19 screenshots predate this correction and are retained as historical evidence; they do not verify the corrected behavior. The full current test/build state and remaining source-runtime gaps are recorded in [ROADMAP](ROADMAP.md) and [FND-0020](reverse-engineering/findings/FND-0020-enemy-idle-wandering.md).

M44 replaces Phaser random draws with Java-compatible source streams: the raw entity stream is separate from the bounded gameplay stream, and the latter follows the JAR's absolute-value modulo helper. At M44, 128 Vitest tests, 26 converter tests, typecheck and production build passed; its minified bundle was 1,305.72 kB with Vite's 500 kB warning. M46 applies source initial map operations 100–105 to tile IDs, collision, decoration movement/removal, and NPC placement before rendering. M47 adds NPC image replacement with operation 110 before texture selection. M48 adds decoration image replacement with operation 109 and corrects opcodes 102/103 to target decoration records instead of combat enemies. The current gates pass 129 Vitest tests, 26 converter tests, typecheck and production build; the minified bundle is 1,306.66 kB. No browser capture verifies a map changed by these operations; see [FND-0023](reverse-engineering/findings/FND-0023-map-startup-operations.md) and [ROADMAP](ROADMAP.md). The default J2ME seeds are time-dependent and unknown, so this aligns algorithms and draw channels without claiming seeded runtime parity. There is no corrected M44 browser capture yet; see [FND-0021](reverse-engineering/findings/FND-0021-source-random-streams.md) and [ROADMAP](ROADMAP.md).

## Yêu cầu

- Node.js **>=22.19.0** và npm (theo yêu cầu REA).
- `jadx` để decompile JAR khi cần; `unzip` hoặc công cụ tương đương để xem nội dung.
- REA: `npx rea-agents setup`. REA hiện không cung cấp workflow J2ME JAR trực tiếp; JEB/JADX là các công cụ bổ trợ, không được ghi nhận nhầm thành kết quả REA.

## Chạy dự án

```bash
npm install
npm run audio:setup
npm run dev
npm run typecheck
npm test
npm run build
```

`npm run audio:setup` trích xuất dữ liệu từ JAR cục bộ và tải SoundFont GeneralUser GS v2.0.3 vào thư mục generated bị loại khỏi Git. Options có Sound, Game (Slow/Normal/Fast), Speech và Camera; các giá trị được lưu trong `localStorage`. Trình duyệt bắt đầu phát MIDI gốc sau lần nhấn phím hoặc chạm đầu tiên để đáp ứng chính sách audio của trình duyệt. SoundFont khoảng 32 MB; giấy phép và thông tin nguồn nằm trong `third-party-notices/`. Tải MIDI và SoundFont đã được kiểm tra trong Chromium; đầu ra âm thanh và âm sắc chưa được đối chiếu với thiết bị J2ME.

Vite sẽ in địa chỉ localhost. Trên desktop, dùng phím mũi tên, Enter và `5`/Numpad5 để đánh nhẹ và `7`/Numpad7 để đánh mạnh; nhấn phím tấn công trong lúc đòn đang chạy để xếp đòn kế tiếp khi chuỗi cho phép; nhấn `#` để đổi loại quick item và `9` để dùng item đang chọn. Trên thiết bị coarse-pointer, không hover hoặc cửa sổ rộng không quá 600 px, dùng D-pad và các nút System/OK/Attack/Heavy/Item/Use bên dưới canvas để đi qua New Game, Ronin, hai Guardian và màn xác nhận. Ở màn hội thoại mở đầu, nhấn W hoặc chọn Skip để đi tới căn nhà; giữ Down đủ lâu hai lần, thả phím giữa hai lượt, để đi ra ngoài. Trong world, W, Escape hoặc nút System mở System. Chọn Inventory để xem trang bị và túi đồ; dùng phím mũi tên rồi Enter để trang bị, hoặc chạm vào món đồ. Save Game ghi các trường trạng thái hiện được hỗ trợ vào localStorage. Khi có save hợp lệ, Load Game được chọn sẵn ở startup. [M24-SCN-0006](reference/screenshots/web-render/M24-browser-save-load/capture.json) ghi phép thử qua browser process mới; M32 thêm wallet và inventory, M33 lưu loại quick-item đang chọn. M71 thêm byte trạng thái equipment, M72 thêm năm slot, thao tác đổi trang bị và công thức chỉ số cho HP/SP, attack, defense. M73 thêm chuỗi đòn nhẹ/nặng theo frame, chi phí SP cho đòn nối tiếp và critical/subtype damage của vũ khí; M74 thêm một phần nhắm mục tiêu riêng cho class 6/7; M75 thêm điều kiện lunge heavy và hit tiếp theo của class 6. Đây chưa phải schema RMS; tên item, nâng cấp, subtype status effect và projectile nặng class 8 còn thiếu, màn equipment chưa có browser capture; combo có capture input ở M73 nhưng chưa xác nhận kết quả hit, M74/M75 mới có unit test; chưa có so sánh J2ME. [M28](reference/screenshots/web-render/M28-damage-number/capture.json) ghi nhận số `11` nổi trên mục tiêu trong một hit ở browser; hiệu ứng được dựng theo bốn paint của source nhưng chưa so ảnh với J2ME. [M29](reference/screenshots/web-render/M29-enemy-death/capture.json) xác nhận sprite bị gỡ và ô được giải phóng sau bốn lần cập nhật. [M30](reference/screenshots/web-render/M30-enemy-respawn/capture.json) xác nhận enemy 24 xuất hiện lại với 43 HP sau 23,33 giây; RNG vẫn chưa được so với J2ME. [M31](reference/screenshots/web-render/M31-enemy-experience/capture.json) ghi save browser seeded ở 40/80 EXP sau khi hạ enemy; chưa có so sánh source. [M32](reference/screenshots/web-render/M32-enemy-loot/capture.json) ghi loot source-derived và pickup currency tăng wallet 300→327; so sánh RNG còn mở. [M33](reference/screenshots/web-render/M33-quick-items/capture.json) ghi Potion/Wine dùng với HP 50→64, SP 20→38; High Potion/Antidote và so sánh runtime còn mở. [M34](reference/screenshots/web-render/M34-enemy-hit-reaction/capture.json) ghi browser hit hiển thị `11`; timing source ở FND-0012 chưa có ảnh so sánh J2ME. M35 giải mã và phát idle animation của enemy; xem FND-0013 để biết phạm vi và giới hạn. Asset game chỉ được trích xuất local từ JAR có SHA-256 cố định bằng `npm run assets:extract`; output nằm dưới `web/public/assets/generated/` và không được commit. Nếu extractor chưa chạy, web app báo thiếu dữ liệu local. Hầu hết campaign behavior vẫn chưa có.

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
web/src/world/             # Map, collision, event data, NPC and save state
web/src/entities/          # Entities
web/src/rendering/         # Phaser scenes, sprite rendering
web/src/input/             # Keyboard, touch
web/src/ui/                # HUD, dialogue
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
