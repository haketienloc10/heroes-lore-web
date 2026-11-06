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

## Current-build animation observation (M1033)

- DEV runtime format v8 exposes whether a combatant is a source `au` actor, its render sprite ID, the selected render animation slot, frame cursor, and remaining death updates. A DEV-only Map15 scenario starts class 6 at `(7,8)`, adjacent to boss 39, with the max-level profile.
- In an isolated Chromium run, visible Numpad5 input defeats boss 39 from 14,430 HP. The v8 samples report `sourceAu: true`, render sprite ID 295, death slot 2, direction 1, and frame indices 3–9 while the death counter falls from 8 to 0. The sampled actor remains `death-pending` at frame 9 and counter 0 afterward, with full 394,392/394,392 HP and zero browser errors.
- The final `death-pending` sample is consistent with the source lifecycle, not evidence of a stuck cleanup: `ak.n()` calls `l()` after the state-5 timer expires, and `cf.l()` writes collision value 1 across its 3×4 hazard footprint once. `cf.l()` does not call `au.l()`/`ak.l()`, so the boss remains as a corpse while the map collision marker settles.
- The probe returned exit code 1 because its final assertion incorrectly required the title scene to expose the gameplay-only `data-test-profile` attribute. The captured runtime satisfies the boss-death criteria; the corrected assertion is in the probe for future use. All three M1033 attempts are consumed; do not rerun this subtask without new evidence. The artifacts and criterion analysis are in the [M1033 attempt record](../../reference/screenshots/web-render/M1033-map15-boss-death-animation/attempt-3/analysis.json).

## Current-build Map82 fallback observation (M1039)

- M1039 attempt 1 exposed an asset-key mismatch: the source-created Map82 boss 42 used generic enemy sprite slot 1, whose idle track has one frame. The death countdown advanced, but its rendered cursor stayed at 0. The Map82 animation catalog entry is boss 4/enemy 42 and contains two seven-frame idle tracks for directions 1 and 2, with no death tracks.
- The browser now assigns render-only key 298 to `bu` and registers `/boss/spr/4_42` under that key. `sourceBossDeathSpriteState()` selects idle slot 0 for the Down-facing actor because no state-2 track exists; the same seven-frame idle track advances while the source death countdown runs.
- Attempt 2 uses visible New Game UI followed by the DEV max-level Map82 preview. Visible Numpad5 attacks defeat boss 42; runtime samples show render slot 0 and cursor sequence `2,3,4,5,6,0,1` as the death counter falls from 13 to 0 and the actor is removed. The level-99 player stays at full 394,392/394,392 HP, with zero browser errors. The focused source-map entity test (6 tests), typecheck and `git diff --check` pass.
- This is one current-web animation observation with a DEV-seeded map preview. The isolated Chromium profile is deleted; no save files, browser storage, in-game Save/Load, or original JAR are accessed. It does not establish J2ME frame-pixel/timing parity or other boss directions.

## Current-build Map11 fallback observation (M1074)

- M1073's three attempts did not reach a death sample. They showed that Map11 `cb` uses custom `sourceCbAi` state and ignores the generic action-delay fixture; M1073 remains blocked and its retry count is unchanged.
- M1074 uses a separate DEV-only scenario that initializes `sourceCbAi` in idle state with 900-tick attack and movement cooldowns. Visible max-level New Game input defeats boss 32 from 1,960 HP. Runtime samples report facing direction 2, `sourceAu: true`, render sprite 256, and render slot 0 throughout the death countdown. The idle cursor cycles `2,3,4,5,6,7,0,1`; countdown reaches zero and the boss is removed. The level-99 hero stays at full HP and browser errors are zero.
- This confirms the current web renderer's Map11 Down-facing idle fallback using a controlled source-AI fixture. It does not establish natural boss movement/reachability, other facings, or J2ME timing/pixel parity ([M1074 notes](../../reference/screenshots/web-render/M1074-map11-boss-death-fallback-controlled/evidence-notes.md), [attempt 1](../../reference/screenshots/web-render/M1074-map11-boss-death-fallback-controlled/attempt-1/result.json)).

## Limits

M1033 observes the current web's selected death track, frame cursor, and countdown for Map15 boss 39. M1039 observes Map82 boss 42's Down-facing idle fallback cycling through frames `2,3,4,5,6,0,1`; M1074 observes the Map11 Down-facing idle fallback cycling through frames `2,3,4,5,6,7,0,1`. Both reach countdown zero and actor removal. These are DEV-seeded current-web observations and do not compare frames or timing with J2ME. Other special-boss directions, other idle fallback tracks, and source-runtime animation parity remain unverified ([M1039 attempt 2](../../reference/screenshots/web-render/M1039-map82-boss-death-animation/attempt-2/result.json), [M1074 attempt 1](../../reference/screenshots/web-render/M1074-map11-boss-death-fallback-controlled/attempt-1/result.json)).
