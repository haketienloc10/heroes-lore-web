# FND-0013 — Enemy sprite animation records

## Scope

Decode the original enemy sprite sequences and map their facing, state, frame, and component data into the browser renderer.

## Baseline and tools

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: JADX `reverse-engineering/decompiled/sources/defpackage/{cd,ar,ak}.java`.
- Bytecode cross-check: `javap -classpath original/heroes-lore-v2.1.2.jar -p -c cd ar ak`.
- Extractor: `tools/extract_game_assets.py`, function `decode_enemy_sprite_animations`.
- Browser implementation: `web/src/world/enemy-sprites.ts`, `web/src/world/combat.ts`, and `web/src/rendering/WorldScene.ts`.
- Commands run: `npm run assets:extract`, `python3 -m unittest tools.test_extract_game_assets`, `npm test`, `npm run typecheck`, and `npm run build`.

## Verified source facts

- `cd.a(short,byte,boolean)` loads both `/enm/<id>` and `/enm/spr/<id>`. Its `javap` bytecode reads each sequence header as state, direction, and payload length (offsets 105–133), then places the payload at `id*12 + state*4 + direction` (offsets 173–192 and 216–237). JADX uses the same 12-slot index formula.
- `cd.a(boolean,byte[],int,byte,byte,bq)` reads the frame count, then a component count and four bytes per draw component. It reads a mirror flag and subimage index and rewrites the component's image-group byte to the mirrored alias when needed. `javap` confirms count parsing at offsets 0–8 and component/mirror handling at offsets 98–181.
- `ar.b(Graphics,byte[],byte,int,int)` selects a frame by skipping each prior frame's component count and four-byte entries (offsets 12–55), then draws that frame's components using their X/Y offsets, image-group alias, and subimage index (offsets 57–175). The runtime sequence stores frames and components, not a precomposed PNG.
- `ak.a(Graphics,int,int)` maps enemy state `h` values 1, 2, and 3 to animation state slots 0, 1, and 2 and adds `j-1` for direction (bytecode switch at offsets 242–315; arithmetic at offsets 272–312). `ak.d()` increments `k` once per update at offsets 0–8, before its offscreen/activation early-return branch. Enemy definition setup takes the per-state frame counts from the first direction's sequence; all 24 decoded resources have matching frame counts across their four directions for each state.
- The pinned JAR contains 24 numeric `/enm/spr/N` resources. Each has all 12 state/direction tracks (3 states × 4 facings); the extractor validates track coverage, frame/component bounds, and equal per-state counts across facings.

## Implementation and checks

- `npm run assets:extract` now emits `enemy-animations/catalog.json` with all 24 source animation sets, preserving signed component offsets, mirror flags, subimage indices, state/direction slots, and frames. The referenced original subimages are already extracted as PNGs.
- `WorldScene` builds enemy composites from the source subimages and advances animation tracks once per 71 ms map update. `EnemyCombatant` carries state, facing, and frame cursor fields. M36 selects the decoded walking track while source-derived pursuit advances. M37 uses the attack track for behavior types 0/1; behaviors 2/3 and source offscreen/activation culling remain open.
- Verification passed: converter tests 24/24, Vitest 86/86, TypeScript typecheck, and production build. Extraction produced 1,695 local files from the hash-pinned JAR. The bundle is 1,283.21 kB minified and Vite reports its 500 kB chunk-size warning.

## Limits

M35 and M36 have no browser screenshots. M37 has a controlled Chromium attack/HP capture, but no J2ME frame comparison. The source-side M37 replay reached an adjacent behavior-1 enemy but did not show an attack or cooldown progress; it is inconclusive for timing and visual parity. Wandering/patrol, special enemy behaviors, and source update behavior under offscreen culling remain open. See [FND-0014](FND-0014-enemy-pursuit.md), [FND-0015](FND-0015-enemy-melee-attacks.md), and [ROADMAP](../../ROADMAP.md) for current port status.
