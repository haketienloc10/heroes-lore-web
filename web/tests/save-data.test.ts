import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import { createBasePlayerAttributes } from '../src/world/attributes';
import {
  advanceSourceInventorySlotSnapshot,
  GAME_SAVE_CLASS_KEYS,
  GAME_SAVE_KEY,
  parseGameSave,
  preservedSourceInventorySlotIndices,
  prepareNextSourceCycle,
  readGameSave,
  readGameSaves,
  sourceSaveCompletionPercent,
  snapshotSourceInventorySlots,
  writeGameSave,
  type SaveStorage,
} from '../src/world/save-data';

const fixture = {
  version: 1,
  savedAt: 1_797_200_000_000,
  mapId: 79,
  tileX: 10,
  tileY: 18,
  direction: 1,
  playthroughMode: 0,
  completionPoints: 31,
  playTimeSeconds: 12_345,
  gameFlags: [0, 54, 87, 3],
  questFlags: [18],
  guardianIndices: [0, 2],
  heroClassId: 7,
  attributes: createBasePlayerAttributes(7),
  skillIds: [0, 2, 4],
  activeSkillId: 2,
  skillProgress: [
    {
      skillId: 0, skillRank: 2, skillExperience: 12,
      skillLevelSlotOne: 0, skillLevelSlotThree: null,
    },
    {
      skillId: 2, skillRank: 1, skillExperience: 20,
      skillLevelSlotOne: 0, skillLevelSlotThree: null,
    },
    {
      skillId: 4, skillRank: 10, skillExperience: 30,
      skillLevelSlotOne: 0, skillLevelSlotThree: 1,
    },
  ],
  comboLimit: 4,
  hud: { ...NEW_GAME_RONIN_HUD },
  wallet: 300,
  inventory: [],
  specialInventory: [{ category: 22, itemId: 6, count: 2 }],
  equipmentSlots: null,
};

class MemoryStorage implements SaveStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('browser game save data', () => {
  it('round trips the current scene state through one browser storage slot', () => {
    const storage = new MemoryStorage();
    const saved = writeGameSave(storage, fixture);
    expect(storage.getItem(GAME_SAVE_KEY)).toBe(JSON.stringify(fixture));
    expect(readGameSave(storage)).toEqual(saved);
    expect(saved.mapId).toBe(79);
    expect(saved.gameFlags).toEqual([0, 54, 87, 3]);
  });

  it('keeps a class-specific save per source class and lists them in class order', () => {
    const storage = new MemoryStorage();
    const classSix = {
      ...fixture,
      savedAt: fixture.savedAt + 1,
      heroClassId: 6 as const,
      attributes: createBasePlayerAttributes(6),
    };
    const classEight = {
      ...fixture,
      savedAt: fixture.savedAt + 2,
      heroClassId: 8 as const,
      attributes: createBasePlayerAttributes(8),
    };
    writeGameSave(storage, fixture);
    writeGameSave(storage, classSix);
    writeGameSave(storage, classEight);

    expect(storage.getItem(GAME_SAVE_CLASS_KEYS[6])).toBe(JSON.stringify(classSix));
    expect(storage.getItem(GAME_SAVE_CLASS_KEYS[7])).toBe(JSON.stringify(fixture));
    expect(storage.getItem(GAME_SAVE_CLASS_KEYS[8])).toBe(JSON.stringify(classEight));
    expect(readGameSaves(storage)).toEqual([classSix, fixture, classEight]);
    expect(readGameSave(storage)).toEqual(classEight);
  });

  it('migrates a single legacy save into the class roster without touching storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_SAVE_KEY, JSON.stringify(fixture));
    expect(readGameSaves(storage)).toEqual([fixture]);
  });

  it('computes the source class-load completion value from saved points and current flags', () => {
    expect(sourceSaveCompletionPercent(parseGameSave({
      ...fixture,
      completionPoints: 31,
      gameFlags: [100, 101],
      questFlags: [2],
    })!)).toBe(39);
    expect(sourceSaveCompletionPercent(parseGameSave({
      ...fixture,
      completionPoints: 100,
      gameFlags: Array.from({ length: 6 }, (_, index) => 100 + index),
      questFlags: Array.from({ length: 20 }, (_, index) => 2 + index * 3),
    })!)).toBe(-82);
  });

  it('round trips every modeled field with populated inventory and equipment in memory', () => {
    const equipmentState = (subtypeBytes: number[]) => ({
      sourceFlag: true,
      upgradeByte: -2,
      bonusValues: [1, -1, 2, 0] as [number, number, number, number],
      subtypeBytes,
    });
    const completeState = {
      ...fixture,
      savedAt: 1_797_200_000_123,
      mapId: 61,
      tileX: 27,
      tileY: 19,
      direction: 4,
      playthroughMode: 2,
      completionPoints: -7,
      playTimeSeconds: 2_147_483_000,
      gameFlags: [0, 54, 87, 513],
      questFlags: [18, 511],
      comboLimit: 6,
      hud: {
        hp: 53,
        maxHp: 84,
        sp: 24,
        maxSp: 72,
        experience: 237,
        experienceToNextLevel: 350,
        level: 8,
        attributePoints: 2,
        selectedItemCount: 3,
        selectedItemCategory: 9 as const,
      },
      wallet: 476,
      inventory: [
        { category: 2, itemId: 4, count: 1, equipmentState: equipmentState([1, 2, 3]) },
        { category: 9, itemId: 2, count: 3 },
      ],
      specialInventory: [{ category: 22, itemId: 6, count: 2 }],
      equipmentSlots: [
        { category: 2, itemId: 4, count: 1, equipmentState: equipmentState([1, 2, 3]) },
        null,
        { category: 5, itemId: 1, count: 1, equipmentState: equipmentState([]) },
        { category: 6, itemId: 3, count: 1, equipmentState: equipmentState([]) },
        { category: 4, itemId: 2, count: 1, equipmentState: equipmentState([]) },
      ],
    };
    const storage = new MemoryStorage();
    const saved = writeGameSave(storage, completeState);

    expect(saved).toEqual(completeState);
    expect(storage.getItem(GAME_SAVE_KEY)).toBe(JSON.stringify(completeState));
    expect(readGameSave(storage)).toEqual(completeState);
  });

  it('loads earlier version-one saves with default progression fields', () => {
    const { playthroughMode: _playthroughMode, ...legacyModeSave } = fixture;
    expect(parseGameSave(legacyModeSave)?.playthroughMode).toBe(0);
    const { completionPoints: _completionPoints, ...legacyCompletionSave } = fixture;
    expect(parseGameSave(legacyCompletionSave)?.completionPoints).toBe(0);
    const { playTimeSeconds: _playTimeSeconds, ...legacyPlayTimeSave } = fixture;
    expect(parseGameSave(legacyPlayTimeSave)?.playTimeSeconds).toBe(0);
    const legacyHud = Object.fromEntries(Object.entries(NEW_GAME_RONIN_HUD).filter(
      ([key]) => key !== 'level' && key !== 'attributePoints',
    ));
    expect(parseGameSave({ ...fixture, hud: legacyHud })?.hud).toMatchObject({
      level: 1,
      attributePoints: 0,
      selectedItemCategory: 7,
    });
    const { comboLimit: _comboLimit, ...legacyComboSave } = fixture;
    expect(parseGameSave(legacyComboSave)?.comboLimit).toBe(1);
    const { skillProgress: _skillProgress, ...legacySkillProgressSave } = fixture;
    expect(parseGameSave(legacySkillProgressSave)?.skillProgress).toEqual([
      { skillId: 0, skillRank: 1, skillExperience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
      { skillId: 2, skillRank: 1, skillExperience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
      { skillId: 4, skillRank: 10, skillExperience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: 1 },
    ]);
    const legacySkillRecords = {
      ...fixture,
      skillProgress: fixture.skillProgress.map(({ skillLevelSlotOne: _one, skillLevelSlotThree: _three, ...entry }) => entry),
    };
    expect(parseGameSave(legacySkillRecords)?.skillProgress).toEqual(fixture.skillProgress);
  });

  it('preserves source playthrough modes and rejects values outside the source byte range', () => {
    expect(parseGameSave({ ...fixture, playthroughMode: 1 })?.playthroughMode).toBe(1);
    expect(parseGameSave({ ...fixture, playthroughMode: 2 })?.playthroughMode).toBe(2);
    expect(parseGameSave({ ...fixture, playthroughMode: 128 })).toBeNull();
    expect(parseGameSave({ ...fixture, completionPoints: -128 })?.completionPoints).toBe(-128);
    expect(parseGameSave({ ...fixture, completionPoints: 100 })?.completionPoints).toBe(100);
    expect(parseGameSave({ ...fixture, completionPoints: -129 })).toBeNull();
    expect(parseGameSave({ ...fixture, completionPoints: 101 })).toBeNull();
    expect(parseGameSave({ ...fixture, playTimeSeconds: -2_147_483_648 })?.playTimeSeconds)
      .toBe(-2_147_483_648);
    expect(parseGameSave({ ...fixture, playTimeSeconds: 2_147_483_647 })?.playTimeSeconds)
      .toBe(2_147_483_647);
    expect(parseGameSave({ ...fixture, playTimeSeconds: 2_147_483_648 })).toBeNull();
  });

  it('prepares the post-credits source cycle with reset flags, restored health, and class start', () => {
    const current = {
      ...fixture,
      hud: { ...fixture.hud, hp: 1, sp: 2 },
      inventory: [
        { category: 17, itemId: 2, count: 1 },
        { category: 18, itemId: 3, count: 1 },
        { category: 21, itemId: 4, count: 1 },
      ],
    };
    const next = prepareNextSourceCycle(parseGameSave(current)!, 1234);
    expect(next).toMatchObject({
      savedAt: 1234,
      mapId: 60,
      tileX: 5,
      tileY: 36,
      playthroughMode: 1,
      completionPoints: 31,
      gameFlags: [0],
      questFlags: [],
      hud: { hp: current.hud.maxHp, sp: current.hud.maxSp },
      inventory: [{ category: 17, itemId: 2, count: 1 }],
    });
    expect(parseGameSave(next)).not.toBeNull();
    expect([6, 7, 8].map((heroClassId) => {
      const save = parseGameSave({
        ...current,
        heroClassId,
        attributes: createBasePlayerAttributes(heroClassId as 6 | 7 | 8),
      })!;
      const nextCycle = prepareNextSourceCycle(save);
      return [nextCycle.mapId, nextCycle.tileX, nextCycle.tileY];
    })).toEqual([[0, 22, 4], [60, 5, 36], [77, 10, 18]]);
  });

  it('awards clear points from the ending flags before clearing them for the next cycle', () => {
    const fullClear = {
      ...fixture,
      completionPoints: 0,
      gameFlags: [0, 100, 101, 102, 103, 104, 105],
      questFlags: Array.from({ length: 20 }, (_, index) => 2 + index * 3),
    };
    const next = prepareNextSourceCycle(parseGameSave(fullClear)!);
    expect(next.completionPoints).toBe(74);
    expect(next.gameFlags).toEqual([0]);
    expect(next.questFlags).toEqual([]);
    expect(prepareNextSourceCycle(parseGameSave({ ...fullClear, completionPoints: 100 })!).completionPoints)
      .toBe(-82);
  });

  it('defaults legacy saves to Ronin and rejects unsupported ending classes', () => {
    const { heroClassId: _heroClassId, attributes: _attributes, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)).toMatchObject({
      heroClassId: 6,
      attributes: createBasePlayerAttributes(6),
    });
    expect(parseGameSave({ ...fixture, heroClassId: 9 })).toBeNull();
  });

  it('migrates version-one saves without attributes to their class baseline and rejects invalid allocations', () => {
    const { attributes: _attributes, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)?.attributes).toEqual(createBasePlayerAttributes(7));
    expect(parseGameSave({ ...fixture, attributes: { ...fixture.attributes, agility: -1 } })).toBeNull();
    expect(parseGameSave({ ...fixture, attributes: { power: 3, hp: 4, agility: 8 } })).toBeNull();
  });

  it('defaults the separate special inventory for older saves and validates its source slots', () => {
    const { specialInventory: _specialInventory, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)?.specialInventory).toEqual([]);
    expect(parseGameSave({ ...fixture, specialInventory: [{ category: 21, itemId: 6, count: 1 }] })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      specialInventory: Array.from({ length: 16 }, (_, itemId) => ({ category: 22, itemId, count: 1 })),
    })).toBeNull();
  });

  it('loads version-one saves from before wallet and ordinary inventory persistence', () => {
    const { wallet: _wallet, inventory: _inventory, specialInventory: _specialInventory, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)).toMatchObject({ wallet: 300, inventory: [], specialInventory: [] });
  });

  it('persists equipment slots and rejects a category stored in the wrong source slot', () => {
    const weapon = {
      category: 0,
      itemId: 2,
      count: 1,
      equipmentState: { sourceFlag: true, upgradeByte: 1, bonusValues: [0, 1, 0, 0], subtypeBytes: [0, 0, 0] },
    };
    const equipmentSlots = [weapon, null, null, null, null];
    expect(parseGameSave({ ...fixture, equipmentSlots })?.equipmentSlots?.[0]).toEqual(weapon);
    expect(parseGameSave({ ...fixture, equipmentSlots: [null, weapon, null, null, null] })).toBeNull();
  });

  it('derives the initial skill list when reading an earlier version-one save', () => {
    const {
      skillIds: _skillIds,
      activeSkillId: _activeSkillId,
      skillProgress: _skillProgress,
      ...legacySave
    } = fixture;
    expect(parseGameSave(legacySave)).toMatchObject({
      skillIds: [0, 2],
      activeSkillId: 0,
      skillProgress: [
        { skillId: 0, skillRank: 1, skillExperience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
        { skillId: 2, skillRank: 1, skillExperience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
      ],
    });
  });

  it('rejects unsupported versions, invalid positions, and empty party selection', () => {
    expect(parseGameSave({ ...fixture, version: 2 })).toBeNull();
    expect(parseGameSave({ ...fixture, tileX: -1 })).toBeNull();
    expect(parseGameSave({ ...fixture, guardianIndices: [] })).toBeNull();
  });

  it('rejects duplicate guardians, bad flags, and impossible HUD values', () => {
    expect(parseGameSave({ ...fixture, guardianIndices: [0, 0] })).toBeNull();
    expect(parseGameSave({ ...fixture, skillIds: [0, 4, 4] })).toBeNull();
    expect(parseGameSave({ ...fixture, skillIds: [0, 1, 2, 3, 4, 5] })).toBeNull();
    expect(parseGameSave({ ...fixture, activeSkillId: 1 })).toBeNull();
    expect(parseGameSave({ ...fixture, activeSkillId: 6 })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      skillProgress: [...fixture.skillProgress, { skillId: 0, skillRank: 3, skillExperience: 0 }],
    })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      skillProgress: [
        fixture.skillProgress[0],
        fixture.skillProgress[1],
        { skillId: 1, skillRank: 1, skillExperience: 0 },
      ],
    })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      skillProgress: [
        { ...fixture.skillProgress[0], skillLevelSlotThree: 1 },
        fixture.skillProgress[1],
        fixture.skillProgress[2],
      ],
    })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      skillProgress: [
        { ...fixture.skillProgress[0], skillLevelSlotThree: 0 },
        fixture.skillProgress[1],
        fixture.skillProgress[2],
      ],
    })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      skillProgress: [
        { skillId: 0, skillRank: 2, skillExperience: 164 },
        fixture.skillProgress[1],
        fixture.skillProgress[2],
      ],
    })).toBeNull();
    expect(parseGameSave({ ...fixture, gameFlags: [1024] })).toBeNull();
    expect(parseGameSave({ ...fixture, hud: { ...fixture.hud, hp: 75 } })).toBeNull();
    expect(parseGameSave({ ...fixture, hud: { ...fixture.hud, selectedItemCategory: 11 } })).toBeNull();
    expect(parseGameSave({ ...fixture, comboLimit: 0 })).toBeNull();
    expect(parseGameSave({ ...fixture, comboLimit: 128 })).toBeNull();
  });

  it('retains imported RMS slot indices only while the inventory contents are unchanged', () => {
    const inventory = [
      { category: 7, itemId: 3, count: 2 },
      { category: 22, itemId: 4, count: 1 },
    ];
    const importedSave = parseGameSave({
      ...fixture,
      inventory,
      sourceInventorySlotIndices: [4, 19],
      sourceSpecialInventorySlotIndices: [12],
    });
    expect(importedSave).toMatchObject({
      sourceInventorySlotIndices: [4, 19],
      sourceSpecialInventorySlotIndices: [12],
    });
    const storage = new MemoryStorage();
    writeGameSave(storage, importedSave);
    expect(readGameSave(storage)?.sourceInventorySlotIndices).toEqual([4, 19]);
    expect(readGameSave(storage)?.sourceSpecialInventorySlotIndices).toEqual([12]);
    expect(parseGameSave({
      ...fixture,
      inventory,
      sourceInventorySlotIndices: [4, 4],
    })).toBeNull();
    expect(parseGameSave({
      ...fixture,
      inventory,
      sourceInventorySlotIndices: [30, 1],
    })).toBeNull();

    const snapshot = snapshotSourceInventorySlots(inventory, [4, 19], 30);
    expect(preservedSourceInventorySlotIndices(inventory, snapshot)).toEqual([4, 19]);
    const countChanged = [{ ...inventory[0], count: 1 }, inventory[1]];
    expect(preservedSourceInventorySlotIndices(countChanged, snapshot)).toBeUndefined();
    const countChangedSnapshot = advanceSourceInventorySlotSnapshot(snapshot, countChanged, 30);
    expect(preservedSourceInventorySlotIndices(countChanged, countChangedSnapshot)).toEqual([4, 19]);

    const insertedSnapshot = advanceSourceInventorySlotSnapshot(snapshot, [
      ...inventory,
      { category: 8, itemId: 2, count: 1 },
    ], 30);
    expect(insertedSnapshot?.indices).toEqual([4, 19, 0]);

    const ambiguousReplacementSnapshot = advanceSourceInventorySlotSnapshot(snapshot, [
      { category: 8, itemId: 2, count: 1 },
      inventory[1],
    ], 30);
    expect(ambiguousReplacementSnapshot?.indices).toEqual([0, 18]);
    const equipmentSwapSnapshot = advanceSourceInventorySlotSnapshot(snapshot, [
      { category: 8, itemId: 2, count: 1 },
      inventory[1],
    ], 30, [{ oldIndex: 0, nextIndex: 0 }]);
    expect(equipmentSwapSnapshot?.indices).toEqual([4, 19]);

    const duplicateStacks = [
      { category: 8, itemId: 2, count: 2 },
      { category: 8, itemId: 2, count: 3 },
    ];
    const duplicateSnapshot = snapshotSourceInventorySlots(duplicateStacks, [2, 5], 30);
    expect(advanceSourceInventorySlotSnapshot(duplicateSnapshot, [
      { category: 8, itemId: 2, count: 5 },
    ], 30)).toBeNull();

    // Source f.a(ac) clears the removed slot, then f.d() shifts once from the
    // first hole; with imported holes before slot 4, these later entries move
    // by one even when the removed entry itself was farther into the array.
    const removedFirst = advanceSourceInventorySlotSnapshot(snapshot, [inventory[1]], 30);
    expect(removedFirst?.indices).toEqual([18]);
    const removedLast = advanceSourceInventorySlotSnapshot(snapshot, [inventory[0]], 30);
    expect(removedLast?.indices).toEqual([3]);

    expect(preservedSourceInventorySlotIndices(inventory, null)).toBeUndefined();
  });

  it('treats corrupt or absent storage as no saved game', () => {
    const storage = new MemoryStorage();
    expect(readGameSave(storage)).toBeNull();
    storage.values.set(GAME_SAVE_KEY, '{invalid');
    expect(readGameSave(storage)).toBeNull();
    storage.values.set(GAME_SAVE_KEY, JSON.stringify({ ...fixture, version: 4 }));
    expect(readGameSave(storage)).toBeNull();
  });
});
