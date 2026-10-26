import { describe, expect, it } from 'vitest';
import type { EquipmentDataTable, EquipmentItemDefinition } from '../src/world/equipment-data';
import {
  calculateEquipmentStats,
  createStartingEquipment,
  equipmentInventoryIndicesForSlot,
  EQUIPMENT_SLOT_LABELS,
  equipInventoryItem,
  normalizeEquipmentInventory,
  parseEquipmentLoadout,
  sourceEquipmentCategoryForSlot,
} from '../src/world/equipment';
import type { InventoryStack } from '../src/world/loot';

function item(category: number, itemId: number, equipmentByte: number): EquipmentItemDefinition {
  return {
    category,
    itemId,
    sourceValue: 0,
    equipmentByte,
    equipmentType: 0,
    characteristicFlag: false,
    bonusRollCount: 0,
    bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
    subtypeBytes: Array(category <= 2 ? 3 : category === 3 ? 1 : 0).fill(0),
  };
}

function catalogFixture(): EquipmentDataTable {
  const categories = Array.from({ length: 7 }, (_, category) =>
    Array.from({ length: category === 6 ? 13 : 1 }, (_, itemId) => item(
      category,
      itemId,
      category === 6 && itemId === 12 ? 13 : [10, 10, 6, 2, 1, 2, 1][category],
    )),
  );
  return { categories };
}

function state(category: number, itemId: number, bonuses: [number, number, number, number] = [0, 0, 0, 0]): InventoryStack {
  return {
    category,
    itemId,
    count: 1,
    equipmentState: {
      sourceFlag: true,
      upgradeByte: 0,
      bonusValues: bonuses,
      subtypeBytes: Array(category <= 2 ? 3 : category === 3 ? 1 : 0).fill(0),
    },
  };
}

describe('source equipment loadout and player stats', () => {
  it('labels the five source equipment slots in their stored category order', () => {
    expect(EQUIPMENT_SLOT_LABELS).toEqual(['WEAPON', 'ARMOR', 'SHIELD', 'HELMET', 'SHOES']);
  });

  it('filters slot-first choices by class-specific category and source bag order', () => {
    const inventory: InventoryStack[] = [
      { category: 7, itemId: 0, count: 1 },
      state(0, 0),
      state(2, 0),
      state(1, 0),
      state(3, 0),
      state(5, 0),
      state(6, 0),
      state(4, 0),
      { ...state(0, 1), equipmentState: { ...state(0, 1).equipmentState!, sourceFlag: false } },
      { category: 0, itemId: 1, count: 1 },
    ];
    expect([6, 7, 8].map((heroClassId) => sourceEquipmentCategoryForSlot(0, heroClassId as 6 | 7 | 8)))
      .toEqual([0, 2, 1]);
    expect(sourceEquipmentCategoryForSlot(1, 6)).toBeNull();
    expect(sourceEquipmentCategoryForSlot(1, 8)).toBe(3);
    expect(equipmentInventoryIndicesForSlot(inventory, 0, 6)).toEqual([1, 8]);
    expect(equipmentInventoryIndicesForSlot(inventory, 0, 7)).toEqual([2]);
    expect(equipmentInventoryIndicesForSlot(inventory, 0, 8)).toEqual([3]);
    expect(equipmentInventoryIndicesForSlot(inventory, 1, 6)).toEqual([]);
    expect(equipmentInventoryIndicesForSlot(inventory, 1, 8)).toEqual([4]);
    expect(equipmentInventoryIndicesForSlot(inventory, 2, 6)).toEqual([5]);
    expect(equipmentInventoryIndicesForSlot(inventory, 3, 6)).toEqual([6]);
    expect(equipmentInventoryIndicesForSlot(inventory, 4, 6)).toEqual([7]);
    expect(equipmentInventoryIndicesForSlot(inventory, 5, 6)).toEqual([]);
  });

  it('creates the source Ronin starter loadout and reproduces its level-one stats', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    const stats = calculateEquipmentStats(equipment, catalog, 6, 1);
    expect(equipment.map((stack) => stack?.category ?? null)).toEqual([0, null, 5, 6, 4]);
    expect(stats).toMatchObject({
      maxHp: 72,
      maxSp: 60,
      attack: { power: 16, dexterity: 3 },
      defense: { defense: 5, dexterity: 3 },
      enhancementBonuses: [0, 0, 0, 0],
    });
  });

  it('adds enhancement bytes and the weapon upgrade to the source formulas', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    equipment[0] = state(0, 0, [2, 1, 3, 4]);
    equipment[0]!.equipmentState!.upgradeByte = 2;
    const stats = calculateEquipmentStats(equipment, catalog, 6, 1);
    expect(stats.maxHp).toBe(84);
    expect(stats.maxSp).toBe(108);
    expect(stats.attack.power).toBe(23);
    expect(stats.attack.dexterity).toBe(6);
    expect(stats.defense.defense).toBe(6);
  });

  it('applies allocated Power, HP, Agility, and Will to source-derived stats', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    const stats = calculateEquipmentStats(equipment, catalog, 6, 99, {
      power: 38,
      hp: 6,
      agility: 8,
      will: 7,
    });
    expect(stats).toMatchObject({
      maxHp: 1260,
      maxSp: 1272,
      attack: { power: 40, dexterity: 8 },
      defense: { defense: 44, dexterity: 8 },
      attributes: { power: 38, hp: 6, agility: 8, will: 7 },
    });
  });

  it('derives the source critical threshold and extra damage from weapon subtype bytes', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    equipment[0]!.equipmentState!.subtypeBytes = [15, 10, -1];
    const stats = calculateEquipmentStats(equipment, catalog, 6, 1);
    expect(stats.attack.criticalChance).toBe(16);
    expect(stats.attack.criticalDamageBonusTenths).toBe(10);
  });

  it('swaps equipment with the selected inventory index and validates saved slot categories', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    const inventory = [state(6, 12, [0, 1, 0, 0])];
    const result = equipInventoryItem(inventory, equipment, 0);
    expect(result?.slot).toBe(3);
    expect(result?.equipment[3]?.itemId).toBe(12);
    expect(result?.inventory).toEqual([equipment[3]]);
    expect(parseEquipmentLoadout(result?.equipment)).toEqual(result?.equipment);
    const invalid = [...equipment];
    invalid[1] = state(6, 12);
    expect(parseEquipmentLoadout(invalid)).toBeNull();
  });

  it('does not equip an equipment record until its source identification flag is set', () => {
    const inventory = [{
      ...state(0, 1),
      equipmentState: { ...state(0, 1).equipmentState!, sourceFlag: false },
    }];
    const equipment = createStartingEquipment(6, catalogFixture());
    expect(equipInventoryItem(inventory, equipment, 0)).toBeNull();
  });

  it('fills an empty armor slot and removes that inventory entry', () => {
    const catalog = catalogFixture();
    const equipment = createStartingEquipment(6, catalog);
    const inventory = [state(3, 0)];
    const result = equipInventoryItem(inventory, equipment, 0);
    expect(result?.equipment[1]?.category).toBe(3);
    expect(result?.inventory).toEqual([]);
  });

  it('fills missing per-instance bytes from pre-M71 saves without bonus rolls', () => {
    const legacyInventory = [{ category: 6, itemId: 12, count: 1 }];
    const migrated = normalizeEquipmentInventory(legacyInventory, catalogFixture());
    expect(migrated[0].equipmentState).toEqual({
      sourceFlag: true,
      upgradeByte: 0,
      bonusValues: [0, 0, 0, 0],
      subtypeBytes: [],
    });
  });
});
