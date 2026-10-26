import { WORLD_UPDATE_PERIOD_MS, type Direction } from './actor';
import type { PlayerSkillEffectType } from './player-skill-effects';

export type PlayerSkillActionPhase = 0 | 1 | 2 | 3;
export type PlayerSkillLevelSlot = 0 | 1 | 2;
export type PlayerSkillActionButton = '1' | '3';

export interface PlayerSkillDamagePulse {
  tileX: number;
  tileY: number;
  power: number;
  /** `o.m112a()` for implemented damage skills. */
  elementCode: 1 | 2 | 3;
  actionId: number;
}

export interface PlayerSkillRestoreEffect {
  resource: 'hp' | 'sp';
  percent: number;
}

export interface PlayerSkillInstantKillCell {
  tileX: number;
  tileY: number;
  /** Source element check performed before calling `ak.c(byte)`. */
  elementCode: 1 | 3;
  actionId: number;
}

export interface PlayerSkillVisualSpawn {
  effectType: PlayerSkillEffectType;
  skillId: number;
  levelSlot: PlayerSkillLevelSlot;
  tileX: number;
  tileY: number;
}

export interface PlayerSkillAttachedVisualSpawn {
  skillId: number;
  /** Source `bi.a`, the `/grd/spr` frame stream used by this actor effect. */
  sourceStreamSlot: PlayerSkillLevelSlot | null;
  kind: 'stream' | 'skill-0-aura';
  durationTicks: number;
  delayTicks: number;
}

export interface PlayerSkillActionState {
  skillId: number | null;
  /** Source `o.f281a`, the skill's independently leveled rank. */
  skillRank: number;
  /** Source `o.f282a`, experience retained toward the active skill's next rank. */
  skillExperience: number;
  /** Source `o.g`, the skill level selected for action button 1; `null` is `-1`. */
  skillLevelSlotOne: PlayerSkillLevelSlot | null;
  /** Source `o.f280h`, the skill level selected for action button 3; `null` is `-1`. */
  skillLevelSlotThree: PlayerSkillLevelSlot | null;
  /** Source `an.f60g`, supplied from the current hero's base will attribute. */
  skillPowerStat: number;
  phase: PlayerSkillActionPhase;
  levelSlot: PlayerSkillLevelSlot | null;
  facing: Direction;
  tileX: number;
  tileY: number;
  frame: number;
  windupTicksRemaining: number;
  durationTicks: number;
  durationTicksRemaining: number;
  effectAge: number;
  effectComplete: boolean;
  /** Three source `o.c[]` counters for the current skill object. */
  chargeTicksRemaining: [number, number, number];
  /** Source `ce(5)` lasts 140 hero updates and enables the 3/2 combo-power term. */
  comboPowerBoostTicksRemaining: number;
  /** Source `an.g`: skill 0 level 2 counter-damages a striking enemy. */
  counterattackBoostTicksRemaining: number;
  /** Source `an.f54h`: skill 1 level 2 doubles passive HP/SP regeneration. */
  recoveryBoostTicksRemaining: number;
  /** Source `ce(6)` lasts 160 hero updates and doubles incoming defense. */
  defenseBoostTicksRemaining: number;
  /** Source `an.f`, set by skill 4 level 1 while the player is within two tiles. */
  damageImmunityActive: boolean;
  tickRemainderMs: number;
  nextActionId: number;
}

export interface PlayerSkillActionStep {
  state: PlayerSkillActionState;
  damagePulses: PlayerSkillDamagePulse[];
  instantKillCells: PlayerSkillInstantKillCell[];
  visualSpawns: PlayerSkillVisualSpawn[];
  attachedVisualSpawns: PlayerSkillAttachedVisualSpawn[];
  restoreEffects: PlayerSkillRestoreEffect[];
  statusEffectsCleared: boolean;
  cameraShakeOffset?: { x: number; y: number };
}

const SKILL_CHARGES = [
  [56, 280, 280],
  [220, 160, 270],
  [56, 270, 220],
  [80, 270, 270],
  [80, 270, 220],
  [80, 270, 270],
] as const;

const SKILL_DURATIONS = [
  [0, 0, 10],
  [4, 4, 10],
  [0, 4, 0],
  [4, 10, 8],
  [0, 6, 6],
  [0, 10, 8],
] as const;

const SKILL_EFFECT_END_AGES = [
  [16, 9, 161],
  [9, 10, 81],
  [16, 9, 13],
  [25, 81, 8],
  [31, 81, 16],
  [31, 87, 8],
] as const;

export const PLAYER_SKILL_BASE_RANKS = [1, 1, 1, 1, 10, 20] as const;
export const PLAYER_SKILL_LEVEL_UNLOCK_RANKS = [1, 9, 20] as const;
const COMBO_POWER_BOOST_TICKS = 140;
const COUNTERATTACK_BOOST_TICKS = 161;
const DEFENSE_BOOST_TICKS = 160;

export function createPlayerSkillActionState(
  skillId: number | null,
  skillPowerStat = 4,
  skillRank?: number,
  skillExperience = 0,
  skillLevelSlotOne?: PlayerSkillLevelSlot | null,
  skillLevelSlotThree?: PlayerSkillLevelSlot | null,
): PlayerSkillActionState {
  const chargeTable = skillId !== null && skillId >= 0 && skillId < SKILL_CHARGES.length
    ? SKILL_CHARGES[skillId]
    : [0, 0, 0] as const;
  const rank = skillRank ?? (skillId !== null && skillId >= 0 && skillId < PLAYER_SKILL_BASE_RANKS.length
    ? PLAYER_SKILL_BASE_RANKS[skillId]
    : 0);
  return {
    skillId,
    skillRank: rank,
    skillExperience,
    skillLevelSlotOne: skillLevelSlotOne === undefined ? 0 : skillLevelSlotOne,
    skillLevelSlotThree: skillLevelSlotThree === undefined
      ? (rank >= PLAYER_SKILL_LEVEL_UNLOCK_RANKS[1] ? 1 : null)
      : skillLevelSlotThree,
    skillPowerStat,
    phase: 0,
    levelSlot: null,
    facing: 2,
    tileX: 0,
    tileY: 0,
    frame: 0,
    windupTicksRemaining: 0,
    durationTicks: 0,
    durationTicksRemaining: 0,
    effectAge: 0,
    effectComplete: false,
    chargeTicksRemaining: [...chargeTable],
    comboPowerBoostTicksRemaining: 0,
    counterattackBoostTicksRemaining: 0,
    recoveryBoostTicksRemaining: 0,
    defenseBoostTicksRemaining: 0,
    damageImmunityActive: false,
    tickRemainderMs: 0,
    nextActionId: 1,
  };
}

/** Source `o.a()`: the skill XP threshold for its current rank. */
export function playerSkillExperienceRequiredForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 32767) {
    throw new RangeError('Player skill rank must be from 1 through 32767');
  }
  return (rank * rank * rank) - (rank * rank) + (80 * rank);
}

/** Source `o` initializes button 1 to level 0 and button 3 to level 1 when rank permits. */
export function defaultPlayerSkillLevelBindings(skillRank: number): {
  skillLevelSlotOne: PlayerSkillLevelSlot | null;
  skillLevelSlotThree: PlayerSkillLevelSlot | null;
} {
  return {
    skillLevelSlotOne: 0,
    skillLevelSlotThree: skillRank >= PLAYER_SKILL_LEVEL_UNLOCK_RANKS[1] ? 1 : null,
  };
}

export function assignPlayerSkillLevelSlot(
  source: PlayerSkillActionState,
  actionButton: PlayerSkillActionButton,
  levelSlot: PlayerSkillLevelSlot,
): { state: PlayerSkillActionState; accepted: boolean; reason: 'locked' | 'already-assigned' | null } {
  if (source.skillId === null || source.skillRank < PLAYER_SKILL_LEVEL_UNLOCK_RANKS[levelSlot]) {
    return { state: source, accepted: false, reason: 'locked' };
  }
  const currentSlot = actionButton === '1' ? source.skillLevelSlotOne : source.skillLevelSlotThree;
  const otherSlot = actionButton === '1' ? source.skillLevelSlotThree : source.skillLevelSlotOne;
  if (currentSlot === levelSlot || otherSlot === levelSlot) {
    return { state: source, accepted: false, reason: 'already-assigned' };
  }
  return {
    state: actionButton === '1'
      ? { ...source, skillLevelSlotOne: levelSlot }
      : { ...source, skillLevelSlotThree: levelSlot },
    accepted: true,
    reason: null,
  };
}

export function playerSkillLevelForActionButton(
  state: PlayerSkillActionState,
  actionButton: PlayerSkillActionButton,
): PlayerSkillLevelSlot | null {
  return actionButton === '1' ? state.skillLevelSlotOne : state.skillLevelSlotThree;
}

/** Source `an.f()` adds its x4 experience amount to only the active `o` skill. */
export function awardPlayerSkillExperience(
  source: PlayerSkillActionState,
  sourceAmount: number,
): PlayerSkillActionState {
  if (!Number.isInteger(sourceAmount) || sourceAmount < 0 || sourceAmount > 65535) {
    throw new RangeError('Source experience amount must be an unsigned 16-bit integer');
  }
  if (source.skillId === null || source.skillRank <= 0) return source;

  let skillRank = source.skillRank;
  let skillExperience = source.skillExperience + sourceAmount * 4;
  let skillLevelSlotThree = source.skillLevelSlotThree;
  let chargeTicksRemaining = [...source.chargeTicksRemaining] as [number, number, number];
  while (skillExperience >= playerSkillExperienceRequiredForRank(skillRank)) {
    skillExperience -= playerSkillExperienceRequiredForRank(skillRank);
    skillRank += 1;
    if (skillRank === PLAYER_SKILL_LEVEL_UNLOCK_RANKS[1]) {
      skillLevelSlotThree = 1;
      if (source.skillId >= 0 && source.skillId < SKILL_CHARGES.length) {
        chargeTicksRemaining[1] = SKILL_CHARGES[source.skillId][1];
      }
    }
  }
  return { ...source, skillRank, skillExperience, skillLevelSlotThree, chargeTicksRemaining };
}

export function startPlayerSkillAction(
  source: PlayerSkillActionState,
  levelSlot: PlayerSkillLevelSlot,
  tileX: number,
  tileY: number,
  facing: Direction,
  skillPowerStat = source.skillPowerStat,
): { state: PlayerSkillActionState; accepted: boolean } {
  // All six skill IDs have a modeled level-2 gameplay effect.
  const skillId = source.skillId;
  if (skillId === null) return { state: source, accepted: false };
  const supportedEffect = ((skillId === 0 || skillId === 1) && levelSlot <= 1) ||
    (skillId === 1 && levelSlot <= 2) ||
    (skillId === 0 && levelSlot <= 2) ||
    (skillId === 2 && levelSlot <= 2) ||
    (skillId === 3 && levelSlot <= 2) ||
    (skillId === 4 && levelSlot <= 2) ||
    (skillId === 5 && levelSlot <= 2);
  if (!supportedEffect || source.phase !== 0 ||
    source.chargeTicksRemaining[levelSlot] > 0) {
    return { state: source, accepted: false };
  }
  if (source.skillRank < PLAYER_SKILL_LEVEL_UNLOCK_RANKS[levelSlot]) {
    return { state: source, accepted: false };
  }
  const durationTicks = SKILL_DURATIONS[skillId][levelSlot];
  const chargeTicksRemaining = [...source.chargeTicksRemaining] as [number, number, number];
  chargeTicksRemaining[levelSlot] = SKILL_CHARGES[skillId][levelSlot];
  const direction: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  const delta = direction[facing];
  return {
    accepted: true,
    state: {
      ...source,
      skillPowerStat,
      phase: 1,
      levelSlot,
      facing,
      tileX: tileX + delta.x,
      tileY: tileY + delta.y,
      frame: -1,
      windupTicksRemaining: 10,
      durationTicks,
      durationTicksRemaining: durationTicks,
      effectAge: 0,
      effectComplete: false,
      damageImmunityActive: false,
      chargeTicksRemaining,
      nextActionId: source.nextActionId + 1,
    },
  };
}

function tickCooldowns(source: PlayerSkillActionState): [number, number, number] {
  const result = [...source.chargeTicksRemaining] as [number, number, number];
  for (const selectedSlot of [source.skillLevelSlotOne, source.skillLevelSlotThree]) {
    if (selectedSlot === null ||
      source.phase !== 0 && source.levelSlot === selectedSlot ||
      result[selectedSlot] <= 0) continue;
    result[selectedSlot] -= 1;
  }
  return result;
}

function skillZeroDamageTargets(
  state: PlayerSkillActionState,
  effectAge: number,
): Array<{ tileX: number; tileY: number }> {
  const forward: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  const side: Record<Direction, { x: number; y: number }> = {
    1: { x: 1, y: 0 },
    2: { x: -1, y: 0 },
    3: { x: 0, y: -1 },
    4: { x: 0, y: 1 },
  };
  const step = forward[state.facing];
  const perpendicular = side[state.facing];
  if (effectAge === 8 || effectAge === 12) {
    return [1, -1].map((sideDistance) => ({
      tileX: state.tileX + step.x * 3 + perpendicular.x * sideDistance,
      tileY: state.tileY + step.y * 3 + perpendicular.y * sideDistance,
    }));
  }
  if (effectAge === 5) {
    return [0, 3].map((distance) => ({
      tileX: state.tileX + step.x * distance,
      tileY: state.tileY + step.y * distance,
    }));
  }
  const distance = effectAge === 6 ? 1
      : effectAge === 7 ? 2
        : effectAge === 9 ? 3
          : effectAge === 1 ? 0
            : effectAge === 2 ? 1
              : effectAge === 3 ? 2
                : undefined;
  if (distance === undefined) return [];
  return [{ tileX: state.tileX + step.x * distance, tileY: state.tileY + step.y * distance }];
}

function skillTwoDamageTargets(
  state: PlayerSkillActionState,
  effectAge: number,
): Array<{ tileX: number; tileY: number }> {
  if (effectAge < 2 || effectAge > 9) return [];
  const forward: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  const step = forward[state.facing];
  const distance = (effectAge - 2) % 4;
  return [{
    tileX: state.tileX + step.x * distance,
    tileY: state.tileY + step.y * distance,
  }];
}

function cardinalCross(
  state: PlayerSkillActionState,
  distance: number,
): Array<{ tileX: number; tileY: number }> {
  if (distance === 0) return [{ tileX: state.tileX, tileY: state.tileY }];
  const offsets: Array<[number, number]> = [
    [0, -distance],
    [0, distance],
    [-distance, 0],
    [distance, 0],
  ];
  return offsets.map(([x, y]) => ({ tileX: state.tileX + x, tileY: state.tileY + y }));
}

function sourceEffectCardinalCross(
  state: PlayerSkillActionState,
  distance: number,
): Array<{ tileX: number; tileY: number }> {
  if (distance === 0) return [{ tileX: state.tileX, tileY: state.tileY }];
  return [
    { tileX: state.tileX + distance, tileY: state.tileY },
    { tileX: state.tileX - distance, tileY: state.tileY },
    { tileX: state.tileX, tileY: state.tileY + distance },
    { tileX: state.tileX, tileY: state.tileY - distance },
  ];
}

function forwardCell(
  state: PlayerSkillActionState,
  distance: number,
): { tileX: number; tileY: number } {
  const forward: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  const step = forward[state.facing];
  return {
    tileX: state.tileX + step.x * distance,
    tileY: state.tileY + step.y * distance,
  };
}

function skillZeroVisualSpawns(
  state: PlayerSkillActionState,
  effectAge: number,
): PlayerSkillVisualSpawn[] {
  const effectType: 1 | 2 = effectAge === 4 || effectAge === 8 ? 2 : 1;
  const distance = effectAge === 1 || effectAge === 6 ? 1
    : effectAge === 2 || effectAge === 7 ? 2
      : effectAge === 4 || effectAge === 8 ? 3
        : effectAge === 0 || effectAge === 5 ? 0
          : undefined;
  if (distance === undefined) return [];
  const cells = [forwardCell(state, distance)];
  if (effectType === 2) {
    const sourceDiagonals: Record<Direction, [{ x: number; y: number }, { x: number; y: number }]> = {
      1: [{ x: 1, y: 0 }, { x: -1, y: 0 }],
      2: [{ x: -1, y: 0 }, { x: 1, y: 0 }],
      3: [{ x: 0, y: -1 }, { x: 0, y: 1 }],
      4: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
    };
    for (const side of sourceDiagonals[state.facing]) {
      cells.push({
        tileX: cells[0].tileX + side.x,
        tileY: cells[0].tileY + side.y,
      });
    }
  }
  return cells.map((cell) => ({
    ...cell,
    effectType,
    skillId: state.skillId!,
    levelSlot: 0,
  }));
}

function expandingCrossVisualSpawns(
  state: PlayerSkillActionState,
  effectAge: number,
  interval: number,
  effectType: 4 | 5 | 7,
): PlayerSkillVisualSpawn[] {
  const visualSpawns: PlayerSkillVisualSpawn[] = [];
  for (const startAge of [0, 6, 12]) {
    const elapsed = effectAge - startAge;
    if (elapsed < 0 || elapsed % interval !== 0 || elapsed / interval > 3) continue;
    for (const cell of sourceEffectCardinalCross(state, elapsed / interval)) {
      visualSpawns.push({
        ...cell,
        effectType,
        skillId: state.skillId!,
        levelSlot: 0,
      });
    }
  }
  return visualSpawns;
}

function sourceBiStreamSpawn(
  skillId: number,
  sourceStreamSlot: PlayerSkillLevelSlot,
  durationTicks: number,
  delayTicks = 0,
): PlayerSkillAttachedVisualSpawn {
  return {
    skillId,
    sourceStreamSlot,
    kind: 'stream',
    durationTicks,
    delayTicks,
  };
}

function expandingCrossDamageTargets(
  state: PlayerSkillActionState,
  effectAge: number,
  interval: number,
): Array<{ tileX: number; tileY: number }> {
  const targets: Array<{ tileX: number; tileY: number }> = [];
  for (const startAge of [4, 10, 16]) {
    const elapsed = effectAge - startAge;
    if (elapsed >= 0 && elapsed % interval === 0) {
      targets.push(...cardinalCross(state, elapsed / interval));
    }
  }
  return targets;
}

function skillLevelOneRandomOffsets(
  rawRandomInteger: () => number,
): [[number, number], [number, number]] {
  const firstX = rawRandomInteger() % 3;
  const firstY = rawRandomInteger() % (3 - Math.abs(firstX));
  const secondX = rawRandomInteger() % 3;
  const secondY = rawRandomInteger() % (3 - Math.abs(secondX));
  return [[firstX, firstY], [secondX, secondY]];
}

function advanceOneUpdate(
  source: PlayerSkillActionState,
  randomInteger: (minimum: number, maximum: number) => number,
  rawRandomInteger: () => number,
  playerTile?: { tileX: number; tileY: number },
): PlayerSkillActionStep {
  const chargeTicksRemaining = tickCooldowns(source);
  const state: PlayerSkillActionState = {
    ...source,
    chargeTicksRemaining,
    comboPowerBoostTicksRemaining: Math.max(0, source.comboPowerBoostTicksRemaining - 1),
    counterattackBoostTicksRemaining: Math.max(0, source.counterattackBoostTicksRemaining - 1),
    recoveryBoostTicksRemaining: Math.max(0, source.recoveryBoostTicksRemaining - 1),
    defenseBoostTicksRemaining: Math.max(0, source.defenseBoostTicksRemaining - 1),
  };
  const damagePulses: PlayerSkillDamagePulse[] = [];
  const instantKillCells: PlayerSkillInstantKillCell[] = [];
  const visualSpawns: PlayerSkillVisualSpawn[] = [];
  const attachedVisualSpawns: PlayerSkillAttachedVisualSpawn[] = [];
  const restoreEffects: PlayerSkillRestoreEffect[] = [];
  let cameraShakeOffset: { x: number; y: number } | undefined;
  let statusEffectsCleared = false;
  if (state.phase === 0) {
    return {
      state,
      damagePulses,
      instantKillCells,
      visualSpawns,
      attachedVisualSpawns,
      restoreEffects,
      statusEffectsCleared,
    };
  }

  let next = state;
  if (state.phase === 1) {
    const windupTicksRemaining = state.windupTicksRemaining - 1;
    next = { ...state, windupTicksRemaining, frame: state.frame + 1 };
    if (windupTicksRemaining === 0) {
      next = state.durationTicks > 0
        ? { ...next, phase: 2, frame: 0 }
        : { ...next, phase: 3, frame: 0 };
    }
  } else if (state.phase === 2) {
    const durationTicksRemaining = state.durationTicksRemaining - 1;
    const frame = (state.frame + 1) % 4;
    next = { ...state, durationTicksRemaining, frame };
    if (durationTicksRemaining <= 0) next = { ...next, phase: 3, frame: 0 };
  } else {
    const frame = Math.min(11, state.frame + 1);
    next = { ...state, frame };
    if (state.effectComplete && frame >= 11) {
      next = { ...next, phase: 0, levelSlot: null, frame: 0 };
    }
  }

  // `o.e()` runs the skill effect after the phase switch. An effect that enters
  // phase 3 on this update therefore starts at source age zero immediately.
  if (next.phase === 3) {
    const skillId = next.skillId;
    const levelSlot = next.levelSlot;
    const age = next.effectAge;
    if (skillId === 2 && levelSlot === 0 && age <= 5) {
      // Source `o.h()` offsets `ad`'s camera for the next paint pass.
      cameraShakeOffset = {
        x: randomInteger(-4, 4),
        y: randomInteger(-4, 4),
      };
    }
    if (skillId === 0 && levelSlot === 0) {
      visualSpawns.push(...skillZeroVisualSpawns(next, age));
      const power = next.skillRank * 3 + 40 + next.skillPowerStat;
      damagePulses.push(...skillZeroDamageTargets(next, age).map((cell) => ({
        ...cell,
        power,
        elementCode: 1 as const,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 2 && levelSlot === 0) {
      if (age <= 7) {
        const cell = forwardCell(next, age % 4);
        visualSpawns.push({ ...cell, effectType: 4, skillId, levelSlot: 0 });
      }
      const power = next.skillRank * 3 + 35 + Math.floor((next.skillPowerStat * 3) / 2);
      damagePulses.push(...skillTwoDamageTargets(next, age).map((cell) => ({
        ...cell,
        power,
        elementCode: 3 as const,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 3 && levelSlot === 0) {
      visualSpawns.push(...expandingCrossVisualSpawns(next, age, 3, 5));
      const damagePower = next.skillRank * 3 + 35 + next.skillPowerStat;
      damagePulses.push(...expandingCrossDamageTargets(next, age, 3).map((cell) => ({
        ...cell,
        power: damagePower,
        elementCode: 1 as const,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 4 && levelSlot === 0) {
      visualSpawns.push(...expandingCrossVisualSpawns(next, age, 5, 7));
      const damagePower = next.skillRank * 3 + 35 + next.skillPowerStat;
      damagePulses.push(...expandingCrossDamageTargets(next, age, 5).map((cell) => ({
        ...cell,
        power: damagePower,
        elementCode: 2 as const,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 5 && levelSlot === 0) {
      visualSpawns.push(...expandingCrossVisualSpawns(next, age, 5, 4));
      const damagePower = next.skillRank * 3 + 35 + next.skillPowerStat;
      damagePulses.push(...expandingCrossDamageTargets(next, age, 5).map((cell) => ({
        ...cell,
        power: damagePower,
        elementCode: 3 as const,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 4 && levelSlot === 1) {
      // Source `o.b(2)` consumes four raw draws on every effect update. Type-8
      // spawns resolve their frames from the extracted `grd/spr/4_1.eif` stream.
      const offsets = skillLevelOneRandomOffsets(rawRandomInteger);
      if (age < 80) {
        visualSpawns.push(...offsets.map(([offsetX, offsetY]) => ({
          tileX: next.tileX + offsetX,
          tileY: next.tileY + offsetY,
          effectType: 8 as const,
          skillId,
          levelSlot: 1 as const,
        })));
      }
      const currentPlayerTile = playerTile ?? (() => {
        const forward: Record<Direction, { x: number; y: number }> = {
          1: { x: 0, y: -1 },
          2: { x: 0, y: 1 },
          3: { x: -1, y: 0 },
          4: { x: 1, y: 0 },
        };
        const step = forward[next.facing];
        return { tileX: next.tileX - step.x, tileY: next.tileY - step.y };
      })();
      const withinGuardRange = Math.abs(currentPlayerTile.tileX - next.tileX) +
        Math.abs(currentPlayerTile.tileY - next.tileY) <= 2;
      next = {
        ...next,
        damageImmunityActive: age < SKILL_EFFECT_END_AGES[skillId][levelSlot] && withinGuardRange,
      };
    } else if (skillId === 3 && levelSlot === 1) {
      const offsets = skillLevelOneRandomOffsets(rawRandomInteger);
      if (age < 80) {
        visualSpawns.push(...offsets.map(([offsetX, offsetY]) => ({
          tileX: next.tileX + offsetX,
          tileY: next.tileY + offsetY,
          effectType: 6 as const,
          skillId,
          levelSlot: 1 as const,
        })));
        const damagePower = next.skillRank + 45 +
          Math.floor((next.skillPowerStat * 3) / 2);
        damagePulses.push(...offsets.map(([offsetX, offsetY]) => ({
          tileX: next.tileX + offsetX,
          tileY: next.tileY + offsetY,
          power: damagePower,
          elementCode: 1 as const,
          actionId: next.nextActionId - 1,
        })));
      }
    } else if (skillId === 5 && levelSlot === 1) {
      const offsets = skillLevelOneRandomOffsets(rawRandomInteger);
      if (age < 80) {
        visualSpawns.push(...offsets.map(([offsetX, offsetY]) => ({
          tileX: next.tileX + offsetX,
          tileY: next.tileY + offsetY,
          effectType: 9 as const,
          skillId,
          levelSlot: 1 as const,
        })));
        const damagePower = next.skillRank + 45 +
          Math.floor((next.skillPowerStat * 3) / 2);
        damagePulses.push(...offsets.map(([offsetX, offsetY]) => ({
          tileX: next.tileX + offsetX,
          tileY: next.tileY + offsetY,
          power: damagePower,
          elementCode: 3 as const,
          actionId: next.nextActionId - 1,
        })));
      }
    } else if ((skillId === 3 || skillId === 5) && levelSlot === 2 && age === 0) {
      const forward: Record<Direction, { x: number; y: number }> = {
        1: { x: 0, y: -1 },
        2: { x: 0, y: 1 },
        3: { x: -1, y: 0 },
        4: { x: 1, y: 0 },
      };
      const step = forward[next.facing];
      instantKillCells.push(...[0, 1, 2, 3].map((distance) => ({
        tileX: next.tileX + step.x * distance,
        tileY: next.tileY + step.y * distance,
        elementCode: (skillId === 3 ? 1 : 3) as 1 | 3,
        actionId: next.nextActionId - 1,
      })));
    } else if (skillId === 0 && levelSlot === 1 && age === 0) {
      next = { ...next, comboPowerBoostTicksRemaining: COMBO_POWER_BOOST_TICKS };
      attachedVisualSpawns.push(sourceBiStreamSpawn(0, 1, 8));
    } else if (skillId === 0 && levelSlot === 2 && age === 0) {
      next = { ...next, counterattackBoostTicksRemaining: COUNTERATTACK_BOOST_TICKS };
      attachedVisualSpawns.push({
        skillId: 0,
        sourceStreamSlot: null,
        kind: 'skill-0-aura',
        durationTicks: 160,
        delayTicks: 0,
      });
    } else if (skillId === 1 && levelSlot === 0 && age === 0) {
      restoreEffects.push({ resource: 'hp', percent: 30 });
      attachedVisualSpawns.push(sourceBiStreamSpawn(1, 0, 8));
    } else if (skillId === 1 && levelSlot === 1 && age === 0) {
      restoreEffects.push({ resource: 'sp', percent: 20 });
      attachedVisualSpawns.push(sourceBiStreamSpawn(1, 1, 9));
    } else if (skillId === 1 && levelSlot === 2 && age === 0) {
      next = { ...next, recoveryBoostTicksRemaining: 81 };
      attachedVisualSpawns.push(
        sourceBiStreamSpawn(1, 0, 80),
        sourceBiStreamSpawn(1, 0, 8, 4),
        sourceBiStreamSpawn(1, 0, 8, 24),
        sourceBiStreamSpawn(1, 0, 8, 44),
      );
    } else if (skillId === 4 && levelSlot === 2 && age === 0) {
      restoreEffects.push({ resource: 'hp', percent: 20 }, { resource: 'sp', percent: 20 });
      attachedVisualSpawns.push(sourceBiStreamSpawn(4, 2, 15));
    } else if (skillId === 2 && levelSlot === 2 && age === 0) {
      next = { ...next, comboPowerBoostTicksRemaining: 0, defenseBoostTicksRemaining: 0 };
      statusEffectsCleared = true;
      attachedVisualSpawns.push(sourceBiStreamSpawn(2, 2, 12));
    } else if (skillId === 2 && levelSlot === 1 && age === 0) {
      next = { ...next, defenseBoostTicksRemaining: DEFENSE_BOOST_TICKS };
      attachedVisualSpawns.push(sourceBiStreamSpawn(2, 1, 8));
    }
    const endAge = skillId === null || levelSlot === null
      ? Number.POSITIVE_INFINITY
      : SKILL_EFFECT_END_AGES[skillId][levelSlot];
    next = {
      ...next,
      effectAge: age + 1,
      effectComplete: next.effectComplete || age === endAge,
    };
  }
  return {
    state: next,
    damagePulses,
    instantKillCells,
    visualSpawns,
    attachedVisualSpawns,
    restoreEffects,
    statusEffectsCleared,
    ...(cameraShakeOffset === undefined ? {} : { cameraShakeOffset }),
  };
}

/** Advance the source `o.e()` action/charge state on the measured map cadence. */
export function advancePlayerSkillAction(
  source: PlayerSkillActionState,
  elapsedMs: number,
  randomInteger: (minimum: number, maximum: number) => number = () => 0,
  rawRandomInteger: () => number = () => 0,
  playerTile?: { tileX: number; tileY: number },
): PlayerSkillActionStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('elapsedMs must be a non-negative finite number');
  }
  let state = { ...source, tickRemainderMs: source.tickRemainderMs + elapsedMs };
  const damagePulses: PlayerSkillDamagePulse[] = [];
  const instantKillCells: PlayerSkillInstantKillCell[] = [];
  const visualSpawns: PlayerSkillVisualSpawn[] = [];
  const attachedVisualSpawns: PlayerSkillAttachedVisualSpawn[] = [];
  const restoreEffects: PlayerSkillRestoreEffect[] = [];
  let cameraShakeOffset: { x: number; y: number } | undefined;
  let statusEffectsCleared = false;
  while (state.tickRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
    const step = advanceOneUpdate(state, randomInteger, rawRandomInteger, playerTile);
    state = {
      ...step.state,
      tickRemainderMs: state.tickRemainderMs - WORLD_UPDATE_PERIOD_MS,
    };
    damagePulses.push(...step.damagePulses);
    instantKillCells.push(...step.instantKillCells);
    visualSpawns.push(...step.visualSpawns);
    attachedVisualSpawns.push(...step.attachedVisualSpawns);
    restoreEffects.push(...step.restoreEffects);
    if (step.cameraShakeOffset !== undefined) cameraShakeOffset = step.cameraShakeOffset;
    statusEffectsCleared ||= step.statusEffectsCleared;
  }
  return {
    state,
    damagePulses,
    instantKillCells,
    visualSpawns,
    attachedVisualSpawns,
    restoreEffects,
    statusEffectsCleared,
    ...(cameraShakeOffset === undefined ? {} : { cameraShakeOffset }),
  };
}

/** Exact source `o.m113a()` result: an actor target is reconsidered while true. */
export function sourceActionNeedsActorTargetReselection(source: PlayerSkillActionState): boolean {
  return source.durationTicks - source.durationTicksRemaining < 10;
}

/** Source `an.c(percent)` / `an.e(percent)` restoration, clamped to its maximum. */
export function restoreSkillResource(current: number, maximum: number, percent: number): number {
  return Math.min(maximum, current + Math.floor((maximum * percent) / 100));
}
