import { describe, expect, it } from 'vitest';
import {
  advanceEnemyAttackEffect,
  advanceEnemyProjectileTick,
  beginEnemyProjectile,
  findEnemyAttackEffect,
  parseEnemyAttackEffectCatalog,
} from '../src/world/enemy-attacks';

const catalogFixture = {
  format: 'heroes-lore-enemy-attack-effect-catalog-v1',
  effectCount: 1,
  effects: [{
    format: 'heroes-lore-enemy-attack-effect-v1',
    spriteId: 3,
    sourceResource: 'enm/atef/03',
    frameCount: 2,
    frames: [
      [{ offsetX: -16, offsetY: -16, mirrored: false, imageIndex: 2 }],
      [{ offsetX: -23, offsetY: -14, mirrored: false, imageIndex: 3 }],
    ],
  }],
};

describe('source enemy attack effect resources', () => {
  it('parses indexed effect tracks and finds the matching enemy sprite', () => {
    const catalog = parseEnemyAttackEffectCatalog(catalogFixture);
    expect(findEnemyAttackEffect(catalog, 3)).toMatchObject({
      spriteId: 3,
      frameCount: 2,
      frames: [
        [{ offsetX: -16, offsetY: -16, imageIndex: 2 }],
        [{ offsetX: -23, offsetY: -14, imageIndex: 3 }],
      ],
    });
    expect(findEnemyAttackEffect(catalog, 4)).toBeUndefined();
  });

  it('rejects a catalog whose per-frame data does not match its resource ID', () => {
    expect(() => parseEnemyAttackEffectCatalog({
      ...catalogFixture,
      effects: [{ ...catalogFixture.effects[0], sourceResource: 'enm/atef/04' }],
    })).toThrow(TypeError);
  });

  it('advances the source type-9 effect and removes it after its last frame', () => {
    const animation = { id: 1, spriteId: 3, tileX: 5, tileY: 8, frameIndex: 0 };
    expect(advanceEnemyAttackEffect(animation, 2)).toMatchObject({ frameIndex: 1 });
    expect(advanceEnemyAttackEffect({ ...animation, frameIndex: 1 }, 2)).toBeUndefined();
  });
});

describe('source enemy projectile segments', () => {
  it('begins one tile ahead and damages only the occupied projectile cell', () => {
    let projectile = beginEnemyProjectile(10, 4, 3, 5, 5, 2);
    expect(projectile).toMatchObject({ tileX: 5, tileY: 6, frameIndex: 0, remainingSegments: 2 });
    let result = advanceEnemyProjectileTick(projectile, 2, 5, 8, 12, 12);
    projectile = result.projectile!;
    result = advanceEnemyProjectileTick(projectile, 2, 5, 6, 12, 12);
    expect(result).toMatchObject({ projectile: undefined, spawned: undefined, hitPlayer: true });
  });

  it('resolves one hit and keeps longer effect streams alive without repeat damage', () => {
    let projectile = beginEnemyProjectile(10, 4, 3, 5, 5, 2);
    projectile = advanceEnemyProjectileTick(projectile, 4, -1, -1, 12, 12).projectile!;
    const hit = advanceEnemyProjectileTick(projectile, 4, 5, 6, 12, 12);
    expect(hit).toMatchObject({ hitPlayer: true, projectile: { hitResolved: true, frameIndex: 2 } });
    const next = advanceEnemyProjectileTick(hit.projectile!, 4, 5, 6, 12, 12);
    expect(next).toMatchObject({
      hitPlayer: false,
      spawned: undefined,
      projectile: { hitResolved: true, frameIndex: 3 },
    });
  });

  it('creates at most three tile segments and ends at map bounds', () => {
    let projectile = beginEnemyProjectile(20, 4, 3, 5, 5, 4);
    let nextId = 21;
    const spawned: Array<{ tileX: number; remainingSegments: number }> = [];
    for (let tick = 0; tick < 6 && projectile !== undefined; tick += 1) {
      const result = advanceEnemyProjectileTick(
        projectile, 2, -1, -1, 12, 12, nextId,
      );
      projectile = result.projectile!;
      if (result.spawned !== undefined) {
        spawned.push({ tileX: result.spawned.tileX, remainingSegments: result.spawned.remainingSegments });
        nextId += 1;
        projectile ??= result.spawned;
      }
    }
    expect(spawned).toEqual([
      { tileX: 7, remainingSegments: 1 },
      { tileX: 8, remainingSegments: 0 },
    ]);

    const edge = beginEnemyProjectile(30, 4, 3, 6, 5, 4);
    let atEdge = advanceEnemyProjectileTick(edge, 2, -1, -1, 8, 12).projectile!;
    atEdge = advanceEnemyProjectileTick(atEdge, 2, -1, -1, 8, 12).projectile!;
    expect(advanceEnemyProjectileTick(atEdge, 2, -1, -1, 8, 12).spawned).toBeUndefined();
  });
});
