# FND-0021 — Source random number streams

## Scope

Replace Phaser's bounded random draws with the two source Java random streams used by enemy AI and gameplay rolls, preserving raw draw order and the source range helper.

## Baseline and source

- JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Static source: `reverse-engineering/decompiled/sources/defpackage/{cj,g,ak,n}.java`.
- `javap -classpath original/heroes-lore-v2.1.2.jar -p -c ak n` was used to cross-check the enemy raw-integer branches and path-choice call order.

## Verified source facts

- `cj.f245a` is initialized as its own `new java.util.Random()` in `cj.java`. `g.a` is a second, independent `new java.util.Random()` in `g.java`.
- `g.a(min,max)` computes the inclusive width, returns zero without drawing when that width overflows to zero, and otherwise returns `min + Math.abs(nextInt()) % width`. This is not Java's bounded `nextInt(width)` and has the `Integer.MIN_VALUE` absolute-value overflow behavior.
- `ak.r()` uses raw `cj.f245a.nextInt()` for the sign branch and low-byte direction. Its idle branch separately calls `g.a(1,7)` for the cooldown before selecting direction.
- `ak.h()` and the axis-tie branch in `n.a(cj,byte)` use raw `cj.f245a.nextInt()`. `n.a(cj,byte)` reads one raw integer before the aligned-target early return and reuses its low byte if all path fallbacks fail.

## Browser implementation

- M44 adds a 48-bit Java-compatible PRNG and creates separate entity/raw and bounded-range instances. `WorldScene` routes all former `Phaser.Math.Between` calls through the bounded source helper; enemy AI receives both streams and now follows the source raw/range draw order for idle, retarget, path ties and fallback directions.
- Runtime seeds come from Web Crypto with a time-derived fallback. The source JAR's default seeds depend on runtime construction time/seed uniquifier, so this reproduces the generator and range algorithms but not the J2ME seed or stream position.
- Unit tests check Java's seed-zero integer sequence, source modulo ranges, the signed-minimum edge, overflow-width behavior, singleton draw consumption, stream construction, and enemy AI raw/range draw behavior.

## Checks and limits

Current M44 verification: Vitest passes 21 files / 128 tests, Python converter tests pass 26/26, typecheck and production build pass, and the minified bundle is 1,305.72 kB with Vite's existing chunk warning; see [ROADMAP](../../ROADMAP.md). No corrected browser scenario or J2ME random-output comparison was produced in this milestone. Any subsystem that does not yet issue the same source draws in the same order can still diverge even though the generator implementation matches Java.
