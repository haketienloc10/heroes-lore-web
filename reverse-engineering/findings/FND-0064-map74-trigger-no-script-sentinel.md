# FND-0064 — Map74 matching no-script trigger sentinel

## Question

Why did Map74 repeat its entry dialogue after the story flag changed, leaving the hero unable to leave through the map edge?

## Source and data evidence

- The generated class-6 Map74 event table has trigger group 2 rows `[0,67,0,255,0,0,255]` and `[0,0,0,255,0,0,1]`. Script 1 displays dialogue, sets game flag 67 with opcode 9, then ends.
- The source dispatcher `ag.a(byte,byte)` checks rows in order. A matching row whose signed script byte is `-1` (`0xff`) immediately returns the no-script result. It does not continue to a later fallback row.
- Before the fix, `resolveTriggerScript()` treated script index 255 as a row to skip. Once Map74's script set flag 67, the first row matched but the web selector continued into script 1 and repeated the dialogue. Changing the `0xff` case to return `undefined` preserves the source's terminal-row behavior.

## Browser implementation and verification

- The focused regression in `web/tests/event-data.test.ts` uses the Map74 row pair. With flag 67 absent it selects the fallback script 1; with flag 67 present it returns no script. The focused event-data suite passed 33 tests; `npm run typecheck --workspace web`, `npm run build --workspace web`, and `git diff --check` passed.
- M848 replays the route from visible New Game on the developer-only max-level profile. The Map74 entry dialogue appears once; W dismisses it and sets flag 67; a visible ArrowDown then returns to Map49 at tile `(11,16)` without replaying the dialogue. See the [M848 capture](../../reference/screenshots/web-render/M848-map74-trigger-sentinel/capture.json), [entry dialogue](../../reference/screenshots/web-render/M848-map74-trigger-sentinel/01-map74-entry-dialogue.png), and [Map49 return](../../reference/screenshots/web-render/M848-map74-trigger-sentinel/02-map49-after-map74-exit.png).

## Limits

- This is source-backed trigger selection plus one controlled browser route. It does not establish J2ME runtime parity or completion of the remaining campaign.
- The max-level developer profile does not test ordinary-level balance.
