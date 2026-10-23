# FND-0024 — Ordered opening cutscene interpreter

## Scope

Replace the New Game opening's flattened text list and direct skip transfer with an ordered interpreter for the source map-00 script 9 commands used by the opening route.

## Source evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- `reverse-engineering/decompiled/sources/defpackage/ag.java:m11a()` dispatches text, flags, screen clear/show, BGM markers, emotions and end commands. Its `d()` handler applies hero/NPC direction and movement commands, and waits for command 4 using `arg1 - 1` update ticks.
- `ag.e()` advances localized dialogue pages before resuming the command list. `ag.i()` reads a command-7 map destination and consumes the following command 8 for hero tile placement. `ag.j()` decodes command-9/10 flag index and operation bits. `ag.a(Graphics)` paints a cleared screen for command 22 before the dialogue overlay.
- The extracted map-00 script 9 uses opcodes 1, 4, 6, 7, 8, 9, 17, 22, 49, 50 and 99. It sets game flags 54 and 87, displays 24 localized text references, clears the screen near the end, then transfers to map 64/tile `(9,8)`.

## Browser implementation

- `web/src/world/event-cutscene.ts` runs the supported commands in source order, pauses on each text command and its pages, models command-4 waits at the source 71 ms update period, and exposes flag, direction, emotion, screen and transfer state. W/Skip fast-forwards text and waits while still applying the commands before transfer.
- `WorldScene` now starts script 9 through its map trigger selection. It applies flag changes as commands run, changes the hero facing, renders the command-22 blank screen, and uses the script's command-7/8 destination for BED. The opcode-1 resolver addresses one localized string at a time so interleaved commands retain their order.
- The interpreter also tracks hero/NPC motion, NPC direction, and emotion command values. M58 adds shared rendering for hero/NPC emotion opcodes 49/50 using the original emotion image assets; the M58 map-12 replay does not independently compare the opening script-9 emotion sequence against J2ME. M59 implements source-backed hero-follow/free/pan/stop camera commands 34/35/37/38 in the shared interpreter; NPC-follow opcode 36, direct camera-position opcode 39, audio playback and other script opcodes remain unimplemented.

## Verification and limits

- Vitest: 22 files / 133 tests passed, including ordered dialogue, flag, delay, screen and transfer cases. Typecheck and production build passed. Vite reports the existing bundle-size warning; the minified bundle is 1,312.08 kB.
- `git diff --check` passed. No browser or J2ME runtime capture was produced for M49; this milestone has unit, typecheck and build evidence only.
- This is the command subset required by the opening script, not a general event-script port or evidence of full campaign fidelity. Other scripts may stop at an unsupported command; see the [ROADMAP](../../ROADMAP.md).
