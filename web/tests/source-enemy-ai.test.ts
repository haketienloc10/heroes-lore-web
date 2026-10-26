import { describe, expect, it } from 'vitest';
import { createEnemyCombatants, parseEnemyDataTable } from '../src/world/combat';
import type { EnemyCombatant } from '../src/world/combat';
import {
  advanceMap11CbAiTick,
  advanceMap13AqAiTick,
  advanceMap13GroupAiTick,
  advanceMap15AttackerAiTick,
  advanceMap15HazardAiTick,
  resetMap13AqActionWhileBlocked,
  resetMap13GroupActionWhileBlocked,
  resetMap15ActionWhileBlocked,
  sourceMap13AfDeathEffectSpawns,
  sourceCustomEnemyActionContinuesWhileBlocked,
} from '../src/world/source-enemy-ai';
import type { BaseCollisionData } from '../src/world/map-data';

const table = parseEnemyDataTable({
  format: 'heroes-lore-enemy-data-v1',
  variant: 0,
  records: Array.from({ length: 43 }, (_, index) => ({
    index,
    labelToken: '588',
    baseCode: 25,
    packedAttributes: {
      classCode: [32, 35, 36, 37, 38].includes(index) ? 1 : 0,
      shapeCode: [32, 35, 36, 37, 38].includes(index) ? 2 : 0,
      elementCode: index === 32 ? 1 : 0,
      variantCode: [32, 35, 36].includes(index) ? 3 : 0,
    },
    statusFlags: { bit3: [35, 36, 37, 38].includes(index) },
    maxHp: index === 32 ? 1960 : (({ 35: 4050, 36: 4250, 37: 2200, 38: 1600 } as Record<number, number>)[index] ?? 43),
    attack: index === 32 ? 99 : (({ 35: 110, 36: 110, 37: 100, 38: 1 } as Record<number, number>)[index] ?? 9),
    defense: index === 32 ? 34 : (({ 35: 40, 36: 40, 37: 30, 38: 20 } as Record<number, number>)[index] ?? 5),
    evasion: index === 32 ? 30 : [35, 36, 37, 38].includes(index) ? 40 : 6,
    behaviorCodes: ({
      35: [5, 7, 10],
      36: [5, 7, 10],
      37: [5, 7, 6],
      38: [5, 7, 18],
    } as Record<number, [number, number, number]>)[index] ?? [5, 4, 6],
    respawnDelay: 40,
    dropCandidates: [],
  })),
});

function bossAt(tileX = 5, tileY = 5): EnemyCombatant {
  return createEnemyCombatants([{
    tileX,
    tileY,
    enemyId: 32,
    sourceOrder: 0,
    spriteId: 0,
    sourceBehavior: 'map11-cb',
    deathUpdatesBeforeRemoval: 24,
    directTypeZeroMarkerOnRemoval: 1,
  }], table)[0];
}

function aqAt(tileX = 9, tileY = 5): EnemyCombatant {
  return createEnemyCombatants([{
    tileX,
    tileY,
    enemyId: 35,
    sourceOrder: 1,
    spriteId: 0,
    renderSpriteId: 291,
    sourceBehavior: 'map13-aq',
  }], table)[0];
}

function map13Group(): EnemyCombatant[] {
  return createEnemyCombatants([
    {
      tileX: 9,
      tileY: 5,
      enemyId: 36,
      sourceOrder: 3,
      spriteId: 1,
      sourceBehavior: 'map13-af',
      sourceFootprintWidth: 3,
      sourceGroupId: 'map13-stage-two',
    },
    {
      tileX: 6,
      tileY: 5,
      enemyId: 37,
      sourceOrder: 4,
      spriteId: 2,
      sourceBehavior: 'map13-bc',
      sourceFootprintWidth: 2,
      sourceGroupId: 'map13-stage-two',
    },
    {
      tileX: 13,
      tileY: 5,
      enemyId: 38,
      sourceOrder: 5,
      spriteId: 3,
      sourceBehavior: 'map13-cc',
      sourceFootprintWidth: 2,
      sourceGroupId: 'map13-stage-two',
    },
  ], table);
}

function map15Enemy(sourceBehavior: 'map15-az' | 'map15-aj' | 'map15-cf'): EnemyCombatant {
  const enemyId = sourceBehavior === 'map15-cf' ? 39 : sourceBehavior === 'map15-az' ? 40 : 41;
  return createEnemyCombatants([{
    tileX: 8,
    tileY: 8,
    enemyId,
    sourceOrder: 9,
    spriteId: 0,
    sourceBehavior,
    sourceFootprintWidth: sourceBehavior === 'map15-aj' ? 1 : 2,
  }], table)[0];
}

function collision(): BaseCollisionData {
  return {
    format: 'heroes-lore-base-collision-v1',
    width: 16,
    height: 16,
    tileSize: 16,
    values: Array.from({ length: 16 }, () => Array<number>(16).fill(0)),
    passabilityRule: 'non-negative cells are passable',
  };
}

function context(
  playerTileX: number,
  playerTileY: number,
  enemy = bossAt(),
  randomInteger: (minimum: number, maximum: number) => number = (minimum) => minimum,
) {
  return {
    collision: collision(),
    occupiedCellIndices: new Set([
      enemy.tileY * 16 + enemy.tileX,
      playerTileY * 16 + playerTileX,
    ]),
    playerTileX,
    playerTileY,
    randomInteger,
  };
}

describe('map 11 source `cb` behavior', () => {
  it('starts its first type-1 melee pattern at the source cooldown and impact updates', () => {
    let enemy = bossAt();
    let hitPower: number | undefined;
    const aiContext = context(5, 6, enemy);
    for (let update = 0; update < 18; update += 1) {
      const result = advanceMap11CbAiTick(enemy, aiContext);
      enemy = result.enemy;
      hitPower = result.immediateHitPower ?? hitPower;
    }

    expect(hitPower).toBe(99);
    expect(enemy.sourceCbAi).toMatchObject({ state: 3, attackType: 1, tick: 11 });
  });

  it('emits the four cardinal attacks on pattern 2 update 7', () => {
    const enemy = bossAt();
    enemy.sourceCbAi = {
      ...enemy.sourceCbAi!,
      state: 3,
      tick: 6,
      patternIndex: 2,
      attackType: 2,
    };

    expect(advanceMap11CbAiTick(enemy, context(5, 6, enemy))).toMatchObject({
      projectileDirections: [1, 2, 3, 4],
      enemy: { sourceCbAi: { state: 3, attackType: 2, tick: 7 } },
    });
  });

  it('applies twice the source attack at the pattern-3 close-range frame', () => {
    const enemy = bossAt();
    enemy.sourceCbAi = {
      ...enemy.sourceCbAi!,
      state: 3,
      tick: 3,
      patternIndex: 3,
      attackType: 3,
    };

    expect(advanceMap11CbAiTick(enemy, context(7, 7, enemy))).toMatchObject({
      immediateHitPower: 198,
      enemy: { sourceCbAi: { state: 3, attackType: 3, tick: 4 } },
    });
    expect(advanceMap11CbAiTick(enemy, context(8, 8, enemy)).immediateHitPower).toBeUndefined();
  });

  it('selects the source state-4 and state-5 frame durations as the pattern advances', () => {
    const enemy = bossAt();
    enemy.sourceCbAi = {
      ...enemy.sourceCbAi!,
      state: 3,
      tick: 14,
      patternIndex: 1,
      attackType: 1,
      attackDuration: 15,
    };

    const patternTwo = advanceMap11CbAiTick(enemy, context(5, 6, enemy)).enemy;
    expect(patternTwo.sourceCbAi).toMatchObject({
      state: 1,
      patternIndex: 2,
      attackType: 2,
      attackDuration: 9,
    });

    patternTwo.sourceCbAi = {
      ...patternTwo.sourceCbAi!,
      state: 3,
      tick: 8,
    };
    const patternThree = advanceMap11CbAiTick(patternTwo, context(5, 6, patternTwo)).enemy;
    expect(patternThree.sourceCbAi).toMatchObject({
      state: 1,
      patternIndex: 3,
      attackType: 3,
      attackDuration: 12,
    });
  });

  it('uses the source bounded random cell ranges for its state-2 relocation', () => {
    const enemy = bossAt();
    enemy.sourceCbAi = { ...enemy.sourceCbAi!, state: 2, tick: 4 };
    const draws: Array<[number, number]> = [];
    const result = advanceMap11CbAiTick(enemy, context(10, 9, enemy, (minimum, maximum) => {
      draws.push([minimum, maximum]);
      return maximum;
    }));

    expect(draws).toEqual([[5, 11], [5, 10]]);
    expect(result.enemy).toMatchObject({ tileX: 11, tileY: 10, pixelX: 176, pixelY: 160 });
  });
});

describe('map 13 source `aq` behavior', () => {
  it('attacks after the source cooldown when horizontal distance is at most one', () => {
    let enemy = aqAt();
    for (let update = 0; update < 11; update += 1) {
      enemy = advanceMap13AqAiTick(enemy, {
        playerTileX: 10,
        playerTileY: 15,
        rawRandomInteger: () => 1,
      }).enemy;
    }

    expect(enemy).toMatchObject({
      tileX: 9,
      tileY: 5,
      sourceAqAi: { state: 3, tick: 0, facing: 2 },
      animationStateIndex: 2,
      animationDirection: 2,
    });
  });

  it('turns toward a horizontally distant player without moving', () => {
    const enemy = aqAt();
    const result = advanceMap13AqAiTick({
      ...enemy,
      sourceAqAi: { ...enemy.sourceAqAi!, tick: 0, attackDelay: 0, actionDelay: 0 },
    }, {
      playerTileX: 12,
      playerTileY: 5,
      rawRandomInteger: () => 1,
    }).enemy;

    expect(result).toMatchObject({
      tileX: 9,
      tileY: 5,
      sourceAqAi: { state: 2, facing: 4 },
      animationStateIndex: 1,
      animationDirection: 4,
    });
  });

  it('emits three 12-segment attacks from source positions on attack update 2', () => {
    const enemy = aqAt();
    const result = advanceMap13AqAiTick({
      ...enemy,
      sourceAqAi: { ...enemy.sourceAqAi!, state: 3, tick: 1, facing: 2 },
    }, {
      playerTileX: 10,
      playerTileY: 5,
      rawRandomInteger: () => 1,
    });

    expect(result.projectileSpawns).toEqual([
      { tileX: 8, tileY: 5, direction: 2, remainingSegments: 12 },
      { tileX: 10, tileY: 5, direction: 2, remainingSegments: 12 },
      { tileX: 9, tileY: 6, direction: 2, remainingSegments: 12 },
    ]);
  });
});

describe('map 13 linked `af`/`bc`/`cc` behavior', () => {
  it('emits two `af` death particles while the post-decrement timer remains above eight', () => {
    const af = { ...map13Group()[0], state: 'death-pending' as const };
    const draws: Array<[number, number]> = [];
    const values = [-2, 2, 2, -2];
    const randomInteger = (minimum: number, maximum: number): number => {
      draws.push([minimum, maximum]);
      return values[draws.length - 1];
    };

    expect(sourceMap13AfDeathEffectSpawns(af, 9, randomInteger)).toEqual([
      { tileX: 7, tileY: 7 },
      { tileX: 11, tileY: 3 },
    ]);
    expect(draws).toEqual([[-2, 2], [-2, 2], [-2, 2], [-2, 2]]);
    expect(sourceMap13AfDeathEffectSpawns(af, 8, randomInteger)).toEqual([]);
    expect(draws).toHaveLength(4);

    expect(sourceMap13AfDeathEffectSpawns({ ...af, tileX: 127, tileY: -128 }, 9, () => 2)).toEqual([
      { tileX: -127, tileY: -126 },
      { tileX: -127, tileY: -126 },
    ]);
  });

  it('uses the source cooldown and emits all five `af` projectiles at their constructor cells', () => {
    let enemy = map13Group()[0];
    for (let update = 0; update < 11; update += 1) {
      enemy = advanceMap13GroupAiTick(enemy, {
        enemies: [enemy],
        playerTileX: 0,
        playerTileY: 0,
      }).enemy;
    }
    expect(enemy.sourceMap13Ai).toMatchObject({ state: 3, tick: 0, facing: 2 });

    const result = advanceMap13GroupAiTick({
      ...enemy,
      sourceMap13Ai: { ...enemy.sourceMap13Ai!, tick: 1 },
    }, { enemies: [enemy], playerTileX: 0, playerTileY: 0 });
    expect(result.projectileSpawns).toEqual([
      { tileX: 8, tileY: 4, direction: 2, remainingSegments: 12 },
      { tileX: 12, tileY: 4, direction: 2, remainingSegments: 12 },
      { tileX: 9, tileY: 5, direction: 2, remainingSegments: 12 },
      { tileX: 11, tileY: 5, direction: 2, remainingSegments: 12 },
      { tileX: 10, tileY: 6, direction: 2, remainingSegments: 12 },
    ]);
  });

  it.each([0, 2] as const)('interrupts a linked-group attack while status %i is active', (statusId) => {
    const [af, originalBc, cc] = map13Group();
    const bc = {
      ...originalBc,
      sourceMap13Ai: {
        ...originalBc.sourceMap13Ai!,
        state: 3 as const,
        tick: 6,
        supportCycle: 2 as const,
        sampledPlayerTileX: 12,
        sampledPlayerTileY: 7,
      },
      animationStateIndex: 2 as const,
      sourceStatusEffects: [{ id: statusId, ticksElapsed: 0 }],
    };

    const reset = resetMap13GroupActionWhileBlocked(bc);
    expect(reset).toMatchObject({
      animationStateIndex: 0,
      animationFrameIndex: -1,
      sourceMap13Ai: {
        state: 1,
        tick: 0,
        attackCooldown: originalBc.definition.behaviorTiming[1],
        supportCycle: 2,
        sampledPlayerTileX: 12,
        sampledPlayerTileY: 7,
      },
    });

    const resumed = advanceMap13GroupAiTick(reset, {
      enemies: [af, reset, cc],
      playerTileX: 12,
      playerTileY: 7,
    });
    expect(resumed.immediateHitPower).toBeUndefined();
    expect(resumed.effectSpawns).toBeUndefined();
  });

  it('uses the doubled map-13 group cooldown while status 1 overlaps an interruption', () => {
    const [, bc] = map13Group();
    const reset = resetMap13GroupActionWhileBlocked({
      ...bc,
      sourceMap13Ai: { ...bc.sourceMap13Ai!, state: 3, tick: 6 },
      sourceStatusEffects: [
        { id: 1, ticksElapsed: 0 },
        { id: 2, ticksElapsed: 0 },
      ],
    });
    expect(reset.sourceMap13Ai).toMatchObject({
      state: 1,
      tick: 0,
      attackCooldown: bc.definition.behaviorTiming[1] * 2,
    });
    expect(reset.attackCooldownTicksRemaining).toBe(bc.definition.behaviorTiming[1] * 2);
  });

  it('doubles the cooldown when a linked-group attack ends under status 1', () => {
    const [, bc] = map13Group();
    const result = advanceMap13GroupAiTick({
      ...bc,
      sourceMap13Ai: {
        ...bc.sourceMap13Ai!,
        state: 3,
        tick: bc.sourceMap13Ai!.attackFrameCount - 1,
      },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, { enemies: [bc], playerTileX: 0, playerTileY: 0 });
    expect(result.enemy.sourceMap13Ai).toMatchObject({
      state: 1,
      tick: 0,
      attackCooldown: bc.definition.behaviorTiming[1] * 2,
    });
  });

  it('samples the player cell at `bc` frame 4 and strikes it at frame 7 only if unchanged', () => {
    const [af, originalBc, cc] = map13Group();
    const frameFour = advanceMap13GroupAiTick({
      ...originalBc,
      sourceMap13Ai: { ...originalBc.sourceMap13Ai!, state: 3, tick: 3 },
    }, { enemies: [af, originalBc, cc], playerTileX: 12, playerTileY: 5 });
    expect(frameFour).toMatchObject({
      enemy: { sourceMap13Ai: { state: 3, tick: 4, sampledPlayerTileX: 12, sampledPlayerTileY: 5, facing: 2 } },
      effectSpawns: [{ tileX: 12, tileY: 5 }],
    });

    let stationary = frameFour.enemy;
    for (let update = 0; update < 3; update += 1) {
      const result = advanceMap13GroupAiTick(stationary, {
        enemies: [af, stationary, cc],
        playerTileX: 12,
        playerTileY: 5,
      });
      stationary = result.enemy;
      if (update === 2) expect(result.immediateHitPower).toBe(100);
    }

    const moved = advanceMap13GroupAiTick({
      ...frameFour.enemy,
      sourceMap13Ai: { ...frameFour.enemy.sourceMap13Ai!, tick: 6 },
    }, { enemies: [af, originalBc, cc], playerTileX: 12, playerTileY: 6 });
    expect(moved.immediateHitPower).toBeUndefined();
  });

  it('heals the first living member below half health, then uses the source fallback rotation', () => {
    const group = map13Group();
    const [af, bc, cc] = group;
    const damaged = [
      { ...af, hp: 2000 },
      { ...bc, hp: 1000 },
      { ...cc, hp: 700, sourceMap13Ai: { ...cc.sourceMap13Ai!, state: 3 as const, tick: 4 } },
    ];
    const priorityHeal = advanceMap13GroupAiTick(damaged[2], {
      enemies: damaged,
      playerTileX: 0,
      playerTileY: 0,
    });
    expect(priorityHeal.companionUpdate).toMatchObject({ sourceOrder: 3, hp: 2425 });
    expect(priorityHeal.attachedEffectSpawns).toEqual([{ sourceOrder: 3, tileX: 9, tileY: 5 }]);
    expect(priorityHeal.enemy.sourceMap13Ai?.supportCycle).toBe(0);

    const damagedBc = [
      { ...af, hp: 3000 },
      { ...bc, hp: 1000 },
      { ...cc, hp: 700, sourceMap13Ai: { ...cc.sourceMap13Ai!, state: 3 as const, tick: 4 } },
    ];
    const bcPriorityHeal = advanceMap13GroupAiTick(damagedBc[2], {
      enemies: damagedBc,
      playerTileX: 0,
      playerTileY: 0,
    });
    expect(bcPriorityHeal.companionUpdate).toMatchObject({ sourceOrder: 4, hp: 1425 });

    const aboveHalf = [
      { ...af, hp: 3000 },
      { ...bc, hp: 1500 },
      { ...cc, hp: 1000, sourceMap13Ai: {
        ...cc.sourceMap13Ai!, state: 3 as const, tick: 4, supportCycle: 0 as const,
      } },
    ];
    const fallbackHeal = advanceMap13GroupAiTick(aboveHalf[2], {
      enemies: aboveHalf,
      playerTileX: 0,
      playerTileY: 0,
    });
    expect(fallbackHeal.companionUpdate).toMatchObject({ sourceOrder: 3, hp: 3425 });
    expect(fallbackHeal.attachedEffectSpawns).toEqual([{ sourceOrder: 3, tileX: 9, tileY: 5 }]);
    expect(fallbackHeal.enemy.sourceMap13Ai?.supportCycle).toBe(1);

    const selfHeal = advanceMap13GroupAiTick({
      ...aboveHalf[2],
      sourceMap13Ai: { ...aboveHalf[2].sourceMap13Ai!, supportCycle: 2 },
    }, {
      enemies: aboveHalf,
      playerTileX: 0,
      playerTileY: 0,
    });
    expect(selfHeal.enemy.hp).toBe(1425);
    expect(selfHeal.attachedEffectSpawns).toEqual([{ sourceOrder: 5, tileX: 13, tileY: 5 }]);
    expect(selfHeal.enemy.sourceMap13Ai?.supportCycle).toBe(0);
  });

  it('resets AQ to idle under status 0/2 and retains the source action-delay remainder', () => {
    const original = aqAt();
    const reset = resetMap13AqActionWhileBlocked({
      ...original,
      sourceAqAi: {
        ...original.sourceAqAi!,
        state: 3,
        tick: 2,
        turnAccumulation: 4,
      },
      sourceStatusEffects: [
        { id: 0, ticksElapsed: 0 },
        { id: 1, ticksElapsed: 0 },
      ],
    });
    expect(reset.sourceAqAi).toMatchObject({
      state: 1,
      tick: 0,
      attackDelay: original.definition.behaviorTiming[1] * 2,
      actionDelay: original.definition.behaviorTiming[0] + 3,
      turnAccumulation: 0,
    });
    expect(reset.animationStateIndex).toBe(0);
  });

  it('doubles AQ cooldown at attack start and completion while status 1 is active', () => {
    const original = aqAt();
    const status = [{ id: 1 as const, ticksElapsed: 0 }];
    const started = advanceMap13AqAiTick({
      ...original,
      sourceAqAi: { ...original.sourceAqAi!, attackDelay: 0 },
      sourceStatusEffects: status,
    }, { playerTileX: original.tileX + 1, playerTileY: original.tileY, rawRandomInteger: () => 1 });
    expect(started.enemy.sourceAqAi).toMatchObject({
      state: 3,
      attackDelay: original.definition.behaviorTiming[1] * 2 + 1,
    });

    const completed = advanceMap13AqAiTick({
      ...original,
      sourceAqAi: {
        ...original.sourceAqAi!,
        state: 3,
        tick: original.sourceAqAi!.attackFrameCount - 1,
      },
      sourceStatusEffects: status,
    }, { playerTileX: 0, playerTileY: 0, rawRandomInteger: () => 1 });
    expect(completed.enemy.sourceAqAi).toMatchObject({
      state: 1,
      attackDelay: original.definition.behaviorTiming[1] * 2,
    });
  });

  it('resets az/cf custom state when blocked while preserving their source counters', () => {
    const az = map15Enemy('map15-az');
    const azState = az.sourceMap15Ai!;
    if (azState.role !== 'az' && azState.role !== 'aj') throw new Error('Expected an attacker fixture.');
    const resetAz = resetMap15ActionWhileBlocked({
      ...az,
      sourceMap15Ai: {
        ...azState,
        role: 'az',
        state: 3,
        tick: 5,
        turnAccumulation: 4,
        lifetimeTicks: 12,
      },
      sourceStatusEffects: [
        { id: 1, ticksElapsed: 0 },
        { id: 2, ticksElapsed: 0 },
      ],
    });
    expect(resetAz.sourceMap15Ai).toMatchObject({
      role: 'az',
      state: 1,
      tick: 0,
      attackDelay: az.definition.behaviorTiming[1] * 2,
      actionDelay: az.definition.behaviorTiming[0] + 3,
      turnAccumulation: 0,
      lifetimeTicks: 13,
    });

    const cf = map15Enemy('map15-cf');
    const cfState = cf.sourceMap15Ai!;
    if (cfState.role !== 'cf') throw new Error('Expected a hazard fixture.');
    const resetCf = resetMap15ActionWhileBlocked({
      ...cf,
      sourceMap15Ai: { ...cfState, state: 3, tick: 7, hazardRow: 11 },
      sourceStatusEffects: [{ id: 2, ticksElapsed: 0 }],
    });
    expect(resetCf.sourceMap15Ai).toMatchObject({
      role: 'cf',
      state: 1,
      tick: 0,
      attackDelay: cf.definition.behaviorTiming[1],
      actionDelay: cf.definition.behaviorTiming[0] - 1,
      hazardRow: 11,
    });
  });

  it('lets map-11 cb and an active map-15 aj attack pass through the generic status gate', () => {
    const cb = {
      ...bossAt(),
      sourceStatusEffects: [{ id: 2 as const, ticksElapsed: 0 }],
    };
    const ajOriginal = map15Enemy('map15-aj');
    const ajState = ajOriginal.sourceMap15Ai!;
    if (ajState.role !== 'az' && ajState.role !== 'aj') throw new Error('Expected an attacker fixture.');
    const aj = {
      ...ajOriginal,
      sourceMap15Ai: { ...ajState, role: 'aj' as const, state: 3 as const },
      sourceStatusEffects: [{ id: 0 as const, ticksElapsed: 0 }],
    };
    const ajIdle = {
      ...aj,
      sourceMap15Ai: { ...aj.sourceMap15Ai!, state: 1 as const },
    };
    expect(sourceCustomEnemyActionContinuesWhileBlocked(cb)).toBe(true);
    expect(sourceCustomEnemyActionContinuesWhileBlocked(aj)).toBe(true);
    expect(sourceCustomEnemyActionContinuesWhileBlocked(ajIdle)).toBe(false);
  });

  it('doubles custom map-13 and map-15 attack cooldowns when status 1 is active', () => {
    const cb = bossAt();
    const cbStart = advanceMap11CbAiTick({
      ...cb,
      sourceCbAi: { ...cb.sourceCbAi!, attackCooldown: 0 },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, context(5, 5, cb));
    expect(cbStart.enemy.sourceCbAi).toMatchObject({
      state: 3,
      attackCooldown: cb.definition.behaviorTiming[1] * 2 + 1,
    });

    const af = map13Group()[0];
    const groupStart = advanceMap13GroupAiTick({
      ...af,
      sourceMap13Ai: { ...af.sourceMap13Ai!, attackCooldown: 0 },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, { enemies: [af], playerTileX: 0, playerTileY: 0 });
    expect(groupStart.enemy.sourceMap13Ai).toMatchObject({
      state: 3,
      attackCooldown: af.definition.behaviorTiming[1] * 2 + 1,
    });

    const az = map15Enemy('map15-az');
    const azState = az.sourceMap15Ai!;
    if (azState.role !== 'az' && azState.role !== 'aj') throw new Error('Expected an attacker fixture.');
    const azStart = advanceMap15AttackerAiTick({
      ...az,
      sourceMap15Ai: { ...az.sourceMap15Ai!, attackDelay: 0 },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, {
      playerTileX: az.tileX + 1,
      playerTileY: az.tileY - 2,
      rawRandomInteger: () => 1,
      idleFrameCount: 6,
      walkFrameCount: 4,
      attackFrameCountForDirection: () => 7,
    });
    expect(azStart.enemy.sourceMap15Ai).toMatchObject({
      role: 'az',
      state: 3,
      attackDelay: az.definition.behaviorTiming[1] * 2 + 1,
    });

    const azComplete = advanceMap15AttackerAiTick({
      ...az,
      sourceMap15Ai: {
        ...azState,
        role: 'az',
        state: 3,
        tick: 4,
      },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, {
      playerTileX: 0,
      playerTileY: 0,
      rawRandomInteger: () => 1,
      idleFrameCount: 6,
      walkFrameCount: 4,
      attackFrameCountForDirection: () => 5,
    });
    expect(azComplete.enemy.sourceMap15Ai).toMatchObject({
      role: 'az',
      state: 1,
      attackDelay: az.definition.behaviorTiming[1] * 2,
    });

    const cf = map15Enemy('map15-cf');
    const cfStart = advanceMap15HazardAiTick({
      ...cf,
      sourceMap15Ai: { ...cf.sourceMap15Ai!, state: 1, attackDelay: 0 },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, {
      playerTileX: 0,
      playerTileY: 0,
      idleFrameCount: 6,
      walkFrameCount: 4,
      attackFrameCount: 14,
    });
    expect(cfStart.enemy.sourceMap15Ai).toMatchObject({
      role: 'cf',
      state: 3,
      attackDelay: cf.definition.behaviorTiming[1] * 2 + 1,
    });

    const cfComplete = advanceMap15HazardAiTick({
      ...cf,
      sourceMap15Ai: { ...cf.sourceMap15Ai!, state: 3, tick: 13 },
      sourceStatusEffects: [{ id: 1, ticksElapsed: 0 }],
    }, {
      playerTileX: 0,
      playerTileY: 0,
      idleFrameCount: 6,
      walkFrameCount: 4,
      attackFrameCount: 14,
    });
    expect(cfComplete.enemy.sourceMap15Ai).toMatchObject({
      role: 'cf',
      state: 1,
      attackDelay: cf.definition.behaviorTiming[1] * 2,
    });
  });
});
