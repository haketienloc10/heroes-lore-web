import { describe, expect, it } from 'vitest';
import {
  advancePlayerRecoveryTick,
  createPlayerRecoveryState,
  SOURCE_INITIAL_HP_RECOVERY_TIMER,
  SOURCE_INITIAL_SP_RECOVERY_TIMER,
} from '../src/world/player-recovery';
import type { PlayerRecoveryActivity, PlayerRecoveryVitals } from '../src/world/player-recovery';

const vitals: PlayerRecoveryVitals = {
  level: 1,
  attributes: { power: 8, hp: 5, agility: 3, will: 4 },
  hp: 40,
  maxHp: 72,
  sp: 10,
  maxSp: 60,
};

function advance(
  state: ReturnType<typeof createPlayerRecoveryState>,
  activity: PlayerRecoveryActivity,
  count: number,
  current = vitals,
) {
  let result = {
    state,
    hp: current.hp,
    sp: current.sp,
    hpChange: 0,
    spChange: 0,
  };
  for (let tick = 0; tick < count; tick += 1) {
    result = advancePlayerRecoveryTick(result.state, activity, {
      ...current,
      hp: result.hp,
      sp: result.sp,
    });
  }
  return result;
}

describe('source player HP/SP recovery', () => {
  it('starts with the source constructor timers and restores HP/SP at different idle rates', () => {
    expect(createPlayerRecoveryState()).toEqual({
      hpTimer: SOURCE_INITIAL_HP_RECOVERY_TIMER,
      spTimer: SOURCE_INITIAL_SP_RECOVERY_TIMER,
    });
    const sevenIdleTicks = advance(createPlayerRecoveryState(), 'idle', 7);
    expect(sevenIdleTicks).toMatchObject({ hp: 40, sp: 14, state: { hpTimer: 53, spTimer: 21 } });

    const firstHpPulse = advance(createPlayerRecoveryState(), 'idle', 34);
    expect(firstHpPulse).toMatchObject({ hp: 45, sp: 26, state: { hpTimer: 68, spTimer: 3 } });
  });

  it('recovers more slowly while walking and uses the effective HP/Will attributes', () => {
    const walking = advance(createPlayerRecoveryState(), 'walking', 67, {
      ...vitals,
      attributes: { ...vitals.attributes, hp: 7, will: 6 },
    });
    expect(walking).toMatchObject({
      hp: 47,
      sp: 28,
      state: { hpTimer: 68, spTimer: 17 },
    });
  });

  it('does not count recovery timers during other action states and clamps gains to maxima', () => {
    const paused = advance(createPlayerRecoveryState(), 'other', 100);
    expect(paused).toMatchObject({ hp: 40, sp: 10, state: { hpTimer: 67, spTimer: 21 } });

    const atMaximum = advance(createPlayerRecoveryState(), 'idle', 34, {
      ...vitals,
      hp: 72,
      sp: 60,
    });
    expect(atMaximum).toMatchObject({ hp: 72, sp: 60, state: { hpTimer: 68, spTimer: 3 } });
  });

  it('keeps the HP interval capped at the source byte timer and can freeze outside gameplay', () => {
    const highLevel: PlayerRecoveryVitals = { ...vitals, level: 99 };
    let result = {
      state: { hpTimer: 1, spTimer: 1 },
      hp: highLevel.hp,
      sp: highLevel.sp,
      hpChange: 0,
      spChange: 0,
    };
    result = advancePlayerRecoveryTick(result.state, 'idle', highLevel);
    expect(result.state).toEqual({ hpTimer: 100, spTimer: 21 });

    const outsideGameplay = advancePlayerRecoveryTick(
      createPlayerRecoveryState(), 'idle', vitals, false,
    );
    expect(outsideGameplay).toMatchObject({
      hp: vitals.hp,
      sp: vitals.sp,
      state: createPlayerRecoveryState(),
    });
  });
});
