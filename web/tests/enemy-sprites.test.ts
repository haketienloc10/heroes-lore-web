import { describe, expect, it } from 'vitest';
import {
  advanceEnemySpriteFrame,
  enemySpriteFrameAt,
  findEnemySpriteAnimation,
  findEnemySpriteTrack,
  parseEnemySpriteAnimationCatalog,
} from '../src/world/enemy-sprites';

function catalog(): unknown {
  const tracks = [];
  for (let stateIndex = 0; stateIndex < 3; stateIndex += 1) {
    for (let directionIndex = 0; directionIndex < 4; directionIndex += 1) {
      const frames = stateIndex === 0
        ? directionIndex === 1 ? [
          [{ offsetX: -7, offsetY: -12, mirrored: false, imageIndex: 3 }],
          [{ offsetX: 5, offsetY: -2, mirrored: true, imageIndex: 0 }],
        ] : [[], []]
        : [[]];
      tracks.push({ stateIndex, directionIndex, frameCount: frames.length, frames });
    }
  }
  return {
    format: 'heroes-lore-enemy-animation-catalog-v1',
    spriteCount: 1,
    sprites: [{
      format: 'heroes-lore-enemy-animation-v1',
      spriteId: 24,
      sourceResource: 'enm/spr/24',
      trackCount: 12,
      tracks,
    }],
  };
}

describe('enemy sprite animations', () => {
  it('parses source draw entries and selects the matching state and direction', () => {
    const parsed = parseEnemySpriteAnimationCatalog(catalog());
    const animation = findEnemySpriteAnimation(parsed, 24);
    expect(animation).toBeDefined();
    if (animation === undefined) return;

    const southIdle = findEnemySpriteTrack(animation, 0, 2);
    expect(southIdle.frameCount).toBe(2);
    expect(enemySpriteFrameAt(southIdle, 0)).toEqual([
      { offsetX: -7, offsetY: -12, mirrored: false, imageIndex: 3 },
    ]);
    expect(enemySpriteFrameAt(southIdle, 3)).toEqual([
      { offsetX: 5, offsetY: -2, mirrored: true, imageIndex: 0 },
    ]);
    expect(advanceEnemySpriteFrame(0, southIdle)).toBe(1);
    expect(advanceEnemySpriteFrame(1, southIdle)).toBe(0);
  });

  it('rejects duplicate or incomplete direction tracks and invalid components', () => {
    const duplicate = catalog() as {
      sprites: Array<{ tracks: unknown[] }>;
    };
    duplicate.sprites[0].tracks[11] = duplicate.sprites[0].tracks[0];
    expect(() => parseEnemySpriteAnimationCatalog(duplicate)).toThrow(/duplicate tracks/);

    const invalid = catalog() as {
      sprites: Array<{ tracks: Array<{ frames: Array<Array<Record<string, unknown>>> }> }>;
    };
    invalid.sprites[0].tracks[0].frames[0] = [
      { offsetX: 128, offsetY: 0, mirrored: false, imageIndex: 0 },
    ];
    expect(() => parseEnemySpriteAnimationCatalog(invalid)).toThrow(/component/);

    const mismatchedCounts = catalog() as {
      sprites: Array<{ tracks: Array<{ frameCount: number; frames: unknown[] }> }>;
    };
    mismatchedCounts.sprites[0].tracks[4].frameCount = 2;
    mismatchedCounts.sprites[0].tracks[4].frames = [[], []];
    expect(() => parseEnemySpriteAnimationCatalog(mismatchedCounts)).toThrow(/inconsistent facing/);
  });
});
