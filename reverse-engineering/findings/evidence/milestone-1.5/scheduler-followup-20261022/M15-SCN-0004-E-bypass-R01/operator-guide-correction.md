# Bypass R01 operator-guide correction

The instruction distributed before R01 to press Back/Esc was incorrect for the target branch. The attempt produced no state-4 key callback, no `ag.a(II)V` call, and no true `ag.a:Z` operand, so the game showed no visible response as expected for this internal path.

The run's copied `config/Heroes Lore/game.conf` says `phone:Standard`, although its launch metadata said Motorola. In FreeJ2ME 1.52, the `phone` config controls vendor key mapping. The input config maps host W to Right Soft; Standard maps it to raw -7, while Motorola maps it to raw -22. The game's `ar.keyPressed(I)V` normalizes -22 to -8 and routes that action through `ag.a(II)V` only in state 4.

The next run uses an isolated recording-copy override to `phone:Motorola`; the user action to try is W during the brief “NOW LOADING” transition. No JAR or source fixture is changed. See [`emulator-profile-audit.json`](../emulator-profile-audit.json), [`bypass-trace-analysis.json`](bypass-trace-analysis.json), and the corrected [runner guide](../../../../../scripts/run_scheduler_followup_bypass_trace.py).
