# FND-0015 — Enemy melee attack timing and player damage

## Scope

Connect the source attack state for ordinary enemy behaviors 0 and 1 to the player HP field, using the extracted attack animation and the fresh-game Ronin's starting defense profile.

## Baseline and evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{i,ak,an,n}.java`.
- Runtime baseline: R10 source snapshot has Ronin HP 72, `f59f=3`, and `o=0`; rereading the original R02 Status frame confirms 72/72, so the earlier 74/74 transcription was incorrect ([frame](../../reference/screenshots/M15-SCN-0005-P1M-R02/14-status-final.png)).
- Resource baseline: extracted `web/public/assets/generated/enemy-animations/catalog.json` and `enemy-data/data0.json` from the pinned JAR.

## Verified source facts

- `ak.i()` allows behavior 0/1 to start an attack when `p` is zero and the player occupies the cell directly ahead. `ak.q()` enters state 3, resets `p` to `i.i + 1`, loads the action delay `i.h`, and resets the animation cursor to frame 0. `ak.o()` calls `ak.j()` during that state; `ak.j()` invokes player damage when `k == i.f256a[m] - 1`.
- `ak.a(Graphics,...)` refreshes `f` from the sprite's viewport bounds. `ak.d()` increments its animation cursor and advances attached `ce` statuses first; when the last paint left `f` false, either axis distance to the player exceeds `i.g`, and retained target `c` is null, it returns before decrementing hit-reaction state or running `n()`, `e()`, and `o()`. This pauses ordinary actor movement, attack callbacks, and death progression offscreen while status timers continue.
- `i.a(byte)` loads the attack animation duration from the state-3 `/enm/spr/N` sequence payload. For enemy 24 the extracted attack track has five frames; `i.f256a[24]` is 3, so its impact frame is index 2.
- `an.a(ak,short,byte)` ignores hits while the player is in source states 5 or 6. Otherwise the evasion threshold is `clamp(f59f + o - enemy.evasion + 10, 8, 60)`. A non-evaded hit rolls `enemy.attack ± floor(enemy.attack / 10)`, subtracts `f65i` or `2*f65i` when the source double-defense flag is active, and clamps resulting damage to zero.
- After a non-evaded hit, `an.a(ak,short,byte)` sets the one-paint response fields `r=1` and `s=attackerDirection`. `an.a(Graphics,int,int)` offsets Ron's draw position by two pixels along that direction and clears `r` before drawing. For nonlethal damage, the hit method does not reset the active attack-chain array or stage; this was cross-checked with `javap -classpath original/heroes-lore-v2.1.2.jar -c -p an`.
- `an.n()` derives `f65i` from the five equipment slots, the class attribute term `(f57b + equipmentModifier) / 5`, and `level / 3`. The fresh class-6 Ronin has defense 5 with the pinned starter gear; each third level adds the source level term while other equipment and attribute modifiers remain unchanged.
- The source type-1 branch has an additional 15% status event (event code 7) after a non-evaded hit. The status event meaning and effect are not mapped here.

## Browser implementation

- `EnemyCombatant` stores the attack cooldown, animation duration, and whether the impact frame has been consumed. The current AI begins basic melee only for behavior types 0/1, displays state-3 attack frames, consumes the source impact frame once, then returns to idle. M318 corrects the aligned walking-boundary order so the source attack check happens before the pathfinder's raw fallback draw. Pursuit and cooldown integration remain a partial model of the source's full action-delay loop.
- `resolveEnemyMeleeDefense` ports the source evasion and incoming damage arithmetic. `WorldScene` applies the result to the current Ronin HP, redraws the HUD, and shows a damage number at the player tile. The profile uses fresh-game Ronin equipment, the observed evasion fields, and the current level term.
- M141 queues the source attacker-facing direction after non-evaded ordinary-enemy, boss, and projectile hits, then consumes its two-pixel offset on the first subsequent hero render. It leaves the player combo state untouched, matching the nonlethal source path. The `/img/atteff1` frames currently extracted by the converter are 1×1, so no visible `av(6)` impact sprite is claimed.
- M150 carries the last-painted viewport result as source `ak.f`. Ordinary enemy updates now preserve the source early return when an enemy is offscreen, outside the source acquisition bounds, and has no retained target; status pulses remain ahead of that return, while reaction timers, movement, attack impacts, and death ticks pause. Three focused tests cover viewport margins, pause/continue behavior, and status pulses during the offscreen return.
- At HP 0, the web scene stops movement and begins the source-derived delayed game-over sequence. See [FND-0016](FND-0016-game-over-flow.md); the distinct actor death animation is not reproduced.

## Controlled browser observation

- Evidence: [M37 capture](../../reference/screenshots/web-render/M37-enemy-melee/capture.json), REA evidence ID `ev_42769af49166358d39d7bc70955b498fdb69f1d5709e40fd3f79f5a5d25eec37`.
- A valid local save seeded map 27 at tile `(9,5)`, facing east, with the fresh Ronin at 72/72 HP. With no further player input, the gameplay HUD showed 68 HP at 2.4 seconds after loading and 54 HP at 3.6 seconds; the later screenshot also shows a `4` damage popup. This confirms that the browser attack loop reaches the player-damage and HUD path during a nearby-enemy encounter.
- Chromium reported no page exceptions. The console recorded WebGL readback performance warnings and one generic 404 error without a captured URL. Network events were not selected for this comparison scenario.

## Source-runtime observation

- Evidence: [FreeJ2ME R11 manifest](evidence/milestone-1.5/runtime-20261021/M15-SCN-0005-P1M-R11/manifest.json). It uses the same SHA-pinned game JAR and the established FreeJ2ME-Plus 1.52 P1M profile.
- The fresh-Ronin route reached map 27 with the player at `(8,30)`, facing east, beside behavior-1 enemy 24 at `(9,30)`, facing west. Read-only primitive snapshots 5.248 seconds apart showed the source player HP field at 72 both times. Enemy 24 remained in state 1 with its `p` cooldown field at 4; a later idle snapshot retained those values.
- No source attack or damage was observed. Because the source enemy state/cooldown did not advance in this window, the replay does not establish attack timing and cannot be treated as a source parity comparison. The cause of the stalled state is not known.

## Limits

The browser replay does not isolate an individual enemy's internal state or compare its timing, damage roll, or animation frames against J2ME. The controlled source replay reached a nearby behavior-1 enemy but produced no attack and showed no cooldown progress. The behavior-1 poison status path is implemented in [FND-0019](FND-0019-player-poison-status.md), but its timing/RNG comparison against J2ME remains open. Other heroes, equipment and attribute changes, and source RNG sequence comparison also remain open. M150/M309/M310 document the ordinary versus special-actor offscreen update split and guard both ordinary-AI helper entrypoints; these are static-source and unit-test results, not J2ME update-timing parity. The HP-zero delay and game-over transition are likewise implemented from static source evidence without a controlled runtime comparison; see [FND-0016](FND-0016-game-over-flow.md).
