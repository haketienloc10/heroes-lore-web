import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import { advancePlayerRecoveryTick } from '../src/world/player-recovery';
import {
  applyCampaignTestHud,
  applyMaxLevelCampaignTestHud,
  campaignTestMapPreviewMapId,
  CAMPAIGN_TEST_MAX_LEVEL,
  CAMPAIGN_TEST_LOOT_LEVEL,
  createCampaignTestAttributes,
  createDamageSurvivalCampaignTestAttributes,
  createMaxLevelCampaignTestAttributes,
  DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE,
  isCampaignTestProfile,
  isCampaignTestScenario,
  LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE,
  MAP27_CLASS6_LUNGE_TEST_SCENARIO,
  MAP27_CLASS6_LUNGE_TARGET_TEST_SCENARIO,
  MAP27_CLASS6_SKILL2_TEST_SCENARIO,
  MAP27_CLASS6_SKILL_RANK_TEST_SCENARIO,
  MAP27_CLASS6_SKILL_RANK9_TEST_SCENARIO,
  MAP27_CLASS6_SKILL3_TEST_SCENARIO,
  MAP27_CLASS6_SKILL4_TEST_SCENARIO,
  MAP27_CLASS6_SKILL5_TEST_SCENARIO,
  MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO,
  MAP80_REFINER_ORB_TEST_SCENARIO,
  MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO,
  MAP60_INVESTIGATION_TEST_SCENARIO,
  MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
  resolveCampaignTestRecoveryAttributes,
  restoreCampaignTestVitals,
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

  it('keeps HP boosted for damage probes while preserving baseline Ronin combat stats', () => {
    expect(createDamageSurvivalCampaignTestAttributes()).toEqual({
      power: 8,
      hp: 32767,
      agility: 3,
      will: 4,
    });
    expect(createCampaignTestAttributes(DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toEqual({
      power: 8,
      hp: 32767,
      agility: 3,
      will: 4,
    });
    expect(applyCampaignTestHud(NEW_GAME_RONIN_HUD, DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toMatchObject({
      level: CAMPAIGN_TEST_LOOT_LEVEL,
      attributePoints: 0,
    });
  });

  it('keeps damage-survival recovery ordinary while retaining the boosted health capacity', () => {
    const characterAttributes = createDamageSurvivalCampaignTestAttributes();
    const equippedAttributes = { ...characterAttributes, hp: characterAttributes.hp + 2 };
    const recoveryAttributes = resolveCampaignTestRecoveryAttributes(
      DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE,
      equippedAttributes,
      characterAttributes,
      6,
    );
    expect(recoveryAttributes).toEqual({ ...equippedAttributes, hp: 7 });
    const recovery = advancePlayerRecoveryTick({ hpTimer: 1, spTimer: 30 }, 'idle', {
      level: CAMPAIGN_TEST_LOOT_LEVEL,
      attributes: recoveryAttributes,
      hp: 393208,
      maxHp: 393216,
      sp: 48,
      maxSp: 60,
    });
    expect(recovery.hp).toBe(393215);
    expect(recovery.hpChange).toBe(7);
    expect(resolveCampaignTestRecoveryAttributes(
      MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
      equippedAttributes,
      characterAttributes,
      6,
    )).toBe(equippedAttributes);
    expect(resolveCampaignTestRecoveryAttributes(
      null,
      equippedAttributes,
      characterAttributes,
      6,
    )).toBe(equippedAttributes);
  });

  it('accepts only the three developer campaign profiles', () => {
    expect(isCampaignTestProfile(MAX_LEVEL_CAMPAIGN_TEST_PROFILE)).toBe(true);
    expect(isCampaignTestProfile(LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toBe(true);
    expect(isCampaignTestProfile(DAMAGE_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toBe(true);
    expect(isCampaignTestProfile('production')).toBe(false);
    expect(isCampaignTestProfile(null)).toBe(false);
  });

  it('accepts only the known developer test scenario names', () => {
    expect(isCampaignTestScenario(MAP60_INVESTIGATION_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario('map60-investigation')).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_LUNGE_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_LUNGE_TARGET_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL2_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL_RANK_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL_RANK9_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL3_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL4_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP27_CLASS6_SKILL5_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_REFINER_ORB_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario('map-preview-13')).toBe(true);
    expect(campaignTestMapPreviewMapId('map-preview-0')).toBe(0);
    expect(campaignTestMapPreviewMapId('map-preview-13')).toBe(13);
    expect(campaignTestMapPreviewMapId('map-preview-255')).toBe(255);
    expect(campaignTestMapPreviewMapId('map-preview-256')).toBeNull();
    expect(campaignTestMapPreviewMapId('map-preview-013')).toBeNull();
    expect(isCampaignTestScenario('map61')).toBe(false);
    expect(isCampaignTestScenario(null)).toBe(false);
  });

  it('restores lethal HP and SP to their maxima for a developer profile', () => {
    const lethal = { ...NEW_GAME_RONIN_HUD, hp: 0, sp: 0 };
    expect(restoreCampaignTestVitals(lethal, MAX_LEVEL_CAMPAIGN_TEST_PROFILE)).toEqual({
      ...lethal,
      hp: NEW_GAME_RONIN_HUD.maxHp,
      sp: NEW_GAME_RONIN_HUD.maxSp,
    });
    expect(restoreCampaignTestVitals(lethal, LOOT_SURVIVAL_CAMPAIGN_TEST_PROFILE)).toMatchObject({
      hp: NEW_GAME_RONIN_HUD.maxHp,
      sp: NEW_GAME_RONIN_HUD.maxSp,
    });
  });

  it('leaves the ordinary game-over path active without a developer profile', () => {
    const lethal = { ...NEW_GAME_RONIN_HUD, hp: 0, sp: 0 };
    expect(restoreCampaignTestVitals(lethal, null)).toBeNull();
  });

  it('serializes a stable read-only runtime snapshot for browser route checks', () => {
    const snapshot: CampaignTestRuntimeSnapshot = {
      profile: MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
      mapId: 27,
      mapSize: { width: 64, height: 64 },
      entityOccupiedCells: [
        { tileX: 8, tileY: 12 },
        { tileX: 4, tileY: 5 },
      ],
      player: { tileX: 17, tileY: 33, direction: 4 },
      hp: 394392,
      maxHp: 394392,
      sp: 394392,
      maxSp: 394392,
      level: 99,
      wallet: 1234,
      inventory: [
        { category: 7, itemId: 2, count: 3 },
        {
          category: 0,
          itemId: 5,
          count: 1,
          equipmentState: {
            sourceFlag: false,
            upgradeByte: 1,
            bonusValues: [2, 0, -1, 0],
            subtypeBytes: [3, -4, 5],
          },
        },
      ],
      equipment: [
        {
          category: 0,
          itemId: 0,
          count: 1,
          equipmentState: {
            sourceFlag: true,
            upgradeByte: 0,
            bonusValues: [0, 0, 0, 0],
            subtypeBytes: [1, 2, 3],
          },
        },
        null,
        null,
        null,
        null,
      ],
      groundDrops: [
        { kind: 'item', id: 8, category: 0, itemId: 5, count: 1, tileX: 18, tileY: 34, ticksRemaining: 91 },
        { kind: 'currency', id: 9, sourceAmount: 12, tileX: 17, tileY: 34, ticksRemaining: 90 },
      ],
      gameFlags: new Set([87, 54, 3]),
      questFlags: new Set([4, 1]),
      skillAction: {
        skillId: 2,
        skillRank: 1,
        skillExperience: 35,
        skillLevelSlotOne: 0,
        skillLevelSlotThree: null,
        defenseBoostTicksRemaining: 0,
        phase: 3,
        levelSlot: 0,
        tileX: 18,
        tileY: 33,
        effectAge: 4,
        chargeTicksRemaining: [56, 270, 220],
      },
      combo: {
        stage: 1,
        frame: 2,
        activeStyle: 'light',
        queuedStyle: 'heavy',
        recoveryTicks: 0,
        tickRemainderMs: 34,
        comboLimit: 3,
      },
      dialogueOpen: false,
      transitionPending: false,
      enemies: [
        {
          sourceOrder: 17,
          enemyId: 24,
          tileX: 18,
          tileY: 34,
          pixelX: 288,
          pixelY: 544,
          hp: 43,
          state: 'alive',
          behaviorType: 0,
          behaviorTiming: [2, 7],
          animationStateIndex: 2,
          animationDirection: 1,
          animationFrameIndex: 2,
          attackCooldownTicksRemaining: 14,
          actionDelayTicksRemaining: 2,
          pursuitRetargetProgress: 0,
          pursuitTarget: 'player',
          attackAnimationTicksRemaining: 3,
          attackHitResolved: false,
          sourceRenderedOnScreen: true,
        },
        {
          sourceOrder: 12,
          enemyId: 21,
          tileX: 12,
          tileY: 22,
          pixelX: 196,
          pixelY: 352,
          hp: 90,
          state: 'alive',
          behaviorType: 1,
          behaviorTiming: [3, 4],
          animationStateIndex: 1,
          animationDirection: 3,
          animationFrameIndex: 4,
          attackCooldownTicksRemaining: 3,
          actionDelayTicksRemaining: 1,
          pursuitRetargetProgress: 2,
          pursuitTarget: 'action',
          attackAnimationTicksRemaining: null,
          attackHitResolved: null,
          sourceRenderedOnScreen: false,
        },
      ],
      npcs: [
        {
          sourceOrder: 9,
          npcId: 24,
          tileX: 1,
          tileY: 2,
          pixelX: 16,
          pixelY: 32,
          direction: 1,
          visible: false,
          moving: false,
          occupiesCells: false,
        },
        {
          sourceOrder: 4,
          npcId: 16,
          tileX: 2,
          tileY: 6,
          pixelX: 36,
          pixelY: 96,
          direction: 2,
          visible: true,
          moving: true,
          occupiesCells: false,
        },
      ],
    };

    expect(JSON.parse(serializeCampaignTestRuntimeSnapshot(snapshot))).toEqual({
      format: 'heroes-lore-campaign-test-runtime-v7',
      profile: 'max-level',
      mapId: 27,
      mapSize: { width: 64, height: 64 },
      entityOccupiedCells: [
        { tileX: 4, tileY: 5 },
        { tileX: 8, tileY: 12 },
      ],
      player: { tileX: 17, tileY: 33, direction: 4 },
      resources: { hp: 394392, maxHp: 394392, sp: 394392, maxSp: 394392, level: 99 },
      wallet: 1234,
      inventory: [
        { category: 7, itemId: 2, count: 3 },
        {
          category: 0,
          itemId: 5,
          count: 1,
          equipmentState: {
            sourceFlag: false,
            upgradeByte: 1,
            bonusValues: [2, 0, -1, 0],
            subtypeBytes: [3, -4, 5],
          },
        },
      ],
      equipment: [
        {
          category: 0,
          itemId: 0,
          count: 1,
          equipmentState: {
            sourceFlag: true,
            upgradeByte: 0,
            bonusValues: [0, 0, 0, 0],
            subtypeBytes: [1, 2, 3],
          },
        },
        null,
        null,
        null,
        null,
      ],
      groundDrops: [
        { kind: 'item', id: 8, category: 0, itemId: 5, count: 1, tileX: 18, tileY: 34, ticksRemaining: 91 },
        { kind: 'currency', id: 9, sourceAmount: 12, tileX: 17, tileY: 34, ticksRemaining: 90 },
      ],
      gameFlags: [3, 54, 87],
      questFlags: [1, 4],
      skillAction: {
        skillId: 2,
        skillRank: 1,
        skillExperience: 35,
        skillLevelSlotOne: 0,
        skillLevelSlotThree: null,
        defenseBoostTicksRemaining: 0,
        phase: 3,
        levelSlot: 0,
        tileX: 18,
        tileY: 33,
        effectAge: 4,
        chargeTicksRemaining: [56, 270, 220],
      },
      combo: {
        stage: 1,
        frame: 2,
        activeStyle: 'light',
        queuedStyle: 'heavy',
        recoveryTicks: 0,
        tickRemainderMs: 34,
        comboLimit: 3,
      },
      dialogueOpen: false,
      transitionPending: false,
      enemies: [
        {
          sourceOrder: 12,
          enemyId: 21,
          tileX: 12,
          tileY: 22,
          pixelX: 196,
          pixelY: 352,
          hp: 90,
          state: 'alive',
          behaviorType: 1,
          behaviorTiming: [3, 4],
          animationStateIndex: 1,
          animationDirection: 3,
          animationFrameIndex: 4,
          attackCooldownTicksRemaining: 3,
          actionDelayTicksRemaining: 1,
          pursuitRetargetProgress: 2,
          pursuitTarget: 'action',
          attackAnimationTicksRemaining: null,
          attackHitResolved: null,
          sourceRenderedOnScreen: false,
        },
        {
          sourceOrder: 17,
          enemyId: 24,
          tileX: 18,
          tileY: 34,
          pixelX: 288,
          pixelY: 544,
          hp: 43,
          state: 'alive',
          behaviorType: 0,
          behaviorTiming: [2, 7],
          animationStateIndex: 2,
          animationDirection: 1,
          animationFrameIndex: 2,
          attackCooldownTicksRemaining: 14,
          actionDelayTicksRemaining: 2,
          pursuitRetargetProgress: 0,
          pursuitTarget: 'player',
          attackAnimationTicksRemaining: 3,
          attackHitResolved: false,
          sourceRenderedOnScreen: true,
        },
      ],
      npcs: [
        {
          sourceOrder: 4,
          npcId: 16,
          tileX: 2,
          tileY: 6,
          pixelX: 36,
          pixelY: 96,
          direction: 2,
          visible: true,
          moving: true,
          occupiesCells: false,
        },
        {
          sourceOrder: 9,
          npcId: 24,
          tileX: 1,
          tileY: 2,
          pixelX: 16,
          pixelY: 32,
          direction: 1,
          visible: false,
          moving: false,
          occupiesCells: false,
        },
      ],
    });
  });
});
