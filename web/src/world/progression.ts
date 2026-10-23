import type { GameplayHudState } from '../ui/game-hud';

const MAX_SOURCE_LEVEL = 99;
const LEVEL_HP_INCREMENT = 12;
const LEVEL_SP_INCREMENT = 12;

/** Source `an.n()` threshold for the current experience level. */
export function experienceRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SOURCE_LEVEL) {
    throw new RangeError('Experience level must be from 1 through 99');
  }
  return (level * level * level) - (level * level) + (80 * level);
}

/** Apply `an.f()` to a source reward amount; the source multiplies it by four. */
export function awardSourceExperience(
  state: GameplayHudState,
  sourceAmount: number,
): GameplayHudState {
  if (!Number.isInteger(sourceAmount) || sourceAmount < 0 || sourceAmount > 65535) {
    throw new RangeError('Source experience amount must be an unsigned 16-bit integer');
  }
  let experience = state.experience + sourceAmount * 4;
  let level = state.level;
  let hp = state.hp;
  let maxHp = state.maxHp;
  let sp = state.sp;
  let maxSp = state.maxSp;
  let attributePoints = state.attributePoints;

  while (experience >= experienceRequiredForLevel(level)) {
    experience -= experienceRequiredForLevel(level);
    if (level < MAX_SOURCE_LEVEL) {
      level += 1;
      attributePoints += 3;
      // In the current Ronin model, the source maximum formulas gain 12 per level.
      maxHp += LEVEL_HP_INCREMENT;
      maxSp += LEVEL_SP_INCREMENT;
    }
    // `an.r()` restores both meters on every threshold, including the level cap.
    hp = maxHp;
    sp = maxSp;
  }

  return {
    ...state,
    hp,
    maxHp,
    sp,
    maxSp,
    experience,
    experienceToNextLevel: experienceRequiredForLevel(level),
    level,
    attributePoints,
  };
}

/** Apply the immediate experience portion of `ak.l()` and `an.f()`. */
export function awardEnemyExperience(
  state: GameplayHudState,
  enemyRewardCode: number,
): GameplayHudState {
  const rewardFactor = Math.min(26, 20 - (state.level - enemyRewardCode));
  const sourceAward = Math.trunc((enemyRewardCode * rewardFactor) / 2);
  return awardSourceExperience(state, sourceAward > 0 ? sourceAward : 0);
}
