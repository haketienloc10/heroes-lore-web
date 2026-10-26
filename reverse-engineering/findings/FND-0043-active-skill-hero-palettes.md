# FND-0043 — Active-skill hero palette variants

## Question

How does the source change hero weapon and effect colors when the active skill's element changes?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static inspection: `reverse-engineering/decompiled/sources/defpackage/bt.java` and `bq.java`; the `/c1/i/e` and `/c1/i/w1`–`w5` PNG palettes were checked from the pinned archive.
- Browser replay: Chromium 156.0.8078.4, REA Evidence `ev_fdd068513a375fdcc6579d69abf310c1f9fecb12b94b4763517acbf1579fb55b`; screenshot SHA-256 `7e70a9c191cb949958bd08248bd2523c5088e0e10211fdf37d0a610d9eab3154` in `reference/screenshots/web-render/M151-active-skill-palette/`.

## Verified source behavior

- `bt.a(byte, k, boolean, byte)` passes the active skill element into weapon atlas loading. `bt.d(byte, byte)` passes it into the hero effect atlas loader.
- For weapon atlases, `bt` replaces palette blue `0x0000FF` with `0xFF7F3F`, `0x5F7FBF`, or `0x7FFF7F` for element IDs 1, 2, or 3 respectively.
- For the effect atlas, element 1 replaces `0xBFDFFF`, `0x9FBFFF`, and `0x5F7FBF` with `0xFFFFC0`, `0xFFBF7F`, and `0xFF7F3F`. Element 3 replaces the same entries with `0xDFFFBF`, `0xBFDFBF`, and `0x9FBF7F`. Element 2 leaves that atlas unchanged.
- `bq.a(old, new)` changes matching RGB triplets in the PNG `PLTE` chunk and updates its CRC; transparency and pixel indices remain unchanged.

## Browser implementation

- The pinned-JAR converter now writes per-element PNG palette variants for all 22 `/c1/i/e` images and all 20 `/c1/i/w1`–`w5` images: 104 variants total.
- M304 generalizes the converter's palette-variant selection to `/c1/i`, `/c2/i`, and `/c3/i` weapon/effect atlases and makes `WorldScene` select the matching class layout/atlas directory when that layout bundle is listed in the generated manifest. The class-8 shield lookup and renderer use `bt.f173b` when its source resources are available.
- `WorldScene` loads those variants and selects the weapon/effect folders from the current active skill's source element mapping. Neutral element uses the original palette.
- Converter tests verify exact palette replacement, unchanged transparency and image data, CRC validity, and malformed inputs. World tests cover all source folder selections.
- Full gates pass: 47 Vitest files / 359 tests, typecheck, production build (1,495.94 kB larger minified chunk; Vite's existing >500 kB warning), 40 converter tests, pinned JAR hash, and `git diff --check`.
- A controlled New Game → Ronin/Guardians → opening skip replay rendered the bedroom scene and HUD with no page errors. The screenshot is a browser scene-load check, not a J2ME comparison. A separate network capture exceeded its event budget, so it does not establish full request coverage.

## Limits

No J2ME pixel comparison confirms recolored weapon/effect appearance or update timing as the active skill changes. The current generated manifest contains only `/c1` layouts and atlases, so the new class-7/8 resource path has no local image bundle or runtime capture; the shield layout is likewise unavailable locally. The port implements the palette transforms statically verified above; campaign and general rendering gaps remain open.
