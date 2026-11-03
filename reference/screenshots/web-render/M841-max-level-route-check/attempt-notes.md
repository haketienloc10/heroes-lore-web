# M841: Max-level visible New Game route check

The Vite development build was opened on the isolated origin `127.0.0.1:5174`. A visible New Game activated `?testProfile=max-level`, producing a level-99 Ronin with 32,767 in each attribute. Sampled checkpoints showed 394,392/394,392 HP. The run reached Map80, opened all three commerce services without transactions, and continued through Maps 60, 61, 1, 51, and 3.

The Map51 Temple of Earth and Map3 civilian-access guards both displayed refusal dialogue. The route therefore stops at Map3 `(7,19)` for this run; Map4 and later maps remain unverified here. The gate dialogue is a gameplay progression condition, separate from surviving combat. This evidence does not establish that all campaign content is implemented or that the port is complete.

The campaign-test profile activation was previously captured with REA evidence `ev_ede7599e5582a739d688ad8da55d00b04ab08bd223a64fdbcc698358f65d3af4`. Screen captures and the full checkpoint summary are in [capture.json](capture.json). No in-game Save/Load, browser-storage inspection, original-JAR access, local-save access, direct map start, or gameplay-state seeding was used.
