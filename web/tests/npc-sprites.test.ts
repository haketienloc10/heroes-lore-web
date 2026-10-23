import { describe, expect, it } from 'vitest';
import {
  advanceNpcSpriteFrame,
  findNpcSpriteAnimation,
  findNpcSpriteTrack,
  npcSpriteFrameAt,
  parseNpcSpriteAnimationCatalog,
} from '../src/world/npc-sprites';

function catalog(): unknown {
  const tracks = [];
  for (const stateIndex of [0, 1]) {
    for (let directionIndex = 0; directionIndex < 4; directionIndex += 1) {
      const frames = stateIndex === 0
        ? [[{ offsetX: -8, offsetY: -22, mirrored: false, imageIndex: directionIndex }]]
        : [
          [{ offsetX: -8, offsetY: -22, mirrored: false, imageIndex: 4 }],
          [{ offsetX: -7, offsetY: -21, mirrored: true, imageIndex: 5 }],
        ];
      tracks.push({
        stateIndex,
        directionIndex,
        frameCount: frames.length,
        frames,
      });
    }
  }
  return {
    format: 'heroes-lore-npc-animation-catalog-v1',
    spriteCount: 1,
    sprites: [{
      format: 'heroes-lore-npc-animation-v1',
      npcId: 16,
      sourceResource: 'npc/spr/16',
      trackCount: 8,
      tracks,
    }],
  };
}

describe('NPC sprite animation data', () => {
  it('parses the source two-state, four-direction tracks and resolves animation frames', () => {
    const parsed = parseNpcSpriteAnimationCatalog(catalog());
    const animation = findNpcSpriteAnimation(parsed, 16)!;
    const idle = findNpcSpriteTrack(animation, 0, 4);
    const walking = findNpcSpriteTrack(animation, 1, 3);

    expect(parsed.sprites).toHaveLength(1);
    expect(idle.frames[0][0].imageIndex).toBe(3);
    expect(npcSpriteFrameAt(walking, 1)).toEqual([
      { offsetX: -7, offsetY: -21, mirrored: true, imageIndex: 5 },
    ]);
    expect(advanceNpcSpriteFrame(0, walking)).toBe(1);
    expect(advanceNpcSpriteFrame(1, walking)).toBe(0);
  });

  it('rejects missing directions, inconsistent directional frame counts, and invalid image indices', () => {
    const missingDirection = catalog() as { sprites: Array<{ tracks: unknown[] }> };
    missingDirection.sprites[0].tracks.pop();
    expect(() => parseNpcSpriteAnimationCatalog(missingDirection)).toThrow(/invalid/);

    const inconsistent = catalog() as { sprites: Array<{ tracks: Array<{ frameCount: number; frames: unknown[] }> }> };
    inconsistent.sprites[0].tracks[1].frameCount = 2;
    inconsistent.sprites[0].tracks[1].frames = [[], []];
    expect(() => parseNpcSpriteAnimationCatalog(inconsistent)).toThrow(/inconsistent/);

    const invalidImage = catalog() as { sprites: Array<{ tracks: Array<{ frames: Array<Array<Record<string, unknown>>> }> }> };
    invalidImage.sprites[0].tracks[0].frames[0][0].imageIndex = 255;
    expect(() => parseNpcSpriteAnimationCatalog(invalidImage)).toThrow(/component/);
  });
});
