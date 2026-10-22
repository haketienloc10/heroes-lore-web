# User-operated dialogue trace

Use the window titled `FreeJ2ME-Plus - SCN-0004 dialogue trace safe`. Load the Ronin save, reach the Villager, open the dialogue, and pause at its first page. After that checkpoint, continue through the conversation and close this trace window to flush the two-method trace.

This build records only `ar.keyPressed(I)V` and `ag.a(II)V`. It performs no reflection, game-state reads, input injection, or game-field writes. It runs from an isolated fixture copy.
