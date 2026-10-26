import type { Direction } from './actor';
import type { EventNpcPlacement } from './event-data';
import type { EnemySpriteAnimation } from './enemy-sprites';

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

/** Source map NPC image codes 3 and 6 reuse enemy animation resources 17 and 20. */
export function sourceEnemySpriteIdForNpc(npcId: number): number | undefined {
  if (npcId === 3) return 17;
  if (npcId === 6) return 20;
  return undefined;
}

export type SourceNpcTextureSource =
  | { kind: 'animated'; atlasDirectory: string }
  | { kind: 'static'; imagePath: string };

/** Resolve the atlas path used by `queueNpcTextures` for a source image code. */
export function sourceNpcTextureSource(
  npcId: number,
  hasAnimation: boolean,
): SourceNpcTextureSource | undefined {
  if (!Number.isInteger(npcId) || npcId < 0 || npcId > 255) return undefined;
  if (hasAnimation) {
    const enemySpriteId = sourceEnemySpriteIdForNpc(npcId);
    const atlasGroup = enemySpriteId === undefined ? 'npc' : 'enm';
    const atlasId = enemySpriteId ?? npcId;
    return {
      kind: 'animated',
      atlasDirectory: `/assets/generated/atlases/${atlasGroup}/${String(atlasId).padStart(2, '0')}`,
    };
  }
  if (npcId >= 18) {
    return {
      kind: 'static',
      imagePath: `/assets/generated/atlases/npc/all/${String(npcId - 18).padStart(3, '0')}.png`,
    };
  }
  if (npcId === 16) {
    return { kind: 'static', imagePath: '/assets/generated/atlases/npc/16/000.png' };
  }
  return undefined;
}

/** Keep the idle/walk tracks that `ab.a(Graphics,...)` selects from `/enm/spr/N`. */
export function adaptEnemyAnimationForNpc(
  npcId: number,
  animation: EnemySpriteAnimation,
): NpcSpriteAnimation {
  const tracks = animation.tracks
    .filter(({ stateIndex }) => stateIndex === 0 || stateIndex === 1)
    .map((track) => ({ ...track, stateIndex: track.stateIndex as NpcSpriteState }));
  if (tracks.length !== 8) {
    throw new TypeError(`Source NPC ${npcId} needs eight idle/walk tracks from enemy sprite ${animation.spriteId}`);
  }
  return { npcId, tracks };
}

export interface NpcSpriteViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NpcSpriteRenderPlacement {
  placement: EventNpcPlacement;
  visible: boolean;
}

/** Keep hidden source actors available so a later SHOW_NPC command can reveal them. */
export function resolveNpcSpriteRenderPlacements(
  placements: readonly EventNpcPlacement[],
  visibleNpcSourceOrders: ReadonlySet<number>,
): NpcSpriteRenderPlacement[] {
  return placements.map((placement) => ({
    placement,
    visible: visibleNpcSourceOrders.has(placement.sourceOrder),
  }));
}

/** Match the visibility bounds in `ab.a(Graphics, ...)` before it advances the NPC frame. */
export function isNpcWithinSourceViewport(
  npc: { x: number; y: number },
  viewport: NpcSpriteViewport,
): boolean {
  const screenX = npc.x - viewport.x;
  const screenY = npc.y - viewport.y;
  return screenX + 16 >= 0 && screenY >= 0 && screenX - 16 <= viewport.width &&
    screenY <= viewport.height + 32;
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
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('NPC sprite frame index must be at least -1');
  }
  // Source actors start with k=-1; ar.b treats it as the first frame before
  // ab.a(Graphics,...) increments the cursor after drawing.
  if (frameIndex === -1) return track.frames[0];
  return track.frames[frameIndex % track.frameCount];
}

export function advanceNpcSpriteFrame(frameIndex: number, track: NpcSpriteTrack): number {
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('NPC sprite frame index must be at least -1');
  }
  const nextFrame = frameIndex + 1;
  return nextFrame >= track.frameCount ? 0 : nextFrame;
}

/** Advance the source NPC draw cursor once for each paced gameplay paint. */
export function advanceNpcSpriteFrames(
  frameIndex: number,
  track: NpcSpriteTrack,
  sourcePaintPasses: number,
): number {
  if (!Number.isInteger(frameIndex) || frameIndex < -1) {
    throw new RangeError('NPC sprite frame index must be at least -1');
  }
  if (!Number.isSafeInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('NPC source paint pass count must be a non-negative integer');
  }
  if (sourcePaintPasses === 0) return frameIndex;
  if (!Number.isInteger(track.frameCount) || track.frameCount < 1) {
    throw new RangeError('NPC animation frame count must be a positive integer');
  }
  const currentPosition = ((frameIndex % track.frameCount) + track.frameCount) % track.frameCount;
  const passOffset = sourcePaintPasses % track.frameCount;
  return (currentPosition + passOffset) % track.frameCount;
}
