import type { EnemyCombatant, SourceEnemyStatusId } from './combat';

export const SOURCE_ENEMY_STATUS_DURATION_TICKS = 40;
export const SOURCE_ENEMY_POISON_TICK_PERIOD = 8;

export interface SourceEnemyStatusTickResult {
  enemy: EnemyCombatant;
  poisonDamage: number;
}

export function hasSourceEnemyStatus(
  enemy: Pick<EnemyCombatant, 'sourceStatusEffects'>,
  id: SourceEnemyStatusId,
): boolean {
  return enemy.sourceStatusEffects?.some((effect) => effect.id === id) ?? false;
}

/** Statuses 0/2 force source `ak.n()` back to its idle state each update. */
export function sourceEnemyActionIsBlocked(enemy: Pick<EnemyCombatant, 'sourceStatusEffects'>): boolean {
  return hasSourceEnemyStatus(enemy, 0) || hasSourceEnemyStatus(enemy, 2);
}

/** Apply `ak.a(false)` and the following idle `ak.o()` cooldown update. */
export function resetSourceEnemyActionWhileBlocked(enemy: EnemyCombatant): EnemyCombatant {
  if (enemy.state !== 'alive' || !sourceEnemyActionIsBlocked(enemy)) return enemy;
  return {
    ...enemy,
    animationStateIndex: 0,
    animationFrameIndex: -1,
    attackCooldownTicksRemaining: enemy.definition.behaviorTiming[1] *
      (hasSourceEnemyStatus(enemy, 1) ? 2 : 1),
    actionDelayTicksRemaining: Math.max(0, enemy.definition.behaviorTiming[0] - 1),
    pursuitRetargetProgress: 0,
    pursuitTarget: null,
    attackAnimationTicksRemaining: 0,
    attackHitResolved: false,
  };
}

/** Advance source `ak.s()` and apply poison's `g.a(15, 25)` pulse if due. */
export function advanceSourceEnemyStatuses(
  enemy: EnemyCombatant,
  randomInteger: (minimum: number, maximum: number) => number,
): SourceEnemyStatusTickResult {
  // `au.d()` and its custom overrides bypass private `ak.s()`, which advances `ce` effects.
  if (enemy.sourceAu === true) return { enemy, poisonDamage: 0 };
  if ((enemy.state !== 'alive' && enemy.state !== 'death-pending') ||
    enemy.sourceStatusEffects === undefined || enemy.sourceStatusEffects.length === 0) {
    return { enemy, poisonDamage: 0 };
  }

  let poisonDamage = 0;
  const sourceStatusEffects = enemy.sourceStatusEffects.flatMap((effect) => {
    const ticksElapsed = effect.ticksElapsed + 1;
    if (effect.id === 3 && ticksElapsed % SOURCE_ENEMY_POISON_TICK_PERIOD === 0) {
      const damage = randomInteger(15, 25);
      if (!Number.isInteger(damage) || damage < 15 || damage > 25) {
        throw new RangeError('Enemy poison damage roll must be an integer from 15 through 25');
      }
      poisonDamage += damage;
    }
    return ticksElapsed < SOURCE_ENEMY_STATUS_DURATION_TICKS
      ? [{ ...effect, ticksElapsed }]
      : [];
  });
  const hp = Math.max(0, enemy.hp - poisonDamage);
  const newlyDefeated = enemy.state === 'alive' && hp === 0;
  return {
    enemy: {
      ...enemy,
      ...(sourceStatusEffects.length === 0 ? { sourceStatusEffects: [] } : { sourceStatusEffects }),
      hp,
      state: hp === 0 ? 'death-pending' : enemy.state,
      deathUpdatesRemaining: newlyDefeated
        ? enemy.deathUpdatesBeforeRemoval ?? 3
        : hp === 0 ? enemy.deathUpdatesRemaining : 0,
      respawnDelayRemaining: hp === 0 ? null : enemy.respawnDelayRemaining,
    },
    poisonDamage,
  };
}
