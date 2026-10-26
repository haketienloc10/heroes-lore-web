import { describe, expect, it } from 'vitest';
import {
  drawGameplayHud,
  meterFillWidth,
  NEW_GAME_RONIN_HUD,
  type GameplayHudAssets,
} from '../src/ui/game-hud';

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
    expect(meterFillWidth(72, 72, 173)).toBe(173);
    expect(meterFillWidth(30, 60, 173)).toBe(86);
    expect(meterFillWidth(40, 80, 234)).toBe(117);
  });

  it('clamps displayed meter values to the valid range', () => {
    expect(meterFillWidth(-1, 60, 173)).toBe(0);
    expect(meterFillWidth(100, 60, 173)).toBe(173);
    expect(meterFillWidth(5, 0, 173)).toBe(0);
  });

  it('draws source-width HP/SP bars and the zero-EXP line endpoints', () => {
    const rectangles: Array<{ color: string; rect: [number, number, number, number] }> = [];
    let color = '';
    const context = {
      imageSmoothingEnabled: false,
      drawImage: () => undefined,
      fillRect: (x: number, y: number, width: number, height: number) => {
        rectangles.push({ color, rect: [x, y, width, height] });
      },
      strokeRect: () => undefined,
      set fillStyle(value: string) { color = value; },
      set strokeStyle(_value: string) { /* not used without a skill icon */ },
    } as unknown as CanvasRenderingContext2D;
    const assets = {
      frame: Array.from({ length: 7 }, () => ({} as CanvasImageSource)),
      digits: {} as CanvasImageSource,
      itemCategoryIcons: { 7: {} as CanvasImageSource },
    } as GameplayHudAssets;

    drawGameplayHud(context, assets, NEW_GAME_RONIN_HUD);

    expect(rectangles).toContainEqual({ color: '#ff0000', rect: [47, 20, 173, 4] });
    expect(rectangles).toContainEqual({ color: '#ff9f3f', rect: [47, 21, 173, 2] });
    expect(rectangles).toContainEqual({ color: '#3fffbf', rect: [47, 27, 173, 2] });
    expect(rectangles).toContainEqual({ color: '#bfbf7f', rect: [2, 33, 2, 1] });

    rectangles.length = 0;
    drawGameplayHud(context, assets, { ...NEW_GAME_RONIN_HUD, hp: 36, sp: 30 });
    expect(rectangles).toContainEqual({ color: '#ff0000', rect: [47, 20, 86, 4] });
    expect(rectangles).toContainEqual({ color: '#3fffbf', rect: [47, 27, 86, 2] });
    expect(rectangles).toContainEqual({ color: '#000000', rect: [133, 27, 87, 2] });
  });
});
