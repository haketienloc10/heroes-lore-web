# M892 — Map70 positive south marker returns to Map69

A fresh temporary Chromium profile started from the visible title screen with the developer-only max-level profile. The visible New Game route repeated the prerequisites documented in M887, reached Map69, set the flag-25 gate, entered Map70 and continued to Map71.

At Map71, the interaction from `(14,11)` facing up completed the Crusader order event. The live state showed game flag 81, quest flag 10, and category 18/item 7 in inventory. Pressing Down from Map71 `(10,18)` returned to Map70 `(9,5)`.

The key route check was on Map70. From `(4,14)`, pressing Down entered the positive marker-1 cell at `(4,15)`. The game transferred to Map69 `(16,1)`, retaining the order item and flags 81/10. The profile remained level 99 with HP/SP `394392/394392`.

This confirms the Map70 return route in the current browser build. It does not establish ordinary-level balance, J2ME parity, or full-campaign completion. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.

See `capture.json` for checkpoint state, `route-trace.json` for the route, and `manual-interactions.json` for the key event inputs. The screenshot shows the destination Map69 scene after the transfer.
