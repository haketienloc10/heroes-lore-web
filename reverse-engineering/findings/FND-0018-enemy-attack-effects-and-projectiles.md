# FND-0018 — Enemy attack effects and projectiles

## Question

How do behavior types 2 and 3 deliver attacks, and which source effect assets do they use?

## Reference and method

- Reference artifact: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Method: inspect JADX output for `ak.i()`, `ak.j()`, `h`, `x`, `av`, `cd`, and `ar`; corroborate attack/projectile flow with `javap -c -p -classpath original/heroes-lore-v2.1.2.jar ak h x av cd ar`; decode and validate `/enm/atef/N` resources with `npm run assets:extract` and `python3 -m unittest tools/test_extract_game_assets.py`.
- Relevant source classes: `reverse-engineering/decompiled/sources/defpackage/{ak,h,x,av,cd,ar}.java`.

## Source behavior

- In `ak.i()`, behavior types 2 and 3 start an attack when the cooldown is zero and the player occupies one of the next three cells along the enemy's facing direction.
- At the configured attack frame in `ak.j()`, behavior type 2 attaches effect type 9 (`av`) to the player and calls the source player damage path. Type 3 creates an `h` projectile one cell ahead of the enemy, using the matching `/enm/atef/N` frame stream.
- `h.a()` advances the projectile by creating another one-cell segment when its internal frame reaches 2, while a segment count remains and the next tile is within map bounds. The initial segment has two further segments available, so it can cover three cells. At frame 1 it checks the entity occupying that cell; a hit calls the same player damage method. These projectiles do not test the terrain collision grid.
- `x` takes its animation frame count from the first byte of `/enm/atef/N`. `h` uses the authored frames for drawing and applies an 8-pixel directional offset on frame 1 for two-frame streams. `av` type 9 renders those same frame records at the player. `cd.a()` resolves the component images from the corresponding `/enm/N` atlases, and `ar.b()` draws the component offsets and selected image indices.

## Browser implementation

- The asset converter now decodes all eight `/enm/atef/N` resources into `enemy-attack-effects/catalog.json`; each component retains its source offsets, flip flag and atlas image index.
- Behavior types 2 and 3 use the three-cell facing lane and extracted attack tracks. Behavior 2 plays effect type 9 at the player and applies the existing source-derived defense calculation. Behavior 3 creates the authored projectile frames, advances up to three cell segments, checks the occupied player tile once per segment, and applies the same damage calculation.
- Unit tests cover effect catalog validation and frame playback, projectile launch position, hit-cell selection, one-hit behavior, three-segment range, bounds, and behavior-3 attack animation selection.

## Controlled browser observation

- Evidence: [M40 capture manifest](../../reference/screenshots/web-render/M40-enemy-projectiles/capture.json).
- A seeded map-22 save placed the player at `(9,5)`, with 500/500 HP. Behavior-3 enemy 8 at `(9,3)` faced south in the same column. With no player movement, the gameplay HUD showed 480 HP around four seconds later; a System-menu save recorded 480/500 HP.
- Chromium reported no JavaScript page exceptions or failed network requests. Console events were not collected.
- M1133 starts a fresh visible New Game in a disposable Chromium profile and opens the DEV max-level Map6 preview. After the map's rendered-object set is ready, the level-99 Ronin is at full 394,392 HP. A behavior-2 attack animation with enemy sprite ID 4 appears at the player's tile; its five-frame catalog resolves, and live samples at frames 0 and 3 match the extracted component count, texture key, offsets, flip state and loaded texture assets. The map contains multiple behavior-2 placements with sprite ID 4 (source orders 2, 4, and 5), while the runtime attack-animation record omits source order, so the originating placement is not identified. The [attempt-2 result](../../reference/screenshots/web-render/M1133-map6-behavior2-effect/attempt-2/result.json) and [rendered frames](../../reference/screenshots/web-render/M1133-map6-behavior2-effect/attempt-2/) record the observation.

## Limits

M1133 verifies two live Map6 frames against the extracted effect catalog, but not the complete five-frame sequence. It also cannot attribute the sampled effect to one of the three matching source placements. No source-frame cadence or rendered-pixel comparison against J2ME is recorded. M40 remains an encounter-level damage observation because Map 22 contains other enemies; exact impact count and timing remain unresolved.
