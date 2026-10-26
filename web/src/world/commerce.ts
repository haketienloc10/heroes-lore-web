import { changeInventoryQuantity, storeItem, type InventoryStack } from './loot';
import {
  createSourceEquipmentInventoryState,
  findEquipmentItem,
  type EquipmentDataTable,
  type SourceEquipmentInventoryState,
} from './equipment-data';
import { cloneEquipmentLoadout, type EquipmentLoadout } from './equipment';

export interface CommerceItemDefinition {
  category: number;
  itemId: number;
  recordTypeCode: number;
  nameStringId: number;
  descriptionStringId: number;
  sourceValue: number;
}
export interface CommerceItemReference { category: number; itemId: number }
export interface CommerceRecipe { ingredients: CommerceItemReference[]; result: CommerceItemReference }
export interface CommerceCatalog {
  categories: CommerceItemDefinition[][];
  shopStock: CommerceItemReference[][];
  recipes: CommerceRecipe[];
}

export const SHOP_TAB_ITEM_CATEGORIES = [
  [7, 9, 10], [0, 1, 2], [3], [5], [6], [4],
] as const;
export const MIXTURE_ITEM_CATEGORIES = [7, 9, 12, 13, 14, 15, 16] as const;
export const NON_SELLABLE_ITEM_CATEGORIES = [18, 19, 20, 21] as const;
export const COMMERCE_INVENTORY_STACKABLE_CATEGORIES = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isUnsignedByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}
function isLanguageStringId(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 65535;
}
function parseReference(value: unknown): CommerceItemReference | null {
  if (!isRecord(value) || !isUnsignedByte(value.category) || Number(value.category) > 23 ||
    !isUnsignedByte(value.itemId)) return null;
  return { category: Number(value.category), itemId: Number(value.itemId) };
}
function parseItem(value: unknown, category: number, itemId: number): CommerceItemDefinition | null {
  if (!isRecord(value) || value.category !== category || value.itemId !== itemId ||
    !isUnsignedByte(value.recordTypeCode) || Number(value.recordTypeCode) > 23 ||
    !isLanguageStringId(value.nameStringId) || !isLanguageStringId(value.descriptionStringId) ||
    !Number.isInteger(value.sourceValue) || Number(value.sourceValue) < 0 ||
    Number(value.sourceValue) > 0x7fffffff) return null;
  return {
    category, itemId, recordTypeCode: Number(value.recordTypeCode),
    nameStringId: Number(value.nameStringId),
    descriptionStringId: Number(value.descriptionStringId),
    sourceValue: Number(value.sourceValue),
  };
}

export function parseCommerceCatalog(value: unknown): CommerceCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-commerce-catalog-v1' ||
    value.categoryCount !== 24 || !Array.isArray(value.categories) || value.categories.length !== 24 ||
    !Array.isArray(value.shopStock) || value.shopStock.length !== 6 ||
    !Array.isArray(value.recipes) || value.recipeCount !== value.recipes.length) {
    throw new TypeError('Unsupported or incomplete commerce data catalog');
  }
  const categories = value.categories.map((rawCategory, category) => {
    if (!isRecord(rawCategory) || rawCategory.category !== category ||
      !Array.isArray(rawCategory.records) || rawCategory.recordCount !== rawCategory.records.length ||
      rawCategory.records.length === 0) throw new TypeError('Commerce category ' + category + ' is invalid');
    const records = rawCategory.records.map((rawItem, itemId) => parseItem(rawItem, category, itemId));
    if (records.some((item) => item === null)) throw new TypeError('Commerce category ' + category + ' has an invalid item');
    return records as CommerceItemDefinition[];
  });
  const shopStock = value.shopStock.map((rawTab, tab) => {
    if (!Array.isArray(rawTab)) throw new TypeError('Shop tab ' + tab + ' is invalid');
    const references = rawTab.map(parseReference);
    if (references.some((reference) => reference === null)) throw new TypeError('Shop tab ' + tab + ' has an invalid reference');
    for (const reference of references as CommerceItemReference[]) {
      if (categories[reference.category]?.[reference.itemId] === undefined ||
        !SHOP_TAB_ITEM_CATEGORIES[tab].includes(reference.category as never)) {
        throw new TypeError('Shop tab ' + tab + ' references unavailable item ' + reference.category + ':' + reference.itemId);
      }
    }
    return references as CommerceItemReference[];
  });
  const recipes = value.recipes.map((rawRecipe, index) => {
    if (!isRecord(rawRecipe) || !Array.isArray(rawRecipe.ingredients) ||
      rawRecipe.ingredients.length < 2 || rawRecipe.ingredients.length > 3) {
      throw new TypeError('Commerce recipe ' + index + ' is invalid');
    }
    const ingredients = rawRecipe.ingredients.map(parseReference);
    const result = parseReference(rawRecipe.result);
    if (result === null || ingredients.some((item) => item === null)) {
      throw new TypeError('Commerce recipe ' + index + ' has invalid item references');
    }
    const resolvedIngredients = ingredients as CommerceItemReference[];
    if ([...resolvedIngredients, result].some(({ category, itemId }) =>
      categories[category]?.[itemId] === undefined)) {
      throw new TypeError('Commerce recipe ' + index + ' references a missing item');
    }
    if (resolvedIngredients.some(({ category }) =>
      !MIXTURE_ITEM_CATEGORIES.includes(category as (typeof MIXTURE_ITEM_CATEGORIES)[number]))) {
      throw new TypeError('Commerce recipe ' + index + ' uses an invalid ingredient category');
    }
    return { ingredients: resolvedIngredients, result };
  });
  return { categories, shopStock, recipes };
}

export function findCommerceItem(
  catalog: CommerceCatalog, category: number, itemId: number,
): CommerceItemDefinition | undefined {
  return catalog.categories[category]?.[itemId];
}
export function isCommerceStackable(category: number): boolean {
  return COMMERCE_INVENTORY_STACKABLE_CATEGORIES.includes(
    category as (typeof COMMERCE_INVENTORY_STACKABLE_CATEGORIES)[number],
  );
}

export type PurchaseStatus = 'purchased' | 'not-enough-money' | 'inventory-full' | 'invalid-item';
export interface PurchaseResult {
  status: PurchaseStatus; wallet: number; inventory: InventoryStack[]; price: number; quantity: number;
}
export function purchaseCommerceItem(
  catalog: CommerceCatalog,
  equipmentCatalog: EquipmentDataTable,
  inventory: readonly InventoryStack[],
  wallet: number,
  category: number,
  itemId: number,
  requestedQuantity: number,
  randomInteger: (minimum: number, maximum: number) => number = () => 0,
): PurchaseResult {
  const item = findCommerceItem(catalog, category, itemId);
  const quantity = isCommerceStackable(category) ? requestedQuantity : 1;
  const copy = inventory.map((stack) => ({ ...stack }));
  if (item === undefined || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
    !Number.isInteger(wallet) || wallet < 0) {
    return { status: 'invalid-item', wallet, inventory: copy, price: 0, quantity };
  }
  const price = item.sourceValue * quantity;
  if (!Number.isSafeInteger(price) || price > wallet) {
    return { status: 'not-enough-money', wallet, inventory: copy, price, quantity };
  }
  const definition = category < 7 ? findEquipmentItem(equipmentCatalog, category, itemId) : undefined;
  if (category < 7 && definition === undefined) {
    return { status: 'invalid-item', wallet, inventory: copy, price, quantity };
  }
  const equipmentState = definition === undefined
    ? undefined
    : createSourceEquipmentInventoryState(definition, randomInteger, 'event', false);
  const changed = changeInventoryQuantity(inventory, category, itemId, quantity, equipmentState);
  if (changed.status === 'inventory-full') {
    return { status: 'inventory-full', wallet, inventory: changed.inventory, price, quantity };
  }
  if (changed.status === 'unsupported-item') {
    return { status: 'invalid-item', wallet, inventory: changed.inventory, price, quantity };
  }
  return { status: 'purchased', wallet: wallet - price, inventory: changed.inventory, price, quantity };
}

export type SaleStatus = 'sold' | 'not-sellable' | 'missing-item' | 'invalid-item';
export interface SaleResult { status: SaleStatus; wallet: number; inventory: InventoryStack[]; price: number }
export function sellCommerceItem(
  catalog: CommerceCatalog,
  inventory: readonly InventoryStack[],
  wallet: number,
  category: number,
  itemId: number,
  quantity: number,
  selectedInventoryIndex?: number,
): SaleResult {
  const item = findCommerceItem(catalog, category, itemId);
  const copy = inventory.map((stack) => ({ ...stack }));
  if (item === undefined || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
    !Number.isSafeInteger(wallet) || wallet < 0) {
    return { status: 'invalid-item', wallet, inventory: copy, price: 0 };
  }
  if (NON_SELLABLE_ITEM_CATEGORIES.includes(category as (typeof NON_SELLABLE_ITEM_CATEGORIES)[number])) {
    return { status: 'not-sellable', wallet, inventory: copy, price: 0 };
  }
  const price = Math.trunc((item.sourceValue * quantity) / 5);
  if (selectedInventoryIndex !== undefined) {
    const selected = inventory[selectedInventoryIndex];
    if (!Number.isInteger(selectedInventoryIndex) || selected === undefined ||
      selected.category !== category || selected.itemId !== itemId || selected.count < quantity) {
      return { status: 'invalid-item', wallet, inventory: copy, price: 0 };
    }
    const next = copy;
    if (selected.count === quantity) next.splice(selectedInventoryIndex, 1);
    else next[selectedInventoryIndex].count -= quantity;
    return { status: 'sold', wallet: wallet + price, inventory: next, price };
  }
  const changed = changeInventoryQuantity(inventory, category, itemId, -quantity);
  if (changed.status === 'missing-item') return { status: 'missing-item', wallet, inventory: changed.inventory, price };
  if (changed.status !== 'changed') return { status: 'invalid-item', wallet, inventory: changed.inventory, price };
  return { status: 'sold', wallet: wallet + price, inventory: changed.inventory, price };
}

export type EquipmentTarget =
  | { location: 'inventory'; index: number }
  | { location: 'equipment'; slot: number };
function cloneInventory(inventory: readonly InventoryStack[]): InventoryStack[] {
  return inventory.map((stack) => ({
    ...stack,
    ...(stack.equipmentState === undefined ? {} : {
      equipmentState: {
        ...stack.equipmentState,
        bonusValues: [...stack.equipmentState.bonusValues] as [number, number, number, number],
        subtypeBytes: [...stack.equipmentState.subtypeBytes],
      },
    }),
  }));
}
function stateAtTarget(
  inventory: InventoryStack[], equipment: EquipmentLoadout, target: EquipmentTarget,
): { stack: InventoryStack; state: SourceEquipmentInventoryState } | null {
  const stack = target.location === 'inventory' ? inventory[target.index] : equipment[target.slot];
  if (stack === undefined || stack === null || stack.category > 6 || stack.equipmentState === undefined) return null;
  return { stack, state: stack.equipmentState };
}
function consumeInventoryItem(
  inventory: readonly InventoryStack[], category: number, itemId: number, quantity: number,
): InventoryStack[] | null {
  const result = changeInventoryQuantity(inventory, category, itemId, -quantity);
  return result.status === 'changed' ? result.inventory : null;
}

export type UpgradeStatus = 'enhanced' | 'equipment-destroyed' | 'missing-equipment' |
  'maximum-level' | 'not-enough-material' | 'not-enough-money';
export interface UpgradeResult {
  status: UpgradeStatus; inventory: InventoryStack[]; equipment: EquipmentLoadout;
  wallet: number; cost: number; materials: number; roll: number | null;
}

/** Source blacksmith upgrade costs current level x100, consumes level+1 mithril,
 * and breaks the selected item when a random roll exceeds the source threshold. */
export function upgradeCommerceEquipment(
  inventory: readonly InventoryStack[],
  equipment: readonly (InventoryStack | null)[],
  equipmentCatalog: EquipmentDataTable,
  wallet: number,
  target: EquipmentTarget,
  randomInteger: (minimum: number, maximum: number) => number,
): UpgradeResult {
  const nextInventory = cloneInventory(inventory);
  const nextEquipment = cloneEquipmentLoadout(equipment);
  const empty = (status: UpgradeStatus, cost = 0, materials = 0, roll: number | null = null): UpgradeResult => ({
    status, inventory: nextInventory, equipment: nextEquipment, wallet, cost, materials, roll,
  });
  const selected = stateAtTarget(nextInventory, nextEquipment, target);
  if (selected === null || !Number.isInteger(wallet) || wallet < 0) return empty('missing-equipment');
  const definition = findEquipmentItem(equipmentCatalog, selected.stack.category, selected.stack.itemId);
  if (definition === undefined) return empty('missing-equipment');
  const level = selected.state.upgradeByte;
  const maximum = definition.equipmentType;
  if (level < 0 || level >= maximum) return empty('maximum-level');
  const materials = level + 1;
  const cost = level * 100;
  const available = inventory.reduce((total, item) =>
    item.category === 11 && item.itemId === 0 ? total + item.count : total, 0);
  if (available < materials) return empty('not-enough-material', cost, materials);
  if (wallet < cost) return empty('not-enough-money', cost, materials);
  const roll = randomInteger(1, 100);
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) {
    throw new RangeError('Blacksmith roll must be from 1 through 100');
  }
  const afterMaterials = consumeInventoryItem(nextInventory, 11, 0, materials);
  if (afterMaterials === null) return empty('not-enough-material', cost, materials);
  const threshold = Math.trunc((100 * (maximum - level)) / maximum) + 30;
  if (roll <= threshold) {
    selected.state.upgradeByte = (selected.state.upgradeByte + 1) & 0xff;
    return {
      status: 'enhanced', inventory: afterMaterials, equipment: nextEquipment,
      wallet: wallet - cost, cost, materials, roll,
    };
  }
  if (target.location === 'inventory') {
    const selectedIndex = afterMaterials.findIndex((item) => item.equipmentState === selected.state);
    if (selectedIndex >= 0) afterMaterials.splice(selectedIndex, 1);
  }
  else nextEquipment[target.slot] = null;
  return {
    status: 'equipment-destroyed', inventory: afterMaterials, equipment: nextEquipment,
    wallet: wallet - cost, cost, materials, roll,
  };
}

export type IdentificationStatus = 'identified' | 'missing-equipment' | 'already-identified' | 'not-enough-money';
export interface IdentificationResult {
  status: IdentificationStatus; inventory: InventoryStack[]; equipment: EquipmentLoadout; wallet: number;
}
export function identifyCommerceEquipment(
  inventory: readonly InventoryStack[], equipment: readonly (InventoryStack | null)[],
  wallet: number, target: EquipmentTarget,
): IdentificationResult {
  const nextInventory = cloneInventory(inventory);
  const nextEquipment = cloneEquipmentLoadout(equipment);
  const selected = stateAtTarget(nextInventory, nextEquipment, target);
  if (selected === null) return { status: 'missing-equipment', inventory: nextInventory, equipment: nextEquipment, wallet };
  if (selected.state.sourceFlag) return { status: 'already-identified', inventory: nextInventory, equipment: nextEquipment, wallet };
  if (wallet < 100) return { status: 'not-enough-money', inventory: nextInventory, equipment: nextEquipment, wallet };
  selected.state.sourceFlag = true;
  return { status: 'identified', inventory: nextInventory, equipment: nextEquipment, wallet: wallet - 100 };
}

export type OrbRefinementStatus = 'refined' | 'missing-equipment' | 'not-an-orb-slot' |
  'already-attributed' | 'missing-orb' | 'not-enough-money';
export interface OrbRefinementResult {
  status: OrbRefinementStatus; inventory: InventoryStack[]; equipment: EquipmentLoadout;
  wallet: number; orbConsumed: number | null;
}
export function applyCommerceOrbAttribute(
  inventory: readonly InventoryStack[], equipment: readonly (InventoryStack | null)[],
  wallet: number, target: EquipmentTarget, orbItemId: number,
): OrbRefinementResult {
  const nextInventory = cloneInventory(inventory);
  const nextEquipment = cloneEquipmentLoadout(equipment);
  const selected = stateAtTarget(nextInventory, nextEquipment, target);
  const empty = (status: OrbRefinementStatus): OrbRefinementResult => ({
    status, inventory: nextInventory, equipment: nextEquipment, wallet, orbConsumed: null,
  });
  if (selected === null) return empty('missing-equipment');
  if (selected.stack.category !== 3 || selected.state.subtypeBytes.length !== 1) return empty('not-an-orb-slot');
  if (selected.state.subtypeBytes[0] !== -1) return empty('already-attributed');
  if (inventory.reduce((total, item) =>
    item.category === 17 && item.itemId === orbItemId ? total + item.count : total, 0) < 1) return empty('missing-orb');
  if (wallet < 500) return empty('not-enough-money');
  const afterOrb = consumeInventoryItem(nextInventory, 17, orbItemId, 1);
  if (afterOrb === null) return empty('missing-orb');
  selected.state.subtypeBytes[0] = orbItemId > 127 ? orbItemId - 256 : orbItemId;
  return {
    status: 'refined', inventory: afterOrb, equipment: nextEquipment,
    wallet: wallet - 500, orbConsumed: orbItemId,
  };
}

export type MixtureStatus = 'mixed' | 'failed' | 'not-enough-materials' |
  'not-enough-money' | 'inventory-full' | 'invalid-selection';
export interface MixtureResult {
  status: MixtureStatus; inventory: InventoryStack[]; wallet: number;
  result: CommerceItemReference | null; cost: number;
}
function referencesMatch(left: readonly CommerceItemReference[], right: readonly CommerceItemReference[]): boolean {
  if (left.length !== right.length) return false;
  const remaining = right.map((item) => ({ ...item }));
  for (const item of left) {
    const index = remaining.findIndex((candidate) =>
      candidate.category === item.category && candidate.itemId === item.itemId);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}
/** The source mixer consumes materials on failure and checks, but does not deduct, its displayed 500 cost. */
export function mixCommerceItems(
  catalog: CommerceCatalog, inventory: readonly InventoryStack[],
  wallet: number, selectedInventoryIndices: readonly number[],
): MixtureResult {
  let working = cloneInventory(inventory);
  const empty = (status: MixtureStatus): MixtureResult => ({
    status, inventory: working, wallet, result: null, cost: 500,
  });
  if (!Number.isInteger(wallet) || wallet < 500) return empty('not-enough-money');
  if (selectedInventoryIndices.length < 2 || selectedInventoryIndices.length > 3) return empty('invalid-selection');
  const ingredients: CommerceItemReference[] = [];
  const requiredCounts = new Map<string, number>();
  const selectedRowCounts = new Map<number, number>();
  for (const index of selectedInventoryIndices) {
    const stack = working[index];
    if (stack === undefined || !MIXTURE_ITEM_CATEGORIES.includes(
      stack.category as (typeof MIXTURE_ITEM_CATEGORIES)[number],
    ) || stack.count < 1) return empty('invalid-selection');
    ingredients.push({ category: stack.category, itemId: stack.itemId });
    const key = stack.category + ':' + stack.itemId;
    requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    selectedRowCounts.set(index, (selectedRowCounts.get(index) ?? 0) + 1);
  }
  for (const [index, count] of selectedRowCounts) {
    if (working[index].count < count) return empty('not-enough-materials');
  }
  for (const [key, count] of requiredCounts) {
    const [category, itemId] = key.split(':').map(Number);
    const available = working.reduce((total, stack) =>
      stack.category === category && stack.itemId === itemId ? total + stack.count : total, 0);
    if (available < count) return empty('not-enough-materials');
  }
  const recipe = catalog.recipes.find(({ ingredients: expected }) => referencesMatch(ingredients, expected));
  for (const [index, count] of [...selectedRowCounts].sort(([left], [right]) => right - left)) {
    const stack = working[index];
    if (stack.count === count) working.splice(index, 1);
    else stack.count -= count;
  }
  if (recipe === undefined) return { status: 'failed', inventory: working, wallet, result: null, cost: 500 };
  const result = storeItem(working, recipe.result.category, recipe.result.itemId, 1);
  if (result === null) return { status: 'inventory-full', inventory: cloneInventory(inventory), wallet, result: null, cost: 500 };
  return { status: 'mixed', inventory: result, wallet, result: recipe.result, cost: 500 };
}
