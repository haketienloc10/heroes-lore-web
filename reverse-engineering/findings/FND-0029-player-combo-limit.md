# FND-0029 — Player combo limit from event scripts

## Question

How does the pinned game raise the player's combo-chain limit from map events, and how does that value persist?

## Reference and evidence

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Method: static inspection of the decompiled source and the extracted variant-6 map event scripts. No J2ME runtime comparison was performed for this finding.
- `ag.l()` passes the first argument of opcode 19 to `an.d(byte)`. That setter only assigns when the requested value is greater than the current `an.z`.
- `an.o()` stops a combo when its current stage reaches `z` or when no following stage is queued. `an.a(boolean)` only accepts a follow-up while `q + 1 < z` and the current actor state allows it.
- `an` initializes `z` to 1 and serializes/deserializes it with `DataOutputStream.writeByte` and `DataInputStream.readByte`.
- `m.e(int)` sets a quest flag. When that flag is 29 and the selected hero class is 6, it raises `an.z` to at least 2.
- Extracted event tables contain opcode-19 values on map 60/script 8 (`3`), map 79/script 4 (`2`), and map 76/scripts 3 (`4`) and 7 (`5`). Map 79/script 4 also sets quest flag 29. At M70, map 76/script 7 was gated by its earlier category-6 inventory reward; M71 adds source equipment data and inventory-state handling, with browser/J2ME runtime verification pending.

## Web port

- The ordered event state now tracks the source combo limit and hero class. Opcode 19 treats its first argument as a signed byte and applies the source max-only update.
- Opcode 30 tracks the initial quest-29 state through the ordered command stream. Set raises the class-6 combo limit to at least 2; toggle does so only when it changes the flag from clear to set; clear and toggle-off never lower the already-saved combo limit. This follows `ag.k()` calling `m.g()`, which delegates to `m.e()` when the bit is clear and `m.f()` when it is set. The capability gate now accepts this toggle form.
- The world carries the limit across event scripts and stores it in browser saves. Older version-1 saves without the field default to 1.
- Unit tests cover the max-only/signed-byte behavior, both quest-29 toggle directions, the class-specific bonus, save/load validation and the four extracted script command streams. The category-6 gate is addressed in M71 code, but the updated complete stream has not yet been verified in the browser or against J2ME.
- M73 implements the player-side queued attack stages and uses this saved limit to gate follow-ups. See [FND-0031](FND-0031-player-combo-actions.md) for the source timing, input, hit frames, and remaining differences.

## Limits

- The limit and event-driven unlocks have unit coverage, while campaign reachability and browser/J2ME behavior remain unverified. M73 implements the queued stages, but class-specific target patterns, all weapon effects, and runtime parity are still open.
- There is no controlled browser replay or frame-by-frame J2ME comparison for these event commands.
