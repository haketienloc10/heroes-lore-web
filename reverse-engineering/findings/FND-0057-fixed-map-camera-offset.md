# FND-0057 — Maps 13 and 15 use the live camera target with a vertical offset

## Question

Which maps bypass the normal camera focus and easing, and how is their viewport positioned?

## Reference and checked source

- Reference build: Heroes Lore: Wind of Soltia v2.1.2, pinned JAR SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Evidence inspected: the repository's existing JADX output; no actual JAR or J2ME runtime was used for M327.
- Methods: `reverse-engineering/decompiled/sources/defpackage/ad.java:88–94,688–700`; `ar.java:77–86`; `m.java:266–269`.
- Browser implementation: `web/src/world/source-camera.ts` and `web/src/rendering/WorldScene.ts`.

## Verified source behavior

- `ad` sets its fixed-camera flag only when the current map ID is 13 or 15.
- The gameplay paint loop omits `m.a(true,true)` camera easing when that flag is set. The map renderer then selects `m.f270a/m.b` directly, even when the Camera option is enabled, and adds 30 to the vertical camera coordinate before viewport clamping.
- `m.g()` derives those live target coordinates from the source viewport focus and hero pixel position. In normal gameplay, Camera On computes the target before `m.i()` while Camera Off computes it after; mode 4 calls `ag.m12b()` after the event update. Absolute camera opcode 39 writes the same target coordinate fields.

## Conclusion and implementation

- M327 models maps 13/15 as direct-follow maps regardless of the Camera option. It uses the source focus `(viewportWidth / 2 - 8, (viewportHeight - 21) / 2)`, applies the 30-pixel vertical offset before clamping, uses the pre-update actor for normal Camera-On gameplay, and uses the live actor for Camera-Off and mode-4 event updates.
- Event opcode 39 now uses the same source viewport focus for absolute positions and includes the map-specific vertical offset. Existing event pan is applied over the current source target.
- Focused camera tests cover the 30-pixel offset and map-edge clamping.

## Verification and limits

- M327 full gates pass: 58 Vitest files / 480 tests, TypeScript typecheck, production build (1,534.71 kB minified JavaScript chunk; existing Vite >500 kB warning), 41 Python converter tests, `git diff --check`, and event/enemy/hero/NPC coverage audits. The audits report 385/387 supported event scripts, 329 enemy placements / 224 referenced images, 256 class-6 hero images, and 88 NPC placements with no missing paths.
- No browser or J2ME camera capture was used. Mode-4 and map-13/15 camera cadence, pixel parity, and transition timing remain unverified. See [FND-0045](FND-0045-source-camera-follow.md), [FND-0056](FND-0056-event-mode-camera-focus.md), and the [roadmap](../../ROADMAP.md).
