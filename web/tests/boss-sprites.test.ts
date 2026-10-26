import { describe, expect, it } from 'vitest';
import {
  advanceBossSpriteFrame,
  bossSpriteFrameAt,
  findBossSpriteTrack,
  parseBossAttackEffectCatalog,
  parseBossSpriteAnimationCatalog,
  sourceBossDeathSpriteState,
} from '../src/world/boss-sprites';

function catalog(): unknown {
  const tracks = [
    {
      stateIndex: 0,
      directionIndex: 1,
      frameCount: 2,
      frames: [
        [{ offsetX: -7, offsetY: -12, mirrored: false, imageIndex: 3 }],
        [{ offsetX: 5, offsetY: -2, mirrored: true, imageIndex: 0 }],
      ],
    },
    {
      stateIndex: 4,
      directionIndex: 1,
      frameCount: 1,
      frames: [[{ offsetX: 0, offsetY: -4, mirrored: false, imageIndex: 7 }]],
    },
  ];
  return {
    format: 'heroes-lore-boss-animation-catalog-v1',
    spriteCount: 1,
    sprites: [{
      format: 'heroes-lore-boss-animation-v1',
      bossId: 1,
      enemyId: 32,
      sourceResource: 'boss/spr/1_32',
      trackCount: tracks.length,
      tracks,
    }],
  };
}

describe('boss sprite animations', () => {
  it('parses sparse tracks and selects source attack states by direction', () => {
    const parsed = parseBossSpriteAnimationCatalog(catalog());
    const animation = parsed.sprites[0];
    expect(animation.tracks).toHaveLength(2);

    const eastPatternTwo = findBossSpriteTrack(animation, 4, 2);
    expect(bossSpriteFrameAt(eastPatternTwo, 1)).toEqual([
      { offsetX: 0, offsetY: -4, mirrored: false, imageIndex: 7 },
    ]);
    expect(advanceBossSpriteFrame(0, eastPatternTwo)).toBe(0);
    expect(findBossSpriteTrack(animation, 0, 2).frameCount).toBe(2);
    expect(() => findBossSpriteTrack(animation, 3, 2)).toThrow(/missing track/);
  });

  it('selects the source death track when present and falls back to idle per facing', () => {
    const animation = parseBossSpriteAnimationCatalog(catalog()).sprites[0];
    expect(sourceBossDeathSpriteState(animation, 2)).toBe(0);

    const withNorthDeathTrack = {
      ...animation,
      tracks: [...animation.tracks, {
        stateIndex: 2 as const,
        directionIndex: 0 as const,
        frameCount: 2,
        frames: [[], []],
      }],
    };
    expect(sourceBossDeathSpriteState(withNorthDeathTrack, 1)).toBe(2);
    expect(sourceBossDeathSpriteState(withNorthDeathTrack, 2)).toBe(0);
  });

  it('parses the matching source boss projectile stream and rejects wrong owners', () => {
    const parsed = parseBossAttackEffectCatalog({
      format: 'heroes-lore-boss-attack-effect-catalog-v1',
      effectCount: 1,
      effects: [{
        format: 'heroes-lore-boss-attack-effect-v1',
        bossId: 2,
        enemyId: 36,
        spriteId: 36,
        sourceResource: 'boss/atef/36',
        frameCount: 1,
        frames: [[{ offsetX: -2, offsetY: -8, mirrored: true, imageIndex: 4 }]],
      }],
    });
    expect(parsed.effects[0]).toMatchObject({ bossId: 2, enemyId: 36, frameCount: 1 });
    expect(parsed.effects[0].frames[0][0].imageIndex).toBe(4);

    expect(() => parseBossAttackEffectCatalog({
      format: 'heroes-lore-boss-attack-effect-catalog-v1',
      effectCount: 1,
      effects: [{
        format: 'heroes-lore-boss-attack-effect-v1',
        bossId: 1,
        enemyId: 36,
        spriteId: 36,
        sourceResource: 'boss/atef/36',
        frameCount: 1,
        frames: [[]],
      }],
    })).toThrow(/owner/);
  });

  it('rejects duplicate tracks and invalid component image indexes', () => {
    const duplicate = catalog() as {
      sprites: Array<{ tracks: unknown[] }>;
    };
    duplicate.sprites[0].tracks[1] = duplicate.sprites[0].tracks[0];
    expect(() => parseBossSpriteAnimationCatalog(duplicate)).toThrow(/duplicate tracks/);

    const invalid = catalog() as {
      sprites: Array<{ tracks: Array<{ frames: Array<Array<Record<string, unknown>>> }> }>;
    };
    invalid.sprites[0].tracks[0].frames[0] = [
      { offsetX: 0, offsetY: 0, mirrored: false, imageIndex: 255 },
    ];
    expect(() => parseBossSpriteAnimationCatalog(invalid)).toThrow(/component/);
  });
});
