# M868 evidence notes

M868 repeats the New Game route on the visible level-99 test profile. It reaches Map66, accepts Reference book 1 Quest from Lesley, returns to Map63 for the book, then returns to Map66 and gives it to Lesley. The reward dialogue displays “500 GOLD is received!” and “Boots are received!”, followed by “Reference book 1 Quest completed!”.

After closing the dialogue, the live WorldScene state is Map66 `(7,11)`, level 99 at 394,392/394,392 HP, wallet 827, game flag 8 and quest flag 20 set. Inventory contains Boots (category 4/item 1, count 1) and no Reference book 1. The quest flags also retain the earlier story and book-delivery flags 1, 2, 4, 19 and 21.

The Map27 route helper stopped when the Reah event began dialogue and recorded `exit-marker-did-not-transfer`. Visible Enter inputs then advanced the event to its Map64 transfer. The next route trace begins at Map64; this is why the helper result is kept as raw evidence and not reported as a failed game transfer.

This establishes completion of Reference book 1 Quest in the browser. It does not establish the main campaign ending, remaining map routes, ordinary-level balance, service transactions or J2ME parity. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start or gameplay-state seeding was used.
