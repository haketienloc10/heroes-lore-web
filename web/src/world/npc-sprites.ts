import type { Direction } from './actor';

export type NpcSpriteState = 0 | 1;

export interface NpcSpriteComponent {
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  imageIndex: number;
}

export interface NpcSpriteTrack {
  stateIndex: NpcSpriteState;
  directionIndex: 0 | 1 | 2 | 3;
  frameCount: number;
  frames: NpcSpriteComponent[][];
}

export interface NpcSpriteAnimation {
  npcId: number;
  tracks: NpcSpriteTrack[];
}

export interface NpcSpriteAnimationCatalog {
  sprites: NpcSpriteAnimation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseComponent(value: unknown): NpcSpriteComponent {
  if (!isRecord(value) ||
    !isIntegerInRange(value.offsetX, -128, 127) ||
    !isIntegerInRange(value.offsetY, -128, 127) ||
    typeof value.mirrored !== 'boolean' ||
    !isIntegerInRange(value.imageIndex, -1, 254)) {
    throw new TypeError('NPC sprite component is invalid');
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    mirrored: value.mirrored,
    imageIndex: value.imageIndex,
  };
}

function parseTrack(value: unknown, npcId: number): NpcSpriteTrack {
  if (!isRecord(value) ||
    !isIntegerInRange(value.stateIndex, 0, 1) ||
    !isIntegerInRange(value.directionIndex, 0, 3) ||
    !Number.isInteger(value.frameCount) || Number(value.frameCount) < 1 ||
    !Array.isArray(value.frames) || value.frames.length !== value.frameCount ||
    !value.frames.every(Array.isArray)) {
    throw new TypeError(`NPC sprite ${npcId} animation track is invalid`);
  }
  return {
    stateIndex: value.stateIndex as NpcSpriteState,
    directionIndex: value.directionIndex as 0 | 1 | 2 | 3,
    frameCount: Number(value.frameCount),
    frames: value.frames.map((frame) => frame.map(parseComponent)),
  };
}

function parseSprite(value: unknown): NpcSpriteAnimation {
  if (!isRecord(value) ||
    !isIntegerInRange(value.npcId, 0, 255) ||
    value.sourceResource !== `npc/spr/${String(value.npcId).padStart(2, '0')}` ||
    value.trackCount !== 8 || !Array.isArray(value.tracks) || value.tracks.length !== 8) {
    throw new TypeError('NPC sprite animation set is invalid');
  }
  const tracks = value.tracks.map((track) => parseTrack(track, value.npcId as number));
  const keys = new Set(tracks.map(({ stateIndex, directionIndex }) => `${stateIndex}:${directionIndex}`));
  if (keys.size !== 8) throw new TypeError(`NPC sprite ${value.npcId} has duplicate tracks`);
  for (let stateIndex = 0; stateIndex < 2; stateIndex += 1) {
    const frameCounts = new Set(tracks
      .filter((track) => track.stateIndex === stateIndex)
      .map((track) => track.frameCount));
    if (frameCounts.size !== 1) {
      throw new TypeError(`NPC sprite ${value.npcId} has inconsistent state-${stateIndex} frame counts`);
    }
  }
  return { npcId: value.npcId as number, tracks };
}

/** Parse all two-state `/npc/spr/N` tracks emitted by the pinned-JAR converter. */
export function parseNpcSpriteAnimationCatalog(value: unknown): NpcSpriteAnimationCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-npc-animation-catalog-v1' ||
    !Number.isInteger(value.spriteCount) || Number(value.spriteCount) < 1 || !Array.isArray(value.sprites) ||
    value.spriteCount !== value.sprites.length) {
    throw new TypeError('NPC sprite animation catalog is invalid');
  }
  const sprites = value.sprites.map(parseSprite);
  const ids = new Set(sprites.map(({ npcId }) => npcId));
  if (ids.size !== sprites.length) throw new TypeError('NPC sprite animation catalog has duplicate IDs');
  return { sprites };
}

export function findNpcSpriteAnimation(
  catalog: NpcSpriteAnimationCatalog,
  npcId: number,
): NpcSpriteAnimation | undefined {
  return catalog.sprites.find((sprite) => sprite.npcId === npcId);
}

export function findNpcSpriteTrack(
  animation: NpcSpriteAnimation,
  stateIndex: NpcSpriteState,
  direction: Direction,
): NpcSpriteTrack {
  const track = animation.tracks.find((entry) =>
    entry.stateIndex === stateIndex && entry.directionIndex === direction - 1);
  if (track === undefined) {
    throw new TypeError(`NPC sprite ${animation.npcId} is missing the selected track`);
  }
  return track;
}

export function npcSpriteFrameAt(track: NpcSpriteTrack, frameIndex: number): NpcSpriteComponent[] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('NPC sprite frame index must be a non-negative integer');
  }
  return track.frames[frameIndex % track.frameCount];
}

export function advanceNpcSpriteFrame(frameIndex: number, track: NpcSpriteTrack): number {
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('NPC sprite frame index must be at least -1');
  }
  const nextFrame = frameIndex + 1;
  return nextFrame >= track.frameCount ? 0 : nextFrame;
}
