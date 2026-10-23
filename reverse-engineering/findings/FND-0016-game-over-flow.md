# FND-0016 — HP-zero and game-over flow

## Question

What does Heroes Lore v2.1.2 do after the player reaches zero HP, and which parts are represented by the browser port?

## Reference and method

- Reference artifact: local `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Method: static inspection of the decompiled source and extracted English TDF string tables. This finding does not claim a controlled J2ME game-over capture.
- Relevant sources: `reverse-engineering/decompiled/sources/defpackage/an.java`, `m.java`, and `ar.java`.

## Source behavior

- `an.b(int)` clamps the player's HP and, when it reaches zero, selects actor state 6, resets the animation cursor, and sets `u` to 24.
- In `an.d()`, state 6 resets the actor animation cursor. While `u` is positive, each update decrements it. On the following update, when `u` is already zero, the actor calls `q()`.
- `an.q()` requests game state 16. In `m`, state 16 selects display state 10 and initializes `ar.f82e` to 16.
- The `ar.paint` state-10 branch draws the game-over frame, decrements `f82e`, then returns to game state 1 and calls `bt.d()` when the counter reaches zero.
- The game-over drawing routine clears the 240×320 display to black, draws the player at the screen center with a 20-pixel vertical offset, and reveals localized string-table entry 32 through a horizontal clip. The extracted en-GB tables resolve this entry to “G A M E  O V E R”. The reveal width is `(17 - f82e) * 2` pixels. The state-10 key handler has no game-over action.

## Browser implementation

- `web/src/world/game-over.ts` models the 24 update countdown, the source's check after the counter reaches zero, and all 16 reveal frames on the 71 ms tick.
- `WorldScene` freezes movement at zero HP, then shows the centered hero over a black screen, reveals the bitmap text, and returns to `StartupFlowScene`. The title scene resets to its menu state so another new or loaded game can begin.
- Unit tests cover death timing, the stepped reveal widths, completion, sub-tick remainder and invalid elapsed time. The test suite, typecheck and production build pass.

## Controlled browser replay

- Evidence: [M38 capture manifest](../../reference/screenshots/web-render/M38-game-over/capture.json), with content hashes and limits for the retained screenshots.
- A seeded HP 1/72 save on map 27 reached the black game-over screen. Captures show the centered standing hero and the bitmap-text reveal, followed by the title menu. Moving the title selection to New Game and confirming opened the Ronin selection page, exercising the scene restart path.
- Chromium recorded no JavaScript page exceptions. Console and network events were not collected.

## Limits

- The actor's distinct state-6 death animation is not reproduced; the web scene holds its current standing sprite during the delay and uses that sprite on the game-over screen.
- The replay is not compared frame-by-frame with FreeJ2ME. Timing and text clipping are source-derived; the browser replay verifies the presentation and restart path only at the observed seeded state.
- This does not implement other death, status, equipment or game-over consequences outside the traced path.
