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
- HP recovery adds the character's HP attribute plus the sum of equipment HP bonuses. The initial timer is 67; after each pulse it resets to `min(67 + level, 100)`. SP recovery adds the Will attribute plus equipment Will bonuses, starts at 21, and resets to 21 after each pulse. The source stat calculation accumulates equipment bonuses in the same four attribute slots used by FND-0036. Since the base attribute is a short and the combined equipment bonus is a signed byte, the effective recovery value may cross the short boundary (for example, `32767 + 1 = 32768`).
- `an.a()` initializes the transient timers. Class setup assigns the starting level afterward, so the new-character initial HP timer is 67. The source player save writes the level, current/max vitals, attributes and equipment, but not these timers; restoring the player therefore starts from initialized timer values rather than persisting partial countdowns.
- The source gameplay paint/input path remains in mode 2 while the System overlay is drawn, so player and map ticks continue beneath it. Commerce handoffs use separate source modes.
- The `f54h` branch doubles both recovery amounts without changing either timer interval. FND-0038 later identifies the assignment: skill ID 1 level 2 sets `an.f54h` for its 81-update effect window. The web skill-action state models that window as `recoveryBoostTicksRemaining`, and `WorldScene` passes multiplier 2 to the recovery helper while it is active. Unit coverage checks the skill window and doubled HP/SP pulse; M1062 also observes both doubled pulses in the current browser runtime ([FND-0038](FND-0038-player-skill-actions.md)).

## Browser implementation

- `web/src/world/player-recovery.ts` models the transient signed-byte timers, idle/walking/other activity rates, level-based HP timer reset, 21-tick SP reset, equipment-adjusted attribute amounts (including values beyond the base short range), and source HP/SP clamping.
- `WorldScene` advances recovery at the player's 71 ms world-tick boundary. It derives activity from the actor and active combo, applies current effective equipment attributes, and refreshes the HUD when a pulse changes a value. During the skill-1 level-2 buff window it supplies the source multiplier 2.
- The source System overlay no longer pauses world simulation. Commerce screens still hold the map simulation, matching their separate source mode.
- Six recovery unit tests cover initial timers, idle versus walking rates, action-state holds, equipment-adjusted gains, clamping, high-level timer bounds, effective attributes crossing short bounds, inactive gameplay, and the doubled pulse amount. A separate skill-action test covers the rank-20 buff window.

## Runtime evidence

- Seeded a level-1 Ronin with HP `40/72`, SP `10/60`, base attributes `(8,5,3,4)`, and the reconstructed starting equipment.
- Left the actor idle for 2.8 seconds, opened System, left the overlay visible for five seconds, then saved. The resulting browser save records HP `50/72` and SP `60/60`. This demonstrates timer-driven recovery while the overlay is open; the combined wait is wall-clock time, not a J2ME tick-by-tick comparison.
- Chromium reported no page exceptions, console errors, or failed requests. See [M97 capture](../../reference/screenshots/web-render/M97-player-recovery/capture.json).
- M1035 starts a fresh visible max-level New Game with category 6/item 12 equipped at HP bonus `+1`, making the effective HP recovery attribute `32768`. Over 3.2 seconds of active Map76 world updates, HP remains at its computed maximum `394404` and Chromium reports zero page exceptions, console errors, or failed requests ([M1035 notes](../../reference/screenshots/web-render/M1035-equipment-recovery-boundary/evidence-notes.md)). This verifies the browser regression fix on the seeded web scenario, not J2ME recovery timing.
- M1062 starts a fresh visible max-level New Game in a DEV Map80 scenario with skill ID 1 level 2 preassigned and HP/SP at `214392/394392`. After Numpad1 activates the skill, browser telemetry observes `+65534` HP and `+65534` SP pulses while the 81-tick recovery boost is active; Chromium reports zero errors ([M1062 notes](../../reference/screenshots/web-render/M1062-skill1-level2-recovery/evidence-notes.md), [attempt 3 result](../../reference/screenshots/web-render/M1062-skill1-level2-recovery/attempt-3/result.json)). This verifies the current web effect on a seeded max-level scenario, not UI assignment, natural progression, or J2ME timing.
- M910 attempted a fresh max-level New Game route to Map27 for walking recovery observation. After three REA launches, the final run reached Map64 `(9,8)` but short directional press/release actions did not change the runtime tile, so the route never reached an enemy. No damage or walking recovery was observed. The replay subtask is BLOCKED at its three-attempt limit; see [M910 notes](../../reference/screenshots/web-render/M910-walking-recovery-replay/attempt-notes.md) and its three retained Evidence IDs in [capture summary](../../reference/screenshots/web-render/M910-walking-recovery-replay/capture.json). The key-up-before-first-update explanation is an inference; this result does not establish an implementation defect.

## Verification and limits

- Vitest: 35 files / 229 tests passed. Typecheck passed. Production build passed; the larger JavaScript chunk is 1,411.77 kB minified and Vite retains its >500 kB warning.
- The M97 runtime scenario is a seeded level-1 Ronin, not natural progression. M1062 provides a targeted browser observation of the double-recovery branch, but it is a seeded web scenario with no J2ME comparison. M1081 observes one `+32,767` HP pulse during sustained walking on an enemy-free Map0 preview: the hero changes tiles from `(6,22)` to `(10,22)` during the same held-input segment as the pulse. This verifies a current-web walking pulse, not its cadence under enemy pressure or J2ME timing. M910's New Game-to-Map27 route remains blocked after three attempts and is not reopened by M1081. Exact emulator timing, other classes, and long-term recovery during every game mode remain unverified ([M1081 notes](../../reference/screenshots/web-render/M1081-map0-walking-recovery/attempt-1/evidence-notes.md)).
