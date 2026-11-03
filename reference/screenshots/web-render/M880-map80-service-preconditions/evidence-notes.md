# M880 — Map80 Refiner and Blacksmith preconditions

Continued the visible level-99 New Game session from M879 at Map80 after the Potion purchase and sale. The profile had 394,392/394,392 HP, wallet 180, an empty inventory, and four equipped +0 items.

- Refiner's orb flow had no eligible equipment targets or orbs. The empty action showed “Choose your item.” Mix opened with no selected ingredients; invoking Mix showed “You must select 2 or more materials.”
- Blacksmith's upgrade list contained the four equipped items. Its identification list was empty. Invoking Identify showed “Not identified,” although locale string ID2363 is “There is no device to identify”; this capture records the behavior before the follow-up message correction.
- No confirmation was accepted and no transaction was committed. Wallet, inventory, equipment, HP, and captured game/quest flags stayed unchanged.

The recorder reported an assertion error because it expected the Blacksmith menu after an Escape that had already closed it. The final runtime snapshot confirms Map80 with no service menu open; this was a recorder guard error.

This is current-build browser evidence for empty-state handling, not a J2ME comparison or a successful Refiner/Blacksmith transaction. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used. See `capture.json` and the adjacent screenshots.
