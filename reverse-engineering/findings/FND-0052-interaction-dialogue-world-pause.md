# FND-0052 — Ordinary interaction dialogue pauses gameplay updates

## Question

Does the source keep updating the map, player, and enemies while a regular interaction dialogue is visible?

## Checked-in source evidence

- Scope is the repository's existing JADX output for Heroes Lore: Wind of Soltia v2.1.2. This milestone read no JAR and ran no game or emulator.
- `reverse-engineering/decompiled/sources/defpackage/ar.java:67–103`: `ar.paint()` dispatches source mode 4 to `m.j()`, then calls `ag.m12b()` and `ag.a(graphics)` while the mode remains 4. The gameplay-mode branch (2) calls `m.i()`.
- `reverse-engineering/decompiled/sources/defpackage/m.java:330–347`: `m.i()` performs `q()`, `n()`, and the player update `f269a.b()`; `m.j()` delegates to `ag.m11a()`.
- `reverse-engineering/decompiled/sources/defpackage/ag.java:199–236,402–433`: `ag.m11a()` uses internal event state 2 for text reveal (`e()` only). Internal state 1 instead calls `d()`, `m.n()`, and `m.f269a.c()`, so it is the event-movement path that advances the player/map update.
- The ordinary browser fallback dialogue is represented by `WorldScene.worldDialogueVisible`; it is distinct from ordered cutscenes (`openingDialogVisible`).

## Conclusion and implementation

- While ordinary interaction dialogue is visible, source mode 4 advances the dialogue script/reveal but does not run the normal player, map, enemy, or gameplay timer updates.
- M321 keeps dialogue reveal time advancing, then supplies a zero gameplay delta to the rest of `WorldScene.update()` until the dialogue closes. System-overlay gameplay behavior and ordered event-cutscene handling are unchanged.
- A focused pure timing-policy test covers both the modal pause and normal gameplay pass-through.

## Verification and limits

- This finding is based on checked-in decompiled source and unit coverage, not a browser/J2ME comparison. Exact render cadence and ordered-cutscene phases remain separate questions.
- Full test/typecheck/build and static coverage-audit results are recorded in [ROADMAP.md](../../ROADMAP.md) after M321.
