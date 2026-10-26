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
- State 5 is the ordinary enemy death countdown. The source renderer selects idle state slot 0 for it through the default branch in `ak.a(Graphics,...)`; `ak.o()` wraps its frame cursor using the idle frame count while the death timer runs. Lethal ordinary hit handlers reset the cursor before this state.
- The pinned JAR contains 24 numeric `/enm/spr/N` resources. Each has all 12 state/direction tracks (3 states × 4 facings); the extractor validates track coverage, frame/component bounds, and equal per-state counts across facings.

## Implementation and checks

- `npm run assets:extract` now emits `enemy-animations/catalog.json` with all 24 source animation sets, preserving signed component offsets, mirror flags, subimage indices, state/direction slots, and frames. The referenced original subimages are already extracted as PNGs.
- `WorldScene` builds enemy composites from the source subimages and advances animation tracks once per 71 ms map update. `EnemyCombatant` carries state, facing, and frame cursor fields. M36 selects the decoded walking track while source-derived pursuit advances. M37 uses the attack track for behavior types 0/1; M39/M40 add behavior 2/3 attacks and effects. M150 models ordinary `ak` offscreen/activation culling; special-actor culling and J2ME frame comparisons remain open.
- M295 renders ordinary `ak` death-pending actors with their facing-specific idle track and advances that track through the source death countdown. Its lethal basic-attack path resets the browser frame cursor to the first source death frame. M296 records the distinct direct-skill cursor and handles special `au` deaths; J2ME frame/cadence comparison remains open (FND-0051).
- M305 adds `npm run audit:enemy-render-coverage --workspace web`. It parses all 72 generated class-6 event tables, includes the source-created map-11/13/15 encounters and map-13 second wave, checks each enemy placement against all three 43-record enemy data variants, then validates every referenced ordinary/boss animation and attack-effect atlas image. The current generated set covers 329 placements, all 24 ordinary sprite sets and 8 source boss render IDs with 224 distinct atlas image paths and no missing references. This proves generated path coverage only; it does not prove actor behavior, image appearance, or J2ME parity.
- Verification passed: converter tests 24/24, Vitest 86/86, TypeScript typecheck, and production build. Extraction produced 1,695 local files from the hash-pinned JAR. The bundle is 1,283.21 kB minified and Vite reports its 500 kB chunk-size warning.

## Limits

M35 and M36 have no browser screenshots. M37 has a controlled Chromium attack/HP capture, but no J2ME frame comparison. The source-side M37 replay reached an adjacent behavior-1 enemy but did not show an attack or cooldown progress; it is inconclusive for timing and visual parity. Wandering/patrol and special enemy behaviors remain open. M150's ordinary-actor culling has unit coverage only; special actor overrides and J2ME update comparison are open. See [FND-0014](FND-0014-enemy-pursuit.md), [FND-0015](FND-0015-enemy-melee-attacks.md), and [ROADMAP](../../ROADMAP.md) for current port status.

M295/M296 have no browser capture or J2ME comparison; the death-track selection and model update behavior is based on checked-in source and extracted animation data.
