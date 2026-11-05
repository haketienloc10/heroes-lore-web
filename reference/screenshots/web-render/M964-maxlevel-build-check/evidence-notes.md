# M964 — Max-level DEV build verification

The already-open DEV `max-level` session shows the Map27 desert encounter and the `Dust / LV 1` enemy target panel. This is a passive screenshot of the current page; the route itself is documented in [M928](../M928-target-hud-bottom-border/evidence-notes.md), so M964 does not claim a new route replay.

The modified web code passes TypeScript checking, the full web test suite (60 files / 535 tests), and the production build. `git diff --check` is clean. Vite reports the existing chunk-size warning for the 1.28 MB bundle.

This check confirms the current DEV canvas renders the panel in an active encounter. It does not establish regular-level balance, all combat timing, or J2ME runtime parity. The max-level profile remains a test aid; the port is still in progress.
