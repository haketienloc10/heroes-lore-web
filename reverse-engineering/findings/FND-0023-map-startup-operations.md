# FND-0023 — Selected source map initialization operations

## Scope

Port the pinned JAR's selected map action-block operations that mutate initial tile IDs, collision, decoration positions/images, NPC placements, NPC image IDs, and startup NPC emotions before rendering.

## Baseline and source

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source/bytecode: `reverse-engineering/decompiled/sources/defpackage/ad.java`; `ad.m7c(byte[],int)` selects the startup action block from ordered flag descriptors and `ad.b(byte,byte,byte,byte)` dispatches its four-byte action records. `m.m98a(int)` tests the event flag bit. The converter preserves both tables.
- Source locations: `ad.java:260–304` creates `f16a` from static decoration records; `ad.java:581–633` scans descriptors and selects the startup block; `ad.java:636–685` dispatches actions; `ai.java:15–33` holds and draws each image; `ab.java:11–16,46–57` stores and draws NPC image IDs. Opcode 112 clears an NPC's transient effect vector and optionally adds its `/img/emoti` sprite. `FND-0005` records the operation-table decoder and the bytecode commands used.

## Verified source behavior

Action arguments are read as three bytes after the opcode, in order `(b2,b3,b4)`:

- 100 writes tile ID `b4` to map cell `[b3][b2]`.
- 101 writes collision byte `b4` to `[b3][b2]`.
- 102 moves decoration slot `b4` to tile `(b2,b3)` by multiplying both coordinates by 16 pixels; the decoration's local offsets remain unchanged.
- 103 removes decoration slot `b2` from the draw-order structure and clears that slot.
- 104 moves NPC slot `b4` to tile `(b2,b3)` in pixel coordinates.
- 105 hides NPC slot `b2` and removes its occupied cells.
- 109 replaces map decoration slot `b2` with image `b3` from the map's loaded object-image table.
- 110 assigns NPC slot `b2` the image/animation ID `b3`; `ab.f` is used as the NPC image ID by the source renderer.
- 111 clears the player actor's transient-effect vector, then, when signed byte `b2` is nonzero, adds an indefinite emotion effect `av(10, -1, b2 - 1)`. A zero `b2` therefore clears the startup emotion. `av` draws the selected `/img/emoti` image above the player and alternates its one-pixel vertical offset.
- 112 clears transient effects for NPC slot `b2`, then, when `b3` is nonzero, adds emotion image `b3 - 1`. A zero `b3` therefore clears the startup emotion. The source emotion object uses `/img/emoti` and is positioned above its NPC.

`ad.m7c()` scans descriptor records in source order. It stores a descriptor's signed marker only when its cell flag is set and the current marker is still `-1`, then scans action blocks and applies the block whose signed ordinal matches that marker. A matching raw marker byte `255` is signed `-1`, so it leaves the sentinel available for a later matching descriptor; any other negative marker is retained but matches no nonnegative action-block ordinal. This confirms the source selection rule without claiming runtime/J2ME parity.

The extracted action tables contain 165 opcode-100 records, 99 opcode-101 records, 8 opcode-103 records, 76 opcode-105 records, 2 opcode-109 records, 4 opcode-110 records, and 13 opcode-112 records. All eight opcode-103 targets exist in their map's decoration records; no opcode-102 records occur in the current extracted tables. Both opcode-109 records target map 27 decoration slot 5, replacing image 1 with loaded image 0. Opcode 110 assigns NPC image IDs 42 once and 44 three times; every target NPC slot exists in its map. Opcode 112 occurs on maps 60, 63, 66, 69, 75, 76, and 79; each target NPC slot exists. Opcodes 106/107 reach source assertion failures, opcode 108 returns without an effect, and opcode 111 does not occur in the 72 decoded event tables. This is a local census of the decoded pinned-JAR event tables, not proof those blocks are reachable in gameplay. Synthetic cases cover opcode 102 and opcode 104.

M48 corrected the earlier classification of opcodes 102/103: `f16a` is populated from the first decoration section of the map event resource, so these operations move/remove map decorations and do not change combat enemy placements.

## Browser implementation

- `applyInitialMapEventState` clones the source map, decoration records, and entity placement arrays, then applies selected block actions in order. Descriptor selection follows `ad.m7c()` table order, signed marker bytes, and the `-1` sentinel rule; action blocks are selected by marker value rather than descriptor position. It retains the extracted source records and passes effective data to initial and on-demand map loaders. Opcode 111 carries the selected player emotion through map creation and re-entry; an explicit zero clears the displayed emotion, weapon-proc feedback, and hero-owned damage popups represented by the browser. A map with no opcode 111 preserves the current player emotion.
- Texture selection and static rendering use changed tile IDs, decoration image IDs, and decoration coordinates. Enemy placements remain unchanged by opcodes 102/103; NPC movement, visibility, texture selection, and selected startup emotion use effective state. Opcode 112 updates the existing NPC emotion sprite in action order, including set-then-replace and set-then-clear sequences.
- Tests verify descriptor source order, signed `255` sentinel handling, multiple matching flags, the no-match case, argument order, ordered composition, collision-byte sign conversion, decoration movement/removal/image replacement, NPC movement/hiding/image replacement/emotion, player emotion set/replace/clear behavior, and that original map/event/decoration data is not mutated.

## Verification and limits

- The opcode-112 ordered-set/clear test passes. Full Vitest suite: 31 files / 214 tests passed; typecheck and production build passed. The minified bundle is 1,396.38 kB and Vite reports its existing >500 kB chunk warning.
- Controlled Chromium replay seeds map 79 with game flags 0 and 87, loads the selected startup block and renders the world scene. Evidence `ev_73077d14bd52cab4914110bcb41fc10696cf875451f08fd374ba244c6c5533d3` contains a 360×640 screenshot (SHA-256 `846cd267b6520f5041f97d7732d2abb6c4b9a66082d27381ca936a5c55fafe61`) and no page exceptions. A separate network capture confirmed map 79's map/collision/decoration/event JSON and all 12 emotion textures returned HTTP 200; that capture was incomplete at its end and logged one 404 resource, so it does not establish complete request coverage.
- M189 cross-checks `ad.b(byte,byte,byte,byte)` in `javap -c -p ad` with `n.c()` and `av.a(Graphics,int,int)`: opcode 111 resets the player effect vector and attaches the selected indefinite emotion sprite. The browser passes the state through initial map setup and later map entry. Its focused operation test covers set, replace, clear, absent operation, and signed-byte decoding. Full verification passes 51 Vitest files / 397 tests, typecheck, production build, 40 Python converter tests, pinned JAR SHA-256 and `git diff --check`; the larger minified JavaScript chunk is 1,515.37 kB and retains Vite's >500 kB warning. The current event-table census contains no opcode 111, so this has no browser scenario capture or J2ME comparison.
- M270 cross-checks startup descriptor selection against `ad.m7c(byte[],int)`: matching descriptors are scanned in source order, and raw byte `255` keeps the signed `-1` sentinel open for a later match. Unit tests cover that case, multiple matches, a nonmatching descriptor and no match. Full Vitest passes 52 files / 408 tests; typecheck, production build (1,518.36 kB minified game chunk; existing Vite >500 kB warning), 40 Python converter tests and `git diff --check` pass. This is static-source and unit-test evidence, with no browser/J2ME comparison or new JAR inspection.
- Startup opcode 112 is implemented and browser-observed on map 79. Opcode 111 is implemented from its source dispatch and bytecode, but does not occur in the 72 decoded event tables, so its runtime scene behavior is unit-tested only. Startup descriptor selection is now mapped from `ad.m7c()` and covered by unit tests, but it has no new browser or J2ME comparison. Runtime emotion timing/parity against J2ME remains open. The checked-in source calls `ad.m7c()` while parsing each map’s `.evt` data; the method has no later trigger-dispatch call site, so the selected startup action blocks are already the full source call path represented here. This finding does not establish complete map-event or campaign fidelity; see the [ROADMAP](../../ROADMAP.md).
- M320 gives each player/NPC emotion image its own two-frame offset cursor, resets it when the source selects or clears the emotion, and advances it after paced `POST_RENDER` passes while the owning actor is visible. This follows `av.a(Graphics,...)`, which draws with `b % 2` and increments `b` after drawing. M323 supplies a separate source paint clock for visible event-mode map renders while world simulation is paused. Unit tests cover cursor and paint-clock batches; J2ME mode-4 cadence and full overlay parity remain open.
