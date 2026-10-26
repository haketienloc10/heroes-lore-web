# FND-0055 — Event movement updates actors and NPCs, not the full map pass

## Question

Which gameplay systems advance during source mode-4 movement commands and opcode-4 waits?

## Reference and checked source

- Reference build: Heroes Lore: Wind of Soltia v2.1.2, pinned JAR SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Evidence inspected: the repository's existing JADX source output. This milestone did not open or execute the JAR and did not run a J2ME runtime.
- Method path: `reverse-engineering/decompiled/sources/defpackage/ar.java:94–99` selects mode 4; `m.java:330–337,467–474` distinguishes `m.i()` from `m.n()`; `ad.java:863–875` distinguishes `ad.b()` from `ad.c()`; `ag.java:208–236,402–433` contains the event movement handler.
- Browser implementation: `web/src/world/source-world-update.ts` and `web/src/rendering/WorldScene.ts`.

## Verified source behavior

- `ar.paint()` mode 2 calls `m.i()`. That method updates the hero and attached active skill through `m.n()`, then calls `ad.b()` for the ordinary full map pass.
- Mode 4 calls `m.j()`; its movement state runs the event command handler, then `m.n()` and `ad.c()`.
- `m.n()` updates the hero, updates its attached active skill when present, and registers that skill with the map. `ad.c()` invokes the NPC update path. `ad.b()` additionally runs the map's other update work; it is not called from the mode-4 movement state.
- Opcode 4 initializes a counter to `argument - 1`. The state-1 handler still reaches `m.n()` and `ad.c()` on that same mode-4 update. When the counter reaches zero, the event runner advances the command index and returns; the next command runs on a later mode-4 update. See [FND-0053](FND-0053-ordered-event-modal-timing.md) for the wait boundary.

## Conclusion and implementation

- M325 adds separate `full`, `actor-and-npc`, and `paused` scopes. During mode-4 movement and opcode-4 waits, the browser advances hero movement/status, active-skill actions, and scripted NPC movement while keeping the ordinary enemy, projectile, ground-drop, and full map simulation delta at zero.
- Dialogue, choice, flash/shake, and interpreter-only back-edge waits stay paused. Visible map draw cursors continue on M323's separate source paint clock.
- Tests assert that event movement selects actor/NPC scope and produces actor delta while full gameplay delta is zero.

## Verification and limits

- M325 full gates: 58 Vitest files / 477 tests, TypeScript typecheck, production build (1,532.97 kB minified JavaScript chunk; existing Vite >500 kB warning), 41 Python converter tests, `git diff --check`, and event/enemy/hero/NPC coverage audits.
- No browser, browser storage, in-game Save Game, actual JAR, or J2ME runtime was used for M325. The split is checked-in-source-backed, but movement timing, visible enemy state, and overall event presentation remain unverified against a J2ME capture. See the [roadmap](../../ROADMAP.md).
