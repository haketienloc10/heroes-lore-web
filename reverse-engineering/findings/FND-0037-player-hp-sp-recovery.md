# FND-0037 — Player HP/SP recovery timers

## Question

How does the source replenish player HP and SP during world updates, and does the System overlay stop those updates?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static review of JADX output for `an`, `m`, and `ar`, cross-checked with `javap -classpath original/heroes-lore-v2.1.2.jar -p -c an`, `m`, and `ar`.
- Controlled Chromium replay against the local Vite app, with a seeded Ronin save at map 64/tile `(9,8)`.

## Verified source behavior

- `ar.paint()` runs `m.i()` while the source game mode is 2. `m.i()` advances the player through `m.n()`, which invokes `an.d()`; `javap` confirms the same call chain. In that gameplay mode, source `an.d()` updates the HP/SP recovery timers each world tick.
- Source player state 1 (idle) subtracts 2 from the HP timer and 3 from the SP timer. State 2 (walking) subtracts 1 from each. Other action states do not decrement them. The source still checks expired timers on every gameplay tick.
- HP recovery adds the character's HP attribute plus the sum of equipment HP bonuses. The initial timer is 67; after each pulse it resets to `min(67 + level, 100)`. SP recovery adds the Will attribute plus equipment Will bonuses, starts at 21, and resets to 21 after each pulse. The source stat calculation accumulates equipment bonuses in the same four attribute slots used by FND-0036.
- `an.a()` initializes the transient timers. Class setup assigns the starting level afterward, so the new-character initial HP timer is 67. The source player save writes the level, current/max vitals, attributes and equipment, but not these timers; restoring the player therefore starts from initialized timer values rather than persisting partial countdowns.
- The source gameplay paint/input path remains in mode 2 while the System overlay is drawn, so player and map ticks continue beneath it. Commerce handoffs use separate source modes.
- The source has an `f54h` multiplier branch that doubles both recovery amounts. No assignment to that field was found in the extracted source call sites; the web implementation applies the ordinary amount and leaves this branch as an unresolved source path.

## Browser implementation

- `web/src/world/player-recovery.ts` models the transient signed-byte timers, idle/walking/other activity rates, level-based HP timer reset, 21-tick SP reset, equipment-adjusted attribute amounts, and source HP/SP clamping.
- `WorldScene` advances recovery at the player's 71 ms world-tick boundary. It derives activity from the actor and active combo, applies current effective equipment attributes, and refreshes the HUD when a pulse changes a value.
- The source System overlay no longer pauses world simulation. Commerce screens still hold the map simulation, matching their separate source mode.
- Four unit tests cover initial timers, idle versus walking rates, action-state holds, equipment-adjusted gains, clamping, high-level timer bounds, and inactive gameplay.

## Runtime evidence

- Seeded a level-1 Ronin with HP `40/72`, SP `10/60`, base attributes `(8,5,3,4)`, and the reconstructed starting equipment.
- Left the actor idle for 2.8 seconds, opened System, left the overlay visible for five seconds, then saved. The resulting browser save records HP `50/72` and SP `60/60`. This demonstrates timer-driven recovery while the overlay is open; the combined wait is wall-clock time, not a J2ME tick-by-tick comparison.
- Chromium reported no page exceptions, console errors, or failed requests. See [M97 capture](../../reference/screenshots/web-render/M97-player-recovery/capture.json).

## Verification and limits

- Vitest: 35 files / 229 tests passed. Typecheck passed. Production build passed; the larger JavaScript chunk is 1,411.77 kB minified and Vite retains its >500 kB warning.
- The runtime scenario is a seeded level-1 Ronin, not natural progression. Walking rates are covered by unit tests but have no browser/J2ME comparison. The `f54h` double-recovery branch, exact emulator timing, other classes, and long-term recovery during every game mode remain unverified.
