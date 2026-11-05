# Gameplay mechanics

The browser port already contains gameplay logic. Source-backed systems live in
[`../world`](../world), while Phaser integrates them in
[`../rendering/WorldScene.ts`](../rendering/WorldScene.ts). This folder is not
the implementation boundary for mechanics.

Examples of implemented systems include movement and actor state, player
combos and skills, enemy AI and attacks, recovery and progression, loot and
equipment, commerce, event scripts, and save data. Their scope and evidence are
recorded in the [port roadmap](../../../ROADMAP.md) and the corresponding
[`FND-*` findings](../../../reverse-engineering/findings/).

When changing a mechanic, check its finding and source references first. Keep
source behavior, browser implementation, tests, and remaining parity limits
distinct; do not treat unit coverage as proof of a live browser or J2ME match.
