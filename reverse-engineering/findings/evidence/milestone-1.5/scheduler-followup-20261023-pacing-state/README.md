# SCN-0004 follow-up — pacing sleep/yield by state, 2026-10-23

## Goal and method

Classify calls made by `br.b()V` to its `br.a(JJ)V` pacing helper, then distinguish the helper's `Thread.sleep(J)` and `Thread.yield()` callsites by the latest observed game-state store `m.e:I`. Three independent copies of `HOUSE-INPUT-001` were run with `phone:Motorola`. The scripted AWT route loads the save, reaches gameplay, and starts the house exit. A probe queues one normal AWT W/Right Soft event after the original game setter stores state 4, so the same route also reaches the already-confirmed `ag.a:Z=true` bypass.

The probe records state setter events, `br.b()` branch operands, helper entry, and markers immediately before the original `Thread.sleep` and `Thread.yield` calls. It does not use reflection, call game methods directly, or write game fields. The JAR and emulator inputs are hash-pinned; the game runs from an isolated instrumented copy. This is synthetic AWT input, not a physical-key measurement.

## Results

All three traces are sequence-contiguous, have zero collector drops, and place every trace event on `EventProcessing-Thread`. Every `br.b()` span has one bypass operand marker. False branches enter `br.a(JJ)V`; each observed helper span has exactly one sleep or yield callsite.

| Last observed `m.e:I` state | `br.b` spans, total | `ag.a:Z=true` bypass | `Thread.sleep` | `Thread.yield` |
| --- | ---: | ---: | ---: | ---: |
| 1 | 105 | 0 | 105 | 0 |
| 2 | 384 | 0 | 384 | 0 |
| 4 | 12 | 6 | 6 | 0 |
| 9 | 125 | 0 | 122 | 3 |
| Before first observed state store | 400 | 0 | 397 | 3 |

State 4 contributes two helper sleeps and two bypass spans per run. State 9 has one yield in each run; the remaining observed pacing-helper calls in that state sleep. The pre-first-store spans are kept separate and are not attributed to a state.

Complete `br.a(JJ)V` entry-to-exit durations (milliseconds, pooled across the three route runs; nearest-rank p95): state 1 sleep **n=105, median 200.140, p95 200.414**; state 2 sleep **n=381, median 70.252, p95 71.331**; state 4 sleep **n=6, median 70.220, p95 71.297**; state 9 sleep **n=122, median 49.308, p95 50.522**; state 9 yield **n=3, median 1.142, p95 1.274**. Three additional state-2 helper spans (one per run) had no exit at shutdown and are excluded from duration statistics. Before the first observed state store, the 397 complete sleep spans have median 65.147 ms and p95 66.367 ms; three yield spans have median 1.582 ms and p95 1.820 ms. Entry-to-exit duration includes probe overhead and helper computation around the wait; it is not the `Thread.sleep` argument or pure blocked time.

The [aggregate](aggregate.json) contains per-run counts; each run folder contains raw trace, health, route metadata, analysis and a SHA-256 manifest. The [build manifest](../../../../../reference/recordings/scheduler-probe-followup-20261023-pacing-state-r1/build-manifest.json) pins instrumenter, probe, source JAR, emulator, transformed game and agent. The top-level [manifest](manifest.json) pins all evidence and documentation files.

## Limits

This adds runtime callsite evidence for states 1, 2, 4 and 9 on one save-exit route. State attribution is based on `m.a(I)V` setter events on the single observed game thread and applies only between those stores. Sleep/yield markers are emitted immediately before each call. Helper entry-to-exit includes the blocking call, probe overhead and helper computations; it does not isolate pure blocked time, establish deadline accuracy, or measure presentation. Other game states, other routes and physical keyboard behavior remain unmeasured. The sample does not close the remaining paint-to-presentation or natural CF-04 reachability questions.
