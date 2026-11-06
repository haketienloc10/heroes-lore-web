# M15-SCN-0005-P1M-R12 — focused source-route attempt

## Scope

Second attempt at a fresh FreeJ2ME enemy-melee timing observation. The pinned game JAR was opened read-only in a new emulator working directory; the runtime profile RMS started empty. No JAR or game fields were modified.

## Record

- FreeJ2ME-Plus 1.52 SHA-256: `92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e`.
- Pinned game JAR SHA-256: `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Session: [launch.json](launch.json), working directory `reference/recordings/M15-SCN-0001-P1M-R12` (isolated from normal FreeJ2ME profiles).
- X11 focused the FreeJ2ME canvas before the route; the focus action is recorded in [host-focus.jsonl](host-focus.jsonl).
- The automation mistakenly ran the older four-direction BED gameplay routine before the Map27 route. The final screenshot [before-raw53-close.png](../../../../../../reference/screenshots/M15-SCN-0005-P1M-R12/before-raw53-close.png) still shows the bedroom. A read-only source snapshot records Ronin HP 72, tile `(14,6)`, and zero enemy entities ([snapshot](combat-baseline.log)).

## Result and limit

This attempt did not reach Map27 or observe an enemy attack. It is a route-driver failure, not evidence about source attack timing or game behavior. The next attempt starts a fresh profile, skips the opening directly, and uses the preserved Map27 route without running the older four-direction routine.
