# M1156 — synchronized Map64 actor capture, attempt 1

## Outcome

The fresh visible New Game route reached the `NOW LOADING` screen after selecting Ronin and two guardians. The read-only snapshot still had no live player/world actor, and the captured screen remained on loading. The emulator process later ended with status 143; the cause is unknown. No Map64 coordinates, actor pose, or synchronized comparison sample was obtained. This is a runtime/harness attempt failure, not evidence of a game defect.

## Isolation and limits

The launch used a new run-specific working directory and RMS. It used visible emulator AWT key input and read-only field/framebuffer probes. No in-game Save/Load action was sent, no existing save was opened, and the pinned JAR was neither inspected nor modified.

Retained evidence: [launch.json](launch.json), [input.log](input.log), [state-after-Start-loading.log](state-after-Start-loading.log), [console.log](console.log), and [final loading capture](../../../../../reference/screenshots/M15-SCN-0001-P1M-R26/Start-loading.png).
