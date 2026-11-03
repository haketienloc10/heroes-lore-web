# Developer campaign test build

The test profiles start through the ordinary New Game menu and give the Ronin maximum accepted test attributes. They are available only in Vite development mode; production builds ignore the query parameter.

Start Vite on a separate local port so the browser uses an isolated origin and does not reuse the normal development site's saved data:

```sh
npm run dev --workspace web -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/?testProfile=max-level`, then start New Game through the title menu. The gameplay host gets `data-test-profile="max-level"` while the profile is active. The profile starts at level 99, with 32,767 in each attribute and full HP/SP after the starting equipment is applied. If an encounter still reduces HP to zero, the test profile restores HP/SP instead of entering Game Over. Use this for campaign routes where rewards do not depend on player level.

While a developer test profile is active, the gameplay host exposes read-only route telemetry through `data-test-map-id`, `data-test-player-tile-x`, `data-test-player-tile-y`, `data-test-hp`, and `data-test-level`. `data-test-runtime` contains a versioned JSON snapshot with player resources/facing, game and quest flags, active skill action/cooldown, dialog/transition state, and current-map enemy IDs, positions, HP, and lifecycle states. It updates from the current world scene during the game loop. These attributes do not control gameplay or read/write saves; they are absent from production runs.

For level-sensitive item drops such as Mithril, use `http://127.0.0.1:5174/?testProfile=loot-survival`. This profile keeps the same boosted attributes and HP/SP restoration but starts at level 1, because the source Mithril chance is `20 + enemy reward code - player level`; at level 99 that chance is below zero for the available enemies. It still starts through visible New Game and does not change the map, enemies, campaign flags, events, or inputs.

The profiles are held in memory and do not change production code paths or write a save automatically. Use the separate port for any manual Save Game action; its browser storage belongs to that local origin only. They are intended for route and item-flow inspection. The boosted attributes and survival guard change combat outcomes, so they do not verify ordinary-level balance, death behavior, or J2ME combat parity.

## Runtime check

REA Chromium scenario `ev_ede7599e5582a739d688ad8da55d00b04ab08bd223a64fdbcc698358f65d3af4` used the visible title and New Game controls on port 5174. All ten actions completed, and the gameplay host exposed `data-test-profile="max-level"`. The capture recorded no page errors and did not request browser-storage details. The app's normal options bootstrap ran on this separate origin; no game save was loaded or written. The two profile unit tests check level 99 and the attribute values.

The later [M841 max-level route check](../reference/screenshots/web-render/M841-max-level-route-check/attempt-notes.md) extends this visible run through Map80's Shop, Refiner, and Blacksmith screens, then through Maps60/61/1/51/3. It records the Map51 Temple of Earth and Map3 civilian-access guard dialogue; Map4 and later content remain unverified in that run. The profile validates route inspection under boosted stats, not a full campaign or ordinary-level combat parity.

[M842](../reference/screenshots/web-render/M842-map51-max-level-gate-followup/attempt-notes.md) continues the same visible run from Map3 through Map1 back to Map51. On a third approach, the Temple guard still denies entry while the level-99 hero remains at full HP. This isolates the stop as a progression gate in the current campaign state; it does not verify Map4 or later maps.

[M843](../reference/screenshots/web-render/M843-map51-map49-map48-followup/attempt-notes.md) follows Map51's lower route to Map49 and then Map48 without reattempting the Temple gate. The boosted hero reaches Map48 at full HP and opens two NPC dialogue screens; the observed campaign flags remain unchanged. This extends route evidence but is not a full-campaign completion.

[M844](../reference/screenshots/web-render/M844-map48-map73-followup/attempt-notes.md) reaches Map73 through Map48's negative marker at `(5,8)` and opens its Librarian dialogue. The loaded Map73 map has no marker 2 for its decoded Map30 transfer script, so that branch remains unverified.

[M846](../reference/screenshots/web-render/M846-max-level-natural-progression/attempt-notes.md) starts a fresh visible New Game with the same max-level profile and follows the route through Map73 without a game-over state. It records the Librarian dialogue and a Guard refusal with unchanged flags. Map73 still has no marker 2 for its decoded Map30 transfer script, so the boosted profile does not bypass the missing route selector.

[M883](../reference/screenshots/web-render/M883-loot-survival-mithril-upgrade/evidence-notes.md) verifies a successful Map79 Blacksmith upgrade through a fresh visible New Game with `loot-survival`: level 1 start, maximum supported attributes, and full HP. The hero collects Mithril on Map27, completes the chief and Reah route, accepts the Temple of Fire quest, then upgrades the equipped +0 weapon to +1. The hero reaches level 6 naturally and remains at full HP. This is a targeted browser-port transaction check, not full-campaign or J2ME verification.
