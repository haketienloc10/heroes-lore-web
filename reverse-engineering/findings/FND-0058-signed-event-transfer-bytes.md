# FND-0058 — Event-transfer map and tile operands are signed bytes

## Question

How does the source interpret opcode-7's destination map and paired opcode-8 tile operands when their byte values exceed 127?

## Reference and checked source

- Reference build: Heroes Lore: Wind of Soltia v2.1.2, pinned JAR SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Evidence inspected: the repository's existing JADX output; no actual JAR or J2ME runtime was used for M328.
- Methods: `reverse-engineering/decompiled/sources/defpackage/ag.java:614–622`; `m.java:117–121,244–248`; `bt.java:92–98`.
- Browser implementation: `web/src/world/event-cutscene.ts` and `web/src/world/event-data.ts`.

## Verified source behavior

- `ag.i()` reads the map and direction operands from a `byte[][]`, consumes the following opcode 8, and passes both tile operands to `m.b(byte,byte,byte,byte)`.
- `m.b()` stores the map ID and tile coordinates in byte fields. On map load, `bt` passes those fields as `int` arguments; Java sign-extends them. Raw byte `255` therefore becomes `-1`, and `128` becomes `-128`.
- Standalone opcode 8 also uses Java byte operands; FND-0027 records its source movement/occupancy handler.

## Conclusion and implementation

- M328 sign-extends opcode-7's map ID and paired opcode-8 tile coordinates in both the ordered interpreter and conservative fallback resolver. The capability gate validates that the raw operands are bytes before the conversion.
- Regressions cover the source conversions `255 → -1` and `128 → -128` in both event paths.

## Verification and limits

- M328 full gates pass: 58 Vitest files / 482 tests, TypeScript typecheck, production build (1,534.89 kB minified JavaScript chunk; existing Vite >500 kB warning), 41 Python converter tests, `git diff --check`, and event/enemy/hero/NPC coverage audits. The audits report 385/387 supported event scripts, 329 enemy placements / 224 referenced images, 256 class-6 hero images, and 88 NPC placements with no missing paths.
- Negative destination coordinates or map IDs may be rejected later by destination loading, as in the source path; this change preserves byte conversion rather than asserting such destinations are valid. No browser, browser storage, in-game Save Game, actual JAR, or J2ME runtime was used.
