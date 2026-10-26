import type { Direction } from './actor';
import type { BasicAttackProfile, WeaponProcCode } from './combat';

export type SourceClassEightProjectileEffectRow = 0 | 1 | 2;

/** Gameplay state for one segment of the class-8 heavy attack's source `h` chain. */
export interface SourceClassEightProjectile {
  id: number;
  tileX: number;
  tileY: number;
  direction: Direction;
  /** `cd.b[0]`, `[1]`, or `[2]` selected by heavy combo stages 2, 3, or 4. */
  effectRow: SourceClassEightProjectileEffectRow;
  /** Source attack power and critical bonus captured when `an.p()` fires. */
  attackProfile: BasicAttackProfile;
  critical: boolean;
  /** `an.A`, selected once at attack start and reused for each `h` segment. */
  procCode: WeaponProcCode | null;
  /** Source `h.g` starts at 2, producing the initial segment plus two more. */
  remainingSegments: number;
  /** Gameplay phase of source `x.b`: collision at 1, next-segment spawn at 2. */
  gameplayFramePhase: 0 | 1 | 2;
};

export interface SourceClassEightProjectileTick {
  projectile: SourceClassEightProjectile | undefined;
  spawned: SourceClassEightProjectile | undefined;
  hitCell: { tileX: number; tileY: number } | undefined;
}

const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};

/**
 * Create the projectile launched by source class-8 heavy stages 2–4. The source
 * spawns the first `h` object one cell ahead and snapshots power/critical inputs;
 * `h` retains the player actor, whose active-skill element is read at impact.
 */
export function beginSourceClassEightProjectile(
  id: number,
  playerTileX: number,
  playerTileY: number,
  direction: Direction,
  stage: 2 | 3 | 4,
  attackProfile: BasicAttackProfile,
  critical: boolean,
  procCode: WeaponProcCode | null = null,
): SourceClassEightProjectile {
  const delta = DIRECTION_VECTOR[direction];
  return {
    id,
    tileX: playerTileX + delta.x,
    tileY: playerTileY + delta.y,
    direction,
    effectRow: (stage - 2) as SourceClassEightProjectileEffectRow,
    attackProfile: { ...attackProfile },
    critical,
    procCode,
    remainingSegments: 2,
    gameplayFramePhase: 0,
  };
}

/** Advance one source `h.a()` update for the class-8 projectile chain. */
export function advanceSourceClassEightProjectileTick(
  projectile: SourceClassEightProjectile,
  mapWidth: number,
  mapHeight: number,
  nextProjectileId: number,
): SourceClassEightProjectileTick {
  if (!Number.isInteger(mapWidth) || mapWidth < 1 ||
    !Number.isInteger(mapHeight) || mapHeight < 1 ||
    !Number.isInteger(nextProjectileId) || nextProjectileId < 0) {
    throw new RangeError('Projectile map dimensions and next ID must be valid integers');
  }

  if (projectile.gameplayFramePhase === 0) {
    return {
      projectile: { ...projectile, gameplayFramePhase: 1 },
      spawned: undefined,
      hitCell: undefined,
    };
  }

  if (projectile.gameplayFramePhase === 1) {
    return {
      projectile: { ...projectile, gameplayFramePhase: 2 },
      spawned: undefined,
      hitCell: { tileX: projectile.tileX, tileY: projectile.tileY },
    };
  }

  const delta = DIRECTION_VECTOR[projectile.direction];
  const tileX = projectile.tileX + delta.x;
  const tileY = projectile.tileY + delta.y;
  const spawned = projectile.remainingSegments > 0 &&
    tileX >= 0 && tileY >= 0 && tileX < mapWidth && tileY < mapHeight
    ? {
      ...projectile,
      id: nextProjectileId,
      tileX,
      tileY,
      remainingSegments: projectile.remainingSegments - 1,
      gameplayFramePhase: 0 as const,
    }
    : undefined;

  // Frame 2 has performed the only remaining gameplay work for this segment.
  // Its longer source sprite tail is a separate rendering concern.
  return { projectile: undefined, spawned, hitCell: undefined };
}
