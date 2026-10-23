# FND-0014 — Enemy acquisition and pursuit

## Scope

Map the source fields and update path that move nearby enemies, then drive the already decoded walking tracks from those states in the browser.

## Baseline and source

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{i,ak,n,cj,ad,t}.java`.
- Bytecode cross-check: `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ak n`.
- Browser implementation and tests: `web/src/world/{combat,enemy-ai}.ts`, `web/src/rendering/WorldScene.ts`, `web/tests/enemy-ai.test.ts`.

## Verified source facts

- The enemy record's packed low two bits become `i.d`; the three following behavior bytes become `i.g`, `i.h`, and `i.i`. The record's status bit 3 becomes `i.f259a`. This follows `i.a(byte[],byte,byte)`; the converter already preserves these raw values.
- `ak.i()` checks the current facing target when its attack cooldown `p` reaches zero. Behavior types 0/1 check the cell ahead; types 2/3 scan three cells for a target (`javap` offsets 9–110). When the action delay `o` is zero, it calls inherited `n.a(cj,byte)` with approach distance 1 for types 0/1 and 3 for types 2/3 (offsets 110–218).
- The private target selector in `ak` compares the enemy and candidate's horizontal and vertical tile distances independently against `i.g`. After the enemy has been hit, it uses range 100 when `i.f259a` is set, or 8 otherwise. These are axis-aligned bounds, not a circular distance.
- `n.a(cj,byte)` chooses a major-axis direction, uses collision checks, tries source diagonal/side fallbacks, and finally has a random direction fallback. A tie between equally viable axes also uses the source random generator.
- When `ak.i()` has no selected target, `ak.r()` reads a raw random integer: a positive value selects movement state 2; a non-positive value calls `ak.a(true)`, which selects idle state 1, resets retarget progress, sets action delay `i.h + r`, and randomizes attack cooldown from `i.i` with a 1–7 roll. Both branches then choose direction using `(value & 255) % 4 + 1`. `javap -p -c ak` confirms the branch and direction arithmetic. This is free wandering, not a waypoint route.
- `ak.h()` controls movement retargeting at full-tile boundaries: it stops when accumulated `r` reaches `2 * i.h` or its random integer is non-positive; otherwise it adds `i.h` to `r`, clears `o`, and calls `ak.i()`. `ak.o()` decrements `p` and `o` in state 1, while movement state 2 does not decrement either timer.
- The exact `ak.i()` target-reference retention and selector rules are detailed in [FND-0022](FND-0022-enemy-target-selection.md). The browser still follows only the player tile; it has no source action object or retained target reference.
- `n.a(cj,byte)` consumes a raw entity `nextInt()` before its aligned-target early return, uses a second raw integer for an open-axis tie, and reuses the first draw's low byte when all path fallbacks fail. M44 routes these through the raw Java-compatible stream; bounded `g.a` rolls use the other source stream.
- State 2 advances through `n.e()` and `n.a(8)`: one map update moves the entity by 8 pixels, with grid occupancy flags tracking the half-tile position (`n.a(int)` offsets 0–295; `n.e()` offsets 0–43). `ak.a(Graphics,int,int)` maps this state to the enemy walking animation track; M35 established the track table and frame lookup.

## Browser implementation and checks

- `parseEnemyDataTable` now retains `i.d`, `i.g`, `i.h`, `i.i`, and the bit-3 flag. A successful player hit marks that enemy as provoked, matching `ak`'s hit path.
- `advanceEnemyPursuitTick` selects nearby player targets using the source axis bounds, chooses approach distance by behavior type, applies the source major-axis/blocked-path fallback decisions, and advances the enemy's pixel origin by an 8-pixel half-tile update. M43 corrects the M42 no-target branch polarity and models `ak.o()`'s initial path delay plus `ak.h()`'s retarget counter. M44 supplies separate Java-compatible raw and bounded RNG streams. `WorldScene` synchronizes tile occupancy, rendering position, and state-2 directional animation on the 71 ms world tick. Source action-object targeting remains unimplemented because the web player has no skill action lifecycle or target-reference state.
- M37 later adds ordinary melee attacks for behavior types 0/1 and the fresh-Ronin damage path; see [FND-0015](FND-0015-enemy-melee-attacks.md). M39/M40 later implement behavior-2/3 attacks and extracted effects; their J2ME timing/pixel comparisons remain open. [FND-0019](FND-0019-player-poison-status.md) later implements behavior-1 poison status. Source selection while the player moves, the separate `an`/`o` target references, any separate waypoint patrol subsystem, other status effects, offscreen/activation culling, and all source interactions with NPCs and multiple simultaneous targets remain open.
- Checks: Vitest 92/92, Python converter tests 24/24, TypeScript typecheck, and production build passed. The local Vite server returned HTTP 200 for the app, the animation catalog, and a referenced enemy subimage. The build emits a 1,287.23 kB minified Phaser bundle and retains Vite's 500 kB warning.

## Limits

The controlled REA browser capture for M36 failed before returning screenshot or scenario evidence, so M36 has no browser screenshot or J2ME pursuit comparison. The M42 map-19 replay predates M43's source-polarity correction and is historical evidence for the earlier implementation, not a runtime check of the corrected branch ([capture](../../reference/screenshots/web-render/M42-enemy-idle-wandering/capture.json)). M43/M44 have unit, typecheck, converter and build coverage but no new browser capture or J2ME comparison. M44 reproduces the generator/range algorithms but not the default runtime seeds. The source target selector is now recorded in FND-0022, but the web still collapses its separate `an`/`o` coordinates and lifetime into the player tile. See [ROADMAP](../../ROADMAP.md) for remaining full-game work.
