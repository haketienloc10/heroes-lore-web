import type { Direction } from './actor';
import type { EquipmentDataTable } from './equipment-data';
import {
  GAME_SAVE_VERSION,
  parseGameSave,
  type GameSaveState,
} from './save-data';
import {
  CONSUMABLE_CATEGORIES,
  selectedConsumableCount,
  type ConsumableCategory,
  type InventoryStack,
} from './loot';
import {
  decodeSourceRmsItemRecord,
  encodeSourceRmsItemRecord,
} from './source-rms-items';
import {
  decodeSourceRmsSaveState,
  encodeSourceRmsSaveState,
  type SourceRmsInventoryState,
  type SourceRmsSaveState,
  type SourceRmsStores,
} from './source-rms-save';

export interface SourceRmsGameSaveDefaults {
  /** JSON-only metadata is set at import time because the source record has no timestamp. */
  savedAt: number;
  /** The source constructs a loaded player facing south; direction is not serialized. */
  direction?: Direction;
  /** Source inventory construction starts on category 7; the selection is not serialized. */
  selectedItemCategory?: ConsumableCategory;
}

function encodeInventorySlots(
  items: GameSaveState['inventory'],
  slotCount: 30 | 15,
  wallet: number,
  label: string,
  sourceSlotIndices?: readonly number[],
): SourceRmsInventoryState {
  if (items.length > slotCount) throw new TypeError(`${label} exceeds its ${slotCount}-slot source inventory`);
  if (sourceSlotIndices !== undefined && (sourceSlotIndices.length !== items.length ||
    sourceSlotIndices.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= slotCount) ||
    new Set(sourceSlotIndices).size !== sourceSlotIndices.length)) {
    throw new TypeError(`${label} has invalid preserved source slot indices`);
  }
  const slots: Array<Uint8Array | null> = Array.from({ length: slotCount }, () => null);
  items.forEach((item, index) => {
    const sourceSlot = sourceSlotIndices?.[index] ?? index;
    slots[sourceSlot] = encodeSourceRmsItemRecord(item);
  });
  return {
    wallet,
    slots,
  };
}

/** Map the web save's source-backed fields to the native structured RMS payload. */
export function createSourceRmsStateFromGameSave(save: GameSaveState): SourceRmsSaveState {
  if (save.equipmentSlots === null) {
    throw new TypeError('A source RMS export requires the five saved equipment slots');
  }
  if (save.skillIds.length > 5 || save.skillIds.length === 0) {
    throw new TypeError('A source RMS export requires one through five learned skills');
  }
  const activeSkillSlot = save.skillIds.indexOf(save.activeSkillId);
  if (activeSkillSlot < 0) throw new TypeError('Active skill must reference a learned skill slot');

  const progressBySkill = new Map(save.skillProgress.map((progress) => [progress.skillId, progress]));
  if (save.skillProgress.length !== save.skillIds.length || progressBySkill.size !== save.skillIds.length) {
    throw new TypeError('Every learned skill must have exactly one saved progress record');
  }
  const skills = Array.from({ length: 5 }, (_, slot) => {
    const skillId = save.skillIds[slot];
    if (skillId === undefined) return null;
    const progress = progressBySkill.get(skillId);
    if (progress === undefined) throw new TypeError(`Skill ${skillId} has no saved progress`);
    return {
      skillId,
      rank: progress.skillRank,
      experience: progress.skillExperience,
      skillLevelSlotOne: progress.skillLevelSlotOne,
      skillLevelSlotThree: progress.skillLevelSlotThree,
    };
  });

  return {
    heroClassId: save.heroClassId,
    player: {
      completionPoints: save.completionPoints,
      level: save.hud.level,
      hp: save.hud.hp,
      sp: save.hud.sp,
      experience: save.hud.experience,
      maxHp: save.hud.maxHp,
      maxSp: save.hud.maxSp,
      nextExperience: save.hud.experienceToNextLevel,
      comboLimit: save.comboLimit,
      attributePoints: save.hud.attributePoints,
      attributes: { ...save.attributes },
      equipmentSlots: save.equipmentSlots.map((item) =>
        item === null ? null : encodeSourceRmsItemRecord(item)),
      skills,
      activeSkillSlot,
      playTimeSeconds: save.playTimeSeconds,
    },
    inventory: encodeInventorySlots(
      save.inventory,
      30,
      save.wallet,
      'Regular inventory',
      save.sourceInventorySlotIndices,
    ),
    flags: {
      gameFlags: [...save.gameFlags],
      questFlags: [...save.questFlags],
      playthroughMode: save.playthroughMode,
    },
    location: { mapId: save.mapId, tileX: save.tileX, tileY: save.tileY },
    specialInventory: encodeInventorySlots(
      save.specialInventory,
      15,
      0,
      'Special inventory',
      save.sourceSpecialInventorySlotIndices,
    ),
  };
}

/** Build both source RMS records in memory; this does not read or write browser storage. */
export function encodeGameSaveAsSourceRmsStores(save: GameSaveState): SourceRmsStores {
  return encodeSourceRmsSaveState(createSourceRmsStateFromGameSave(save));
}

/** Map a decoded native payload into the web model, supplying only non-source metadata defaults. */
export function createGameSaveFromSourceRmsState(
  source: SourceRmsSaveState,
  equipmentCatalog: EquipmentDataTable,
  defaults: SourceRmsGameSaveDefaults,
): GameSaveState {
  const { player } = source;
  if (source.specialInventory.wallet !== 0) {
    throw new TypeError('A nonzero source special-inventory wallet has no web save field');
  }
  const sourceSkills = player.skills.flatMap((skill, slot) => skill === null
    ? []
    : [{ skill, slot }]);
  const active = sourceSkills.find(({ slot }) => slot === player.activeSkillSlot)?.skill;
  if (active === undefined) throw new TypeError('Source RMS active skill slot is empty');
  const skills = sourceSkills.map(({ skill }) => skill);
  const guardianIndices = [...new Set(skills
    .map(({ skillId }) => skillId)
    .filter((skillId) => skillId <= 2))].sort((first, second) => first - second);
  if (guardianIndices.length === 0) {
    throw new TypeError('Source RMS player has no selected Guardian skills');
  }

  const inventory: InventoryStack[] = [];
  const sourceInventorySlotIndices: number[] = [];
  source.inventory.slots.forEach((record, slot) => {
    if (record === null) return;
    inventory.push(decodeSourceRmsItemRecord(record, equipmentCatalog));
    sourceInventorySlotIndices.push(slot);
  });
  const specialInventory: InventoryStack[] = [];
  const sourceSpecialInventorySlotIndices: number[] = [];
  source.specialInventory.slots.forEach((record, slot) => {
    if (record === null) return;
    specialInventory.push(decodeSourceRmsItemRecord(record, equipmentCatalog));
    sourceSpecialInventorySlotIndices.push(slot);
  });
  const selectedItemCategory = defaults.selectedItemCategory ?? CONSUMABLE_CATEGORIES[0];
  const equipmentSlots = player.equipmentSlots.map((record) =>
    record === null ? null : decodeSourceRmsItemRecord(record, equipmentCatalog));
  const candidate = {
    version: GAME_SAVE_VERSION,
    savedAt: defaults.savedAt,
    mapId: source.location.mapId,
    tileX: source.location.tileX,
    tileY: source.location.tileY,
    direction: defaults.direction ?? 2,
    playthroughMode: source.flags.playthroughMode,
    completionPoints: player.completionPoints,
    playTimeSeconds: player.playTimeSeconds,
    gameFlags: source.flags.gameFlags,
    questFlags: source.flags.questFlags,
    guardianIndices,
    heroClassId: source.heroClassId,
    attributes: player.attributes,
    skillIds: skills.map(({ skillId }) => skillId),
    activeSkillId: active.skillId,
    skillProgress: skills.map((skill) => ({
      skillId: skill.skillId,
      skillRank: skill.rank,
      skillExperience: skill.experience,
      skillLevelSlotOne: skill.skillLevelSlotOne,
      skillLevelSlotThree: skill.skillLevelSlotThree,
    })),
    comboLimit: player.comboLimit,
    hud: {
      hp: player.hp,
      maxHp: player.maxHp,
      sp: player.sp,
      maxSp: player.maxSp,
      experience: player.experience,
      experienceToNextLevel: player.nextExperience,
      level: player.level,
      attributePoints: player.attributePoints,
      selectedItemCount: selectedConsumableCount(inventory, selectedItemCategory),
      selectedItemCategory,
    },
    wallet: source.inventory.wallet,
    inventory,
    sourceInventorySlotIndices,
    specialInventory,
    sourceSpecialInventorySlotIndices,
    equipmentSlots,
  };
  const parsed = parseGameSave(candidate);
  if (parsed === null) throw new TypeError('Source RMS fields are not valid in the web save model');
  return parsed;
}

/** Decode the source class stores and provide browser-only defaults without opening an RMS store. */
export function decodeSourceRmsStoresAsGameSave(
  heroClassId: number,
  primaryRecord: Uint8Array,
  specialRecord: Uint8Array,
  equipmentCatalog: EquipmentDataTable,
  defaults: SourceRmsGameSaveDefaults,
): GameSaveState {
  return createGameSaveFromSourceRmsState(
    decodeSourceRmsSaveState(heroClassId, primaryRecord, specialRecord),
    equipmentCatalog,
    defaults,
  );
}
