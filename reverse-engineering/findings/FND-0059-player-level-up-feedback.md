# FND-0059 — Player level-up feedback

## Question

Which source visuals play when the player gains a level, and which of their source assets are currently available to the web renderer?

## Source evidence

- `an.r()` increments the player level, recalculates stats, appends `av(3)` and `av(4)` to the player effect list, grants three attribute points, and restores HP/SP. The loop calls it once for each crossed EXP threshold.
- `av.h` assigns 11 frames to effect type 3 and 9 frames to effect type 4. `av.a(Graphics,...)` draws type 3's shared image on frames where `frame % 4 < 3`, increments after drawing, and expires the effect after frame 10. Type 4 draws the current `/char/lvup.eif` frame through `ar.b(Graphics,...)`.
- `cd.g()` loads `_img_etcui__0.png` as type 3's shared image and loads `/char/lvup.eif` for type 4. `cd.a(true, ..., 13, -1, atlas)` reads frame/component counts and four-byte records; `ar.b(...)` draws visible image-index entries at their signed offsets. The generated output contains the standalone type-3 PNG (34×7) and `/char/lvup/000.png`–`005.png` image pages. M358 finds the already-decompiled component stream at `reverse-engineering/decompiled/resources/char/lvup.eif` and refreshes its missing generated catalog without opening the JAR.

## Browser implementation

- The shared `WorldScene.awardPlayerExperience()` path counts the source level delta and creates one type-3 flash and, when its catalog exists, one type-4 effect for each newly reached level. Enemy rewards and event opcode-12 EXP use this path.
- The type-3 flash is attached at the source draw anchor and advances after source-paced paint passes. It retains the 11-frame lifetime and 3-on/1-off visibility cycle. Pre-birth paint passes do not age a newly spawned flash.
- The converter decodes `lvup.eif` and emits `player-level-up-effects/catalog.json`; the renderer conditionally loads that catalog and the referenced `/char/lvup` pages, then paints the frame components at their source offsets for nine paint frames. The checked-in decoder tests use synthetic records. M358 adds an offline partial-refresh option for an already-decompiled resource. It verifies that the existing generated manifest identifies the pinned v2.1.2 build and that each referenced atlas page is present, then emits the local catalog and updates the ignored asset manifest. The decoded stream has nine frames and 47 components, all referencing atlas 13 with image indices 0–5.

## Verification and limits

- Six focused level-up tests cover both effect lifetimes, the type-3 flicker cycle, post-draw advancement, batched/pre-birth paints, catalog parsing, and invalid counters. A progression regression covers crossing three levels from one EXP award.
- The full web suite passes: 59 files / 490 tests. TypeScript typecheck and production build pass. The build emits a 1,272.68 kB HTML entry, an additional 435.41 kB async module, `WorldScene` at 264.79 kB, and `EndingScene` at 4.95 kB; Vite's >500 kB advisory remains. All four coverage audits pass; the Python converter suite passes 43 tests; `git diff --check` passes.
- M358 ran the offline refresh against the already-decompiled `char/lvup.eif`; the command reported nine frames / 47 components and wrote the ignored catalog. The Python converter module compiled, generated JSON parsed, referenced atlas files were checked by the refresh command, and the local Vite server returned HTTP 200 for the catalog and atlas image 000 (10×5).
- M361 replays a clean Chromium New Game through the map-27 Reah reward, reaches level 5 and completes the recovery event on map 64. A read-only observer records all nine rendered type-4 frames through Playwright’s composited page screenshots; each frame reports the catalog loaded, all six atlas textures available, and 47 components in the effect. The capture has no page or console errors ([M361 capture](../../reference/screenshots/web-render/M361-natural-level-up-browser-capture/capture.json)). It uses an empty temporary browser context with no save or gameplay-state seed; no actual JAR or saved-game file was accessed. J2ME rendered-frame and timing parity remain open.
