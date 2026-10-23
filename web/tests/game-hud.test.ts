import { describe, expect, it } from 'vitest';
import { meterFillWidth, NEW_GAME_RONIN_HUD } from '../src/ui/game-hud';

describe('source gameplay HUD meters', () => {
  it('uses the recorded fresh-game Ronin status values', () => {
    expect(NEW_GAME_RONIN_HUD).toEqual({
      hp: 72,
      maxHp: 72,
      sp: 60,
      maxSp: 60,
      experience: 0,
      experienceToNextLevel: 80,
      level: 1,
      attributePoints: 0,
      selectedItemCount: 0,
      selectedItemCategory: 7,
    });
  });

  it('scales HP, SP and experience bars to their source meter widths', () => {
    expect(meterFillWidth(72, 72, 95)).toBe(95);
    expect(meterFillWidth(30, 60, 95)).toBe(47);
    expect(meterFillWidth(40, 80, 234)).toBe(117);
  });

  it('clamps displayed meter values to the valid range', () => {
    expect(meterFillWidth(-1, 60, 95)).toBe(0);
    expect(meterFillWidth(100, 60, 95)).toBe(95);
    expect(meterFillWidth(5, 0, 95)).toBe(0);
  });
});
