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

  it('draws assigned skill levels with source cooldown masks and centers the quick-item icon', () => {
    const slotOneIcon = {} as CanvasImageSource;
    const slotThreeIcon = {} as CanvasImageSource;
    const chargeOverlay = {} as CanvasImageSource;
    const quickItemIcon = { width: 11, height: 16 } as unknown as CanvasImageSource;
    const directImages: Array<{ image: CanvasImageSource; x: number; y: number }> = [];
    const clippedRects: Array<[number, number, number, number]> = [];
    const fills: Array<{ color: string; rect: [number, number, number, number] }> = [];
    let fillStyle = '';
    const context = {
      imageSmoothingEnabled: false,
      drawImage: (...args: unknown[]) => {
        if (args.length === 3) directImages.push({
          image: args[0] as CanvasImageSource,
          x: args[1] as number,
          y: args[2] as number,
        });
      },
      fillRect: (x: number, y: number, width: number, height: number) => {
        fills.push({ color: fillStyle, rect: [x, y, width, height] });
      },
      strokeRect: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      rect: (x: number, y: number, width: number, height: number) => {
        clippedRects.push([x, y, width, height]);
      },
      clip: () => undefined,
      set fillStyle(value: string) { fillStyle = value; },
      set strokeStyle(_value: string) { /* skill outlines use integer fills */ },
    } as unknown as CanvasRenderingContext2D;
    const assets = {
      frame: Array.from({ length: 7 }, () => ({} as CanvasImageSource)),
      digits: {} as CanvasImageSource,
      itemCategoryIcons: {
        7: quickItemIcon,
        8: quickItemIcon,
        9: quickItemIcon,
        10: quickItemIcon,
      },
      skillIcons: [[slotOneIcon, {} as CanvasImageSource, slotThreeIcon]],
      skillChargeOverlay: chargeOverlay,
    } as GameplayHudAssets;

    drawGameplayHud(context, assets, NEW_GAME_RONIN_HUD, 240, {
      skillId: 0,
      slotOne: { levelSlot: 0, chargeTicksRemaining: 28, chargeTicksMaximum: 56 },
      slotThree: { levelSlot: 2, chargeTicksRemaining: 0, chargeTicksMaximum: 280 },
    });

    expect(directImages).toContainEqual({ image: slotOneIcon, x: 7, y: 15 });
    expect(directImages).toContainEqual({ image: slotThreeIcon, x: 29, y: 15 });
    expect(directImages).toContainEqual({ image: chargeOverlay, x: 7, y: 15 });
    expect(clippedRects).toEqual([[8, 16, 13, 6]]);
    expect(fills).toContainEqual({ color: '#bf1f3f', rect: [7, 15, 15, 1] });
    expect(fills).toContainEqual({ color: '#bf1f3f', rect: [7, 29, 15, 1] });
    expect(fills).toContainEqual({ color: '#000000', rect: [29, 15, 15, 1] });
    expect(fills).toContainEqual({ color: '#000000', rect: [43, 16, 1, 13] });
    expect(directImages).toContainEqual({ image: quickItemIcon, x: 225, y: 11 });
  });
});
