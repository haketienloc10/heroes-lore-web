# M884 — max-level browser route through Map61

This fresh visible New Game used the existing developer-only `?testProfile=max-level` profile: level 99, all four attributes 32,767, and 394,392 HP. It completed the Map63 chief event, the Reah rescue, and the Temple of Fire quest, then traveled Map27 → Map2 → Map60 → Map61 → Map1. The final Map61 eastern branch transferred to Map1 tile (2,17) while the hero remained at 394,392/394,392 HP.

The Map60-to-Map61 transfer fired from its west-side route event at tile (1,3). On Map61 the east-side transfer fired while approaching the -3 exit region; the actor arrived at Map1 tile (2,17). The route was driven through visible keyboard input and used live scene reads only. No save/load, storage inspection, direct map start, gameplay-state seeding, or original JAR read was used.

This run confirms that the existing max-level profile is suitable for exploratory route checks where survival is the main concern. The full port remains in progress; the already recorded low-level M179/M180 route also covers the Map61-to-Map1 branch.
