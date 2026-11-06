# M15-SCN-0006-B3-P1M-R03 — J2ME route attempt 3

This final attempt used fresh isolated FreeJ2ME session `M15-SCN-0001-P1M-R16`, FreeJ2ME-Plus 1.52, and the pinned read-only JAR (SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`). Its own launch metadata is in `launch.json`; the session was stopped by the harness and reports `process_stopped: true` in `stop.json`. The probe only dispatched synthetic AWT key events and read snapshots/framebuffers; it wrote no game fields. No user save or RMS contents were accessed.

After W and a longer scene-settling wait, two observed Down holds reached outdoor Map0. The preserved route reached Map0 `(20,2)`; an extra north input entered the source marker and transferred to Map27 `(5,37)`. A read-only snapshot there records 72/72 HP and 18 enemy entities.

The collision-grid route toward the Map27 north exit did not reach the marker. Its checkpoint shows Map27 `(28,7)`, 24/72 HP, and 18 enemy entities. After the final north approach, the player snapshot records 0/72 HP at `(28,7)` and the framebuffer shows the title menu. The precise attacker was not isolated. Map17 and its behavior-3 enemy 8 were not reached, so no behavior-3 attack sample was collected.

Plans, input log, state snapshots, and screenshots are retained in this directory and `reference/screenshots/M15-SCN-0006-B3-P1M-R03/`. The three-attempt allowance for this source-runtime route check is exhausted; the outcome does not establish a game defect or a timing/damage mismatch.
