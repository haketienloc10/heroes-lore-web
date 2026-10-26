import type { Direction } from './actor';
import type { EnemyCombatant } from './combat';
import type { BaseCollisionData, DynamicCollisionChange } from './map-data';
import {
  hasSourceEnemyStatus,
  resetSourceEnemyActionWhileBlocked,
  sourceEnemyActionIsBlocked,
} from './enemy-status';

const CB_ATTACK_TYPES = [1, 1, 2, 3, 2, 3] as const;
const CB_ATTACK_DURATIONS = [15, 9, 12] as const;
const CB_PATTERN_DELAYS = [2, 2, 12, 24, 12, 24] as const;
const CB_IDLE_UPDATES = 8;
const CB_WALK_UPDATES = 12;
const CB_ATTACK_UPDATES = 15;
const CARDINAL_DIRECTIONS: Direction[] = [1, 2, 3, 4];
const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};

export interface SourceCbAiContext {
  collision: BaseCollisionData;
  occupiedCellIndices: ReadonlySet<number>;
  playerTileX: number;
  playerTileY: number;
  randomInteger: (minimum: number, maximum: number) => number;
}

export interface SourceCbAiTickResult {
  enemy: EnemyCombatant;
  /** Immediate `an.a(ak, power, direction)` hit from the current boss action. */
  immediateHitPower?: number;
  /** Four cardinal `h` attacks spawned by boss pattern 2. */
  projectileDirections?: Direction[];
}

export interface SourceAqAiContext {
  playerTileX: number;
  playerTileY: number;
  /** Source `cj.f245a.nextInt()` used by inherited state-2 recovery. */
  rawRandomInteger: () => number;
}

/** Source overrides that do not enter `ak.n()` for this update keep running under sleep/stun. */
export function sourceCustomEnemyActionContinuesWhileBlocked(enemy: EnemyCombatant): boolean {
  return enemy.sourceCbAi !== undefined ||
    (enemy.sourceMap15Ai?.role === 'aj' && enemy.sourceMap15Ai.state === 3);
}

export interface SourceAqProjectileSpawn {
  tileX: number;
  tileY: number;
  direction: Direction;
  remainingSegments: number;
}

export interface SourceAqAiTickResult {
  enemy: EnemyCombatant;
  projectileSpawns?: SourceAqProjectileSpawn[];
}

export interface SourceMap13GroupProjectileSpawn {
  /** The source `h` constructor receives this exact first segment cell. */
  tileX: number;
  tileY: number;
  direction: Direction;
  remainingSegments: number;
}

export interface SourceMap13GroupEffectSpawn {
  tileX: number;
  tileY: number;
}

export interface SourceMap13GroupAttachedEffectSpawn extends SourceMap13GroupEffectSpawn {
  sourceOrder: number;
}

export interface SourceMap13GroupAiContext {
  enemies: readonly EnemyCombatant[];
  playerTileX: number;
  playerTileY: number;
}

export interface SourceMap13GroupAiTickResult {
  enemy: EnemyCombatant;
  immediateHitPower?: number;
  projectileSpawns?: SourceMap13GroupProjectileSpawn[];
  effectSpawns?: SourceMap13GroupEffectSpawn[];
  attachedEffectSpawns?: SourceMap13GroupAttachedEffectSpawn[];
  companionUpdate?: EnemyCombatant;
}

/** Reproduce the two `x` particles emitted by `af.k()` during its death countdown. */
export function sourceMap13AfDeathEffectSpawns(
  enemy: EnemyCombatant,
  deathUpdatesRemaining: number,
  randomInteger: (minimum: number, maximum: number) => number,
): SourceMap13GroupEffectSpawn[] {
  if (enemy.sourceBehavior !== 'map13-af' || enemy.state !== 'death-pending' ||
    deathUpdatesRemaining <= 8) return [];

  const sourceByte = (value: number): number => (value << 24) >> 24;
  const effects: SourceMap13GroupEffectSpawn[] = [];
  for (let index = 0; index < 2; index += 1) {
    effects.push({
      tileX: sourceByte(enemy.tileX + randomInteger(-2, 2)),
      tileY: sourceByte(enemy.tileY + randomInteger(-2, 2)),
    });
  }
  return effects;
}

function isOpen(
  tileX: number,
  tileY: number,
  context: SourceCbAiContext,
  occupied: ReadonlySet<number>,
): boolean {
  const { collision } = context;
  return tileX >= 0 && tileY >= 0 && tileX < collision.width && tileY < collision.height &&
    (collision.values[tileY]?.[tileX] ?? -1) >= 0 &&
    !occupied.has(tileY * collision.width + tileX);
}

function enterState(
  enemy: EnemyCombatant,
  state: 1 | 2 | 3,
  tick = 0,
): EnemyCombatant {
  const source = enemy.sourceCbAi!;
  return {
    ...enemy,
    sourceCbAi: { ...source, state, tick },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationFrameIndex: -1,
  };
}

function decrementSourceCooldowns(enemy: EnemyCombatant): EnemyCombatant {
  const source = enemy.sourceCbAi!;
  return {
    ...enemy,
    sourceCbAi: {
      ...source,
      tick: source.tick >= CB_IDLE_UPDATES ? 0 : source.tick,
      attackCooldown: Math.max(0, source.attackCooldown - 1),
      movementCooldown: Math.max(0, source.movementCooldown - 1),
    },
  };
}

function teleportBesidePlayer(
  enemy: EnemyCombatant,
  context: SourceCbAiContext,
): EnemyCombatant {
  const occupied = new Set(context.occupiedCellIndices);
  occupied.delete(enemy.tileY * context.collision.width + enemy.tileX);
  let targetX = -1;
  let targetY = -1;
  let attemptsRemaining = 3;
  while (attemptsRemaining > 0 && !isOpen(targetX, targetY, context, occupied)) {
    targetX = context.playerTileX > enemy.tileX
      ? context.randomInteger(enemy.tileX, context.playerTileX + 1)
      : context.randomInteger(context.playerTileX - 1, enemy.tileX);
    targetY = context.playerTileY > enemy.tileY
      ? context.randomInteger(enemy.tileY, context.playerTileY + 1)
      : context.randomInteger(context.playerTileY - 1, enemy.tileY);
    attemptsRemaining -= 1;
  }
  // The source loop rejects the final candidate if the third draw was needed.
  if (attemptsRemaining <= 0 || !isOpen(targetX, targetY, context, occupied)) return enemy;
  return {
    ...enemy,
    tileX: targetX,
    tileY: targetY,
    pixelX: targetX * 16,
    pixelY: targetY * 16,
  };
}

function moveBesidePlayer(
  enemy: EnemyCombatant,
  context: SourceCbAiContext,
): EnemyCombatant {
  const occupied = new Set(context.occupiedCellIndices);
  occupied.delete(enemy.tileY * context.collision.width + enemy.tileX);
  for (const direction of CARDINAL_DIRECTIONS) {
    const delta = DIRECTION_VECTOR[direction];
    const tileX = context.playerTileX + delta.x;
    const tileY = context.playerTileY + delta.y;
    if (!isOpen(tileX, tileY, context, occupied)) continue;
    return {
      ...enemy,
      tileX,
      tileY,
      pixelX: tileX * 16,
      pixelY: tileY * 16,
    };
  }
  return enemy;
}

function beginCbAttack(enemy: EnemyCombatant): EnemyCombatant {
  const source = enemy.sourceCbAi!;
  return enterState({
    ...enemy,
    sourceCbAi: {
      ...source,
      attackCooldown: enemy.definition.behaviorTiming[1] *
        (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1,
      movementCooldown: enemy.definition.behaviorTiming[0],
    },
  }, 3);
}

function checkCbRange(enemy: EnemyCombatant, horizontal: number, vertical: number): EnemyCombatant {
  const { sourceCbAi: source } = enemy;
  if (source === undefined || source.attackCooldown !== 0 || source.state !== 1) return enemy;
  const closeToAttack = source.attackType === 1
    ? horizontal < 4 && vertical < 4
    : source.attackType === 2
      ? horizontal * vertical === 0 && horizontal < 4 && vertical < 4
      : true;
  if (closeToAttack) return beginCbAttack(enemy);

  const tooFar = source.attackType === 1 || source.attackType === 2
    ? horizontal >= 4 || vertical >= 4
    : horizontal >= 3 || vertical >= 3;
  if (source.movementCooldown === 0 && tooFar) return enterState(enemy, 2);
  return enemy;
}

/** Advance one source `cb.d()` update for the map-11 enemy-32 subclass. */
export function advanceMap11CbAiTick(
  enemy: EnemyCombatant,
  context: SourceCbAiContext,
): SourceCbAiTickResult {
  const source = enemy.sourceCbAi;
  if (enemy.state !== 'alive' || source === undefined) return { enemy };

  let next: EnemyCombatant = {
    ...enemy,
    sourceCbAi: { ...source, tick: source.tick + 1 },
  };
  let horizontal = Math.abs(context.playerTileX - next.tileX);
  const vertical = Math.abs(context.playerTileY - next.tileY);
  let immediateHitPower: number | undefined;
  let projectileDirections: Direction[] | undefined;

  if (next.sourceCbAi!.state === 1) {
    next = checkCbRange(next, horizontal, vertical);
  } else if (next.sourceCbAi!.state === 2 && next.sourceCbAi!.tick >= CB_WALK_UPDATES) {
    next = enterState(next, 1);
    next = checkCbRange(next, horizontal, vertical);
  } else if (next.sourceCbAi!.state === 3 && next.sourceCbAi!.tick >= next.sourceCbAi!.attackDuration) {
    const patternIndex = (next.sourceCbAi!.patternIndex + 1) % CB_ATTACK_TYPES.length;
    next = {
      ...next,
      sourceCbAi: {
        ...next.sourceCbAi!,
        patternIndex,
        attackType: CB_ATTACK_TYPES[patternIndex],
        attackDuration: CB_ATTACK_DURATIONS[CB_ATTACK_TYPES[patternIndex] - 1],
        attackCooldown: CB_PATTERN_DELAYS[patternIndex],
        movementCooldown: CB_PATTERN_DELAYS[patternIndex],
      },
    };
    next = enterState(next, 1);
    next = checkCbRange(next, horizontal, vertical);
  }

  const state = next.sourceCbAi!.state;
  const tick = next.sourceCbAi!.tick;
  if (state === 2) {
    if (tick === 5) next = teleportBesidePlayer(next, context);
    if (tick >= CB_WALK_UPDATES) {
      next = { ...next, sourceCbAi: { ...next.sourceCbAi!, tick: 0 } };
    }
  } else if (state === 3) {
    if (next.sourceCbAi!.attackType === 1) {
      if (tick === 7) next = moveBesidePlayer(next, context);
      if (tick === 11) {
        horizontal = Math.abs(context.playerTileX - next.tileX);
        const currentVertical = Math.abs(context.playerTileY - next.tileY);
        if (horizontal + currentVertical <= 1) immediateHitPower = next.definition.attack;
      }
    } else if (next.sourceCbAi!.attackType === 2 && tick === 7) {
      projectileDirections = [...CARDINAL_DIRECTIONS];
    } else if (next.sourceCbAi!.attackType === 3 && tick === 4 &&
      horizontal <= 2 && vertical <= 2) {
      immediateHitPower = next.definition.attack * 2;
    }
  } else {
    next = decrementSourceCooldowns(next);
  }

  return {
    enemy: next,
    ...(immediateHitPower === undefined ? {} : { immediateHitPower }),
    ...(projectileDirections === undefined ? {} : { projectileDirections }),
  };
}

function enterAqState(
  enemy: EnemyCombatant,
  state: 1 | 2 | 3,
  tick: number,
  facing: Direction,
): EnemyCombatant {
  const source = enemy.sourceAqAi!;
  return {
    ...enemy,
    sourceAqAi: { ...source, state, tick, facing },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationDirection: facing,
    animationFrameIndex: -1,
  };
}

/** Apply the inherited `ak.n()` interruption to the stationary map-13 AQ subclass. */
export function resetMap13AqActionWhileBlocked(enemy: EnemyCombatant): EnemyCombatant {
  const initial = enemy.sourceAqAi;
  if (enemy.state !== 'alive' || initial === undefined || !sourceEnemyActionIsBlocked(enemy)) {
    return enemy;
  }

  const reset = resetSourceEnemyActionWhileBlocked(enemy);
  const cooldownMultiplier = hasSourceEnemyStatus(enemy, 1) ? 2 : 1;
  return {
    ...reset,
    sourceAqAi: {
      ...initial,
      state: 1,
      tick: 0,
      attackDelay: enemy.definition.behaviorTiming[1] * cooldownMultiplier,
      actionDelay: Math.max(0, enemy.definition.behaviorTiming[0] + initial.turnAccumulation - 1),
      turnAccumulation: 0,
    },
    animationStateIndex: 0,
    animationFrameIndex: -1,
    animationDirection: initial.facing,
  };
}

/** Advance the stationary map-13 `aq` boss through its source `ak`/`au` loop. */
export function advanceMap13AqAiTick(
  enemy: EnemyCombatant,
  context: SourceAqAiContext,
): SourceAqAiTickResult {
  const initial = enemy.sourceAqAi;
  if (enemy.state !== 'alive' || initial === undefined) return { enemy };

  let state = initial.state;
  let tick = initial.tick + 1;
  let attackDelay = initial.attackDelay;
  let actionDelay = initial.actionDelay;
  let turnAccumulation = initial.turnAccumulation;
  let facing = initial.facing;
  const horizontal = Math.abs(context.playerTileX - enemy.tileX);

  const startAttack = (): void => {
    state = 3;
    tick = 0;
    attackDelay = enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
    actionDelay = enemy.definition.behaviorTiming[0];
    turnAccumulation = 0;
  };
  const resetToIdle = (): void => {
    state = 1;
    tick = 0;
    attackDelay = enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
    actionDelay = enemy.definition.behaviorTiming[0];
    turnAccumulation = 0;
  };
  const chooseAqAction = (): void => {
    if (attackDelay === 0 && horizontal <= 1) {
      facing = 2;
      startAttack();
      return;
    }
    if (actionDelay !== 0) return;
    if (horizontal <= 1) {
      state = 1;
      facing = 2;
    } else {
      state = 2;
      facing = context.playerTileX > enemy.tileX ? 4 : 3;
    }
  };

  if (state === 1) {
    chooseAqAction();
  } else if (state === 2) {
    const reset = turnAccumulation >= enemy.definition.behaviorTiming[0] * 2 ||
      context.rawRandomInteger() <= 0;
    if (reset) {
      resetToIdle();
      chooseAqAction();
    } else {
      turnAccumulation += enemy.definition.behaviorTiming[0];
      actionDelay = 0;
      chooseAqAction();
    }
  } else if (tick >= initial.attackFrameCount) {
    resetToIdle();
    chooseAqAction();
  }

  let projectileSpawns: SourceAqProjectileSpawn[] | undefined;
  if (state === 3) {
    if (tick === 2) {
      projectileSpawns = [
        { tileX: enemy.tileX - 1, tileY: enemy.tileY, direction: facing, remainingSegments: 12 },
        { tileX: enemy.tileX + 1, tileY: enemy.tileY, direction: facing, remainingSegments: 12 },
        { tileX: enemy.tileX, tileY: enemy.tileY + 1, direction: facing, remainingSegments: 12 },
      ];
    }
  } else {
    if (state === 1 && tick >= initial.idleFrameCount) tick = 0;
    if (state === 2 && tick >= initial.walkFrameCount) tick = 0;
    attackDelay = Math.max(0, attackDelay - 1);
    actionDelay = Math.max(0, actionDelay - 1);
  }

  const next: EnemyCombatant = {
    ...enemy,
    sourceAqAi: {
      ...initial,
      state,
      tick,
      attackDelay,
      actionDelay,
      turnAccumulation,
      facing,
    },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationDirection: facing,
    ...(state !== initial.state || facing !== initial.facing ? { animationFrameIndex: -1 } : {}),
  };
  return {
    enemy: next,
    ...(projectileSpawns === undefined ? {} : { projectileSpawns }),
  };
}

function enterMap13GroupState(
  enemy: EnemyCombatant,
  state: 1 | 2 | 3,
  tick: number,
  facing: Direction,
): EnemyCombatant {
  return {
    ...enemy,
    sourceMap13Ai: { ...enemy.sourceMap13Ai!, state, tick, facing },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationDirection: facing,
    animationFrameIndex: -1,
  };
}

/** Apply the inherited `ak.n()` interruption to a linked map-13 subclass. */
export function resetMap13GroupActionWhileBlocked(enemy: EnemyCombatant): EnemyCombatant {
  const initial = enemy.sourceMap13Ai;
  if (enemy.state !== 'alive' || initial === undefined || !sourceEnemyActionIsBlocked(enemy)) {
    return enemy;
  }

  const reset = resetSourceEnemyActionWhileBlocked(enemy);
  const cooldownMultiplier = hasSourceEnemyStatus(enemy, 1) ? 2 : 1;
  return {
    ...reset,
    sourceMap13Ai: {
      ...initial,
      state: 1,
      tick: 0,
      // `ak.a(false)` sets i.i+1 (or 2*i.i+1); the following `ak.o()` consumes one.
      attackCooldown: enemy.definition.behaviorTiming[1] * cooldownMultiplier,
    },
    animationStateIndex: 0,
    animationFrameIndex: -1,
    animationDirection: initial.facing,
  };
}

function map13GroupMember(
  context: SourceMap13GroupAiContext,
  enemy: EnemyCombatant,
  behavior: 'map13-af' | 'map13-bc',
): EnemyCombatant | undefined {
  if (enemy.sourceGroupId === undefined) return undefined;
  return context.enemies.find((candidate) => candidate.sourceGroupId === enemy.sourceGroupId &&
    candidate.sourceBehavior === behavior);
}

function sourceMap13HealTarget(target: EnemyCombatant, sourceHealAmount: number): EnemyCombatant {
  const amount = sourceHealAmount;
  return { ...target, hp: Math.min(target.definition.maxHp, target.hp + amount) };
}

/** Advance one map-13 `af`/`bc`/`cc` subclass update from its source `ak` loop. */
export function advanceMap13GroupAiTick(
  enemy: EnemyCombatant,
  context: SourceMap13GroupAiContext,
): SourceMap13GroupAiTickResult {
  const initial = enemy.sourceMap13Ai;
  if (enemy.state !== 'alive' || initial === undefined) return { enemy };

  let next: EnemyCombatant = {
    ...enemy,
    sourceMap13Ai: { ...initial, tick: initial.tick + 1 },
  };
  let immediateHitPower: number | undefined;
  let projectileSpawns: SourceMap13GroupProjectileSpawn[] | undefined;
  let effectSpawns: SourceMap13GroupEffectSpawn[] | undefined;
  let attachedEffectSpawns: SourceMap13GroupAttachedEffectSpawn[] | undefined;
  let companionUpdate: EnemyCombatant | undefined;

  if (initial.state === 1) {
    if (initial.attackCooldown === 0) {
      const facing = enemy.sourceBehavior === 'map13-af' ? 2 : initial.facing;
      next = enterMap13GroupState({
        ...next,
        sourceMap13Ai: {
          ...next.sourceMap13Ai!,
          attackCooldown: enemy.definition.behaviorTiming[1] *
            (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1,
        },
      }, 3, 0, facing);
    } else {
      const tick = next.sourceMap13Ai!.tick >= initial.idleFrameCount
        ? 0
        : next.sourceMap13Ai!.tick;
      next = {
        ...next,
        sourceMap13Ai: {
          ...next.sourceMap13Ai!,
          tick,
          attackCooldown: Math.max(0, initial.attackCooldown - 1),
        },
      };
    }
  } else if (initial.state === 3 && next.sourceMap13Ai!.tick >= initial.attackFrameCount) {
    // `ak.a(false)` restores i.i+1, then `ak.o()` consumes one idle update.
    next = enterMap13GroupState({
      ...next,
      sourceMap13Ai: {
        ...next.sourceMap13Ai!,
        attackCooldown: enemy.definition.behaviorTiming[1] *
          (hasSourceEnemyStatus(enemy, 1) ? 2 : 1),
        sampledPlayerTileX: null,
        sampledPlayerTileY: null,
      },
    }, 1, 0, initial.facing);
  } else if (initial.state === 3) {
    const attackTick = next.sourceMap13Ai!.tick;
    if (enemy.sourceBehavior === 'map13-af' && attackTick === 2) {
      projectileSpawns = [
        { tileX: enemy.tileX - 1, tileY: enemy.tileY - 1, direction: initial.facing, remainingSegments: 12 },
        { tileX: enemy.tileX + 3, tileY: enemy.tileY - 1, direction: initial.facing, remainingSegments: 12 },
        { tileX: enemy.tileX, tileY: enemy.tileY, direction: initial.facing, remainingSegments: 12 },
        { tileX: enemy.tileX + 2, tileY: enemy.tileY, direction: initial.facing, remainingSegments: 12 },
        { tileX: enemy.tileX + 1, tileY: enemy.tileY + 1, direction: initial.facing, remainingSegments: 12 },
      ];
    } else if (enemy.sourceBehavior === 'map13-bc' && attackTick === 4) {
      effectSpawns = [{ tileX: context.playerTileX, tileY: context.playerTileY }];
      next = {
        ...next,
        sourceMap13Ai: {
          ...next.sourceMap13Ai!,
          sampledPlayerTileX: context.playerTileX,
          sampledPlayerTileY: context.playerTileY,
        },
      };
    } else if (enemy.sourceBehavior === 'map13-bc' && attackTick === 7 &&
      initial.sampledPlayerTileX === context.playerTileX &&
      initial.sampledPlayerTileY === context.playerTileY) {
      immediateHitPower = enemy.definition.attack;
    } else if (enemy.sourceBehavior === 'map13-cc' && attackTick === 5) {
      const af = map13GroupMember(context, enemy, 'map13-af');
      const bc = map13GroupMember(context, enemy, 'map13-bc');
      const targets = [af, bc, next];
      const lowTarget = targets.find((target) => target !== undefined && target.state === 'alive' &&
        target.hp < target.definition.maxHp / 2);
      let healingTarget = lowTarget;
      if (healingTarget === undefined) {
        const target = targets[initial.supportCycle];
        const supportCycle = ((initial.supportCycle + 1) % 3) as 0 | 1 | 2;
        next = {
          ...next,
          sourceMap13Ai: { ...next.sourceMap13Ai!, supportCycle },
        };
        if (target !== undefined && target.hp < target.definition.maxHp) healingTarget = target;
      }
      if (healingTarget !== undefined) {
        // `cc.a(ak)` reads the linked `af` maximum HP for every target's heal amount.
        const healerSource = af ?? next;
        const amount = Math.floor(healerSource.definition.maxHp / 10);
        attachedEffectSpawns = [{
          sourceOrder: healingTarget.sourceOrder,
          tileX: healingTarget.tileX,
          tileY: healingTarget.tileY,
        }];
        if (healingTarget.sourceOrder === next.sourceOrder) {
          next = {
            ...next,
            hp: Math.min(next.definition.maxHp, next.hp + amount),
          };
        } else {
          companionUpdate = sourceMap13HealTarget(healingTarget, amount);
        }
      }
    }
  }

  return {
    enemy: next,
    ...(immediateHitPower === undefined ? {} : { immediateHitPower }),
    ...(projectileSpawns === undefined ? {} : { projectileSpawns }),
    ...(effectSpawns === undefined ? {} : { effectSpawns }),
    ...(attachedEffectSpawns === undefined ? {} : { attachedEffectSpawns }),
    ...(companionUpdate === undefined ? {} : { companionUpdate }),
  };
}

export interface SourceMap15AttackerContext {
  playerTileX: number;
  playerTileY: number;
  rawRandomInteger: () => number;
  idleFrameCount: number;
  walkFrameCount: number;
  attackFrameCountForDirection: (direction: Direction) => number;
}

export interface SourceMap15AiTickResult {
  enemy: EnemyCombatant;
  immediateHitPower?: number;
  cameraShakeOffset?: { x: number; y: number };
  /** `cf` calls `an.a((byte) 2, (byte) 16)` before this full-power hit. */
  knockbackDirection?: Direction;
  knockbackPixels?: number;
  occupancyChanged?: boolean;
}

function enterMap15AttackerState(
  enemy: EnemyCombatant,
  state: 1 | 2 | 3,
  tick: number,
  attackDelay: number,
  actionDelay: number,
  turnAccumulation: number,
  facing: Direction,
  lifetimeTicks: number,
  attackPhase: 1 | 2,
): EnemyCombatant {
  const initial = enemy.sourceMap15Ai;
  if (initial === undefined || initial.role === 'cf') return enemy;
  const renderDirection = initial.role === 'az' || state !== 3 ? 1 : attackPhase;
  return {
    ...enemy,
    sourceMap15Ai: {
      ...initial,
      state,
      tick,
      attackDelay,
      actionDelay,
      turnAccumulation,
      facing,
      lifetimeTicks,
      attackPhase,
    },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationDirection: renderDirection,
    ...(state !== initial.state || facing !== initial.facing || renderDirection !== enemy.animationDirection
      ? { animationFrameIndex: -1 }
      : {}),
  };
}

/** Apply `ak.a(false)` plus that update's `ak.o()` cooldown tick to map-15 actors. */
export function resetMap15ActionWhileBlocked(enemy: EnemyCombatant): EnemyCombatant {
  const initial = enemy.sourceMap15Ai;
  if (enemy.state !== 'alive' || initial === undefined || !sourceEnemyActionIsBlocked(enemy) ||
    (initial.role === 'aj' && initial.state === 3)) return enemy;

  const reset = resetSourceEnemyActionWhileBlocked(enemy);
  const cooldownMultiplier = hasSourceEnemyStatus(enemy, 1) ? 2 : 1;
  const turnAccumulation = initial.role === 'cf' ? 0 : initial.turnAccumulation;
  const actionDelay = Math.max(0,
    enemy.definition.behaviorTiming[0] + turnAccumulation - 1);
  const sourceMap15Ai = initial.role === 'cf'
    ? {
      ...initial,
      state: 1 as const,
      tick: 0,
      attackDelay: enemy.definition.behaviorTiming[1] * cooldownMultiplier,
      actionDelay,
    }
    : {
      ...initial,
      state: 1 as const,
      tick: 0,
      attackDelay: enemy.definition.behaviorTiming[1] * cooldownMultiplier,
      actionDelay,
      turnAccumulation: 0,
      // `az.d()` and `aj.d()` advance their source lifetime before calling `ak.n()`.
      lifetimeTicks: initial.lifetimeTicks + 1,
    };
  return {
    ...reset,
    sourceMap15Ai,
    animationStateIndex: 0,
    animationFrameIndex: -1,
    animationDirection: initial.role === 'cf' ? initial.facing : 1,
  };
}

function map15AttackerTargetOffset(enemy: EnemyCombatant, playerTileY: number): number {
  // Both subclasses compare the player row to `(entityY - 2)`.
  return playerTileY - (enemy.tileY - 2);
}

/** Advance one source `az.d()`/`aj.d()` update, including the paired `aj.w` strikes. */
export function advanceMap15AttackerAiTick(
  enemy: EnemyCombatant,
  context: SourceMap15AttackerContext,
): SourceMap15AiTickResult {
  const initial = enemy.sourceMap15Ai;
  if (enemy.state !== 'alive' || initial === undefined || initial.role === 'cf' ||
    initial.state === 5) return { enemy };

  const role = initial.role;
  let state = initial.state;
  let tick = initial.tick + 1;
  let attackDelay = initial.attackDelay;
  let actionDelay = initial.actionDelay;
  let turnAccumulation = initial.turnAccumulation;
  let facing = initial.facing;
  let lifetimeTicks = initial.lifetimeTicks + 1;
  let attackPhase = initial.attackPhase;
  let immediateHitPower: number | undefined;
  let cameraShakeOffset: { x: number; y: number } | undefined;
  const turnThreshold = lifetimeTicks > 100 ? 0 : 2;

  const enterIdle = (): void => {
    state = 1;
    tick = 0;
    attackDelay = enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
    actionDelay = turnThreshold + turnAccumulation;
    turnAccumulation = 0;
  };
  const beginAttack = (): void => {
    state = 3;
    tick = 0;
    attackDelay = enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
    actionDelay = turnThreshold + turnAccumulation;
    turnAccumulation = 0;
    if (role === 'aj') {
      attackPhase = attackPhase === 1 ? 2 : 1;
      facing = attackPhase;
    }
  };
  const chooseAction = (): void => {
    const offset = map15AttackerTargetOffset(enemy, context.playerTileY);
    if (attackDelay === 0 && (role === 'az'
      ? offset >= -2 && offset <= 3 && context.playerTileX <= enemy.tileX + 5
      : offset >= -1 && offset <= 2 && context.playerTileX >= enemy.tileX - 7)) {
      beginAttack();
      return;
    }
    if (actionDelay !== 0) return;
    if (role === 'az') {
      if (offset > 3) {
        state = 2;
        facing = 2;
      } else if (offset < -2) {
        state = 2;
        facing = 1;
      } else {
        state = 1;
        facing = 2;
      }
    } else if (offset > 2) {
      state = 2;
      facing = 2;
    } else if (offset < -1) {
      state = 2;
      facing = 1;
    } else {
      state = 1;
      facing = 2;
    }
  };

  if (state === 1) {
    chooseAction();
  } else if (state === 2) {
    const aligned = enemy.pixelY % 16 === 0;
    if (aligned) {
      if (turnAccumulation >= turnThreshold * 2 || context.rawRandomInteger() <= 0) {
        enterIdle();
        chooseAction();
      } else {
        turnAccumulation += turnThreshold;
        actionDelay = 0;
        chooseAction();
      }
    }
  } else if (tick >= context.attackFrameCountForDirection(
    role === 'az' ? 1 : attackPhase,
  )) {
    enterIdle();
    chooseAction();
  }

  let pixelY = enemy.pixelY;
  let tileY = enemy.tileY;
  if (state === 2) {
    if (facing === 1) pixelY -= 8;
    else if (facing === 2) pixelY += 8;
    tileY = pixelY >> 4;
    if (tick >= context.walkFrameCount) tick = 0;
  } else if (state === 1) {
    if (tick >= context.idleFrameCount) tick = 0;
    attackDelay = Math.max(0, attackDelay - 1);
    actionDelay = Math.max(0, actionDelay - 1);
  } else if (state === 3) {
    if (role === 'az' && tick === 6) cameraShakeOffset = { x: 2, y: 3 };
    else if (role === 'az' && tick === 7) cameraShakeOffset = { x: -3, y: -1 };
    else if (role === 'az' && tick === 8) cameraShakeOffset = { x: 2, y: -3 };
    if (role === 'az' && tick === 5 &&
      context.playerTileX >= enemy.tileX + 2 && context.playerTileX <= enemy.tileX + 5 &&
      context.playerTileY >= enemy.tileY - 4 && context.playerTileY <= enemy.tileY + 1) {
      immediateHitPower = enemy.definition.attack;
      // `az.j()` resets its private lifetime counter and restores `i.h` to 2
      // after the in-range frame-five strike callback.
      lifetimeTicks = 0;
    } else if (role === 'aj' && attackPhase === 1 && tick === 5 &&
      context.playerTileX >= enemy.tileX - 7 && context.playerTileX <= enemy.tileX - 1 &&
      context.playerTileY >= enemy.tileY - 3 && context.playerTileY <= enemy.tileY) {
      immediateHitPower = enemy.definition.attack;
    } else if (role === 'aj' && attackPhase === 2 && tick === 8 &&
      context.playerTileX >= enemy.tileX - 5 && context.playerTileX <= enemy.tileX - 1 &&
      context.playerTileY >= enemy.tileY - 3 && context.playerTileY <= enemy.tileY) {
      immediateHitPower = enemy.definition.attack;
      lifetimeTicks = 0;
    }
  }

  const next = enterMap15AttackerState(
    {
      ...enemy,
      pixelY,
      tileY,
    },
    state,
    tick,
    attackDelay,
    actionDelay,
    turnAccumulation,
    facing,
    lifetimeTicks,
    attackPhase,
  );
  return {
    enemy: next,
    ...(immediateHitPower === undefined ? {} : { immediateHitPower }),
    ...(cameraShakeOffset === undefined ? {} : { cameraShakeOffset }),
    ...(pixelY === enemy.pixelY ? {} : { occupancyChanged: true }),
  };
}

export interface SourceMap15HazardContext {
  playerTileX: number;
  playerTileY: number;
  playerOccupiedCellIndices?: ReadonlySet<number>;
  mapWidth?: number;
  idleFrameCount: number;
  walkFrameCount: number;
  attackFrameCount: number;
}

/** Advance the stationary `cf` cadence and its moving four-cell attack row. */
export function advanceMap15HazardAiTick(
  enemy: EnemyCombatant,
  context: SourceMap15HazardContext,
): SourceMap15AiTickResult {
  const initial = enemy.sourceMap15Ai;
  if (enemy.state !== 'alive' || initial === undefined || initial.role !== 'cf' ||
    initial.state === 5) return { enemy };

  let state = initial.state;
  let tick = initial.tick + 1;
  let attackDelay = initial.attackDelay;
  let actionDelay = initial.actionDelay;
  let facing = initial.facing;
  let attacksSinceRest = initial.attacksSinceRest;
  let hazardRow = initial.hazardRow;
  let immediateHitPower: number | undefined;
  let knockbackDirection: Direction | undefined;
  let knockbackPixels: number | undefined;

  if (state === 2) {
    if (tick >= context.walkFrameCount) state = 1;
  } else if (state === 1) {
    if (attacksSinceRest >= 3 && attackDelay === 0) {
      attackDelay = 40;
      attacksSinceRest = 0;
    } else if (attackDelay === 0) {
      state = 3;
      tick = 0;
      facing = 2;
      attackDelay = enemy.definition.behaviorTiming[1] *
        (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
      attacksSinceRest += 1;
    }
  } else if (tick >= context.attackFrameCount) {
    state = 1;
    tick = 0;
    attackDelay = enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1) + 1;
  } else {
    let targetRow: number | undefined;
    if (tick >= 6 && tick <= 9) targetRow = enemy.tileY + tick - 6;
    else if (tick === 11) targetRow = enemy.tileY + 4;
    if (targetRow !== undefined) {
      hazardRow = targetRow;
      const playerOnHazardRow = context.playerOccupiedCellIndices !== undefined &&
        context.mapWidth !== undefined
        ? [6, 7, 8, 9].some((x) =>
          context.playerOccupiedCellIndices!.has(targetRow! * context.mapWidth! + x))
        : context.playerTileX >= 6 && context.playerTileX <= 9 && context.playerTileY === targetRow;
      if (playerOnHazardRow) {
        immediateHitPower = enemy.definition.attack;
        knockbackDirection = 2;
        knockbackPixels = 16;
      }
    } else if (tick === 12) {
      hazardRow = null;
      if (context.playerTileX >= 6 && context.playerTileX <= 9 &&
        context.playerTileY >= enemy.tileY + 5 && context.playerTileY <= enemy.tileY + 8) {
        immediateHitPower = Math.floor(enemy.definition.attack / 2);
      }
    }
  }

  if (state === 1) {
    if (tick >= context.idleFrameCount) tick = 0;
    attackDelay = Math.max(0, attackDelay - 1);
    actionDelay = Math.max(0, actionDelay - 1);
  } else if (state === 2 && tick >= context.walkFrameCount) {
    tick = 0;
  }

  const next: EnemyCombatant = {
    ...enemy,
    sourceMap15Ai: {
      ...initial,
      state,
      tick,
      attackDelay,
      actionDelay,
      facing,
      attacksSinceRest,
      hazardRow,
    },
    animationStateIndex: state === 1 ? 0 : state === 2 ? 1 : 2,
    animationDirection: facing,
    ...(state !== initial.state || facing !== initial.facing
      ? { animationFrameIndex: -1 }
      : {}),
  };
  return {
    enemy: next,
    ...(immediateHitPower === undefined ? {} : { immediateHitPower }),
    ...(knockbackDirection === undefined ? {} : { knockbackDirection }),
    ...(knockbackPixels === undefined ? {} : { knockbackPixels }),
    ...(hazardRow === initial.hazardRow ? {} : { occupancyChanged: true }),
  };
}

/** Begin `au` death state 5; `cf.m()` also clears the moving rows above its body. */
export function enterMap15SourceDeathState(enemy: EnemyCombatant): EnemyCombatant {
  const initial = enemy.sourceMap15Ai;
  if (enemy.state !== 'death-pending' || initial === undefined || initial.state === 5) return enemy;
  return {
    ...enemy,
    sourceMap15Ai: {
      ...initial,
      state: 5,
      tick: 0,
      ...(initial.role !== 'cf' ? {} : {
        hazardRow: initial.hazardRow !== null && initial.hazardRow > enemy.tileY
          ? null
          : initial.hazardRow,
        collisionSettled: false,
      }),
    },
    animationStateIndex: initial.role === 'cf' ? 2 : 0,
    animationFrameIndex: -1,
  };
}

/** `cf.l()` runs on the update after q reaches zero and leaves its corpse in place. */
export function advanceMap15HazardDeathTick(enemy: EnemyCombatant): EnemyCombatant {
  const source = enemy.sourceMap15Ai;
  if (enemy.state !== 'death-pending' || source?.role !== 'cf' || source.state !== 5 ||
    source.collisionSettled) return enemy;
  if (enemy.deathUpdatesRemaining > 0) {
    return { ...enemy, deathUpdatesRemaining: enemy.deathUpdatesRemaining - 1 };
  }
  return {
    ...enemy,
    sourceMap15Ai: { ...source, collisionSettled: true },
  };
}

/** Exact collision-only writes performed once by `cf.l()` after its death delay. */
export function sourceMap15HazardCollisionWrites(enemy: EnemyCombatant): DynamicCollisionChange[] {
  if (enemy.sourceBehavior !== 'map15-cf' || enemy.sourceMap15Ai?.role !== 'cf' ||
    !enemy.sourceMap15Ai.collisionSettled) return [];
  const writes: DynamicCollisionChange[] = [];
  for (let y = enemy.tileY; y <= enemy.tileY + 2; y += 1) {
    for (let x = 6; x <= 9; x += 1) writes.push({ tileX: x, tileY: y, collisionValue: 1 });
  }
  return writes;
}
