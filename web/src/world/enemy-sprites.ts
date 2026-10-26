import type { Direction } from './actor';

export type EnemySpriteState = 0 | 1 | 2;
export type EnemySpriteLifecycle = 'alive' | 'death-pending' | 'respawn-wait' | 'removed';

export interface EnemySpriteComponent {
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  imageIndex: number;
}

export interface EnemySpriteTrack {
  stateIndex: EnemySpriteState;
  directionIndex: 0 | 1 | 2 | 3;
  frameCount: number;
  frames: EnemySpriteComponent[][];
}

export interface EnemySpriteAnimation {
  spriteId: number;
  tracks: EnemySpriteTrack[];
}

export interface EnemySpriteAnimationCatalog {
  sprites: EnemySpriteAnimation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseComponent(value: unknown): EnemySpriteComponent {
  if (!isRecord(value) ||
    !isIntegerInRange(value.offsetX, -128, 127) ||
    !isIntegerInRange(value.offsetY, -128, 127) ||
    typeof value.mirrored !== 'boolean' ||
    !isIntegerInRange(value.imageIndex, -1, 254)) {
    throw new TypeError('Enemy sprite component is invalid');
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    mirrored: value.mirrored,
    imageIndex: value.imageIndex,
  };
}

function parseTrack(value: unknown, spriteId: number): EnemySpriteTrack {
  if (!isRecord(value) ||
    !isIntegerInRange(value.stateIndex, 0, 2) ||
    !isIntegerInRange(value.directionIndex, 0, 3) ||
    !Number.isInteger(value.frameCount) || Number(value.frameCount) < 1 ||
    !Array.isArray(value.frames) || value.frames.length !== value.frameCount ||
    !value.frames.every(Array.isArray)) {
    throw new TypeError(`Enemy sprite ${spriteId} animation track is invalid`);
  }
  return {
    stateIndex: value.stateIndex as EnemySpriteState,
    directionIndex: value.directionIndex as 0 | 1 | 2 | 3,
    frameCount: Number(value.frameCount),
    frames: value.frames.map((frame) => frame.map(parseComponent)),
  };
}

function parseSprite(value: unknown): EnemySpriteAnimation {
  if (!isRecord(value) ||
    !isIntegerInRange(value.spriteId, 0, 255) ||
    value.sourceResource !== `enm/spr/${String(value.spriteId).padStart(2, '0')}` ||
    value.trackCount !== 12 || !Array.isArray(value.tracks) || value.tracks.length !== 12) {
    throw new TypeError('Enemy sprite animation set is invalid');
  }
  const tracks = value.tracks.map((track) => parseTrack(track, value.spriteId as number));
  const keys = new Set(tracks.map(({ stateIndex, directionIndex }) => `${stateIndex}:${directionIndex}`));
  if (keys.size !== 12) throw new TypeError(`Enemy sprite ${value.spriteId} has duplicate tracks`);
  for (let stateIndex = 0; stateIndex < 3; stateIndex += 1) {
    const frameCounts = new Set(tracks
      .filter((track) => track.stateIndex === stateIndex)
      .map((track) => track.frameCount));
    if (frameCounts.size !== 1) {
      throw new TypeError(`Enemy sprite ${value.spriteId} has inconsistent facing frame counts`);
    }
  }
  return { spriteId: value.spriteId, tracks };
}

/** Parse all `/enm/spr/N` tracks emitted by the pinned-JAR asset converter. */
export function parseEnemySpriteAnimationCatalog(value: unknown): EnemySpriteAnimationCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-enemy-animation-catalog-v1' ||
    !Number.isInteger(value.spriteCount) || Number(value.spriteCount) < 1 || !Array.isArray(value.sprites) ||
    value.spriteCount !== value.sprites.length) {
    throw new TypeError('Enemy sprite animation catalog is invalid');
  }
  const sprites = value.sprites.map(parseSprite);
  const ids = new Set(sprites.map(({ spriteId }) => spriteId));
  if (ids.size !== sprites.length) throw new TypeError('Enemy sprite animation catalog has duplicate IDs');
  return { sprites };
}

export function findEnemySpriteAnimation(
  catalog: EnemySpriteAnimationCatalog,
  spriteId: number,
): EnemySpriteAnimation | undefined {
  return catalog.sprites.find((sprite) => sprite.spriteId === spriteId);
}

/** Source `ak.a(Graphics)` uses states 1–3 and directions 1–4. */
export function findEnemySpriteTrack(
  animation: EnemySpriteAnimation,
  stateIndex: EnemySpriteState,
  direction: Direction,
): EnemySpriteTrack {
  const track = animation.tracks.find((entry) =>
    entry.stateIndex === stateIndex && entry.directionIndex === direction - 1);
  if (track === undefined) {
    throw new TypeError(`Enemy sprite ${animation.spriteId} is missing the selected track`);
  }
  return track;
}

/**
 * Select the `/enm/spr` track used by the source actor lifecycle. `ak` state 5
 * falls through to the standing track while its death counter runs; the web
 * passes `idleDeathPose` only for ordinary `ak` actors.
 */
export function sourceEnemySpriteStateForRender(
  lifecycle: EnemySpriteLifecycle,
  animationStateIndex: number,
  idleDeathPose = false,
): EnemySpriteState | null {
  if (lifecycle === 'death-pending') return idleDeathPose ? 0 : null;
  if (lifecycle !== 'alive' || !Number.isInteger(animationStateIndex) ||
    animationStateIndex < 0 || animationStateIndex > 2) return null;
  return animationStateIndex as EnemySpriteState;
}

/** Source `ar.b` selects a frame directly from the current enemy update count. */
export function enemySpriteFrameAt(track: EnemySpriteTrack, frameIndex: number): EnemySpriteComponent[] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('Enemy sprite frame index must be a non-negative integer');
  }
  return track.frames[frameIndex % track.frameCount];
}

export function advanceEnemySpriteFrame(frameIndex: number, track: EnemySpriteTrack): number {
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('Enemy sprite frame index must be at least -1');
  }
  const nextFrame = frameIndex + 1;
  return nextFrame >= track.frameCount ? 0 : nextFrame;
}
