import { describe, expect, it } from 'vitest';
import type { EnemySpriteAnimation } from '../src/world/enemy-sprites';
import {
  advanceNpcSpriteFrame,
  advanceNpcSpriteFrames,
  adaptEnemyAnimationForNpc,
  findNpcSpriteAnimation,
  findNpcSpriteTrack,
  isNpcWithinSourceViewport,
  npcSpriteFrameAt,
  parseNpcSpriteAnimationCatalog,
  resolveNpcSpriteRenderPlacements,
  sourceEnemySpriteIdForNpc,
  sourceNpcTextureSource,
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
  it('uses the source enemy-backed idle and walk tracks for special map NPCs', () => {
    const tracks: EnemySpriteAnimation['tracks'] = [];
    for (const stateIndex of [0, 1, 2] as const) {
      for (const directionIndex of [0, 1, 2, 3] as const) {
        tracks.push({
          stateIndex,
          directionIndex,
          frameCount: 1,
          frames: [[{ offsetX: stateIndex, offsetY: 0, mirrored: false, imageIndex: directionIndex }]],
        });
      }
    }
    const adapted = adaptEnemyAnimationForNpc(3, { spriteId: 17, tracks });

    expect(sourceEnemySpriteIdForNpc(3)).toBe(17);
    expect(sourceEnemySpriteIdForNpc(6)).toBe(20);
    expect(sourceEnemySpriteIdForNpc(5)).toBeUndefined();
    expect(adapted.npcId).toBe(3);
    expect(adapted.tracks).toHaveLength(8);
    expect(adapted.tracks.every(({ stateIndex }) => stateIndex < 2)).toBe(true);
    expect(adapted.tracks.find(({ stateIndex, directionIndex }) =>
      stateIndex === 1 && directionIndex === 2)?.frames[0]).toEqual([
      { offsetX: 1, offsetY: 0, mirrored: false, imageIndex: 2 },
    ]);
  });

  it('resolves the source atlas for animated, enemy-backed, and static NPC image codes', () => {
    expect(sourceNpcTextureSource(5, true)).toEqual({
      kind: 'animated',
      atlasDirectory: '/assets/generated/atlases/npc/05',
    });
    expect(sourceNpcTextureSource(3, true)).toEqual({
      kind: 'animated',
      atlasDirectory: '/assets/generated/atlases/enm/17',
    });
    expect(sourceNpcTextureSource(6, true)).toEqual({
      kind: 'animated',
      atlasDirectory: '/assets/generated/atlases/enm/20',
    });
    expect(sourceNpcTextureSource(20, false)).toEqual({
      kind: 'static',
      imagePath: '/assets/generated/atlases/npc/all/002.png',
    });
    expect(sourceNpcTextureSource(16, false)).toEqual({
      kind: 'static',
      imagePath: '/assets/generated/atlases/npc/16/000.png',
    });
    expect(sourceNpcTextureSource(17, false)).toBeUndefined();
    expect(sourceNpcTextureSource(-1, true)).toBeUndefined();
  });

  it('retains initially hidden NPCs as revealable render placements', () => {
    const placements = [
      { tileX: 4, tileY: 5, imageId: 20, sourceOrder: 0 },
      { tileX: 6, tileY: 7, imageId: 16, sourceOrder: 1 },
    ];

    expect(resolveNpcSpriteRenderPlacements(placements, new Set([1]))).toEqual([
      { placement: placements[0], visible: false },
      { placement: placements[1], visible: true },
    ]);
  });

  it('uses the source draw bounds before advancing an NPC frame', () => {
    const viewport = { x: 100, y: 50, width: 240, height: 320 };
    expect(isNpcWithinSourceViewport({ x: 84, y: 50 }, viewport)).toBe(true);
    expect(isNpcWithinSourceViewport({ x: 84 - 1, y: 50 }, viewport)).toBe(false);
    expect(isNpcWithinSourceViewport({ x: 100 + 240 + 16, y: 50 + 320 + 32 }, viewport)).toBe(true);
    expect(isNpcWithinSourceViewport({ x: 100 + 240 + 17, y: 100 }, viewport)).toBe(false);
    expect(isNpcWithinSourceViewport({ x: 150, y: 49 }, viewport)).toBe(false);
    expect(isNpcWithinSourceViewport({ x: 150, y: 50 + 320 + 33 }, viewport)).toBe(false);
  });

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
    expect(npcSpriteFrameAt(walking, -1)).toEqual(walking.frames[0]);
    expect(advanceNpcSpriteFrame(-1, walking)).toBe(0);
    expect(advanceNpcSpriteFrame(0, walking)).toBe(1);
    expect(advanceNpcSpriteFrame(1, walking)).toBe(0);
  });

  it('advances the source draw cursor once for each paced gameplay paint', () => {
    const parsed = parseNpcSpriteAnimationCatalog(catalog());
    const walking = findNpcSpriteTrack(findNpcSpriteAnimation(parsed, 16)!, 1, 3);
    const idle = findNpcSpriteTrack(findNpcSpriteAnimation(parsed, 16)!, 0, 3);

    expect(advanceNpcSpriteFrames(0, walking, 0)).toBe(0);
    expect(advanceNpcSpriteFrames(0, walking, 1)).toBe(1);
    expect(advanceNpcSpriteFrames(0, walking, 2)).toBe(0);
    expect(advanceNpcSpriteFrames(0, walking, 3)).toBe(1);
    expect(advanceNpcSpriteFrames(0, walking, Number.MAX_SAFE_INTEGER)).toBe(1);
    expect(advanceNpcSpriteFrames(-1, idle, 1)).toBe(0);
    expect(advanceNpcSpriteFrames(0, idle, 120)).toBe(0);
    expect(() => advanceNpcSpriteFrames(0, walking, -1)).toThrow(/source paint pass count/);
    expect(() => advanceNpcSpriteFrames(0, walking, 1.5)).toThrow(/source paint pass count/);
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
