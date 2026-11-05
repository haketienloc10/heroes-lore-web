# M962 — Map 4 material branches and story gate

This is a continuation of the visible DEV `?testProfile=max-level` browser session. The hero is level 99 with 394,392/394,392 HP/SP. All movement and combat interactions used the visible game controls; the runtime snapshot and extracted collision grids were read only for observation and route planning. No save/load, browser-storage access, direct map start, or gameplay-state seed was used.

## Results

- The Map 5 branch yielded Crest of Fire (category 20, item 4), set flag 70, and returned to Map 4.
- The Map 6 branch yielded item 5, set flag 71, and returned to Map 4.
- The Map 7 branch yielded item 6, set flag 72, and returned to Map 4. Pressing Left immediately after the Map 7 arrival activated its return route; re-entering and taking the north/east path reached the item instead.
- With flags 70–72 and items 4–6 present, the Map 4 story choice opened at `(14,12)`. Visible OK selected the default Yes option and transferred to Map 8. Skipping the Map 8 intro reached Map 11 `(10,10)` with flag 73 set.
- HP/SP remained full at each captured checkpoint.

Route screenshots, read-only runtime snapshots, and action observations are in this directory. `map7-left-portal-return.*` records the first Map 7 turn-back; the later `map7-third-material-claim-*` files record the successful item path.

This verifies the current class-6 max-level browser route through the three material branches and into Map 11. It does not check normal-level combat balance or J2ME behavior.
