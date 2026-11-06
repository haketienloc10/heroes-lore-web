# M15-SCN-0006-B3-P1M-R02 — J2ME route attempt 2

This attempt used fresh isolated FreeJ2ME session `M15-SCN-0001-P1M-R15` and the pinned read-only JAR. It started from the visible New Game opening, sent W, then began movement after a short wait as part of a combined route plan.

The captures named `map0-outside.png`, `map27-entry-before-exit.png`, and `map17-arrival.png` still show the Map64 bedroom. The final read-only snapshot records player tile `(14,6)`, HP `72/72`, and no enemy entities. The route did not enter Map0 or Map27, so it provides no evidence about the Map27 → Map17 event or enemy behavior. The short opening wait is a plausible cause of the failed route timing, but was not isolated as the cause.

The complete plan, input log, framebuffer log, final state snapshot, and screenshots are retained with this attempt. The fresh isolated profile was stopped and its file metadata/hashes recorded; RMS contents were not inspected.
