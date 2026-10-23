# FND-0034 — Campaign flag gates on the map-62 route

## Question

Which extracted event scripts set the gate flags used around map 62, and which flags or items do their source trigger tables require?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Compared generated `/event-operations/6/{map}.json` trigger rows and three-byte commands with the corresponding collision-grid marker positions. Opcode 9 uses `second & 3`: 0 sets a game flag, 1 clears it, and 2 toggles it.
- M87 is a controlled browser replay seeded at map 62/tile `(24,9)` with flag 27. It shows the selected dialogue and destination scene, but the destination save was not persisted. See [M87 capture](../../reference/screenshots/web-render/M87-map62-flag27-branch/capture.json).
- M92 repeats the flag-27 branch in Chromium and saves the result at map 62/tile `(16,6)` with flags 27, 31, and 82. A separate browser run seeded from that post-script checkpoint walks north to map 53/tile `(19,38)` and saves there. See [M92 capture](../../reference/screenshots/web-render/M92-map62-flag82-to-map53/capture.json).
- The gate chain below is static source-data tracing. M92 does not establish that the preceding route is obtainable from New Game.

## Map-62 entry gates

- Map 62 marker `-3` at `(25,9)` has type-3 rows for game flag 31 → script 3 and game flag 27 → script 2. M87 and M92 reproduce the flag-27 dialogue. M92 saves script 2's result: flags 31 and 82 are set before transfer to map 62/tile `(16,6)`. Script 3 sets flag 82, clears flag 83, and uses the same destination.
- Under the flag-82 state, the north portal to map 53 is walkable from `(16,6)` in a separate seeded browser replay. The replay saves the destination at map 53/tile `(19,38)`; it is a checkpointed route result, not an uninterrupted campaign run.
- Map 62 marker 7 has a type-2 row gated by flag 84 → script 10. That script clears flag 84, sets flags 31, 82, and 85, then transfers to `(16,6)`. Marker 8 has a type-0 row gated by flag 85 → script 11, which clears flag 85 and sets flag 31.
- Thus the source data offers two relevant flag-31 routes: flag 27 through marker `-3`, or flag 84 through marker 7. Marker 8 is an additional flag-85-gated flag-31 script.

## Candidate flag prerequisites

- Map 67 marker 3 at `(10,17–18)` automatically selects script 2 when game flag 26 or 19 is present. Script 2 sets flag 27, then returns to map 60/tile `(20,10)`. Map 60 marker `-2` at `(19–20,8)` transfers to map 67/tile `(10,18)` with flag 0, so this is a possible branch once flag 19 or 26 is acquired.
- Map 71 marker 2 at `(10,18)` selects script 1 under flag 25. Script 1 sets flags 27, 77, and 84, and clears flag 25. Map 70's marker `-4` has a type-3 flag-25 row that transfers to map 71/tile `(10,18)`.
- One candidate path to that flag-25 gate is: map 10 marker 2/script 1 sets flag 15; map 63 marker 3/script 4 uses flag 15 to set 17; map 64 marker 2/script 4 uses flag 17 to set 18; map 63 marker 2/scripts 6 and 8 use flags 18 then 20 to set 19, 20, and 21; map 69 marker 3/script 4 uses flag 21 plus one category-18/item-0 to set 24; a later marker-3/script-6 interaction uses flag 24 to set 25. Map 69's marker `-2` then leads to map 70 under flag 25.
- A separate map-67 branch uses flag 19 directly to set 27. Map 69 script 5 can set flag 26 when its marker-3 type-2 gate sees flag 19, which also satisfies the map-67 branch. Both paths still depend on earlier flag and inventory prerequisites.

## Limits and next evidence

- M92 uses seeded, level-99 saves for both stages. Continuing north in the same browser session was combat-sensitive: a nearby enemy stopped one attempt at map 62/tile `(16,5)`, while a separate level-15 attempt ended at game over. The successful portal capture therefore proves the path from a seeded post-script checkpoint, not a normal-level enemy-safe walk.
- M93 seeds map 53/tile `(19,38)` at level 99 and follows the north corridor to `(19,23)`. Enemy contact interrupted the attempted route to the Blue Brick; later saves reached `(21,23)`, `(21,24)`, and `(25,22)` with flags unchanged and no pickup. The base collision grid has a 38-step path to the trigger-adjacent tile `(36,19)`, but M93 does not prove the live enemy-safe route. See [M93 capture](../../reference/screenshots/web-render/M93-map53-entrance-walk/capture.json).
- M95 diagnoses the attack checkpoint from `(19,23)`: after three east steps, four class-6 light impacts select data0 enemy 4 at `(22,23)`. Rolls 15 and 2 miss its threshold of 25; rolls 88 and 33 pass evasion but deal zero because the web's level-99 runtime still uses attack 16 against defense 39. The save has zero unspent attribute points, but allocated attributes are not represented in the current web player/save model. See [M95 diagnostic](../../reference/screenshots/web-render/M95-map53-combat-diagnostic/capture.json). This does not establish that a naturally progressed source character cannot damage the enemy.
- The map-10/63/64/69/70/71 candidate sequence, category-18/item-0 acquisition, and preceding map geometry have not been walked from an unseeded save. No J2ME comparison has been made.
- M96 now models and persists source attribute allocation, and M97 adds the source HP/SP recovery timers. The next useful route check is to continue the candidate map-10/63/64/69/70/71 flag path from an unseeded save, including the category-18/item-0 gate. Then use the resulting flags/loadout to continue map-62 access and the Blue Brick route without a seeded campaign checkpoint.
