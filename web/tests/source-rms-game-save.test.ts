import { describe, expect, it } from 'vitest';
import { parseGameSave, prepareNextSourceCycle, type GameSaveState } from '../src/world/save-data';
import { decodeSourceRmsSaveState } from '../src/world/source-rms-save';
import { encodeSourceRmsItemRecord } from '../src/world/source-rms-items';
import type { EquipmentDataTable } from '../src/world/equipment-data';
import {
  createGameSaveFromSourceRmsState,
  createSourceRmsStateFromGameSave,
  decodeSourceRmsStoresAsGameSave,
  encodeGameSaveAsSourceRmsStores,
} from '../src/world/source-rms-game-save';
import {
  importSourceRmsPackage,
  parseSourceRmsPackage,
  serializeSourceRmsPackage,
} from '../src/world/source-rms-package';

const weapon = {
  category: 0,
  itemId: 0,
  count: 1,
  equipmentState: {
    sourceFlag: true,
    upgradeByte: 2,
    bonusValues: [1, 2, 3, 4] as [number, number, number, number],
    subtypeBytes: [11, 22, 33],
  },
};

const equipmentCatalog: EquipmentDataTable = {
  categories: [[{
    category: 0,
    itemId: 0,
    sourceValue: 0,
    equipmentByte: 0,
    equipmentType: 0,
    characteristicFlag: false,
    bonusRollCount: 0,
    bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
    subtypeBytes: [11, 22, 33],
  }], [], [], [], [], [], []],
};

const save: GameSaveState = {
  version: 1,
  savedAt: 1234,
  mapId: 64,
  tileX: 9,
  tileY: 8,
  direction: 2,
  playthroughMode: 1,
  completionPoints: -3,
  playTimeSeconds: 120,
  gameFlags: [0, 54],
  questFlags: [17],
  guardianIndices: [0, 2],
  heroClassId: 6,
  attributes: { power: 8, hp: 5, agility: 3, will: 4 },
  skillIds: [2, 0],
  activeSkillId: 0,
  skillProgress: [
    {
      skillId: 2,
      skillRank: 3,
      skillExperience: 12,
      skillLevelSlotOne: 0,
      skillLevelSlotThree: null,
    },
    {
      skillId: 0,
      skillRank: 1,
      skillExperience: 0,
      skillLevelSlotOne: 0,
      skillLevelSlotThree: null,
    },
  ],
  comboLimit: 2,
  hud: {
    hp: 60,
    maxHp: 84,
    sp: 45,
    maxSp: 72,
    experience: 25,
    experienceToNextLevel: 158,
    level: 2,
    attributePoints: 4,
    selectedItemCount: 2,
    selectedItemCategory: 7,
  },
  wallet: 345,
  inventory: [
    { category: 7, itemId: 3, count: 2 },
    { category: 22, itemId: 4, count: 1 },
  ],
  specialInventory: [{ category: 22, itemId: 5, count: 1 }],
  equipmentSlots: [weapon, null, null, null, null],
};

describe('web save to source RMS mapping', () => {
  it('maps every source-backed web field into the class stores in memory', () => {
    const sourceState = createSourceRmsStateFromGameSave(save);
    expect(sourceState).toMatchObject({
      heroClassId: 6,
      player: {
        completionPoints: -3,
        level: 2,
        hp: 60,
        sp: 45,
        experience: 25,
        maxHp: 84,
        maxSp: 72,
        nextExperience: 158,
        comboLimit: 2,
        attributePoints: 4,
        attributes: save.attributes,
        activeSkillSlot: 1,
        playTimeSeconds: 120,
      },
      inventory: {
        wallet: 345,
        slots: [
          expect.any(Uint8Array),
          expect.any(Uint8Array),
          ...Array.from({ length: 28 }, () => null),
        ],
      },
      flags: { gameFlags: [0, 54], questFlags: [17], playthroughMode: 1 },
      location: { mapId: 64, tileX: 9, tileY: 8 },
      specialInventory: {
        wallet: 0,
        slots: [expect.any(Uint8Array), ...Array.from({ length: 14 }, () => null)],
      },
    });
    expect(sourceState.player.skills).toEqual([
      { skillId: 2, rank: 3, experience: 12, skillLevelSlotOne: 0, skillLevelSlotThree: null },
      { skillId: 0, rank: 1, experience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
      null, null, null,
    ]);
    expect(sourceState.player.equipmentSlots[0]).toEqual(encodeSourceRmsItemRecord(weapon));
  });

  it('produces the source-framed primary and /o records without browser storage', () => {
    const stores = encodeGameSaveAsSourceRmsStores(save);
    expect(stores).toMatchObject({
      heroClassId: 6,
      primaryStoreName: '_k',
      specialStoreName: '_o',
    });
    const decoded = decodeSourceRmsSaveState(6, stores.primaryRecord, stores.specialRecord);
    expect(decoded.player).toMatchObject({
      completionPoints: -3,
      level: 2,
      hp: 60,
      sp: 45,
      experience: 25,
      maxHp: 84,
      maxSp: 72,
      nextExperience: 158,
      comboLimit: 2,
      attributePoints: 4,
      attributes: save.attributes,
      activeSkillSlot: 1,
      playTimeSeconds: 120,
    });
    expect(decoded.inventory.wallet).toBe(345);
    expect(decoded.inventory.slots[0]).toEqual(encodeSourceRmsItemRecord(save.inventory[0]));
    expect(decoded.inventory.slots[1]).toEqual(encodeSourceRmsItemRecord(save.inventory[1]));
    expect(decoded.specialInventory.slots[0]).toEqual(encodeSourceRmsItemRecord(save.specialInventory[0]));
    expect(decoded.location).toEqual({ mapId: 64, tileX: 9, tileY: 8 });
    expect(decoded.flags).toEqual({ gameFlags: [0, 54], questFlags: [17], playthroughMode: 1 });
  });

  it('imports the source-backed fields and supplies only fields absent from the native records', () => {
    const stores = encodeGameSaveAsSourceRmsStores(save);
    const imported = decodeSourceRmsStoresAsGameSave(
      stores.heroClassId,
      stores.primaryRecord,
      stores.specialRecord,
      equipmentCatalog,
      { savedAt: 5432 },
    );
    expect(imported).toMatchObject({
      savedAt: 5432,
      mapId: 64,
      tileX: 9,
      tileY: 8,
      direction: 2,
      playthroughMode: 1,
      completionPoints: -3,
      playTimeSeconds: 120,
      gameFlags: [0, 54],
      questFlags: [17],
      guardianIndices: [0, 2],
      heroClassId: 6,
      attributes: save.attributes,
      skillIds: [2, 0],
      activeSkillId: 0,
      skillProgress: save.skillProgress,
      comboLimit: 2,
      hud: { ...save.hud, selectedItemCount: 2, selectedItemCategory: 7 },
      wallet: 345,
      inventory: save.inventory,
      specialInventory: save.specialInventory,
      equipmentSlots: [weapon, null, null, null, null],
    });
  });

  it('preserves sparse source inventory slots across an unchanged package round trip', () => {
    const sparseSave: GameSaveState = {
      ...save,
      sourceInventorySlotIndices: [3, 17],
      sourceSpecialInventorySlotIndices: [7],
    };
    const stores = encodeGameSaveAsSourceRmsStores(sparseSave);
    const source = decodeSourceRmsSaveState(6, stores.primaryRecord, stores.specialRecord);
    expect(source.inventory.slots[3]).toEqual(encodeSourceRmsItemRecord(save.inventory[0]));
    expect(source.inventory.slots[17]).toEqual(encodeSourceRmsItemRecord(save.inventory[1]));
    expect(source.specialInventory.slots[7]).toEqual(encodeSourceRmsItemRecord(save.specialInventory[0]));
    expect(source.inventory.slots[0]).toBeNull();

    const imported = decodeSourceRmsStoresAsGameSave(
      stores.heroClassId,
      stores.primaryRecord,
      stores.specialRecord,
      equipmentCatalog,
      { savedAt: 5432 },
    );
    expect(imported.sourceInventorySlotIndices).toEqual([3, 17]);
    expect(imported.sourceSpecialInventorySlotIndices).toEqual([7]);
    const reExported = encodeGameSaveAsSourceRmsStores(imported);
    expect(reExported.primaryRecord).toEqual(stores.primaryRecord);
    expect(reExported.specialRecord).toEqual(stores.specialRecord);
  });

  it('validates preserved source slots and filters them with next-cycle item removal', () => {
    expect(parseGameSave({
      ...save,
      sourceInventorySlotIndices: [3, 3],
    })).toBeNull();
    expect(() => encodeGameSaveAsSourceRmsStores({
      ...save,
      sourceInventorySlotIndices: [3],
    })).toThrow('invalid preserved source slot indices');

    const cycle = prepareNextSourceCycle({
      ...save,
      inventory: [
        { category: 18, itemId: 1, count: 1 },
        { category: 22, itemId: 4, count: 1 },
        { category: 19, itemId: 2, count: 1 },
      ],
      sourceInventorySlotIndices: [1, 7, 21],
    }, 99);
    expect(cycle.inventory).toEqual([{ category: 22, itemId: 4, count: 1 }]);
    expect(cycle.sourceInventorySlotIndices).toEqual([7]);
  });

  it('rejects source records with fields the web model cannot represent', () => {
    const source = createSourceRmsStateFromGameSave(save);
    expect(() => createGameSaveFromSourceRmsState({
      ...source,
      player: { ...source.player, activeSkillSlot: 4 },
    }, equipmentCatalog, { savedAt: 1 })).toThrow('active skill slot is empty');
    expect(() => createGameSaveFromSourceRmsState({
      ...source,
      specialInventory: { ...source.specialInventory, wallet: 1 },
    }, equipmentCatalog, { savedAt: 1 })).toThrow('special-inventory wallet');
  });

  it('rejects web saves without source-representable equipment or valid skill slots', () => {
    expect(() => createSourceRmsStateFromGameSave({ ...save, equipmentSlots: null }))
      .toThrow('five saved equipment slots');
    expect(() => createSourceRmsStateFromGameSave({ ...save, skillIds: [0, 1, 2, 3, 4, 5] }))
      .toThrow('one through five learned skills');
    expect(() => createSourceRmsStateFromGameSave({ ...save, activeSkillId: 5 }))
      .toThrow('Active skill must reference a learned skill slot');
    expect(() => createSourceRmsStateFromGameSave({ ...save, skillProgress: save.skillProgress.slice(0, 1) }))
      .toThrow('exactly one saved progress record');
  });

  it('exports and imports a portable package containing the exact two source records', () => {
    const text = serializeSourceRmsPackage(save);
    const packaged = parseSourceRmsPackage(JSON.parse(text) as unknown);
    const stores = encodeGameSaveAsSourceRmsStores(save);
    expect(packaged).toMatchObject({
      format: 'heroes-lore-source-rms-record-pair-v1',
      heroClassId: 6,
      primaryStoreName: '_k',
      specialStoreName: '_o',
    });
    expect(packaged.primaryRecordHex).toBe(
      Array.from(stores.primaryRecord, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    );
    expect(packaged.specialRecordHex).toBe(
      Array.from(stores.specialRecord, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    );
    expect(importSourceRmsPackage(text, equipmentCatalog, { savedAt: 5432 })).toMatchObject({
      savedAt: 5432,
      mapId: save.mapId,
      tileX: save.tileX,
      tileY: save.tileY,
      direction: 2,
      heroClassId: save.heroClassId,
      activeSkillId: save.activeSkillId,
      inventory: save.inventory,
      specialInventory: save.specialInventory,
      equipmentSlots: save.equipmentSlots,
    });
  });

  it('rejects mismatched store names, malformed record text, and damaged source checksums', () => {
    const packaged = JSON.parse(serializeSourceRmsPackage(save)) as Record<string, unknown>;
    expect(() => parseSourceRmsPackage({ ...packaged, primaryStoreName: '_s' }))
      .toThrow('do not match the hero class');
    expect(() => parseSourceRmsPackage({ ...packaged, specialRecordHex: 'xyz' }))
      .toThrow('hexadecimal record');
    const primaryHex = String(packaged.primaryRecordHex);
    const firstByte = Number.parseInt(primaryHex.slice(0, 2), 16) ^ 1;
    const damaged = {
      ...packaged,
      primaryRecordHex: firstByte.toString(16).padStart(2, '0') + primaryHex.slice(2),
    };
    expect(() => importSourceRmsPackage(JSON.stringify(damaged), equipmentCatalog, { savedAt: 1 }))
      .toThrow('checksum');
  });
});
