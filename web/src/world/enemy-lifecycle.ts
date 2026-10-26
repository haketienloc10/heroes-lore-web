import type { BaseCollisionData } from './map-data';
import { ENEMY_RESPAWN_DELAY_STEP, enemyFootprintWidth, type EnemyCombatant } from './combat';

export const ENEMY_RESPAWN_CADENCE_TICKS = 17;
export const ENEMY_RESPAWN_RADIUS = 3;
export const ENEMY_RESPAWN_CANDIDATES = 5;

export interface EnemyRespawnContext {
  collision: BaseCollisionData;
  occupiedCellIndices: ReadonlySet<number>;
  playerTileX: number;
  playerTileY: number;
}

export type InclusiveIntegerRandom = (minimum: number, maximum: number) => number;

export function advanceEnemyRespawnCadence(
  ticksRemaining: number,
): { ticksRemaining: number; shouldAdvanceTimers: boolean } {
  if (!Number.isInteger(ticksRemaining) || ticksRemaining < 1 ||
    ticksRemaining > ENEMY_RESPAWN_CADENCE_TICKS) {
    throw new RangeError('Respawn cadence must be within its source tick range');
  }
  if (ticksRemaining === 1) {
    return { ticksRemaining: ENEMY_RESPAWN_CADENCE_TICKS, shouldAdvanceTimers: true };
  }
  return { ticksRemaining: ticksRemaining - 1, shouldAdvanceTimers: false };
}

function randomOffset(randomInteger: InclusiveIntegerRandom): number {
  const value = randomInteger(-ENEMY_RESPAWN_RADIUS, ENEMY_RESPAWN_RADIUS);
  if (!Number.isInteger(value) || value < -ENEMY_RESPAWN_RADIUS || value > ENEMY_RESPAWN_RADIUS) {
    throw new RangeError('Respawn random source must return an integer in the requested range');
  }
  return value;
}

function isAvailable(
  tileX: number,
  tileY: number,
  footprintWidth: number,
  context: EnemyRespawnContext,
): boolean {
  const { collision, occupiedCellIndices, playerTileX, playerTileY } = context;
  if (tileX < 0 || tileY < 0 || tileX + footprintWidth > collision.width || tileY >= collision.height) {
    return false;
  }
  for (let offset = 0; offset < footprintWidth; offset += 1) {
    const x = tileX + offset;
    if ((collision.values[tileY]?.[x] ?? -1) < 0 || occupiedCellIndices.has(tileY * collision.width + x)) {
      return false;
    }
    if (x === playerTileX && tileY === playerTileY) return false;
  }
  return true;
}

/**
 * Reproduce the source map's randomized spawn search: begin within ±3 cells,
 * then cumulatively offset up to four more candidates. Two-cell enemies at the
 * right map edge use the source's special one-cell-left placement.
 */
export function findEnemyRespawnPlacement(
  enemy: EnemyCombatant,
  context: EnemyRespawnContext,
  randomInteger: InclusiveIntegerRandom,
): { tileX: number; tileY: number } | undefined {
  const footprintWidth = enemyFootprintWidth(enemy);
  if (footprintWidth === 2 && enemy.tileX >= context.collision.width - 1) {
    return { tileX: enemy.tileX - 1, tileY: enemy.tileY };
  }

  let tileX = enemy.tileX + randomOffset(randomInteger);
  let tileY = enemy.tileY + randomOffset(randomInteger);
  for (let candidate = 0; candidate < ENEMY_RESPAWN_CANDIDATES; candidate += 1) {
    if (isAvailable(tileX, tileY, footprintWidth, context)) return { tileX, tileY };
    // The source makes one final cumulative offset when attempts reaches zero,
    // then rejects the spawn even if that last, untested candidate is valid.
    tileX += randomOffset(randomInteger);
    tileY += randomOffset(randomInteger);
  }
  return undefined;
}
