# FND-0020 — Enemy idle wandering

## Scope

Port the enemy's no-target idle/random movement branch using the pinned source and keep its limits explicit.

## Evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{ak,n,cj,ad,t}.java`.
- Bytecode cross-check available with `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ak n`.

## Verified source facts

- `ak.i()` calls `ak.r()` when its action delay permits choosing a path but the player target selector returns no target. The random path is therefore a no-target action, not a patrol route.
- `ak.r()` first reads `Random.nextInt()`. A positive result sets source state 2 (movement). A non-positive result calls `ak.a(true)`, which sets state 1, sets action delay `o = i.h + r`, clears retarget progress `r`, and randomizes attack cooldown `p` as `(i.i + 1) * roll(1..7) / 10`. Both branches then choose a direction using `(Random.nextInt() & 255) % 4 + 1`. `javap -p -c ak` confirms the sign branch, helper calls, and low-byte direction calculation.
- Direction values 1–4 are north, south, west, and east. `n.e()` then moves state-2 enemies by an 8-pixel update after its movement/collision check.
- `ak.h()` runs for a moving enemy at a full-tile boundary. It stops and calls `ak.a(false)` when `r >= 2 * i.h` or the next random integer is non-positive; otherwise it adds `i.h` to `r`, clears `o`, and asks `ak.i()` to select the next action. `ak.o()` decrements `p` and `o` in idle state 1, but not in movement state 2.
- The source record fields and inspected `ak` branch expose no patrol waypoint list. This does not establish that no separate patrol mechanism exists elsewhere in the game.

## Browser implementation

- The initial M42 implementation reversed the source sign branch and assigned the 1–7 cooldown roll to movement. M43 corrects the polarity, initializes the source action delay, counts idle delay updates, and accumulates the `ak.h()` retarget counter up to its two-interval limit. The movement branch now preserves `p`; the idle branch rolls `p` and resets `r`/`o`. A source delay is initialized from `i.h` for newly created and respawned enemies.
- Seven deterministic Vitest cases cover branch polarity, cooldown and action-delay rolls, cooldown ticking, collision, the initial action delay, and retarget progression/limit. The [M42 capture](../../reference/screenshots/web-render/M42-enemy-idle-wandering/capture.json) predates the polarity correction; its observed movement is historical browser evidence for the earlier implementation and does not verify the corrected branch or timer cadence.
- M100 adds the distinct active player-action target and retained actor/action references described in [FND-0022](FND-0022-enemy-target-selection.md). M302 covers the selector miss case: an in-range state-2 action misses the 7-in-10 roll while its moving player's tile is outside enemy acquisition bounds, so `ak.i()` has no target and calls `ak.r()`.
- M43 checks: Vitest passes 20 files / 120 tests, converter tests pass 26/26, `npm run typecheck` passes, and `npm run build` passes. The minified bundle is 1,304.54 kB and Vite reports its 500 kB chunk warning. A new REA browser capture attempt failed before returning scenario evidence (`execution_failure`; cleanup reported no resources but could not confirm provider cleanup). The local `rea doctor` command is unavailable, so no corrected runtime or J2ME comparison is claimed.
- M44 moves Java random stream and range-helper details to [FND-0021](FND-0021-source-random-streams.md); it preserves M43's branch/timer model while correcting the raw-vs-bounded draw channel and path-choice consumption.

## Limits

This is a bounded port of the static `ak.r()`/`ak.h()` timing around the pursuit and target-reference model. M100 includes the separate player-action target and retained actor/action references; M302 covers the active-action selector miss that can call `ak.r()` while the player actor is outside acquisition bounds. Target selection has not been observed in a browser/J2ME comparison. The M42 screenshots show the earlier code and do not expose individual enemy coordinates, frame state, or RNG outcomes. The source may have other patrol behavior outside the inspected path. M150 adds the ordinary `ak` offscreen early return using viewport and target state, but there is no J2ME comparison; special actors, exact default RNG position, blocked half-step parity, and map-specific encounters remain open.
