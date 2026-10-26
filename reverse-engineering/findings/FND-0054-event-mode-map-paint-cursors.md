# FND-0054 — Event mode still paints the map and advances draw cursors

## Question

When event text pauses player/map updates, does the source still draw the map and advance its visible actor cursors?

## Checked-in source evidence

- Scope is the repository's existing JADX output. No JAR or runtime was accessed for M323.
- `reverse-engineering/decompiled/sources/defpackage/ar.java:91–102` handles source mode 4 by calling `m.j()`, then `ag.m12b()` and `ag.a(graphics)` while mode 4 remains active.
- `reverse-engineering/decompiled/sources/defpackage/ag.java:780–810` draws `m.f269a.a(graphics)` when the screen is not blank; blank/flash presentation fills the screen instead.
- `reverse-engineering/decompiled/sources/defpackage/ab.java` and `av.java` contain the post-draw cursor increments for NPC and emotion sprites. `ad.a(Graphics)` is the map renderer invoked from the event draw path.
- FND-0004 establishes the 71 ms default gameplay scheduler/paint/update cadence. The source mode-4 paint path uses the same Canvas/scheduler structure, but its independent runtime cadence was not measured.

## Conclusion and implementation

- Modal event text can hold gameplay simulation while still painting the map. Visible NPC, emotion, enemy viewport, and attached-skill cursors therefore need source-paced post-render passes; screen-blank/flash paints do not draw those map actors.
- M323 adds a separate 71 ms source paint clock, independent of the paused simulation delta. During visible fallback or ordered event-map paints, its pending passes feed the existing Phaser `POST_RENDER` cursor updates. It leaves actor movement, combat, and map simulation paused.
- Tests cover sub-period remainder, boundary completion, and batched paint passes.

## Verification and limits

- The clock and integration are unit/type/build checked, without a browser or J2ME comparison. The 71 ms mode-4 paint cadence is source-structure-backed but not independently runtime-measured; screen compositor behavior remains open.
- Full M323 gate results are recorded in [ROADMAP.md](../../ROADMAP.md).
