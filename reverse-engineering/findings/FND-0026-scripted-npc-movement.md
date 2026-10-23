# FND-0026 — Scripted NPC movement steps

## Scope

Port the source NPC movement state used by cutscene commands 15 and 16. The browser models the source's per-update pixel step and direction. This is a movement primitive, not a general cutscene or NPC behavior port.

## Source evidence

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- `reverse-engineering/decompiled/sources/defpackage/ag.java:d()` maps command 15 to `ab.a((byte)2)` followed by `ab.b(direction)`: set the NPC's moving state and facing. Command 16 sets state 1 (standing), and command 17 changes direction without starting movement. `javap -c -p ag` confirms these calls and their command operands.
- `reverse-engineering/decompiled/sources/defpackage/n.java:e()` invokes its move-check hook for states 2/4, then calls `a(8)` for those states. It does not branch on the hook's boolean result. `n.a(int)` adjusts pixel coordinates along directions 1=up, 2=down, 3=left, 4=right. `javap -c -p n` confirms the unconditional eight-pixel call. `ab` overrides the hook with a constant false result, so this NPC subtype still reaches the eight-pixel movement call.
- `ab.a(Graphics,int,int)` selects standing frames for state 1 and moving frames for state 2. Frame indices advance in the renderer; see [FND-0025](FND-0025-npc-sprite-animations.md). The 71 ms world-update interval used by this port is recorded in [FND-0004](FND-0004-runtime-scheduler.md); that runtime pacing evidence is route/profile-specific.
- Extracted scripts with commands 15/16 include map 08 script 0, map 12 scripts 1, map 14 scripts 0/1, and map 64 script 2. The current opening script 9 only turns NPC placement slot 1 with command 17; it does not exercise movement command 15.

## Browser implementation

- `web/src/world/npc-motion.ts` advances a moving NPC by eight pixels per world update in its current direction. `WorldScene` counts source-period updates using the player actor's shared update remainder and applies those steps to NPC sprite containers whose cutscene state is moving. Command 16's standing state stops further coordinate steps.
- M52 routes type-1/type-2 scripts through the ordered interpreter only when the complete stream passes its rendered-opcode capability check. M53 adds the same path for supported type-0/type-3 triggers. M54 corrects the scene sync so command-driven NPC state applies to placements on the active map, not only map 0. The extracted map-62 script 7 passes the stream check and contains NPC movement, but its trigger requires game flags 0 and 49; the prerequisite scripts contain unsupported commands, and no campaign route or runtime capture has verified that condition.

## Verification and limits

- Vitest: 24 files / 138 tests passed, including all four movement directions, multi-update distance, stationary behavior, and invalid update counts. `npm run typecheck`, `npm run build`, and `git diff --check` passed. The production bundle is 1,317.45 kB minified and exceeds Vite's 500 kB advisory threshold.
- No M51 browser or J2ME capture was produced. The current script-9 route does not include command 15, and no end-to-end event script demonstrates this movement in the browser. Collision/boundary edge cases, exact command-to-update phase, NPC depth ordering during vertical motion, and visual/timing parity remain unverified.
- NPC pathfinding, autonomous behavior, interaction behavior, emotions, broader script execution, and most campaign content remain incomplete. See the [ROADMAP](../../ROADMAP.md).
