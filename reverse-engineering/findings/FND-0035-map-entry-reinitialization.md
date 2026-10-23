# FND-0035 — Reinitialize map state on every source map entry

## Question

Does the source game reuse a prior map instance after a transfer, or construct a fresh one using the then-current story flags?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static evidence: JADX output in `reverse-engineering/decompiled/sources/defpackage/bt.java` and `ad.java`, cross-checked against `javap -classpath original/heroes-lore-v2.1.2.jar -p -c bt` and the corresponding `ad` class.

## Verified source behavior

- `bt.m60a()` detaches the old map object, clears the global map reference, constructs `new ad(m.f)` for the selected destination map, stores it, and calls its map-load method (`bt.java:117–139`). `javap` of the pinned `bt` class shows the same `new ad` constructor call and subsequent map-load invocation.
- The `ad` map-load method reads the map's data and invokes its event-operation decoder. `ad.m7c(byte[], int)` scans the map's operation descriptors against current game flags and applies the action block selected for that map (`ad.java:581–625`); `javap` of the pinned `ad` class confirms the corresponding operation-decoder call in the map-load method.
- The source therefore starts destination map state from its extracted base data on each entry, then applies the destination's flag-selected startup operations. Map transitions can change collision, tile, decoration, NPC, and enemy runtime state back to the result appropriate for the current flags.

## Browser implementation

- `transitionToMap` now prepares the destination's game and quest flags once. The same prepared state selects startup operations while the destination loads and is committed after load, so toggle opcodes cannot be applied twice for a newly loaded map.
- Every destination entry rebuilds its `RenderedWorld` from the extracted map, collision, decoration, and event data, including when that map was visited earlier. Replaced display objects and map-specific damage popups are destroyed.
- A focused test applies a prepared transition containing a toggle and then uses its post-transfer flags to select a destination startup action block.

## Verification and limits

- Vitest: 31 files / 213 tests passed. Typecheck passed. Production build passed at 1,396.06 kB minified; Vite retains its existing warning for chunks above 500 kB.
- A controlled Chromium scenario was captured after the change (REA evidence `ev_22e1e6340bf0ebab294757646c520a435fe536c48fcdab03b5210c45b8bdc6cd`). It loaded a seeded map-64 save and issued 18 ArrowDown presses at 150 ms intervals, but remained on map 64 and did not exercise a transfer or map re-entry. The scenario event capture was incomplete, so this is an inconclusive browser attempt rather than runtime validation of M90. No J2ME comparison was made. Re-entry currently fetches the four JSON resources again; caching immutable source JSON while rebuilding the effective map remains a possible performance improvement.
- This finding verifies map-instance recreation and startup operation timing. It does not resolve transfer-region semantics, general campaign reachability, or all map event opcodes.
