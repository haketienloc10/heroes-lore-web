import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import {
  awardEnemyExperience,
  awardSourceEndingClearPoints,
  awardSourceExperience,
  experienceRequiredForLevel,
  sourceEndingClearPointAward,
} from '../src/world/progression';

describe('source enemy experience and leveling', () => {
  it('uses the source cubic experience threshold', () => {
    expect(experienceRequiredForLevel(1)).toBe(80);
    expect(experienceRequiredForLevel(2)).toBe(164);
  });

  it('awards enemy 24 forty experience toward the level-one threshold', () => {
    expect(awardEnemyExperience(NEW_GAME_RONIN_HUD, 1)).toMatchObject({
      level: 1,
      experience: 40,
      experienceToNextLevel: 80,
      attributePoints: 0,
      hp: 72,
      maxHp: 72,
      sp: 60,
      maxSp: 60,
    });
  });

  it('levels up, raises both Ronin maxima, grants points, and refills meters', () => {
    const beforeLevelUp = {
      ...NEW_GAME_RONIN_HUD,
      hp: 30,
      sp: 20,
      experience: 40,
    };

    expect(awardEnemyExperience(beforeLevelUp, 1)).toMatchObject({
      level: 2,
      experience: 0,
      experienceToNextLevel: 164,
      attributePoints: 3,
      hp: 84,
      maxHp: 84,
      sp: 72,
      maxSp: 72,
    });
  });

  it('applies source event EXP amounts through the same x4 leveling routine', () => {
    const result = awardSourceExperience({
      ...NEW_GAME_RONIN_HUD,
      hp: 5,
      sp: 6,
    }, 20);
    expect(result).toMatchObject({
      level: 2,
      experience: 0,
      hp: 84,
      maxHp: 84,
      sp: 72,
      maxSp: 72,
      attributePoints: 3,
    });
    expect(() => awardSourceExperience(NEW_GAME_RONIN_HUD, 65536)).toThrow(RangeError);
  });

  it('counts every level crossed by one large source EXP award', () => {
    const result = awardSourceExperience(NEW_GAME_RONIN_HUD, 126);
    expect(result).toMatchObject({
      level: 4,
      experience: 2,
      experienceToNextLevel: 368,
      attributePoints: 9,
      hp: 108,
      maxHp: 108,
      sp: 96,
      maxSp: 96,
    });
    expect(result.level - NEW_GAME_RONIN_HUD.level).toBe(3);
  });
});

describe('source ending clear points', () => {
  const allQuestClearFlags = Array.from({ length: 20 }, (_, index) => 2 + index * 3);
  const allGameClearFlags = Array.from({ length: 6 }, (_, index) => 100 + index);

  it('counts source clear objectives and applies mode and hero-class weights', () => {
    expect(sourceEndingClearPointAward(6, 0, allGameClearFlags, allQuestClearFlags)).toBe(82);
    expect(sourceEndingClearPointAward(7, 0, allGameClearFlags, allQuestClearFlags)).toBe(74);
    expect(sourceEndingClearPointAward(8, 0, allGameClearFlags, allQuestClearFlags)).toBe(97);
    expect(sourceEndingClearPointAward(6, 1, allGameClearFlags, allQuestClearFlags)).toBe(41);
    expect(sourceEndingClearPointAward(7, 2, allGameClearFlags, allQuestClearFlags)).toBe(12);
    expect(sourceEndingClearPointAward(8, 3, allGameClearFlags, allQuestClearFlags)).toBe(0);
    expect(sourceEndingClearPointAward(6, 0, [0, 100, 101], [2, 2, 3, 5])).toBe(12);
  });

  it('matches Java signed-byte wrap followed by the source upper cap', () => {
    expect(awardSourceEndingClearPoints(100, 6, 0, allGameClearFlags, allQuestClearFlags)).toBe(-74);
    expect(awardSourceEndingClearPoints(90, 8, 2, allGameClearFlags, allQuestClearFlags)).toBe(100);
    expect(awardSourceEndingClearPoints(-128, 6, 3, [], [])).toBe(-128);
  });

  it('rejects points and modes outside the source representation', () => {
    expect(() => awardSourceEndingClearPoints(101, 6, 0, [], [])).toThrow(RangeError);
    expect(() => sourceEndingClearPointAward(6, 128, [], [])).toThrow(RangeError);
  });
});
