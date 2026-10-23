import { describe, expect, it, vi } from 'vitest';
import {
  advancePlayerStatusTick,
  applyPlayerPoison,
  createPlayerStatusState,
  enemyHitAppliesPoison,
  POISON_STATUS_DURATION_TICKS,
  retainPlayerStatusEffects,
} from '../src/world/player-status';

describe('source player poison status', () => {
  it('applies and refreshes status 7 with a fresh timer', () => {
    const applied = applyPlayerPoison(createPlayerStatusState());
    expect(applied).toEqual({ effects: [7], poisonTicksElapsed: 0 });
    const refreshed = applyPlayerPoison({ effects: [2, 7], poisonTicksElapsed: 39 });
    expect(refreshed).toEqual({ effects: [2, 7], poisonTicksElapsed: 0 });
  });

  it('ticks every ten updates, uses source damage values, and expires at update 80', () => {
    let state = applyPlayerPoison(createPlayerStatusState());
    let hp = 72;
    const pulses: Array<{ hpLoss: number; damageNumber: number }> = [];
    for (let tick = 1; tick <= POISON_STATUS_DURATION_TICKS; tick += 1) {
      const result = advancePlayerStatusTick(state, hp, 72);
      state = result.state;
      hp = result.hp;
      if (result.poisonPulse) pulses.push({ hpLoss: result.hpLoss, damageNumber: result.damageNumber });
      if (tick < 10) expect(result.hpLoss).toBe(0);
    }
    expect(pulses).toHaveLength(8);
    expect(pulses).toEqual(Array.from({ length: 8 }, () => ({ hpLoss: 2, damageNumber: 6 })));
    expect(hp).toBe(56);
    expect(state).toEqual({ effects: [], poisonTicksElapsed: null });
  });

  it('never lowers HP below one and clears the timer when Antidote removes status 7', () => {
    let state = applyPlayerPoison(createPlayerStatusState());
    for (let tick = 0; tick < 9; tick += 1) {
      state = advancePlayerStatusTick(state, 2, 72).state;
    }
    const pulse = advancePlayerStatusTick(state, 2, 72);
    expect(pulse).toMatchObject({ hp: 1, hpLoss: 1, poisonPulse: true, damageNumber: 6 });
    state = retainPlayerStatusEffects(pulse.state, [3]);
    expect(state).toEqual({ effects: [3], poisonTicksElapsed: null });
    expect(advancePlayerStatusTick(state, 1, 72)).toMatchObject({ hp: 1, hpLoss: 0 });
  });

  it('uses the 15-percent source roll only for a non-evaded behavior-1 hit', () => {
    const roll = vi.fn(() => 14);
    expect(enemyHitAppliesPoison(1, false, roll)).toBe(true);
    expect(roll).toHaveBeenCalledWith(0, 99);
    expect(enemyHitAppliesPoison(1, true, roll)).toBe(false);
    expect(enemyHitAppliesPoison(0, false, roll)).toBe(false);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('resists the 15-percent status roll when it returns 15 or higher', () => {
    expect(enemyHitAppliesPoison(1, false, () => 15)).toBe(false);
  });
});
