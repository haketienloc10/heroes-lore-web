# FND-0005 — Map grids và image atlas resources

**Ngày:** 2026-10-23. **Trạng thái:** parser map/asset, character layout boundaries and event record boundaries are bytecode-checked across 72 event files. Static room/outside pixels and actor sprite were compared to runtime fixtures. The map-64 south-boundary trigger and map change are further analyzed in [FND-0007](FND-0007-house-exit.md); the general interpreter remains incomplete.

**Baseline:** `original/heroes-lore-v2.1.2.jar`, 554.715 byte, SHA-256
`7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
`sha256sum` khớp `original/SHA256.txt`.

## Producer và lệnh

| Evidence | Producer | Artifact |
| --- | --- | --- |
| `L1` | `sha256sum`, Python `zipfile` trên JAR local | fingerprint, resource names/sizes |
| `J1` | `javap 21.0.12.1 -classpath original/heroes-lore-v2.1.2.jar -p -c ad` | resource path, map header/grid copy, collision predicate |
| `J2` | `javap 21.0.12.1 -classpath original/heroes-lore-v2.1.2.jar -p -c bq` | `.mph/.mpd` loading, PNG reconstruction và `Image.createImage` |
| `J3` | `javap 21.0.12.1 -classpath original/heroes-lore-v2.1.2.jar -p -c m` | event flag bit lookup used while loading event descriptors |
| `J4` | `javap 21.0.12.1 -classpath original/heroes-lore-v2.1.2.jar -p -c y` | `.tdf` row count, record lengths and decimal locale-string IDs |
| `I1` | Python `zipfile` / `struct` read-only | ZIP counts, map 64 bytes, dimensions và resource pairing |
| `T1` | `python3 -m unittest discover -s tools -p 'test_*.py' -v` | 26 converter unit tests passed |
| `X1` | `npm run assets:extract` | 118 atlases, 81 maps, 6 character sprite layouts, 72 base collision grids, 72 decoration sets, 72 event tables with NPC/enemy placements and triggers/scripts, 39 maps with enemies, 24 enemy animation sets, 8 enemy attack-effect sets, 19 text tables, 2,378 locale strings and 12 standalone PNGs; 1,696 outputs |

Các lệnh `javap` đầy đủ:

```bash
javap -classpath original/heroes-lore-v2.1.2.jar -p -c ad
javap -classpath original/heroes-lore-v2.1.2.jar -p -c bq
javap -classpath original/heroes-lore-v2.1.2.jar -p -c m
javap -classpath original/heroes-lore-v2.1.2.jar -p -c y
```

Log đầy đủ chỉ lưu ở `/tmp/heroes-lore-ad.javap.txt` và `/tmp/heroes-lore-bq.javap.txt` trong phiên khảo sát; kết luận dưới đây dựa trên bytecode gốc của JAR đã hash, không gán cho REA. Source JADX dùng để đối chiếu vị trí, không thay cho `javap`.

## Map và collision

`ad.a()` bytecode tạo path `/m/<map>.map`, đọc byte 0 làm field tileset, byte 1/2 làm width/height, cấp mảng `[height][width]`, rồi gọi loader với offset 3. Loader sao chép từng hàng có độ dài `width`; map world dùng tile 16×16 pixel.

Trong cùng method, game tạo resource path `/m/<region>/<map>.evt` rồi gọi grid loader ở offset 0. Loader thứ hai cũng sao chép `[height][width]` signed bytes. Predicate `ad.a(int,int)` trả false ngoài bounds; trong bounds trả true khi collision byte không âm và cell không có entity trong occupancy grid.

Resource `m/64.map` có 403 byte: header `0f 14 14`, tiếp theo đúng 400 tile IDs. Vì vậy decoder trả tileset ID `15`, width `20`, height `20`. Các runtime logs có `map : 64` tại checkpoint trong nhà; log chỉ nhận dạng map ID, không tự xác nhận địa danh.

Converter xuất lớp đầu collision của mọi `.evt` riêng theo region/map. Với map 64, JAR chỉ có `m/6/64.evt`, nhưng runtime field chọn region chưa được trace trực tiếp tại HOUSE-EXIT-001. Converter cũng giải mã event section đầu tiên sau collision grid: image IDs của `/m/t/o15`, số static sprite records, cell X/Y, signed pixel offsets, và image index. `ad` bytecode loads atlas `/m/t/o<tilesetId>`, indexes images by the listed IDs, and creates `ai` objects from those 5-byte records; `ai` draws at anchor `33` (center-bottom). `ap.c` orders render objects by Y plus Y offset.

Map 64's event section contains 8 image IDs and 16 static decoration records. A local Java2D preview built directly from the pinned JAR and decoded PNGs reproduces the bed, furniture, wall fixtures and plants visible in the saved BED screenshot. It does not reproduce the player/NPC, event-driven changes, or prove Phaser's runtime draw output.

After decoration records, `ad.a()` calls decoders for NPC references/placements, enemy references/placements, face references, three auxiliary tables, and then the final event operation table. The converter preserves both NPC and enemy ID lists and their three-byte placements. The auxiliary tables contain 7-byte trigger rows, 3-byte script commands and string IDs; the final `ad.c(byte[],int)` table contains 10-bit descriptors and four-byte operation records. `ad.b(byte,byte,byte,byte)` dispatches signed opcode values 100–112; `m.a(int)` checks a bit in the event flag array. The converter preserves all tables without executing them. Map 64 has 3 final-table descriptors and 3 action blocks (1/4/2 records; opcodes 101, 105, 108); map 00 has 5 descriptors but 4 blocks, so positional correspondence is not assumed.

M46 ports the source initial action-block operations 100–105: tile replacement, collision replacement, static decoration movement/removal, and NPC movement/hiding. M47 adds operation 110, which changes the selected NPC's image ID. M48 adds operation 109, which changes a static decoration's image, and corrects the operation 102/103 target from combat enemy placements to the source `f16a` decoration array. These actions apply in block order to copied map/decoration/entity data before texture selection and rendering; the original extracted records remain unchanged. Dynamic execution of operations 106–108 and 111–112 and later event-triggered action blocks remains incomplete. See [FND-0023](FND-0023-map-startup-operations.md).

The `y` constructor reads each `.tdf` as a one-byte row count, then that many two-byte big-endian byte lengths and decimal integer IDs. `y.a(index)` resolves each ID through `ci.a(int)` and changes semicolon separators to line breaks. The converter preserves the IDs for all 19 tables; it does not turn the tables into UI behavior.

## Atlas và ảnh

`bq` bytecode dựng tên `<stem>.mph` và `<stem>_<index>.mpd`, đọc số entry và offset/chunk metadata, rồi đưa byte array kết quả vào `Image.createImage(byte[],int,int)`. `tools/extract_game_assets.py` dựng PNG signature, IHDR/IDAT, palette/transparency chunk dùng chung và IEND theo đúng nhánh trong `bq`; giữ nguyên CRC của chunk nguồn và kiểm CRC output.

Converter chạy trên 118 manifest `.mph`, 291 `.mpd`, 81 `.map`, 72 `.evt`, 6 `/c1/s/*` sprite layouts, 19 `.tdf` tables và 12 PNG. It also decodes `lang/language.en-GB` into 2,378 indexed strings. Tất cả output được ghi vào ignored local path `web/public/assets/generated/`; JAR không bị sửa. Test synthetic phủ parsing language/modified UTF-8, `.tdf` IDs, map, signed collision byte, static decoration records, raw event/trigger/script boundaries, character sprite frame boundaries, tái lắp PNG indexed-color và từ chối baseline JAR sai hash.

The layout decoder preserves component/animation/direction slots, signed offsets, image indices, frame order and horizontal-flip flags. It does not assign every slot to a gameplay animation state. `bt` source/bytecode connects the first character sheet's body and head layout resources to the `/c1/i/...` image atlases. Actor rendering and comparison evidence is recorded separately in [FND-0006](FND-0006-actor.md).

## Suy luận và unknowns

- Một output PNG đúng CRC/cấu trúc và được đọc bởi `file` chứng minh việc lắp chunk hợp lệ về cấu trúc; chưa chứng minh mọi sprite đã được ánh xạ đúng gameplay role hoặc đúng layer.
- Raw event decoding validates section boundaries against all 72 pinned `.evt` resources and now preserves NPC/enemy placements. Trigger/script interpretation is limited to the route documented in FND-0007; other script commands and state behavior remain raw. Enemy placements in 39 event maps are data only; they do not establish accessibility or behavior.
- `WorldScene` applies selected initial action blocks 100–105, 109, and 110 to map tiles, collision, decoration position/image, NPC position/visibility/image before rendering; combat enemy placements are not changed by opcodes 102/103. These operations have unit coverage but no new browser capture. Map 64, map 0, their static decorations, a source-layout player and a subset of map-0 static NPC atlas frames render. Map-00 script 9 and the map-64 south-door exit are connected in the browser route. The latest [M20-SCN-0001 capture](../../reference/screenshots/web-render/M20-SCN-0001-hud-skill/capture.json) covers New Game → opening → W skip → BED → outside and draws the original HUD frame, initial status bars and selected Guardian skill icon. Its three full-frame comparisons have mean RGB absolute errors 5.82, 1.13 and 1.63; dynamic stats, NPC/enemy behavior and animation timing remain incomplete. [M21-SCN-0001](../../reference/screenshots/web-render/M21-SCN-0001-dialogue-next/capture.json) records text-page progression through map-00 script-9 dialogue commands. The source type-1/type-2 trigger lookup is implemented for text-only scripts but awaits browser evidence. M18 records the pre-HUD comparison baseline.
- [M23-SCN-0006](../../reference/screenshots/web-render/M23-map79-dynamic-transition/capture.json) confirms that the browser can fetch and render one unseen destination, map 79, when all four required resource bundles exist. The JAR has 81 base `.map` files but only 72 `.evt` files; five decoded transfer commands point to missing event targets 28, 29, 30 and 43. Those routes and the source game's handling remain unresolved, so the M23 result does not establish all-map loading.
- Script 9 establishes the map-64 entry cell `(9,8)`; the rendered actor pixel alignment and all other map-entry points, animation states, full camera behavior and most event paths remain open.
- Asset pipeline này là bước Phase 2; không phải playable vertical slice hoặc full game port.
