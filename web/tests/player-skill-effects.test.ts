import { describe, expect, it } from 'vitest';
import {
  findPlayerSkillEffect,
  findPlayerSkillSpecialEffect,
  parsePlayerSkillEffectCatalog,
  playerSkillEffectFrameComponents,
  playerSkillEffectFrameCount,
} from '../src/world/player-skill-effects';

function effect(skillId: number, levelSlot: number, sourceResource: string) {
  return {
    format: 'heroes-lore-player-skill-effect-v1',
    skillId,
    levelSlot,
    atlasFamily: ['fi', 'wa', 'gr', 'fi', 'wa', 'gr'][skillId],
    sourceResource,
    frameCount: 1,
    frames: [[{ offsetX: -2, offsetY: 3, sourceAtlasFlag: 0, imageIndex: 8 }]],
  };
}

describe('player skill source effects', () => {
  it('validates source streams and the skill-specific element atlas', () => {
    const guardEffect = {
      ...effect(4, 1, 'grd/spr/4_1.eif'),
      frameCount: 6,
      frames: [
        [{ offsetX: -7, offsetY: -12, sourceAtlasFlag: 0, imageIndex: 4 }],
        [
          { offsetX: -10, offsetY: -9, sourceAtlasFlag: 0, imageIndex: 4 },
          { offsetX: -4, offsetY: -11, sourceAtlasFlag: 0, imageIndex: 4 },
        ],
        [
          { offsetX: -7, offsetY: -7, sourceAtlasFlag: 0, imageIndex: 4 },
          { offsetX: -1, offsetY: -9, sourceAtlasFlag: 0, imageIndex: 4 },
        ],
        [
          { offsetX: -12, offsetY: -8, sourceAtlasFlag: 0, imageIndex: 4 },
          { offsetX: -6, offsetY: -8, sourceAtlasFlag: 0, imageIndex: 4 },
        ],
        [{ offsetX: -7, offsetY: -5, sourceAtlasFlag: 0, imageIndex: 4 }],
        [],
      ],
    };
    const catalog = parsePlayerSkillEffectCatalog({
      format: 'heroes-lore-player-skill-effect-catalog-v1',
      effectCount: 2,
      effects: [
        effect(0, 0, 'grd/spr/0_01.eif'),
        guardEffect,
      ],
      specialEffects: [{
        ...effect(0, 0, 'grd/spr/0_02.eif'),
        format: 'heroes-lore-player-skill-special-effect-v1',
        effectType: 2,
      }],
    });

    expect(findPlayerSkillEffect(catalog, 0, 0)?.frames[0][0]).toEqual({
      offsetX: -2,
      offsetY: 3,
      sourceAtlasFlag: 0,
      imageIndex: 8,
    });
    expect(findPlayerSkillEffect(catalog, 4, 1)?.atlasFamily).toBe('wa');
    expect(playerSkillEffectFrameComponents(catalog, 8, 4, 1, 0)).toEqual([{
      offsetX: -7,
      offsetY: -12,
      sourceAtlasFlag: 0,
      imageIndex: 4,
    }]);
    expect(playerSkillEffectFrameComponents(catalog, 2, 0, 0, 0)).toEqual([{
      offsetX: -2,
      offsetY: 3,
      sourceAtlasFlag: 0,
      imageIndex: 8,
    }]);
    expect(playerSkillEffectFrameComponents(catalog, 8, 4, 1, 5)).toEqual([]);
    expect(playerSkillEffectFrameComponents(catalog, 8, 4, 1, -1)).toEqual([]);
    expect(findPlayerSkillSpecialEffect(catalog, 2)?.frameCount).toBe(1);
    expect(playerSkillEffectFrameCount(4)).toBe(10);
    expect(playerSkillEffectFrameCount(10)).toBe(3);
  });

  it('rejects mismatched resource names, frame tables, and duplicate levels', () => {
    const valid = {
      format: 'heroes-lore-player-skill-effect-catalog-v1',
      effectCount: 1,
      effects: [effect(1, 0, 'grd/spr/1_0.eif')],
      specialEffects: [],
    };
    expect(parsePlayerSkillEffectCatalog(valid).effects).toHaveLength(1);
    expect(() => parsePlayerSkillEffectCatalog({
      ...valid,
      effects: [effect(1, 0, 'grd/spr/4_0.eif')],
    })).toThrow(TypeError);
    expect(() => parsePlayerSkillEffectCatalog({
      ...valid,
      effects: [{ ...effect(1, 0, 'grd/spr/1_0.eif'), frames: [] }],
    })).toThrow(TypeError);
    expect(() => parsePlayerSkillEffectCatalog({
      ...valid,
      effectCount: 2,
      effects: [effect(1, 0, 'grd/spr/1_0.eif'), effect(1, 0, 'grd/spr/1_0.eif')],
    })).toThrow(TypeError);
  });
});
