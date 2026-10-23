# FND-0007 — Map 64 south-boundary event to map 0

**Date:** 2026-10-23. **Status:** the trigger type, flag predicate, script command sequence and destination were checked against the pinned JAR bytecode. The destination matches the single OUTSIDE screenshot from HOUSE-EXIT-001, and the browser follows the decoded transition. The title menu and New Game selection route are now implemented through the opening map-0 screen (see [FND-0008](FND-0008-startup-flow.md)); the campaign path into map 64 and the complete flag state remain unresolved.

## Baseline and evidence sources

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source checked with `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ad ag m n` (JDK 21.0.12.1); JADX output under `/tmp/heroes-lore-jadx/sources/defpackage/` was used for source navigation.
- Original route and screenshot provenance: [HOUSE-EXIT-001](../../reference/scenarios/fixtures/HOUSE-EXIT-001.md), OUTSIDE image `04-Down-two-holds.png` from P1M-R04.
- Browser replay and masked image comparison: [M16-SCN-0006 manifest](../../reference/screenshots/web-render/M16-SCN-0006-house-exit.json) records the initial route port; the latest [M16-SCN-0008 manifest](../../reference/screenshots/web-render/M16-SCN-0008-outside-event-state.json) and [browser capture](../../reference/screenshots/web-render/M16-SCN-0008-outside-event-state-240x320.png) include map-0 startup event effects and static NPC atlas frames. Screenshots are local and ignored by Git.

## Bytecode path

1. `ad.a()` loads the map collision grid from `/m/<region>/<map>.evt`, then loads three auxiliary tables. `ad.e(byte[],int)` stores the 7-byte rows in `f21a`, the 3-byte command rows in `f22b`, and strings in `f23c`.
2. At the end of player movement, `an.d()` can call `ag.b()`. That method looks one cell ahead in `f13c`, takes the absolute value of a nonzero marker, and dispatches trigger type `3`.
3. `ag.a(byte,byte)` indexes the 7-byte group by `abs(marker)-1`, selects a matching two-bit trigger type, checks the two packed flag references against the game/quest bit arrays, and rejects rows that need an unavailable inventory predicate. The last byte selects a script in `f22b`.
4. `ag.i()` handles script command `7` followed by command `8`: the first carries destination map/region, the second carries hero tile X/Y; it calls `m.b(map,region,x,y)`. `m.b(byte,byte,byte,byte)` stores that map-change request for the world update.

## Map-64 route data

The south corridor ends at map cell `(9,18)`; the cell immediately below it, `(9,19)`, has signed collision value `-1`. On map-64 event table `/m/6/64.evt`, marker group 1 has a matching type-3 row:

```text
trigger row: [192, 0, 0, 255, 0, 0, 0]
script 0:    [..., [7, 0, 1], [8, 26, 24], [99, 0, 0]]
```

The top two bits of `192` select trigger type `3`; both packed conditions refer to game flag 0. Byte 3 is `255` (`-1`), so this row has no inventory predicate. Script commands `7` and `8` request map 0, region 1, hero tile `(26,24)`. The single source run reaches map 0 after the second Down hold; its console has `map : 64` followed by `map : 0`, and its screenshot places the hero at the town-side house entrance. The correspondence establishes the event path for this fixture; the exact complete game-flag initialization sequence has not been traced. The browser seeds flag 0 for this known post-New-Game scene based on the recorded route.

The source `.evt` resource also contains other trigger groups and a separate final four-byte operation table. Those other triggers/commands are not treated as equivalent to this map-change path. The extractor preserves them as data; the browser currently resolves only type-3 script map transitions.

The type-3 exit row proves game flag 0 is set when the recorded route reaches the boundary. Under the browser's inferred flag set containing only bit 0 (other active bits are unknown), the first matching startup descriptors select block 1 on map 64 and block 2 on map 0. Source opcode dispatch confirms the action records mutate map/collision, decoration, and NPC state; M46 ports initial action-block opcodes 100–105, M47 adds 110, and M48 adds 109 and corrects opcodes 102/103 to the source decoration array (see [FND-0023](FND-0023-map-startup-operations.md)). This does not establish which action block the original runtime selects for every HOUSE-EXIT-001 state. FND-0008 traces the fresh-game routine that clears the bit arrays and sets flag 0 for the implemented New Game route. The map-64 transition script begins with opcode `9` setting game flag 3, then opcode `26` logging its BGM marker, followed by the map change. The browser applies that flag mutation; other event script and operation opcodes remain unimplemented.

## Browser implementation and comparison

- `tools/extract_game_assets.py` now preserves trigger groups, script command rows and string IDs in the existing raw event JSON output.
- `web/src/world/event-data.ts` validates those records and resolves flag/type-qualified script transitions.
- `WorldScene` loads maps 64 and 0. At a player movement boundary, it checks the current-cell type-0 trigger and then the ahead type-3 marker, matching the source movement-end dispatch. M64 verifies the map-54 south-boundary exit does not fire on idle arrival, then fires after a blocked Down movement attempt.
- A Chromium replay at 240×320 used Down for 1000 ms, release, a 1719 ms gap, then Down for 1000 ms, matching the fixture request durations. It reached map 0/tile `(26,24)` with no page errors. The resulting screenshot places the hero at approximately `(184,194)`, close to the source screenshot.
- Map-transition checks now run when movement reaches or stops at a tile boundary. M64 replays the map-53 scripts 7–9 to map 54/tile (17,14), then presses Down against map54's blocked south cell; this executes the map-54 type-3 exit and returns to map53/tile (18,15). A pre-fix controlled replay showed that checking an ahead marker while idle caused this exit to fire immediately on arrival; the corrected movement-boundary gate matches the source `an.d()` call site. This is local browser evidence, not a J2ME comparison. The current renderer shows visible map-0 NPC placements whose image IDs are 18 or greater using `/npc/all` frames; IDs below 18 need a different sprite decoder. A custom RGB comparison masks source/browser hero and NPC regions, the source enemy area and bottom HUD. Across the remaining 63,653 pixels, average absolute RGB channel difference was `0.86`, with no translation applied. This checks shared background alignment only; it does not establish full NPC pose/visibility, enemy, HUD or dialogue fidelity.

## Limits and next work

The map-64 entry coordinate `(9,8)` is still inferred from the BED screenshot. The browser can start at the original title menu and reaches map 0, but it still does not connect that opening to map 64; this is not yet a menu-to-exit replay. NPC IDs below 18 and their animation/AI, enemy rendering, all other event script opcodes and inventory predicates, event-modified collision, transition animation, HUD, camera modes and the remainder of the game remain open. The limited screenshot comparison does not satisfy the full port goal.
