# Tài nguyên game — Heroes Lore v2.1.2

**Baseline:** `original/heroes-lore-v2.1.2.jar`, SHA-256
`7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
Fingerprint hiện tại khớp baseline. JAR và output đã giải mã chỉ lưu local, không commit.

## Inventory từ JAR

| Nhóm | Số lượng | Cách dùng / trạng thái |
| --- | ---: | --- |
| `.mph` atlas index | 118 | Bảng ảnh và chunk dùng chung |
| `.mpd` atlas data | 291 | PNG chunk theo từng ảnh |
| `.map` world map | 81 | Header 3 byte và lưới tile ID row-major |
| `.evt` map event | 72 | Base collision, static decorations, NPC/enemy placements, trigger groups, script commands và raw event operation tables đã tách; interpreter đầy đủ còn thiếu |
| `.tdf` | 19 | Bảng định tuyến các dòng UI/dialogue tới ID trong locale; đã giải mã thành JSON |
| `.eif` | 18 | Data entity/effect, chưa chuẩn hóa |
| `/enm/data0..2` | 3 | Ba biến thể, mỗi biến thể có 43 record enemy indexed; stat đã decode, code behavior và các bộ ba drop còn giữ nguyên dữ liệu |
| `/itm/00`–`06` | 7 | Numeric equipment fields and category-specific subtype bytes are extracted; localized item text remains in language data |
| `/enm/spr/N` | 24 | Mỗi sprite có 12 track (3 trạng thái × 4 hướng), frame và component draw đã giải mã |
| `/npc/spr/N` | 8 | Hai trạng thái × bốn hướng; frame components đã giải mã và dùng để vẽ facing/animation cho NPC có resource tương ứng |
| `/enm/atef/N` | 8 | Attack-effect frame streams; component offsets, mirror flags and atlas image indices decoded |
| `.mf` bitmap font | 1 | Font glyph atlas và metrics nguồn đã giải mã để vẽ UI pixel |
| `lang/language.en-GB` | 1 | 2.378 chuỗi tiếng Anh được giải mã từ offset table và Java modified UTF-8 |
| `.png` standalone | 12 | Ảnh PNG có sẵn trong JAR |
| Character sprite layouts | 6 | Layout riêng cho body/head/effect/weapon/shield; parser giữ nguyên frame slots, hướng, offset và cờ flip |
| `.mid` | 1 | Audio MIDI, chưa port |

Đếm từ ZIP manifest bằng Python `zipfile`; bộ chuyển đổi chỉ tạo ảnh/map/collision/event data, không chép JAR hoặc asset vào Git.

## Converter tái lập

Chạy từ repository root:

```bash
npm run assets:extract
```

`tools/extract_game_assets.py` chỉ đọc JAR đã khóa SHA-256, dựng PNG từ `.mph/.mpd`, giải mã `.map`, font `.mf`, bảng `lang/language.en-GB`, 19 bảng ID `.tdf`, ba `/enm/dataN` tables, bảy catalog numeric từ `/itm/00`–`06`, 24 bộ `/enm/spr/N` enemy animation, tám bộ `/npc/spr/N` animation, tám `/enm/atef/N` attack-effect streams, 16 `/grd/spr` skill-effect streams và stream đặc biệt `0_02.eif`; đồng thời tách collision grid, static decorations cùng event tables từ `.evt`. Output nằm ở `web/public/assets/generated/`, được `.gitignore` loại khỏi Git; `asset-manifest.json` ghi source hash và SHA-256/size cho từng output.

Kết quả lần chạy **2026-10-24**: 118 atlas, 81 map, 72 base collision layer, 72 decoration set, 72 raw event-operation sets (kèm NPC/enemy placements, trigger groups, script commands và string IDs), 39 map có enemy placements, 6 character sprite layout, 1 bitmap font atlas/metrics, 2.378 chuỗi en-GB, 3 enemy-data variant × 43 record, 24 enemy sprite animation sets, 8 NPC sprite animation sets, 8 enemy attack-effect sets, 16 player skill-effect streams cùng 1 special stream, 19 text-table và 12 standalone PNG, bảy catalog numeric equipment; tổng 1.703 file sinh ra. Bộ test converter có 38 test theo lần chạy gần nhất.

## Bằng chứng về format và giới hạn

- [`FND-0005-assets.md`](../../reverse-engineering/findings/FND-0005-assets.md) ghi các kết luận đã đối chiếu bytecode `ad` và `bq`, cùng lệnh và giới hạn.
- [`FND-0030-equipment-items.md`](../../reverse-engineering/findings/FND-0030-equipment-items.md) ghi cấu trúc numeric của bảy bảng `/itm`, các enhancement rolls và per-instance bytes; screens, stat application and J2ME comparison remain open.
- Map `64` có header bytes `0f 14 14`: tileset ID 15 và grid 20×20. Runtime log quan sát `map : 64` ở fixture trong nhà; con số này chưa đặt tên địa điểm.
- Runtime loader lấy base tile grid từ byte offset 3 của `.map`; các `.evt` chứa một collision grid map-sized ở offset 0. `ad.a(int,int)` xem một ô là có thể đi qua nếu nằm trong bounds, signed collision value không âm, và chưa có entity occupying cell.
- Sau collision grid, event section đầu tiên có danh sách image IDs từ object atlas `/m/t/o<tilesetId>` và các record 5 byte: cell X/Y, signed pixel offsets X/Y, image index. `ai` vẽ với anchor center-bottom; object list được sắp theo Y + offset Y tăng dần để vẽ.
- Converter tách event descriptors (10-bit index và byte kế tiếp), action blocks bốn byte, bảng trigger 7-byte, script command 3-byte và string IDs. FND-0007 đối chiếu trigger type-3, flag predicate và script map-change của map 64 với bytecode; các loại trigger, predicate vật phẩm và phần lớn lệnh script vẫn chưa port.
- Output collision JSON giữ giá trị cơ sở trước các event operations. Nó chưa gồm chỉnh sửa grid do event, entity footprint hoặc transition logic; không được dùng như toàn bộ đặc tả collision.
- `/enm/data0..2` được đọc theo index/record-length loop của `i.a(byte[],byte,byte)`; các field đã xác định qua cách code dùng gồm max HP, attack, defense, evasion, element và respawn delay. Code behavior chưa phân loại và các bộ ba drop được giữ nguyên. 39 `.evt` tables có enemy placements; `m/6/00.evt` script 0 chuyển tới map 27/tile `(5,37)`. R07 đã đi theo tuyến này trên emulator và thấy creature gần người chơi với HUD `Dust!`; M26 xác nhận damage của một starter encounter. `au` áp dụng defense, bảng element, rồi conditional damage bonus; browser/source comparison ngoài fixture này còn mở. Xem [FND-0009](../../reverse-engineering/findings/FND-0009-combat-data.md) và [FND-0010](../../reverse-engineering/findings/FND-0010-ground-loot.md) về loot/pickup.
- Phaser scene nạp map 64/0/27, menu UI atlas, bitmap font, Ronin/Guardian screen assets, body/head sprite layers, base collision/decorations, event type-3 của cửa nam, startup operations `101`/`105`, source enemy tracks và tám NPC animation sets. New Game bắt đầu map 0/tile `(22,4)` với flag 0 theo routine fresh-game; W fast-forward script 9 sang map 64/tile `(9,8)`; hai lần giữ Down có release ở giữa đưa nhân vật ra map 0/tile `(26,24)`. Từ marker map 00 `(20,1)`, script 0 chuyển sang map 27/tile `(5,37)`; [M22](../../reference/screenshots/web-render/M22-map27-route/capture.json) so sánh route và static enemy render. Operation block 2 của map 00 ẩn NPC slots 2, 0, 4 và giữ placement 1 (NPC image 16) theo dữ liệu `.evt`; M50 composes NPC16's four source-facing idle tracks and applies script-9 direction changes; M51 adds the source eight-pixel command-15/16 movement primitive on the world-update cadence, but the current opening script does not exercise command 15. HUD ban đầu vẽ frame, HP/SP/EXP bars, HP hiện tại, Guardian skill icon và item icon/count từ asset cùng fixture gốc; modeled experience awards and consumable effects update HUD state, while fuller stat and equipment changes remain open. Browser phân giải 24 opcode-1 thoại của script 9 từ `.evt` string IDs và locale; Enter/Next chuyển trang. Enter còn tra trigger type 1 trên tile hiện tại rồi type 2 phía trước theo flags; M52 dispatches fully supported ordered type-1/type-2 scripts, and M53 also routes supported type-0/type-3 scripts after checking every command. Map-62 script 7 passes the full-stream test with NPC movement and transfer; static script data traces required flag 49 through map-62 script 5 (requiring flag 48) to map-12 script 0. M58 supports the complete map-12 stream and its browser replay reaches map 13/tile (10,10). M59 implements camera commands 34/35/37/38 and browser-replays map-62 script 5 from seeded flag 48. M60 browser-replays script 7 from seeded flag 49 through the transfer to map 1/tile (2,17). M61 replays a separate seeded map-12 script-1 branch with flag 0 to map 62/tile (16,2), including its EXP award and skill acquisition. M62 implements source category/item/minimum-count trigger predicates and statically traces a candidate map-0 → 63 → 27 → 2 → 60 → 61 → 62 → 53 → 54 → 59 → 12 route. M63 implements opcode-25 screen shake and paired opcode-42/43 tile/collision writes; M64 replays map-53 scripts 7–9 from a seeded state, sets flags 34/36/38, consumes three category-21/item-2 entries, and transfers to map54/tile (17,14). A movement attempt at map54's south exit returns to map53/tile (18,15). The campaign route and later map-13 → flag-48 → flag-49 chain are not verified from New Game. M54 applies cutscene NPC movement state to active-map placements; M55 adds ordered item quantity transactions for ordinary item categories; M56 renders the five-step source opcode-24 screen flash; M57 applies opcode-46 NPC hiding to actor sprites and map occupancy. M58 renders ordered cutscene emotion opcodes 49/50 using extracted original assets; M59 adds source-timed camera commands 34/35/37/38; M60 runs the map-62 script-7 transfer in the browser. No J2ME comparison is available. M35 composes source enemy idle frames at each map update; M36 adds nearby acquisition and 8-pixel pursuit steps that drive source walking tracks. M37 connects behavior 0/1 attacks to Ronin HP/HUD. M39/M40 implement behavior-2 lane attacks and behavior-3 projectiles using extracted `/enm/atef/N` frames; M40's seeded map-22 replay records cumulative HP 500→480, without isolating the attacker or matching timing to J2ME. M41 implements behavior-1 poison status ID 7, its source duration/damage timing and the original `/img/keepst` icon. The seeded map-19 replay shows the icon and cumulative HP 500→295 under deterministic random values; J2ME timing/RNG parity, wandering/patrol and other statuses remain open ([FND-0019](../../reverse-engineering/findings/FND-0019-player-poison-status.md)). M26–M33 cover the starter combat, experience, ground loot, pickup, wallet/raw-inventory persistence, and quick consumables. General NPC movement/AI, emotion behavior outside ordered cutscenes, camera opcodes 36/39, a general dialogue interpreter, broader AI behaviors, secondary menus and the rest of the event interpreter remain unported; see [FND-0006](../../reverse-engineering/findings/FND-0006-actor.md), [FND-0007](../../reverse-engineering/findings/FND-0007-house-exit.md), [FND-0008](../../reverse-engineering/findings/FND-0008-startup-flow.md), [FND-0014](../../reverse-engineering/findings/FND-0014-enemy-pursuit.md), [FND-0017](../../reverse-engineering/findings/FND-0017-enemy-behavior-2-attacks.md) and [FND-0018](../../reverse-engineering/findings/FND-0018-enemy-attack-effects-and-projectiles.md).
- `.tdf`, `.eif`, các event ngoài route map 64→0, animation timing, sprite-role mapping, audio và quan hệ giữa NPC/entity data với code còn đang khảo sát.

## Không gian output local

```text
web/public/assets/generated/
  atlases/     # PNG riêng theo ID của từng atlas
  maps/        # tile IDs và tileset ID
  collision/   # base collision grid theo vùng/map
  decorations/ # static event decoration placement records
  event-operations/ # raw descriptors, four-byte operations, trigger groups and scripts
  character-layouts/ # decoded per-frame sprite component layouts
  fonts/       # source bitmap font atlas and glyph metrics
  language/    # decoded en-GB locale string table
  enemy-data/  # three decoded indexed enemy tables
  equipment-data/ # numeric definitions for equipment categories 0–6
  enemy-attack-effects/ # decoded /enm/atef/N effect and projectile frame streams
  npc-animations/ # decoded two-state, four-direction /npc/spr/N animation tracks
  text-tables/ # decoded `.tdf` lists of locale string IDs
  standalone/  # PNG có sẵn
  asset-manifest.json
```
