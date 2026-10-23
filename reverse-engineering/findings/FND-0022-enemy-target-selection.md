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

## Browser gap

- `PlayerActor` stores one pixel position and facing/movement state. `EnemyPursuitContext` receives only `playerTileX` and `playerTileY`, and pursuit always chooses that coordinate. There is no player action timeline or enemy target-reference field in the current model (`web/src/world/actor.ts`, `web/src/world/enemy-ai.ts`).
- M44 supplies the Java-compatible bounded RNG helper needed for the selector roll, but that alone does not reproduce the selector's call conditions or target lifetime.
- The current project does not yet implement the source skill/action lifecycle, so no browser runtime claim is made for this selector path.

## Conclusion and limits

The source selection rules and action-object timing are identified, but behavior remains unported. Implement the source action state and stored action coordinate alongside skill activation, then carry enemy target identity through pursuit before claiming parity when the player moves or uses an action. This finding is static source analysis only; it contains no new browser capture, emulator comparison, or runtime observation. Full-game completion remains governed by the [ROADMAP](../../ROADMAP.md).
