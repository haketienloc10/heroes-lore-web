import type { GameplayHudState } from '../ui/game-hud';
import type { EndingHeroClassId } from './ending';

const MAX_SOURCE_LEVEL = 99;
const LEVEL_HP_INCREMENT = 12;
const LEVEL_SP_INCREMENT = 12;
const ENDING_QUEST_CLEAR_FLAGS = Array.from({ length: 20 }, (_, index) => 2 + index * 3);
const ENDING_GAME_CLEAR_FLAGS = Array.from({ length: 6 }, (_, index) => 100 + index);
const ENDING_MODE_WEIGHTS = [60, 30, 10] as const;
const ENDING_CLASS_DIVISORS: Record<EndingHeroClassId, number> = {
  6: 19,
  7: 21,
  8: 16,
};

/** Source `an.n()` threshold for the current experience level. */
export function experienceRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SOURCE_LEVEL) {
    throw new RangeError('Experience level must be from 1 through 99');
  }
  return (level * level * level) - (level * level) + (80 * level);
}

/** Calculate the source `m.a(byte)` ending-clear award for `an.f55f`. */
export function sourceEndingClearPointAward(
  heroClassId: EndingHeroClassId,
  playthroughMode: number,
  gameFlags: readonly number[],
  questFlags: readonly number[],
): number {
  if (!Number.isInteger(playthroughMode) || playthroughMode < 0 || playthroughMode > 127) {
    throw new RangeError('Source playthrough mode must be from 0 through 127');
  }
  if (playthroughMode >= ENDING_MODE_WEIGHTS.length) return 0;
  const weight = ENDING_MODE_WEIGHTS[playthroughMode];
  if (weight === undefined) return 0;

  const gameFlagSet = new Set(gameFlags);
  const questFlagSet = new Set(questFlags);
  const objectiveCount = ENDING_QUEST_CLEAR_FLAGS.filter((flag) => questFlagSet.has(flag)).length +
    ENDING_GAME_CLEAR_FLAGS.filter((flag) => gameFlagSet.has(flag)).length;
  return Math.trunc(
    (objectiveCount * weight) / ENDING_CLASS_DIVISORS[heroClassId],
  );
}

/** Apply the source byte narrowing and its subsequent upper-only 100-point cap. */
export function awardSourceEndingClearPoints(
  currentPoints: number,
  heroClassId: EndingHeroClassId,
  playthroughMode: number,
  gameFlags: readonly number[],
  questFlags: readonly number[],
): number {
  if (!Number.isInteger(currentPoints) || currentPoints < -128 || currentPoints > 100) {
    throw new RangeError('Source ending clear points must be from -128 through 100');
  }
  const award = sourceEndingClearPointAward(heroClassId, playthroughMode, gameFlags, questFlags);
  const narrowedByte = ((currentPoints + award + 128) % 256) - 128;
  return narrowedByte > 100 ? 100 : narrowedByte;
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
  return awardSourceExperience(state, enemyExperienceSourceAmount(state.level, enemyRewardCode));
}

/** Source `ak.l()` reward amount before `an.f()` multiplies it by four. */
export function enemyExperienceSourceAmount(level: number, enemyRewardCode: number): number {
  const rewardFactor = Math.min(26, 20 - (level - enemyRewardCode));
  const sourceAward = Math.trunc((enemyRewardCode * rewardFactor) / 2);
  return sourceAward > 0 ? sourceAward : 0;
}
