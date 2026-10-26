# FND-0011 — Quick-item cycling, use keys, and consumable effects

## Scope and evidence

This finding traces the quick-use consumable path in the pinned Heroes Lore v2.1.2 JAR and records its current browser port. Static inspection used JADX and `javap -p -c` on `ar`, `f`, and `an`; localized `/itm/07..10` entries were read from the extracted en-GB string table. The source JAR SHA-256 is `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`. Browser evidence includes the seeded M33 quick-use run and M142 inventory view; neither is a J2ME comparison.

## Verified source behavior

- In `ar.a(int,int)`, raw key 35 cycles the consumable category through 7, 8, 9 and 10; raw key 57 invokes quick-item use. `f.m82b()` advances the selected category in that sequence.
- `an.k()` attempts to use the currently selected stack when the player state allows it. A successful use consumes one unit from that category.
- `an.k()` returns without using an item when the actor state is 5 or 6, before it looks up the selected quick-item stack.
- `an.a(ac)` applies the category effect: 7 restores 20% of maximum HP, 8 restores 40% of maximum HP, 9 restores 30% of maximum SP, and 10 marks the poison status for removal if present. `ce.b()` sets the effect's expired flag; on the next `an.d()` update, the source increments the status timer and checks its poison pulse before removing the flagged effect. Antidote can therefore allow one final poison pulse when used just before a ten-update boundary.
- The en-GB item records identify these categories as Potion, High potion, Wine, and Antidote. The HUD shows the selected category icon and its current stack count.

## Browser implementation

- `web/src/world/loot.ts` implements cycling, stack lookup, category 7–10 effects, and stack decrement/removal. `PlayerStatusState` retains Antidote-marked poison through its final update and removes it afterward; a poison pulse at that update still applies. `WorldScene` wires key `#`/raw key 35 to cycle and `9`/raw key 57 to use. Mobile Item and Use controls dispatch the same inputs.
- M142 also lets the selected row in the web inventory screen use its category-7–10 consumable effect directly. The row action reuses the same HP/SP restoration and Antidote status-removal path, updates the selected quick-item category/count, and leaves equipment and other item categories on their existing paths. The [local Chromium inventory capture](../../reference/screenshots/web-render/M142-inventory-menu/capture.json) shows the localized starting loadout, but its bag is empty, so it does not demonstrate row use. No J2ME menu-flow comparison was made.
- M484 routes direct inventory-row consumable use to the chosen stack index, including when different item IDs share one category. This keeps the inventory action from consuming an earlier matching category stack; a focused duplicate-category regression covers the behavior.
- M33 seeds a save at map 27/tile `(9,5)` with HP 50/72, SP 20/60, two Potions and one Wine. Pressing `9` consumes a Potion and restores HP to 64; pressing `#` twice selects category 9; another `9` consumes the Wine and restores SP to 38. The saved state contains one Potion, zero selected Wine count and selected category 9. The [manifest](../../reference/screenshots/web-render/M33-quick-items/capture.json) records the seeded route, Chrome capture, and no page exceptions, console errors or failed requests; the [screenshot](../../reference/screenshots/web-render/M33-quick-items/after-use.png) records the HUD after use.
- Unit tests cover all four category effects, category cycling, stack decrement/removal, and Antidote's final-update pulse and status removal.
- M279 carries the source quick-use defeated-state restriction into both web consumable paths, including the separate inventory-row action. `WorldScene` passes whether HP is positive and no game-over sequence is active; the pure item helpers then leave inventory, HP/SP, selected count and statuses unchanged when use is disallowed. A focused regression covers quick-item and inventory-row use.

## Limits and follow-up

M33 is a seeded browser test; no J2ME input or state comparison was captured. The browser viewport is 240×320, and touch controls reduce the rendered game canvas to about 93×124, so this capture demonstrates input/state rather than visual parity. High Potion and Antidote are covered by unit tests but were not used in the browser run. At M33, no enemy or event applied poison in the web runtime. M41 adds the behavior-1 poison path and original status icon; active timed statuses remain transient, matching the inspected source save serializer. Broader status mechanics and the rest of the item system remain incomplete. M72 later adds equipment/inventory selection and derived stats; M142 adds localized names and direct use of selected bag consumables. Neither has a J2ME menu-flow comparison. M279 covers the source actor-state 5/6 quick-use restriction in both modeled web consumable paths; source-specific states beyond the web HP/game-over model and J2ME menu-flow parity remain open.
