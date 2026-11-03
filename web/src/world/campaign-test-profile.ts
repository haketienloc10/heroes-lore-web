import type { GameplayHudState } from '../ui/game-hud';
import type { PlayerAttributes } from './attributes';
import { experienceRequiredForLevel } from './progression';

export const MAX_LEVEL_CAMPAIGN_TEST_PROFILE = 'max-level' as const;
export const LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE = 'loot-survival' as const;
export const CAMPAIGN_TEST_MAX_LEVEL = 99;
export const CAMPAIGN_TEST_LOOT_LEVEL = 1;

export type CampaignTestProfile = typeof MAX_LEVEL_CAMPAIGN_TEST_PROFILE |
  typeof LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE;

export interface CampaignTestRuntimeEnemy {
  sourceOrder: number;
  enemyId: number;
  tileX: number;
  tileY: number;
  hp: number;
  state: 'alive' | 'death-pending' | 'respawn-wait' | 'removed';
}

export interface CampaignTestRuntimeSnapshot {
  profile: CampaignTestProfile;
  mapId: number;
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
  gameFlags: ReadonlySet<number>;
  questFlags: ReadonlySet<number>;
  skillAction: {
    skillId: number | null;
    skillRank: number;
    phase: number;
    levelSlot: number | null;
    tileX: number;
    tileY: number;
    effectAge: number;
    chargeTicksRemaining: readonly number[];
  };
  dialogueOpen: boolean;
  transitionPending: boolean;
  enemies: readonly CampaignTestRuntimeEnemy[];
}

export function isCampaignTestProfile(value: unknown): value is CampaignTestProfile {
  return value === MAX_LEVEL_CAMPAIGN_TEST_PROFILE ||
    value === LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE;
}

/** Read-only state exposed on the gameplay host only for developer test-profile runs. */
export function serializeCampaignTestRuntimeSnapshot(snapshot: CampaignTestRuntimeSnapshot): string {
  const sortFlags = (flags: ReadonlySet<number>): number[] => [...flags].sort((left, right) => left - right);
  const enemies = [...snapshot.enemies]
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
    .map((enemy) => ({ ...enemy }));
  return JSON.stringify({
    format: 'heroes-lore-campaign-test-runtime-v1',
    profile: snapshot.profile,
    mapId: snapshot.mapId,
    player: { ...snapshot.player },
    resources: {
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      sp: snapshot.sp,
      maxSp: snapshot.maxSp,
      level: snapshot.level,
    },
    gameFlags: sortFlags(snapshot.gameFlags),
    questFlags: sortFlags(snapshot.questFlags),
    skillAction: {
      ...snapshot.skillAction,
      chargeTicksRemaining: [...snapshot.skillAction.chargeTicksRemaining],
    },
    dialogueOpen: snapshot.dialogueOpen,
    transitionPending: snapshot.transitionPending,
    enemies,
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
