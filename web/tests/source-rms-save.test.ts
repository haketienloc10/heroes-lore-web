import { describe, expect, it } from 'vitest';
import {
  decodeSourceRmsFlags,
  decodeSourceRmsInventoryChunk,
  decodeSourceRmsLocation,
  decodeSourceRmsPlayerChunk,
  decodeSourceRmsPrimaryRecord,
  decodeSourceRmsSaveState,
  decodeSourceRmsSpecialRecord,
  decryptSourceRmsChunk,
  encodeSourceRmsFlags,
  encodeSourceRmsInventoryChunk,
  encodeSourceRmsLocation,
  encodeSourceRmsPlayerChunk,
  encodeSourceRmsPrimaryRecord,
  encodeSourceRmsSaveState,
  encodeSourceRmsSpecialRecord,
  encodeSourceRmsStores,
  encryptSourceRmsChunk,
  sourceRmsStoreNames,
} from '../src/world/source-rms-save';
import {
  decodeSourceRmsInventoryItems,
  decodeSourceRmsItemRecord,
  encodeSourceRmsInventoryItems,
  encodeSourceRmsItemRecord,
} from '../src/world/source-rms-items';
import type { EquipmentDataTable, EquipmentItemDefinition } from '../src/world/equipment-data';

const rmsItemDefinition: EquipmentItemDefinition = {
  category: 0,
  itemId: 0,
  sourceValue: 0,
  equipmentByte: 0,
  equipmentType: 0,
  characteristicFlag: false,
  bonusRollCount: 0,
  bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
  subtypeBytes: [11, 22, 33],
};
const rmsEquipmentCatalog: EquipmentDataTable = {
  categories: [[rmsItemDefinition], [], [], [], [], [], []],
};

describe('source RMS record encoding', () => {
  it('matches the source cyclic XOR and checksum rule', () => {
    expect([...encryptSourceRmsChunk(Uint8Array.of(0x00, 0x10, 0xff))])
      .toEqual([0x0b, 0x18, 0xae, 0x64]);
    expect([...decryptSourceRmsChunk(Uint8Array.of(0x0b, 0x18, 0xae, 0x64))])
      .toEqual([0x00, 0x10, 0xff]);
    expect(() => decryptSourceRmsChunk(Uint8Array.of(0x0b, 0x18, 0xae, 0x63)))
      .toThrow('checksum');
  });

  it('frames the four primary chunks in source order and rejects malformed records', () => {
    const chunks = {
      player: Uint8Array.of(1, 2),
      inventory: Uint8Array.of(3),
      flags: Uint8Array.of(4, 5, 6),
      location: Uint8Array.of(7, 8, 9),
    };
    const record = encodeSourceRmsPrimaryRecord(chunks);
    expect(decodeSourceRmsPrimaryRecord(record)).toEqual(chunks);
    expect(() => decodeSourceRmsPrimaryRecord(record.slice(0, -1))).toThrow();
    expect(() => decodeSourceRmsPrimaryRecord(Uint8Array.from([...record, 0])))
      .toThrow('trailing bytes');
  });

  it('encodes the source 1024-bit game and quest flags plus playthrough mode', () => {
    const chunk = encodeSourceRmsFlags([0, 7, 8, 1023], [2, 15, 511, 1023], 2);
    expect(chunk).toHaveLength(257);
    expect([...chunk.slice(0, 2)]).toEqual([0x81, 0x01]);
    expect([...chunk.slice(128, 130)]).toEqual([0x04, 0x80]);
    expect(chunk[255]).toBe(0x80);
    expect(chunk[256]).toBe(2);
    expect(decodeSourceRmsFlags(chunk)).toEqual({
      gameFlags: [0, 7, 8, 1023],
      questFlags: [2, 15, 511, 1023],
      playthroughMode: 2,
    });
    expect(() => encodeSourceRmsFlags([1024], [], 0)).toThrow(RangeError);
  });

  it('stores map ID and tile coordinates in three bytes', () => {
    const chunk = encodeSourceRmsLocation({ mapId: 255, tileX: 38, tileY: 17 });
    expect([...chunk]).toEqual([255, 38, 17]);
    expect(decodeSourceRmsLocation(chunk)).toEqual({ mapId: 255, tileX: 38, tileY: 17 });
    expect(() => encodeSourceRmsLocation({ mapId: 256, tileX: 0, tileY: 0 })).toThrow(RangeError);
  });

  it('round-trips the source player chunk, including signed bytes and optional records', () => {
    const equipment = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const state = {
      completionPoints: -17,
      level: 42,
      hp: 500,
      sp: 240,
      experience: 123456,
      maxHp: 700,
      maxSp: 300,
      nextExperience: 765432,
      comboLimit: 7,
      attributePoints: 12,
      attributes: { power: 8, hp: 15, agility: 4, will: 21 },
      equipmentSlots: [equipment, null, null, equipment, null],
      skills: [
        { skillId: 0, rank: 9, experience: 35, skillLevelSlotOne: 0, skillLevelSlotThree: 1 },
        null,
        { skillId: 4, rank: 10, experience: 12, skillLevelSlotOne: 0, skillLevelSlotThree: null },
        null,
        null,
      ],
      activeSkillSlot: 2,
      playTimeSeconds: -23,
    } as const;
    const chunk = encodeSourceRmsPlayerChunk(state);
    expect(chunk[0]).toBe(0xef);
    expect(decodeSourceRmsPlayerChunk(chunk)).toEqual(state);
    expect(() => encodeSourceRmsPlayerChunk({ ...state, completionPoints: 128 })).toThrow(RangeError);
    expect(() => decodeSourceRmsPlayerChunk(chunk.slice(0, -1))).toThrow();
  });

  it('parses variable-length ordinary and special inventory slot records', () => {
    const itemA = Uint8Array.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const itemB = Uint8Array.from([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    const regular = {
      wallet: 987654,
      slots: Array.from({ length: 30 }, (_, index) => index === 2 ? itemA : index === 29 ? itemB : null),
    };
    const regularChunk = encodeSourceRmsInventoryChunk(regular);
    expect(regularChunk).toHaveLength(4 + 30 + 20);
    expect(decodeSourceRmsInventoryChunk(regularChunk)).toEqual(regular);
    expect(() => decodeSourceRmsInventoryChunk(regularChunk.slice(0, -1))).toThrow();
    expect(() => decodeSourceRmsInventoryChunk(Uint8Array.from([...regularChunk, 0]))).toThrow('trailing bytes');

    const special = { wallet: 0, slots: Array.from({ length: 15 }, (_, index) => index === 7 ? itemB : null) };
    const specialChunk = encodeSourceRmsInventoryChunk(special);
    expect(decodeSourceRmsInventoryChunk(specialChunk, 15)).toEqual(special);
    expect(() => decodeSourceRmsInventoryChunk(specialChunk, 30)).toThrow();
    expect(() => decodeSourceRmsInventoryChunk(specialChunk, 12 as unknown as 30)).toThrow(RangeError);
  });

  it('maps ten-byte source item records to browser item and equipment state', () => {
    const stack = {
      category: 0,
      itemId: 0,
      count: 1,
      equipmentState: {
        sourceFlag: true,
        upgradeByte: -2,
        bonusValues: [-1, 0, 12, -17] as [number, number, number, number],
        subtypeBytes: [11, 22, -5],
      },
    };
    const record = encodeSourceRmsItemRecord(stack);
    expect([...record]).toEqual([0, 0, 1, 1, 254, 255, 0, 12, 239, 251]);
    expect(decodeSourceRmsItemRecord(record, rmsEquipmentCatalog)).toEqual(stack);

    const ordinaryStack = { category: 7, itemId: 3, count: 4 };
    const ordinaryRecord = encodeSourceRmsItemRecord(ordinaryStack);
    expect([...ordinaryRecord]).toEqual([7, 3, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(decodeSourceRmsItemRecord(ordinaryRecord)).toEqual(ordinaryStack);
    expect(() => decodeSourceRmsItemRecord(record)).toThrow('definition');
  });

  it('round-trips source slot positions when encoding typed inventories', () => {
    const slots = Array.from({ length: 30 }, () => null as null | {
      category: number; itemId: number; count: number;
      equipmentState?: {
        sourceFlag: boolean; upgradeByte: number; bonusValues: [number, number, number, number];
        subtypeBytes: number[];
      };
    });
    slots[2] = {
      category: 0,
      itemId: 0,
      count: 1,
      equipmentState: {
        sourceFlag: false,
        upgradeByte: 0,
        bonusValues: [0, 1, 0, -1],
        subtypeBytes: [11, 22, 33],
      },
    };
    slots[11] = { category: 7, itemId: 5, count: 2 };
    const inventory = { wallet: 55, slots };
    const chunk = encodeSourceRmsInventoryItems(inventory);
    expect(decodeSourceRmsInventoryItems(chunk, 30, rmsEquipmentCatalog)).toEqual(inventory);
  });

  it('round-trips a complete structured source save through both class stores', () => {
    const state = {
      heroClassId: 6 as const,
      player: {
        completionPoints: -3,
        level: 1,
        hp: 72,
        sp: 60,
        experience: 0,
        maxHp: 72,
        maxSp: 60,
        nextExperience: 80,
        comboLimit: 1,
        attributePoints: 0,
        attributes: { power: 0, hp: 0, agility: 0, will: 0 },
        equipmentSlots: [null, null, null, null, null],
        skills: [
          { skillId: 0, rank: 1, experience: 0, skillLevelSlotOne: 0, skillLevelSlotThree: null },
          null, null, null, null,
        ],
        activeSkillSlot: 0,
        playTimeSeconds: 120,
      },
      inventory: { wallet: 300, slots: Array.from({ length: 30 }, () => null) },
      flags: { gameFlags: [0, 54], questFlags: [17], playthroughMode: 1 },
      location: { mapId: 0, tileX: 22, tileY: 4 },
      specialInventory: { wallet: 0, slots: Array.from({ length: 15 }, () => null) },
    };
    const stores = encodeSourceRmsSaveState(state);
    expect(stores.primaryStoreName).toBe('_k');
    expect(decodeSourceRmsSaveState(6, stores.primaryRecord, stores.specialRecord)).toEqual(state);
  });

  it('encodes the separate /o inventory record and selects class stores', () => {
    const specialInventory = Uint8Array.of(0, 1, 2, 3);
    const record = encodeSourceRmsSpecialRecord(specialInventory);
    expect(decodeSourceRmsSpecialRecord(record)).toEqual(specialInventory);
    expect(sourceRmsStoreNames(6)).toEqual({ primary: '_k', special: '_o' });
    expect(sourceRmsStoreNames(7)).toEqual({ primary: '_s', special: '_o' });
    expect(sourceRmsStoreNames(8)).toEqual({ primary: '_w', special: '_o' });
    const specialInventoryState = { wallet: 0, slots: Array.from({ length: 15 }, () => null) };
    const stores = encodeSourceRmsStores(7, {
      player: Uint8Array.of(1),
      inventory: Uint8Array.of(2),
      flags: Uint8Array.of(3),
      location: Uint8Array.of(4),
    }, specialInventoryState);
    expect(stores).toMatchObject({
      heroClassId: 7,
      primaryStoreName: '_s',
      specialStoreName: '_o',
    });
    expect(decodeSourceRmsInventoryChunk(decodeSourceRmsSpecialRecord(stores.specialRecord), 15))
      .toEqual(specialInventoryState);
    expect(() => encodeSourceRmsStores(7, {
      player: Uint8Array.of(1), inventory: Uint8Array.of(2), flags: Uint8Array.of(3), location: Uint8Array.of(4),
    }, { wallet: 0, slots: Array.from({ length: 30 }, () => null) })).toThrow('15 slots');
    expect(() => sourceRmsStoreNames(9)).toThrow(RangeError);
  });
});
