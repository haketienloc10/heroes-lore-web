# FND-0028 — Source epilogue and credits sequence

## Question

What does event opcode 20 do at the end of the story, how are the character epilogue and shared credits paced, and how can the browser port hand the source event flow into that sequence?

## Source identity and tools

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Examined JADX output `reverse-engineering/decompiled/sources/defpackage/ag.java`, `ar.java`, and `m.java`; inspected the hash-pinned generated map-08 event-operation and localized text-table assets.
- Relevant paths: `ag.m11a()` opcode dispatch, `ag` opcode-20 handler; `ar.g()` ending initialization; `ar.paint()` states 12/13; `ar.d(Graphics)` epilogue; `ar.e(Graphics)` credits; `ar.h()` shared credit/image loading; `m.a(int)` state transition handling.

## Evidence and conclusion

- `ag` labels opcode 20 `GAMEOVER`. Its handler stops the active event with `c()`, changes the cadence through `br.f158a.g()`, then requests screen state 12 with `m.a(12)`.
- Entering state 12 calls `ar.g()`: the game initializes `f82e` to `-16`, resets the epilogue cursor, and loads `/sgui/ed{heroClassId}`. In `ar.d(Graphics)`, 16 paints cover the screen from white toward black. The localized epilogue advances on key input; each `_N` record pauses the current page for that many frames, and a key can skip the remaining wait. At end of the character text it invokes `h()` and requests state 13.
- `ar.h()` loads shared strings from `/sgui/edsr` and selects `/img/end/{heroClassId-6}`. State 13 draws that image centered vertically, introduces ordinary credit lines every 5 game paints, scrolls each line upward 2 pixels per paint, and uses leading `-` / `=` records for 4 / 10 paint delays. A line is removed once its y position is below `-8`. After the final record and scrolling line disappear, the source requests its title/menu state.
- The pinned generated `event-operations/6/08.json` map data has script 1 ending with `[30,17,0],[20,0,0]`: quest flag 17 is set before the ending opcode. The script is localized through the map-08 string-ID table. The browser dispatcher applies executed flag changes before transferring control to the ending scene.
- The extracted TDF ID lists are `text-tables/sgui/ed6.json`, `ed7.json`, `ed8.json`, and `edsr.json`. The generated locale currently contains the referenced English entries. The three extracted ending-art PNGs are each 1×1 pixels, matching the local extractor output; their visible source-runtime appearance is not established by this finding.

## Browser implementation

- `event-cutscene.ts` treats opcode 20 as a terminal `ending` status, after earlier commands and quest flags have run. `WorldScene` passes its saved hero class to the new `EndingScene`.
- `ending.ts` resolves the source string-ID tables, models the 20-frame-per-second fade, epilogue pause/confirmation blocks, and scrolling credit cadence. `EndingScene` renders the localized strings with the extracted small bitmap font and returns to the existing startup/title flow after the last credit scrolls away. Save data persists class IDs 6–8 and defaults older saves to Ronin/class 6.

## Verification and limits

- M69: Vitest 25 files / 172 tests, 28 Python converter tests, typecheck, production build, and `git diff --check` passed. The production JavaScript bundle is 1,343.03 kB minified and exceeds Vite's 500 kB advisory.
- No ending-path browser capture, J2ME runtime comparison, or complete New Game-to-ending playthrough exists. A controlled seeded Chromium attempt (Evidence `ev_9f77244f3642bebb04ca915388f60230b1cf204faac61a95e09b3e36a7fd8f9d`) started on map 8 but its recorded screenshots do not show movement into the type-0 trigger, so it establishes no ending behavior. The attempt records the existing missing `/favicon.ico` request and no page exception. Campaign route reachability, detailed pixel/timing parity, and the visible ending art remain unresolved. Opcode 19 (`COMBO`) and other unsupported event commands remain outside this implementation.
