import { describe, expect, it } from 'vitest';
import {
  createSourceEquipmentInventoryState,
  findEquipmentItem,
  parseEquipmentDataTable,
  parseSourceEquipmentInventoryState,
  type EquipmentItemDefinition,
} from '../src/world/equipment-data';

function catalogFixture(): unknown {
  return {
    format: 'heroes-lore-equipment-catalog-v1',
    categoryCount: 7,
    categories: Array.from({ length: 7 }, (_, category) => {
      const records = Array.from({ length: category === 6 ? 13 : 1 }, (_, itemId) => ({
        itemId,
        recordTypeCode: category,
        sourceValue: -10,
        equipmentByte: 4,
        equipmentType: -1,
        characteristicFlag: false,
        bonusRollCount: 0,
        bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
        subtypeBytes: Array(category <= 2 ? 3 : category === 3 ? 1 : 0).fill(0),
      }));
      if (category === 6) {
        records[12] = {
          itemId: 12,
          recordTypeCode: 6,
          sourceValue: 16900,
          equipmentByte: 13,
          equipmentType: 0,
          characteristicFlag: false,
          bonusRollCount: 1,
          bonusRanges: [[0, 0], [1, 4], [1, 4], [0, 0]],
          subtypeBytes: [],
        };
      }
      return {
        format: 'heroes-lore-equipment-data-v1',
        sourceResource: `itm/${String(category).padStart(2, '0')}`,
        category,
        recordCount: records.length,
        records,
      };
    }),
  };
}

describe('source equipment data and random enhancements', () => {
  it('parses numeric equipment records and finds category-6 item 12', () => {
    const catalog = parseEquipmentDataTable(catalogFixture());
    expect(catalog.categories).toHaveLength(7);
    expect(findEquipmentItem(catalog, 6, 12)).toMatchObject({
      sourceValue: 16900,
      bonusRollCount: 1,
      bonusRanges: [[0, 0], [1, 4], [1, 4], [0, 0]],
    });
    expect(findEquipmentItem(catalog, 6, 13)).toBeUndefined();
    expect(() => parseEquipmentDataTable({
      ...(catalogFixture() as Record<string, unknown>), categoryCount: 6,
    })).toThrow(TypeError);
  });

  it('uses source slot selection and inclusive signed ranges for equipment bonuses', () => {
    const item: EquipmentItemDefinition = {
      category: 6,
      itemId: 12,
      sourceValue: 16900,
      equipmentByte: 13,
      equipmentType: 0,
      characteristicFlag: false,
      bonusRollCount: 2,
      bonusRanges: [[0, 0], [1, 4], [-2, 2], [0, 0]],
      subtypeBytes: [],
    };
    const rolls = [2, -2, 1, 2];
    const calls: Array<[number, number]> = [];
    const state = createSourceEquipmentInventoryState(item, (minimum, maximum) => {
      calls.push([minimum, maximum]);
      return rolls.shift()!;
    }, 'event');
    expect(calls).toEqual([[0, 3], [-2, 2], [0, 3], [1, 4]]);
    expect(state).toEqual({
      sourceFlag: true,
      upgradeByte: 0,
      bonusValues: [0, 2, -2, 0],
      subtypeBytes: [],
    });
  });

  it('retains source-specific item flags and validates saveable equipment bytes', () => {
    const item: EquipmentItemDefinition = {
      category: 3,
      itemId: 0,
      sourceValue: 0,
      equipmentByte: 0,
      equipmentType: 0,
      characteristicFlag: true,
      bonusRollCount: 0,
      bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
      subtypeBytes: [255],
    };
    const state = createSourceEquipmentInventoryState(item, () => 0, 'ground-pickup');
    expect(state).toEqual({ sourceFlag: true, upgradeByte: 0, bonusValues: [0, 0, 0, 0], subtypeBytes: [-1] });
    expect(parseSourceEquipmentInventoryState(state)).toEqual(state);
    expect(parseSourceEquipmentInventoryState({ ...state, bonusValues: [0, 128, 0, 0] })).toBeNull();
  });

});
