import { describe, expect, it } from 'vitest';
import type { EnemyCombatant } from '../src/world/combat';
import {
  advanceEnemyRespawnCadence,
  findEnemyRespawnPlacement,
  type EnemyRespawnContext,
  type InclusiveIntegerRandom,
} from '../src/world/enemy-lifecycle';
import type { BaseCollisionData } from '../src/world/map-data';

function enemy(classCode = 0): EnemyCombatant {
  return {
    sourceOrder: 1,
    enemyId: 24,
    tileX: 4,
    tileY: 4,
    pixelX: 64,
    pixelY: 64,
    provoked: false,
    definition: {
      index: 24,
      labelToken: '580',
      experienceRewardCode: 1,
      classCode,
      shapeCode: 0,
      behaviorType: 0,
      acquisitionRange: 2,
      behaviorTiming: [7, 10],
      extendedProvokedRange: false,
      elementCode: 0,
      maxHp: 43,
      attack: 9,
      defense: 5,
      evasion: 6,
      respawnDelay: 300,
      dropCandidates: [],
    },
    hp: 0,
    state: 'respawn-wait',
    deathUpdatesRemaining: 0,
    respawnDelayRemaining: 0,
  };
}

function context(
  width = 10,
  height = 10,
  blocked: ReadonlySet<number> = new Set(),
  playerTileX = -1,
  playerTileY = -1,
): EnemyRespawnContext {
  const collision: BaseCollisionData = {
    format: 'heroes-lore-base-collision-v1',
    width,
    height,
    tileSize: 16,
    values: Array.from({ length: height }, () => Array<number>(width).fill(0)),
    passabilityRule: 'base value >= 0',
  };
  return { collision, occupiedCellIndices: blocked, playerTileX, playerTileY };
}

function sequence(values: number[]): InclusiveIntegerRandom {
  let index = 0;
  return (minimum, maximum) => {
    expect(values[index]).toBeGreaterThanOrEqual(minimum);
    expect(values[index]).toBeLessThanOrEqual(maximum);
    return values[index++];
  };
}

describe('source enemy respawn scheduling and placement', () => {
  it('advances queued timers on the seventeenth map update', () => {
    let cadence = 17;
    for (let tick = 0; tick < 16; tick += 1) {
      const step = advanceEnemyRespawnCadence(cadence);
      expect(step.shouldAdvanceTimers).toBe(false);
      cadence = step.ticksRemaining;
    }
    expect(advanceEnemyRespawnCadence(cadence)).toEqual({
      ticksRemaining: 17,
      shouldAdvanceTimers: true,
    });
  });

  it('uses a valid initial random offset without advancing to another candidate', () => {
    expect(findEnemyRespawnPlacement(
      enemy(), context(), sequence([-2, 1]),
    )).toEqual({ tileX: 2, tileY: 5 });
  });

  it('walks cumulatively to a later candidate when the initial cell is occupied', () => {
    const blocked = new Set([4 * 10 + 4]);
    expect(findEnemyRespawnPlacement(
      enemy(), context(10, 10, blocked), sequence([0, 0, 1, 0]),
    )).toEqual({ tileX: 5, tileY: 4 });
  });

  it('tries five source candidates and reports a failed placement for later retry', () => {
    const blocked = new Set<number>();
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) blocked.add(y * 10 + x);
    }
    const values = Array<number>(12).fill(0);
    expect(findEnemyRespawnPlacement(
      enemy(), context(10, 10, blocked), sequence(values),
    )).toBeUndefined();
    expect(values).toHaveLength(12);
  });

  it('keeps a two-cell enemy out of a blocked footprint or the player cell', () => {
    const twoWide = enemy(2);
    const blocked = new Set([4 * 10 + 5]);
    expect(findEnemyRespawnPlacement(
      twoWide, context(10, 10, blocked), sequence([0, 0, 1, 0, 1, 0]),
    )).toEqual({ tileX: 6, tileY: 4 });

    expect(findEnemyRespawnPlacement(
      twoWide, context(10, 10, new Set(), 5, 4), sequence([0, 0, -1, 0]),
    )).toEqual({ tileX: 3, tileY: 4 });
  });

  it('uses the source left-edge fallback for a two-cell enemy queued at the right boundary', () => {
    const twoWide = { ...enemy(2), tileX: 9 };
    expect(findEnemyRespawnPlacement(twoWide, context(), () => {
      throw new Error('The source edge fallback does not randomize');
    })).toEqual({ tileX: 8, tileY: 4 });
  });

  it('rejects invalid cadence state and out-of-range random values', () => {
    expect(() => advanceEnemyRespawnCadence(0)).toThrow(RangeError);
    expect(() => findEnemyRespawnPlacement(enemy(), context(), () => 4)).toThrow(RangeError);
  });
});
