import type { GameplayHudState } from '../ui/game-hud';
import type { Direction } from './actor';
import { isEndingHeroClassId, type EndingHeroClassId } from './ending';
import {
  CONSUMABLE_CATEGORIES,
  NEW_GAME_WALLET,
  parseInventory,
  parseSpecialInventory,
  type ConsumableCategory,
  type InventoryStack,
} from './loot';
import { parseEquipmentLoadout, type EquipmentLoadout } from './equipment';
import { parsePlayerAttributes, type PlayerAttributes } from './attributes';
import {
  defaultPlayerSkillLevelBindings,
  PLAYER_SKILL_BASE_RANKS,
  PLAYER_SKILL_LEVEL_UNLOCK_RANKS,
  playerSkillExperienceRequiredForRank,
  type PlayerSkillLevelSlot,
} from './player-skill-action';
import { awardSourceEndingClearPoints, sourceEndingClearPointAward } from './progression';

export const GAME_SAVE_KEY = 'heroes-lore-web:save:v1';
export const GAME_SAVE_VERSION = 1;
export const GAME_SAVE_CLASS_KEYS: Record<EndingHeroClassId, string> = {
  6: `${GAME_SAVE_KEY}:class-6`,
  7: `${GAME_SAVE_KEY}:class-7`,
  8: `${GAME_SAVE_KEY}:class-8`,
};

export interface SavedPlayerSkillProgress {
  skillId: number;
  skillRank: number;
  skillExperience: number;
  skillLevelSlotOne: PlayerSkillLevelSlot | null;
  skillLevelSlotThree: PlayerSkillLevelSlot | null;
}

export interface SourceInventorySlotSnapshot {
  indices: number[];
  inventory: InventoryStack[];
}

export interface SourceInventorySlotReplacement {
  oldIndex: number;
  nextIndex: number;
}

function cloneInventoryStack(stack: InventoryStack): InventoryStack {
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

function sourceInventoryItemIdentity(stack: InventoryStack): string {
  const state = stack.equipmentState;
  return JSON.stringify([
    stack.category,
    stack.itemId,
    state === undefined ? null : [
      state.sourceFlag,
      state.upgradeByte,
      state.bonusValues,
      state.subtypeBytes,
    ],
  ]);
}

function sourceInventoryItemType(stack: InventoryStack): string {
  return `${stack.category}:${stack.itemId}`;
}

/** Snapshot compact inventory order alongside each item's occupied native slot. */
export function snapshotSourceInventorySlots(
  inventory: readonly InventoryStack[],
  indices: readonly number[] | undefined,
  slotCount: 30 | 15,
): SourceInventorySlotSnapshot | null {
  if (indices === undefined || indices.length !== inventory.length ||
    indices.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= slotCount) ||
    new Set(indices).size !== indices.length) return null;
  return {
    indices: [...indices],
    inventory: inventory.map(cloneInventoryStack),
  };
}

/**
 * Track source slot changes through the inventory's compact web representation.
 * Source `f` inserts at the first free slot and, after a removal, shifts once
 * from the first hole (`m89b`, `a(ac)`, `d`).
 */
export function advanceSourceInventorySlotSnapshot(
  snapshot: SourceInventorySlotSnapshot | null,
  nextInventory: readonly InventoryStack[],
  slotCount: 30 | 15,
  replacements: readonly SourceInventorySlotReplacement[] = [],
): SourceInventorySlotSnapshot | null {
  if (snapshot === null) return null;
  if (snapshot.inventory.length !== snapshot.indices.length ||
    snapshot.indices.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= slotCount) ||
    new Set(snapshot.indices).size !== snapshot.indices.length || nextInventory.length > slotCount) {
    return null;
  }
  if (JSON.stringify(snapshot.inventory) === JSON.stringify(nextInventory)) {
    return {
      indices: [...snapshot.indices],
      inventory: nextInventory.map(cloneInventoryStack),
    };
  }

  // Duplicate category/item pairs can be merged by source `e()` without
  // compacting the slot vector. A compact web-array diff cannot distinguish
  // that from removal, so discard provenance when a changed array is ambiguous.
  const hasDuplicateItemTypes = (items: readonly InventoryStack[]): boolean => {
    const types = items.map(sourceInventoryItemType);
    return new Set(types).size !== types.length;
  };
  if (hasDuplicateItemTypes(snapshot.inventory) || hasDuplicateItemTypes(nextInventory)) return null;

  interface SlotOwner {
    oldIndex: number;
    nextIndex?: number;
  }
  const slots: Array<SlotOwner | null> = Array.from({ length: slotCount }, () => null);
  const oldOrder = snapshot.inventory.map((_, index) => index)
    .sort((first, second) => snapshot.indices[first] - snapshot.indices[second]);
  oldOrder.forEach((oldIndex) => {
    slots[snapshot.indices[oldIndex]] = { oldIndex };
  });

  const matchedOld = new Set<number>();
  const matchedNext = new Set<number>();
  for (const replacement of replacements) {
    const { oldIndex, nextIndex } = replacement;
    if (!Number.isInteger(oldIndex) || !Number.isInteger(nextIndex) ||
      oldIndex < 0 || oldIndex >= snapshot.inventory.length ||
      nextIndex < 0 || nextIndex >= nextInventory.length ||
      matchedOld.has(oldIndex) || matchedNext.has(nextIndex)) return null;
    matchedOld.add(oldIndex);
    matchedNext.add(nextIndex);
    slots[snapshot.indices[oldIndex]] = { oldIndex, nextIndex };
  }
  const match = (identity: (item: InventoryStack) => string): void => {
    for (let nextIndex = 0; nextIndex < nextInventory.length; nextIndex += 1) {
      if (matchedNext.has(nextIndex)) continue;
      const key = identity(nextInventory[nextIndex]);
      const oldIndex = oldOrder.find((candidate) => !matchedOld.has(candidate) &&
        identity(snapshot.inventory[candidate]) === key);
      if (oldIndex === undefined) continue;
      matchedOld.add(oldIndex);
      matchedNext.add(nextIndex);
      slots[snapshot.indices[oldIndex]] = { oldIndex, nextIndex };
    }
  };
  match(sourceInventoryItemIdentity);
  match(sourceInventoryItemType);

  const compactFirstHole = (): void => {
    const firstHole = slots.indexOf(null);
    if (firstHole < 0) return;
    for (let index = firstHole; index < slotCount - 1; index += 1) {
      slots[index] = slots[index + 1];
    }
    slots[slotCount - 1] = null;
  };

  for (const oldIndex of oldOrder) {
    if (matchedOld.has(oldIndex)) continue;
    const slot = slots.findIndex((owner) => owner?.oldIndex === oldIndex);
    if (slot < 0) return null;
    slots[slot] = null;
    compactFirstHole();
  }

  for (let nextIndex = 0; nextIndex < nextInventory.length; nextIndex += 1) {
    if (matchedNext.has(nextIndex)) continue;
    const firstFree = slots.indexOf(null);
    if (firstFree < 0) return null;
    slots[firstFree] = { oldIndex: -1, nextIndex };
  }

  const indices = Array.from({ length: nextInventory.length }, () => -1);
  slots.forEach((owner, slot) => {
    if (owner?.nextIndex !== undefined) indices[owner.nextIndex] = slot;
  });
  if (indices.some((slot) => slot < 0) || new Set(indices).size !== indices.length) return null;
  return {
    indices,
    inventory: nextInventory.map(cloneInventoryStack),
  };
}

export function preservedSourceInventorySlotIndices(
  inventory: readonly InventoryStack[],
  snapshot: SourceInventorySlotSnapshot | null,
): number[] | undefined {
  return snapshot !== null && JSON.stringify(snapshot.inventory) === JSON.stringify(inventory)
    ? [...snapshot.indices]
    : undefined;
}

export interface GameSaveState {
  version: typeof GAME_SAVE_VERSION;
  savedAt: number;
  mapId: number;
  tileX: number;
  tileY: number;
  direction: Direction;
  /** Source `m.g`; values 0, 1 and 2+ select enemy tables data0, data1 and data2. */
  playthroughMode: number;
  /** Persisted source `an.f55f`, awarded at the end of a completed cycle. */
  completionPoints: number;
  /** Persisted source `an.f76h`, accumulated play time in seconds. */
  playTimeSeconds: number;
  gameFlags: number[];
  questFlags: number[];
  guardianIndices: number[];
  heroClassId: EndingHeroClassId;
  /** Source player base stats; older web saves default to the class starting values. */
  attributes: PlayerAttributes;
  skillIds: number[];
  /** Source `an.f72a` pointer expressed as the learned skill ID. */
  activeSkillId: number;
  /** Per-skill source rank and XP. Missing in older v1 saves. */
  skillProgress: SavedPlayerSkillProgress[];
  comboLimit: number;
  hud: GameplayHudState;
  wallet: number;
  inventory: InventoryStack[];
  /** Original occupied RMS slot indices, retained while an imported inventory is unchanged. */
  sourceInventorySlotIndices?: number[];
  /** Source `/o` save stream, separate from the ordinary 30-slot inventory. */
  specialInventory: InventoryStack[];
  /** Original occupied `/o` slot indices, retained while the imported inventory is unchanged. */
  sourceSpecialInventorySlotIndices?: number[];
  /** Null denotes an older version-one save made before equipment was persisted. */
  equipmentSlots: EquipmentLoadout | null;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const NEXT_CYCLE_STARTS: Record<EndingHeroClassId, { mapId: number; tileX: number; tileY: number }> = {
  6: { mapId: 0, tileX: 22, tileY: 4 },
  7: { mapId: 60, tileX: 5, tileY: 36 },
  8: { mapId: 77, tileX: 10, tileY: 18 },
};

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPlayerSkillLevelSlot(value: unknown): value is PlayerSkillLevelSlot {
  return isIntegerInRange(value, 0, 2);
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

function parseSkillProgress(
  value: unknown,
  skillIds: readonly number[],
): SavedPlayerSkillProgress[] | null {
  if (value === undefined) {
    return skillIds.map((skillId) => {
      const skillRank = PLAYER_SKILL_BASE_RANKS[skillId];
      return {
        skillId,
        skillRank,
        skillExperience: 0,
        ...defaultPlayerSkillLevelBindings(skillRank),
      };
    });
  }
  if (!Array.isArray(value) || value.length !== skillIds.length) return null;
  const parsed: SavedPlayerSkillProgress[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const progress = entry as Record<string, unknown>;
    const skillId = progress.skillId;
    const baseRank = Number.isInteger(skillId) && Number(skillId) >= 0 && Number(skillId) < PLAYER_SKILL_BASE_RANKS.length
      ? PLAYER_SKILL_BASE_RANKS[Number(skillId)]
      : undefined;
    if (baseRank === undefined || !skillIds.includes(Number(skillId)) || seen.has(Number(skillId)) ||
      !isIntegerInRange(progress.skillRank, baseRank, 32767) ||
      !isIntegerInRange(progress.skillExperience, 0, 2_147_483_647)) return null;
    const skillRank = Number(progress.skillRank);
    const skillExperience = Number(progress.skillExperience);
    if (skillExperience >= playerSkillExperienceRequiredForRank(skillRank)) return null;
    const defaultBindings = defaultPlayerSkillLevelBindings(skillRank);
    const skillLevelSlotOne = progress.skillLevelSlotOne === undefined
      ? defaultBindings.skillLevelSlotOne
      : progress.skillLevelSlotOne;
    const skillLevelSlotThree = progress.skillLevelSlotThree === undefined
      ? defaultBindings.skillLevelSlotThree
      : progress.skillLevelSlotThree;
    if (!(skillLevelSlotOne === null || isPlayerSkillLevelSlot(skillLevelSlotOne)) ||
      !(skillLevelSlotThree === null || isPlayerSkillLevelSlot(skillLevelSlotThree)) ||
      skillLevelSlotOne !== null && skillLevelSlotOne === skillLevelSlotThree ||
      skillLevelSlotOne !== null && skillRank < PLAYER_SKILL_LEVEL_UNLOCK_RANKS[skillLevelSlotOne] ||
      skillLevelSlotThree !== null && skillRank < PLAYER_SKILL_LEVEL_UNLOCK_RANKS[skillLevelSlotThree]) return null;
    seen.add(Number(skillId));
    parsed.push({
      skillId: Number(skillId),
      skillRank,
      skillExperience,
      skillLevelSlotOne,
      skillLevelSlotThree,
    });
  }
  return skillIds.every((skillId) => seen.has(skillId)) ? parsed : null;
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

function parseSourceInventorySlotIndices(
  value: unknown,
  itemCount: number,
  slotCount: number,
): number[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== itemCount ||
    !value.every((slot) => isIntegerInRange(slot, 0, slotCount - 1))) return null;
  const slots = value as number[];
  return new Set(slots).size === slots.length ? [...slots] : null;
}

/** Validate untrusted browser storage before it is used to restore a scene. */
export function parseGameSave(value: unknown): GameSaveState | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  const gameFlags = parseFlagList(data.gameFlags);
  const questFlags = parseFlagList(data.questFlags);
  const guardianIndices = parseGuardianIndices(data.guardianIndices);
  const heroClassId = data.heroClassId === undefined ? 6 : data.heroClassId;
  const playthroughMode = data.playthroughMode === undefined ? 0 : data.playthroughMode;
  const completionPoints = data.completionPoints === undefined ? 0 : data.completionPoints;
  const playTimeSeconds = data.playTimeSeconds === undefined ? 0 : data.playTimeSeconds;
  if (!isEndingHeroClassId(heroClassId)) return null;
  const attributes = parsePlayerAttributes(data.attributes, heroClassId);
  const skillIds = guardianIndices === null ? null : parseSkillIds(data.skillIds, guardianIndices);
  const activeSkillId = data.activeSkillId === undefined ? skillIds?.[0] : data.activeSkillId;
  const skillProgress = skillIds === null ? null : parseSkillProgress(data.skillProgress, skillIds);
  const comboLimit = data.comboLimit === undefined ? 1 : data.comboLimit;
  const hud = parseHudState(data.hud);
  const wallet = data.wallet === undefined ? NEW_GAME_WALLET : data.wallet;
  const inventory = data.inventory === undefined ? [] : parseInventory(data.inventory);
  const specialInventory = data.specialInventory === undefined ? [] : parseSpecialInventory(data.specialInventory);
  const sourceInventorySlotIndices = inventory === null ? null : parseSourceInventorySlotIndices(
    data.sourceInventorySlotIndices,
    inventory.length,
    30,
  );
  const sourceSpecialInventorySlotIndices = specialInventory === null ? null : parseSourceInventorySlotIndices(
    data.sourceSpecialInventorySlotIndices,
    specialInventory.length,
    15,
  );
  const equipmentSlots = data.equipmentSlots === undefined || data.equipmentSlots === null
    ? null
    : parseEquipmentLoadout(data.equipmentSlots);
  if (data.version !== GAME_SAVE_VERSION ||
    !isIntegerInRange(data.savedAt, 0, Number.MAX_SAFE_INTEGER) ||
    !isIntegerInRange(data.mapId, 0, 255) ||
    !isIntegerInRange(data.tileX, 0, 255) || !isIntegerInRange(data.tileY, 0, 255) ||
    !isIntegerInRange(data.direction, 1, 4) || !isIntegerInRange(playthroughMode, 0, 127) ||
    !isIntegerInRange(completionPoints, -128, 100) ||
    !isIntegerInRange(playTimeSeconds, -2_147_483_648, 2_147_483_647) ||
    gameFlags === null || questFlags === null ||
    guardianIndices === null || guardianIndices.length === 0 || skillIds === null || skillProgress === null || hud === null ||
    !isIntegerInRange(activeSkillId, 0, 5) || !skillIds.includes(Number(activeSkillId)) ||
    attributes === null ||
    !isIntegerInRange(comboLimit, 1, 127) ||
    !isIntegerInRange(wallet, 0, 2_147_483_647) || inventory === null || specialInventory === null ||
    sourceInventorySlotIndices === null || sourceSpecialInventorySlotIndices === null ||
    data.equipmentSlots !== undefined && data.equipmentSlots !== null && equipmentSlots === null) return null;
  return {
    version: GAME_SAVE_VERSION,
    savedAt: Number(data.savedAt),
    mapId: Number(data.mapId),
    tileX: Number(data.tileX),
    tileY: Number(data.tileY),
    direction: Number(data.direction) as Direction,
    playthroughMode: Number(playthroughMode),
    completionPoints: Number(completionPoints),
    playTimeSeconds: Number(playTimeSeconds),
    gameFlags,
    questFlags,
    guardianIndices,
    heroClassId,
    attributes,
    skillIds,
    activeSkillId: Number(activeSkillId),
    skillProgress,
    comboLimit: Number(comboLimit),
    hud,
    wallet: Number(wallet),
    inventory,
    ...(sourceInventorySlotIndices === undefined ? {} : { sourceInventorySlotIndices }),
    specialInventory,
    ...(sourceSpecialInventorySlotIndices === undefined ? {} : { sourceSpecialInventorySlotIndices }),
    equipmentSlots,
  };
}

/** Apply the pinned source's post-credits cycle setup to the fields modeled by the browser. */
export function prepareNextSourceCycle(save: GameSaveState, savedAt = Date.now()): GameSaveState {
  const start = NEXT_CYCLE_STARTS[save.heroClassId];
  return {
    ...save,
    savedAt,
    mapId: start.mapId,
    tileX: start.tileX,
    tileY: start.tileY,
    playthroughMode: 1,
    completionPoints: awardSourceEndingClearPoints(
      save.completionPoints,
      save.heroClassId,
      save.playthroughMode,
      save.gameFlags,
      save.questFlags,
    ),
    gameFlags: [0],
    questFlags: [],
    hud: { ...save.hud, hp: save.hud.maxHp, sp: save.hud.maxSp },
    // Source `f.c()` removes item classes 18–21 when the next cycle starts.
    inventory: save.inventory.filter((stack) => stack.category < 18 || stack.category > 21)
      .map((stack) => ({ ...stack })),
    sourceInventorySlotIndices: save.sourceInventorySlotIndices?.filter((_, index) =>
      save.inventory[index].category < 18 || save.inventory[index].category > 21),
  };
}

export function readGameSave(storage: SaveStorage): GameSaveState | null {
  const latest = readSaveAtKey(storage, GAME_SAVE_KEY);
  if (latest !== null) return latest;
  return readGameSaves(storage).reduce<GameSaveState | null>(
    (selected, save) => selected === null || save.savedAt > selected.savedAt ? save : selected,
    null,
  );
}

/** Read the source's class-indexed save roster in source class order. */
export function readGameSaves(storage: SaveStorage): GameSaveState[] {
  const legacyOrLatest = readSaveAtKey(storage, GAME_SAVE_KEY);
  return ([6, 7, 8] as const).flatMap((heroClassId) => {
    const classSave = readSaveAtKey(storage, GAME_SAVE_CLASS_KEYS[heroClassId]);
    const matchingLegacy = legacyOrLatest?.heroClassId === heroClassId ? legacyOrLatest : null;
    const selected = classSave?.heroClassId === heroClassId ? classSave : matchingLegacy;
    if (selected === null) return [];
    if (matchingLegacy !== null && matchingLegacy.savedAt > selected.savedAt) return [matchingLegacy];
    return [selected];
  });
}

export function writeGameSave(storage: SaveStorage, value: unknown): GameSaveState {
  const save = parseGameSave(value);
  if (save === null) throw new TypeError('Cannot save invalid game state');
  const encoded = JSON.stringify(save);
  storage.setItem(GAME_SAVE_KEY, encoded);
  storage.setItem(GAME_SAVE_CLASS_KEYS[save.heroClassId], encoded);
  return save;
}

function readSaveAtKey(storage: SaveStorage, key: string): GameSaveState | null {
  const stored = storage.getItem(key);
  if (stored === null) return null;
  try {
    return parseGameSave(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
}

/** Source load-list percentage: accumulated points plus the current cycle's objectives. */
export function sourceSaveCompletionPercent(save: GameSaveState): number {
  const total = save.completionPoints + sourceEndingClearPointAward(
    save.heroClassId,
    save.playthroughMode,
    save.gameFlags,
    save.questFlags,
  );
  return ((total + 128) % 256) - 128;
}
