# FND-0044 — Special map NPC sprites backed by enemy resources

## Scope

Render map NPC image codes 3 and 6 using the source enemy animation and image resources that the original NPC loader assigns to them. This covers those two animated actor-image codes, not other NPC behaviors or general character rendering.

## Source evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- In `ad.m6b`, NPC image code 3 calls `cd.a(17, slot, true)` and code 6 calls `cd.a(20, slot, true)`. This loads `/enm/17` plus `/enm/spr/17`, or `/enm/20` plus `/enm/spr/20`, into source NPC animation slots. The extracted event placements use code 6 on maps 03 and 51, and code 3 on maps 62 and 71.
- `ab.a(Graphics,...)` selects source state 0 for standing or state 1 for moving, with four facing directions. It does not select the enemy animation's third attack state. The enemy records contain all 12 state/direction tracks, and their image indices reference the corresponding `/enm/N` images.

## Browser implementation

- `sourceEnemySpriteIdForNpc` maps codes 3/6 to enemy sets 17/20. `adaptEnemyAnimationForNpc` exposes only the source idle/walk tracks to the existing NPC renderer. The texture queue reads the matching generated `/atlases/enm/17` or `/atlases/enm/20` components and keeps the source image indices and component offsets/mirroring.
- M162 adds this mapping without placeholder art. The existing `/enm/17` and `/enm/20` assets already cover every component image referenced by their idle and walk tracks.

## Verification and limits

- Focused tests verify the code-to-resource mapping, idle/walk filtering and adapted component frames. Full gates pass: 48 Vitest files / 364 tests, typecheck, production build (1,501.90 kB larger minified JavaScript chunk; existing Vite >500 kB warning), 40 Python converter tests, pinned JAR SHA-256, and `git diff --check`.
- Controlled Chromium 156 replays load map 03 with code-6 placements and map 71 with code-3 placements from separate seeded saves. Both screenshots show the map actors and report zero page errors or console errors; see the [capture manifest](../../reference/screenshots/web-render/M162-special-map-npc-sprites/capture.json). A screenshot-triggered WebGL `ReadPixels` GPU-stall warning was observed.
- No J2ME comparison was produced. Rendered pixel placement, NPC animation paint cadence, and interactions involving these map actors remain unverified. The captures are direct map seeds, not campaign-route evidence. See [FND-0025](FND-0025-npc-sprite-animations.md) and the [ROADMAP](../../ROADMAP.md).
