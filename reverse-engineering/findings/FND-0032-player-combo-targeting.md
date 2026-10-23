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
- Class 6 heavy stages 2–3 also move the hero forward by one or two cells when terrain/entity checks allow. Stage 3 can then issue another forward target query from the updated position. Class 8 heavy stages 2–4 create a `h` projectile using effect rows `cd.b[0..2]`; their damage is delayed until projectile collision. Other class-8 impacts query forward immediately.

## Web implementation

- `player-attack-targeting.ts` reproduces the class-6 fan and eight-cell order, and class-7 fan/two-cell query order. It treats the source two-cell enemy width and half-tile occupancy when resolving queried cells. The scene resolves each returned occurrence in order and stops processing an occurrence if an earlier hit killed that enemy.
- M75 also models class-6 heavy stages 2–3 movement: a two-cell move is selected when the first collision value is zero and the destination cell is open; otherwise a one-cell move is attempted. Stage 3 queries forward again from the moved position.
- Focused Vitest coverage checks fan order, repeated wide-enemy hits from two queried cells, and the eight-direction heavy sweep. Static source behavior and web behavior remain distinct from runtime parity evidence.

## Limits

- No browser capture confirms class-6 displacement or its optional second hit. Class-8 heavy projectile flight and collision remain absent; the current web resolver still uses the adjacent-cell path for those impacts. Element/status weapon procs and skill/buff actions are also open.
- No browser capture confirms visible multi-target damage, and no J2ME comparison has been made.
