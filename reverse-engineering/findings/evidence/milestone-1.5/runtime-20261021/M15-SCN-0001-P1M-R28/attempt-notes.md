# M1156 — synchronized Map64 actor capture, attempt 3

## Outcome

A fresh visible New Game reached Map64. Read-only snapshots record the source actor at `(9,8)`, then `(7,8)` after two visible Left inputs. The source idle at `(7,8)` matches the level-99, full-HP DEV web reference at the same tile after camera translation `(-3,-4)`, with 0 changed pixels across 65,412 overlapping pixels.

A 350 ms visible Right hold produced 69 frontbuffer samples. The player ended at `(10,8)`. Pixel comparison finds exact full-playfield matches, including the actor, for source samples 16, 44, and 58 against web walk poses 0, 1/2, and 3 at camera translations `(-8,-4)`, `(-2,-4)`, and `(-1,-4)`. Each pair has 0 changed pixels across 64,032–65,964 overlapping pixels ([comparison](walk-comparison.json)).

This reopens the previously blocked Map64 walk-comparison work with synchronized start position and a matching idle image. It establishes sampled Right-facing pose parity. The source animation cursor is not directly exposed, and the short capture does not establish exact cadence, all four directions, or the full scenario-comparison requirement.

## Evidence

- [Launch and isolation record](launch.json), [visible inputs](input.log), [capture log](right-walk-capture.log)
- [Source actor at Map64 `(9,8)`](state-map64-start.log), [source actor at `(7,8)`](state-after-left-2.log), [source actor after Right at `(10,8)`](state-after-right.log)
- [Source idle at `(7,8)`](../../../../../reference/screenshots/M15-SCN-0001-P1M-R28/18-source-idle-7-8.png), [web DEV max-level idle](../../../../../reference/screenshots/web-render/M1059-player-walk-frames/attempt-2/01b-prewalk-idle.png)
- [Matched source Right pose, ordinal 16](../../../../../reference/screenshots/M15-SCN-0001-P1M-R28/20-right-0016.png), [web frame 0](../../../../../reference/screenshots/web-render/M1059-player-walk-frames/attempt-2/02-walk-frame-0.png)
- [Matched source Right pose, ordinal 44](../../../../../reference/screenshots/M15-SCN-0001-P1M-R28/20-right-0044.png), [web frame 1](../../../../../reference/screenshots/web-render/M1059-player-walk-frames/attempt-2/walk-frame-1-1.png)
- [Matched source Right pose, ordinal 58](../../../../../reference/screenshots/M15-SCN-0001-P1M-R28/20-right-0058.png), [web frame 3](../../../../../reference/screenshots/web-render/M1059-player-walk-frames/attempt-2/walk-frame-3-3.png)
- [Stop record](stop.json)

## Isolation and limits

FreeJ2ME used a new run-specific working directory and RMS. Actor coordinates were read from primitive fields; the capture agent read framebuffer pixels and sent a visible emulator AWT key input. It did not write game fields. No existing save was opened, no in-game Save/Load action was sent, and the pinned JAR was neither inspected nor modified. The source New Game character was not max-level; the web comparison used the DEV max-level profile at level 99 and full 394,392 HP. No enemies were present in the captured bedroom route.
