# FND-0045 — Source camera focus and facing-axis follow

## Question

How does the pinned J2ME build position the gameplay viewport, and what changes when the Camera option is enabled?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static bytecode inspection: `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ar m t`.
- Relevant methods and bytecode offsets: `ar.<init>()` BCI 21–52 sets viewport/focus fields; `ar.paint(Graphics)` BCI 88–112 selects Camera On/Off update order and BCI 122–145 calls camera easing only when enabled; `m.g()` BCI 0–26 computes hero-relative offsets; `m.a(boolean,boolean)` BCI 0–116 applies look-ahead and eases the facing axis; `t.<clinit>()` BCI 111–226 defines direction signs and the axis-selection booleans.
- Browser evidence: controlled Chromium 156.0.8078.4 route and seeded Camera On/Off probe, captured with Playwright compositor screenshots of the 240×320 Phaser canvas; see [M166 manifest](../../reference/screenshots/web-render/M166-source-camera/capture.json).

## Verified source behavior

- `ar.<init>` sets the world viewport to `q.g × (q.h - 21)`. Its focus point is `(q.g / 2 - 8, (q.h - 21) / 2)`. At the browser's logical 240×320 size, these evaluate to a 240×299 world viewport and focus `(112,149)`.
- `m.g()` derives camera offsets from that focus and the hero's source pixel origin (`cj.c`, `cj.d`).
- In gameplay state 2, `ar.paint` reads `br.d` (Camera). Camera On runs `m.g()` then `m.i()` at BCIs 88–103; Camera Off runs `m.i()` then `m.g()` at BCIs 106–109. After the update, the Camera On path calls `m.a(true,true)` only when the map is not in its separate fixed-camera mode (BCIs 122–145).
- `m.a(true,true)` applies a 15-pixel offset in the hero's facing direction using `t.a`/`t.b` direction tables. The `t.a[direction]` boolean selects the axis to follow: up/down eases the vertical focus, left/right eases the horizontal focus. The other axis retains its prior focus. For the selected axis, the stored offset advances by `current + ((target - current + 1) / 2) - 1`, using Java integer division, and the branch skips the calculation when current already equals target. Camera Off skips this easing/look-ahead call.
- The `ad` map object sets its separate `f6b` fixed-camera flag only for map IDs 13 and 15. These maps skip gameplay easing and their renderer uses the live `m.f270a/m.b` target regardless of the Camera option, adding 30 pixels to its vertical coordinate. M327 models this map-specific path; see [FND-0057](FND-0057-fixed-map-camera-offset.md).

## Browser implementation and evidence

- `web/src/world/source-camera.ts` models the 240×299 viewport focus, directional 15-pixel offset, facing-axis selection, scroll clamping, and the source signed-integer easing recurrence. `WorldScene` applies that recurrence on each elapsed 71 ms world-update boundary rather than continuously on every RAF update. At the default 14 FPS, this boundary matches the gameplay paint/update cadence measured in FND-0004; lower browser speeds scale the 71 ms simulation clock to source options 10 and 8 FPS, following the checked-in `br` rate table. Only the default setting has corresponding runtime cadence measurements. Same-map Camera On targets derive position from the pre-update hero origin, map entry centers both axes without look-ahead, and transient camera shake is kept separate from the base scroll. Maps 13 and 15 use their source live-target override and 30-pixel vertical offset.
- M166 adds six focused tests covering all four facing offsets, Camera Off, axis selection, the 240×299 focus target, edge/small-map clamping, and integer easing including equal-target behavior.
- The controlled route follows New Game → Ronin → Hestia/Ran → Yes, skips the opening, and moves Down twice with browser keyboard input and no direct scene-state edits. It records the opening, BED, inside and outside canvas frames.
- The separate camera probe loads the same seeded map-03 state into two fresh Chromium contexts with only the saved Camera option differing. Both contexts request the map, collision, decoration and event-operation files with HTTP 200; page exceptions, console errors, failed requests and HTTP errors are empty. The captured on/off images have different SHA-256 values (`b042e2df918d99368746d708bdabd778658066cecc425b17087bacd4df41422f` and `d07d73c880eb7557ef12916748206c3f05ae2165bbd9171cd74f06cd56b6796e`). The probe demonstrates that the current browser renderer exercises the option in an unclamped map scene; the manifest's route and seeded-state caveats still apply.
- M461 replays a fresh visible New Game route against the M15 R04 source screenshots. The current BED, first-Down and outside frames differ at 761/76,800, 761/76,800 and 961/76,800 pixels, with RGBA mean absolute channel deltas 0.694, 0.686 and 0.976. This confirms close full-frame alignment at these three checkpoints after M166; it does not measure camera output on every paint boundary or other maps/options ([capture manifest](../../reference/screenshots/web-render/M461-current-house-visual-parity/capture.json)).

## Verification and limits

- Full gates pass: `npm test` (49 files / 371 tests), `npm run typecheck`, `npm run build` (1,503.60 kB larger minified JavaScript chunk; existing Vite >500 kB warning), `python3 tools/test_extract_game_assets.py` (40 tests), pinned JAR SHA-256, and `git diff --check`.
- This is source-bytecode plus browser evidence, not a fresh J2ME camera capture. The web implements the statically verified J2ME integer easing formula and applies it at the measured default gameplay cadence. M461 compares three full frames on the house route; exact camera output at source paint boundaries, lower-speed runtime cadence, other-map transitions, and presentation latency have not been compared one-to-one. The seeded map-03 scene is not evidence of natural campaign reachability. See [FND-0004](FND-0004-runtime-scheduler.md), [FND-0024](FND-0024-opening-cutscene-interpreter.md), [FND-0027](FND-0027-supported-interaction-cutscenes.md), and the [roadmap](../../ROADMAP.md).
