# User-operated Camera branch trace — completed

The user loaded the Ronin save, changed System/Options → Camera from On to Off, returned to gameplay with Back, left the game idle, and closed the FreeJ2ME window. No harness input was sent.

The first Camera Off checkpoint (`camera-off-menu`) remained in Options at `m.e:I=5`; the next checkpoint (`camera-off-gameplay`) also captured Options. These are menu evidence. The later `camera-off-gameplay-after-back` checkpoint is the valid gameplay capture: `m.e:I=2`, `br.d:Z=false`, `ag.a:Z=false`, and its frontbuffer shows the room and character. Only this later checkpoint defines the gameplay analysis boundary.

The probe records `ar.paint`, `m.i`, and `m.g`, plus the boolean operand loaded from `br.d:Z` immediately before the original `IFEQ` at BCI 94. It does not use reflection, read or write game fields, or inject input. Only a copy of the game JAR is instrumented; the original game JAR and emulator remain unchanged.

The shutdown trace contains a contiguous serialized sequence prefix. Health reports eight more assigned sequence values than serialized rows, and the final paint span has no observed normal exit; analysis excludes that censored tail. See `render-order-analysis.json` and `capture-boundary.json`.
