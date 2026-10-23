import type { GameplayHudState } from '../ui/game-hud';
import type { Direction } from './actor';
import { isEndingHeroClassId, type EndingHeroClassId } from './ending';
import {
  CONSUMABLE_CATEGORIES,
  NEW_GAME_WALLET,
  parseInventory,
  type ConsumableCategory,
  type InventoryStack,
} from './loot';
import { parseEquipmentLoadout, type EquipmentLoadout } from './equipment';
import { parsePlayerAttributes, type PlayerAttributes } from './attributes';

export const GAME_SAVE_KEY = 'heroes-lore-web:save:v1';
export const GAME_SAVE_VERSION = 1;

export interface GameSaveState {
  version: typeof GAME_SAVE_VERSION;
  savedAt: number;
  mapId: number;
  tileX: number;
  tileY: number;
  direction: Direction;
  gameFlags: number[];
  questFlags: number[];
  guardianIndices: number[];
  heroClassId: EndingHeroClassId;
  /** Source player base stats; older web saves default to the class starting values. */
  attributes: PlayerAttributes;
  skillIds: number[];
  comboLimit: number;
  hud: GameplayHudState;
  wallet: number;
  inventory: InventoryStack[];
  /** Null denotes an older version-one save made before equipment was persisted. */
  equipmentSlots: EquipmentLoadout | null;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseFlagList(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every((flag) => isIntegerInRange(flag, 0, 1023))) return null;
  return [...new Set(value as number[])];
}

function parseGuardianIndices(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > 3 ||
    !value.every((index) => isIntegerInRange(index, 0, 2))) return null;
  const indices = [...new Set(value as number[])];
  return indices.length === value.length ? indices : null;
}

function parseSkillIds(value: unknown, guardianIndices: readonly number[]): number[] | null {
  if (value === undefined) return [...guardianIndices];
  if (!Array.isArray(value) || value.length > 5 ||
    !value.every((id) => isIntegerInRange(id, 0, 5))) return null;
  const ids = [...new Set(value as number[])];
  return ids.length === value.length ? ids : null;
}

function parseHudState(value: unknown): GameplayHudState | null {
  if (typeof value !== 'object' || value === null) return null;
  const hud = value as Record<string, unknown>;
  const level = hud.level === undefined ? 1 : hud.level;
  const attributePoints = hud.attributePoints === undefined ? 0 : hud.attributePoints;
  const selectedItemCategory = hud.selectedItemCategory === undefined ? 7 : hud.selectedItemCategory;
  const fields = [hud.hp, hud.maxHp, hud.sp, hud.maxSp, hud.experience,
    hud.experienceToNextLevel, hud.selectedItemCount, attributePoints];
  if (!fields.every((field) => isIntegerInRange(field, 0, 2_147_483_647)) ||
    !isIntegerInRange(level, 1, 99) ||
    !CONSUMABLE_CATEGORIES.includes(Number(selectedItemCategory) as ConsumableCategory) ||
    Number(hud.maxHp) <= 0 || Number(hud.maxSp) <= 0 ||
    Number(hud.hp) > Number(hud.maxHp) || Number(hud.sp) > Number(hud.maxSp)) return null;
  return {
    hp: Number(hud.hp),
    maxHp: Number(hud.maxHp),
    sp: Number(hud.sp),
    maxSp: Number(hud.maxSp),
    experience: Number(hud.experience),
    experienceToNextLevel: Number(hud.experienceToNextLevel),
    level: Number(level),
    attributePoints: Number(attributePoints),
    selectedItemCount: Number(hud.selectedItemCount),
    selectedItemCategory: Number(selectedItemCategory) as ConsumableCategory,
  };
}

/** Validate untrusted browser storage before it is used to restore a scene. */
export function parseGameSave(value: unknown): GameSaveState | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  const gameFlags = parseFlagList(data.gameFlags);
  const questFlags = parseFlagList(data.questFlags);
  const guardianIndices = parseGuardianIndices(data.guardianIndices);
  const heroClassId = data.heroClassId === undefined ? 6 : data.heroClassId;
  if (!isEndingHeroClassId(heroClassId)) return null;
  const attributes = parsePlayerAttributes(data.attributes, heroClassId);
  const skillIds = guardianIndices === null ? null : parseSkillIds(data.skillIds, guardianIndices);
  const comboLimit = data.comboLimit === undefined ? 1 : data.comboLimit;
  const hud = parseHudState(data.hud);
  const wallet = data.wallet === undefined ? NEW_GAME_WALLET : data.wallet;
  const inventory = data.inventory === undefined ? [] : parseInventory(data.inventory);
  const equipmentSlots = data.equipmentSlots === undefined || data.equipmentSlots === null
    ? null
    : parseEquipmentLoadout(data.equipmentSlots);
  if (data.version !== GAME_SAVE_VERSION ||
    !isIntegerInRange(data.savedAt, 0, Number.MAX_SAFE_INTEGER) ||
    !isIntegerInRange(data.mapId, 0, 255) ||
    !isIntegerInRange(data.tileX, 0, 255) || !isIntegerInRange(data.tileY, 0, 255) ||
    !isIntegerInRange(data.direction, 1, 4) || gameFlags === null || questFlags === null ||
    guardianIndices === null || guardianIndices.length === 0 || skillIds === null || hud === null ||
    attributes === null ||
    !isIntegerInRange(comboLimit, 1, 127) ||
    !isIntegerInRange(wallet, 0, 2_147_483_647) || inventory === null ||
    data.equipmentSlots !== undefined && data.equipmentSlots !== null && equipmentSlots === null) return null;
  return {
    version: GAME_SAVE_VERSION,
    savedAt: Number(data.savedAt),
    mapId: Number(data.mapId),
    tileX: Number(data.tileX),
    tileY: Number(data.tileY),
    direction: Number(data.direction) as Direction,
    gameFlags,
    questFlags,
    guardianIndices,
    heroClassId,
    attributes,
    skillIds,
    comboLimit: Number(comboLimit),
    hud,
    wallet: Number(wallet),
    inventory,
    equipmentSlots,
  };
}

export function readGameSave(storage: SaveStorage): GameSaveState | null {
  const stored = storage.getItem(GAME_SAVE_KEY);
  if (stored === null) return null;
  try {
    return parseGameSave(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
}

export function writeGameSave(storage: SaveStorage, value: unknown): GameSaveState {
  const save = parseGameSave(value);
  if (save === null) throw new TypeError('Cannot save invalid game state');
  storage.setItem(GAME_SAVE_KEY, JSON.stringify(save));
  return save;
}
