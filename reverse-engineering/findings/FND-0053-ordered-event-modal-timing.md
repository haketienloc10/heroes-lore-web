# FND-0053 — Ordered event modal states pause gameplay simulation

## Question

Which source event-script phases run the player/map update while a mode-4 event is active?

## Checked-in source evidence

- Scope is the repository's existing JADX output for Heroes Lore: Wind of Soltia v2.1.2. No JAR or runtime was accessed for M322.
- `reverse-engineering/decompiled/sources/defpackage/ar.java:67–103` sends mode 4 through `m.j()`, then `ag.m12b()` and `ag.a(graphics)`; mode 2 instead calls `m.i()`.
- `reverse-engineering/decompiled/sources/defpackage/m.java:330–347` shows `m.j()` delegates to `ag.m11a()`, while `m.i()` and `m.n()` perform player/map updates.
- `reverse-engineering/decompiled/sources/defpackage/ag.java:199–236,402–433,515–604` dispatches dialogue, choice, movement, and flash/shake into separate internal states. Only internal state 1 calls `m.n()` and `m.f269a.c()`; text, choice, and effect handlers do not. `ag.m12b()` separately applies camera movement during mode 4.
- `ag.d()` stops its command loop at opcode 4 and initializes the counter to `argument - 1`; the enclosing state-1 handler still calls `m.n()` on that same mode-4 update. Later updates decrement the counter and advance the command index when it reaches zero, returning before the following command is processed. That command runs on the next mode-4 update. M269's backward/self-jump yield is an interpreter guard rather than movement mode.

## Conclusion and implementation

- M322 pauses `WorldScene` gameplay delta for ordered dialogue and choice, flash/shake, and interpreter-only back-edge waits. Ordinary fallback dialogue was already gated by M321.
- The event runner still advances camera pans, flash/shake state, and back-edge yields with event time while gameplay delta is zero. Opcode-4 movement delays retain the mode-4 actor/NPC update path, as distinguished from the full gameplay update in M325/FND-0055.
- `EventCutsceneState.sourceWorldTickDuringDelay` distinguishes opcode-4 movement waits from M269's artificial one-tick loop yield. Tests cover this distinction and the modal phase mapping.
- M324 preserves the first mode-4 update associated with opcode 4 outside its `argument - 1` wait counter. When the counter expires, `WorldScene` resumes the next command at the next 71 ms world-update boundary. M325 limits this update to the source hero/active-skill and NPC path; enemies, projectiles, drops, and the rest of `ad.b()` remain paused. A MOVE/WAIT(3)/STOP regression covers three actor/NPC updates and the stop boundary; a zero-count wait still keeps the source update boundary.

## Verification and limits

- This is checked-in-source timing behavior with unit coverage; it has no browser/J2ME comparison. M323's exact mode-4 paint rate, M326's Camera-On focus timing, and rendered timing parity remain open.
- M324 full gates are recorded in [ROADMAP.md](../../ROADMAP.md).
