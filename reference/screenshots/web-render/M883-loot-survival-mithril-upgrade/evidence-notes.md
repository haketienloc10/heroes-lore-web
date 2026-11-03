# M883 evidence notes

A fresh visible New Game used the developer-only `loot-survival` profile: level 1, maximum supported attributes (32,767 each), and full HP. The profile starts below max level because Mithril chance is `20 + enemy reward code - player level`; at level 99 the available enemies produce a negative chance. The hero reached level 6 through normal gameplay and remained at full HP.

The browser run farmed Map27, collected one category-11/item-0 Mithril after nine kills, completed the Map63 chief route and Reah rescue, accepted the Temple of Fire quest, and reached the Map79 Blacksmith. The equipped category-0/item-0 weapon was +0 before confirmation. The Blacksmith displayed “Refined successfully!”, consumed the one Mithril, and left the weapon at +1. Final state: Map79 `(12,9)`, level 6, HP 393,276/393,276, Mithril count 0, weapon upgrade byte 1, wallet 327.

The route used visible keyboard input. Runtime reads were limited to route observation and recording. No in-game Save/Load, browser-storage inspection, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.

This establishes one successful browser-port path under the test profile. It does not establish J2ME parity, ordinary-level combat balance, physical keyboard/mobile input, or the remaining campaign and ending. See [capture.json](capture.json), [final-run-trace.json](final-run-trace.json), and [browser-upgrade-verification.json](browser-upgrade-verification.json).
