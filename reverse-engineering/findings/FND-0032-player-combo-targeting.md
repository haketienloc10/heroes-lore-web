# FND-0032 — Player combo target patterns

## Question

Which map cells can each player combo impact query for enemies?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static JADX inspection of `an.b()`, `an.c()`, `an.m14d()`, `n.m108a()`, `n.m109a(byte)`, `n.a(byte,cj)`, `cj.a(direction,distance)`, and the direction arrays in `t`. Archive presence and hash evidence are recorded in FND-0031. This is source analysis, not a J2ME runtime comparison.

## Source behavior

- `n.m108a()` looks one cell in the hero's current cardinal direction. `n.m109a(byte)` looks at a cell selected by `t.f290a` and `t.b`, including diagonals. The cell lookup returns the entity stored there; `n.a(direction,distance)` queries cardinal cells at an explicit distance. The lookup spans the entity's configured horizontal footprint, so a wide enemy may be returned by more than one cell query.
- Class 6 uses a three-cell forward fan (forward, `t.d[direction]`, then `t.c[direction]`) for light stages 1–2 and heavy stage 0. The source suppresses the second target when it equals the first, and suppresses the third only when it equals the second. Heavy stage 4 frame 1 queries all eight surrounding cells in direction-code order 1–8 without de-duplication; its frame-6 impact queries only forward. Other implemented class-6 impacts query forward.
- Class 7 uses the same three-cell fan for light stage 3. All other impacts query one and then two cells along the facing direction. A wide enemy occupying both cells can therefore receive two calls.
- For class-6 heavy stages 2–3, `an.b()` first queries the adjacent target, then chooses a 32-pixel move only when the adjacent collision value is exactly zero and `ad.a(twoCellsAhead)` succeeds; otherwise it tries `ad.a(oneCellAhead)` and moves 16 pixels if clear. `ad.a(x,y)` checks map bounds, nonnegative collision, and an empty entity-grid cell (`ad.java:998–1000`). The two-cell branch does not test entity occupancy of the intermediate cell, so it can pass over an actor there when the adjacent collision byte is zero. Stage 3 then issues another forward target query from the updated position if the move succeeded (`an.java:494–514`). Class 8 heavy stages 2–4 create a `h` projectile using effect rows `cd.b[0..2]`; their damage is delayed until projectile collision. Other class-8 impacts query forward immediately.

## Web implementation

- `player-attack-targeting.ts` reproduces the class-6 fan and eight-cell order, and class-7 fan/two-cell query order. It treats the source two-cell enemy width and half-tile occupancy when resolving queried cells. The scene resolves each returned occurrence in order and stops processing an occurrence if an earlier hit killed that enemy.
- M75 also models class-6 heavy stages 2–3 movement: a two-cell move is selected when the first collision value is zero and the destination cell is open; otherwise a one-cell move is attempted. Stage 3 queries forward again from the moved position.
- M316 extracts the ordered class-6 lunge result into `resolveSourceClassSixLungeImpact()`, used by `WorldScene` after the initial impact targets resolve. It returns the source-selected distance/destination and only produces a new forward target query for heavy stage 3. Regressions cover the initial forward target, a two-cell move past an occupied intermediate cell when its collision value is zero, the blocked-destination one-cell fallback and its follow-up target, and no follow-up for stage 2 or a blocked lunge. These are static-source and unit-test checks; they do not provide live combat or J2ME evidence.
- M135 ports class-8 heavy stages 2–4 as delayed projectile chains. It captures attack power and critical state at launch, checks the segment's occupied cell at source frame 1, and creates up to two further segments at frame 2 while each next cell remains inside the map. M136 carries the selected weapon proc through the chain and resolves the active-skill element at collision, matching the retained player reference in source `h`. The segment moves without checking terrain, matching `h.a()`'s bounds-only continuation. The source animation tail is not drawn: the pinned archive has no `c3/s/ea2`, `ea3`, or `ea4` members, so their `cd.b[0..2]` frame streams are not available to the current asset converter.
- Focused Vitest coverage checks fan order, repeated wide-enemy hits from two queried cells, and the eight-direction heavy sweep. Static source behavior and web behavior remain distinct from runtime parity evidence.

## Limits

- No browser capture confirms class-6 displacement or its optional second hit, nor class-8 projectile damage in a live scene. M316 adds an integrated pure-resolution helper and focused branch tests but does not close that runtime evidence gap. M135/M136 port class-8 projectile gameplay, including proc and active-skill element inputs, but the projectile sprite is not rendered because the referenced effect rows are absent from the pinned archive. Skill/buff visuals remain open; proc and status source parity has no J2ME comparison ([FND-0042](FND-0042-weapon-procs-and-enemy-statuses.md)).
- No browser capture confirms visible multi-target damage, and no J2ME comparison has been made.
