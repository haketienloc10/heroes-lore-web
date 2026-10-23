# FND-0011 — Quick-item cycling, use keys, and consumable effects

## Scope and evidence

This finding traces the quick-use consumable path in the pinned Heroes Lore v2.1.2 JAR and records its current browser port. Static inspection used JADX and `javap -p -c` on `ar`, `f`, and `an`; localized `/itm/07..10` entries were read from the extracted en-GB string table. The source JAR SHA-256 is `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`. Browser evidence is the seeded M33 run, not a J2ME comparison.

## Verified source behavior

- In `ar.a(int,int)`, raw key 35 cycles the consumable category through 7, 8, 9 and 10; raw key 57 invokes quick-item use. `f.m82b()` advances the selected category in that sequence.
- `an.k()` attempts to use the currently selected stack when the player state allows it. A successful use consumes one unit from that category.
- `an.a(ac)` applies the category effect: 7 restores 20% of maximum HP, 8 restores 40% of maximum HP, 9 restores 30% of maximum SP, and 10 removes status ID 7 (poison) if present.
- The en-GB item records identify these categories as Potion, High potion, Wine, and Antidote. The HUD shows the selected category icon and its current stack count.

## Browser implementation

- `web/src/world/loot.ts` implements cycling, stack lookup, category 7–10 effects, stack decrement/removal, and Antidote's status-ID removal. `WorldScene` wires key `#`/raw key 35 to cycle and `9`/raw key 57 to use. Mobile Item and Use controls dispatch the same inputs.
- M33 seeds a save at map 27/tile `(9,5)` with HP 50/72, SP 20/60, two Potions and one Wine. Pressing `9` consumes a Potion and restores HP to 64; pressing `#` twice selects category 9; another `9` consumes the Wine and restores SP to 38. The saved state contains one Potion, zero selected Wine count and selected category 9. The [manifest](../../reference/screenshots/web-render/M33-quick-items/capture.json) records the seeded route, Chrome capture, and no page exceptions, console errors or failed requests; the [screenshot](../../reference/screenshots/web-render/M33-quick-items/after-use.png) records the HUD after use.
- Unit tests cover all four category effects, category cycling, stack decrement/removal, and Antidote removing status ID 7.

## Limits and follow-up

M33 is a seeded browser test; no J2ME input or state comparison was captured. The browser viewport is 240×320, and touch controls reduce the rendered game canvas to about 93×124, so this capture demonstrates input/state rather than visual parity. High Potion and Antidote are covered by unit tests but were not used in the browser run. At M33, no enemy or event applied poison in the web runtime. M41 adds the behavior-1 poison path and original status icon; active timed statuses remain transient, matching the inspected source save serializer. Broader status mechanics and the rest of the item system remain incomplete. M72 later adds a category/item-ID equipment menu and derived stats, without localized names or browser/J2ME comparison. The source's dead/sleeping restrictions and all broader item interactions still need end-to-end coverage.
