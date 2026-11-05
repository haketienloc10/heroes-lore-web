# M963 — Map 11 through the Map 8 ending credits

This continues the same visible DEV `?testProfile=max-level` browser session at level 99 and 394,392/394,392 HP/SP. All combat, movement, dialogue, and ending inputs used visible controls. `data-test-runtime` was read only while WorldScene was active. No save/load, browser-storage access, direct map start, or gameplay-state seed was used.

## Results

- A visible Attack defeated Map 11 enemy 32 at `(10,9)` (1,960 HP). Its removal callback transferred to Map 13 with flag 73.
- Map 13 boss 35 (4,050 HP) was defeated with Skill 1 after approaching; the ensuing wave resolved and the game transferred to Map 15.
- Map 15 boss 39 (14,430 HP) was defeated with Skill 1. A visible Up move activated the post-boss route to Map 82. The max-level profile preserved HP, though the boss could still displace the hero during approach.
- Map 82 boss 42 (9,050 HP) was defeated with Skill 1. After its death sequence, the game returned to Map 8 `(9,10)` for Aramor's dialogue.
- Skipping the post-boss dialogue reached the epilogue. Nine text pages and the credits screen were captured. After one visible OK on the credits, the screen showed Reah's opening dialogue; WorldScene runtime telemetry was absent at that point.
- HP/SP remained full at the captured combat checkpoints.

Screenshots and runtime snapshots in this directory document the Map 11, 13, 15, 82, and Map 8 transitions, followed by the epilogue and credits. The credit-to-opening-scene observation is visual only because the runtime snapshot is no longer exposed outside WorldScene.

This verifies one continuous DEV class-6 max-level route to credits. It does not establish ordinary-level balance, full J2ME parity, other character classes, or every optional branch.
