import { describe, expect, it } from 'vitest';
import { createEnemyCombatants, parseEnemyDataTable, type EnemyCombatant } from '../src/world/combat';
import {
  advanceSourceEnemyStatuses,
  hasSourceEnemyStatus,
  resetSourceEnemyActionWhileBlocked,
  SOURCE_ENEMY_POISON_TICK_PERIOD,
  SOURCE_ENEMY_STATUS_DURATION_TICKS,
  sourceEnemyActionIsBlocked,
} from '../src/world/enemy-status';

function statusEnemy(): EnemyCombatant {
  const table = parseEnemyDataTable({
    format: 'heroes-lore-enemy-data-v1',
    variant: 0,
    records: Array.from({ length: 43 }, (_, index) => ({
      index,
      labelToken: '580',
      baseCode: 1,
      packedAttributes: { classCode: 0, shapeCode: 0, elementCode: 0, variantCode: 0 },
      statusFlags: { bit3: false },
      maxHp: 250,
      attack: 9,
      defense: 5,
      evasion: 0,
      behaviorCodes: [3, 11, 10],
      respawnDelay: 300,
      dropCandidates: [[7, 0, 25]],
    })),
  });
  return createEnemyCombatants([{ tileX: 10, tileY: 10, enemyId: 24, sourceOrder: 1 }], table)[0];
}

describe('source enemy status effects', () => {
  it('advances ordinary offscreen statuses before the actor update returns early', () => {
    const offscreen = {
      ...statusEnemy(),
      sourceRenderedOnScreen: false,
      sourceStatusEffects: [{ id: 3 as const, ticksElapsed: 7 }],
    };
    const result = advanceSourceEnemyStatuses(offscreen, (minimum, maximum) => {
      expect([minimum, maximum]).toEqual([15, 25]);
      return 21;
    });
    expect(result.poisonDamage).toBe(21);
    expect(result.enemy.hp).toBe(offscreen.hp - 21);
    expect(result.enemy.sourceStatusEffects).toEqual([{ id: 3, ticksElapsed: 8 }]);
  });

  it('uses the source 40-update duration and eight-update poison pulse', () => {
    const initial = {
      ...statusEnemy(),
      sourceStatusEffects: [{ id: 3 as const, ticksElapsed: 0 }],
    };
    expect(SOURCE_ENEMY_STATUS_DURATION_TICKS).toBe(40);
    expect(SOURCE_ENEMY_POISON_TICK_PERIOD).toBe(8);
    let enemy: EnemyCombatant = initial;
    let draws = 0;
    let damageTotal = 0;
    for (let tick = 1; tick <= 40; tick += 1) {
      const result = advanceSourceEnemyStatuses(enemy, (minimum, maximum) => {
        draws += 1;
        expect([minimum, maximum]).toEqual([15, 25]);
        return 20;
      });
      enemy = result.enemy;
      damageTotal += result.poisonDamage;
      expect(result.poisonDamage).toBe(tick % 8 === 0 ? 20 : 0);
    }
    expect(draws).toBe(5);
    expect(damageTotal).toBe(100);
    expect(enemy.hp).toBe(150);
    expect(enemy.sourceStatusEffects).toEqual([]);
  });

  it('keeps au-subclass statuses without ticking their timers or poison pulses', () => {
    const enemy = {
      ...statusEnemy(),
      sourceAu: true,
      sourceStatusEffects: [
        { id: 0 as const, ticksElapsed: 39 },
        { id: 3 as const, ticksElapsed: 7 },
      ],
    };
    const result = advanceSourceEnemyStatuses(enemy, () => {
      throw new Error('au.d() does not call the source ak.s() status update.');
    });
    expect(result.enemy).toBe(enemy);
    expect(result.poisonDamage).toBe(0);
    expect(sourceEnemyActionIsBlocked(result.enemy)).toBe(true);
  });

  it('refreshes status state without changing unrelated statuses', () => {
    const enemy = {
      ...statusEnemy(),
      sourceStatusEffects: [
        { id: 0 as const, ticksElapsed: 10 },
        { id: 3 as const, ticksElapsed: 4 },
      ],
    };
    expect(hasSourceEnemyStatus(enemy, 0)).toBe(true);
    expect(sourceEnemyActionIsBlocked(enemy)).toBe(true);
    const updated = {
      ...enemy,
      sourceStatusEffects: enemy.sourceStatusEffects.map((effect) => effect.id === 0
        ? { ...effect, ticksElapsed: 0 }
        : effect),
    };
    const tick = advanceSourceEnemyStatuses(updated, () => {
      throw new Error('Poison is not due yet.');
    });
    expect(tick.enemy.sourceStatusEffects).toEqual([
      { id: 0, ticksElapsed: 1 },
      { id: 3, ticksElapsed: 5 },
    ]);
  });

  it('keeps a blocked enemy idle at the post-update cooldown when both are active', () => {
    const enemy = {
      ...statusEnemy(),
      animationStateIndex: 2 as const,
      attackAnimationTicksRemaining: 3,
      pursuitTarget: 'player' as const,
      sourceStatusEffects: [
        { id: 1 as const, ticksElapsed: 0 },
        { id: 2 as const, ticksElapsed: 0 },
      ],
    };
    const reset = resetSourceEnemyActionWhileBlocked(enemy);
    expect(reset.animationStateIndex).toBe(0);
    expect(reset.attackAnimationTicksRemaining).toBe(0);
    expect(reset.attackCooldownTicksRemaining).toBe(enemy.definition.behaviorTiming[1] * 2);
    expect(reset.actionDelayTicksRemaining).toBe(enemy.definition.behaviorTiming[0] - 1);
    expect(reset.pursuitTarget).toBeNull();
  });
});
