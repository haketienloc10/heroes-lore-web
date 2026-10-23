# FND-0031 — Player attack chain actions

## Question

How does the source accept and animate light/heavy attacks, schedule hit frames, and apply combo damage?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- REA inventory confirms `an.class` is an entry in the pinned archive. Evidence: `ev_2b2d621e1d3e9b798c02223f09e2b01eef6f2515d7c7bcdcae9a2ba60dc242c8`; focused inventory: `ev_8ce94899f9d24b1f6bca1442e68cef0c9b499db867e56fa7591b313f42de80c4`.
- Behavior was derived by static inspection of JADX output for `an`, `ar`, `m`, and `ak`, and corroborated against `javap -c -p` output for `an`, `ar`, and `m`. This is not J2ME runtime evidence. No controlled browser combo replay was captured for M73.

## Source behavior

- `ar` maps key code 53 to `m.a(false)` (light) when pickup/menu checks permit, key code 55 to `m.a(true)` (heavy), and game action 8 to a light attack when pickup and event checks permit. `m.a(boolean)` delegates to `an.a(boolean)` and starts actor state 3 when the chain is accepted from idle.
- `an.a(boolean)` rejects when the current actor state disallows an attack, the next stage is at or above `z`, or recovery `t` is positive. It preserves an already queued next stage. It rejects follow-ups after a heavy stage, rejects heavy after stage 0, and rejects light after stage 3. The next slot stores 1 for light or 2 for heavy.
- `an.d()` advances the signed-byte animation frame once per source update and calls `an.o()` during attack state 3. `an.o()` uses class-specific frame thresholds: class 6 light `[4,4,4,4,0]`, heavy `[4,0,4,4,8]`; class 7 light `[3,3,3,6,0]`, heavy `[4,0,7,9,14]`; class 8 light `[3,3,3,3,0]`, heavy `[3,0,3,3,6]`. Queued stages transition on equality with the current threshold and reset the frame to zero.
- Hit frames are class/style/stage dependent. Light uses frame 2 for class 6 and frame 1 for classes 7/8. Heavy class 6 uses frame 2 except stage 4 at frames 1 and 6; class 7 uses frame 1 except stage 4 at frames 0, 2, 4, 6, 8, 10 and stage 3 at frame 4; class 8 uses frame 1 except stage 4 at frame 4.
- `an.m15a()` applies light-stage factors `[10,12,13,14,17]/10`, or heavy factor `17/10`, then adds `cj.f245a.nextInt() % (power/10)` when power is at least 10. `an.e()` performs a raw-random critical check using dexterity, SP, and weapon subtype byte 0. `ak.a(...)` applies weapon subtype byte 1 as a conditional damage bonus in tenths. On follow-up stage entry, `an.o()` charges `weapon.equipmentByte / 4 + 4` SP, multiplied by `7/5` for heavy, and ends the chain if SP is insufficient. `an.h(int)` sets recovery to 1 update for light and 3 for heavy.
- `an.e(Graphics,...)` draws attack stages from character animation slots 3–10: stage 0 selects 3 or 7 by style, stage 1 uses 4, stage 2 selects 5 or 8, stage 3 selects 6 or 9, and stage 4 uses 10.

## Web port

- M73 adds an engine-independent combo state machine using the source 71 ms update, combo limit, style restrictions, frame thresholds, impact frames, follow-up SP cost, recovery, and light/heavy power factors.
- Keyboard 5/Numpad5 and 7/Numpad7 initiate light/heavy strikes. Touch controls expose both actions. Hero drawing loads and selects the source attack animation slots. Attack impacts feed the existing enemy damage/reaction/reward path; raw entity randomness supplies damage variation and critical rolls, while bounded range randomness supplies target evasion.
- Automated coverage checks queue rules, class-specific frame progression, hit frames, animation slots, damage factors, critical subtype damage, and touch mappings. Typecheck and production build are recorded in the roadmap.
- M74 adds source-cell targeting for class-6 fans and the stage-4 eight-cell sweep, plus class-7 two-cell thrusts and the stage-3 light fan. Targets are resolved in source query order, including repeated queries when a two-cell enemy occupies both queried cells. See [FND-0032](FND-0032-player-combo-targeting.md).

## Limits

- M75 adds class-6 heavy stage-2/3 lunge selection and the stage-3 follow-through target query; its displacement and extra-hit behavior do not yet have browser evidence. Class-8 heavy stages 2–4 still resolve only the adjacent cell in the web; the source spawns a delayed projectile. Weapon subtype element/status proc selection, attack buffs/skill actions, and exact random-call parity for special weapons remain open.
- Browser replays have exercised the combo input path, but no controlled replay exposes enemy HP or confirms combo hit count. No J2ME comparison confirms timings, damage, visual frames, or SP cost during play.
