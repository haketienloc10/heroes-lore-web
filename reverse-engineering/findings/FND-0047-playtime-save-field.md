# FND-0047 — Cumulative play time in the source save

## Question

Does the pinned game persist elapsed play time, and how does it accumulate across a save/load cycle?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Inspected JADX output for `an` constructor and save/restore paths (`an.java:109–135, 1155, 1241`) and cross-checked with `javap -classpath original/heroes-lore-v2.1.2.jar -c -p an`. Constructor bytecode offsets 124–132 stores current epoch seconds in `g:I` (`f75g`); save offsets 378–393 write the previous `h:I` counter (`f76h`) plus elapsed seconds as an int; restore offsets 324–327 read an int back into `h:I`.
- The source initializes `f76h` to Java's default zero. No other source reference to `f76h` was found, so the field is persisted metadata and is not shown in the inspected UI.
- This is static source evidence. No J2ME play-time runtime comparison was performed.

## Web implementation

- Browser save data now includes `playTimeSeconds`, with signed 32-bit validation and a zero default for earlier version-one saves.
- `WorldScene` starts the session clock when its map and hero assets are ready. Manual saves add whole wall-clock seconds to the restored counter, using Java int narrowing and overflow semantics from the source expression.
- The post-credits next-cycle save accounts for time spent in the ending scene before it is written and loaded into the next cycle.
- Focused tests cover whole-second accumulation, backwards wall-clock movement, signed-int overflow, validation, round-trip persistence, and migration of earlier saves.

## Limits

- The browser continues to store JSON in local storage rather than reproducing the J2ME RMS byte layout.
- No UI displays the counter in the source or web port. Unit coverage establishes the helper and save validation; no new browser/J2ME comparison was made.
