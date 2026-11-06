import type { GameplayHudState } from '../ui/game-hud';
import type { Direction } from './actor';
import type { PlayerAttributes } from './attributes';
import type { EquipmentLoadout } from './equipment';
import type { GroundDrop, InventoryStack } from './loot';
import type { PlayerComboState } from './player-combo';
import type { EnemyCombatant } from './combat';
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
export const MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO = 'map27-weapon-proc-status' as const;
export const MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO = 'map27-weapon-proc-status-slow' as const;
export const MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO = 'map27-weapon-proc-status-defense' as const;
export const MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO = 'map2-class6-skill5-element3' as const;
export const MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO =
  'map2-class6-skill3-level2-element3-mismatch' as const;
export const MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO = 'map17-class6-skill3-level2' as const;
export const MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO =
  'map17-class6-skill0-level1-combo' as const;
export const MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO =
  'map17-class6-skill0-level2-counter-controlled' as const;
export const MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO =
  'map17-class6-skill4-level1-immunity' as const;
export const MAP80_CLASS6_SKILL1_LEVEL2_RECOVERY_TEST_SCENARIO =
  'map80-class6-skill1-level2-recovery' as const;
export const MAP80_CLASS6_SKILL0_LEVEL2_AURA_TEST_SCENARIO =
  'map80-class6-skill0-level2-aura' as const;
export const MAP80_CLASS6_SKILL2_LEVEL2_CLEANSE_TEST_SCENARIO =
  'map80-class6-skill2-level2-cleanse' as const;
export const MAP80_CLASS6_SKILL4_LEVEL2_RESTORE_TEST_SCENARIO =
  'map80-class6-skill4-level2-restore' as const;
export const MAP80_REFINER_ORB_TEST_SCENARIO = 'map80-refiner-orb-attribute' as const;
export const MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO = 'map80-blacksmith-identify' as const;
export const MAP80_BLACKSMITH_IDENTIFY_DIRECT_TEST_SCENARIO = 'map80-blacksmith-identify-direct' as const;
export const MAP0_WALKING_RECOVERY_TEST_SCENARIO = 'map0-walking-recovery-controlled' as const;
export const MAP76_EQUIPMENT_REWARD_TEST_SCENARIO = 'map76-equipment-reward' as const;
export const MAP76_EQUIPMENT_RECOVERY_BOUNDARY_TEST_SCENARIO = 'map76-equipment-recovery-boundary' as const;
export const MAP15_BOSS_DEATH_TEST_SCENARIO = 'map15-boss-death-animation' as const;
export const MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO = 'map11-boss-death-fallback' as const;
export const MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO =
  'map11-boss-death-fallback-controlled' as const;
export const MAP11_BOSS_AI_LIVE_TEST_SCENARIO = 'map11-boss-ai-live' as const;
export const MAP13_AQ_AI_LIVE_TEST_SCENARIO = 'map13-aq-ai-live' as const;
export const MAP13_CC_HEAL_LIVE_TEST_SCENARIO = 'map13-cc-heal-live' as const;
export const MAP13_BC_ATTACK_LIVE_TEST_SCENARIO = 'map13-bc-attack-live' as const;
export const MAP59_KEY_PREVIEW_TEST_SCENARIO = 'map-preview-59-key' as const;
export const MAP59_FULL_CHAIN_PREVIEW_TEST_SCENARIO = 'map-preview-59-prereqs' as const;
export const MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO = 'map53-flag82-bluebrick-route' as const;
export const MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO = 'map54-current-cell-exit-latch' as const;
export const MAP54_TO_MAP13_CHAIN_TEST_SCENARIO = 'map54-to-map13-chain' as const;
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
  typeof MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO |
  typeof MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO |
  typeof MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO |
  typeof MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO |
  typeof MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO |
  typeof MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO |
  typeof MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO |
  typeof MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO |
  typeof MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO |
  typeof MAP80_CLASS6_SKILL1_LEVEL2_RECOVERY_TEST_SCENARIO |
  typeof MAP80_CLASS6_SKILL0_LEVEL2_AURA_TEST_SCENARIO |
  typeof MAP80_CLASS6_SKILL2_LEVEL2_CLEANSE_TEST_SCENARIO |
  typeof MAP80_CLASS6_SKILL4_LEVEL2_RESTORE_TEST_SCENARIO |
  typeof MAP80_REFINER_ORB_TEST_SCENARIO |
  typeof MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO |
  typeof MAP80_BLACKSMITH_IDENTIFY_DIRECT_TEST_SCENARIO |
  typeof MAP0_WALKING_RECOVERY_TEST_SCENARIO |
  typeof MAP76_EQUIPMENT_REWARD_TEST_SCENARIO |
  typeof MAP76_EQUIPMENT_RECOVERY_BOUNDARY_TEST_SCENARIO |
  typeof MAP15_BOSS_DEATH_TEST_SCENARIO |
  typeof MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO |
  typeof MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO |
  typeof MAP11_BOSS_AI_LIVE_TEST_SCENARIO |
  typeof MAP13_AQ_AI_LIVE_TEST_SCENARIO |
  typeof MAP13_CC_HEAL_LIVE_TEST_SCENARIO |
  typeof MAP13_BC_ATTACK_LIVE_TEST_SCENARIO |
  typeof MAP59_KEY_PREVIEW_TEST_SCENARIO |
  typeof MAP59_FULL_CHAIN_PREVIEW_TEST_SCENARIO |
  typeof MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO |
  typeof MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO |
  typeof MAP54_TO_MAP13_CHAIN_TEST_SCENARIO |
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
  /** DEV observation of the source class and exact animation slot selected for rendering. */
  sourceAu?: boolean;
  renderSpriteId?: number;
  renderAnimationStateIndex?: number | null;
  deathUpdatesRemaining?: number;
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
    recoveryBoostTicksRemaining: number;
  };
  combo: PlayerComboState & { comboLimit: number };
  dialogueOpen: boolean;
  transitionPending: boolean;
  enemies: readonly CampaignTestRuntimeEnemy[];
  npcs: readonly CampaignTestRuntimeNpc[];
}

export interface CampaignTestEnemyProjectile {
  id: number;
  sourceOrder: number;
  spriteId: number;
  direction: Direction;
  tileX: number;
  tileY: number;
  frameIndex: number;
  remainingSegments: number;
  hitResolved: boolean;
  sourceResource: string | null;
  effectFrameCount: number | null;
  renderedComponentCount: number;
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
    value === MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO ||
    value === MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO ||
    value === MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO ||
    value === MAP80_CLASS6_SKILL1_LEVEL2_RECOVERY_TEST_SCENARIO ||
    value === MAP80_CLASS6_SKILL0_LEVEL2_AURA_TEST_SCENARIO ||
    value === MAP80_CLASS6_SKILL2_LEVEL2_CLEANSE_TEST_SCENARIO ||
    value === MAP80_CLASS6_SKILL4_LEVEL2_RESTORE_TEST_SCENARIO ||
    value === MAP80_REFINER_ORB_TEST_SCENARIO ||
    value === MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO ||
    value === MAP80_BLACKSMITH_IDENTIFY_DIRECT_TEST_SCENARIO ||
    value === MAP0_WALKING_RECOVERY_TEST_SCENARIO ||
    value === MAP76_EQUIPMENT_REWARD_TEST_SCENARIO ||
    value === MAP76_EQUIPMENT_RECOVERY_BOUNDARY_TEST_SCENARIO ||
    value === MAP15_BOSS_DEATH_TEST_SCENARIO ||
    value === MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO ||
    value === MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO ||
    value === MAP11_BOSS_AI_LIVE_TEST_SCENARIO ||
    value === MAP13_AQ_AI_LIVE_TEST_SCENARIO ||
    value === MAP13_CC_HEAL_LIVE_TEST_SCENARIO ||
    value === MAP13_BC_ATTACK_LIVE_TEST_SCENARIO ||
    value === MAP59_KEY_PREVIEW_TEST_SCENARIO ||
    value === MAP59_FULL_CHAIN_PREVIEW_TEST_SCENARIO ||
    value === MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO ||
    value === MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO ||
    value === MAP54_TO_MAP13_CHAIN_TEST_SCENARIO ||
    campaignTestMapPreviewMapId(value) !== null;
}

/** Return the map ID encoded by a DEV-only map preview scenario. */
export function campaignTestMapPreviewMapId(value: unknown): number | null {
  if (value === MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO) return 27;
  if (value === MAP0_WALKING_RECOVERY_TEST_SCENARIO) return 0;
  if (value === MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO) return 11;
  if (value === MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO) return 11;
  if (value === MAP11_BOSS_AI_LIVE_TEST_SCENARIO) return 11;
  if (value === MAP13_AQ_AI_LIVE_TEST_SCENARIO) return 13;
  if (value === MAP13_CC_HEAL_LIVE_TEST_SCENARIO) return 13;
  if (value === MAP13_BC_ATTACK_LIVE_TEST_SCENARIO) return 13;
  if (value === MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO) return 2;
  if (value === MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO) return 17;
  if (value === MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO) return 17;
  if (value === MAP59_KEY_PREVIEW_TEST_SCENARIO || value === MAP59_FULL_CHAIN_PREVIEW_TEST_SCENARIO) return 59;
  if (value === MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO) return 53;
  if (value === MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO ||
    value === MAP54_TO_MAP13_CHAIN_TEST_SCENARIO) return 54;
  if (typeof value !== 'string') return null;
  const match = /^map-preview-(0|[1-9]\d{0,2})$/.exec(value);
  if (match?.[1] === undefined) return null;
  const mapId = Number(match[1]);
  return mapId <= 0xff ? mapId : null;
}

/** Optional fixed DEV preview spawn for route tests that model a named map-entry checkpoint. */
export function campaignTestMapPreviewSpawnTile(
  value: unknown,
): { tileX: number; tileY: number } | null {
  if (value === MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO ||
    value === MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO) return { tileX: 9, tileY: 31 };
  if (value === MAP0_WALKING_RECOVERY_TEST_SCENARIO) return { tileX: 6, tileY: 22 };
  if (value === MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO) return { tileX: 9, tileY: 9 };
  if (value === MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO) return { tileX: 9, tileY: 9 };
  if (value === MAP11_BOSS_AI_LIVE_TEST_SCENARIO) return { tileX: 9, tileY: 9 };
  if (value === MAP13_AQ_AI_LIVE_TEST_SCENARIO) return { tileX: 10, tileY: 10 };
  if (value === MAP13_CC_HEAL_LIVE_TEST_SCENARIO) return { tileX: 10, tileY: 10 };
  if (value === MAP13_BC_ATTACK_LIVE_TEST_SCENARIO) return { tileX: 10, tileY: 10 };
  if (value === MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO) return { tileX: 8, tileY: 27 };
  if (value === MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO ||
    value === MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO) return { tileX: 5, tileY: 11 };
  if (value === MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO) return { tileX: 5, tileY: 11 };
  if (value === MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO) return { tileX: 19, tileY: 38 };
  if (value === MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO ||
    value === MAP54_TO_MAP13_CHAIN_TEST_SCENARIO) return { tileX: 5, tileY: 13 };
  return null;
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
    format: 'heroes-lore-campaign-test-runtime-v9',
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

/** Expose active enemy statuses only on DEV test-profile pages for live combat verification. */
export function serializeCampaignTestEnemyStatusSnapshot(
  enemies: readonly Pick<EnemyCombatant, 'sourceOrder' | 'sourceStatusEffects'>[],
): string {
  return JSON.stringify([...enemies]
    .filter((enemy) => (enemy.sourceStatusEffects?.length ?? 0) > 0)
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((enemy) => ({
      sourceOrder: enemy.sourceOrder,
      effects: enemy.sourceStatusEffects?.map(({ id, ticksElapsed }) => ({ id, ticksElapsed })) ?? [],
    })));
}

/** Expose active DEV-only projectile/effect render state for browser encounter checks. */
export function serializeCampaignTestEnemyProjectileSnapshot(
  projectiles: readonly CampaignTestEnemyProjectile[],
): string {
  return JSON.stringify([...projectiles]
    .sort((left, right) => left.sourceOrder - right.sourceOrder || left.id - right.id)
    .map((projectile) => ({ ...projectile })));
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
