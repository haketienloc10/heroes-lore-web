# M919: max-level route toward Map15

This browser subtask attempted the recorded natural route to Map15 using the developer-only `?testProfile=max-level` profile and visible New Game input. The profile starts at level 99 with 394,392 HP/SP. Each run used an isolated browser profile and read-only runtime telemetry. No save/load, browser-storage read, local-save access, original JAR access, direct map start, or gameplay-state seed was used.

## Attempts

- **Attempt 1:** Reached Map27 at full HP. The route runner skipped the Map27 marker-facing input when the player was already on its target tile, then diverged. The marker did not transfer to Map64. See [replay actions](attempt-1/replay-actions.jsonl), [recovery state](attempt-1/recovery-final-state.json), and [last route frame](attempt-1/map27-route.png).
- **Attempt 2:** Reached Map27 at full HP, but the recorded movement trace did not include the Map63 Village Chief interaction. Required game flags and quest flag 1 were absent, so the Reah rescue route was not available in this run. See [replay actions](attempt-2/replay-actions.jsonl) and [Map64 start](attempt-2/map64-max-level-start.png).
- **Attempt 3:** Reached Map63 at level 99 and visibly interacted with the Chief. Game flags 1, 4, and 75 and quest flag 1 were present afterward. The Map27 entry event also completed and set game flag 2. The movement driver then diverged on Map27 and stopped at `(7,30)` with 394,392/394,392 HP/SP. It recorded no page errors, console errors, or bad responses. See [run result](attempt-3/run-result.json), [action log](attempt-3/actions.jsonl), [Map64 start](attempt-3/map64-max-level-start.png), [Chief interaction](attempt-3/map63-chief-interaction.png), and [stopped frame](attempt-3/map27-controller-stop.png).

The max-level profile kept the hero alive through each reached segment. Reah's Map27 marker, Map15, and the remaining route were not verified. The current route replay subtask is **BLOCKED after three attempts** because the automation diverged on dynamic Map27 movement; the project goal remains active.
