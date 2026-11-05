import type { GameplayHudState } from '../ui/game-hud';
import type { Direction } from './actor';
import type { PlayerAttributes } from './attributes';
import type { EquipmentLoadout } from './equipment';
import type { GroundDrop, InventoryStack } from './loot';
import type { PlayerComboState } from './player-combo';
import { experienceRequiredForLevel } from './progression';
import { createBasePlayerAttributes } from './attributes';

export const MAX_LEVEL_CAMPAIGN_TEST_PROFILE = 'max-level' as const;
export const LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE = 'loot-survival' as const;
export const DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE = 'damage-survival' as const;
export const MAP60_INVESTIGATION_TEST_SCENARIO = 'map60-investigation' as const;
export const MAP27_CLASS6_LUNGE_TEST_SCENARIO = 'map27-class6-lunge' as const;
export const MAP27_CLASS6_LUNGE_TARGET_TEST_SCENARIO = 'map27-class6-lunge-target' as const;
export const MAP27_CLASS6_SKILL2_TEST_SCENARIO = 'map27-class6-skill2' as const;
export const MAP27_CLASS6_SKILL_RANK_TEST_SCENARIO = 'map27-class6-skill-rank' as const;
export const MAP27_CLASS6_SKILL_RANK9_TEST_SCENARIO = 'map27-class6-skill-rank9' as const;
export const MAP27_CLASS6_SKILL3_TEST_SCENARIO = 'map27-class6-skill3' as const;
export const MAP27_CLASS6_SKILL4_TEST_SCENARIO = 'map27-class6-skill4' as const;
export const MAP27_CLASS6_SKILL5_TEST_SCENARIO = 'map27-class6-skill5' as const;
export const MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO = 'map2-class6-skill5-element3' as const;
export const MAP80_REFINER_ORB_TEST_SCENARIO = 'map80-refiner-orb-attribute' as const;
export const MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO = 'map80-blacksmith-identify' as const;
export const CAMPAIGN_MAP_PREVIEW_TEST_SCENARIO_PREFIX = 'map-preview-' as const;
export const CAMPAIGN_TEST_MAX_LEVEL = 99;
export const CAMPAIGN_TEST_LOOT_LEVEL = 1;

export type CampaignTestProfile = typeof MAX_LEVEL_CAMPAIGN_TEST_PROFILE |
  typeof LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE |
  typeof DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE;

export type CampaignTestScenario = typeof MAP60_INVESTIGATION_TEST_SCENARIO |
  typeof MAP27_CLASS6_LUNGE_TEST_SCENARIO |
  typeof MAP27_CLASS6_LUNGE_TARGET_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL2_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL_RANK_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL_RANK9_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL3_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL4_TEST_SCENARIO |
  typeof MAP27_CLASS6_SKILL5_TEST_SCENARIO |
  typeof MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO |
  typeof MAP80_REFINER_ORB_TEST_SCENARIO |
  typeof MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO |
  `${typeof CAMPAIGN_MAP_PREVIEW_TEST_SCENARIO_PREFIX}${number}`;

export interface CampaignTestRuntimeEnemy {
  sourceOrder: number;
  enemyId: number;
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  hp: number;
  state: 'alive' | 'death-pending' | 'respawn-wait' | 'removed';
  behaviorType: 0 | 1 | 2 | 3;
  behaviorTiming: readonly [number, number];
  animationStateIndex: 0 | 1 | 2 | null;
  animationDirection: Direction | null;
  animationFrameIndex: number | null;
  attackCooldownTicksRemaining: number | null;
  actionDelayTicksRemaining: number | null;
  pursuitRetargetProgress: number | null;
  pursuitTarget: 'player' | 'action' | null;
  attackAnimationTicksRemaining: number | null;
  attackHitResolved: boolean | null;
  sourceRenderedOnScreen: boolean | null;
}

export interface CampaignTestRuntimeNpc {
  sourceOrder: number;
  npcId: number;
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
  direction: Direction;
  visible: boolean;
  moving: boolean;
  occupiesCells: boolean;
}

export interface CampaignTestRuntimeSnapshot {
  profile: CampaignTestProfile;
  mapId: number;
  mapSize: { width: number; height: number };
  entityOccupiedCells: readonly { tileX: number; tileY: number }[];
  player: {
    tileX: number;
    tileY: number;
    direction: number;
  };
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  level: number;
  wallet: number;
  inventory: readonly InventoryStack[];
  equipment: EquipmentLoadout;
  groundDrops: readonly GroundDrop[];
  gameFlags: ReadonlySet<number>;
  questFlags: ReadonlySet<number>;
  skillAction: {
    skillId: number | null;
    skillRank: number;
    skillExperience: number;
    skillLevelSlotOne: number | null;
    skillLevelSlotThree: number | null;
    defenseBoostTicksRemaining: number;
    phase: number;
    levelSlot: number | null;
    tileX: number;
    tileY: number;
    effectAge: number;
    chargeTicksRemaining: readonly number[];
  };
  combo: PlayerComboState & { comboLimit: number };
  dialogueOpen: boolean;
  transitionPending: boolean;
  enemies: readonly CampaignTestRuntimeEnemy[];
  npcs: readonly CampaignTestRuntimeNpc[];
}

export function isCampaignTestProfile(value: unknown): value is CampaignTestProfile {
  return value === MAX_LEVEL_CAMPAIGN_TEST_PROFILE ||
    value === LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE ||
    value === DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE;
}

export function isCampaignTestScenario(value: unknown): value is CampaignTestScenario {
  return value === MAP60_INVESTIGATION_TEST_SCENARIO ||
    value === MAP27_CLASS6_LUNGE_TEST_SCENARIO ||
    value === MAP27_CLASS6_LUNGE_TARGET_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL2_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL_RANK_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL_RANK9_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL3_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL4_TEST_SCENARIO ||
    value === MAP27_CLASS6_SKILL5_TEST_SCENARIO ||
    value === MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO ||
    value === MAP80_REFINER_ORB_TEST_SCENARIO ||
    value === MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO ||
    campaignTestMapPreviewMapId(value) !== null;
}

/** Return the byte-sized map ID encoded by a DEV-only `map-preview-N` scenario. */
export function campaignTestMapPreviewMapId(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^map-preview-(0|[1-9]\d{0,2})$/.exec(value);
  if (match?.[1] === undefined) return null;
  const mapId = Number(match[1]);
  return mapId <= 0xff ? mapId : null;
}

/** Read-only state exposed on the gameplay host only for developer test-profile runs. */
export function serializeCampaignTestRuntimeSnapshot(snapshot: CampaignTestRuntimeSnapshot): string {
  const sortFlags = (flags: ReadonlySet<number>): number[] => [...flags].sort((left, right) => left - right);
  const copyStack = (stack: InventoryStack): InventoryStack => ({
    ...stack,
    ...(stack.equipmentState === undefined ? {} : {
      equipmentState: {
        ...stack.equipmentState,
        bonusValues: [...stack.equipmentState.bonusValues] as [number, number, number, number],
        subtypeBytes: [...stack.equipmentState.subtypeBytes],
      },
    }),
  });
  const enemies = [...snapshot.enemies]
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((enemy) => ({ ...enemy }));
  const npcs = [...snapshot.npcs]
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((npc) => ({ ...npc }));
  return JSON.stringify({
    format: 'heroes-lore-campaign-test-runtime-v7',
    profile: snapshot.profile,
    mapId: snapshot.mapId,
    mapSize: { ...snapshot.mapSize },
    entityOccupiedCells: snapshot.entityOccupiedCells
      .map((cell) => ({ ...cell }))
      .sort((left, right) => left.tileY - right.tileY || left.tileX - right.tileX),
    player: { ...snapshot.player },
    resources: {
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      sp: snapshot.sp,
      maxSp: snapshot.maxSp,
      level: snapshot.level,
    },
    wallet: snapshot.wallet,
    inventory: snapshot.inventory.map(copyStack),
    equipment: snapshot.equipment.map((stack) => stack === null ? null : copyStack(stack)),
    groundDrops: snapshot.groundDrops.map((drop) => ({ ...drop })),
    gameFlags: sortFlags(snapshot.gameFlags),
    questFlags: sortFlags(snapshot.questFlags),
    skillAction: {
      ...snapshot.skillAction,
      chargeTicksRemaining: [...snapshot.skillAction.chargeTicksRemaining],
    },
    combo: { ...snapshot.combo },
    dialogueOpen: snapshot.dialogueOpen,
    transitionPending: snapshot.transitionPending,
    enemies,
    npcs,
  });
}

// Match the signed-short range accepted by the save parser for source stats.
const CAMPAIGN_TEST_MAX_ATTRIBUTE = 32767;

export function createBoostedCampaignTestAttributes(): PlayerAttributes {
  return {
    power: CAMPAIGN_TEST_MAX_ATTRIBUTE,
    hp: CAMPAIGN_TEST_MAX_ATTRIBUTE,
    agility: CAMPAIGN_TEST_MAX_ATTRIBUTE,
    will: CAMPAIGN_TEST_MAX_ATTRIBUTE,
  };
}

export function createMaxLevelCampaignTestAttributes(): PlayerAttributes {
  return createBoostedCampaignTestAttributes();
}

/** Keep HP high while preserving Ronin's ordinary defense and evasion for damage probes. */
export function createDamageSurvivalCampaignTestAttributes(): PlayerAttributes {
  return {
    ...createBasePlayerAttributes(6),
    hp: CAMPAIGN_TEST_MAX_ATTRIBUTE,
  };
}

export function createCampaignTestAttributes(profile: CampaignTestProfile): PlayerAttributes {
  return profile === DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE
    ? createDamageSurvivalCampaignTestAttributes()
    : createBoostedCampaignTestAttributes();
}

/** Keep the damage-survival HP pool large without turning its HP attribute into a refill. */
export function resolveCampaignTestRecoveryAttributes(
  profile: CampaignTestProfile | null,
  effectiveAttributes: PlayerAttributes,
  characterAttributes: PlayerAttributes,
  heroClassId: 6 | 7 | 8,
): PlayerAttributes {
  if (profile !== DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE) return effectiveAttributes;
  const baseHp = createBasePlayerAttributes(heroClassId).hp;
  const equipmentHpBonus = effectiveAttributes.hp - characterAttributes.hp;
  return { ...effectiveAttributes, hp: baseHp + equipmentHpBonus };
}

export function applyCampaignTestHud(
  state: GameplayHudState,
  profile: CampaignTestProfile,
): GameplayHudState {
  const level = profile === MAX_LEVEL_CAMPAIGN_TEST_PROFILE
    ? CAMPAIGN_TEST_MAX_LEVEL
    : CAMPAIGN_TEST_LOOT_LEVEL;
  return {
    ...state,
    experience: 0,
    experienceToNextLevel: experienceRequiredForLevel(level),
    level,
    attributePoints: 0,
  };
}

export function applyMaxLevelCampaignTestHud(state: GameplayHudState): GameplayHudState {
  return applyCampaignTestHud(state, MAX_LEVEL_CAMPAIGN_TEST_PROFILE);
}

/** Restore developer-profile resources before the world can enter Game Over. */
export function restoreCampaignTestVitals(
  state: GameplayHudState,
  profile: CampaignTestProfile | null,
): GameplayHudState | null {
  if (profile === null) return null;
  return { ...state, hp: state.maxHp, sp: state.maxSp };
}
