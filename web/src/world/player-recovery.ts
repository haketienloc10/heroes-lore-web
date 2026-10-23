import type { PlayerAttributes } from './attributes';

/** Source `an` regeneration timers; these are transient and are not saved. */
export interface PlayerRecoveryState {
  hpTimer: number;
  spTimer: number;
}

export type PlayerRecoveryActivity = 'idle' | 'walking' | 'other';

export interface PlayerRecoveryVitals {
  level: number;
  attributes: PlayerAttributes;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
}

export interface PlayerRecoveryTickResult {
  state: PlayerRecoveryState;
  hp: number;
  sp: number;
  hpChange: number;
  spChange: number;
}

export const SOURCE_INITIAL_HP_RECOVERY_TIMER = 67;
export const SOURCE_INITIAL_SP_RECOVERY_TIMER = 21;
export const SOURCE_SP_RECOVERY_INTERVAL = 21;

/**
 * The source constructor initializes its byte timers before class setup assigns
 * level 1. The initial HP timer is therefore 67; later HP pulses reset from
 * the then-current level.
 */
export function createPlayerRecoveryState(): PlayerRecoveryState {
  return {
    hpTimer: SOURCE_INITIAL_HP_RECOVERY_TIMER,
    spTimer: SOURCE_INITIAL_SP_RECOVERY_TIMER,
  };
}

/** Advance one source `an.d()` gameplay tick. */
export function advancePlayerRecoveryTick(
  state: PlayerRecoveryState,
  activity: PlayerRecoveryActivity,
  vitals: PlayerRecoveryVitals,
  gameplayActive = true,
): PlayerRecoveryTickResult {
  validateState(state);
  validateVitals(vitals);
  if (!gameplayActive) return { state, hp: vitals.hp, sp: vitals.sp, hpChange: 0, spChange: 0 };

  let hpTimer = state.hpTimer;
  let spTimer = state.spTimer;
  if (activity === 'idle') {
    hpTimer -= 2;
    spTimer -= 3;
  } else if (activity === 'walking') {
    hpTimer -= 1;
    spTimer -= 1;
  }

  let hp = vitals.hp;
  let sp = vitals.sp;
  if (hpTimer <= 0) {
    hp = clamp(hp + vitals.attributes.hp, vitals.maxHp);
    hpTimer = Math.min(67 + vitals.level, 100);
  }
  if (spTimer <= 0) {
    sp = clamp(sp + vitals.attributes.will, vitals.maxSp);
    spTimer = SOURCE_SP_RECOVERY_INTERVAL;
  }

  return {
    state: { hpTimer, spTimer },
    hp,
    sp,
    hpChange: hp - vitals.hp,
    spChange: sp - vitals.sp,
  };
}

function clamp(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}

function validateState(state: PlayerRecoveryState): void {
  if (!Number.isInteger(state.hpTimer) || state.hpTimer < -128 || state.hpTimer > 127 ||
    !Number.isInteger(state.spTimer) || state.spTimer < -128 || state.spTimer > 127) {
    throw new RangeError('Player recovery timers must fit the source signed-byte fields');
  }
}

function validateVitals(vitals: PlayerRecoveryVitals): void {
  const { level, attributes, hp, maxHp, sp, maxSp } = vitals;
  if (!Number.isInteger(level) || level < 1 || level > 99 ||
    !Number.isInteger(attributes.hp) || attributes.hp < -32768 || attributes.hp > 32767 ||
    !Number.isInteger(attributes.will) || attributes.will < -32768 || attributes.will > 32767 ||
    !Number.isInteger(hp) || !Number.isInteger(maxHp) || maxHp < 1 || hp < 0 || hp > maxHp ||
    !Number.isInteger(sp) || !Number.isInteger(maxSp) || maxSp < 1 || sp < 0 || sp > maxSp) {
    throw new RangeError('Player recovery requires valid source stats and current vitals');
  }
}
