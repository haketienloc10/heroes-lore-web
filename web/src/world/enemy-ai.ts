import type { Direction } from './actor';
import type { BaseCollisionData } from './map-data';
import { enemyFootprintWidth, type EnemyCombatant } from './combat';
import { hasSourceEnemyStatus, resetSourceEnemyActionWhileBlocked, sourceEnemyActionIsBlocked } from './enemy-status';

const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};
const DIAGONAL_VECTOR = [
  { x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 1, y: 0 }, { x: -1, y: -1 },
  { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
];
const PERPENDICULAR_FORWARD = [0, 3, 4, 2, 1];
const DIAGONAL_FORWARD = [0, 5, 8, 7, 6];
const PERPENDICULAR_BACKWARD = [0, 4, 3, 1, 2];
const DIAGONAL_BACKWARD = [0, 6, 7, 5, 8];

export interface EnemyPursuitContext {
  collision: BaseCollisionData;
  occupiedCellIndices: ReadonlySet<number>;
  playerTileX: number;
  playerTileY: number;
  playerAction?: {
    tileX: number;
    tileY: number;
    phase: 0 | 1 | 2 | 3;
    /** Exact `o.m113a()` result: `false` makes `ak.i()` retain an actor target. */
    needsActorTargetReselection: boolean;
  };
  /** Source `g.a(min, max)` stream used for bounded rolls. */
  randomInteger: (minimum: number, maximum: number) => number;
  /** Raw `cj.f245a.nextInt()` stream used for signs, direction bytes and ties. */
  rawRandomInteger: () => number;
  /** Source `ak.i()` attack check, run before path selection at an aligned tile. */
  tryStartAttack?: (enemy: EnemyCombatant) => EnemyCombatant | undefined;
}

export interface SourceEnemyViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Match the viewport test in `ak.a(Graphics, ...)` for an ordinary enemy. */
export function isEnemyWithinSourceViewport(
  enemy: EnemyCombatant,
  viewport: SourceEnemyViewport,
): boolean {
  const sourceCenterX = enemy.pixelX + footprintWidth(enemy) * 8;
  const sourceOriginY = enemy.pixelY + 8;
  return sourceCenterX + 16 >= viewport.x &&
    sourceOriginY >= viewport.y &&
    sourceCenterX - 16 <= viewport.x + viewport.width &&
    sourceOriginY <= viewport.y + viewport.height + 32;
}

/** Record `ak.a(Graphics,...)`'s visibility flag only after a source-paced paint. */
export function updateEnemySourceViewportOnPaint(
  enemies: readonly EnemyCombatant[],
  viewport: SourceEnemyViewport,
  sourcePaintPasses: number,
): readonly EnemyCombatant[] {
  if (!Number.isInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('Source paint pass count must be a non-negative integer');
  }
  if (sourcePaintPasses === 0) return enemies;
  return enemies.map((enemy) => ({
    ...enemy,
    sourceRenderedOnScreen: isEnemyWithinSourceViewport(enemy, viewport),
  }));
}

/**
 * `ak.d()` still ticks attached statuses offscreen, then returns before actor
 * state, reactions, movement, attack callbacks, and death timers when `f` is
 * false, the player is outside `i.g`, and there is no retained target.
 */
export function shouldPauseEnemyBrainOffscreen(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
): boolean {
  const range = enemy.definition.acquisitionRange;
  const playerOutsideSourceRange =
    Math.abs(playerTileX - enemy.tileX) > range ||
    Math.abs(playerTileY - enemy.tileY) > range;
  return enemy.sourceRenderedOnScreen === false && playerOutsideSourceRange &&
    enemy.pursuitTarget == null;
}

/** True when the actor uses the ordinary source `ak.d()` update path. */
export function usesOrdinarySourceEnemyUpdate(enemy: EnemyCombatant): boolean {
  return enemy.sourceAu !== true && enemy.sourceBehavior === undefined &&
    enemy.sourceCbAi === undefined && enemy.sourceAqAi === undefined &&
    enemy.sourceMap13Ai === undefined && enemy.sourceMap15Ai === undefined &&
    enemy.directTypeZeroMarkerOnRemoval === undefined;
}

/**
 * The source `au.d()` override runs its AI and attack update without `ak.d()`'s
 * offscreen return. Keep that subclass distinction at every scene tick phase.
 */
export function shouldPauseSourceEnemyBrainOffscreen(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
): boolean {
  return usesOrdinarySourceEnemyUpdate(enemy) &&
    shouldPauseEnemyBrainOffscreen(enemy, playerTileX, playerTileY);
}

interface DirectionChoice {
  direction: Direction;
  move: boolean;
}

function footprintWidth(enemy: EnemyCombatant): number {
  return enemyFootprintWidth(enemy);
}

function occupiedCells(enemy: EnemyCombatant, mapWidth: number): Set<number> {
  const result = new Set<number>();
  const width = footprintWidth(enemy);
  const tileX = Math.floor(enemy.pixelX / 16);
  const tileY = Math.floor(enemy.pixelY / 16);
  for (let offset = 0; offset < width; offset += 1) {
    result.add(tileY * mapWidth + tileX + offset);
    if (enemy.pixelY % 16 !== 0) result.add((tileY + 1) * mapWidth + tileX + offset);
  }
  if (enemy.pixelX % 16 !== 0) result.add(tileY * mapWidth + tileX + width);
  return result;
}

function isOpen(
  x: number,
  y: number,
  enemy: EnemyCombatant,
  context: EnemyPursuitContext,
  occupied: ReadonlySet<number>,
  targetCellAllowed?: { tileX: number; tileY: number },
): boolean {
  const { collision } = context;
  if (x < 0 || y < 0 || x + footprintWidth(enemy) > collision.width || y >= collision.height) {
    return false;
  }
  for (let offset = 0; offset < footprintWidth(enemy); offset += 1) {
    const cellX = x + offset;
    const cellIndex = y * collision.width + cellX;
    if ((collision.values[y]?.[cellX] ?? -1) < 0) return false;
    if (occupied.has(cellIndex) && !(targetCellAllowed !== undefined &&
      cellX === targetCellAllowed.tileX && y === targetCellAllowed.tileY)) {
      return false;
    }
  }
  return true;
}

function canMove(
  enemy: EnemyCombatant,
  direction: Direction,
  context: EnemyPursuitContext,
  occupied: ReadonlySet<number>,
): boolean {
  const delta = DIRECTION_VECTOR[direction];
  return isOpen(enemy.tileX + delta.x, enemy.tileY + delta.y, enemy, context, occupied);
}

function diagonalFallback(
  enemy: EnemyCombatant,
  targetX: number,
  targetY: number,
  direction: Direction,
  preferForward: boolean,
  context: EnemyPursuitContext,
  occupied: ReadonlySet<number>,
): Direction | undefined {
  const firstSteps = preferForward ? PERPENDICULAR_FORWARD : PERPENDICULAR_BACKWARD;
  const secondSteps = preferForward ? DIAGONAL_FORWARD : DIAGONAL_BACKWARD;
  const axisWidth = direction === 1 || direction === 2 ? footprintWidth(enemy) : 1;
  const tileX = enemy.tileX;
  const tileY = enemy.tileY;
  const offsetStart = -axisWidth + 1;
  const offsetEnd = axisWidth - 1;
  for (let offset = offsetStart; offset <= offsetEnd; offset += 1) {
    const first = firstSteps[direction];
    const second = secondSteps[direction];
    const firstDelta = DIAGONAL_VECTOR[first];
    const secondDelta = DIAGONAL_VECTOR[second];
    const firstX = tileX + offset + firstDelta.x;
    const firstY = tileY + firstDelta.y;
    const secondX = tileX + offset + secondDelta.x;
    const secondY = tileY + secondDelta.y;
    const firstOpen = isOpen(firstX, firstY, enemy, context, occupied);
    const secondOpen = isOpen(
      secondX,
      secondY,
      enemy,
      context,
      occupied,
      secondX === targetX && secondY === targetY ? { tileX: targetX, tileY: targetY } : undefined,
    );
    if (firstOpen && secondOpen) return first as Direction;
  }
  return undefined;
}

function chooseDirection(
  enemy: EnemyCombatant,
  targetX: number,
  targetY: number,
  context: EnemyPursuitContext,
  occupied: ReadonlySet<number>,
): DirectionChoice {
  // Source `n.a(cj, byte)` reads this before even taking its aligned-target
  // early return, and reuses its low byte if every path fallback fails.
  const fallbackRoll = context.rawRandomInteger();
  const width = footprintWidth(enemy);
  let horizontal = 100;
  for (let offset = 0; offset < width; offset += 1) {
    const distance = targetX - (enemy.tileX + offset);
    if (Math.abs(horizontal) > Math.abs(distance)) horizontal = distance;
  }
  const vertical = targetY - enemy.tileY;
  const absHorizontal = Math.abs(horizontal);
  const absVertical = Math.abs(vertical);
  const approachRange = enemy.definition.behaviorType >= 2 ? 3 : 1;
  const currentDirection = enemy.animationDirection ?? 2;
  const facingDelta = DIRECTION_VECTOR[currentDirection];
  const aheadY = enemy.tileY + facingDelta.y;
  const targetIsAhead = currentDirection === 1 || currentDirection === 2
    ? targetY === aheadY && targetX >= enemy.tileX && targetX < enemy.tileX + width
    : currentDirection === 3
      ? targetX === enemy.tileX - 1 && targetY === enemy.tileY
      : targetX === enemy.tileX + width && targetY === enemy.tileY;

  if ((absHorizontal + absVertical <= approachRange && absHorizontal * absVertical === 0) ||
    targetIsAhead) {
    const direction = vertical !== 0
      ? (vertical < 0 ? 1 : 2)
      : (horizontal < 0 ? 3 : 4);
    return { direction, move: false };
  }

  let selected: Direction;
  if (absVertical === absHorizontal) {
    const horizontalDirection: Direction = horizontal > 0 ? 4 : 3;
    const verticalDirection: Direction = vertical > 0 ? 2 : 1;
    const horizontalOpen = canMove(enemy, horizontalDirection, context, occupied);
    const verticalOpen = canMove(enemy, verticalDirection, context, occupied);
    if (horizontalOpen && verticalOpen) {
      selected = context.rawRandomInteger() > 0 ? horizontalDirection : verticalDirection;
    } else {
      selected = horizontalOpen ? horizontalDirection : verticalDirection;
    }
  } else if (absVertical > absHorizontal) {
    selected = vertical > 0 ? 2 : 1;
  } else {
    selected = horizontal > 0 ? 4 : 3;
  }

  if ((absHorizontal <= approachRange || absVertical <= approachRange) &&
    absHorizontal !== absVertical) {
    if (absHorizontal > approachRange || absVertical >= absHorizontal) {
      if (absVertical <= approachRange && absVertical > absHorizontal) {
        const horizontalDirection: Direction = horizontal > 0 ? 4 : 3;
        if (canMove(enemy, horizontalDirection, context, occupied)) selected = horizontalDirection;
      }
    } else {
      const verticalDirection: Direction = vertical > 0 ? 2 : 1;
      if (canMove(enemy, verticalDirection, context, occupied)) selected = verticalDirection;
    }
  }

  if (canMove(enemy, selected, context, occupied)) return { direction: selected, move: true };
  const preferForward = !((selected === 1 && horizontal > 0) ||
    (selected === 2 && horizontal < 0) || (selected === 3 && vertical < 0) ||
    (selected === 4 && vertical > 0));
  const firstFallback = diagonalFallback(
    enemy, targetX, targetY, selected, preferForward, context, occupied,
  );
  if (firstFallback !== undefined) return { direction: firstFallback, move: true };
  const secondFallback = diagonalFallback(
    enemy, targetX, targetY, selected, !preferForward, context, occupied,
  );
  if (secondFallback !== undefined) return { direction: secondFallback, move: true };

  const lastFallback = preferForward
    ? (selected === 1 ? 3 : selected === 2 ? 4 : selected === 3 ? 2 : 1)
    : (selected === 1 ? 4 : selected === 2 ? 3 : selected === 3 ? 1 : 2);
  if (canMove(enemy, lastFallback, context, occupied)) {
    return { direction: lastFallback, move: true };
  }
  return { direction: ((fallbackRoll & 255) % 4 + 1) as Direction, move: true };
}

function moveHalfTile(enemy: EnemyCombatant, direction: Direction): EnemyCombatant {
  const delta = DIRECTION_VECTOR[direction];
  const pixelX = enemy.pixelX + delta.x * 8;
  const pixelY = enemy.pixelY + delta.y * 8;
  return {
    ...enemy,
    pixelX,
    pixelY,
    tileX: Math.floor(pixelX / 16),
    tileY: Math.floor(pixelY / 16),
    animationDirection: direction,
    animationStateIndex: 1,
    animationFrameIndex: enemy.animationStateIndex === 1 ? enemy.animationFrameIndex : -1,
  };
}

function withAnimationState(
  enemy: EnemyCombatant,
  animationStateIndex: 0 | 1 | 2,
  animationDirection = enemy.animationDirection ?? 2,
): EnemyCombatant {
  return {
    ...enemy,
    animationDirection,
    animationStateIndex,
    animationFrameIndex: enemy.animationStateIndex === animationStateIndex
      ? enemy.animationFrameIndex
      : -1,
  };
}

function isWithinAcquisitionBounds(
  enemy: EnemyCombatant,
  tileX: number,
  tileY: number,
): boolean {
  const provokedRange = enemy.definition.extendedProvokedRange ? 100 : 8;
  const acquisitionRange = enemy.provoked ? provokedRange : enemy.definition.acquisitionRange;
  return Math.abs(tileX - enemy.tileX) <= acquisitionRange &&
    Math.abs(tileY - enemy.tileY) <= acquisitionRange;
}

interface PursuitTarget {
  kind: 'player' | 'action';
  tileX: number;
  tileY: number;
}

function selectPursuitTarget(
  enemy: EnemyCombatant,
  context: EnemyPursuitContext,
): PursuitTarget | null {
  const action = context.playerAction;
  if (enemy.pursuitTarget === 'action' && action?.phase === 2) {
    return { kind: 'action', tileX: action.tileX, tileY: action.tileY };
  }
  if (enemy.pursuitTarget === 'player' && action?.needsActorTargetReselection === false) {
    return { kind: 'player', tileX: context.playerTileX, tileY: context.playerTileY };
  }

  const range = enemy.provoked
    ? enemy.definition.extendedProvokedRange ? 100 : 8
    : enemy.definition.acquisitionRange;
  const actionInBounds = action !== undefined && action.phase === 2 &&
    Math.abs(action.tileX - enemy.tileX) <= range &&
    Math.abs(action.tileY - enemy.tileY) <= range;
  if (actionInBounds && context.randomInteger(0, 9) < 7) {
    return { kind: 'action', tileX: action.tileX, tileY: action.tileY };
  }
  if (isWithinAcquisitionBounds(enemy, context.playerTileX, context.playerTileY)) {
    return { kind: 'player', tileX: context.playerTileX, tileY: context.playerTileY };
  }
  return null;
}

/** Source `ak.r()`: positive values start a cardinal step; non-positive values idle. */
function advanceIdleWanderTick(
  enemy: EnemyCombatant,
  context: EnemyPursuitContext,
  occupied: ReadonlySet<number>,
): EnemyCombatant {
  // `ak.r()` checks a raw Random.nextInt() sign. A positive value selects
  // state 2 (movement); otherwise `ak.a(true)` selects state 1 and rolls p.
  const startsMoving = context.rawRandomInteger() > 0;
  const actionRoll = startsMoving ? undefined : context.randomInteger(1, 7);
  // `ak.r()` uses `(nextInt() & 255) % 4 + 1` for north/south/west/east.
  const direction = ((context.rawRandomInteger() & 255) % 4 + 1) as Direction;
  const retargetProgress = enemy.pursuitRetargetProgress ?? 0;
  if (!startsMoving) {
    const attackCooldownTicksRemaining = Math.floor(
      (((enemy.definition.behaviorTiming[1] * (hasSourceEnemyStatus(enemy, 1) ? 2 : 1)) + 1) *
        (actionRoll ?? 0)) / 10,
    );
    return withAnimationState({
      ...enemy,
      attackCooldownTicksRemaining,
      actionDelayTicksRemaining: enemy.definition.behaviorTiming[0] + retargetProgress,
      pursuitRetargetProgress: 0,
      animationFrameIndex: -1,
    }, 0, direction);
  }

  // The positive branch only changes the animation state and direction; it
  // does not randomize p or reset the accumulated retarget value.
  const startingWander = { ...enemy, actionDelayTicksRemaining: 0 };
  if (!canMove(startingWander, direction, context, occupied)) {
    return withAnimationState(startingWander, 0, direction);
  }
  return moveHalfTile(startingWander, direction);
}

function decrementIdleTimers(enemy: EnemyCombatant): EnemyCombatant {
  if (enemy.animationStateIndex !== 0) return enemy;
  return {
    ...enemy,
    actionDelayTicksRemaining: Math.max(0, (enemy.actionDelayTicksRemaining ?? 0) - 1),
  };
}

/** True when the player occupies the single cell directly ahead of the enemy. */
export function enemyFacesPlayer(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
): boolean {
  const direction = enemy.animationDirection ?? 2;
  const width = footprintWidth(enemy);
  if (direction === 1) {
    return playerTileY === enemy.tileY - 1 && playerTileX >= enemy.tileX &&
      playerTileX < enemy.tileX + width;
  }
  if (direction === 2) {
    return playerTileY === enemy.tileY + 1 && playerTileX >= enemy.tileX &&
      playerTileX < enemy.tileX + width;
  }
  if (direction === 3) return playerTileX === enemy.tileX - 1 && playerTileY === enemy.tileY;
  return playerTileX === enemy.tileX + width && playerTileY === enemy.tileY;
}

/** Source `ak` behavior-2 attack lane: same facing direction, one to three cells. */
export function enemyHasPlayerWithinFacingRange(
  enemy: EnemyCombatant,
  playerTileX: number,
  playerTileY: number,
  range: number,
): boolean {
  const direction = enemy.animationDirection ?? 2;
  const delta = DIRECTION_VECTOR[direction];
  for (let distance = 1; distance <= range; distance += 1) {
    if (enemy.tileX + delta.x * distance === playerTileX &&
      enemy.tileY + delta.y * distance === playerTileY) return true;
  }
  return false;
}

/**
 * Advance one map update of the source axis-aligned pursuit path (`ak.i` and
 * `n.a(cj, byte)`), including the no-target idle/wander branch in `ak.r()`.
 */
export function advanceEnemyPursuitTick(
  enemy: EnemyCombatant,
  context: EnemyPursuitContext,
): EnemyCombatant {
  if (enemy.state !== 'alive' || !usesOrdinarySourceEnemyUpdate(enemy)) return enemy;

  // Source `n.e()` finishes the second 8-pixel half-step without replanning.
  if (enemy.pixelX % 16 !== 0 || enemy.pixelY % 16 !== 0) {
    return moveHalfTile(enemy, enemy.animationDirection ?? 2);
  }

  // Source `ak.h()` is called whenever a walking enemy reaches a full-tile
  // boundary. It either returns to state 1 or accumulates i.h toward the
  // two-interval retarget limit before `ak.i()` chooses its next direction.
  let decisionEnemy = enemy;
  if (enemy.animationStateIndex === 1) {
    const progress = enemy.pursuitRetargetProgress ?? 0;
    const retargetInterval = enemy.definition.behaviorTiming[0];
    if (progress >= retargetInterval * 2 || context.rawRandomInteger() <= 0) {
      decisionEnemy = {
        ...enemy,
        attackCooldownTicksRemaining: enemy.definition.behaviorTiming[1] + 1,
        actionDelayTicksRemaining: retargetInterval + progress,
        pursuitRetargetProgress: 0,
        animationStateIndex: 0,
        animationFrameIndex: -1,
      };
      if ((decisionEnemy.actionDelayTicksRemaining ?? 0) > 0) {
        const attack = context.tryStartAttack?.(decisionEnemy);
        return attack ?? decrementIdleTimers(decisionEnemy);
      }
    } else {
      decisionEnemy = {
        ...enemy,
        actionDelayTicksRemaining: 0,
        pursuitRetargetProgress: progress + retargetInterval,
      };
    }
  }

  // `ak.h()` calls `ak.i()` at this aligned boundary. Its attack check runs
  // before `n.a(cj, byte)` chooses a path and consumes that method's raw RNG.
  const attack = context.tryStartAttack?.(decisionEnemy);
  if (attack !== undefined) return attack;

  // `ak.i()` checks targets while idle, but only chooses a new path after `o`
  // reaches zero. `ak.o()` decrements this timer at the end of the same tick.
  if (decisionEnemy.animationStateIndex !== 1 &&
    (decisionEnemy.actionDelayTicksRemaining ?? 0) > 0) {
    return decrementIdleTimers(withAnimationState(decisionEnemy, 0));
  }

  const occupied = new Set(context.occupiedCellIndices);
  for (const cell of occupiedCells(decisionEnemy, context.collision.width)) occupied.delete(cell);
  occupied.add(context.playerTileY * context.collision.width + context.playerTileX);
  const action = context.playerAction;
  if (action !== undefined && action.phase !== 0 &&
    action.tileX >= 0 && action.tileY >= 0 &&
    action.tileX < context.collision.width && action.tileY < context.collision.height) {
    occupied.add(action.tileY * context.collision.width + action.tileX);
  }

  const target = selectPursuitTarget(decisionEnemy, context);
  if (target === null) {
    const idleEnemy = { ...decisionEnemy, pursuitTarget: null };
    return decrementIdleTimers(advanceIdleWanderTick(idleEnemy, context, occupied));
  }

  const targetedEnemy = { ...decisionEnemy, pursuitTarget: target.kind };
  const choice = chooseDirection(targetedEnemy, target.tileX, target.tileY, context, occupied);
  if (!choice.move) {
    return decrementIdleTimers(withAnimationState(targetedEnemy, 0, choice.direction));
  }

  if (!canMove(targetedEnemy, choice.direction, context, occupied)) {
    return decrementIdleTimers(withAnimationState(targetedEnemy, 0, choice.direction));
  }
  return moveHalfTile(targetedEnemy, choice.direction);
}

/** Advance pursuit, attack cooldown, type-0/1 melee, and type-2/3 lane attacks. */
export function advanceEnemyBehaviorTick(
  enemy: EnemyCombatant,
  context: EnemyPursuitContext,
  attackTrackFrameCount: number | undefined,
): EnemyCombatant {
  if (enemy.state !== 'alive' || !usesOrdinarySourceEnemyUpdate(enemy)) return enemy;
  if (shouldPauseEnemyBrainOffscreen(enemy, context.playerTileX, context.playerTileY)) return enemy;
  if (sourceEnemyActionIsBlocked(enemy)) return resetSourceEnemyActionWhileBlocked(enemy);

  const attackTicksRemaining = enemy.attackAnimationTicksRemaining ?? 0;
  if (enemy.animationStateIndex === 2 && attackTicksRemaining > 0) {
    const remaining = attackTicksRemaining - 1;
    if (remaining === 0) {
      return withAnimationState({
        ...enemy,
        attackAnimationTicksRemaining: 0,
        attackCooldownTicksRemaining: Math.max(0,
          enemy.definition.behaviorTiming[1] * (hasSourceEnemyStatus(enemy, 1) ? 2 : 1)),
        actionDelayTicksRemaining: Math.max(0, enemy.definition.behaviorTiming[0] - 1),
        pursuitRetargetProgress: 0,
      }, 0);
    }
    return { ...enemy, attackAnimationTicksRemaining: remaining };
  }

  const wasMoving = enemy.animationStateIndex === 1;
  const movingBetweenTiles = wasMoving &&
    (enemy.pixelX % 16 !== 0 || enemy.pixelY % 16 !== 0);
  const cooldown = enemy.attackCooldownTicksRemaining ?? 0;
  const behaviorType = enemy.definition.behaviorType;
  const canUseAttackAnimation = behaviorType <= 3;
  const canAttack = (candidate: EnemyCombatant) => behaviorType >= 2
    ? enemyHasPlayerWithinFacingRange(candidate, context.playerTileX, context.playerTileY, 3)
    : behaviorType <= 1 && enemyFacesPlayer(candidate, context.playerTileX, context.playerTileY);
  const startAttack = (candidate: EnemyCombatant) => withAnimationState({
    ...candidate,
    attackCooldownTicksRemaining: (candidate.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(candidate, 1) ? 2 : 1)) + 1,
    actionDelayTicksRemaining: candidate.definition.behaviorTiming[0],
    pursuitRetargetProgress: 0,
    attackAnimationTicksRemaining: attackTrackFrameCount,
    attackHitResolved: false,
  }, 2);
  const tryStartAttack = (candidate: EnemyCombatant) => {
    const candidateCooldown = candidate.attackCooldownTicksRemaining ?? cooldown;
    if (canUseAttackAnimation && candidateCooldown <= 0 && canAttack(candidate) &&
      attackTrackFrameCount !== undefined && attackTrackFrameCount > 0) {
      return startAttack(candidate);
    }
    return undefined;
  };
  if (canUseAttackAnimation && !wasMoving && cooldown <= 0 && canAttack(enemy) &&
    attackTrackFrameCount !== undefined && attackTrackFrameCount > 0) {
    return startAttack(enemy);
  }

  if (movingBetweenTiles) {
    const pursued = advanceEnemyPursuitTick(enemy, context);
    return { ...pursued, attackCooldownTicksRemaining: cooldown };
  }

  const pursued = advanceEnemyPursuitTick(enemy, {
    ...context,
    tryStartAttack: wasMoving ? tryStartAttack : undefined,
  });
  const pursuedCooldown = pursued.attackCooldownTicksRemaining ?? cooldown;
  return {
    ...pursued,
    attackCooldownTicksRemaining: pursued.animationStateIndex === 0
      ? Math.max(0, pursuedCooldown - 1)
      : pursuedCooldown,
  };
}
