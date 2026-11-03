import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import {
  applyCampaignTestHud,
  applyMaxLevelCampaignTestHud,
  CAMPAIGN_TEST_MAX_LEVEL,
  CAMPAIGN_TEST_LOOT_LEVEL,
  createMaxLevelCampaignTestAttributes,
  isCampaignTestProfile,
  LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE,
  MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
  serializeCampaignTestRuntimeSnapshot,
  type CampaignTestRuntimeSnapshot,
} from '../src/world/campaign-test-profile';
import { experienceRequiredForLevel } from '../src/world/progression';

describe('max-level campaign test profile', () => {
  it('raises the new-game HUD to level 99 without changing unrelated starting fields', () => {
    expect(applyMaxLevelCampaignTestHud(NEW_GAME_RONIN_HUD)).toEqual({
      ...NEW_GAME_RONIN_HUD,
      experience: 0,
      experienceToNextLevel: experienceRequiredForLevel(CAMPAIGN_TEST_MAX_LEVEL),
      level: 99,
      attributePoints: 0,
    });
  });

  it('uses the signed-short attribute limit accepted by the save model', () => {
    expect(createMaxLevelCampaignTestAttributes()).toEqual({
      power: 32767,
      hp: 32767,
      agility: 32767,
      will: 32767,
    });
  });

  it('keeps boosted loot testing at level one so level-gated drops remain possible', () => {
    expect(applyCampaignTestHud(NEW_GAME_RONIN_HUD, LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toEqual({
      ...NEW_GAME_RONIN_HUD,
      experience: 0,
      experienceToNextLevel: experienceRequiredForLevel(CAMPAIGN_TEST_LOOT_LEVEL),
      level: CAMPAIGN_TEST_LOOT_LEVEL,
      attributePoints: 0,
    });
  });

  it('accepts only the two developer campaign profiles', () => {
    expect(isCampaignTestProfile(MAX_LEVEL_CAMPAIGN_TEST_PROFILE)).toBe(true);
    expect(isCampaignTestProfile(LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toBe(true);
    expect(isCampaignTestProfile('production')).toBe(false);
    expect(isCampaignTestProfile(null)).toBe(false);
  });

  it('serializes a stable read-only runtime snapshot for browser route checks', () => {
    const snapshot: CampaignTestRuntimeSnapshot = {
      profile: MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
      mapId: 27,
      player: { tileX: 17, tileY: 33, direction: 4 },
      hp: 394392,
      maxHp: 394392,
      sp: 394392,
      maxSp: 394392,
      level: 99,
      gameFlags: new Set([87, 54, 3]),
      questFlags: new Set([4, 1]),
      skillAction: {
        skillId: 2,
        skillRank: 1,
        phase: 3,
        levelSlot: 0,
        tileX: 18,
        tileY: 33,
        effectAge: 4,
        chargeTicksRemaining: [56, 270, 220],
      },
      dialogueOpen: false,
      transitionPending: false,
      enemies: [
        { sourceOrder: 17, enemyId: 24, tileX: 18, tileY: 34, hp: 43, state: 'alive' },
        { sourceOrder: 12, enemyId: 21, tileX: 12, tileY: 22, hp: 90, state: 'alive' },
      ],
    };

    expect(JSON.parse(serializeCampaignTestRuntimeSnapshot(snapshot))).toEqual({
      format: 'heroes-lore-campaign-test-runtime-v1',
      profile: 'max-level',
      mapId: 27,
      player: { tileX: 17, tileY: 33, direction: 4 },
      resources: { hp: 394392, maxHp: 394392, sp: 394392, maxSp: 394392, level: 99 },
      gameFlags: [3, 54, 87],
      questFlags: [1, 4],
      skillAction: {
        skillId: 2,
        skillRank: 1,
        phase: 3,
        levelSlot: 0,
        tileX: 18,
        tileY: 33,
        effectAge: 4,
        chargeTicksRemaining: [56, 270, 220],
      },
      dialogueOpen: false,
      transitionPending: false,
      enemies: [
        { sourceOrder: 12, enemyId: 21, tileX: 12, tileY: 22, hp: 90, state: 'alive' },
        { sourceOrder: 17, enemyId: 24, tileX: 18, tileY: 34, hp: 43, state: 'alive' },
      ],
    });
  });
});
