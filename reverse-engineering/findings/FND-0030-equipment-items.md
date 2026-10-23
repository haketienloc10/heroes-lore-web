# FND-0030 — Equipment item records and inventory state

## Question

What source data and per-instance state are required to award or pick up categories 0–6, and why can those records not be treated as ordinary item stacks?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static inspection used `javap -classpath original/heroes-lore-v2.1.2.jar -c -p ag ac d f g k m s` and the local `/itm/00`–`/itm/06` resources.
- No J2ME runtime comparison was performed.

## Source evidence

- `ag.q()` reads the category and item ID from opcode 11, then reads the signed quantity from the following opcode 21. At bytecode offsets 74–112, a positive quantity constructs one item through `ac.a(category, itemId, true, true)`, sets `d.b` on equipment instances, and calls `f.a(item, quantity)`. It does not construct `quantity` separate equipment objects.
- `f.a(ac, int)` checks capacity first. Categories 0–6 follow the non-stack branch (`ac.b[category] == false`) and occupy one inventory slot; the quantity is used for the preflight limit (99), while the equipment item's own count remains one. Stackable categories merge counts up to 99.
- `d.a(byte[], int, boolean)` parses the numeric item value, equipment byte, characteristic flag, signed enhancement count and four signed inclusive enhancement ranges. When the creation flag is set it calls `d.a(byte, byte[], byte[], byte)` to roll the selected enhancement slots. `g.a(min, max)` supplies the source inclusive range draw using the Java random stream.
- Ground pickup in `m.m97a()` reconstructs an item through the same item table factory. For equipment, it sets `d.b` when the item's characteristic flag is false.
- Equipment instance serialization retains `d.b`, `d.e` and four enhancement bytes. Subclasses add three bytes for categories 0–2 (`k.a`, `k.b`, `s.c`), one for category 3 (`s.c`), and none for categories 4–6. These are per-instance values, separate from the immutable numeric item definition.
- `an.c(byte)` initializes five equipment slots: weapon categories 0–2, then categories 3, 5, 6, and 4. Its class-6 starter uses categories 0/5/6/4 item 0; class 7 uses 2/5/6/4 item 0; class 8 uses 1/3/5/6/4 item 0. This setup creates the initial items without enhancement rolls.
- `an.n()` sums the four signed enhancement bytes with byte wrapping. It derives max HP/SP from the class base, the corresponding enhancement total, and level; attack from weapon base/upgrade plus the class attack and first enhancement total; and defense from slots 1–4, upgrades, the class attack/enhancement term, and `level / 3`.
- `an.b(byte, byte)` swaps an inventory entry with its matching equipment slot. The old item returns to that inventory index, or the selected item is removed if the slot was empty.
- Each `/itm/NN` resource is a sequence of one-byte-length-prefixed records. Records contain a type byte, two length-prefixed text fields, a little-endian signed integer, a 12-byte equipment block and category-specific subtype bytes. The converter emits these numeric fields only; text remains in the locale tables.

## Web port

- M71 extracts a local numeric catalog for categories 0–6, creates source-shaped equipment state for event rewards and ground pickup, keeps equipment as one item per inventory slot, and serializes enhancement/subclass bytes through browser saves.
- M72 adds the five source slots, starter equipment for classes 6–8, inventory/equipment swapping from the system menu, backward-compatible browser-save persistence, and source-derived max HP/SP, attack, and defense calculations. The derived profile now feeds basic attacks and incoming melee/projectile defense. M73 also uses weapon subtype bytes 0 and 1 for the source critical threshold and critical damage bonus. Equipment entries from pre-M71 browser saves receive a deterministic zero-enhancement instance state on load. Automated coverage checks class-6 starter values (72 HP, 60 SP, 16 attack, 5 defense), enhancement/upgrade terms, swapping, legacy state migration, and save validation.
- The event capability check can now resolve positive category-0–6 awards from the loaded catalog. This addresses the item-category gate in map 76/script 7 in code; the full stream still needs runtime verification.

## Limits

- The equipment screen still lacks a dedicated unequip action; swapping out gear is supported when another compatible item is equipped. M77 adds localized catalog names and shop, upgrade, identification, and orb-attribute services (see [FND-0033](FND-0033-shop-refiner-blacksmith.md)). Weapon subtype status/element effects remain open.
- M88 maps class-6 weapon, armor and head item IDs to source image groups and renders the starter weapon in a controlled New Game browser run ([capture manifest](../../reference/screenshots/web-render/M88-player-equipment-render/capture.json)). Alternate gear appearance, weapon/effect palette recoloring, shield visuals and runtime checks of class-7/8 equipment appearance remain incomplete.
- Bonus-roll RNG position and resulting values, equipment screen flow, and resulting combat stats have not been compared against a live J2ME run. M72 has no controlled browser capture, and M77 has no service-screen capture. Browser saves are not source RMS-compatible, and the category-6 event stream still needs runtime verification.
