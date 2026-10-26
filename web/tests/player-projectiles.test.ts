import { describe, expect, it } from 'vitest';
import {
  advanceSourceClassEightProjectileTick,
  beginSourceClassEightProjectile,
} from '../src/world/player-projectiles';
import type { BasicAttackProfile } from '../src/world/combat';

const attackProfile: BasicAttackProfile = {
  power: 41,
  attackElement: 2,
  dexterity: 12,
  evasionBonus: 3,
  skillAdjustment: 5,
  criticalChance: 20,
  criticalDamageBonusTenths: 15,
};

describe('source class-8 heavy projectiles', () => {
  it.each([
    [2, 0],
    [3, 1],
    [4, 2],
  ] as const)('combo stage %i selects effect row %i', (stage, row) => {
    expect(beginSourceClassEightProjectile(
      1, 4, 5, 4, stage, attackProfile, true,
    )).toMatchObject({ effectRow: row, tileX: 5, tileY: 5, remainingSegments: 2 });
  });

  it('checks the current cell at frame 1, then continues into two more segments', () => {
    const first = beginSourceClassEightProjectile(7, 2, 2, 2, 3, attackProfile, true, 6);
    const firstFrame = advanceSourceClassEightProjectileTick(first, 8, 8, 8);
    expect(firstFrame).toMatchObject({
      projectile: { tileX: 2, tileY: 3, gameplayFramePhase: 1 },
      hitCell: undefined,
      spawned: undefined,
    });

    const impactFrame = advanceSourceClassEightProjectileTick(firstFrame.projectile!, 8, 8, 8);
    expect(impactFrame).toMatchObject({
      projectile: { tileX: 2, tileY: 3, gameplayFramePhase: 2 },
      hitCell: { tileX: 2, tileY: 3 },
      spawned: undefined,
    });

    const nextSegment = advanceSourceClassEightProjectileTick(impactFrame.projectile!, 8, 8, 8);
    expect(nextSegment).toMatchObject({
      projectile: undefined,
      spawned: {
        id: 8,
        tileX: 2,
        tileY: 4,
        effectRow: 1,
        remainingSegments: 1,
        gameplayFramePhase: 0,
        attackProfile,
        critical: true,
        procCode: 6,
      },
    });
    const finalSegment = advanceSourceClassEightProjectileTick(nextSegment.spawned!, 8, 8, 9);
    const terminalFrame = advanceSourceClassEightProjectileTick(finalSegment.projectile!, 8, 8, 9);
    const chainEnd = advanceSourceClassEightProjectileTick(terminalFrame.projectile!, 8, 8, 9);
    expect(terminalFrame.hitCell).toEqual({ tileX: 2, tileY: 4 });
    expect(chainEnd.spawned).toMatchObject({
      id: 9,
      tileX: 2,
      tileY: 5,
      remainingSegments: 0,
    });
  });

  it('ends a chain when the next segment would leave the map', () => {
    const projectile = beginSourceClassEightProjectile(1, 3, 0, 1, 2, attackProfile, false);
    const atFrame1 = advanceSourceClassEightProjectileTick(projectile, 4, 4, 2).projectile!;
    const atFrame2 = advanceSourceClassEightProjectileTick(atFrame1, 4, 4, 2).projectile!;
    expect(advanceSourceClassEightProjectileTick(atFrame2, 4, 4, 2)).toEqual({
      projectile: undefined,
      spawned: undefined,
      hitCell: undefined,
    });
  });
});
