# FND-0015 — Enemy melee attack timing and player damage

## Scope

Connect the source attack state for ordinary enemy behaviors 0 and 1 to the player HP field, using the extracted attack animation and the fresh-game Ronin's starting defense profile.

## Baseline and evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{i,ak,an,n}.java`.
- Runtime baseline: R10 source snapshot has Ronin HP 72, `f59f=3`, and `o=0`; the earlier 72-versus-74 screenshot discrepancy is still unresolved.
- Resource baseline: extracted `web/public/assets/generated/enemy-animations/catalog.json` and `enemy-data/data0.json` from the pinned JAR.

## Verified source facts

- `ak.i()` allows behavior 0/1 to start an attack when `p` is zero and the player occupies the cell directly ahead. `ak.q()` enters state 3, resets `p` to `i.i + 1`, loads the action delay `i.h`, and resets the animation cursor to frame 0. `ak.o()` calls `ak.j()` during that state; `ak.j()` invokes player damage when `k == i.f256a[m] - 1`.
- `i.a(byte)` loads the attack animation duration from the state-3 `/enm/spr/N` sequence payload. For enemy 24 the extracted attack track has five frames; `i.f256a[24]` is 3, so its impact frame is index 2.
- `an.a(ak,short,byte)` ignores hits while the player is in source states 5 or 6. Otherwise the evasion threshold is `clamp(f59f + o - enemy.evasion + 10, 8, 60)`. A non-evaded hit rolls `enemy.attack ± floor(enemy.attack / 10)`, subtracts `f65i` or `2*f65i` when the source double-defense flag is active, and clamps resulting damage to zero.
- `an.n()` derives `f65i` from the five equipment slots, the class attribute term `(f57b + equipmentModifier) / 5`, and `level / 3`. The fresh class-6 Ronin has defense 5 with the pinned starter gear; each third level adds the source level term while other equipment and attribute modifiers remain unchanged.
- The source type-1 branch has an additional 15% status event (event code 7) after a non-evaded hit. The status event meaning and effect are not mapped here.

## Browser implementation

- `EnemyCombatant` stores the attack cooldown, animation duration, and whether the impact frame has been consumed. The current AI begins basic melee only for behavior types 0/1, displays state-3 attack frames, consumes the source impact frame once, then returns to idle. Its pursuit and cooldown integration is still a partial model of the source's full action-delay loop.
- `resolveEnemyMeleeDefense` ports the source evasion and incoming damage arithmetic. `WorldScene` applies the result to the current Ronin HP, redraws the HUD, and shows a damage number at the player tile. The profile uses fresh-game Ronin equipment, the observed evasion fields, and the current level term.
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

The browser replay does not isolate an individual enemy's internal state or compare its timing, damage roll, or animation frames against J2ME. The controlled source replay reached a nearby behavior-1 enemy but produced no attack and showed no cooldown progress. The behavior-1 poison status path is implemented in [FND-0019](FND-0019-player-poison-status.md), but its timing/RNG comparison against J2ME remains open. Other heroes, equipment and attribute changes, offscreen culling, and source RNG sequence comparison also remain open. The source facts above are static decompilation/resource evidence, not an observed enemy attack in the J2ME runtime. The HP-zero delay and game-over transition are now implemented from static source evidence, but lack a controlled runtime comparison; see [FND-0016](FND-0016-game-over-flow.md).
