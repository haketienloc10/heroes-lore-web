/** Source `av(3)` uses the same image for eleven paint frames. */
export const SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT = 11;
/** Source `av(4)` advances for nine player paint frames. */
export const SOURCE_PLAYER_LEVEL_UP_ATLAS_FRAME_COUNT = 9;

export interface PlayerLevelUpEffectComponent {
  offsetX: number;
  offsetY: number;
  sourceAtlasFlag: boolean;
  sourceAtlasId: 13 | -1;
  imageIndex: number;
}

export interface PlayerLevelUpEffect {
  frameCount: number;
  frames: PlayerLevelUpEffectComponent[][];
}

export interface SourcePlayerLevelUpAtlasAnimation {
  /** The frame that will be drawn on the next source paint. */
  frameIndex: number;
  /** Paints accumulated before this effect was created. */
  pendingPaintPassesBeforeBirth: number;
}

export interface SourcePlayerLevelUpFlash {
  /** The frame that will be drawn on the next source paint. */
  frameIndex: number;
  /** Paints accumulated before this effect was created. */
  pendingPaintPassesBeforeBirth: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse the optional converter output for source effect type 4. */
export function parsePlayerLevelUpEffectCatalog(value: unknown): PlayerLevelUpEffect {
  if (!isRecord(value) || value.format !== 'heroes-lore-player-level-up-effect-catalog-v1' ||
    value.effectCount !== 1 || !Array.isArray(value.effects) || value.effects.length !== 1) {
    throw new TypeError('Unsupported player level-up effect catalog');
  }
  const effect = value.effects[0];
  if (!isRecord(effect) || effect.format !== 'heroes-lore-player-level-up-effect-v1' ||
    effect.effectType !== 4 || effect.sourceResource !== 'char/lvup.eif' ||
    effect.sourceAtlas !== 'char/lvup' || effect.sourceAtlasId !== 13 ||
    !Number.isInteger(effect.frameCount) || (effect.frameCount as number) < 1 ||
    !Array.isArray(effect.frames) || effect.frames.length !== effect.frameCount) {
    throw new TypeError('Invalid player level-up effect data');
  }
  const frames = effect.frames.map((frame) => {
    if (!Array.isArray(frame)) throw new TypeError('Invalid player level-up effect frame');
    return frame.map((component): PlayerLevelUpEffectComponent => {
      if (!isRecord(component) || !Number.isInteger(component.offsetX) ||
        (component.offsetX as number) < -128 || (component.offsetX as number) > 127 ||
        !Number.isInteger(component.offsetY) ||
        (component.offsetY as number) < -128 || (component.offsetY as number) > 127 ||
        typeof component.sourceAtlasFlag !== 'boolean' ||
        (component.sourceAtlasId !== 13 && component.sourceAtlasId !== -1) ||
        component.sourceAtlasId !== (component.sourceAtlasFlag ? -1 : 13) ||
        !Number.isInteger(component.imageIndex) ||
        (component.imageIndex as number) < 0 || (component.imageIndex as number) > 255) {
        throw new TypeError('Invalid player level-up effect component');
      }
      return {
        offsetX: component.offsetX as number,
        offsetY: component.offsetY as number,
        sourceAtlasFlag: component.sourceAtlasFlag,
        sourceAtlasId: component.sourceAtlasId,
        imageIndex: component.imageIndex as number,
      };
    });
  });
  return { frameCount: effect.frameCount as number, frames };
}

export function createSourcePlayerLevelUpAtlasAnimation(
  pendingPaintPassesBeforeBirth = 0,
): SourcePlayerLevelUpAtlasAnimation {
  if (!Number.isSafeInteger(pendingPaintPassesBeforeBirth) || pendingPaintPassesBeforeBirth < 0) {
    throw new RangeError('Pre-birth paint pass count must be a non-negative safe integer');
  }
  return { frameIndex: 0, pendingPaintPassesBeforeBirth };
}

/** Advance source effect type 4 after drawing, for its nine-frame lifetime. */
export function advanceSourcePlayerLevelUpAtlasAnimation(
  animation: SourcePlayerLevelUpAtlasAnimation,
  sourcePaintPasses: number,
  playerPainted = true,
): SourcePlayerLevelUpAtlasAnimation | null {
  if (!Number.isInteger(animation.frameIndex) || animation.frameIndex < 0 ||
    animation.frameIndex >= SOURCE_PLAYER_LEVEL_UP_ATLAS_FRAME_COUNT) {
    throw new RangeError('Level-up atlas frame index is outside the source animation');
  }
  if (!Number.isSafeInteger(animation.pendingPaintPassesBeforeBirth) ||
    animation.pendingPaintPassesBeforeBirth < 0 ||
    !Number.isSafeInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('Level-up atlas paint pass count must be a non-negative safe integer');
  }
  const preBirthPasses = Math.min(sourcePaintPasses, animation.pendingPaintPassesBeforeBirth);
  const pendingPaintPassesBeforeBirth = animation.pendingPaintPassesBeforeBirth - preBirthPasses;
  const effectPasses = playerPainted ? sourcePaintPasses - preBirthPasses : 0;
  const frameIndex = animation.frameIndex + effectPasses;
  if (frameIndex >= SOURCE_PLAYER_LEVEL_UP_ATLAS_FRAME_COUNT) return null;
  return { frameIndex, pendingPaintPassesBeforeBirth };
}

export function createSourcePlayerLevelUpFlash(
  pendingPaintPassesBeforeBirth = 0,
): SourcePlayerLevelUpFlash {
  if (!Number.isSafeInteger(pendingPaintPassesBeforeBirth) || pendingPaintPassesBeforeBirth < 0) {
    throw new RangeError('Pre-birth paint pass count must be a non-negative safe integer');
  }
  return { frameIndex: 0, pendingPaintPassesBeforeBirth };
}

/** `av(3)` draws on frames 0–2, 4–6, and 8–10. */
export function sourcePlayerLevelUpFlashIsVisible(frameIndex: number): boolean {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 ||
    frameIndex >= SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT) {
    return false;
  }
  return frameIndex % 4 < 3;
}

/** Advance after drawing, matching `av.a(Graphics,...)`'s post-draw cursor increment. */
export function advanceSourcePlayerLevelUpFlash(
  flash: SourcePlayerLevelUpFlash,
  sourcePaintPasses: number,
  playerPainted = true,
): SourcePlayerLevelUpFlash | null {
  if (!Number.isInteger(flash.frameIndex) || flash.frameIndex < 0 ||
    flash.frameIndex >= SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT) {
    throw new RangeError('Level-up flash frame index is outside the source animation');
  }
  if (!Number.isSafeInteger(flash.pendingPaintPassesBeforeBirth) ||
    flash.pendingPaintPassesBeforeBirth < 0) {
    throw new RangeError('Pre-birth paint pass count must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('Source paint pass count must be a non-negative safe integer');
  }

  const preBirthPasses = Math.min(sourcePaintPasses, flash.pendingPaintPassesBeforeBirth);
  const pendingPaintPassesBeforeBirth = flash.pendingPaintPassesBeforeBirth - preBirthPasses;
  const effectPasses = playerPainted ? sourcePaintPasses - preBirthPasses : 0;
  const frameIndex = flash.frameIndex + effectPasses;
  if (frameIndex >= SOURCE_PLAYER_LEVEL_UP_FLASH_FRAME_COUNT) return null;
  return { frameIndex, pendingPaintPassesBeforeBirth };
}
