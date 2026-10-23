import type { WorldGrid } from './map-data';

export type Direction = 1 | 2 | 3 | 4;

export interface PlayerActor {
  /** Top-left world pixel coordinate used by the original entity grid. */
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  stopAfterTile: boolean;
  queuedDirection: Direction | null;
  tickRemainderMs: number;
  animationFrame: number;
}

export const WORLD_UPDATE_PERIOD_MS = 71;
export const PLAYER_HALF_TILE_STEP_PX = 8;
export const PLAYER_FOOTPRINT_TILES = 1;

const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};
const EMPTY_OCCUPIED_CELL_INDICES: ReadonlySet<number> = new Set();

// The BED checkpoint places the source entity on cell (9, 8); the pixel
// position is inferred by aligning its rendered center to the map grid.
export function createPlayerActor(x = 9 * 16, y = 8 * 16): PlayerActor {
  return {
    x,
    y,
    direction: 2,
    moving: false,
    stopAfterTile: false,
    queuedDirection: null,
    tickRemainderMs: 0,
    animationFrame: 0,
  };
}

export function requestActorDirection(actor: PlayerActor, direction: Direction): PlayerActor {
  if (!actor.moving) {
    return {
      ...actor,
      direction,
      moving: true,
      stopAfterTile: false,
      queuedDirection: null,
    };
  }
  return { ...actor, queuedDirection: direction, stopAfterTile: false };
}

export function releaseActorDirection(actor: PlayerActor): PlayerActor {
  if (!actor.moving) return actor;
  const aligned = actor.x % 16 === 0 && actor.y % 16 === 0;
  if (aligned) {
    return { ...actor, moving: false, stopAfterTile: false, queuedDirection: null };
  }
  return { ...actor, stopAfterTile: true, queuedDirection: null };
}

function canAdvance(
  world: WorldGrid,
  actor: PlayerActor,
  occupiedCellIndices: ReadonlySet<number>,
): boolean {
  const vector = DIRECTION_VECTOR[actor.direction];
  const cellX = actor.x >> 4;
  const cellY = actor.y >> 4;
  const targetX = cellX + vector.x;
  const targetY = cellY + vector.y;
  const { collision } = world;
  if (targetX < 0 || targetY < 0 || targetX >= collision.width || targetY >= collision.height) {
    return false;
  }
  for (let y = 0; y < PLAYER_FOOTPRINT_TILES; y += 1) {
    for (let x = 0; x < PLAYER_FOOTPRINT_TILES; x += 1) {
      if (collision.values[targetY + y]?.[targetX + x] < 0) return false;
      if (occupiedCellIndices.has((targetY + y) * collision.width + targetX + x)) return false;
    }
  }
  return true;
}

function advanceOneUpdate(
  world: WorldGrid,
  actor: PlayerActor,
  occupiedCellIndices: ReadonlySet<number>,
): PlayerActor {
  if (!actor.moving) return actor;
  const aligned = actor.x % 16 === 0 && actor.y % 16 === 0;
  let next = actor;
  if (aligned) {
    if (next.stopAfterTile) {
      return { ...next, moving: false, stopAfterTile: false, queuedDirection: null };
    }
    if (next.queuedDirection !== null) {
      next = { ...next, direction: next.queuedDirection, queuedDirection: null };
    }
    if (!canAdvance(world, next, occupiedCellIndices)) {
      return { ...next, moving: false, stopAfterTile: false, queuedDirection: null };
    }
  }

  const vector = DIRECTION_VECTOR[next.direction];
  next = {
    ...next,
    x: next.x + vector.x * PLAYER_HALF_TILE_STEP_PX,
    y: next.y + vector.y * PLAYER_HALF_TILE_STEP_PX,
    animationFrame: (next.animationFrame + 1) % 4,
  };
  if (next.stopAfterTile && next.x % 16 === 0 && next.y % 16 === 0) {
    return { ...next, moving: false, stopAfterTile: false, queuedDirection: null };
  }
  return next;
}

/** Advance the source-shaped actor update at the measured state-2 period. */
export function advanceActor(
  world: WorldGrid,
  actor: PlayerActor,
  elapsedMs: number,
  occupiedCellIndices: ReadonlySet<number> = EMPTY_OCCUPIED_CELL_INDICES,
): PlayerActor {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('elapsedMs must be a non-negative finite number');
  }
  let next = { ...actor, tickRemainderMs: actor.tickRemainderMs + elapsedMs };
  while (next.tickRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
    next = advanceOneUpdate(world, next, occupiedCellIndices);
    next.tickRemainderMs -= WORLD_UPDATE_PERIOD_MS;
  }
  return next;
}

/** Check map triggers only when a moving actor reaches or stops on a tile boundary. */
export function didReachMapEventBoundary(previous: PlayerActor, next: PlayerActor): boolean {
  if (!previous.moving) return false;
  if (!next.moving) return true;
  return next.x % 16 === 0 && next.y % 16 === 0 &&
    ((previous.x >> 4) !== (next.x >> 4) || (previous.y >> 4) !== (next.y >> 4));
}
