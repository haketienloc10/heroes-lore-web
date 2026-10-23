import type { BasicAttackProfile, PlayerDefenseProfile } from './combat';
import {
  createSourceEquipmentInventoryState,
  findEquipmentItem,
  parseSourceEquipmentInventoryState,
  type EquipmentDataTable,
} from './equipment-data';
import { parseInventory, type InventoryStack } from './loot';
import type { EndingHeroClassId } from './ending';
import { createBasePlayerAttributes, type PlayerAttributes } from './attributes';

export const EQUIPMENT_SLOT_COUNT = 5;

/** Source slot order: weapon, category 3, category 5, category 6, category 4. */
export type EquipmentLoadout = [
  InventoryStack | null,
  InventoryStack | null,
  InventoryStack | null,
  InventoryStack | null,
  InventoryStack | null,
];

export interface EquipmentStats {
  maxHp: number;
  maxSp: number;
  attack: BasicAttackProfile;
  defense: PlayerDefenseProfile;
  /** Base character attributes after equipment modifiers, as shown by the source status screen. */
  attributes: PlayerAttributes;
  enhancementBonuses: [number, number, number, number];
}

export interface EquipResult {
  inventory: InventoryStack[];
  equipment: EquipmentLoadout;
  slot: number;
  equipped: InventoryStack;
  removed: InventoryStack | null;
}

const SLOT_CATEGORIES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3],
  [5],
  [6],
  [4],
];

function signedByte(value: number): number {
  return (value << 24) >> 24;
}

function signedShort(value: number): number {
  return (value << 16) >> 16;
}

function cloneStack(stack: InventoryStack | null): InventoryStack | null {
  if (stack === null) return null;
  const state = stack.equipmentState;
  return {
    ...stack,
    ...(state === undefined ? {} : {
      equipmentState: {
        ...state,
        bonusValues: [...state.bonusValues] as [number, number, number, number],
        subtypeBytes: [...state.subtypeBytes],
      },
    }),
  };
}

export function cloneEquipmentLoadout(source: readonly (InventoryStack | null)[]): EquipmentLoadout {
  if (source.length !== EQUIPMENT_SLOT_COUNT) throw new TypeError('Equipment loadout must have five slots');
  return source.map(cloneStack) as EquipmentLoadout;
}

export function equipmentSlotForCategory(category: number): number | null {
  const slot = SLOT_CATEGORIES.findIndex((categories) => categories.includes(category));
  return slot < 0 ? null : slot;
}

export function isEquipmentCompatible(category: number, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_CATEGORIES.length &&
    SLOT_CATEGORIES[slot].includes(category);
}

/** Source `an.c(byte)` initial gear, created without enhancement rolls. */
export function createStartingEquipment(
  heroClassId: EndingHeroClassId,
  catalog: EquipmentDataTable,
): EquipmentLoadout {
  const weaponCategory = heroClassId === 6 ? 0 : heroClassId === 7 ? 2 : 1;
  const categories = [weaponCategory, ...(heroClassId === 8 ? [3] : []), 5, 6, 4];
  const slots: EquipmentLoadout = [null, null, null, null, null];
  for (const category of categories) {
    const slot = equipmentSlotForCategory(category);
    const definition = findEquipmentItem(catalog, category, 0);
    if (slot === null || definition === undefined) {
      throw new TypeError(`Starting equipment ${category}:0 is missing from the local catalog`);
    }
    slots[slot] = {
      category,
      itemId: 0,
      count: 1,
      equipmentState: createSourceEquipmentInventoryState(definition, () => 0, 'event', false),
    };
  }
  return slots;
}

/** Supply a zero-roll instance state for equipment from saves written before M71. */
export function normalizeEquipmentInventory(
  inventory: readonly InventoryStack[],
  catalog: EquipmentDataTable,
): InventoryStack[] {
  return inventory.map((stack) => {
    const copy = cloneStack(stack) as InventoryStack;
    if (stack.category > 6 || stack.equipmentState !== undefined) return copy;
    const definition = findEquipmentItem(catalog, stack.category, stack.itemId);
    if (definition === undefined) return copy;
    return {
      ...copy,
      equipmentState: createSourceEquipmentInventoryState(definition, () => 0, 'ground-pickup', false),
    };
  });
}

/** Swap one inventory item into its source equipment slot, returning old gear to that index. */
export function equipInventoryItem(
  inventory: readonly InventoryStack[],
  equipment: readonly (InventoryStack | null)[],
  inventoryIndex: number,
): EquipResult | null {
  if (equipment.length !== EQUIPMENT_SLOT_COUNT || !Number.isInteger(inventoryIndex) ||
    inventoryIndex < 0 || inventoryIndex >= inventory.length) return null;
  const selected = inventory[inventoryIndex];
  if (selected === undefined || selected.category > 6 || selected.equipmentState === undefined) return null;
  const slot = equipmentSlotForCategory(selected.category);
  if (slot === null) return null;

  const nextInventory = inventory.map((stack) => cloneStack(stack) as InventoryStack);
  const nextEquipment = cloneEquipmentLoadout(equipment);
  const removed = cloneStack(nextEquipment[slot]);
  if (removed === null) nextInventory.splice(inventoryIndex, 1);
  else nextInventory[inventoryIndex] = removed;
  const equipped = cloneStack(selected) as InventoryStack;
  nextEquipment[slot] = equipped;
  return { inventory: nextInventory, equipment: nextEquipment, slot, equipped, removed };
}

/** Validate the five source slots stored in a browser save; missing is handled by the caller. */
export function parseEquipmentLoadout(value: unknown): EquipmentLoadout | null {
  if (!Array.isArray(value) || value.length !== EQUIPMENT_SLOT_COUNT) return null;
  const parsed: Array<InventoryStack | null> = [];
  for (const [slot, entry] of value.entries()) {
    if (entry === null) {
      parsed.push(null);
      continue;
    }
    const stack = parseInventory([entry])?.[0];
    if (stack === undefined || stack.category > 6 || stack.count !== 1 ||
      !isEquipmentCompatible(stack.category, slot) || stack.equipmentState === undefined ||
      parseSourceEquipmentInventoryState(stack.equipmentState, stack.category) === null) return null;
    parsed.push(stack);
  }
  return parsed as EquipmentLoadout;
}

/** Reproduce the equipment and class terms used by source `an.n()`. */
export function calculateEquipmentStats(
  equipment: readonly (InventoryStack | null)[],
  catalog: EquipmentDataTable,
  heroClassId: EndingHeroClassId,
  level: number,
  characterAttributes: PlayerAttributes = createBasePlayerAttributes(heroClassId),
): EquipmentStats {
  if (equipment.length !== EQUIPMENT_SLOT_COUNT || !Number.isInteger(level) || level < 1) {
    throw new TypeError('Cannot calculate stats from an invalid player loadout');
  }
  const bonuses: [number, number, number, number] = [0, 0, 0, 0];
  const items = equipment.map((stack, slot) => {
    if (stack === null) return null;
    if (!isEquipmentCompatible(stack.category, slot) || stack.equipmentState === undefined) {
      throw new TypeError(`Equipment slot ${slot} contains an invalid item`);
    }
    const definition = findEquipmentItem(catalog, stack.category, stack.itemId);
    if (definition === undefined) throw new TypeError(`Equipment item ${stack.category}:${stack.itemId} is missing`);
    for (let index = 0; index < bonuses.length; index += 1) {
      bonuses[index] = signedByte(bonuses[index] + stack.equipmentState.bonusValues[index]);
    }
    return { definition, state: stack.equipmentState };
  });

  const attributes: PlayerAttributes = {
    power: characterAttributes.power + bonuses[0],
    hp: characterAttributes.hp + bonuses[1],
    agility: characterAttributes.agility + bonuses[2],
    will: characterAttributes.will + bonuses[3],
  };
  const weapon = items[0];
  const attackPower = weapon === null ? 0 : weapon.definition.equipmentByte +
    Math.trunc((weapon.state.upgradeByte * 5) / 2) +
    Math.trunc((attributes.power * 4) / 5);
  let defense = 0;
  const category3 = items[1];
  const category5 = items[2];
  const category6 = items[3];
  const category4 = items[4];
  if (category3 !== null) defense += category3.definition.equipmentByte + category3.state.upgradeByte;
  if (category5 !== null) defense += category5.definition.equipmentByte + category5.state.upgradeByte * 2;
  if (category6 !== null) defense += category6.definition.equipmentByte;
  if (category4 !== null) defense += category4.definition.equipmentByte;
  defense += Math.trunc(attributes.power / 5) + Math.trunc(level / 3);

  return {
    maxHp: Math.max(1, (attributes.hp + level) * 12),
    maxSp: Math.max(1, (attributes.will + level) * 12),
    attack: {
      power: signedShort(attackPower),
      attackElement: 0,
      dexterity: attributes.agility,
      evasionBonus: 0,
      skillAdjustment: 0,
      criticalChance: Math.trunc(attributes.agility / 3) +
        Math.trunc(attributes.will / 10) + (weapon?.state.subtypeBytes[0] ?? 0),
      criticalDamageBonusTenths: weapon?.state.subtypeBytes[1] ?? 0,
    },
    defense: {
      dexterity: attributes.agility,
      evasionBonus: 0,
      defense: signedShort(defense),
      doubleDefense: false,
    },
    attributes,
    enhancementBonuses: bonuses,
  };
}
