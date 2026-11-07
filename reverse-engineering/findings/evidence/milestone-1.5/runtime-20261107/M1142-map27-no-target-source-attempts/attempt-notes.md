# M1142 — Map27 no-target J2ME comparison attempt

## Scope and outcome

This was a source-runtime attempt to compare the current-web M1119 no-target movement observation with pinned FreeJ2ME behavior for Map27 enemy 24/order 14. The task's three-attempt limit is exhausted. No Map27 gameplay state, enemy target state, movement sample, or timing sample was observed, so this does not establish parity or a game defect.

## Attempts

1. The first sequence attach command passed the `log|plan|frames` argument without shell quotes. Bash treated the separators as pipelines; the sequence agent failed initialization before sending gameplay input.
2. The saved route plan assumed a new game was already at the Map64 opening. This fresh emulator started at the title menu. The plan's directional inputs changed the menu highlight; captures still showed the title menu, and no gameplay state was created.
3. The visible menu was advanced into New Game, Ronin selection, and the Guardian selection screen. The runtime max-level watcher was active, but it never found a player object; its log contains only `watcher_started`, and the read-only state snapshot shows no live world/player. Further key inputs did not reach a gameplay scene before the emulator process exited with code 143. The exit cause was not established.

The final startup screen is retained at `reference/screenshots/M1142-source-startup/attempt-3/after-guardian-confirm.png`; the title-menu captures show the attempt-2 precondition mismatch. Inputs and snapshots are retained in this directory.

## Isolation and limits

FreeJ2ME used a new working directory and `user.home` under `/tmp/heroes-lore-m1142-r01`. The emulator reported a missing RecordStore in that isolated profile and created emulator test data there; no RMS file contents were read. The pinned JAR hash matched before and after. The existing user save was not opened, and the level/HP override was not applied to a game actor.

M1119 remains one current-web no-target observation. This M1142 source comparison is **BLOCKED after three attempts**; do not retry without new evidence that the source game can reach a live gameplay scene in this harness. The parent port goal remains active.
