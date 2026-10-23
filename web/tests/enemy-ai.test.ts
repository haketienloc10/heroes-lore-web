import { describe, expect, it } from 'vitest';
import { createEnemyCombatants, parseEnemyDataTable } from '../src/world/combat';
import type { EnemyCombatant } from '../src/world/combat';
import {
  advanceEnemyBehaviorTick,
  advanceEnemyPursuitTick,
  enemyHasPlayerWithinFacingRange,
} from '../src/world/enemy-ai';
import type { BaseCollisionData } from '../src/world/map-data';

function enemyAt(tileX = 5, tileY = 5): EnemyCombatant {
  const table = parseEnemyDataTable({
    format: 'heroes-lore-enemy-data-v1',
    variant: 0,
    records: Array.from({ length: 43 }, (_, index) => ({
      index,
      labelToken: '580',
      baseCode: 1,
      packedAttributes: { classCode: 0, shapeCode: 0, elementCode: 0, variantCode: 0 },
      statusFlags: { bit3: false },
      maxHp: 43,
      attack: 9,
      defense: 5,
      evasion: 6,
      behaviorCodes: [2, 7, 10],
      respawnDelay: 300,
      dropCandidates: [],
    })),
  });
  return {
    ...createEnemyCombatants([{ tileX, tileY, enemyId: 24, sourceOrder: 1 }], table)[0],
    actionDelayTicksRemaining: 0,
  };
}

function collision(values?: number[][]): BaseCollisionData {
  const cells = values ?? Array.from({ length: 12 }, () => Array<number>(12).fill(0));
  return {
    format: 'heroes-lore-base-collision-v1',
    width: 12,
    height: 12,
    tileSize: 16,
    values: cells,
    passabilityRule: 'non-negative cells are passable',
  };
}

function tick(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
  values?: number[][],
  randomInteger: (minimum: number, maximum: number) => number = (minimum) => minimum,
  rawRandomInteger: () => number = () => -1,
) {
  return advanceEnemyPursuitTick(enemy, {
    collision: collision(values),
    occupiedCellIndices: new Set([enemy.tileY * 12 + enemy.tileX]),
    playerTileX,
    playerTileY,
    randomInteger,
    rawRandomInteger,
  });
}

function behaviorTick(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
  randomInteger = (minimum: number) => minimum,
  values?: number[][],
  rawRandomInteger: () => number = () => -1,
) {
  return advanceEnemyBehaviorTick(enemy, {
    collision: collision(values),
    occupiedCellIndices: new Set([enemy.tileY * 12 + enemy.tileX]),
    playerTileX,
    playerTileY,
    randomInteger,
    rawRandomInteger,
  }, 5);
}

describe('source-derived enemy pursuit locomotion', () => {
  it('uses the definition acquisition range and source state-2 south track while approaching', () => {
    const moved = tick(enemyAt(), 5, 7);
    expect(moved).toMatchObject({
      pixelX: 80,
      pixelY: 88,
      tileX: 5,
      tileY: 5,
      animationStateIndex: 1,
      animationDirection: 2,
    });
  });

  it('finishes the second 8-pixel half-step, then stops at the melee approach range', () => {
    const halfStep = tick(enemyAt(), 5, 7);
    const aligned = tick(halfStep, 5, 7);
    expect(aligned).toMatchObject({ pixelY: 96, tileY: 6, animationStateIndex: 1 });
    expect(tick(aligned, 5, 7)).toMatchObject({
      pixelY: 96,
      tileY: 6,
      animationStateIndex: 0,
      animationDirection: 2,
    });
  });

  it('faces an aligned nearby player without entering the occupied player cell', () => {
    const enemy = enemyAt(5, 6);
    expect(tick(enemy, 5, 7)).toMatchObject({
      tileY: 6,
      pixelY: 96,
      animationStateIndex: 0,
      animationDirection: 2,
    });
  });

  it('respects collision and occupancy when no source path fallback is open', () => {
    const cells = Array.from({ length: 12 }, () => Array<number>(12).fill(-1));
    cells[5][5] = 0;
    const moved = tick(enemyAt(), 5, 7, cells);
    expect(moved).toMatchObject({ pixelX: 80, pixelY: 80, animationStateIndex: 0 });
  });

  it('uses the source extended acquisition range after a successful hit when the flag allows it', () => {
    const enemy = {
      ...enemyAt(),
      provoked: true,
      definition: { ...enemyAt().definition, acquisitionRange: 0, extendedProvokedRange: true },
    };
    expect(tick(enemy, 5, 9)).toMatchObject({ animationStateIndex: 1, animationDirection: 2 });
  });

  it('stops special behavior types at the source three-cell aligned approach threshold', () => {
    const sourceEnemy = enemyAt();
    const enemy = {
      ...sourceEnemy,
      provoked: true,
      definition: { ...sourceEnemy.definition, behaviorType: 2 as const },
    };
    expect(tick(enemy, 5, 8)).toMatchObject({
      tileY: 5,
      pixelY: 80,
      animationStateIndex: 0,
      animationDirection: 2,
    });
  });

  it('uses the positive no-target roll to start movement and choose a facing direction', () => {
    const requestedRanges: Array<[number, number]> = [];
    const rawValues = [1, 7];
    const enemy = enemyAt();

    const moving = tick(enemy, 10, 10, undefined, (minimum, maximum) => {
      requestedRanges.push([minimum, maximum]);
      return minimum;
    }, () => rawValues.shift() ?? -1);

    expect(moving).toMatchObject({
      pixelX: 88,
      pixelY: 80,
      animationStateIndex: 1,
      animationDirection: 4,
      attackCooldownTicksRemaining: enemy.attackCooldownTicksRemaining,
    });
    expect(requestedRanges).toEqual([]);
  });

  it('uses the non-positive no-target roll to idle and randomize the source cooldown', () => {
    const requestedRanges: Array<[number, number]> = [];
    const rawValues = [0, 7];
    const rangeValues = [4];
    const moved = tick(enemyAt(), 10, 10, undefined, (minimum, maximum) => {
      requestedRanges.push([minimum, maximum]);
      return rangeValues.shift() ?? minimum;
    }, () => rawValues.shift() ?? -1);

    expect(moved).toMatchObject({
      pixelX: 80,
      pixelY: 80,
      animationStateIndex: 0,
      animationDirection: 4,
      animationFrameIndex: -1,
      attackCooldownTicksRemaining: 4,
      actionDelayTicksRemaining: 6,
    });
    expect(requestedRanges).toEqual([[1, 7]]);
  });

  it('preserves the movement branch cooldown through the world behavior update', () => {
    const rawValues = [1, 1];
    const moved = behaviorTick(
      enemyAt(),
      10,
      10,
      undefined,
      undefined,
      () => rawValues.shift() ?? -1,
    );

    expect(moved).toMatchObject({
      animationStateIndex: 1,
      animationDirection: 2,
      pixelY: 88,
      attackCooldownTicksRemaining: 10,
    });
  });

  it('ticks the rolled idle cooldown during the world behavior update', () => {
    const cells = Array.from({ length: 12 }, () => Array<number>(12).fill(0));
    cells[5][4] = -1;
    const rawValues = [0, 2];
    const rangeValues = [4];
    const blocked = behaviorTick(
      enemyAt(),
      10,
      10,
      (minimum) => rangeValues.shift() ?? minimum,
      cells,
      () => rawValues.shift() ?? -1,
    );

    expect(blocked).toMatchObject({
      pixelX: 80,
      pixelY: 80,
      animationStateIndex: 0,
      animationDirection: 3,
      attackCooldownTicksRemaining: 3,
      actionDelayTicksRemaining: 6,
    });
  });

  it('faces a blocked random step without changing the attack cooldown', () => {
    const cells = Array.from({ length: 12 }, () => Array<number>(12).fill(0));
    cells[5][6] = -1;
    const rawValues = [1, 7];
    const blocked = tick(
      enemyAt(), 10, 10, cells, undefined, () => rawValues.shift() ?? -1,
    );

    expect(blocked).toMatchObject({
      pixelX: 80,
      pixelY: 80,
      animationStateIndex: 0,
      animationDirection: 4,
      attackCooldownTicksRemaining: 10,
    });
  });

  it('waits through the source action delay before choosing a no-target path', () => {
    const sourceEnemy = { ...enemyAt(), actionDelayTicksRemaining: 2 };
    const requestedRanges: Array<[number, number]> = [];
    const randomInteger = (minimum: number, maximum: number) => {
      requestedRanges.push([minimum, maximum]);
      return maximum;
    };

    const rawValues = [1, 7];
    const firstWait = tick(sourceEnemy, 10, 10, undefined, randomInteger, () => rawValues.shift() ?? -1);
    const secondWait = tick(firstWait, 10, 10, undefined, randomInteger, () => rawValues.shift() ?? -1);
    expect(firstWait).toMatchObject({ animationStateIndex: 0, actionDelayTicksRemaining: 1 });
    expect(secondWait).toMatchObject({ animationStateIndex: 0, actionDelayTicksRemaining: 0 });
    expect(requestedRanges).toEqual([]);
    expect(tick(secondWait, 10, 10, undefined, randomInteger, () => rawValues.shift() ?? -1)
      .animationStateIndex).toBe(1);
  });

  it('uses source retarget rolls at aligned movement boundaries and the two-interval limit', () => {
    const sourceEnemy = {
      ...enemyAt(),
      animationStateIndex: 1 as const,
      pursuitRetargetProgress: 0,
    };
    const continuedValues = [1, 1, 7];
    const continued = tick(sourceEnemy, 10, 10, undefined, undefined, () =>
      continuedValues.shift() ?? -1);
    expect(continued).toMatchObject({
      animationStateIndex: 1,
      pursuitRetargetProgress: 7,
      pixelX: 88,
    });

    const forcedStop = tick({ ...sourceEnemy, pursuitRetargetProgress: 14 }, 10, 10, undefined, undefined, () => {
      throw new Error('source threshold stops without another random draw');
    });
    expect(forcedStop).toMatchObject({
      animationStateIndex: 0,
      pursuitRetargetProgress: 0,
      attackCooldownTicksRemaining: 11,
      actionDelayTicksRemaining: 20,
    });
  });

  it('consumes the source raw path roll before the aligned approach early return', () => {
    let rawDraws = 0;
    const enemy = tick(enemyAt(5, 6), 5, 7, undefined, undefined, () => {
      rawDraws += 1;
      return 0x12345678;
    });
    expect(enemy.animationStateIndex).toBe(0);
    expect(rawDraws).toBe(1);
  });
});

describe('source-derived ordinary enemy melee state', () => {
  it('waits for the initial cooldown and then enters the five-frame attack track', () => {
    let enemy: EnemyCombatant = enemyAt(5, 6);
    for (let update = 0; update < 10; update += 1) {
      enemy = behaviorTick(enemy, 5, 7);
    }
    expect(enemy).toMatchObject({ animationStateIndex: 0, attackCooldownTicksRemaining: 0 });

    const attacking = behaviorTick(enemy, 5, 7);
    expect(attacking).toMatchObject({
      tileX: 5,
      tileY: 6,
      animationStateIndex: 2,
      animationDirection: 2,
      animationFrameIndex: -1,
      attackAnimationTicksRemaining: 5,
      attackCooldownTicksRemaining: 11,
      attackHitResolved: false,
    });
  });

  it('holds position for the attack track duration, then returns to idle', () => {
    let enemy: EnemyCombatant = {
      ...enemyAt(5, 6),
      attackCooldownTicksRemaining: 0,
    };
    enemy = behaviorTick(enemy, 5, 7);
    for (let update = 0; update < 4; update += 1) {
      enemy = behaviorTick(enemy, 5, 7);
      expect(enemy.animationStateIndex).toBe(2);
    }
    enemy = behaviorTick(enemy, 5, 7);
    expect(enemy).toMatchObject({
      tileX: 5,
      tileY: 6,
      animationStateIndex: 0,
      animationFrameIndex: -1,
      attackAnimationTicksRemaining: 0,
    });
  });

  it('starts a type-2 attack when the player is directly ahead within three cells', () => {
    const sourceEnemy = enemyAt();
    const enemy = {
      ...sourceEnemy,
      attackCooldownTicksRemaining: 0,
      definition: { ...sourceEnemy.definition, behaviorType: 2 as const },
    };

    expect(enemyHasPlayerWithinFacingRange(enemy, 5, 8, 3)).toBe(true);
    expect(enemyHasPlayerWithinFacingRange(enemy, 6, 5, 3)).toBe(false);
    expect(behaviorTick(enemy, 5, 8)).toMatchObject({
      animationStateIndex: 2,
      attackAnimationTicksRemaining: 5,
      attackCooldownTicksRemaining: 11,
      attackHitResolved: false,
    });
  });

  it('wanders without an acquired behavior-2 target and starts behavior-3 projectile attacks', () => {
    const sourceEnemy = enemyAt();
    const rangedEnemy = {
      ...sourceEnemy,
      attackCooldownTicksRemaining: 0,
      definition: { ...sourceEnemy.definition, behaviorType: 2 as const },
    };
    const rangedValues = [1, 0];
    expect(behaviorTick(rangedEnemy, 5, 9, undefined, undefined, () =>
      rangedValues.shift() ?? -1)).toMatchObject({
      animationStateIndex: 1,
      animationDirection: 1,
      pixelY: 72,
    });

    const projectileEnemy = {
      ...sourceEnemy,
      attackCooldownTicksRemaining: 0,
      definition: { ...sourceEnemy.definition, behaviorType: 3 as const },
    };
    expect(behaviorTick(projectileEnemy, 5, 8)).toMatchObject({
      animationStateIndex: 2,
      attackAnimationTicksRemaining: 5,
      attackHitResolved: false,
    });
    const projectileValues = [1, 0];
    expect(behaviorTick(projectileEnemy, 5, 9, undefined, undefined, () =>
      projectileValues.shift() ?? -1)
      .animationStateIndex).toBe(1);
  });
});
