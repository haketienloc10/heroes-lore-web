# M895 — Map71 Crusader dialogue before and after the order

A visible New Game route using `?testProfile=max-level` reached Map71 through the Map63/Reah and Temple of Fire prerequisites, the Map63 Chief follow-up, the Map60 marker route, Map69's letter and inn interactions, and the Map70 center gate. The level-99 Ronin remained at full HP/SP (394,392 each) through the recorded route.

At Map71, the NPC at `(9,13)` was approached from `(8,13)` while facing right. Before collecting the Crusader Order, the visible line was “Hmmm.. there must be some clues..”; game flag 81 and quest flag 10 were absent. The screenshot is `before-crusader-order.png`.

At `(14,11)`, facing up toward marker `-3`, the Crusader Order event displayed “Found the order of Crusaders.” and then the Temple of Water dialogue and reward pages. On completion, it set game flag 81 and quest flag 10 and added category 18/item 7 (Order of Crusaders) to the inventory. The event ended with “Temple of Water Quest acquired!”.

The same NPC at `(9,13)` was approached again from `(8,13)` while facing right. The line changed to “Let's get out of here.” The post-order checkpoint retained flag 81 and quest 10, contained category 18/item 7, and remained at full HP/SP. The screenshot is `after-crusader-order.png`.

This verifies the recorded route and dialogue in the current web build with a developer-only max-level profile. It does not establish ordinary-level survivability, J2ME parity, full-campaign completion, or that every map and branch works. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.
