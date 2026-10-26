import { describe, expect, it } from 'vitest';
import {
  advanceSourcePlayerLevelUpAtlasAnimation,
  advanceSourcePlayerLevelUpFlash,
  createSourcePlayerLevelUpAtlasAnimation,
  createSourcePlayerLevelUpFlash,
  parsePlayerLevelUpEffectCatalog,
  sourcePlayerLevelUpFlashIsVisible,
  SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT,
} from '../src/world/player-level-up-effects';

describe('source player level-up flash', () => {
  it('reproduces the three-visible, one-hidden source frame cycle', () => {
    expect(Array.from({ length: SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT }, (_, frame) =>
      sourcePlayerLevelUpFlashIsVisible(frame))).toEqual([
      true, true, true, false, true, true, true, false, true, true, true,
    ]);
  });

  it('advances after paint and expires after eleven source paints', () => {
    let flash = createSourcePlayerLevelUpFlash();
    expect(flash.frameIndex).toBe(0);
    flash = advanceSourcePlayerLevelUpFlash(flash, 1)!;
    expect(flash.frameIndex).toBe(1);
    flash = advanceSourcePlayerLevelUpFlash(flash, 5)!;
    expect(flash.frameIndex).toBe(6);
    flash = advanceSourcePlayerLevelUpFlash(flash, 4)!;
    expect(flash?.frameIndex).toBe(10);
    expect(sourcePlayerLevelUpFlashIsVisible(flash!.frameIndex)).toBe(true);
    expect(advanceSourcePlayerLevelUpFlash(flash!, 1)).toBeNull();
  });

  it('does not age across paints accumulated before its source birth', () => {
    let flash = createSourcePlayerLevelUpFlash(3);
    flash = advanceSourcePlayerLevelUpFlash(flash, 2)!;
    expect(flash).toEqual({ frameIndex: 0, pendingPaintPassesBeforeBirth: 1 });
    flash = advanceSourcePlayerLevelUpFlash(flash, 2)!;
    expect(flash).toEqual({ frameIndex: 1, pendingPaintPassesBeforeBirth: 0 });
  });

  it('keeps the cursor while the player is not painted and validates counters', () => {
    const flash = createSourcePlayerLevelUpFlash(2);
    expect(advanceSourcePlayerLevelUpFlash(flash, 3, false)).toEqual({
      frameIndex: 0,
      pendingPaintPassesBeforeBirth: 0,
    });
    expect(() => createSourcePlayerLevelUpFlash(-1)).toThrow(RangeError);
    expect(() => advanceSourcePlayerLevelUpFlash(flash, -1)).toThrow(RangeError);
    expect(() => advanceSourcePlayerLevelUpFlash({
      frameIndex: SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT,
      pendingPaintPassesBeforeBirth: 0,
    }, 0)).toThrow(RangeError);
  });

  it('advances the atlas effect for nine source paints and respects pre-birth passes', () => {
    let animation = createSourcePlayerLevelUpAtlasAnimation(3);
    animation = advanceSourcePlayerLevelUpAtlasAnimation(animation, 5)!;
    expect(animation).toEqual({ frameIndex: 2, pendingPaintPassesBeforeBirth: 0 });
    animation = advanceSourcePlayerLevelUpAtlasAnimation(animation, 6)!;
    expect(animation.frameIndex).toBe(8);
    expect(advanceSourcePlayerLevelUpAtlasAnimation(animation, 1)).toBeNull();
  });

  it('pauses the atlas effect while the hero is not painted and validates catalog records', () => {
    const animation = createSourcePlayerLevelUpAtlasAnimation(2);
    expect(advanceSourcePlayerLevelUpAtlasAnimation(animation, 4, false)).toEqual({
      frameIndex: 0,
      pendingPaintPassesBeforeBirth: 0,
    });
    expect(() => parsePlayerLevelUpEffectCatalog({
      format: 'heroes-lore-player-level-up-effect-catalog-v1',
      effectCount: 1,
      effects: [{
        format: 'heroes-lore-player-level-up-effect-v1',
        effectType: 4,
        sourceResource: 'char/lvup.eif',
        sourceAtlas: 'char/lvup',
        sourceAtlasId: 13,
        frameCount: 1,
        frames: [[{
          offsetX: -4,
          offsetY: 2,
          sourceAtlasFlag: false,
          sourceAtlasId: 13,
          imageIndex: 3,
        }]],
      }],
    })).not.toThrow();
    expect(() => parsePlayerLevelUpEffectCatalog({
      format: 'heroes-lore-player-level-up-effect-catalog-v1',
      effectCount: 1,
      effects: [],
    })).toThrow(TypeError);
  });
});
