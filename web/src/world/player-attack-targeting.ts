import type { Direction } from './actor';
import type { EnemyCombatant } from './combat';
import type { HeroCombatClass, PlayerComboImpact } from './player-combo';
import type { BaseCollisionData } from './map-data';

type AttackCell = readonly [x: number, y: number];

const SOURCE_DIRECTION_OFFSETS: readonly AttackCell[] = [
  [0, 0],
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

// Source t.d/t.c: first and second fan cells for facing directions 1 through 4.
const SOURCE_FAN_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 6],
  [8, 7],
  [7, 5],
  [6, 8],
];

function enemyOccupiesCell(enemy: EnemyCombatant, x: number, y: number): boolean {
  if (enemy.state !== 'alive' || enemy.hp <= 0) return false;
  const tileX = Math.floor(enemy.pixelX / 16);
  const tileY = Math.floor(enemy.pixelY / 16);
  const width = enemy.definition.classCode === 2 ? 2 : 1;
  if (y === tileY && x >= tileX && x < tileX + width) return true;
  if (enemy.pixelY % 16 !== 0 && y === tileY + 1 && x >= tileX && x < tileX + width) return true;
  return enemy.pixelX % 16 !== 0 && y === tileY && x === tileX + width;
}

function querySourceCell(
  combatants: readonly EnemyCombatant[],
  playerTileX: number,
  playerTileY: number,
  direction: number,
  distance = 1,
): EnemyCombatant | undefined {
  const [dx, dy] = SOURCE_DIRECTION_OFFSETS[direction] ?? [0, 0];
  const x = playerTileX + dx * distance;
  const y = playerTileY + dy * distance;
  return combatants.find((enemy) => enemyOccupiesCell(enemy, x, y));
}

/** Port the passability branch in the class-6 heavy stage-2/3 source lunge. */
export function sourceClassSixLungeDistance(
  collision: BaseCollisionData,
  occupiedCellIndices: ReadonlySet<number>,
  playerTileX: number,
  playerTileY: number,
  direction: Direction,
): 0 | 1 | 2 {
  const [dx, dy] = SOURCE_DIRECTION_OFFSETS[direction];
  const cellIndex = (distance: number): number | undefined => {
    const x = playerTileX + dx * distance;
    const y = playerTileY + dy * distance;
    if (x < 0 || y < 0 || x >= collision.width || y >= collision.height) return undefined;
    return y * collision.width + x;
  };
  const isOpen = (distance: number): boolean => {
    const index = cellIndex(distance);
    const x = playerTileX + dx * distance;
    const y = playerTileY + dy * distance;
    return index !== undefined && (collision.values[y]?.[x] ?? -1) >= 0 && !occupiedCellIndices.has(index);
  };
  const firstX = playerTileX + dx;
  const firstY = playerTileY + dy;
  if ((collision.values[firstY]?.[firstX] ?? -1) === 0 && isOpen(2)) return 2;
  return isOpen(1) ? 1 : 0;
}

function facingFan(
  combatants: readonly EnemyCombatant[],
  playerTileX: number,
  playerTileY: number,
  direction: Direction,
): EnemyCombatant[] {
  const [firstFan, secondFan] = SOURCE_FAN_CELLS[direction];
  const first = querySourceCell(combatants, playerTileX, playerTileY, direction);
  const second = querySourceCell(combatants, playerTileX, playerTileY, firstFan);
  const third = querySourceCell(combatants, playerTileX, playerTileY, secondFan);
  const targets: EnemyCombatant[] = [];
  if (first !== undefined) targets.push(first);
  if (second !== undefined && second !== first) targets.push(second);
  if (third !== undefined && third !== second) targets.push(third);
  return targets;
}

/**
 * Select hit targets using the source actor-cell queries in `an.b/c` and
 * `n.a(byte,byte)`. Wide or half-tile enemies can occupy more than one queried
 * cell, so source paths that issue repeated cell queries retain repetitions.
 */
export function selectPlayerAttackTargets(
  combatants: readonly EnemyCombatant[],
  playerTileX: number,
  playerTileY: number,
  direction: Direction,
  heroClass: HeroCombatClass,
  impact: PlayerComboImpact,
): EnemyCombatant[] {
  if (heroClass === 6) {
    if (impact.style === 'heavy' && impact.stage === 4 && impact.frame === 1) {
      return SOURCE_DIRECTION_OFFSETS.slice(1).flatMap((_, index) => {
        const target = querySourceCell(combatants, playerTileX, playerTileY, index + 1);
        return target === undefined ? [] : [target];
      });
    }
    if (impact.style === 'light' && (impact.stage === 1 || impact.stage === 2) ||
        impact.style === 'heavy' && impact.stage === 0) {
      return facingFan(combatants, playerTileX, playerTileY, direction);
    }
    const target = querySourceCell(combatants, playerTileX, playerTileY, direction);
    return target === undefined ? [] : [target];
  }

  if (heroClass === 7 && impact.style === 'light' && impact.stage === 3) {
    return facingFan(combatants, playerTileX, playerTileY, direction);
  }

  if (heroClass === 7) {
    const first = querySourceCell(combatants, playerTileX, playerTileY, direction, 1);
    const second = querySourceCell(combatants, playerTileX, playerTileY, direction, 2);
    return [first, second].filter((target): target is EnemyCombatant => target !== undefined);
  }

  // Class 8 heavy stages 2–4 launch projectiles in the source. Their delayed
  // collision is not represented by this immediate-cell selector yet.
  const target = querySourceCell(combatants, playerTileX, playerTileY, direction);
  return target === undefined ? [] : [target];
}
