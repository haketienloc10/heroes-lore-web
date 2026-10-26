# FND-0056 — Camera-On focus stays fixed during event mode

## Question

How does source mode 4 update and render the camera while an ordered event is active?

## Reference and checked source

- Reference build: Heroes Lore: Wind of Soltia v2.1.2, pinned JAR SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Evidence inspected: the repository's existing JADX source output. No actual JAR was opened and no J2ME runtime was used for M326.
- Methods: `ar.java:77–99`; `ag.java:477–504,885–895`; `m.java:266–269,279–303`; `ad.java:688–700`.
- Browser implementation: `web/src/rendering/WorldScene.ts` and `web/src/world/event-cutscene.ts`.

## Verified source behavior

- `ar.paint()` mode 2 runs gameplay updates and, when Camera is enabled, calls `m.a(true,true)` to ease the visible camera focus. Mode 4 instead calls `m.j()`, `ag.m12b()`, then draws the event frame; it does not call the gameplay camera easing method.
- `ag.m12b()` calls `m.g()` while hero follow is enabled. `m.g()` changes the target fields `m.f270a/m.b`; it does not change the displayed Camera-On fields `m.c/m.d`. With camera motion enabled, `m12b()` also changes the target fields directly.
- `ad.a(Graphics)` renders from `m.c/m.d` when Camera is enabled and from `m.f270a/m.b` when it is disabled. Its map-level fixed-camera flag overrides that selection and uses `m.f270a/m.b`.
- Opcode 34 enables hero tracking, calls `m12b()`, and copies the resulting target into `m.c/m.d` once. Later mode-4 calls update the target without repeating that copy. This explains the explicit one-time focus snap followed by a held Camera-On display focus.

## Conclusion and implementation

- M326 holds the displayed Camera-On focus during ordered event mode. Opcode 34 sets a pending one-time snap; the next event camera update copies the hero target into the displayed focus and clears the pending marker. Camera Off continues to render the event's live target.
- Cutscene tests check that opcode 34 records the one-time snap request, and the camera-policy test covers regular follow, Camera-On hold/snap, and Camera-Off live-target selection. No browser integration or J2ME visual comparison was performed.

## Verification and limits

- M326 full gates: 58 Vitest files / 479 tests, TypeScript typecheck, production build (1,533.90 kB minified JavaScript chunk; existing Vite >500 kB warning), 41 Python converter tests, `git diff --check`, and event/enemy/hero/NPC coverage audits.
- Mode-4 paint cadence and Camera-On pixel/timing parity remain open. M327 separately identifies and implements the map-13/map-15 fixed-camera override; Camera-Off NPC-follow behavior is not established here. No browser, browser storage, in-game Save Game, actual JAR, or J2ME runtime was accessed. See [FND-0045](FND-0045-source-camera-follow.md), [FND-0053](FND-0053-ordered-event-modal-timing.md), [FND-0057](FND-0057-fixed-map-camera-offset.md), and the [roadmap](../../ROADMAP.md).
