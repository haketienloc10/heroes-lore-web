export const POISON_STATUS_ID = 7;
export const POISON_STATUS_DURATION_TICKS = 80;
export const POISON_DAMAGE_INTERVAL_TICKS = 10;

/** Source `n.c()` places the oldest status at the right and newer ones left. */
export function sourcePlayerStatusMarkerHorizontalOffset(index: number, count: number): number {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) {
    throw new RangeError('Status marker index must be within a positive marker count');
  }
  return (6 * (count - 1)) - (12 * index);
}

/** `ce.a(Graphics)` alternates the source icon between two vertical pixels. */
export function sourcePlayerStatusMarkerBlinkOffset(ticksElapsed: number): 0 | 1 {
  if (!Number.isInteger(ticksElapsed) || ticksElapsed < 0) {
    throw new RangeError('Status marker ticks must be a non-negative integer');
  }
  return (ticksElapsed % 2) as 0 | 1;
}

export interface PlayerStatusState {
  /** Active source `ce` status IDs. Only poison (7) has a modeled timer so far. */
  effects: number[];
  poisonTicksElapsed: number | null;
  /** Source Antidote sets the effect's removal flag; `an.d()` removes it after one more tick. */
  poisonRemovalPending: boolean;
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
  return { effects: [], poisonTicksElapsed: null, poisonRemovalPending: false };
}

/** Source `n.m110a(7)` adds poison or refreshes its 80-update timer. */
export function applyPlayerPoison(state: PlayerStatusState): PlayerStatusState {
  return {
    effects: state.effects.includes(POISON_STATUS_ID)
      ? [...state.effects]
      : [...state.effects, POISON_STATUS_ID],
    poisonTicksElapsed: 0,
    poisonRemovalPending: false,
  };
}

/** Keep only statuses returned by an item action; Antidote uses this to cure poison. */
export function retainPlayerStatusEffects(
  state: PlayerStatusState,
  effectIds: readonly number[],
  options: { deferPoisonRemoval?: boolean } = {},
): PlayerStatusState {
  const retainedIds = [...new Set(effectIds)];
  const deferPoisonRemoval = options.deferPoisonRemoval === true &&
    state.effects.includes(POISON_STATUS_ID) && !retainedIds.includes(POISON_STATUS_ID);
  // The source Antidote only marks its `ce` instance expired. `an.d()` still
  // advances and checks that instance on the next update before removing it.
  const effects = deferPoisonRemoval ? [...state.effects] : retainedIds;
  const poisonActive = effects.includes(POISON_STATUS_ID);
  return {
    effects,
    poisonTicksElapsed: poisonActive ? state.poisonTicksElapsed : null,
    poisonRemovalPending: poisonActive && (deferPoisonRemoval || state.poisonRemovalPending),
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
  const expired = state.poisonRemovalPending || ticksElapsed >= POISON_STATUS_DURATION_TICKS;
  return {
    state: {
      effects: expired
        ? state.effects.filter((effectId) => effectId !== POISON_STATUS_ID)
        : [...state.effects],
      poisonTicksElapsed: expired ? null : ticksElapsed,
      poisonRemovalPending: false,
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
