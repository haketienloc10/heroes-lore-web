# M844: Max-level Map48-to-Map73 hidden-marker follow-up

This continues the same visible New Game run from [M843](../M843-map51-map49-map48-followup/attempt-notes.md), with the hero on Map48 at `(6,10)` after dismissing the Guard dialogue. The live Map48 collision grid contained marker `-1` at `(5,8)`. No game or quest state was seeded.

The hero moved left to `(5,10)` and then up to `(5,9)` with visible arrow keys. At the movement boundary, the Map48 marker transitioned to Map73 `(10,18)`. This confirms the Map48-to-Map73 route under the current campaign flags. Level remained 99, HP remained 394,392/394,392, and the observed game flags `[0,1,3,5,6,54,75,87]` and quest flags `[1,2,4]` did not change.

Map73 loaded with no enemy placements. The hero moved to `(9,15)`, faced west, and used Enter on the adjacent marker `-4`; the Librarian said “A book is mental food.” Dismissing the dialogue left the hero on Map73 `(9,15)` with full HP and the same flags. The screenshot records the full dialogue.

Map73 has a decoded transfer script to Map30 for marker 2, but the loaded collision grid contains no marker 2. This run therefore verifies Map73 arrival and a local interaction, not Map30 access. The ending and full campaign remain unverified.

Inputs were ordinary visible keyboard events. Runtime state inspection was transient and read-only in memory. No Save/Load, browser-storage inspection, original-JAR access, local-save access, direct map start, or gameplay-state seeding was used.
