# M879 — Map80 shop purchase and sale

A fresh temporary Chromium profile started a visible New Game with the developer-only max-level profile. The campaign reached Map60 after the Map63 chief event and Reah rescue. From Map60 (17,38), 43 visible movement inputs reached Map80 (10,18) without attacks or HP loss; the route trace and arrival screenshot are included.

At Map80, visible keyboard input reached the Shop marker and opened its menu. The browser UI then completed one purchase and one sale:

- Purchase: Potion (category 7/item 0), one unit at 150 GOLD; wallet 300 → 150, inventory gains one Potion.
- Sale: one Potion returns trunc(150 / 5) = 30 GOLD; wallet 150 → 180, inventory returns to empty.
- The hero remains at level 99 and full HP. Closing the Shop returns to Map80; recorded game and quest flags do not change.

No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used. No save was made.

This is current-build Chromium evidence for one successful Shop buy/sell path. It does not establish J2ME parity, other shop items/quantities, Refiner or Blacksmith transactions, or full commerce coverage. See capture.json, map60-to-map80-route.json, and the adjacent screenshots.
