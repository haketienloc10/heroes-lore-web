export const POISON_STATUS_ID = 7;
export const POISON_STATUS_DURATION_TICKS = 80;
export const POISON_DAMAGE_INTERVAL_TICKS = 10;

export interface PlayerStatusState {
  /** Active source `ce` status IDs. Only poison (7) has a modeled timer so far. */
  effects: number[];
  poisonTicksElapsed: number | null;
}

export interface PlayerStatusTickResult {
  state: PlayerStatusState;
  hp: number;
  /** Actual HP removed by the source poison tick; the effect cannot reduce HP below 1. */
  hpLoss: number;
  /** A source poison pulse occurs even when integer division rounds its HP loss to zero. */
  poisonPulse: boolean;
  /** Source `av` floating number amount shown for a poison tick. */
  damageNumber: number;
}

export function createPlayerStatusState(): PlayerStatusState {
  return { effects: [], poisonTicksElapsed: null };
}

/** Source `n.m110a(7)` adds poison or refreshes its 80-update timer. */
export function applyPlayerPoison(state: PlayerStatusState): PlayerStatusState {
  return {
    effects: state.effects.includes(POISON_STATUS_ID)
      ? [...state.effects]
      : [...state.effects, POISON_STATUS_ID],
    poisonTicksElapsed: 0,
  };
}

/** Keep only statuses returned by an item action; Antidote uses this to cure poison. */
export function retainPlayerStatusEffects(
  state: PlayerStatusState,
  effectIds: readonly number[],
): PlayerStatusState {
  const effects = [...new Set(effectIds)];
  return {
    effects,
    poisonTicksElapsed: effects.includes(POISON_STATUS_ID) ? state.poisonTicksElapsed : null,
  };
}

/**
 * Advance source `an.d()` poison timing once. The source applies eight pulses
 * at ticks 10–80, clamps HP to one, then expires `ce(7)`.
 */
export function advancePlayerStatusTick(
  state: PlayerStatusState,
  hp: number,
  maxHp: number,
): PlayerStatusTickResult {
  if (!Number.isInteger(hp) || hp < 0 || !Number.isInteger(maxHp) || maxHp < 1 || hp > maxHp) {
    throw new RangeError('Player HP must be an integer within a positive maximum');
  }
  const poisonActive = state.effects.includes(POISON_STATUS_ID);
  if (!poisonActive) return { state, hp, hpLoss: 0, poisonPulse: false, damageNumber: 0 };

  const ticksElapsed = (state.poisonTicksElapsed ?? 0) + 1;
  const poisonPulse = ticksElapsed % POISON_DAMAGE_INTERVAL_TICKS === 0 && hp > 1;
  const nominalLoss = poisonPulse ? Math.floor(maxHp / 25) : 0;
  const hpLoss = Math.min(nominalLoss, Math.max(0, hp - 1));
  const hpAfter = hp - hpLoss;
  const expired = ticksElapsed >= POISON_STATUS_DURATION_TICKS;
  return {
    state: {
      effects: expired
        ? state.effects.filter((effectId) => effectId !== POISON_STATUS_ID)
        : [...state.effects],
      poisonTicksElapsed: expired ? null : ticksElapsed,
    },
    hp: hpAfter,
    hpLoss,
    poisonPulse,
    damageNumber: poisonPulse ? Math.floor(maxHp / 12) : 0,
  };
}

/** The source enemy-to-player hit path rolls poison only for non-evaded behavior-1 hits. */
export function enemyHitAppliesPoison(
  behaviorType: number,
  evaded: boolean,
  randomInteger: (minimum: number, maximum: number) => number,
): boolean {
  if (behaviorType !== 1 || evaded) return false;
  return randomInteger(0, 99) < 15;
}
