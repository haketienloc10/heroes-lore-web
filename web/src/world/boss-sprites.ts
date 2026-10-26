import type { Direction } from './actor';

/** Render-only key for the map-11 `cb` boss animation from `/boss/spr/1_32`. */
export const MAP11_CB_RENDER_SPRITE_ID = 256;
/** Render-only key for the map-13 `aq` boss animation from `/boss/spr/2_35`. */
export const MAP13_AQ_RENDER_SPRITE_ID = 291;
/** Render-only keys for the source-created map-13 second-phase group. */
export const MAP13_AF_RENDER_SPRITE_ID = 292;
export const MAP13_BC_RENDER_SPRITE_ID = 293;
export const MAP13_CC_RENDER_SPRITE_ID = 294;
/** Render-only keys for map-15's source-loaded /boss/spr/3_39–3_41 actors. */
export const MAP15_CF_RENDER_SPRITE_ID = 295;
export const MAP15_AZ_RENDER_SPRITE_ID = 296;
export const MAP15_AJ_RENDER_SPRITE_ID = 297;

export type BossSpriteState = 0 | 1 | 2 | 3 | 4 | 5;

export interface BossSpriteComponent {
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  imageIndex: number;
}

export interface BossSpriteTrack {
  stateIndex: BossSpriteState;
  directionIndex: 0 | 1 | 2 | 3;
  frameCount: number;
  frames: BossSpriteComponent[][];
}

export interface BossSpriteAnimation {
  bossId: number;
  enemyId: number;
  tracks: BossSpriteTrack[];
}

export interface BossSpriteAnimationCatalog {
  sprites: BossSpriteAnimation[];
}

export interface BossAttackEffect {
  bossId: number;
  enemyId: number;
  spriteId: number;
  sourceResource: string;
  frameCount: number;
  frames: BossSpriteComponent[][];
}

export interface BossAttackEffectCatalog {
  effects: BossAttackEffect[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseComponent(value: unknown): BossSpriteComponent {
  if (!isRecord(value) ||
    !isIntegerInRange(value.offsetX, -128, 127) ||
    !isIntegerInRange(value.offsetY, -128, 127) ||
    typeof value.mirrored !== 'boolean' ||
    !isIntegerInRange(value.imageIndex, -1, 254)) {
    throw new TypeError('Boss sprite component is invalid');
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    mirrored: value.mirrored,
    imageIndex: value.imageIndex,
  };
}

function parseTrack(value: unknown, bossId: number, enemyId: number): BossSpriteTrack {
  if (!isRecord(value) ||
    !isIntegerInRange(value.stateIndex, 0, 5) ||
    !isIntegerInRange(value.directionIndex, 0, 3) ||
    !Number.isInteger(value.frameCount) || Number(value.frameCount) < 1 ||
    !Array.isArray(value.frames) || value.frames.length !== value.frameCount ||
    !value.frames.every(Array.isArray)) {
    throw new TypeError(`Boss sprite ${bossId}/${enemyId} animation track is invalid`);
  }
  return {
    stateIndex: value.stateIndex as BossSpriteState,
    directionIndex: value.directionIndex as 0 | 1 | 2 | 3,
    frameCount: Number(value.frameCount),
    frames: value.frames.map((frame) => frame.map(parseComponent)),
  };
}

function parseSprite(value: unknown): BossSpriteAnimation {
  if (!isRecord(value) ||
    value.format !== 'heroes-lore-boss-animation-v1' ||
    !isIntegerInRange(value.bossId, 1, 4) ||
    !isIntegerInRange(value.enemyId, 0, 255) ||
    value.sourceResource !== `boss/spr/${value.bossId}_${value.enemyId}` ||
    !Number.isInteger(value.trackCount) || Number(value.trackCount) < 1 ||
    !Array.isArray(value.tracks) || value.trackCount !== value.tracks.length) {
    throw new TypeError('Boss sprite animation set is invalid');
  }
  const tracks = value.tracks.map((track) =>
    parseTrack(track, value.bossId as number, value.enemyId as number));
  const keys = new Set(tracks.map(({ stateIndex, directionIndex }) => `${stateIndex}:${directionIndex}`));
  if (keys.size !== tracks.length) {
    throw new TypeError(`Boss sprite ${value.bossId}/${value.enemyId} has duplicate tracks`);
  }
  return {
    bossId: value.bossId,
    enemyId: value.enemyId,
    tracks,
  };
}

/** Parse sparse `/boss/spr/BOSS_ENEMY` tracks emitted from the pinned JAR. */
export function parseBossSpriteAnimationCatalog(value: unknown): BossSpriteAnimationCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-boss-animation-catalog-v1' ||
    !Number.isInteger(value.spriteCount) || Number(value.spriteCount) < 1 ||
    !Array.isArray(value.sprites) || value.spriteCount !== value.sprites.length) {
    throw new TypeError('Boss sprite animation catalog is invalid');
  }
  const sprites = value.sprites.map(parseSprite);
  const ids = new Set(sprites.map(({ bossId, enemyId }) => `${bossId}:${enemyId}`));
  if (ids.size !== sprites.length) throw new TypeError('Boss sprite animation catalog has duplicate IDs');
  return { sprites };
}

/** Parse source `/boss/atef/ENEMY_ID` projectile streams from the pinned JAR. */
export function parseBossAttackEffectCatalog(value: unknown): BossAttackEffectCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-boss-attack-effect-catalog-v1' ||
    !Number.isInteger(value.effectCount) || !Array.isArray(value.effects) ||
    value.effectCount !== value.effects.length) {
    throw new TypeError('Boss attack effect catalog is invalid');
  }
  const effects = value.effects.map((rawEffect) => {
    if (!isRecord(rawEffect) || rawEffect.format !== 'heroes-lore-boss-attack-effect-v1' ||
      !isIntegerInRange(rawEffect.bossId, 1, 4) || !isIntegerInRange(rawEffect.enemyId, 0, 255) ||
      rawEffect.spriteId !== rawEffect.enemyId ||
      rawEffect.sourceResource !== `boss/atef/${rawEffect.enemyId}` ||
      !Number.isInteger(rawEffect.frameCount) || Number(rawEffect.frameCount) < 1 ||
      !Array.isArray(rawEffect.frames) || rawEffect.frames.length !== rawEffect.frameCount ||
      !rawEffect.frames.every(Array.isArray)) {
      throw new TypeError('Boss attack effect is invalid');
    }
    const ownerRanges: Record<number, readonly number[]> = {
      1: [32],
      2: [35, 36, 37, 38],
      3: [39, 40, 41],
      4: [42],
    };
    if (!ownerRanges[Number(rawEffect.bossId)]?.includes(Number(rawEffect.enemyId))) {
      throw new TypeError('Boss attack effect owner does not match its source enemy');
    }
    return {
      bossId: Number(rawEffect.bossId),
      enemyId: Number(rawEffect.enemyId),
      spriteId: Number(rawEffect.spriteId),
      sourceResource: String(rawEffect.sourceResource),
      frameCount: Number(rawEffect.frameCount),
      frames: rawEffect.frames.map((frame) => frame.map(parseComponent)),
    };
  });
  if (new Set(effects.map(({ enemyId }) => enemyId)).size !== effects.length) {
    throw new TypeError('Boss attack effect catalog has duplicate enemy IDs');
  }
  return { effects };
}

export function findBossSpriteTrack(
  animation: BossSpriteAnimation,
  stateIndex: BossSpriteState,
  direction: Direction,
): BossSpriteTrack {
  const track = animation.tracks.find((entry) =>
    entry.stateIndex === stateIndex && entry.directionIndex === direction - 1);
  if (track === undefined) {
    throw new TypeError(`Boss sprite ${animation.bossId}/${animation.enemyId} is missing track ${stateIndex}:${direction - 1}`);
  }
  return track;
}

/**
 * Source `au.a(Graphics,...)` maps death state 5 to animation slot 2 and falls
 * back to idle slot 0 when that direction has no death track.
 */
export function sourceBossDeathSpriteState(
  animation: BossSpriteAnimation,
  direction: Direction,
): 0 | 2 {
  return animation.tracks.some((track) =>
    track.stateIndex === 2 && track.directionIndex === direction - 1) ? 2 : 0;
}

export function bossSpriteFrameAt(track: BossSpriteTrack, frameIndex: number): BossSpriteComponent[] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('Boss sprite frame index must be a non-negative integer');
  }
  return track.frames[frameIndex % track.frameCount];
}

export function advanceBossSpriteFrame(frameIndex: number, track: BossSpriteTrack): number {
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('Boss sprite frame index must be at least -1');
  }
  const nextFrame = frameIndex + 1;
  return nextFrame >= track.frameCount ? 0 : nextFrame;
}
