# FND-0046 — Map-60 scripts that reference a ninth NPC

## Question

Do map 60's scripts 10 and 11 reveal a missing NPC placement or a reachable event-interpreter gap?

## Reference and method

- Reference JAR: `original/heroes-lore-v2.1.2.jar`, SHA-256 `7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61`.
- Compared `/m/6/60.evt` with `decode_event_operations` output and the generated 40×40 map-60 collision grid. The JAR resource contains eight NPC placement records; the extracted grid contains neither marker `7` nor `-7`.
- In `ag.a(byte,byte)`, the source selects a trigger group by `abs(marker) - 1`. Group 7's rows can select script 10 when game flag 3 and category-18/item-3 ×1 are present, or script 11 when game flags 28 and 3 are present. No map-60 cell supplies marker 7 to that dispatcher.
- `ad.m6b` reads the NPC placement count and allocates `f15a = new ab[count]`; map 60 therefore has indices 0–7. The map-loader switch creates extra actors only for maps 11, 13, 15 and 82. Source opcode 50 directly indexes `f15a[argument1]`, so either script would address index 8 if invoked.

## Conclusion

The two scripts are present in the source data but are unreachable through map 60's collision-marker dispatch as extracted. The existing `canRunEventCutscene` NPC-index guard correctly rejects them and should remain in place. No ninth placement is missing from the event-resource parser, and there is no evidence to fabricate an actor or loosen the guard. M344 makes this boundary executable in `audit:event-cutscenes`: the audit now passes only with all 72 maps and 387 scripts accounted for, exactly these two script rejections, and the documented NPC target/opcode details. Unexpected rejection or accidental acceptance fails the command.

## Limits

This is static JAR and data evidence; no J2ME runtime attempt was made to invoke either script through a non-map trigger. It establishes the current map's marker-dispatch reachability, not behavior under corrupted state or an external direct call.
