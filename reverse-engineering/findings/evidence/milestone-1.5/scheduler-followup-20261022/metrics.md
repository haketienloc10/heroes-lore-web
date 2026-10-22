# Follow-up metrics SCN-0004 (2026-10-22)

**Scope:** cold-start, no-input window (A) and real UI save-load transition (D).
**Accepted sample:** 12 runs: A/D × baseline/trace × 3. Invalid instrumentation pilots remain excluded.
All windows are 30 s. XDamage is a host receive-time proxy, not physical presentation.

## Variant A — cold start, no input

| Mode | XDamage counts across three runs | Median rate (Hz) | Trace scheduler rate (Hz) | Helper sleep calls |
|---|---|---:|---:|---:|
| baseline | 452, 450, 451 | 15.033 | — | — |
| trace | 450, 449, 450 | 15.000 | 15.000 | 450, 449, 450 |

The three A trace runs had zero drops and zero field-read errors. X11 window captures are heterogeneous: the logo is visible at the 15 s checkpoint in 4/6 accepted runs and at 45 s in 2/6; the others show a blank white canvas. The cause is unresolved. During these windows m.e:I was unavailable because gameplay/menu state was not active. br.d:Z was true, ag.a:Z was false, and the helper called Thread.sleep 449–450 times per run; no helper yield occurred. The requested sleep median was 65 ms (p95 66 ms); observed before/after sleep brackets are in aggregate.json. This cold-start sample is not a stable menu or gameplay cadence.

## Variant D — save-load transition

| Mode | XDamage counts across mixed 30 s windows | Median receive rate (Hz) |
|---|---|---:|
| baseline | 383, 384, 382 | 12.767 |
| trace | 380, 382, 381 | 12.700 |

The D window spans menu input, save selection, and loading; its receive rate is mixed-state data, not stable cadence. A byte-level audit found that all six D `04-after-load.png` files are identical (SHA-256 `4cbff7a7b4c0aba5fb17876eb0102cb413323ce12e40bbf683abe1f0bcfd2015`). They show the house interior, player character, and HUD; the black pixels surround the room. A new uninstrumented user-operated baseline produced the exact same X11 bytes, while a separate frontbuffer image also shows the room. The cross-campaign audit of all 24 P1M `04/05` frontbuffer and 9 X11/diagnostic PNGs likewise confirms the full house scene; the earlier HUD-only classifications were errors. See `hud-after-load-hash-audit.json`, the amended P1M `review.json`, and `M15-SCN-0004-E-hud-diagnosis-R01/hud-diagnosis-result.json`. Each accepted trace records worker mode 1 reaching m.b(BBBB)V at original BCI 168, followed by a q.b:Z=true store, and mode 2 calling bt.a()Lad; at original BCI 49. In all three traces, object identity links Display.callSerially to the later br.run callback. Each D trace window also includes 382–384 Thread.sleep calls and one Thread.yield call.

D traces retain m.b:B pending-slot writes and m.c:B/m.d:B snapshots. q.b:Z is stored true by worker mode 1, then false on the UI path after the command; this is a recorded path, not an exhaustive overwrite/interleaving proof. Field reads are sequential, not an atomic snapshot. All accepted D trace runs had zero dropped events and zero field-read errors.

Repaint-to-paint evidence is a candidate request set at AWT paint entry. One callback can have multiple candidate request IDs; this does not prove one-to-one causality. XDamage is not compositor presentation or visible-frame latency.

## Excluded pilots and remaining limits

- A trace R01: excluded after a probe VerifyError; the operand-stack marker was corrected in the later build.
- D trace R01: partial route pilot; final image was still the loading screen and worker fields were unavailable.
- D trace R02: partial route pilot; early worker-class lookup caused 45,034 field-read errors.
- ag.a:Z=true, physical repeat/multiple-key input, compositor presentation, the blank white cold-start A captures, and every possible worker interleaving remain unverified. The reviewed gameplay screenshots show the house; they do not establish a HUD-only rendering failure. The Camera Off run separately records 1,582 false branch operands after a state-2 gameplay checkpoint; all 791 complete branch segments containing calls use `m.i→m.g`. See the [render-order analysis](M15-SCN-0004-E-render-order-R01/render-order-analysis.json). Eight terminal event sequence values were absent from the serialized trace at shutdown, so the incomplete tail segment is excluded.
