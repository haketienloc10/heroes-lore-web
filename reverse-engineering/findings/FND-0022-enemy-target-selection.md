# FND-0022 — Enemy target selection and player action targets

## Scope

Record how an enemy retains or selects the player actor versus the active player action object, and identify the source state the browser still needs to model.

## Baseline and method

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{ak,an,o,cj,t}.java`.
- Inspected `ak.i()`, `ak.a(an,o)`, `o.a(boolean,byte,int,int)`, `o.e()`, `o.m113a()`, `an.m24a(boolean)`, and the web actor/pursuit context.
- Commands included `rg -n 'm113a|m23a|f284i|m24a' reverse-engineering/decompiled/sources/defpackage` and numbered source views with `nl -ba` for `ak.java`, `o.java`, `an.java`, `actor.ts`, and `enemy-ai.ts`.

## Verified source facts

- `ak.i()` keeps a reference to its current target in field `c`. When path delay `o` reaches zero, an enemy already targeting the active player action object (`an.m23a()`) continues toward it while that object's `f284i` state is 2. An enemy targeting the player actor continues toward the actor while `o.m113a()` is false. Otherwise it runs the selector and stores the chosen actor/action reference (`ak.java:198–242`).
- The selector uses independent horizontal and vertical bounds. An unprovoked enemy uses `i.g`; a provoked enemy uses 100 when `i.f259a` is set, or 8 otherwise. The action object is selected only when both its coordinates are in bounds, its state is 2, and the bounded `g.a(0,9)` result is below 7. If that does not select it, an in-bounds player actor is returned; otherwise the selector returns null (`ak.java:553–571`).
- Starting a player action stores its own coordinates at the player tile plus the current facing vector, then initializes action state 1 and per-action timing fields (`o.java:135–157`). State 1 advances to state 2 after ten updates; state 2 decrements the remaining action duration `l` and transitions to state 3 when it expires (`o.java:159–210`). Thus an active action has a coordinate and lifetime distinct from the moving player actor.
- `o.m113a()` returns `k - l < 10`; `ak.i()` uses that predicate when deciding whether a retained actor target continues directly (`o.java:98–100`, `ak.java:231–233`).
- `an.m24a(boolean)` starts one of these actions only when source guard `m.f269a.f7c` is true, a current action object exists, and that action is idle (`an.java:1032–1036`).

## Browser port (M100)

- `PlayerSkillActionState` now carries the action phase, source tile, facing, level slot, duration, effect age, cooldown counters, and the `o.m113a()` comparison. `EnemyCombatant.pursuitTarget` records `player`, `action`, or no target. Pursuit keeps an action target through source state 2, keeps an actor target when `o.m113a()` is false, and otherwise runs the source 7-in-10 action selector before falling back to the actor (`web/src/world/player-skill-action.ts`, `web/src/world/enemy-ai.ts`).
- The action selector and retained-reference branches have unit coverage. M100's two skill-0 levels have zero action duration. M101 adds skill ID 1's rank-1 effects with four-update state-2 durations; M102 adds the same active duration for skill ID 2 level 1; M104 adds skill ID 3 level 0 with a four-update state-2 duration; M105 adds skill ID 3 level 1 with a ten-update duration. The web model can present an active action during the source selection window, but no successful browser capture observes an enemy choosing that action reference.
- A controlled Chromium replay loaded map 19 at `(10,9)`, waited for the level-0 charge, and sent key `1`. It ended without page exceptions or console errors ([M100 capture manifest](../../reference/screenshots/web-render/M100-player-skill-action/capture.json), screenshot SHA-256 `16b48e3731ad291bf508c81c52093e0dacb99b30c4848a6c61416a56404ba341`). The capture does not expose enemy HP, action phase, hit count, or which target reference an enemy chose.

## Remaining gaps and limits

Rank-1 effects for skill IDs 0 and 1, both rank-1 levels of skill ID 2, and levels 0 and 1 of skill ID 3 have implementations. The remaining source skill levels, active-action visuals/status icons, and runtime confirmation of an enemy choosing a state-2 action remain open. The controlled replay is browser-only; it does not compare the web implementation with J2ME timing, damage, rendering, or target selection. Full-game completion remains governed by the [ROADMAP](../../ROADMAP.md).
