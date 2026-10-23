import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import { createBasePlayerAttributes } from '../src/world/attributes';
import {
  GAME_SAVE_KEY,
  parseGameSave,
  readGameSave,
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
  gameFlags: [0, 54, 87, 3],
  questFlags: [18],
  guardianIndices: [0, 2],
  heroClassId: 7,
  attributes: createBasePlayerAttributes(7),
  skillIds: [0, 2, 4],
  comboLimit: 4,
  hud: { ...NEW_GAME_RONIN_HUD },
  wallet: 300,
  inventory: [],
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

  it('loads earlier version-one saves with default progression fields', () => {
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

  it('loads version-one saves from before wallet and inventory persistence', () => {
    const { wallet: _wallet, inventory: _inventory, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)).toMatchObject({ wallet: 300, inventory: [] });
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
    const { skillIds: _skillIds, ...legacySave } = fixture;
    expect(parseGameSave(legacySave)?.skillIds).toEqual([0, 2]);
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
    expect(parseGameSave({ ...fixture, gameFlags: [1024] })).toBeNull();
    expect(parseGameSave({ ...fixture, hud: { ...fixture.hud, hp: 75 } })).toBeNull();
    expect(parseGameSave({ ...fixture, hud: { ...fixture.hud, selectedItemCategory: 11 } })).toBeNull();
    expect(parseGameSave({ ...fixture, comboLimit: 0 })).toBeNull();
    expect(parseGameSave({ ...fixture, comboLimit: 128 })).toBeNull();
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
