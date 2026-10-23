# FND-0036 — Player attribute allocation and derived stats

## Question

How does the source game allocate level-up points, commit the four character attributes, and use them in player stats?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static review of JADX output for `p`, `bh`, and `an`, cross-checked against `javap -classpath original/heroes-lore-v2.1.2.jar -p -c` for the same classes.
- Controlled Chromium replay against the local Vite build. The replay seeded a level-2 Ronin save with three available points to isolate the allocation, save, and restore path.

## Verified source behavior

- The Status screen's third tab opens the allocator when unspent points remain. Its four staged rows are Power, HP, Agility, and Will, in that order.
- Right stages one point from the available pool. Left removes only a staged point. Confirm opens a Yes/No prompt; Yes adds staged values to the character's saved attributes, updates the remaining pool, recalculates player stats, and returns to the parent screen.
- The class base attributes are Ronin `(8,5,3,4)`, class 7 `(3,4,8,5)`, and class 8 `(5,8,4,3)` in Power/HP/Agility/Will order. English help text describes Power as attack, HP as health capacity and recovery speed, Agility as accuracy/evasion/critical chance, and Will as SP capacity and recovery.
- `an.n()` derives max HP from `(HP + equipment HP bonus + level) * 12`, max SP from `(Will + equipment Will bonus + level) * 12`, attack from weapon values/upgrades and Power, defense from equipment/Power/level, dexterity from Agility, and the critical threshold from Agility, Will, and weapon subtype. The source save serializes all four attributes separately from the remaining point pool.

## Browser implementation

- `web/src/world/attributes.ts` models the three class baselines, save migration, and staged increments. Existing browser saves that lack attributes migrate to their class baseline.
- The System menu now opens Status / Attributes. The screen supports staged +/- changes, selection, confirmation, undo, and derived-stat preview. Confirmed points update the player attributes and remaining pool.
- Equipment stat calculation now uses allocated attributes for attack, defense, max HP/SP, dexterity, and critical chance. Save/load carries the four attributes.

## Runtime evidence

- Seeded the web save at map 64/tile `(9,8)` as a level-2 Ronin with Power 8, HP 5, Agility 3, Will 4, and three points available.
- Opened System → Status / Attributes, staged Power +1, confirmed, and saved. The persisted save contains Power 9 and two remaining points.
- Reloaded the page, chose the preselected Load Game entry, and reopened Status / Attributes. The restored UI shows Power 9, two points, ATK 17, DEF 5, max HP 84, and max SP 72. The capture manifest records the replay, screenshots, and empty browser error lists: [M96 capture](../../reference/screenshots/web-render/M96-attribute-allocation/capture.json).
- This is a seeded save-path check. It does not establish level-up behavior in a naturally played campaign.

## Verification and limits

- Vitest: 34 files / 225 tests passed. Typecheck passed. Production build passed; its larger JavaScript chunk is 1,410.04 kB minified and Vite reports its existing >500 kB chunk warning.
- Passive HP/SP recovery rates and tick timing have not been ported or compared. The controlled browser replay uses a class-6 Ronin only; it does not compare the UI or derived stats against a running J2ME emulator. Natural progression, the map-53 Blue Brick route, and campaign viability remain unverified.
