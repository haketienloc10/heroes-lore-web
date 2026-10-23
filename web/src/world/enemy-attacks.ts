import type { Direction } from './actor';

export interface EnemyAttackEffectComponent {
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  imageIndex: number;
}

export interface EnemyAttackEffect {
  spriteId: number;
  frameCount: number;
  frames: EnemyAttackEffectComponent[][];
}

export interface EnemyAttackEffectCatalog {
  effects: EnemyAttackEffect[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseComponent(value: unknown): EnemyAttackEffectComponent {
  if (!isRecord(value) || !isInteger(value.offsetX, -128, 127) ||
    !isInteger(value.offsetY, -128, 127) || typeof value.mirrored !== 'boolean' ||
    !isInteger(value.imageIndex, -1, 254)) {
    throw new TypeError('Enemy attack effect component is invalid');
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    mirrored: value.mirrored,
    imageIndex: value.imageIndex,
  };
}

function parseEffect(value: unknown): EnemyAttackEffect {
  if (!isRecord(value) || !isInteger(value.spriteId, 0, 255) ||
    value.sourceResource !== `enm/atef/${String(value.spriteId).padStart(2, '0')}` ||
    !isInteger(value.frameCount, 1, 255) || !Array.isArray(value.frames) ||
    value.frames.length !== value.frameCount || !value.frames.every(Array.isArray)) {
    throw new TypeError('Enemy attack effect is invalid');
  }
  return {
    spriteId: value.spriteId,
    frameCount: value.frameCount,
    frames: value.frames.map((frame) => frame.map(parseComponent)),
  };
}

export function parseEnemyAttackEffectCatalog(value: unknown): EnemyAttackEffectCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-enemy-attack-effect-catalog-v1' ||
    !Array.isArray(value.effects) || value.effectCount !== value.effects.length) {
    throw new TypeError('Enemy attack effect catalog is invalid');
  }
  const effects = value.effects.map(parseEffect);
  if (new Set(effects.map(({ spriteId }) => spriteId)).size !== effects.length) {
    throw new TypeError('Enemy attack effect catalog has duplicate sprite IDs');
  }
  return { effects };
}

export function findEnemyAttackEffect(
  catalog: EnemyAttackEffectCatalog,
  spriteId: number,
): EnemyAttackEffect | undefined {
  return catalog.effects.find((effect) => effect.spriteId === spriteId);
}

export interface EnemyProjectile {
  id: number;
  sourceOrder: number;
  spriteId: number;
  direction: Direction;
  tileX: number;
  tileY: number;
  /** Source `x.b`, advanced at the paint cadence and consumed by `h.a()`. */
  frameIndex: number;
  /** Source `h.g`; two further tile segments follow the initial segment. */
  remainingSegments: number;
  /** Source `h.e`; a projectile can damage the player only once. */
  hitResolved: boolean;
}

const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};

/** Initial `h` object begins one tile ahead of the firing enemy. */
export function beginEnemyProjectile(
  id: number,
  sourceOrder: number,
  spriteId: number,
  tileX: number,
  tileY: number,
  direction: Direction,
): EnemyProjectile {
  const delta = DIRECTION_VECTOR[direction];
  return {
    id,
    sourceOrder,
    spriteId,
    direction,
    tileX: tileX + delta.x,
    tileY: tileY + delta.y,
    frameIndex: 0,
    remainingSegments: 2,
    hitResolved: false,
  };
}

export interface EnemyProjectileTickResult {
  projectile: EnemyProjectile | undefined;
  spawned: EnemyProjectile | undefined;
  hitPlayer: boolean;
}

/** Advance one `h.a()`/`x.b()` source-frame cycle without terrain collision. */
export function advanceEnemyProjectileTick(
  projectile: EnemyProjectile,
  effectFrameCount: number,
  playerTileX: number,
  playerTileY: number,
  mapWidth: number,
  mapHeight: number,
  nextProjectileId = projectile.id + 1,
): EnemyProjectileTickResult {
  if (!Number.isInteger(effectFrameCount) || effectFrameCount < 1 ||
    !Number.isInteger(mapWidth) || mapWidth < 1 ||
    !Number.isInteger(mapHeight) || mapHeight < 1) {
    throw new RangeError('Enemy projectile timing and map dimensions must be positive integers');
  }

  const hitPlayer = !projectile.hitResolved && projectile.frameIndex === 1 &&
    projectile.tileX === playerTileX &&
    projectile.tileY === playerTileY;
  if (hitPlayer && effectFrameCount === 2) {
    return { projectile: undefined, spawned: undefined, hitPlayer: true };
  }

  let spawned: EnemyProjectile | undefined;
  if (!projectile.hitResolved && projectile.frameIndex === 2 && projectile.remainingSegments > 0) {
    const delta = DIRECTION_VECTOR[projectile.direction];
    const tileX = projectile.tileX + delta.x;
    const tileY = projectile.tileY + delta.y;
    if (tileX >= 0 && tileY >= 0 && tileX < mapWidth && tileY < mapHeight) {
      spawned = {
        ...projectile,
        id: nextProjectileId,
        tileX,
        tileY,
        frameIndex: 0,
        remainingSegments: projectile.remainingSegments - 1,
      };
    }
  }

  if (projectile.frameIndex >= effectFrameCount) {
    return { projectile: undefined, spawned, hitPlayer };
  }
  return {
    projectile: {
      ...projectile,
      frameIndex: projectile.frameIndex + 1,
      hitResolved: projectile.hitResolved || hitPlayer,
    },
    spawned,
    hitPlayer,
  };
}

export interface EnemyAttackEffectAnimation {
  id: number;
  spriteId: number;
  tileX: number;
  tileY: number;
  frameIndex: number;
}

export function advanceEnemyAttackEffect(
  animation: EnemyAttackEffectAnimation,
  frameCount: number,
): EnemyAttackEffectAnimation | undefined {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new RangeError('Enemy attack effect frame count must be positive');
  }
  const nextFrame = animation.frameIndex + 1;
  return nextFrame >= frameCount ? undefined : { ...animation, frameIndex: nextFrame };
}
