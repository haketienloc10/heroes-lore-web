# FND-0051 — Special boss death animation selection

## Scope

Render special `au` enemy subclasses through their source state-5 death countdown, including the source's per-facing fallback from a missing death track to idle.

## Source evidence

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source inspected: checked-in decompilation of `reverse-engineering/decompiled/sources/defpackage/{au,ak,aq,af,bc,cc,cf,bu}.java`; generated boss animation catalog under `web/public/assets/generated/boss-animations/`.
- `au.d()` increments the source frame cursor, then runs the inherited state update, path update, and timer update. It continues to do this while the inherited lifecycle state is 5.
- `au.a(Graphics,...)` maps source state 2 to boss animation slot 1, state 3 to slot 3, state 5 to slot 2, and the default/standing state to slot 0. It checks the selected directional track; if that track is absent, it draws slot 0 for that facing.
- `ak.b(int)` enters state 5 with `k = -1`; `au.a(int,byte)` enters state 5 with `k = 0`. These are distinct source damage paths and their cursor starts must not be collapsed.
- `cf.k()` clamps its cursor at the final frame instead of wrapping. Other subclasses in this scope inherit `ak.k()`, which wraps using the idle frame count during state 5.
- The generated boss catalog contains a state-2 death track for map-15 `cf` (`/boss/spr/3_39`). Map-11 `cb`, the map-13 actors, map-15 `az`/`aj`, and map-82 `bu` have sparse records where the source renderer falls back to idle for the facing used by that actor.

## Browser implementation

- M296 adds `sourceBossDeathSpriteState()` to select state slot 2 only when the requested facing has that track; otherwise it returns idle slot 0.
- `WorldScene` now advances and redraws every `sourceAu` death-pending actor during its removal countdown. It preserves `cf`'s source clamp behavior; the other special actors wrap on the selected death or idle track.
- The direct `ak.a(int,byte)` skill-damage path now retains source cursor 0 on lethal damage. Basic attacks, counter damage, and instant-kill damage that call `ak.b(int)` retain the `-1` cursor and advance to frame 0 on the next source tick.
- Focused tests cover death-track presence/facing fallback and the direct-skill cursor. Full gates pass: 54 Vitest files / 435 tests, 40 converter tests, typecheck, production build (1,520.52 kB minified JavaScript; Vite's existing >500 kB warning), and `git diff --check`.

## Current-build browser observation

- M963's fresh visible max-level route defeats Map15 boss 39 and Map82 boss 42 with Skill 1. Their post-hit runtime snapshots show 0 HP and `death-pending`, and the route proceeds through the post-boss handoffs. See the [Map15 snapshot](../../reference/screenshots/web-render/M963-max-level-map11-map13/map15-boss-reapproach-and-skill1.runtime.json) and [frame](../../reference/screenshots/web-render/M963-max-level-map11-map13/map15-boss-reapproach-and-skill1.png), plus the [Map82 snapshot](../../reference/screenshots/web-render/M963-max-level-map11-map13/map82-boss-skill1.runtime.json) and [frame](../../reference/screenshots/web-render/M963-max-level-map11-map13/map82-boss-skill1.png).
- These snapshots use runtime format v4 and do not expose the selected death/idle animation track or frame cursor. They verify live special-boss hit/death-state and route continuation, not the death animation sequence.

## Limits

M963 supplies browser evidence for special-boss hit/death-state and route continuation, but no browser sample tracks the death frames through the countdown and no J2ME animation comparison exists. The selected frame cadence and pixel parity remain unverified.
