import { describe, expect, it } from 'vitest';
import {
  drawEnemyTargetHud,
  drawGameplayHud,
  enemyTargetHudHpFillWidth,
  meterFillWidth,
  NEW_GAME_RONIN_HUD,
  type EnemyTargetHudAssets,
  type GameplayHudAssets,
} from '../src/ui/game-hud';

describe('source enemy target HUD', () => {
  it('uses the source 77-pixel HP expression and hides a zero-HP bar', () => {
    expect(enemyTargetHudHpFillWidth(43, 43)).toBe(71);
    expect(enemyTargetHudHpFillWidth(22, 43)).toBe(33);
    expect(enemyTargetHudHpFillWidth(1, 43)).toBe(0);
    expect(enemyTargetHudHpFillWidth(0, 43)).toBe(0);
    expect(enemyTargetHudHpFillWidth(10, 0)).toBe(0);
  });

  it('draws the 105×27 source panel, localized name, level label, and HP bar', () => {
    const rectangles: Array<{ color: string; rect: [number, number, number, number] }> = [];
    const digitImages: Array<[number, number, number, number]> = [];
    const texts: Array<{ text: string; x: number; y: number; color: string; align?: string }> = [];
    let cleared: [number, number, number, number] | undefined;
    let color = '';
    const context = {
      imageSmoothingEnabled: true,
      clearRect: (x: number, y: number, width: number, height: number) => {
        cleared = [x, y, width, height];
      },
      drawImage: (...args: unknown[]) => {
        if (args.length === 9) digitImages.push(args.slice(5) as [number, number, number, number]);
      },
      fillRect: (x: number, y: number, width: number, height: number) => {
        rectangles.push({ color, rect: [x, y, width, height] });
      },
      set fillStyle(value: string) { color = value; },
    } as unknown as CanvasRenderingContext2D;
    const font = {
      height: 8,
      spaceAdvance: 3,
      letterSpacing: 0,
      glyphOffsets: Array.from({ length: 95 }, (_, index) => index),
      atlasWidth: 94,
    };
    const assets = {
      fontAtlas: {} as CanvasImageSource,
      font,
      digits: {} as CanvasImageSource,
    } as EnemyTargetHudAssets;

    drawEnemyTargetHud(context, assets, { name: 'Dust', level: 1, hp: 43, maxHp: 43, shapeCode: 0 },
      (_context, _atlas, _font, text, x, y, textColor, align) => {
        texts.push({ text, x, y, color: textColor, align });
      });

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(cleared).toEqual([0, 0, 105, 27]);
    expect(rectangles).toContainEqual({ color: '#3f1f3f', rect: [104, 1, 1, 25] });
    expect(rectangles).toContainEqual({ color: '#3f3f3f', rect: [1, 25, 103, 1] });
    expect(rectangles).toContainEqual({ color: '#5f1f3f', rect: [2, 2, 101, 23] });
    expect(rectangles).toContainEqual({ color: '#000000', rect: [2, 17, 7, 10] });
    expect(rectangles).toContainEqual({ color: '#ff3f2f', rect: [29, 22, 71, 2] });
    expect(texts.map(({ text }) => text)).toEqual(['Dust', 'LV ']);
    expect(texts[0]).toMatchObject({ x: 52, y: 4, color: '#ffffff', align: 'center' });
    expect(texts[1]).toMatchObject({ x: 3, y: 19, color: '#ffffff', align: 'left' });
    expect(digitImages).toEqual([[10, 18, 5, 7]]);
  });
});

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
