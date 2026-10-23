import { describe, expect, it } from 'vitest';
import { NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';
import {
  awardEnemyExperience,
  awardSourceExperience,
  experienceRequiredForLevel,
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
});
