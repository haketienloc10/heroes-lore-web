# FND-0006 — Actor sprite, spawn alignment and tile movement

**Date:** 2026-10-23. **Status:** map-64 actor rendering, base-grid movement, occupancy checks for visible static NPC/enemy placements, New Game entry at the bed and the map-64 to map-0 exit are implemented. The opening transfer is detailed in [FND-0008](FND-0008-startup-flow.md); the exit trigger is in [FND-0007](FND-0007-house-exit.md). The bed position is source-script-backed, and idle/walk animation slots now follow the source actor states. Sprite alignment, animation timing, other actor states and occupancy changes during gameplay remain incomplete.

## Baseline and evidence tools

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- `javap -classpath original/heroes-lore-v2.1.2.jar -p -c an n cj m ad bt ar` (JDK 21.0.12.1). Full local output: `/tmp/heroes-lore-actor.javap.txt`.
- JADX source was used to navigate names and call flow, then checked against the pinned JAR bytecode above.
- Existing runtime screenshots/input audit: [HOUSE-EXIT-001](../../reference/scenarios/fixtures/HOUSE-EXIT-001.md), including the BED and first-Down screenshots from P1M-R04.
- Browser capture: [M16-SCN-0005 manifest](../../reference/screenshots/web-render/M16-SCN-0005-hero-room.json), [BED image](../../reference/screenshots/web-render/M16-SCN-0005-hero-room-240x320.png), and [after-Down image](../../reference/screenshots/web-render/M16-SCN-0005-hero-room-after-down-240x320.png). These screenshot files are local and ignored by Git.

## Source facts

1. `m.a(boolean, byte, boolean[])` creates `an(0, 0, 8, 8, characterId)`. `cj` stores world pixel coordinates, derives grid coordinates with `>> 4`, and tracks whether either coordinate is between 16-pixel cell boundaries. The player inherits a one-cell occupancy footprint.
2. `n.a()` starts in entity state `1` and direction `2`. Direction vectors in `t` map `1=up`, `2=down`, `3=left`, `4=right`. `m.b(direction)` starts movement state `2` from idle or queues a direction while already moving; `m.h()` queues a stop.
3. `an.d()` advances a state-2/state-4 actor with `super.a(8)`, which changes one world coordinate by 8 pixels in the active direction. `ad.a(int,int)` admits a cell only when it is in bounds, the signed runtime collision value is nonnegative, and the occupancy grid is empty. `ad.a(n,direction)` checks the actor's next occupied cell.
4. `an.a(Graphics,...)` draws a shadow, then iterates render layers 0–8 in order. Layer 7 uses the nested-frame renderer `ar.b`; other layers use `ar.a`. Layers 6 and 7 are skipped when `ad.f7c` is false. `bt.j()` and `bt.k()` load the body (`b`), armor (`aN`), head (`hA`/`hB` plus `hN` images), weapon (`wN`) and effect (`e`) data; source lookup tables map equipped item IDs to the atlas groups. The map's first header byte is its tileset ID, and `ad` sets `f7c` unless that byte is 1, 5, 9 or 15. The converter preserves the `.s` layouts as JSON, including signed offsets, frame lists and mirrored-frame flags.
5. SCN-0004 measured a 71 ms gameplay pacing period on a separate runtime route/profile. That period is evidence for the browser update step, not a dedicated measurement of actor travel speed in HOUSE-EXIT-001.
6. `an.a(Graphics,...)` renders actor states 1 and 4 with animation slot 0, state 2 with slot 1, and state 6 with slot 2. State 3 uses the action-state renderer in `an.e(Graphics,...)`, which selects the attack slots. The per-layer frame index is `36 * animationSlot + 9 * (direction - 1)`; layers 6 and 7 remain tileset-gated.

## Implemented model

- The Phaser scene loads map 64, the region-6 base collision grid, its static decorations, and the first character sheet's body, armor, both head layouts, weapon, effect layout and atlas PNGs. M88 composes the class-6 starter body/head/weapon frames and optional armor/effect parts in the source layer order, applies the source equipment-ID-to-atlas lookups, and gates layers 6/7 from the map tileset ID. It also hides the opening script's screen-clear overlay after a successful map transfer; otherwise the BED destination stayed black after W/Skip. M89 selects source animation slot 0 while idle and slot 1 while moving, retaining the source combo slots for active attacks.
- The initial world coordinate `(144,128)` / cell `(9,8)` is inferred by aligning the reconstructed sprite to the BED screenshot and the 16-pixel map grid. The pinned game bytecode constructs the actor at `(0,0)`; a later map-entry event assigns the actual location, and that operation has not yet been traced.
- The engine-independent actor model advances in 8-pixel half-tile steps at a 71 ms update period. It checks event-selected map collision and visible static NPC/enemy occupancy at aligned cell boundaries, maintains facing direction, queues turns to a boundary and finishes the current tile on release. Occupancy changes during gameplay and dynamic entity footprints are not yet integrated.
- Arrow keys and WASD drive the actor. The scene camera tracks and clamps to the map bounds; its complete original camera modes are not modeled.

## Comparison and limits

The 240×320 Playwright capture has its static room aligned to the BED fixture with zero translation. A custom nearest-pixel RGB comparison returned average per-channel absolute difference `1` over the capture with the starter-avatar rectangle excluded for the BED comparison. In the first-Down checkpoint, the detected cyan head spans rows 203–213 in the reference and 205–215 in the browser; movement lands in the same lower room region, with a 2-pixel sprite offset. This is a narrow comparison, not a full pixel diff: HUD, animation timing, NPCs, events and physical-device rendering are not covered.

The reference and browser each move 91 screen pixels in the detected head rows across the one-second Down action; the browser uses the model period above. This does not establish exact callback-to-movement cadence: the original session was a single input run and the browser uses a separate scheduler. M89 replaces the old visual-only default slot with the bytecode-mapped idle and walking slots. The browser does not yet reproduce every actor state or establish J2ME frame timing and pixel parity; the M88 capture predates this slot correction and remains evidence for layer composition and the screen-transfer fix only. M88's controlled New Game → W/Skip replay captures map 64 with the Ronin and starter weapon visible and no page errors or failed requests; see [capture manifest](../../reference/screenshots/web-render/M88-player-equipment-render/capture.json). It does not establish J2ME pixel parity.

The M88 browser implementation uses the shared `c1` sprite layouts/atlases. Weapon/effect palette changes, non-default gear appearances, shield visuals, runtime checks of class-7/8 equipment lookups and source states beyond idle, walking and active combos remain open.

The New Game script skip now transitions to map 64/cell `(9,8)`, and the house-exit event transitions to map 0/cell `(26,24)`. M20 replays both transitions from the browser menu. The map-64 source entry position is established by script 9; its actor pixel alignment is still inferred from screenshots. The source HUD now renders its initial Ronin values and selected Guardian skill icon; dynamic stats, runtime collision/occupancy changes, menus, dynamic NPCs, campaign state, full save/load and most of the game remain to be ported.

## Reproduction

```bash
python3 -m unittest discover -s tools -p 'test_*.py' -v
npm test
npm run build
npm run assets:extract
```

Current tests cover layout decoding, actor half-step movement, base-grid and occupied-cell blocking, queued turns and release alignment; event tests verify that hidden/out-of-bounds NPC placements do not occupy cells and cover the skip-only startup transfer and the south-door exit. The M20 browser replay exercises HOUSE-EXIT-001 from New Game and reduces the house/outside comparison errors by drawing the initial HUD. Entity/timing differences remain, and this route does not prove the rest of the game.
