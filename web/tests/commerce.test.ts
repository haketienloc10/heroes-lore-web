import { describe, expect, it } from 'vitest';
import {
  applyCommerceOrbAttribute,
  identifyCommerceEquipment,
  mixCommerceItems,
  parseCommerceCatalog,
  purchaseCommerceItem,
  sellCommerceItem,
  upgradeCommerceEquipment,
} from '../src/world/commerce';
import { parseEquipmentDataTable } from '../src/world/equipment-data';

function commerceFixture(): unknown {
  const categories = Array.from({ length: 24 }, (_, category) => {
    const records = [0, 1].map((itemId) => ({
      category,
      itemId,
      recordTypeCode: category,
      nameStringId: itemId,
      descriptionStringId: itemId + 1,
      sourceValue: 100 + itemId * 20,
    }));
    return { category, recordCount: records.length, records };
  });
  return {
    format: 'heroes-lore-commerce-catalog-v1',
    categoryCount: categories.length,
    categories,
    shopStock: [
      [{ category: 7, itemId: 0 }],
      [{ category: 0, itemId: 0 }],
      [],
      [],
      [],
      [],
    ],
    recipeCount: 1,
    recipes: [{
      ingredients: [{ category: 7, itemId: 0 }, { category: 7, itemId: 0 }],
      result: { category: 8, itemId: 0 },
    }],
  };
}

function equipmentFixture(): ReturnType<typeof parseEquipmentDataTable> {
  return parseEquipmentDataTable({
    format: 'heroes-lore-equipment-catalog-v1',
    categoryCount: 7,
    categories: Array.from({ length: 7 }, (_, category) => {
      const records = [0, 1].map((itemId) => ({
        itemId,
        recordTypeCode: category,
        sourceValue: 100,
        equipmentByte: 8,
        equipmentType: 2,
        characteristicFlag: false,
        bonusRollCount: 0,
        bonusRanges: [[0, 0], [0, 0], [0, 0], [0, 0]],
        subtypeBytes: category <= 2 ? [0, 0, 0] : category === 3 ? [255] : [],
      }));
      return {
        format: 'heroes-lore-equipment-data-v1',
        sourceResource: 'itm/' + String(category).padStart(2, '0'),
        category,
        recordCount: records.length,
        records,
      };
    }),
  });
}

function equipmentStack(category: number, itemId = 0, overrides: Partial<{
  sourceFlag: boolean;
  upgradeByte: number;
  subtypeBytes: number[];
}> = {}) {
  return {
    category,
    itemId,
    count: 1,
    equipmentState: {
      sourceFlag: overrides.sourceFlag ?? true,
      upgradeByte: overrides.upgradeByte ?? 0,
      bonusValues: [0, 0, 0, 0] as [number, number, number, number],
      subtypeBytes: overrides.subtypeBytes ?? (category === 3 ? [-1] : category <= 2 ? [0, 0, 0] : []),
    },
  };
}

describe('source shop, refiner, and blacksmith transactions', () => {
  const commerce = parseCommerceCatalog(commerceFixture());
  const equipmentData = equipmentFixture();

  it('parses all 24 item categories, six source stock tabs, and mixture references', () => {
    expect(commerce.categories).toHaveLength(24);
    expect(commerce.shopStock[0]).toEqual([{ category: 7, itemId: 0 }]);
    expect(commerce.recipes[0].ingredients).toHaveLength(2);
    expect(() => parseCommerceCatalog({
      ...(commerceFixture() as Record<string, unknown>), categoryCount: 23,
    })).toThrow(TypeError);
  });

  it('buys stackable stock at full price and sells at one fifth source value', () => {
    const bought = purchaseCommerceItem(
      commerce, equipmentData, [{ category: 7, itemId: 0, count: 2 }], 1000, 7, 0, 3,
    );
    expect(bought).toMatchObject({
      status: 'purchased',
      wallet: 700,
      inventory: [{ category: 7, itemId: 0, count: 5 }],
      price: 300,
    });
    const sold = sellCommerceItem(commerce, bought.inventory, bought.wallet, 7, 0, 2);
    expect(sold).toMatchObject({
      status: 'sold',
      wallet: 740,
      inventory: [{ category: 7, itemId: 0, count: 3 }],
      price: 40,
    });
    expect(sellCommerceItem(commerce, sold.inventory, sold.wallet, 18, 0, 1).status).toBe('not-sellable');
  });

  it('mixes duplicate ingredients from one stack and retains the source 500 wallet amount', () => {
    const mixed = mixCommerceItems(
      commerce, [{ category: 7, itemId: 0, count: 2 }], 500, [0, 0],
    );
    expect(mixed).toMatchObject({
      status: 'mixed',
      wallet: 500,
      inventory: [{ category: 8, itemId: 0, count: 1 }],
      result: { category: 8, itemId: 0 },
    });
    expect(mixCommerceItems(
      commerce, [{ category: 7, itemId: 0, count: 1 }, { category: 7, itemId: 1, count: 1 }],
      500, [0, 1],
    )).toMatchObject({ status: 'failed', inventory: [], wallet: 500 });
  });

  it('identifies equipment for 100 and assigns an orb to a shield for 500', () => {
    const unidentified = equipmentStack(0, 0, { sourceFlag: false });
    expect(identifyCommerceEquipment([unidentified], [null, null, null, null, null], 100,
      { location: 'inventory', index: 0 }))
      .toMatchObject({ status: 'identified', wallet: 0, inventory: [{ equipmentState: { sourceFlag: true } }] });

    const refined = applyCommerceOrbAttribute(
      [equipmentStack(3), { category: 17, itemId: 1, count: 1 }],
      [null, null, null, null, null],
      700,
      { location: 'inventory', index: 0 },
      1,
    );
    expect(refined).toMatchObject({
      status: 'refined',
      wallet: 200,
      inventory: [{ category: 3, equipmentState: { subtypeBytes: [1] } }],
    });
  });

  it('uses the source blacksmith threshold, material count, cost, and break result', () => {
    const upgraded = upgradeCommerceEquipment(
      [{ category: 11, itemId: 0, count: 2 }],
      [equipmentStack(0, 0, { upgradeByte: 1 }), null, null, null, null],
      equipmentData,
      100,
      { location: 'equipment', slot: 0 },
      () => 80,
    );
    expect(upgraded).toMatchObject({
      status: 'enhanced',
      wallet: 0,
      inventory: [],
      equipment: [{ equipmentState: { upgradeByte: 2 } }, null, null, null, null],
      cost: 100,
      materials: 2,
      roll: 80,
    });

    const broken = upgradeCommerceEquipment(
      [{ category: 11, itemId: 0, count: 2 }],
      [equipmentStack(0, 0, { upgradeByte: 1 }), null, null, null, null],
      equipmentData,
      100,
      { location: 'equipment', slot: 0 },
      () => 81,
    );
    expect(broken).toMatchObject({
      status: 'equipment-destroyed',
      equipment: [null, null, null, null, null],
      inventory: [],
      roll: 81,
    });
  });
});
