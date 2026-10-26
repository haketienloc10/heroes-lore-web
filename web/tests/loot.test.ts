import { describe, expect, it } from 'vitest';
import type { EnemyDefinition } from '../src/world/combat';
import {
  advanceGroundDropTicks,
  canStoreItem,
  canStoreSpecialItem,
  changeInventoryQuantity,
  isGroundDropVisible,
  nextConsumableCategory,
  pickupGroundDrop,
  rollEnemyDrops,
  selectedConsumableCount,
  storeItem,
  storeSpecialItem,
  useConsumableAtIndex,
  useSelectedConsumable,
  type GroundDrop,
  type LootRoller,
} from '../src/world/loot';

const enemy: EnemyDefinition = {
  index: 24,
  labelToken: '580',
  experienceRewardCode: 1,
  classCode: 0,
  shapeCode: 0,
  behaviorType: 0,
  acquisitionRange: 2,
  behaviorTiming: [7, 10],
  extendedProvokedRange: false,
  elementCode: 0,
  maxHp: 43,
  attack: 9,
  defense: 5,
  evasion: 6,
  respawnDelay: 300,
  dropCandidates: [[7, 0, 25], [0, 0, 2], [2, 0, 2]],
};

function scriptedRoller(...values: number[]): LootRoller {
  let index = 0;
  return {
    between(minimum, maximum) {
      const value = values[index++];
      if (value === undefined || value < minimum || value > maximum) {
        throw new Error(`No scripted roll in range ${minimum}..${maximum}`);
      }
      return value;
    },
  };
}

describe('source enemy drops and tile pickup', () => {
  it('applies source event item quantities to stackable and nonstackable inventory entries', () => {
    expect(changeInventoryQuantity([
      { category: 21, itemId: 3, count: 2 },
      { category: 7, itemId: 2, count: 98 },
    ], 21, 3, -1)).toEqual({
      status: 'changed',
      inventory: [
        { category: 21, itemId: 3, count: 1 },
        { category: 7, itemId: 2, count: 98 },
      ],
    });
    expect(changeInventoryQuantity([], 21, 3, 9)).toEqual({
      status: 'changed',
      inventory: [{ category: 21, itemId: 3, count: 1 }],
    });
    expect(changeInventoryQuantity([], 7, 2, 2)).toEqual({
      status: 'changed',
      inventory: [{ category: 7, itemId: 2, count: 2 }],
    });
  });

  it('preserves inventory on source item transaction failures', () => {
    const inventory = [{ category: 21, itemId: 3, count: 1 }];
    expect(changeInventoryQuantity(inventory, 21, 3, -2)).toEqual({
      status: 'missing-item', inventory,
    });
    const fullInventory = Array.from({ length: 30 }, (_, itemId) => ({
      category: 21, itemId, count: 1,
    }));
    expect(changeInventoryQuantity(fullInventory, 21, 30, 1).status).toBe('inventory-full');
    expect(changeInventoryQuantity([], 4, 2, 1).status).toBe('unsupported-item');
  });

  it('selects weighted item drops and applies the independent coin and rare item rolls', () => {
    expect(rollEnemyDrops({ tileX: 4, tileY: 6, definition: enemy }, 1,
      scriptedRoller(1, 100, 100, 100))).toEqual([
      { kind: 'item', category: 7, itemId: 0, count: 1, tileX: 4, tileY: 6 },
    ]);
  });

  it('continues past a failed one-weight candidate and drops category 11 on its own roll', () => {
    const oneWeightEnemy = {
      ...enemy,
      experienceRewardCode: 5,
      dropCandidates: [[7, 1, 1], [3, 2, 5]] as Array<[number, number, number]>,
    };
    expect(rollEnemyDrops({ tileX: 0, tileY: 0, definition: oneWeightEnemy }, 1,
      scriptedRoller(1, 21, 100, 1))).toEqual([
      { kind: 'item', category: 3, itemId: 2, count: 1, tileX: 0, tileY: 0 },
      { kind: 'item', category: 11, itemId: 0, count: 1, tileX: 0, tileY: 0 },
    ]);
  });

  it('collects a coin bundle on the current tile with the source ninefold multiplier', () => {
    const coin: GroundDrop = {
      id: 1,
      kind: 'currency',
      sourceAmount: 3,
      tileX: 4,
      tileY: 6,
      ticksRemaining: 120,
    };
    expect(pickupGroundDrop([coin], 4, 6, [], 300)).toMatchObject({
      pickedUp: coin,
      wallet: 327,
      drops: [],
    });
  });

  it('adds stackable categories up to 99 and retains an item if all slots are full', () => {
    const inventory = Array.from({ length: 30 }, (_, slot) => ({
      category: 0,
      itemId: slot,
      count: 1,
    }));
    const fullStack = [...inventory.slice(0, 29), { category: 7, itemId: 2, count: 99 }];
    expect(canStoreItem(fullStack, 7, 2, 1)).toBe(false);
    const drop: GroundDrop = {
      id: 3,
      kind: 'item',
      category: 7,
      itemId: 2,
      count: 1,
      tileX: 1,
      tileY: 2,
      ticksRemaining: 120,
    };
    expect(pickupGroundDrop([drop], 1, 2, fullStack, 300)).toMatchObject({
      status: 'no-space',
      pickedUp: null,
      drops: [drop],
    });
    expect(storeItem([{ category: 7, itemId: 2, count: 98 }], 7, 2, 1)).toEqual([
      { category: 7, itemId: 2, count: 99 },
    ]);
  });

  it('keeps source category-22 pickups in the separate 15-slot inventory', () => {
    const drop: GroundDrop = {
      id: 4,
      kind: 'item',
      category: 22,
      itemId: 6,
      count: 2,
      tileX: 1,
      tileY: 2,
      ticksRemaining: 120,
    };
    const result = pickupGroundDrop([drop], 1, 2, [], 300);
    expect(result).toMatchObject({
      pickedUp: drop,
      inventory: [],
      specialInventory: [{ category: 22, itemId: 6, count: 2 }],
      drops: [],
    });
    expect(canStoreSpecialItem([], 21, 6, 1)).toBe(false);
    expect(storeSpecialItem([], 22, 6, 98)).toEqual([
      { category: 22, itemId: 6, count: 98 },
    ]);
    expect(storeSpecialItem([
      { category: 22, itemId: 6, count: 50 },
      { category: 22, itemId: 6, count: 60 },
    ], 22, 6, 1)).toEqual([
      { category: 22, itemId: 6, count: 99 },
      { category: 22, itemId: 6, count: 12 },
    ]);
  });

  it('retains category-22 ground items when the separate source inventory is full', () => {
    const specialInventory = Array.from({ length: 15 }, (_, itemId) => ({
      category: 22,
      itemId,
      count: 99,
    }));
    const drop: GroundDrop = {
      id: 5,
      kind: 'item',
      category: 22,
      itemId: 20,
      count: 1,
      tileX: 3,
      tileY: 4,
      ticksRemaining: 120,
    };
    expect(canStoreSpecialItem(specialInventory, 22, 20, 1)).toBe(false);
    expect(pickupGroundDrop([drop], 3, 4, [], 300, undefined, specialInventory)).toMatchObject({
      status: 'no-space',
      pickedUp: null,
      inventory: [],
      specialInventory,
      drops: [drop],
    });
  });

  it('reports no drop separately from an item that cannot fit', () => {
    expect(pickupGroundDrop([], 1, 2, [], 300).status).toBe('no-drop');
    const elsewhere: GroundDrop = {
      id: 7,
      kind: 'item',
      category: 7,
      itemId: 2,
      count: 1,
      tileX: 2,
      tileY: 2,
      ticksRemaining: 120,
    };
    expect(pickupGroundDrop([elsewhere], 1, 2, [], 300).status).toBe('no-drop');
  });

  it('stacks category-22 items into a matching slot when the special inventory has no free slot', () => {
    const specialInventory = Array.from({ length: 15 }, (_, itemId) => ({
      category: 22,
      itemId,
      count: itemId === 7 ? 98 : 99,
    }));
    const drop: GroundDrop = {
      id: 6,
      kind: 'item',
      category: 22,
      itemId: 7,
      count: 1,
      tileX: 3,
      tileY: 4,
      ticksRemaining: 120,
    };
    expect(pickupGroundDrop([drop], 3, 4, [], 300, undefined, specialInventory)).toMatchObject({
      pickedUp: drop,
      specialInventory: specialInventory.map((stack) =>
        stack.itemId === 7 ? { ...stack, count: 99 } : stack),
      drops: [],
    });
  });

  it('cycles the source quick-item categories and uses potion/wine percentages', () => {
    const potionState = {
      hp: 50,
      maxHp: 72,
      sp: 20,
      maxSp: 60,
      selectedItemCategory: 7 as const,
      selectedItemCount: 2,
    };
    const potionUse = useSelectedConsumable([
      { category: 7, itemId: 0, count: 2 },
      { category: 9, itemId: 0, count: 1 },
    ], potionState);
    expect(potionUse).toMatchObject({
      used: true,
      state: { hp: 64, selectedItemCount: 1 },
      inventory: [
        { category: 7, itemId: 0, count: 1 },
        { category: 9, itemId: 0, count: 1 },
      ],
    });

    const wineUse = useSelectedConsumable([
      { category: 9, itemId: 0, count: 1 },
    ], { ...potionState, selectedItemCategory: 9, selectedItemCount: 1 });
    expect(wineUse).toMatchObject({
      used: true,
      state: { sp: 38, selectedItemCount: 0 },
      inventory: [],
    });
    expect(nextConsumableCategory(7)).toBe(8);
    expect(nextConsumableCategory(10)).toBe(7);
    expect(selectedConsumableCount([{ category: 8, itemId: 0, count: 3 }], 8)).toBe(3);
  });

  it('uses a high potion up to the HP cap and consumes an antidote from its selected stack', () => {
    const state = {
      hp: 60,
      maxHp: 72,
      sp: 30,
      maxSp: 60,
      selectedItemCategory: 8 as const,
      selectedItemCount: 1,
    };
    const highPotion = useSelectedConsumable([{ category: 8, itemId: 0, count: 1 }], state);
    expect(highPotion).toMatchObject({ used: true, state: { hp: 72 }, inventory: [] });

    const antidote = useSelectedConsumable([{ category: 10, itemId: 0, count: 1 }], {
      ...state,
      selectedItemCategory: 10,
    }, [7, 3]);
    expect(antidote).toMatchObject({
      used: true,
      inventory: [],
      state: { selectedItemCount: 0 },
      statusEffects: [3],
    });
  });

  it('uses the selected inventory row and rejects non-consumable rows', () => {
    const inventory = [
      { category: 7, itemId: 0, count: 2 },
      { category: 9, itemId: 0, count: 1 },
      { category: 11, itemId: 0, count: 1 },
    ];
    const state = {
      hp: 50,
      maxHp: 72,
      sp: 20,
      maxSp: 60,
      selectedItemCategory: 7 as const,
      selectedItemCount: 2,
    };
    const wine = useConsumableAtIndex(inventory, state, [], 1);
    expect(wine).toMatchObject({
      used: true,
      state: { selectedItemCategory: 9, selectedItemCount: 0, sp: 38 },
      inventory: [inventory[0], inventory[2]],
    });
    expect(useConsumableAtIndex(inventory, state, [], 2)).toMatchObject({ used: false });
    expect(useConsumableAtIndex(inventory, state, [], -1)).toMatchObject({ used: false });
  });

  it('consumes the chosen row when multiple item IDs share a consumable category', () => {
    const inventory = [
      { category: 7, itemId: 0, count: 2 },
      { category: 7, itemId: 1, count: 3 },
    ];
    const result = useConsumableAtIndex(inventory, {
      hp: 50,
      maxHp: 72,
      sp: 20,
      maxSp: 60,
      selectedItemCategory: 7,
      selectedItemCount: 2,
    }, [], 1);

    expect(result).toMatchObject({
      used: true,
      state: { hp: 64, selectedItemCategory: 7 },
      inventory: [inventory[0], { category: 7, itemId: 1, count: 2 }],
    });
  });

  it('blocks quick and inventory consumable use while the player is defeated', () => {
    const inventory = [{ category: 7, itemId: 0, count: 2 }];
    const state = {
      hp: 0,
      maxHp: 72,
      sp: 20,
      maxSp: 60,
      selectedItemCategory: 7 as const,
      selectedItemCount: 2,
    };

    expect(useSelectedConsumable(inventory, state, [], false)).toEqual({
      inventory,
      state,
      statusEffects: [],
      used: false,
    });
    expect(useConsumableAtIndex(inventory, state, [], 0, false)).toEqual({
      inventory,
      state,
      statusEffects: [],
      used: false,
    });
  });

  it('keeps drops through timer zero, removes them below zero, and blinks at source cadence', () => {
    const drop: GroundDrop = {
      id: 9,
      kind: 'currency',
      sourceAmount: 3,
      tileX: 0,
      tileY: 0,
      ticksRemaining: 16,
    };
    expect(isGroundDropVisible(drop)).toBe(true);
    const blinking = advanceGroundDropTicks([drop]);
    expect(isGroundDropVisible(blinking[0])).toBe(false);
    expect(advanceGroundDropTicks([{ ...drop, ticksRemaining: 0 }])).toEqual([]);
    expect(advanceGroundDropTicks([{ ...drop, ticksRemaining: 0 }], 1)).toEqual([]);
  });
});
