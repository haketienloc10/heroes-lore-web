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
export function createPlayerActor(x = 9 * 16, y = 8 * 16, direction: Direction = 2): PlayerActor {
  if (!Number.isInteger(direction) || direction < 1 || direction > 4) {
    throw new RangeError('Player direction must be a source direction from 1 through 4');
  }
  return {
    x,
    y,
    direction,
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

/** Reproduce source `an.a(direction, pixels)`, which relocates the player without collision checks. */
export function displaceActorFromSourceHit(
  actor: PlayerActor,
  direction: Direction,
  pixels: number,
): PlayerActor {
  if (!Number.isInteger(pixels) || pixels < 0) {
    throw new RangeError('Source displacement must be a non-negative integer');
  }
  const vector = DIRECTION_VECTOR[direction];
  return {
    ...actor,
    x: actor.x + vector.x * pixels,
    y: actor.y + vector.y * pixels,
  };
}

/** Rebuild the source `cj` occupancy cells for a one-tile actor mid-step. */
export function actorOccupiedCellIndices(
  actor: PlayerActor,
  gridWidth: number,
): ReadonlySet<number> {
  if (!Number.isInteger(gridWidth) || gridWidth <= 0) {
    throw new RangeError('Grid width must be a positive integer');
  }
  const tileX = actor.x >> 4;
  const tileY = actor.y >> 4;
  const columns = actor.x % 16 === 0 ? 1 : 2;
  const rows = actor.y % 16 === 0 ? 1 : 2;
  const occupied = new Set<number>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      occupied.add((tileY + row) * gridWidth + tileX + column);
    }
  }
  return occupied;
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

function stopActor(actor: PlayerActor): PlayerActor {
  return { ...actor, moving: false, stopAfterTile: false, queuedDirection: null };
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
      return stopActor(next);
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
    return stopActor(next);
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
  if (!next.moving) return next.x % 16 === 0 && next.y % 16 === 0;
  return next.x % 16 === 0 && next.y % 16 === 0 &&
    ((previous.x >> 4) !== (next.x >> 4) || (previous.y >> 4) !== (next.y >> 4));
}

/** A key release can stop an actor on a tile boundary outside the world update. */
export function releaseActorDirectionAndCheckBoundary(
  actor: PlayerActor,
): { actor: PlayerActor; reachedMapEventBoundary: boolean } {
  const released = releaseActorDirection(actor);
  return {
    actor: released,
    reachedMapEventBoundary: didReachMapEventBoundary(actor, released),
  };
}
