# M887 — Map23 prerequisite chain through Map71 with a max-level browser profile

A fresh Chromium session opened `http://127.0.0.1:5174/?testProfile=max-level` and began at the title screen. The run selected Ronin, Guardians 0 and 1, and confirmed New Game through the visible UI. The level-99 profile started at full HP/SP (394,392/394,392).

The visible route completed the Map63 Chief and Reah events, then followed the Map19/Map22/Map24 item chain into Map25. Map25 consumed category 19 items 3 and 4, granted category 19 item 0, and set flag 14. Map23's marker -6 reached Map10; its gate consumed that item and continued through Map11. The Map11 encounter was defeated with a basic attack, after which the visible event returned the hero to Map10 and continued to Map27.

The later Map63 Chief follow-up granted category 18 item 0 and set flag 21. On Map69, the first NPC interaction consumed that item, granted five category 9 item 0s, and set flag 24. Repeating the interaction set flag 25. The north marker then reached Map70, and its marker -4 transferred to Map71 at `(10,12)`. The final live state showed level 99 at full HP/SP, game flags `[0,54,87,1,75,76,11,13,14,91,16,3,27,77,84]`, quest flags `[1,2,4,6,7,5,25,26,9,8]`, and five category 9 item 0s.

The evidence records one current-build browser route using a developer-only max-level profile. This provides a safer way to inspect map and event progression when combat can otherwise interrupt a run. It does not establish ordinary-level survivability, combat balance, J2ME parity, a natural full-campaign playthrough, or that every map, event, and ending works. No in-game Save/Load, browser-storage read, local-save access, original-JAR access, direct map start, or gameplay-state seeding was used.

`capture.json` and `route-trace.json` summarize live checkpoints; `manual-interactions.json` lists key dialogue and combat inputs. The screenshots preserve selected browser-rendered states along the route.
