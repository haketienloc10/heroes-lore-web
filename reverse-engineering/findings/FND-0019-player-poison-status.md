# FND-0019 — Behavior-1 poison status

## Question

What status does a behavior-1 enemy apply, how long does it last, and how does it affect player HP?

## Reference and method

- Reference artifact: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{an,n,ce,cd}.java`.
- Bytecode check: `javap -classpath original/heroes-lore-v2.1.2.jar -p -c an n ce`; inspected player damage, update, status insertion, icon rendering and save serialization methods.
- Browser evidence: seeded M41 Chromium replay at map 19; this is a controlled web replay, not a J2ME comparison.

## Verified source behavior

- In `an.a(ak, short, byte)`, the player first resolves evasion. On a non-evaded hit, it applies damage and then, only when `ak.f49a.d == 1`, rolls `g.a(0, 99) < 15`; success inserts status ID 7 through `n.m110a(7)`.
- `ce` stores a counter and uses duration table `{40, 40, 40, 40, 40, 140, 160, 80}`. `n.m110a()` resets an existing effect with the same ID instead of stacking another one.
- In `an.d()`, status ID 7 advances once per player update. Every tenth counter update, while HP exceeds 1, it subtracts `maxHP / 25`, limited to `HP - 1`. It also emits the source floating number `maxHP / 12`. The effect is removed at update 80, after that update's poison check, so the full duration can produce eight pulses.
- `cd.i()` loads the `/img/keepst` background and eight status icons. `ce.a()` draws the icon indexed by the status ID; poison 7 uses the eighth icon (`keepst/008`). Antidote category 10 removes active status 7; see [FND-0011](FND-0011-quick-items.md).
- `an.m26a()` serializes player stats and equipment but does not serialize the active status-effect vector. The source save therefore does not restore this timed status.

## Browser implementation

- `web/src/world/player-status.ts` models poison application/refresh, the 80-update duration, ten-update pulse, HP floor, source damage-number amount and Antidote removal synchronization.
- `WorldScene` applies the source 15-percent roll only after a non-evaded behavior-1 hit, advances poison on the 71 ms world-update cadence, updates HP/HUD and renders the original `/img/keepst` background/icon frames above Ronin.
- Tests cover the chance branch, timer refresh, all eight poison pulses, HP clamping, expiration and cure. Timed status state remains transient, matching the inspected source save serializer.

## Controlled browser observation

- Evidence: [M41 capture manifest](../../reference/screenshots/web-render/M41-player-poison/capture.json).
- The seeded map-19 run loaded Ronin at `(10,9)` with 500/500 HP beside behavior-1 enemy 10 at `(10,10)`. A deterministic random queue exercised a non-evaded hit and the poison branch. The later gameplay capture shows the poison marker above Ronin; System Save recorded 295/500 HP after about 6.7 seconds of stationary gameplay.
- Chromium recorded no page exceptions, console errors or failed network requests. The page requested a missing `/favicon.ico` and received HTTP 404.

## Limits

The deterministic replay exercises the 15-percent branch and does not estimate natural trigger frequency. The saved HP change is cumulative across melee and poison; individual hit amounts and poison-pulse timestamps were not isolated. This is not a J2ME comparison, and source attack/poison timing and pixels remain unverified at runtime. Other player status effects and broader status resistance/application rules remain incomplete.
