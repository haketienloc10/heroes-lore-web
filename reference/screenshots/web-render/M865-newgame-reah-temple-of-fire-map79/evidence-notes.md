# M865 evidence notes

A visible New Game on the developer-only max-level profile reaches Map64 after 56 visible Enter inputs through the opening. The same live page follows Map64→Map0→Map63. A visible Map63 NPC interaction sets game flags 1, 4 and 75 and quest flag 1. Returning through Map0 to Map27 now opens the story event and the Reah rescue. Five visible confirmations at Map27 marker `-6` complete “An absent friend Quest completed!”, show “Received 300 EXP”, and transfer to Map64. The village dialogue then shows “Temple of Fire Quest acquired!” and the final route reaches Map79.

The Map27→Map64 runner trace ends at the marker approach with dialogue visible; the five-confirmation continuation is recorded in `event-observations.json` and the succeeding Map64 route trace. Max-level HP remains 394,392/394,392 throughout. Map79 has no enemy placements in the captured data. Its NPC at marker 6 gives Blacksmith/Refiner directions and leaves the recorded flags unchanged.

This establishes these captured browser routes and interactions only. It does not establish the remaining campaign, ending, J2ME parity, or ordinary-level balance. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.
