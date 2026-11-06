# M15-SCN-0005-P1M-R13 — focused Map27 melee attempt

## Scope and setup

Third and final attempt at a live FreeJ2ME timing/damage observation for ordinary enemy behavior 0/1. The pinned game JAR was opened read-only in a new emulator working directory with an empty profile. The sequence used the fresh visible New Game flow, then the preserved direct Map27 route. No JAR was modified and no normal FreeJ2ME profile or user save was used.

- Pinned JAR SHA-256: `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- FreeJ2ME-Plus 1.52 SHA-256: `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445e8e92dd0297e12df0e`.
- Launch and isolated working directory: [launch.json](launch.json).
- Route input and source snapshots are in this folder; emulator frontbuffer images are in `reference/screenshots/M15-SCN-0005-P1M-R13/`.

## Observations

- The fresh route reached Map27. The initial source snapshot records Ronin HP 72 at `(5,37)` and 18 enemy entities ([combat-baseline.log](combat-baseline.log)). The first screenshot marked `before-raw53-close.png` was captured while the map was still loading; a later capture after five seconds shows Map27 ([after-load-wait.png](../../../../../../reference/screenshots/M15-SCN-0005-P1M-R13/after-load-wait.png)).
- During the next 2.4 seconds with no player input, enemy 24/order 15 moved from `(11,33)` to `(22,33)`, and another enemy changed tile and cooldown. Ronin HP stayed 72 ([baseline](combat-baseline.log), [after 2.4 s](combat-after-2400ms.log)). This shows source AI updates did run during that interval; it is not an attack comparison.
- The visible route then moved the Ronin to `(15,35)`. A primitive snapshot records enemy 24/order 16 at `(15,34)`, visible, facing south, in state 1 with attack cooldown `p=0` and action delay `o=0`; Ronin HP was still 72 ([combat-after-approach2.log](combat-after-approach2.log), [frame](../../../../../../reference/screenshots/M15-SCN-0005-P1M-R13/approach-2-right.png)).
- The later foreground-control helper raised the emulator window and sent a host `Shift_L` key. The next frame shows the title menu; the key was not neutral for the game. The subsequent 2.4-second snapshot shows no update or damage while the game is in that menu ([focus record](focus-raise.jsonl), [menu frame](../../../../../../reference/screenshots/M15-SCN-0005-P1M-R13/focused-before-noinput.png), [snapshot](combat-focused-after-2400ms.log)).

## Result and limit

No source attack animation, impact callback, or HP loss was captured. The adjacent `p=0`/`o=0` snapshot is only a ready-state observation; it does not prove an attack should occur on that exact update. R11, R12, and R13 exhaust the three-attempt limit for this source melee comparison. Mark only the M37 behavior-0/1 J2ME timing/damage comparison BLOCKED; this is a harness limitation, not evidence of a game defect. Browser implementation work and other parity checks remain open.
