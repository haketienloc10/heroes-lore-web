import type { EnemyDefinition } from './combat';
import {
  parseSourceEquipmentInventoryState,
  type SourceEquipmentInventoryState,
} from './equipment-data';

export const INVENTORY_SLOT_COUNT = 30;
/** Source `an.f73b`: the separate category-22 inventory has fifteen slots. */
export const SPECIAL_INVENTORY_SLOT_COUNT = 15;
export const GROUND_DROP_LIFETIME_TICKS = 120;
export const NEW_GAME_WALLET = 300;
export const CONSUMABLE_CATEGORIES = [7, 8, 9, 10] as const;
export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

export interface ConsumablePlayerState {
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  selectedItemCategory: ConsumableCategory;
  selectedItemCount: number;
}

const STACKABLE_CATEGORIES = new Set([
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23,
]);

export interface InventoryStack {
  category: number;
  itemId: number;
  count: number;
  /** Source `d`/`s` serialized state for equipment categories 0–6. */
  equipmentState?: SourceEquipmentInventoryState;
}

export function nextConsumableCategory(category: ConsumableCategory): ConsumableCategory {
  const index = CONSUMABLE_CATEGORIES.indexOf(category);
  return CONSUMABLE_CATEGORIES[(index + 1) % CONSUMABLE_CATEGORIES.length];
}

export function selectedConsumableCount(
  inventory: readonly InventoryStack[],
  category: ConsumableCategory,
): number {
  return inventory.find((stack) => stack.category === category)?.count ?? 0;
}

export interface ConsumableUseResult {
  inventory: InventoryStack[];
  state: ConsumablePlayerState;
  statusEffects: number[];
  used: boolean;
}

function unchangedConsumableUse(
  inventory: readonly InventoryStack[],
  state: ConsumablePlayerState,
  statusEffects: readonly number[],
): ConsumableUseResult {
  return {
    inventory: inventory.map((stack) => ({ ...stack })),
    state,
    statusEffects: [...statusEffects],
    used: false,
  };
}

function useConsumableAtInventoryIndex(
  inventory: readonly InventoryStack[],
  state: ConsumablePlayerState,
  statusEffects: readonly number[],
  index: number,
  playerCanUseItems: boolean,
): ConsumableUseResult {
  const selected = inventory[index];
  if (!playerCanUseItems || selected === undefined ||
    !CONSUMABLE_CATEGORIES.includes(selected.category as ConsumableCategory)) {
    return unchangedConsumableUse(inventory, state, statusEffects);
  }
  const category = selected.category as ConsumableCategory;
  const nextState = { ...state, selectedItemCategory: category };
  if (category === 7) {
    nextState.hp = Math.min(state.maxHp, state.hp + Math.trunc((state.maxHp * 20) / 100));
  } else if (category === 8) {
    nextState.hp = Math.min(state.maxHp, state.hp + Math.trunc((state.maxHp * 40) / 100));
  } else if (category === 9) {
    nextState.sp = Math.min(state.maxSp, state.sp + Math.trunc((state.maxSp * 30) / 100));
  }
  const nextStatusEffects = category === 10
    ? statusEffects.filter((status) => status !== 7)
    : [...statusEffects];
  const nextInventory = inventory.map((stack) => ({ ...stack }));
  if (selected.count === 1) nextInventory.splice(index, 1);
  else nextInventory[index].count -= 1;
  nextState.selectedItemCount = selectedConsumableCount(nextInventory, category);
  return {
    inventory: nextInventory,
    state: nextState,
    statusEffects: nextStatusEffects,
    used: true,
  };
}

/** Apply the four source consumable-category effects from `an.m22a()`. */
export function useSelectedConsumable(
  inventory: readonly InventoryStack[],
  state: ConsumablePlayerState,
  statusEffects: readonly number[] = [],
  playerCanUseItems = true,
): ConsumableUseResult {
  if (!playerCanUseItems) return unchangedConsumableUse(inventory, state, statusEffects);
  const index = inventory.findIndex((stack) => stack.category === state.selectedItemCategory);
  return index < 0
    ? unchangedConsumableUse(inventory, state, statusEffects)
    : useConsumableAtInventoryIndex(inventory, state, statusEffects, index, true);
}

/** Use the selected bag row, while preserving the source category-7–10 effects. */
export function useConsumableAtIndex(
  inventory: readonly InventoryStack[],
  state: ConsumablePlayerState,
  statusEffects: readonly number[],
  index: number,
  playerCanUseItems = true,
): ConsumableUseResult {
  const selected = Number.isInteger(index) ? inventory[index] : undefined;
  if (!playerCanUseItems || selected === undefined ||
    !CONSUMABLE_CATEGORIES.includes(selected.category as ConsumableCategory)) {
    return unchangedConsumableUse(inventory, state, statusEffects);
  }
  const category = selected.category as ConsumableCategory;
  return useConsumableAtInventoryIndex(inventory, {
    ...state,
    selectedItemCategory: category,
    selectedItemCount: selectedConsumableCount(inventory, category),
  }, statusEffects, index, true);
}

interface GroundDropBase {
  id: number;
  tileX: number;
  tileY: number;
  ticksRemaining: number;
}

export interface GroundItemDrop extends GroundDropBase {
  kind: 'item';
  category: number;
  itemId: number;
  count: number;
}

export interface GroundCurrencyDrop extends GroundDropBase {
  kind: 'currency';
  /** Amount recorded by the source map before its ninefold pickup multiplier. */
  sourceAmount: number;
}

export type GroundDrop = GroundItemDrop | GroundCurrencyDrop;

export interface LootRoller {
  between(minimum: number, maximum: number): number;
}

type UnplacedGroundDrop =
  | Omit<GroundItemDrop, 'id' | 'ticksRemaining' | 'tileX' | 'tileY'>
  | Omit<GroundCurrencyDrop, 'id' | 'ticksRemaining' | 'tileX' | 'tileY'>;
type PlacedGroundDrop =
  | Omit<GroundItemDrop, 'id' | 'ticksRemaining'>
  | Omit<GroundCurrencyDrop, 'id' | 'ticksRemaining'>;

export interface EnemyDropInput {
  tileX: number;
  tileY: number;
  definition: EnemyDefinition;
}

/** Mirrors the item, coin, and category-11 rolls performed by source `ak.l()`. */
export function rollEnemyDrops(
  enemy: EnemyDropInput,
  playerLevel: number,
  roller: LootRoller,
): PlacedGroundDrop[] {
  const drops: UnplacedGroundDrop[] = [];
  let weightRoll = roller.between(1, 150);
  for (const [category, itemId, weight] of enemy.definition.dropCandidates) {
    weightRoll -= weight;
    if (weightRoll > 0) continue;
    if (weight === 1 && roller.between(1, 100) > 20) continue;
    // Source `ad.a(x, y, type, id)` discards category 22 from the ground list.
    if (category !== 22) drops.push({ kind: 'item', category, itemId, count: 1 });
    break;
  }

  if (roller.between(1, 100) <= 60) {
    drops.push({ kind: 'currency', sourceAmount: enemy.definition.experienceRewardCode * 3 });
  }

  const specialChance = 20 + (enemy.definition.experienceRewardCode - playerLevel);
  if (roller.between(1, 100) <= specialChance) {
    drops.push({ kind: 'item', category: 11, itemId: 0, count: 1 });
  }
  return drops.map((drop): PlacedGroundDrop => ({
    ...drop,
    tileX: enemy.tileX,
    tileY: enemy.tileY,
  }));
}

export function canStoreItem(
  inventory: readonly InventoryStack[],
  category: number,
  itemId: number,
  count: number,
): boolean {
  if (!Number.isInteger(category) || category < 0 || category > 23 ||
    !Number.isInteger(itemId) || itemId < 0 || itemId > 255 ||
    !Number.isInteger(count) || count < 1 || count > 99) return false;
  if (inventory.length > INVENTORY_SLOT_COUNT) return false;
  if (inventory.length < INVENTORY_SLOT_COUNT) return true;
  return STACKABLE_CATEGORIES.has(category) && inventory.some((stack) =>
    stack.category === category && stack.itemId === itemId && stack.count + count <= 99);
}

/** Check source `f73b` capacity for the special category-22 item list. */
export function canStoreSpecialItem(
  inventory: readonly InventoryStack[],
  category: number,
  itemId: number,
  count: number,
): boolean {
  if (category !== 22 || !Number.isInteger(itemId) || itemId < 0 || itemId > 255 ||
    !Number.isInteger(count) || count < 1 || count > 99 ||
    inventory.length > SPECIAL_INVENTORY_SLOT_COUNT) return false;
  if (inventory.some((stack) => stack.category !== 22)) return false;
  const compacted = compactSpecialInventory(inventory);
  if (compacted.length < SPECIAL_INVENTORY_SLOT_COUNT) return true;
  return compacted.some((stack) => stack.itemId === itemId && stack.count + count <= 99);
}

export function storeItem(
  inventory: readonly InventoryStack[],
  category: number,
  itemId: number,
  count: number,
  equipmentState?: SourceEquipmentInventoryState,
): InventoryStack[] | null {
  if (!canStoreItem(inventory, category, itemId, count)) return null;
  if (category < 7 && equipmentState === undefined) return null;
  const next = inventory.map((stack) => ({ ...stack }));
  if (STACKABLE_CATEGORIES.has(category)) {
    const stack = next.find((entry) => entry.category === category &&
      entry.itemId === itemId && entry.count + count <= 99);
    if (stack !== undefined) {
      stack.count += count;
      return next;
    }
  }
  next.push({
    category,
    itemId,
    count: category < 7 ? 1 : count,
    ...(category < 7 && equipmentState !== undefined
      ? { equipmentState: cloneEquipmentState(equipmentState) }
      : {}),
  });
  return next;
}

/** Insert one source category-22 item into the separate 15-slot special inventory. */
export function storeSpecialItem(
  inventory: readonly InventoryStack[],
  category: number,
  itemId: number,
  count: number,
): InventoryStack[] | null {
  if (!canStoreSpecialItem(inventory, category, itemId, count)) return null;
  const next = compactSpecialInventory(inventory);
  const stack = next.find((entry) => entry.itemId === itemId && entry.count + count <= 99);
  if (stack !== undefined) stack.count += count;
  else next.push({ category: 22, itemId, count });
  return compactSpecialInventory(next);
}

function compactSpecialInventory(inventory: readonly InventoryStack[]): InventoryStack[] {
  const compacted = inventory.map((stack) => ({ ...stack }));
  for (let index = 0; index < compacted.length; index += 1) {
    const stack = compacted[index];
    if (stack.category !== 22 || stack.count >= 99) continue;
    for (let nextIndex = index + 1; nextIndex < compacted.length; nextIndex += 1) {
      const next = compacted[nextIndex];
      if (next.category !== 22 || next.itemId !== stack.itemId) continue;
      const moved = Math.min(99 - stack.count, next.count);
      stack.count += moved;
      next.count -= moved;
      if (next.count === 0) {
        compacted.splice(nextIndex, 1);
        nextIndex -= 1;
      }
    }
  }
  return compacted;
}

function cloneEquipmentState(state: SourceEquipmentInventoryState): SourceEquipmentInventoryState {
  return {
    ...state,
    bonusValues: [...state.bonusValues] as [number, number, number, number],
    subtypeBytes: [...state.subtypeBytes],
  };
}

export type InventoryQuantityChangeStatus =
  | 'changed'
  | 'unchanged'
  | 'inventory-full'
  | 'missing-item'
  | 'unsupported-item';

export interface InventoryQuantityChangeResult {
  status: InventoryQuantityChangeStatus;
  inventory: InventoryStack[];
}

/** Apply the source CMD_HANDLE_ITEM / CMD_HANDLE_ITEM_NUM inventory operation. */
export function changeInventoryQuantity(
  inventory: readonly InventoryStack[],
  category: number,
  itemId: number,
  quantity: number,
  equipmentState?: SourceEquipmentInventoryState,
): InventoryQuantityChangeResult {
  if (!Number.isInteger(category) || category < 0 || category > 23 ||
    !Number.isInteger(itemId) || itemId < 0 || itemId > 255 ||
    !Number.isInteger(quantity) || quantity < -127 || quantity > 127) {
    return { status: 'unsupported-item', inventory: inventory.map((stack) => ({ ...stack })) };
  }
  if (quantity === 0) {
    return { status: 'unchanged', inventory: inventory.map((stack) => ({ ...stack })) };
  }
  if (quantity > 99) {
    return { status: 'inventory-full', inventory: inventory.map((stack) => ({ ...stack })) };
  }
  if (category < 7 && quantity > 0 && equipmentState === undefined) {
    return { status: 'unsupported-item', inventory: inventory.map((stack) => ({ ...stack })) };
  }

  if (quantity > 0) {
    const count = STACKABLE_CATEGORIES.has(category) ? quantity : 1;
    const next = storeItem(inventory, category, itemId, count, equipmentState);
    return next === null
      ? { status: 'inventory-full', inventory: inventory.map((stack) => ({ ...stack })) }
      : { status: 'changed', inventory: next };
  }

  let remaining = -quantity;
  const available = inventory.reduce((total, stack) =>
    stack.category === category && stack.itemId === itemId ? total + stack.count : total, 0);
  if (available < remaining) {
    return { status: 'missing-item', inventory: inventory.map((stack) => ({ ...stack })) };
  }
  const next = inventory.map((stack) => ({ ...stack }));
  for (let index = 0; index < next.length && remaining > 0;) {
    const stack = next[index];
    if (stack.category !== category || stack.itemId !== itemId) {
      index += 1;
      continue;
    }
    const removed = Math.min(remaining, stack.count);
    remaining -= removed;
    stack.count -= removed;
    if (stack.count === 0) next.splice(index, 1);
    else index += 1;
  }
  return { status: 'changed', inventory: next };
}

export interface PickupResult {
  status: 'picked-up' | 'no-space' | 'no-drop';
  pickedUp: GroundDrop | null;
  inventory: InventoryStack[];
  specialInventory: InventoryStack[];
  wallet: number;
  drops: GroundDrop[];
}

/** Pick up the first eligible drop on the player's current tile. */
export function pickupGroundDrop(
  drops: readonly GroundDrop[],
  tileX: number,
  tileY: number,
  inventory: readonly InventoryStack[],
  wallet: number,
  equipmentStateForItem?: (
    category: number,
    itemId: number,
  ) => SourceEquipmentInventoryState | undefined,
  specialInventory: readonly InventoryStack[] = [],
): PickupResult {
  for (const drop of drops) {
    if (drop.tileX !== tileX || drop.tileY !== tileY) continue;
    if (drop.kind === 'currency') {
      return {
        status: 'picked-up',
        pickedUp: drop,
        inventory: inventory.map((stack) => ({ ...stack })),
        specialInventory: specialInventory.map((stack) => ({ ...stack })),
        wallet: wallet + (drop.sourceAmount > 0 ? drop.sourceAmount * 9 : 0),
        drops: drops.filter((candidate) => candidate.id !== drop.id),
      };
    }
    if (drop.category === 22) {
      const nextSpecialInventory = storeSpecialItem(
        specialInventory,
        drop.category,
        drop.itemId,
        drop.count,
      );
      if (nextSpecialInventory === null) continue;
      return {
        status: 'picked-up',
        pickedUp: drop,
        inventory: inventory.map((stack) => ({ ...stack })),
        specialInventory: nextSpecialInventory,
        wallet,
        drops: drops.filter((candidate) => candidate.id !== drop.id),
      };
    }
    const equipmentState = drop.category < 7
      ? equipmentStateForItem?.(drop.category, drop.itemId)
      : undefined;
    const nextInventory = storeItem(inventory, drop.category, drop.itemId, drop.count, equipmentState);
    if (nextInventory === null) continue;
    return {
      status: 'picked-up',
      pickedUp: drop,
      inventory: nextInventory,
      specialInventory: specialInventory.map((stack) => ({ ...stack })),
      wallet,
      drops: drops.filter((candidate) => candidate.id !== drop.id),
    };
  }
  return {
    status: drops.some((drop) => drop.kind === 'item' &&
      drop.tileX === tileX && drop.tileY === tileY) ? 'no-space' : 'no-drop',
    pickedUp: null,
    inventory: inventory.map((stack) => ({ ...stack })),
    specialInventory: specialInventory.map((stack) => ({ ...stack })),
    wallet,
    drops: [...drops],
  };
}

/** The source decrements the byte timer and removes a drop once it becomes negative. */
export function advanceGroundDropTicks(drops: readonly GroundDrop[], ticks = 1): GroundDrop[] {
  if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError('Drop ticks must be nonnegative');
  return drops.flatMap((drop) => {
    const ticksRemaining = drop.ticksRemaining - ticks;
    return ticksRemaining < 0 ? [] : [{ ...drop, ticksRemaining }];
  });
}

/** Source markers blink only during the last sixteen ticks of their lifetime. */
export function isGroundDropVisible(drop: GroundDrop): boolean {
  return drop.ticksRemaining > 16 || drop.ticksRemaining % 3 !== 0;
}

export function parseInventory(value: unknown): InventoryStack[] | null {
  if (!Array.isArray(value) || value.length > INVENTORY_SLOT_COUNT) return null;
  const inventory: InventoryStack[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const stack = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(stack.category) || Number(stack.category) < 0 || Number(stack.category) > 23 ||
      !Number.isSafeInteger(stack.itemId) || Number(stack.itemId) < 0 || Number(stack.itemId) > 255 ||
      !Number.isSafeInteger(stack.count) || Number(stack.count) < 1 || Number(stack.count) > 99 ||
      Number(stack.category) < 7 && Number(stack.count) !== 1) return null;
    const equipmentState = stack.equipmentState === undefined
      ? undefined
      : parseSourceEquipmentInventoryState(stack.equipmentState, Number(stack.category));
    if (stack.equipmentState !== undefined &&
      (equipmentState === null || Number(stack.category) >= 7)) return null;
    inventory.push({
      category: Number(stack.category),
      itemId: Number(stack.itemId),
      count: Number(stack.count),
      ...(equipmentState === undefined || equipmentState === null ? {} : { equipmentState }),
    });
  }
  return inventory;
}

/** Parse the separate source save stream, whose supported acquisition type is category 22. */
export function parseSpecialInventory(value: unknown): InventoryStack[] | null {
  if (!Array.isArray(value) || value.length > SPECIAL_INVENTORY_SLOT_COUNT) return null;
  const inventory = parseInventory(value);
  return inventory !== null && inventory.every((stack) => stack.category === 22)
    ? inventory
    : null;
}
