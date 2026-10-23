# FND-0033 — Shop, refiner, and blacksmith services

## Question

What do the three map event service commands open, and how do their item, wallet, and equipment transactions work?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static JADX/`javap` inspection covered event dispatch (`ag`), service-state dispatch (`m`), and the shop (`bo`, `u`, `aa`, `ba`), refiner (`aw`, `j`), and blacksmith (`z`, `as`, `cg`) screens.
- `python3 tools/extract_game_assets.py` reads the pinned archive and verifies its SHA-256 before decoding `/itm/00`–`/itm/23`, `/itm/forshop`, and `/itm/mixtbl`. The generated catalog contains numeric prices and localized string IDs, not copyrighted strings or images outside the ignored local asset tree.
- This is static source and asset evidence. No J2ME runtime comparison or browser service-screen capture was made.

## Source behavior

- Event opcode 44 opens the blacksmith, opcode 45 opens the shop, and opcode 48 opens the refiner. The event dispatcher enters service state 11 with the respective service submode; map 80 contains three scripts that exercise these handoffs.
- The shop has six source stock tabs. Purchases use the item's source value per unit; sales return `trunc(sourceValue * quantity / 5)`. Inventory capacity is 30 slots, ordinary stack rules apply, and item categories 18–21 cannot be sold.
- The refiner's attribute service consumes one category-17 orb and 500 coins to set an unset attribute on a category-3 shield. Mixtures use `/itm/mixtbl`, select two or three ingredients from the source-allowed categories, and require the wallet to contain at least 500. The mixer consumes the selected materials on success or failure. `j` checks the 500-coin requirement but does not subtract it; the port preserves this source behavior.
- The blacksmith uses category-11/item-0 Mithril for upgrades. It consumes `upgradeLevel + 1` Mithril and charges `upgradeLevel * 100` coins. Its success threshold is `trunc(100 * (maximumLevel - upgradeLevel) / maximumLevel) + 30`, compared against a source random integer from 1 through 100. On failure the selected equipment is destroyed. Identification costs 100 coins and marks the equipment identified.

## Web implementation

- M77 decodes all 24 commerce item tables, six stock tabs, and mixture recipes into `catalog.json`, preserving source name/description IDs and prices.
- `web/src/world/commerce.ts` implements catalog validation and transactions for purchase, sale, upgrade, identification, orb attributes, and mixtures. `event-cutscene.ts` hands opcodes 44/45/48 to service screens in `WorldScene.ts`. The screens use saved wallet, inventory, equipment, and locale strings; keyboard and touch input are supported.
- Focused tests cover catalog parsing, buy/sell behavior, mixture consumption and unchanged wallet, orb/identification transactions, and upgrade success/destruction outcomes.

## Verification and limits

- M77: `npm test` passed 30 files / 207 tests; `npm run typecheck` and `npm run build` passed; `python3 -m unittest tools.test_extract_game_assets` passed 31 tests; extraction produced 1,699 generated files after verifying the pinned JAR; `git diff --check` passed.
- No service UI browser capture or J2ME comparison exists. The transaction tests do not establish menu timing, exact presentation, or end-to-end campaign access to map 80.
