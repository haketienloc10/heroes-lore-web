# FND-0033 — Shop, refiner, and blacksmith services

## Question

What do the three map event service commands open, and how do their item, wallet, and equipment transactions work?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static JADX/`javap` inspection covered event dispatch (`ag`), service-state dispatch (`m`), and the shop (`bo`, `u`, `aa`, `ba`), refiner (`aw`, `j`), and blacksmith (`z`, `as`, `cg`) screens.
- `python3 tools/extract_game_assets.py` reads the pinned archive and verifies its SHA-256 before decoding `/itm/00`–`/itm/23`, `/itm/forshop`, and `/itm/mixtbl`. The generated catalog contains numeric prices and localized string IDs, not copyrighted strings or images outside the ignored local asset tree.
- The source and asset findings below are based on static inspection. No J2ME runtime comparison is available; browser evidence for one shop flow was added in M482.

## Source behavior

- Event opcode 44 opens the blacksmith, opcode 45 opens the shop, and opcode 48 opens the refiner. The event dispatcher enters service state 11 with the respective service submode; map 80 contains three scripts that exercise these handoffs.
- The shop has six source stock tabs. Purchases use the item's source value per unit; sales return `trunc(sourceValue * quantity / 5)`. Inventory capacity is 30 slots, ordinary stack rules apply, and item categories 18–21 cannot be sold.
- The refiner's attribute service consumes one category-17 orb and 500 coins to set an unset attribute on a category-3 shield. Mixtures use `/itm/mixtbl`, select two or three ingredients from the source-allowed categories, and require the wallet to contain at least 500. The mixer consumes the selected materials on success or failure. `j` checks the 500-coin requirement but does not subtract it; the port preserves this source behavior.
- The blacksmith uses category-11/item-0 Mithril for upgrades. It consumes `upgradeLevel + 1` Mithril and charges `upgradeLevel * 100` coins. Its success threshold is `trunc(100 * (maximumLevel - upgradeLevel) / maximumLevel) + 30`, compared against a source random integer from 1 through 100. On failure the selected equipment is destroyed. Identification costs 100 coins and marks the equipment identified.

## Web implementation

- M77 decodes all 24 commerce item tables, six stock tabs, and mixture recipes into `catalog.json`, preserving source name/description IDs and prices.
- `web/src/world/commerce.ts` implements catalog validation and transactions for purchase, sale, upgrade, identification, orb attributes, and mixtures. `event-cutscene.ts` hands opcodes 44/45/48 to service screens in `WorldScene.ts`. The screens use saved wallet, inventory, equipment, and locale strings; keyboard and touch input are supported.
- The sell screen retains the selected inventory row through quantity selection and confirmation. This keeps duplicate category/item stacks and distinct equipment instances separate when a sale is applied.
- The mixture transaction consumes the inventory rows selected in the refiner screen and validates repeated selections against each row's count.
- Focused tests cover catalog parsing, buy/sell behavior, mixture consumption and unchanged wallet, orb/identification transactions, and upgrade success/destruction outcomes.

## Verification and limits

- M77: `npm test` passed 30 files / 207 tests; `npm run typecheck` and `npm run build` passed; `python3 -m unittest tools.test_extract_game_assets` passed 31 tests; extraction produced 1,699 generated files after verifying the pinned JAR; `git diff --check` passed.
- M480 fixes two commerce pointer hit targets in `WorldScene.ts`: the rendered shop Sell row now opens the sell list, and taps on the quantity minus/plus adjust by one within the available range. `npm run typecheck`, `npm run build`, and `git diff --check` passed; Vite reported the existing >500 kB chunk warning. At the time of M480, no service screen had been reached in a natural browser route, so the pointer change had not yet been replayed.
- M482 reaches map 80 through visible gameplay controls and captures the shop and Sell flow in Chromium. A pointer click on the rendered Sell row opens the sell list. After buying Potion ×2 through the UI, pointer plus changes quantity 1/Earn 30 to quantity 2/Earn 60, and pointer minus returns it to quantity 1/Earn 30. The sale is not committed. See the [capture manifest](../../reference/screenshots/web-render/M482-shop-pointer-runtime/capture.json), [shop screen](../../reference/screenshots/web-render/M482-shop-pointer-runtime/01-shop.png), [sell list with Potion ×2](../../reference/screenshots/web-render/M482-shop-pointer-runtime/06-sell-list-with-potion.png), [quantity 1](../../reference/screenshots/web-render/M482-shop-pointer-runtime/03-sell-quantity-1.png), [quantity 2](../../reference/screenshots/web-render/M482-shop-pointer-runtime/04-sell-quantity-2.png), and [quantity 1 after minus](../../reference/screenshots/web-render/M482-shop-pointer-runtime/05-sell-quantity-1-after-minus.png). No gameplay state was seeded or browser storage read, and no in-game save was made. This is current-build browser evidence for one shop Sell/quantity flow, not J2ME parity or refiner/blacksmith coverage.
- M483 adds row-specific sales so the selected duplicate stack is debited instead of an earlier matching category/item stack. Focused tests cover two same-ID equipment instances, capped duplicate consumable stacks, and stale/mismatched row rejection; all 7 commerce tests, TypeScript checking, and `git diff --check` pass. This is model-level verification without a browser replay of duplicate-row sales or a J2ME comparison.
- M485 makes mixture consumption use the selected row indices, including repeated ingredients selected from a capped duplicate stack. The 8 focused commerce tests and full web suite (59 files / 513 tests) pass, along with TypeScript checking, the production build, and `git diff --check`. This is model-level verification without a refiner browser replay or a J2ME comparison.
- No J2ME service UI comparison exists. Transaction tests do not establish source-runtime menu timing or full visual parity, and this browser route does not verify refiner or blacksmith behavior.
