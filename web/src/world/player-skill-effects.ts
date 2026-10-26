export type PlayerSkillEffectType = 1 | 2 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type PlayerSkillAtlasFamily = 'fi' | 'wa' | 'gr';

export interface PlayerSkillEffectComponent {
  offsetX: number;
  offsetY: number;
  sourceAtlasFlag: number;
  imageIndex: number;
}

export interface PlayerSkillEffectResource {
  skillId: number;
  levelSlot: 0 | 1 | 2;
  atlasFamily: PlayerSkillAtlasFamily;
  sourceResource: string;
  frameCount: number;
  frames: PlayerSkillEffectComponent[][];
}

export interface PlayerSkillSpecialEffectResource {
  effectType: 2;
  sourceResource: string;
  frameCount: number;
  frames: PlayerSkillEffectComponent[][];
}

export interface PlayerSkillEffectCatalog {
  effects: PlayerSkillEffectResource[];
  specialEffects: PlayerSkillSpecialEffectResource[];
}

const EXPECTED_ATLAS_FAMILY: readonly PlayerSkillAtlasFamily[] = ['fi', 'wa', 'gr', 'fi', 'wa', 'gr'];
const SOURCE_EFFECT_FRAME_COUNTS: Record<PlayerSkillEffectType, number> = {
  1: 4,
  2: 8,
  4: 10,
  5: 11,
  6: 7,
  7: 9,
  8: 6,
  9: 4,
  10: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function expectedResource(skillId: number, levelSlot: number): string | null {
  if (skillId === 0) {
    if (levelSlot === 0) return 'grd/spr/0_01.eif';
    if (levelSlot === 1) return 'grd/spr/0_1.eif';
    return null;
  }
  if (skillId === 1 && levelSlot === 2) return null;
  return `grd/spr/${skillId}_${levelSlot}.eif`;
}

function parseComponent(value: unknown): PlayerSkillEffectComponent {
  if (!isRecord(value) || !isInteger(value.offsetX, -128, 127) ||
    !isInteger(value.offsetY, -128, 127) || !isInteger(value.sourceAtlasFlag, 0, 255) ||
    !isInteger(value.imageIndex, 0, 255)) {
    throw new TypeError('Player skill effect component is invalid');
  }
  return {
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    sourceAtlasFlag: value.sourceAtlasFlag,
    imageIndex: value.imageIndex,
  };
}

function parseFrames(value: unknown, frameCount: unknown): PlayerSkillEffectComponent[][] {
  if (!isInteger(frameCount, 1, 255) || !Array.isArray(value) || value.length !== frameCount ||
    !value.every(Array.isArray)) {
    throw new TypeError('Player skill effect frames are invalid');
  }
  return value.map((frame) => (frame as unknown[]).map(parseComponent));
}

function parseEffect(value: unknown): PlayerSkillEffectResource {
  if (!isRecord(value) || !isInteger(value.skillId, 0, 5) ||
    !isInteger(value.levelSlot, 0, 2) ||
    value.atlasFamily !== EXPECTED_ATLAS_FAMILY[value.skillId] ||
    value.sourceResource !== expectedResource(value.skillId, value.levelSlot) ||
    value.format !== 'heroes-lore-player-skill-effect-v1') {
    throw new TypeError('Player skill effect resource is invalid');
  }
  return {
    skillId: value.skillId,
    levelSlot: value.levelSlot as 0 | 1 | 2,
    atlasFamily: value.atlasFamily as PlayerSkillAtlasFamily,
    sourceResource: value.sourceResource as string,
    frameCount: isInteger(value.frameCount, 1, 255) ? value.frameCount : 0,
    frames: parseFrames(value.frames, value.frameCount),
  };
}

function parseSpecialEffect(value: unknown): PlayerSkillSpecialEffectResource {
  if (!isRecord(value) || value.format !== 'heroes-lore-player-skill-special-effect-v1' ||
    value.effectType !== 2 || value.skillId !== 0 || value.levelSlot !== 0 ||
    value.sourceResource !== 'grd/spr/0_02.eif') {
    throw new TypeError('Player skill special effect resource is invalid');
  }
  return {
    effectType: 2,
    sourceResource: value.sourceResource,
    frameCount: isInteger(value.frameCount, 1, 255) ? value.frameCount : 0,
    frames: parseFrames(value.frames, value.frameCount),
  };
}

export function parsePlayerSkillEffectCatalog(value: unknown): PlayerSkillEffectCatalog {
  if (!isRecord(value) || value.format !== 'heroes-lore-player-skill-effect-catalog-v1' ||
    !Array.isArray(value.effects) || value.effectCount !== value.effects.length ||
    !Array.isArray(value.specialEffects)) {
    throw new TypeError('Player skill effect catalog is invalid');
  }
  const effects = value.effects.map(parseEffect);
  const resourceKeys = effects.map(({ skillId, levelSlot }) => `${skillId}:${levelSlot}`);
  if (new Set(resourceKeys).size !== effects.length) {
    throw new TypeError('Player skill effect catalog has duplicate skill levels');
  }
  const specialEffects = value.specialEffects.map(parseSpecialEffect);
  if (new Set(specialEffects.map(({ effectType }) => effectType)).size !== specialEffects.length) {
    throw new TypeError('Player skill effect catalog has duplicate special effects');
  }
  return { effects, specialEffects };
}

export function findPlayerSkillEffect(
  catalog: PlayerSkillEffectCatalog,
  skillId: number,
  levelSlot: number,
): PlayerSkillEffectResource | undefined {
  return catalog.effects.find((effect) => effect.skillId === skillId && effect.levelSlot === levelSlot);
}

export function findPlayerSkillSpecialEffect(
  catalog: PlayerSkillEffectCatalog,
  effectType: number,
): PlayerSkillSpecialEffectResource | undefined {
  return catalog.specialEffects.find((effect) => effect.effectType === effectType);
}

export function playerSkillEffectFrameComponents(
  catalog: PlayerSkillEffectCatalog,
  effectType: PlayerSkillEffectType,
  skillId: number,
  levelSlot: number,
  frameIndex: number,
): readonly PlayerSkillEffectComponent[] {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) return [];
  const effect = effectType === 2
    ? findPlayerSkillSpecialEffect(catalog, effectType)
    : findPlayerSkillEffect(catalog, skillId, levelSlot);
  return effect?.frames[frameIndex] ?? [];
}

export function playerSkillEffectFrameCount(effectType: PlayerSkillEffectType): number {
  return SOURCE_EFFECT_FRAME_COUNTS[effectType];
}
