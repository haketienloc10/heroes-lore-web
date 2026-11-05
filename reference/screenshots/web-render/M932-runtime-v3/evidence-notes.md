# M932 — Live NPC occupancy in developer runtime telemetry

A visible New Game on `http://127.0.0.1:5174/?testProfile=max-level` reaches Map0 `(22,4)` through the normal startup controls. The level-99 hero has 394,392/394,392 HP and SP. The DEV-only runtime snapshot v3 reports 12 NPC placements, of which 9 are visible and currently occupy map cells; it includes source order, image ID, pixel/tile position, facing, moving state, and cell occupancy. One visible NPC is at `(10,16)`. The capture is taken with dialogue open and does not claim further route progress or NPC parity.

The capture used visible keyboard input and read only the DEV runtime attribute. It did not use in-game Save/Load, inspect browser storage, access a local save or the original JAR, start directly on a map, or seed gameplay state.

Verification: `npm test --workspace web -- campaign-test-profile.test.ts` passes 7/7; `npm run typecheck --workspace web` passes; `npm run build --workspace web` passes with the existing Vite chunk-size advisory. Searching production assets for `heroes-lore-campaign-test-runtime-v3`, `data-test-runtime`, and `testProfile=max-level` returns no matches.

Artifacts: [runtime snapshot](runtime-snapshot.json), [capture record](capture.json), and [browser frame](map0-runtime.png).
