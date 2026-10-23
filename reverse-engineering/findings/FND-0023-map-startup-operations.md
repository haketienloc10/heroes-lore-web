# FND-0023 — Selected source map initialization operations

## Scope

Port the pinned JAR's selected map action-block operations that mutate initial tile IDs, collision, decoration positions/images, NPC placements, NPC image IDs, and startup NPC emotions before rendering.

## Baseline and source

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source/bytecode: `reverse-engineering/decompiled/sources/defpackage/ad.java`; `ad.b(byte,byte,byte,byte)` dispatches the four-byte action record. The converter preserves descriptor-selected action blocks and the browser already selected a startup block from game flags.
- Source locations: `ad.java:260–304` creates `f16a` from static decoration records; `ad.java:636–685` dispatches actions; `ai.java:15–33` holds and draws each image; `ab.java:11–16,46–57` stores and draws NPC image IDs. Opcode 112 clears an NPC's transient effect vector and optionally adds its `/img/emoti` sprite. `FND-0005` records the operation-table decoder and the bytecode commands used.

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
- 112 clears transient effects for NPC slot `b2`, then, when `b3` is nonzero, adds emotion image `b3 - 1`. A zero `b3` therefore clears the startup emotion. The source emotion object uses `/img/emoti` and is positioned above its NPC.

The extracted action tables contain 165 opcode-100 records, 99 opcode-101 records, 8 opcode-103 records, 76 opcode-105 records, 2 opcode-109 records, 4 opcode-110 records, and 13 opcode-112 records. All eight opcode-103 targets exist in their map's decoration records; no opcode-102 records occur in the current extracted tables. Both opcode-109 records target map 27 decoration slot 5, replacing image 1 with loaded image 0. Opcode 110 assigns NPC image IDs 42 once and 44 three times; every target NPC slot exists in its map. Opcode 112 occurs on maps 60, 63, 66, 69, 75, 76, and 79; each target NPC slot exists. Opcodes 106/107 reach source assertion failures, opcode 108 returns without an effect, and opcode 111 does not occur in the 72 decoded event tables. This is a local census of the decoded pinned-JAR event tables, not proof those blocks are reachable in gameplay. Synthetic cases cover opcode 102 and opcode 104.

M48 corrected the earlier classification of opcodes 102/103: `f16a` is populated from the first decoration section of the map event resource, so these operations move/remove map decorations and do not change combat enemy placements.

## Browser implementation

- `applyInitialMapEventState` clones the source map, decoration records, and entity placement arrays, then applies selected block actions in order. It retains the extracted source records and passes effective data to initial and on-demand map loaders.
- Texture selection and static rendering use changed tile IDs, decoration image IDs, and decoration coordinates. Enemy placements remain unchanged by opcodes 102/103; NPC movement, visibility, texture selection, and selected startup emotion use effective state. Opcode 112 updates the existing NPC emotion sprite in action order, including set-then-replace and set-then-clear sequences.
- Tests verify argument order, ordered composition, collision-byte sign conversion, decoration movement/removal/image replacement, NPC movement/hiding/image replacement/emotion, and that original map/event/decoration data is not mutated.

## Verification and limits

- The opcode-112 ordered-set/clear test passes. Full Vitest suite: 31 files / 214 tests passed; typecheck and production build passed. The minified bundle is 1,396.38 kB and Vite reports its existing >500 kB chunk warning.
- Controlled Chromium replay seeds map 79 with game flags 0 and 87, loads the selected startup block and renders the world scene. Evidence `ev_73077d14bd52cab4914110bcb41fc10696cf875451f08fd374ba244c6c5533d3` contains a 360×640 screenshot (SHA-256 `846cd267b6520f5041f97d7732d2abb6c4b9a66082d27381ca936a5c55fafe61`) and no page exceptions. A separate network capture confirmed map 79's map/collision/decoration/event JSON and all 12 emotion textures returned HTTP 200; that capture was incomplete at its end and logged one 404 resource, so it does not establish complete request coverage.
- Startup opcode 112 is implemented and browser-observed on map 79. Opcode 111 source behavior, runtime emotion timing/parity against J2ME, action blocks triggered after entry, and source runtime selection of all map descriptors remain open. This finding does not establish complete map-event or campaign fidelity; see the [ROADMAP](../../ROADMAP.md).
