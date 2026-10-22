# Static route to the `br.d:Z` ordering branch

Target: `original/heroes-lore-v2.1.2.jar`, SHA-256
`7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
This is bytecode/decompiler analysis; it is not runtime evidence.

- `br.<init>(Display)V`, original BCI 36–38, initializes instance field `br.d:Z` to `true`.
- `be.a(II)Z` opens `bd` when the selected System-menu item (`ca.b:B`) is 2 (Options). `bd.a(II)Z` is the Settings screen input handler. At original BCIs 273–292, when the selected row (`ca.b:B`) is 3, Left/Right input toggles `br.d:Z`. In the user-operated runtime session, this fourth row was visibly labelled **Camera** and displayed On before the toggle and Off after it. The label is observed in the game UI, not decoded from its localized string table.
- On the Back key (`i2 == -8`), `bd.a(II)Z` calls `br.h()`. That method serializes the settings through `br.a()[B` and writes the six-byte setting record to RMS `/c`; it then returns to its parent screen. A naturally selected false value can therefore be tried through the game UI without a probe writing the field.
- In `ar.paint(Graphics)V`, state 2 reads `br.d:Z`: true calls `m.g()` then `m.i()`; false calls `m.i()` then `m.g()` (original BCIs 88–112). This is the branch the runtime scout was intended to observe.

Reproduction commands:

```sh
javap -classpath original/heroes-lore-v2.1.2.jar -c -p br bd ar
jadx -d /tmp/heroes-lore-decompiled original/heroes-lore-v2.1.2.jar
```

The natural UI route and flag values are verified in the user-operated original emulator session `M15-SCN-0004-E-assisted-physical-R01`. A read-only snapshot recorded `br.d:Z=true` while the System screen showed Camera On, then `false` after the user toggled Camera Off, and still `false` after Back returned to the parent menu. A later snapshot recorded `m.e:I=2` with `br.d:Z=false`; frontbuffer and X11 images show gameplay after a user arrow input.

Runtime order was subsequently recorded in `M15-SCN-0004-E-render-order-R01` with a copy-only bytecode hook. After a gameplay checkpoint with `m.e:I=2` and `br.d:Z=false`, all 1,582 observed branch operands remained false for about 56.6 seconds. The analysis found 791 complete branch-to-next-branch segments containing both method entries; all follow `m.i→m.g`. It found no call-order mismatch. The trace is a contiguous serialized prefix with eight terminal sequence values absent from its health count and one censored final paint span, which the analysis excludes. This confirms runtime order in the observed route, not every gameplay/menu state or worker interleaving. The earlier scout `M15-SCN-0004-E-order-false-scout-R01` remains invalid and is not reclassified. See [render-order analysis](M15-SCN-0004-E-render-order-R01/render-order-analysis.json), [per-run manifest](M15-SCN-0004-E-render-order-R01/manifest.json), [assisted-run evidence](M15-SCN-0004-E-assisted-physical-R01/camera-off-evidence.json) and [gameplay checkpoint](M15-SCN-0004-E-assisted-physical-R01/gameplay-after-input.json).
