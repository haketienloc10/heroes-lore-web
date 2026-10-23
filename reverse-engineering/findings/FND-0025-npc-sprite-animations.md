# FND-0025 — NPC sprite animation tracks and scripted facing

## Scope

Decode the pinned game's `/npc/spr/N` image-component tracks and render the opening NPC's source-commanded facing changes. This finding covers sprite selection and frame composition; it does not establish complete NPC behavior or animation timing parity.

## Source evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- `reverse-engineering/decompiled/sources/defpackage/cd.java:b(byte,byte)` reads `/npc/spr/N` records and stores their byte payloads in `cd.j`. JADX's local-variable rendering presents the state and direction bytes as booleans; `javap -c -p cd` shows raw byte loads and the `state * 4 + direction` track index. The recorded direction indices are 0–3.
- `reverse-engineering/decompiled/sources/defpackage/ab.java:a(Graphics,int,int)` selects the standing track when `h != 2`, or the moving track when `h == 2`, then indexes it by `j - 1`. It draws each component frame and increments `k`, wrapping at the state-specific frame count. This establishes the two rendered states, four facings, and source frame-advance behavior in the renderer.
- The converter found eight resources: `/npc/spr/{05,08,11,12,13,14,16,17}`. Each contains all eight state/direction tracks. NPC16 has one standing frame for each direction and four moving frames for each direction. Component records preserve signed pixel offsets, mirror flags, and image indices.
- The extracted map-00 script 9 includes command `[17,1,4]`, which turns source NPC placement slot 1 to direction 4 (right in the web direction mapping). Map startup operation 2 leaves NPC16 at that source placement while hiding slots 2, 0, and 4; see [FND-0023](FND-0023-map-startup-operations.md) and [FND-0024](FND-0024-opening-cutscene-interpreter.md).

## Browser implementation

- `tools/extract_game_assets.py` emits `npc-animations/catalog.json` from the pinned resource bytes and validates the complete two-state/four-direction track set, frame payloads, and consistent frame counts by state.
- `web/src/world/npc-sprites.ts` validates the generated catalog and selects tracks/frames by NPC ID, state, and facing. `web/src/rendering/WorldScene.ts` loads component images used by visible placements, composes offset/mirrored frames in Phaser containers, and applies the opening interpreter's per-placement direction and movement state.
- NPC sprite tracks with multiple frames currently advance on every Phaser scene update. M58 adds source emotion overlays to NPC sprite containers for ordered cutscene commands 50; NPC path/coordinate movement, general interaction behavior, and emotion behavior outside supported cutscenes remain incomplete.

## Verification and limits

- Converter tests: 28 passed; Vitest: 23 files / 135 tests passed. `npm run typecheck` and `npm run build` passed. A local asset-reference check confirmed that every non-empty component image index in all eight extracted NPC sets has a generated atlas image. The production bundle is 1,316.82 kB minified and exceeds Vite's 500 kB advisory threshold.
- `git diff --check` passed. M50 has no browser or J2ME capture. The renderer's source-frame timing, component placement/pixel parity, NPC movement, and behavior outside the opening script remain unverified.
- These eight resources do not constitute all NPC/game-character animation data; other character and equipment layouts, general NPC behavior, audio, and most campaign content remain incomplete. See the [ROADMAP](../../ROADMAP.md).
