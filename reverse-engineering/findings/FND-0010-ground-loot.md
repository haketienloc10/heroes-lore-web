# FND-0010 — Enemy ground drops, pickup, and inventory insertion

## Scope and evidence

This finding traces ordinary enemy death loot from the pinned v2.1.2 source and records the current browser port. Static source inspected in JADX is `ak.java`, `ad.java`, `m.java`, `ar.java`, `f.java`, and `ac.java`; the enemy triplets are extracted without rewriting from `/enm/data0..2`. Browser evidence is the seeded M32 run; it is not a J2ME comparison.

## Verified source behavior

- `ak.l()` first rolls an inclusive integer from 1 through 150. It subtracts the third byte of each enemy drop triplet in order. At the first cumulative crossing, a triplet with weight 1 gets another inclusive 1–100 roll and succeeds at 20 or below; other weights select immediately. A failed one-weight candidate leaves the loop running, so a later candidate can be selected.
- The selected first and second triplet bytes are passed as item category and item ID to `ad`. Category 22 is explicitly ignored by the ordinary ground-item insertion overload. A separate death roll can insert category 11, item 0, with chance `20 + enemyRecord.f - playerLevel`; this is independent of the weighted item roll.
- A separate inclusive 1–100 roll drops currency at 60 or below. Its ground record stores `enemyRecord.f * 3`; `m.m97a()` multiplies the recovered amount by nine when the player picks it up.
- Ground records hold map tile, category/item or currency fields, and a 120-count timer. `ad.o()` decrements the timer once per map update and removes the record after it goes below zero. The marker blinks during the last 16 counts: it is drawn when the count exceeds 16 or is not divisible by 3. `/img/etcui/9` is the item marker and `/img/etcui/10` is the currency marker.
- Raw key 53 first calls `m.m97a()`. Pickup searches the player’s current tile. Currency is always accepted; an item is removed only if its destination inventory accepts it. If pickup fails, the input continues to the ordinary action path.
- `f` contains 30 inventory slots. `ac.f1b` marks categories 7–17 and 22–23 as stackable. Stack counts cap at 99; non-stackable items require an empty slot. The separate special inventory path for category 22 is not represented by the ordinary item-drop list.

## Browser implementation

- `web/src/world/loot.ts` preserves raw category/item IDs, performs the source selection and independent rolls, models the 30-slot/99-count insertion rules, advances marker lifetime/blink state, and applies the currency pickup multiplier.
- `WorldScene` rolls drops at the lethal-hit transition, renders the extracted source markers at the enemy tile, expires them on the 71 ms map-update cadence, and tries pickup before basic attack on Numpad5. Wallet and raw inventory stacks are stored in the existing version-one save format; older saves default to wallet 300 and an empty inventory.
- M32 loads a seeded save at map 27/tile `(9,5)`, defeats enemy 24 at `(10,5)`, steps onto that tile and picks up a currency drop. Saved wallet changes from 300 to 327, consistent with the source reward code 1, ground amount 3 and ninefold pickup. The [manifest](../../reference/screenshots/web-render/M32-enemy-loot/capture.json) and [capture](../../reference/screenshots/web-render/M32-enemy-loot/after-kill.png) record the route.
- Automated tests cover the weighted branch, failed rare candidate continuation, independent category-11 roll, coin multiplier, stacking, full inventory, timer expiry, marker blink, and legacy save defaults.

## Limits and follow-up

M32 uses a seeded browser save and Phaser’s random stream; its random sequence has not been matched against the J2ME runtime. The capture demonstrates currency pickup, while raw item pickup is currently covered by deterministic unit tests. Item names, inventory browsing/selection/use, equipment, category-22 special inventory, item effects, and the complete inventory UI remain unimplemented. The enemy drop table is data-driven for all three variants, but the current world uses the fresh-game Ronin `data0` table.
