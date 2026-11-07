# M1156 — synchronized Map64 actor capture, attempt 2

## Outcome

A fresh visible New Game reached the Map64 bedroom after W/Skip. The read-only actor snapshot recorded tile `(9,8)` at world pixels `(144,128)`. Two visible Left inputs moved the source actor through `(8,8)` to `(7,8)`, ending at `(112,128)`. The source idle frame at `(7,8)` matches the DEV max-level web idle at `(7,8)` after camera translation `(-3,-4)`: 0 changed RGB pixels across 65,412 overlapping pixels, including the actor region ([comparison](idle-comparison.json)).

The Map64 actor-coordinate and idle-alignment subtask now has synchronized evidence and reopens the comparison that M1155 had blocked. This does not establish walking-frame parity or exact cadence. A follow-up source Right-burst agent failed to initialize during harness setup, so no dynamic walk result is claimed. The emulator was then stopped cleanly.

## Evidence

- [Fresh Map64 scene](../../../../../reference/screenshots/M15-SCN-0001-P1M-R27/16-after-skip-idle.png)
- [Actor at `(9,8)`](state-after-skip.log)
- [Actor after first Left, `(8,8)`](state-after-left-1.log)
- [Actor after second Left, `(7,8)`](state-after-left-2.log)
- [Aligned source idle at `(7,8)`](../../../../../reference/screenshots/M15-SCN-0001-P1M-R27/18-after-left-2.png)
- [Web DEV max-level idle reference](../../../../../reference/screenshots/web-render/M1059-player-walk-frames/attempt-2/01b-prewalk-idle.png)
- [Launch and isolation record](launch.json), [visible input log](input.log), [stop record](stop.json)

## Isolation and limits

FreeJ2ME used a new run-specific working directory and RMS. Reflection read primitive actor fields only; the probe did not call game methods or write game fields. Inputs went through the visible emulator AWT KeyListener. No existing save was opened, no in-game Save/Load action was sent, and the pinned JAR was neither inspected nor modified. The source New Game character was not max-level; the matched web reference is level 99 with full HP. The alignment uses the Map64 bedroom idle scene and does not cover combat, campaign reachability, movement frames, or other maps.
