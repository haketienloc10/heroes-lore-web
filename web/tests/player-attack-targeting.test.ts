import { describe, expect, it } from 'vitest';
import { createEnemyCombatants, parseEnemyDataTable } from '../src/world/combat';
import {
  selectPlayerAttackTargets,
  sourceClassSixLungeDistance,
} from '../src/world/player-attack-targeting';

function enemyTable() {
  return parseEnemyDataTable({
    format: 'heroes-lore-enemy-data-v1',
    variant: 0,
    records: Array.from({ length: 43 }, (_, index) => ({
      index,
      labelToken: '580',
      baseCode: 1,
      packedAttributes: {
        classCode: index === 26 ? 2 : 0,
        shapeCode: 0,
        elementCode: 0,
        variantCode: 0,
      },
      statusFlags: { bit3: false },
      maxHp: 40,
      attack: 8,
      defense: 3,
      evasion: 0,
      behaviorCodes: [3, 11, 10],
      respawnDelay: 300,
      dropCandidates: [[7, 0, 25]],
    })),
  });
}

function targets(tiles: Array<[number, number, number]>) {
  return createEnemyCombatants(tiles.map(([tileX, tileY, enemyId], sourceOrder) => ({
    tileX,
    tileY,
    enemyId,
    sourceOrder,
  })), enemyTable());
}

describe('source player combo target patterns', () => {
  it('uses the class-6 light follow-up fan in source query order', () => {
    const enemies = targets([[6, 5, 24], [6, 4, 24], [6, 6, 24]]);
    const selected = selectPlayerAttackTargets(
      enemies, 5, 5, 4, 6, { stage: 1, style: 'light', frame: 1 },
    );
    expect(selected.map(({ tileX, tileY }) => [tileX, tileY])).toEqual([[6, 5], [6, 4], [6, 6]]);
  });

  it('checks two forward cells for class-7 attacks and preserves repeated wide targets', () => {
    const enemies = targets([[4, 5, 26]]);
    const selected = selectPlayerAttackTargets(
      enemies, 3, 5, 4, 7, { stage: 0, style: 'heavy', frame: 1 },
    );
    expect(selected.map(({ sourceOrder }) => sourceOrder)).toEqual([0, 0]);
  });

  it('sweeps all eight surrounding source cells on class-6 heavy stage five', () => {
    const enemies = targets([
      [3, 4, 24], [3, 6, 24], [2, 5, 24], [4, 5, 24],
      [2, 4, 24], [4, 4, 24], [2, 6, 24], [4, 6, 24],
    ]);
    const selected = selectPlayerAttackTargets(
      enemies, 3, 5, 4, 6, { stage: 4, style: 'heavy', frame: 1 },
    );
    expect(selected.map(({ sourceOrder }) => sourceOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('uses the source two-cell lunge when the next collision value is zero', () => {
    const collision = {
      format: 'heroes-lore-base-collision-v1' as const,
      width: 8,
      height: 8,
      tileSize: 16 as const,
      values: Array.from({ length: 8 }, () => Array(8).fill(1)),
      passabilityRule: 'non-negative is passable',
    };
    collision.values[3][3] = 0;
    expect(sourceClassSixLungeDistance(collision, new Set(), 2, 3, 4)).toBe(2);
  });

  it('falls back to a one-cell lunge when the source two-cell destination is occupied', () => {
    const collision = {
      format: 'heroes-lore-base-collision-v1' as const,
      width: 8,
      height: 8,
      tileSize: 16 as const,
      values: Array.from({ length: 8 }, () => Array(8).fill(1)),
      passabilityRule: 'non-negative is passable',
    };
    collision.values[3][3] = 0;
    expect(sourceClassSixLungeDistance(collision, new Set([3 * 8 + 4]), 2, 3, 4)).toBe(1);
    collision.values[3][3] = -1;
    expect(sourceClassSixLungeDistance(collision, new Set(), 2, 3, 4)).toBe(0);
  });
});
