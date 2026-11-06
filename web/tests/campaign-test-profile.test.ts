import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import { advancePlayerRecoveryTick } from '../src/world/player-recovery';
import {
  applyCampaignTestHud,
  applyMaxLevelCampaignTestHud,
  campaignTestMapPreviewMapId,
  campaignTestMapPreviewSpawnTile,
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
  MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO,
  MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO,
  MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO,
  MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO,
  MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO,
  MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO,
  MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO,
  MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO,
  MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO,
  MAP80_CLASS6_SKILL0_LEVEL2_AURA_TEST_SCENARIO,
  MAP80_CLASS6_SKILL1_LEVEL2_RECOVERY_TEST_SCENARIO,
  MAP80_CLASS6_SKILL2_LEVEL2_CLEANSE_TEST_SCENARIO,
  MAP80_CLASS6_SKILL4_LEVEL2_RESTORE_TEST_SCENARIO,
  MAP80_REFINER_ORB_TEST_SCENARIO,
  MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO,
  MAP80_BLACKSMITH_IDENTIFY_DIRECT_TEST_SCENARIO,
  MAP0_WALKING_RECOVERY_TEST_SCENARIO,
  MAP76_EQUIPMENT_REWARD_TEST_SCENARIO,
  MAP76_EQUIPMENT_RECOVERY_BOUNDARY_TEST_SCENARIO,
  MAP15_BOSS_DEATH_TEST_SCENARIO,
  MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO,
  MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO,
  MAP11_BOSS_AI_LIVE_TEST_SCENARIO,
  MAP13_AQ_AI_LIVE_TEST_SCENARIO,
  MAP60_INVESTIGATION_TEST_SCENARIO,
  MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO,
  MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO,
  MAP54_TO_MAP13_CHAIN_TEST_SCENARIO,
  MAX_LEVEL_CAMPAIGN_TEST_PROFILE,
  resolveCampaignTestRecoveryAttributes,
  restoreCampaignTestVitals,
  serializeCampaignTestEnemyProjectileSnapshot,
  serializeCampaignTestEnemyStatusSnapshot,
  serializeCampaignTestRuntimeSnapshot,
  type CampaignTestEnemyProjectile,
  type CampaignTestRuntimeSnapshot,
} from '../src/world/campaign-test-profile';
import { experienceRequiredForLevel } from '../src/world/progression';

describe('max-level campaign test profile', () => {
  it('serializes active projectile effect frames and render components in stable source order', () => {
    const projectiles = JSON.parse(serializeCampaignTestEnemyProjectileSnapshot([
      {
        id: 8,
        sourceOrder: 4,
        spriteId: 256,
        direction: 4,
        tileX: 12,
        tileY: 9,
        frameIndex: 3,
        remainingSegments: 8,
        hitResolved: false,
        sourceResource: 'boss/atef/32',
        effectFrameCount: 7,
        renderedComponentCount: 1,
      },
      {
        id: 5,
        sourceOrder: 4,
        spriteId: 256,
        direction: 1,
        tileX: 10,
        tileY: 7,
        frameIndex: 2,
        remainingSegments: 8,
        hitResolved: false,
        sourceResource: 'boss/atef/32',
        effectFrameCount: 7,
        renderedComponentCount: 1,
      },
      {
        id: 3,
        sourceOrder: 1,
        spriteId: 22,
        direction: 2,
        tileX: 3,
        tileY: 4,
        frameIndex: 1,
        remainingSegments: 2,
        hitResolved: true,
        sourceResource: 'enm/atef/22',
        effectFrameCount: 2,
        renderedComponentCount: 0,
      },
    ])) as CampaignTestEnemyProjectile[];
    expect(projectiles.map(({ id, sourceOrder, frameIndex, renderedComponentCount, sourceResource, effectFrameCount }) => ({
      id, sourceOrder, frameIndex, renderedComponentCount, sourceResource, effectFrameCount,
    }))).toEqual([
      { id: 3, sourceOrder: 1, frameIndex: 1, renderedComponentCount: 0, sourceResource: 'enm/atef/22', effectFrameCount: 2 },
      { id: 5, sourceOrder: 4, frameIndex: 2, renderedComponentCount: 1, sourceResource: 'boss/atef/32', effectFrameCount: 7 },
      { id: 8, sourceOrder: 4, frameIndex: 3, renderedComponentCount: 1, sourceResource: 'boss/atef/32', effectFrameCount: 7 },
    ]);
  });

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
    expect(isCampaignTestScenario(MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO)).toBe(27);
    expect(campaignTestMapPreviewSpawnTile(MAP27_WEAPON_PROC_STATUS_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 31,
    });
    expect(isCampaignTestScenario(MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO)).toBe(27);
    expect(campaignTestMapPreviewSpawnTile(MAP27_WEAPON_PROC_STATUS_SLOW_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 31,
    });
    expect(isCampaignTestScenario(MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO)).toBe(27);
    expect(campaignTestMapPreviewSpawnTile(MAP27_WEAPON_PROC_STATUS_DEFENSE_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 31,
    });
    expect(isCampaignTestScenario(MAP2_CLASS6_SKILL5_ELEMENT3_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO)).toBe(2);
    expect(campaignTestMapPreviewSpawnTile(MAP2_CLASS6_SKILL3_LEVEL2_ELEMENT3_MISMATCH_TEST_SCENARIO)).toEqual({
      tileX: 8,
      tileY: 27,
    });
    expect(isCampaignTestScenario(MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_CLASS6_SKILL1_LEVEL2_RECOVERY_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_CLASS6_SKILL0_LEVEL2_AURA_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_CLASS6_SKILL2_LEVEL2_CLEANSE_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_CLASS6_SKILL4_LEVEL2_RESTORE_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO)).toBe(17);
    expect(campaignTestMapPreviewMapId(MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO)).toBe(17);
    expect(campaignTestMapPreviewMapId(MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO)).toBe(17);
    expect(campaignTestMapPreviewMapId(MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO)).toBe(17);
    expect(campaignTestMapPreviewSpawnTile(MAP17_CLASS6_SKILL3_LEVEL2_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 11,
    });
    expect(campaignTestMapPreviewSpawnTile(MAP17_CLASS6_SKILL0_LEVEL1_COMBO_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 11,
    });
    expect(campaignTestMapPreviewSpawnTile(MAP17_CLASS6_SKILL0_LEVEL2_COUNTER_CONTROLLED_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 11,
    });
    expect(campaignTestMapPreviewSpawnTile(MAP17_CLASS6_SKILL4_LEVEL1_IMMUNITY_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 11,
    });
    expect(isCampaignTestScenario(MAP80_REFINER_ORB_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_BLACKSMITH_IDENTIFY_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP80_BLACKSMITH_IDENTIFY_DIRECT_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP0_WALKING_RECOVERY_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP0_WALKING_RECOVERY_TEST_SCENARIO)).toBe(0);
    expect(campaignTestMapPreviewSpawnTile(MAP0_WALKING_RECOVERY_TEST_SCENARIO)).toEqual({
      tileX: 6,
      tileY: 22,
    });
    expect(isCampaignTestScenario(MAP76_EQUIPMENT_REWARD_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP76_EQUIPMENT_RECOVERY_BOUNDARY_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP15_BOSS_DEATH_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO)).toBe(11);
    expect(campaignTestMapPreviewSpawnTile(MAP11_BOSS_DEATH_FALLBACK_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 9,
    });
    expect(isCampaignTestScenario(MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO)).toBe(11);
    expect(campaignTestMapPreviewSpawnTile(MAP11_BOSS_DEATH_FALLBACK_CONTROLLED_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 9,
    });
    expect(isCampaignTestScenario(MAP11_BOSS_AI_LIVE_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP11_BOSS_AI_LIVE_TEST_SCENARIO)).toBe(11);
    expect(campaignTestMapPreviewSpawnTile(MAP11_BOSS_AI_LIVE_TEST_SCENARIO)).toEqual({
      tileX: 9,
      tileY: 9,
    });
    expect(isCampaignTestScenario(MAP13_AQ_AI_LIVE_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP13_AQ_AI_LIVE_TEST_SCENARIO)).toBe(13);
    expect(campaignTestMapPreviewSpawnTile(MAP13_AQ_AI_LIVE_TEST_SCENARIO)).toEqual({
      tileX: 10,
      tileY: 10,
    });
    expect(isCampaignTestScenario(MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO)).toBe(true);
    expect(isCampaignTestScenario(MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO)).toBe(54);
    expect(campaignTestMapPreviewSpawnTile(MAP54_CURRENT_CELL_EXIT_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 13,
    });
    expect(isCampaignTestScenario(MAP54_TO_MAP13_CHAIN_TEST_SCENARIO)).toBe(true);
    expect(campaignTestMapPreviewMapId(MAP54_TO_MAP13_CHAIN_TEST_SCENARIO)).toBe(54);
    expect(campaignTestMapPreviewSpawnTile(MAP54_TO_MAP13_CHAIN_TEST_SCENARIO)).toEqual({
      tileX: 5,
      tileY: 13,
    });
    expect(campaignTestMapPreviewMapId(MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO)).toBe(53);
    expect(campaignTestMapPreviewSpawnTile(MAP53_BLUEBRICK_CHAIN_TEST_SCENARIO)).toEqual({
      tileX: 19,
      tileY: 38,
    });
    expect(campaignTestMapPreviewSpawnTile('map-preview-53')).toBeNull();
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
        recoveryBoostTicksRemaining: 0,
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
      format: 'heroes-lore-campaign-test-runtime-v9',
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
        recoveryBoostTicksRemaining: 0,
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

    const bossSnapshot = JSON.parse(serializeCampaignTestRuntimeSnapshot({
      ...snapshot,
      mapId: 15,
      enemies: [{
        ...snapshot.enemies[0]!,
        enemyId: 39,
        state: 'death-pending',
        sourceAu: true,
        renderSpriteId: 39,
        renderAnimationStateIndex: 2,
        deathUpdatesRemaining: 24,
        animationFrameIndex: 3,
      }],
    })) as { enemies: Array<Record<string, unknown>> };
    expect(bossSnapshot.enemies[0]).toMatchObject({
      enemyId: 39,
      state: 'death-pending',
      sourceAu: true,
      renderSpriteId: 39,
      renderAnimationStateIndex: 2,
      deathUpdatesRemaining: 24,
      animationFrameIndex: 3,
    });
  });

  it('serializes active enemy statuses in source order for browser verification', () => {
    const statuses = JSON.parse(serializeCampaignTestEnemyStatusSnapshot([
      { sourceOrder: 12, sourceStatusEffects: [{ id: 3, ticksElapsed: 7 }] },
      { sourceOrder: 4, sourceStatusEffects: [{ id: 0, ticksElapsed: 11 }] },
      { sourceOrder: 8, sourceStatusEffects: [] },
    ]));

    expect(statuses).toEqual([
      { sourceOrder: 4, effects: [{ id: 0, ticksElapsed: 11 }] },
      { sourceOrder: 12, effects: [{ id: 3, ticksElapsed: 7 }] },
    ]);
  });
});
