import type { ConsumableCategory } from '../world/loot';

export interface GameplayHudState {
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  experience: number;
  experienceToNextLevel: number;
  level: number;
  attributePoints: number;
  selectedItemCount: number;
  selectedItemCategory: ConsumableCategory;
}

export interface GameplayHudAssets {
  frame: CanvasImageSource[];
  digits: CanvasImageSource;
  itemCategoryIcons: Record<ConsumableCategory, CanvasImageSource>;
  guardianSkillIcon?: CanvasImageSource;
}

/** Initial Ronin values from R10's source fields and the level-1 stat formula. */
export const NEW_GAME_RONIN_HUD: GameplayHudState = {
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
};

const HP_BAR_WIDTH = 95;

export function meterFillWidth(value: number, maximum: number, width: number): number {
  if (![value, maximum, width].every(Number.isFinite) || maximum <= 0 || width <= 0) return 0;
  return Math.floor(width * Math.min(maximum, Math.max(0, value)) / maximum);
}

function drawSmallNumber(
  context: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  value: number,
  right: number,
  y: number,
): void {
  const digits = String(Math.max(0, Math.floor(value))).split('').map(Number);
  let x = right - (digits.length * 4);
  for (const digit of digits) {
    context.drawImage(atlas, digit * 5, 0, 5, 7, x, y, 5, 7);
    x += 4;
  }
}

/** Draw the source `ar.a(Graphics)` gameplay HUD at the bottom of a 240px canvas. */
export function drawGameplayHud(
  context: CanvasRenderingContext2D,
  assets: GameplayHudAssets,
  state: GameplayHudState,
  width = 240,
): void {
  if (assets.frame.length < 7) throw new TypeError('Gameplay HUD needs seven source frame pieces');
  context.imageSmoothingEnabled = false;

  // The source canvas composes its panel from `/img/uifrm` at these offsets.
  context.drawImage(assets.frame[1], 0, 12);
  context.drawImage(assets.frame[1], 22, 12);
  context.drawImage(assets.frame[2], 23, 23);
  context.drawImage(assets.frame[3], 44, 12);
  for (let tile = 0; tile < Math.floor((width - 74) / 6); tile += 1) {
    context.drawImage(assets.frame[4], 49 + tile * 6, 14);
  }
  context.drawImage(assets.frame[0], 0, 9);
  context.drawImage(assets.frame[6], width - 26, 0);
  context.drawImage(assets.frame[5], width - 30, 11);

  if (assets.guardianSkillIcon !== undefined) {
    context.strokeStyle = '#000000';
    context.strokeRect(7, 15, 14, 14);
    context.drawImage(assets.guardianSkillIcon, 7, 15);
  }

  const hpWidth = meterFillWidth(state.hp, state.maxHp, HP_BAR_WIDTH);
  context.fillStyle = '#ff0000';
  context.fillRect(47, 20, hpWidth, 4);
  context.fillStyle = '#ff9f3f';
  context.fillRect(47, 21, hpWidth, 2);
  drawSmallNumber(context, assets.digits, state.hp, width - 23, 18);

  const spWidth = meterFillWidth(state.sp, state.maxSp, HP_BAR_WIDTH);
  context.fillStyle = '#3fffbf';
  context.fillRect(47, 27, spWidth, 2);
  context.fillStyle = '#000000';
  context.fillRect(47 + spWidth, 27, HP_BAR_WIDTH - spWidth, 2);

  const experienceWidth = meterFillWidth(
    state.experience,
    state.experienceToNextLevel,
    width - 6,
  );
  context.fillStyle = '#9f9f7f';
  context.fillRect(0, 31, width, 5);
  context.fillStyle = '#3f3f3f';
  context.fillRect(2, 32, width - 4, 3);
  context.fillStyle = '#bfbf7f';
  if (experienceWidth > 0) context.fillRect(3, 33, experienceWidth, 1);

  // The source puts the selected item category icon and stack count at the right.
  context.drawImage(assets.itemCategoryIcons[state.selectedItemCategory], width - 10 - 11, 19 - 8);
  drawSmallNumber(context, assets.digits, state.selectedItemCount, width - 4, 22);
}
