# M878 — Map80 service handoffs

A fresh visible max-level New Game reached Map80 from Map60 `(17,38)` using visible movement inputs. Map80 has no enemy placements. The hero arrived at `(10,18)` at level 99 and 394,392/394,392 HP. The route trace is in `route-01-map60-to-map80.json`.

Map80’s trigger mapping is specific to this map: marker `-2` at `(10,8)` opens Shop, marker `-3` at `(8,8)` opens Refiner, and marker `-4` at `(12,8)` opens Blacksmith. Each was approached from the south, opened with visible Enter/W input, and closed with Escape. Runtime states and screenshots show `shop-list`, `refiner-main`, and `blacksmith-main`; wallet stayed at 300, inventory remained empty, and the recorded game/quest flags and full HP stayed unchanged. No transaction was committed.

An initial expectation reused Map81’s different marker mapping; the live event script and runtime handoff corrected that assumption. This was a test-mapping error, not a product defect. These captures verify browser service handoffs and menu rendering only; transactions, J2ME parity, ordinary-level balance, and the full campaign remain open. No in-game Save/Load, browser-storage/local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.

After the service checks, visible movement reached Map80 south marker `-1` from `(11,18)` and returned to Map60 `(25,29)` in 10 actions. HP and recorded flags stayed unchanged. The [return route trace](return-route.json) and [return screenshot](13-map80-to-map60-return.png) document the two-way transfer.

A visible ArrowUp at Map60 `(25,29)` entered the Map80 gate again and returned to Map80 `(10,18)`. This closes a two-way Map60/Map80 round trip at full HP; see [round-trip state](round-trip.json) and [screenshot](14-map60-to-map80-return.png).
