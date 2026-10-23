# FND-0017 — Behavior-2 enemy lane attacks

## Question

How does an enemy with behavior type 2 attack, and how far has the browser port reproduced that path?

## Reference and method

- Reference artifact: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Method: inspect JADX output for `ak.i()` and `ak.j()`, corroborate control flow with `javap -c -p -classpath original/heroes-lore-v2.1.2.jar ak`, inspect extracted enemy animation/data, then run a seeded browser replay.
- Relevant source: `reverse-engineering/decompiled/sources/defpackage/ak.java`; `ak.i()` selects an attack and `ak.j()` handles its impact frame.

## Source behavior

- When its cooldown field `p` is zero, behavior types 2 and 3 test the cells one, two, and three steps ahead along the enemy's current facing direction. A match enters the attack state through `q()`.
- At the configured impact animation frame, behavior type 2 repeats that same three-cell facing-lane check. On a match it creates visual effect type 9 (`av`) and calls the player damage method with the enemy and facing direction.
- At the corresponding impact frame, behavior type 3 instead creates projectile object `h` directed along the facing vector. This finding does not implement that projectile path.

## Browser implementation

- `enemyHasPlayerWithinFacingRange()` checks the same one-to-three-cell facing lane. `advanceEnemyBehaviorTick()` allows behavior types 2 and 3 to start their extracted attack animations after cooldown, and `WorldScene` checks the lane at the source-derived impact frame and applies the enemy damage resolver to Ronin HP and the HUD.
- Tests cover the three-cell alignment, rejection of an off-lane target, and attack-track selection for behavior types 2 and 3.
- M40 adds effect type 9 and behavior-3 projectile rendering/simulation from extracted `/enm/atef/N` streams; see [FND-0018](FND-0018-enemy-attack-effects-and-projectiles.md).

## Controlled browser observation

- Evidence: [M39 capture manifest](../../reference/screenshots/web-render/M39-behavior-2/capture.json).
- A seeded map-1 save placed the player at `(5,8)`, facing north, with 500/500 HP. Enemy 3 at `(5,5)` faced south, directly aligned with the player. After approximately 4.5 seconds with no player movement, the saved state contained 25/500 HP. The replay observed cumulative damage of 475 HP over that window; individual hit amounts, count, and timestamps were not isolated.
- Chromium recorded no JavaScript page exceptions. Console and network events were not collected.

## Limits

This is not a J2ME comparison and does not establish parity for attack timing, damage RNG, or visuals. The browser replay confirms that the behavior-2 encounter reaches player HP persistence, but it does not isolate one impact. Other attack/status behaviors and wider enemy-state parity remain open.
