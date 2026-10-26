# FND-0049 — Reachability of transfers into maps with missing event resources

## Question

Do the five extracted class-6 transfers into maps 28, 29, 30, and 43 have spatially selectable triggers and known incoming routes, given that those destination maps have no extracted `.evt` resources?

## Evidence and method

- Read the generated local `maps/`, `collision/6/`, and `event-operations/6/` JSON, plus the already modeled source callback behavior for map 15 `cf` and direct marker dispatches for maps 11, 13, and 82. The scan covers all 72 extracted class-6 event tables and the nine base-map IDs without event JSON: 9, 28–30, and 43–47.
- Reproduce the incoming-trigger inventory, map-3 path checks, and M349 map-level transfer graph with `python3 tools/audit_missing_event_routes.py`.
- M349's graph unions base collision markers with every decoded startup opcode-101 write and cutscene opcode-42/43 write. It traverses any transfer whose selector marker could appear anywhere in that union, without applying event predicates, inventory, actor occupancy, or paths to the selected cell. This deliberately grants more map transitions than a real playthrough can use.
- The checked-in source dispatcher in [`ag.java`](../decompiled/sources/defpackage/ag.java) selects a marker group by marker ID. Type 0 reads the current signed collision value; types 1–3 use the absolute value. The source movement passability rule is collision value `>= 0`. The corresponding dispatch and callback analysis is recorded in [FND-0039](FND-0039-newgame-map3-map4-route.md).
- The audit reports a matching cell where the source grid or a decoded collision write can contain the selected marker with the polarity used by that trigger type. It does not model actor occupancy. Its map-3 BFS treats every arrival tile as a valid start and unions every base, startup, and script collision write into both possible marker targets and possible passable cells.
- No JAR, browser, browser storage, or in-game save was accessed for this finding.

## Transfers into missing event maps

| Source | Selector and transfer | Matching source collision cells | Result |
| --- | --- | --- | --- |
| Map 3, script 3 | Type 0, marker 3 → map 43/tile `(24,27)`; row `[0,0,0,255,0,0,3]` | `(13,30)`, `(14,30)` | The marker exists. The permissive map-3 route checks below found no path to it from any possible map-3 arrival. |
| Map 27, script 2 | Type 3, marker 3 → map 28/tile `(2,16)`; row `[192,0,0,255,0,0,2]` | None with absolute marker 3 | The selected ahead-cell marker is absent. Map 27's startup collision write clears `(5,37)` and does not create marker 3. |
| Map 50, script 0 | Type 3, marker 1 → map 28/tile `(44,2)`; row `[192,0,0,255,0,0,0]` | `(2,39)`, `(3,39)`, `(4,39)` contain `-1` | The exit marker exists, but the only extracted transfer into map 50 is map 49/script 0, type 0/marker 1. Map 49 has no positive marker-1 cell, and the checked-in direct type-0 callback sites are on other source-created actors. No route into map 50 is established. |
| Map 73, script 1 | Type 3, marker 2 → map 30/tile `(16,2)`; row `[192,0,0,255,0,0,1]` | None with absolute marker 2 | Map 73 can be entered from map 48, whose type-3 marker-1 cells select the transfer. Map 73's grid has markers `-4`, `-1`, and `3`, but no marker 2. No map-30 exit trigger is selectable from that grid. |
| Map 75, script 1 | Type 3, marker 2 → map 29/tile `(7,27)`; row `[192,0,0,255,0,0,1]` | None with absolute marker 2 | Map 75 has an incoming map-49 type-3 marker-7 route. Its grid has markers `-3`, `-1`, and `4`, but no marker 2. No map-29 exit trigger is selectable from that grid. |

The audit found no opcode-7 transfer into the other event-missing maps 9 and 44–47 among the 72 extracted tables. This is a statement about the decoded class-6 tables, not about unextracted variants or external runtime callbacks.

## Map 3 to map 43

Map 3 has a valid type-0 marker-3 exit at `(13,30)` and `(14,30)`. Its decoded incoming transfers are:

- Map 1/script 0 enters at `(3,14)` through a positive marker-1 group. The controlled map-1-to-map-3 walk is recorded in M156.
- Map 2/script 2 enters at `(2,35)`, but that type-0 marker-3 selector has no positive marker-3 cell anywhere in map 2. A grid-only BFS from `(2,35)` would reach map 3's marker 3 in 16 steps if the transfer were invoked.
- Map 4/script 0 enters at `(34,34)` through a positive marker-1 group.

Four-way BFS over the permissive union grid finds no path from `(3,14)` or `(34,34)` to either possible marker-3 cell, even after treating every collision cell that any decoded startup/script write could make passable as open. Transfer arrival tiles are treated as valid starts. Map 3/script 5 writes collision value 1 to its marker-6 cells `(12,20)` and `(12,21)`; starting from either cell in the same permissive grid also finds no path to marker 3. The hypothetical map-2 arrival is the only checked entry with a path, and its own source selector is absent.

## New Game transfer-graph over-approximation (M349)

M349 follows map-level transfers from the New Game start at map 0, admitting an edge whenever the selected marker value exists in the base grid or could be introduced by any decoded startup/script collision write. It ignores flags, inventory, actor occupancy, route distance, and event ordering, so a reachable map in this graph is only a candidate, while a missing map outside the closure has no route under the extracted class-6 trigger data.

The original M349 graph considered 179 selectable transfer edges and reached 68 maps. None of the nine event-missing maps (9, 28–30, 43–47) was in that set. Map 50 was outside the closure because its only extracted incoming transfer is map 49's type-0 marker-1 row, and neither the base map nor any decoded collision write creates a positive marker 1 there. Map 50 itself has three possible marker-1 cells for its map-28 exit, but its source map is not reachable. Maps 73 and 75 are in the over-approximate closure, yet their map-30/map-29 type-3 marker-2 exits have no matching marker in the base grid or any decoded collision write. Map 27's map-28 exit likewise has no possible marker 3.

Map 3's map-43 exit has two selector cells and therefore appears selectable from a map-only scan. M349 excludes that edge only after the permissive path check above finds no route from any possible selectable map-3 arrival or from the cells written by script 5, while unioning every decoded startup/script write that could open a path or add a marker-3 cell. The map-2 arrival can reach those cells in 16 steps only hypothetically; map 2's own selected marker-3 trigger is absent. The resulting graph reports zero reachable missing-event maps. The known source-created direct-removal callbacks modeled for maps 11, 13, and 82 dispatch markers in their current maps; they do not add transfer destinations that bypass the listed map triggers.

This graph strengthens “no active route found” for the extracted class-6 map/event graph; it does not establish all unextracted variants or external callbacks, and it is not J2ME runtime proof. No missing `.evt` data was synthesized.

## Modeled source callbacks (M350)

The first closure omitted map 15's known `cf.l()` callback. The source actor remains at `(7,7)` and, after its death delay, writes marker 1 into the 4×3 region `(6..9,7..9)`. Map 15's type-0 marker-1 script transfers to map 82, so the map-82 encounter is reachable from the graph's already reachable map 15. The audit now unions those twelve cells into map 15's possible marker set.

The closure also admits marker-group-1 transfer rows directly dispatched by modeled removal callbacks on maps 11 (`cb`), 13 (`af`), and 82 (`bu`), even when no spatial collision selector exists. It continues to ignore their flags and other event predicates, preserving its over-approximate direction.

The revised graph considers 186 transfers and reaches 69 maps, including map 82, while still reaching none of the nine maps without `.evt` data. Five Python audit tests cover dynamic collision writes, direct marker callbacks, graph closure, and the map-3 path exception. This adds only callback behavior represented by the checked-in source-map model; other external callbacks and runtime behavior remain outside the audit.

## Event maps outside the New Game closure (M352)

The graph now reports the event-equipped maps that remain outside its deliberately permissive closure: 50, 65, and 68. This is computed as the 72 extracted class-6 event map IDs minus the reachable set, and the generated-data regression asserts this exact list.

- Map 50 has one extracted incoming transfer, from map 49/script 0. Its type-0 marker-1 selector has no positive matching collision cell in the base grid or the union of decoded writes.
- Map 65 has no incoming opcode-7 transfer in the 72 extracted event tables. It contains a script that transfers back to map 0, but no extracted table selects map 65.
- Map 68 has one incoming transfer, from map 67/script 1, selected by a type-3 marker-2 test. Map 67 has no positive or negative marker-2 cell in the base grid or decoded collision writes.

These results identify missing links in the extracted class-6 New Game graph; they do not establish that the maps are intended to be entered during a normal playthrough, nor exclude a source callback or unextracted class variant. No route, trigger marker, or map event data was fabricated.

## Conclusion and limits

Within the extracted class-6 spatial trigger data, three of the five transfers into missing event maps have no matching collision marker: map 27→28, map 73→30, and map 75→29. Map 50→28 has an exit marker but no established incoming route to map 50. Map 3→43 has an exit marker, but no possible map-3 arrival reaches it even when all decoded startup/script writes are unioned into the possible passability and marker grids. This supports “no active route found in the extracted class-6 route graph”; it does not prove behavior for unextracted class variants or external runtime callbacks.

M349 adds the New Game graph closure, and M350 includes the modeled map-15 dynamic collision callback plus direct marker callbacks from map actors. The current source-map start at 0 reaches 69 maps under this deliberately permissive transfer model, including map 82, and none of the nine map IDs lacking extracted event resources is reached. The map-3→43 selector is removed from the closure only after the entry-specific BFS unions all decoded collision writes and still finds no path. `python3 tools/test_audit_missing_event_routes.py` covers signed marker writes, unioned passability, callback writes, direct dispatch, graph edge selection, and the generated-data result; all five tests pass. This result does not replace a live full-playthrough check.

The web loader still requires the event resource for a map transition. The original source loader's missing-resource failure behavior is documented in the M4 definition in [`ROADMAP.md`](../../ROADMAP.md). No event table or placeholder was created. Full-campaign coverage remains open.
