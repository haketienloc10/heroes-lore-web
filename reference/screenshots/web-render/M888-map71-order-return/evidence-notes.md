# M888 — Map71 Crusader order event and Map70 return

A fresh temporary Chromium profile started from the visible title screen with the developer-only max-level test profile. The route to Map71 repeated M887's visible New Game prerequisites, including the Map63/Reah chain, Map19/22/24 ingredients, Map25 exchange, Map10/11 encounter, Map63 Chief follow-up, and Map69 flag-25 gate.

At Map71, the visible interaction from `(14,11)` facing up completed the Crusader order event. The live state then showed game flag 81, quest flags 8 and 10, and category 18/item 7 (Order of Crusaders) in inventory. The hero stayed at level 99 with full HP/SP, 394,392 each.

Pressing Down from the Map71 south marker transferred to Map70 `(9,5)` and retained the event flags and inventory item. A repeat walk through Map70 marker `-4` re-entered Map71 `(10,18)`; pressing Down returned to Map70 `(9,5)`. At Map70 `(3,5)`, pressing Up toward marker `-3` visibly displayed “Door is locked.” and did not transfer maps.

The capture confirms this current-build browser route and the order/return event with boosted survivability. It does not establish ordinary-level balance, J2ME parity, natural full-campaign completion, or that the tested Map70 door is the only route onward. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.

Correction to the initial static read: the Map70 base collision grid also has positive marker `1` at `(3,15)`, `(4,15)`, and `(5,15)`. The dispatcher resolves markers by absolute value, and trigger group 1 has a type-0 row whose script transfers to Map69 `(16,1)`. M888 did not traverse the south-side marker; M892 later confirmed the return to Map69 live. The Map70 `-3` door interaction at `(3,5)` remains visibly locked.

See `capture.json` for checkpoint state, `route-trace.json` for the compact route, and `manual-interactions.json` for the event inputs. Screenshots preserve the Map71, Map70 return, and visible locked-door checkpoints.
