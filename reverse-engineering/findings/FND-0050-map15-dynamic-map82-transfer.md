# FND-0050 — Map-15 dynamic marker activates the map-82 transfer

## Question

Does map 15's transfer script to map 82 have a selectable trigger after the linked `cf` hazard dies, even though the extracted base collision grid contains no marker-1 cells?

## Evidence and method

- Read only checked-in decompiled Java, generated class-6 map-15 collision/event JSON, and the web implementation/tests. No JAR, browser, browser storage, or in-game save was accessed for this finding.
- `FND-0041` records the source `cf.l()` callback: after its death counter reaches zero, it writes collision value 1 to x=6–9 and y through y+2. The source-created `cf` is at map tile `(7,7)`, so these writes cover `(6..9,7..9)`.
- `web/public/assets/generated/event-operations/6/15.json` has trigger group 1 row `[0,0,0,255,0,0,0]`: type 0, both game-flag predicates equal 0, and no item gate. Its script 0 is `[[7,82,0],[8,7,14],[99,0,0]]`, transferring to map 82/tile `(7,14)`.
- `WorldScene.advanceEnemyDeathLifecycle()` applies the settled `cf` writes to the current map's collision object. On a movement boundary, `tryMapTransition()` calls `tryCurrentCellAutomaticEvent()`, which reads that mutable collision cell and resolves it through `tryTypeZeroMarker()` as type 0.
- The regression in `web/tests/source-map15.test.ts` loads the checked-in collision and event JSON, advances the source death delay, applies the source writes, selects the marker-1 transfer with game flag 0, and confirms the script passes `canRunEventCutscene()`.

## Conclusion

The M277 static scan correctly found no marker-1 cell in map 15's base grid, but it omitted the dynamic collision write performed by `cf.l()`. After `cf` death settles, the source-backed web model has marker-1 cells whose type-0 row selects the map-82 transfer, conditional on game flag 0. This corrects M277's conclusion that no active map-15 route existed in the extracted class-6 model.

## Limits

This is source/data/test evidence for the modeled event route. The integration test does not run a live `WorldScene` movement or transition. M169 directly seeds and defeats `cf` in a controlled browser capture and observes the collision writes; M488 later observes the live map-82 transfer after a seeded `cf` death state, but not a natural defeat. M226 reaches map 15 from a checkpointed map-42 state, not from an uninterrupted New Game route, and M228/M229 leave the encounter alive. Natural combat defeat, New Game-to-map-82 reachability, map-82 encounter behavior, and J2ME parity remain unverified.

M488 fills the live-transfer observation gap with a controlled browser setup. A fresh visible New Game reaches map 64; the test then invokes the current `WorldScene.transitionToMap()` path to load map 15 and seeds the player and `cf` death state in memory. The actual scene update loop settles `cf`'s 12 death updates and changes collision at `(7,8)` from 0 to marker 1. A visible ArrowRight input then runs the type-0 map-15 script and loads map 82 at `(7,14)` with five enemies. A separate 312-HP approach probe reaches 0 HP as `cf` enters attack state 3 within a 420 ms Up hold; the exact lethal hit was not captured. M488 does not show a natural `cf` defeat, an uninterrupted New Game route, the map-82 encounter outcome, or J2ME parity ([capture manifest](../../reference/screenshots/web-render/M488-map15-dynamic-transfer/capture.json), [route data](../../reference/screenshots/web-render/M488-map15-dynamic-transfer/route.json), [map-82 capture](../../reference/screenshots/web-render/M488-map15-dynamic-transfer/07-map82-after-marker.png)). No app save/load, browser-storage inspection, or JAR inspection was used.
