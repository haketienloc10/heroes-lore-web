# FND-0012 — Enemy hit reaction

## Scope

Determine the source enemy sprite reaction after a successful damage call and port its update timing and directional displacement.

## Baseline and tools

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: JADX output `reverse-engineering/decompiled/sources/defpackage/ak.java`.
- Bytecode cross-check: `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ak`.
- Implementation: `web/src/world/combat.ts`, `web/src/rendering/WorldScene.ts`.
- Browser observation: REA controlled replay Evidence `ev_f1980af2b8d8bd365cbc239d3070845bfe7f1806d96b7eb58f852de49e0397ca`.

## Verified source facts

- In `ak.a(int, boolean, byte, boolean, byte, byte, an)`, a successful non-evaded damage path sets reaction state `s` to 4 and stores the direction argument in `t`. JADX shows the assignments; `javap` confirms them at method bytecode offsets 438–450.
- `ak.d()` decrements `s` once during each enemy update before its normal update branches. `javap` confirms the decrement and state write at bytecode offsets 68–85.
- `ak.a(Graphics,int,int)` adds three pixels along the stored direction vector only when `s` equals 3 or 1; `javap` confirms the state checks and coordinate adjustments at offsets 107–151. Thus the source reaction spans four map updates, with displacement on the second and fourth rendered states. This describes source control flow; no emulator frame-by-frame reaction capture was made.

## Browser implementation and evidence

- `combat.ts` stores the remaining four updates and hit direction, advances the reaction once per source map update, and returns the source three-pixel vector on states 3 and 1. `WorldScene` starts it only after a successful basic hit and applies the offset to enemy sprite position and depth. Unit tests cover all four states and the north/west vectors.
- Controlled Chromium replay seeded a valid save at map 27/tile `(9,5)`, faced east toward enemy 24 at `(10,5)`, loaded the save, and sent two Numpad5 presses with 75 ms spacing. The captured final canvas shows the `11` damage popup. Capture dimensions were 360×640; Chromium was 156.0.8078.4. There were no page exceptions or failed requests; the capture reported 423 HTTP 200 responses and one generic console message for a 404 whose URL was not captured.
- Capture manifest: [M34 capture](../../reference/screenshots/web-render/M34-enemy-hit-reaction/capture.json); [screenshot](../../reference/screenshots/web-render/M34-enemy-hit-reaction/after-hit.png). The screenshot SHA-256 is `090ae10e4a13f6d3f8dc1a20ebcf6505c924b31f269c9ed9ff8261fd7b345fc3`.

## Limits

The Chromium replay confirms a visible browser hit result and is not a J2ME side-by-side comparison. It did not measure sprite pixels against the source or compare reaction frames. The screenshot's visible `11` is the damage number; the three-pixel recoil was not independently measured from that image. Miss, critical-hit, skill, and other combat paths have not been compared for reaction behavior.
