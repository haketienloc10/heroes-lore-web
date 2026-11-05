import type { ConsumableCategory } from '../world/loot';
import { bitmapTextWidth, drawBitmapText, type BitmapFontData } from './bitmap-font';
import type { PlayerSkillLevelSlot } from '../world/player-skill-action';

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
  skillIcons?: readonly (readonly CanvasImageSource[])[];
  skillChargeOverlay?: CanvasImageSource;
}

export interface GameplayHudSkillBinding {
  levelSlot: PlayerSkillLevelSlot;
  chargeTicksRemaining: number;
  chargeTicksMaximum: number;
}

export interface GameplayHudSkillState {
  skillId: number;
  slotOne: GameplayHudSkillBinding | null;
  slotThree: GameplayHudSkillBinding | null;
}

export interface EnemyTargetHudAssets {
  fontAtlas: CanvasImageSource;
  font: BitmapFontData;
  digits: CanvasImageSource;
}

export interface EnemyTargetHudView {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  shapeCode: number;
}

export const ENEMY_TARGET_HUD_WIDTH = 105;
export const ENEMY_TARGET_HUD_HEIGHT = 27;

/** Source ar.a(Graphics) uses a 77px HP span with five pixels reserved by its frame. */
export function enemyTargetHudHpFillWidth(hp: number, maxHp: number): number {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || hp <= 0 || maxHp <= 0) return 0;
  return Math.max(0, Math.trunc((77 * (hp - 1)) / maxHp) + 1 - 5);
}

function drawEnemyTargetHudFrame(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#3f1f3f';
  context.fillRect(1, 0, 103, 1);
  context.fillRect(104, 1, 1, 25);
  context.fillRect(1, 26, 103, 1);
  context.fillRect(0, 1, 1, 25);

  context.fillStyle = '#9f7f3f';
  context.fillRect(1, 1, 102, 1);
  context.fillRect(1, 1, 1, 24);

  context.fillStyle = '#3f3f3f';
  context.fillRect(103, 1, 1, 24);
  context.fillRect(1, 25, 103, 1);
  context.fillStyle = '#5f1f3f';
  context.fillRect(2, 2, 101, 23);
}

function drawSmallNumberAt(
  context: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  value: number,
  x: number,
  y: number,
): void {
  const digits = String(Math.max(0, Math.floor(value))).split('').map(Number);
  for (const digit of digits) {
    context.drawImage(atlas, digit * 5, 0, 5, 7, x, y, 5, 7);
    x += 4;
  }
}

/** Draw the source ar.a(Graphics) enemy name/level/HP panel at native size. */
export function drawEnemyTargetHud(
  context: CanvasRenderingContext2D,
  assets: EnemyTargetHudAssets,
  target: EnemyTargetHudView,
  drawText: typeof drawBitmapText = drawBitmapText,
): void {
  context.clearRect(0, 0, ENEMY_TARGET_HUD_WIDTH, ENEMY_TARGET_HUD_HEIGHT);
  context.imageSmoothingEnabled = false;
  drawEnemyTargetHudFrame(context);

  const nameColor = target.shapeCode === 1 ? '#ff7f2f'
    : target.shapeCode === 2 ? '#ffff1f' : '#ffffff';
  drawText(
    context,
    assets.fontAtlas,
    assets.font,
    target.name,
    52,
    4,
    nameColor,
    'center',
  );

  const levelLabel = 'LV ';
  const labelWidth = bitmapTextWidth(levelLabel, assets.font);
  context.fillStyle = '#000000';
  context.fillRect(2, 17, labelWidth + 2, assets.font.height + 2);
  // The source font draws its glyph pixels one row below the requested baseline.
  drawText(context, assets.fontAtlas, assets.font, levelLabel, 3, 19, '#ffffff', 'left');
  drawSmallNumberAt(context, assets.digits, target.level, labelWidth + 5, 18);

  const hpWidth = enemyTargetHudHpFillWidth(target.hp, target.maxHp);
  if (hpWidth > 0) {
    context.fillStyle = '#ff3f2f';
    context.fillRect(29, 22, hpWidth, 2);
  }
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

function intrinsicImageDimension(
  image: CanvasImageSource,
  dimension: 'width' | 'height',
  fallback: number,
): number {
  const imageWithDimensions = image as unknown as Record<string, unknown>;
  const candidates = dimension === 'width'
    ? ['naturalWidth', 'videoWidth', 'displayWidth', 'width']
    : ['naturalHeight', 'videoHeight', 'displayHeight', 'height'];
  for (const candidate of candidates) {
    const value = imageWithDimensions[candidate];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function drawSourceRect(
  context: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.fillStyle = color;
  context.fillRect(x, y, width + 1, 1);
  context.fillRect(x, y + 1, 1, height - 1);
  context.fillRect(x + width, y + 1, 1, height - 1);
  context.fillRect(x, y + height, width + 1, 1);
}

function drawSkillBinding(
  context: CanvasRenderingContext2D,
  assets: GameplayHudAssets,
  skillState: GameplayHudSkillState,
  binding: GameplayHudSkillBinding,
  x: number,
): void {
  const icon = assets.skillIcons?.[skillState.skillId]?.[binding.levelSlot];
  if (icon === undefined) return;

  drawSourceRect(context, '#000000', x, 15, 14, 14);
  context.drawImage(icon, x, 15);
  if (binding.chargeTicksRemaining <= 0) return;

  drawSourceRect(context, '#bf1f3f', x, 15, 14, 14);
  if (assets.skillChargeOverlay === undefined || binding.chargeTicksMaximum <= 0) return;
  const chargeMaskHeight = meterFillWidth(
    binding.chargeTicksRemaining,
    binding.chargeTicksMaximum,
    13,
  );
  context.save();
  context.beginPath();
  context.rect(x + 1, 16, 13, chargeMaskHeight);
  context.clip();
  context.drawImage(assets.skillChargeOverlay, x, 15);
  context.restore();
}

/** Draw the source `ar.a(Graphics)` gameplay HUD at the bottom of a 240px canvas. */
export function drawGameplayHud(
  context: CanvasRenderingContext2D,
  assets: GameplayHudAssets,
  state: GameplayHudState,
  width = 240,
  skillState?: GameplayHudSkillState,
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

  if (skillState !== undefined) {
    if (skillState.slotOne !== null) drawSkillBinding(context, assets, skillState, skillState.slotOne, 7);
    if (skillState.slotThree !== null) drawSkillBinding(context, assets, skillState, skillState.slotThree, 29);
  }

  // `ar.a(Graphics)` sets source width `o = q.g - 67`, which is 173 at 240 px.
  const resourceBarWidth = width - 67;
  const hpWidth = meterFillWidth(state.hp, state.maxHp, resourceBarWidth);
  context.fillStyle = '#ff0000';
  context.fillRect(47, 20, hpWidth, 4);
  context.fillStyle = '#ff9f3f';
  context.fillRect(47, 21, hpWidth, 2);
  drawSmallNumber(context, assets.digits, state.hp, width - 23, 18);

  const spWidth = meterFillWidth(state.sp, state.maxSp, resourceBarWidth);
  context.fillStyle = '#3fffbf';
  context.fillRect(47, 27, spWidth, 2);
  context.fillStyle = '#000000';
  context.fillRect(47 + spWidth, 27, resourceBarWidth - spWidth, 2);

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
  if (experienceWidth > 0) {
    context.fillRect(3, 33, experienceWidth, 1);
  } else {
    // J2ME `drawLine(3, y, 2, y)` paints both endpoints for zero EXP.
    context.fillRect(2, 33, 2, 1);
  }

  // The source puts the selected item category icon and stack count at the right.
  const itemIcon = assets.itemCategoryIcons[state.selectedItemCategory];
  const fallbackItemIconHeight = state.selectedItemCategory === 8 || state.selectedItemCategory === 9 ? 19 : 16;
  const itemIconWidth = intrinsicImageDimension(itemIcon, 'width', 11);
  const itemIconHeight = intrinsicImageDimension(itemIcon, 'height', fallbackItemIconHeight);
  context.drawImage(
    itemIcon,
    width - 10 - Math.floor(itemIconWidth / 2),
    19 - Math.floor(itemIconHeight / 2),
  );
  drawSmallNumber(context, assets.digits, state.selectedItemCount, width - 4, 22);
}
