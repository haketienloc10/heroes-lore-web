import { WORLD_UPDATE_PERIOD_MS } from './actor';

export type HeroCombatClass = 6 | 7 | 8;
export type PlayerAttackStyle = 'light' | 'heavy';

export interface PlayerComboState {
  /** -1 before the first stage, then source q (0 through 4). */
  stage: number;
  frame: number;
  activeStyle: PlayerAttackStyle | null;
  queuedStyle: PlayerAttackStyle | null;
  recoveryTicks: number;
  tickRemainderMs: number;
}

export interface PlayerComboImpact {
  stage: number;
  style: PlayerAttackStyle;
  frame: number;
}

export interface PlayerComboFollowUp {
  previousStage: number;
  previousStyle: PlayerAttackStyle;
  stage: number;
  style: PlayerAttackStyle;
}

export interface PlayerComboStep {
  state: PlayerComboState;
  impacts: PlayerComboImpact[];
  followUps: PlayerComboFollowUp[];
}

export const EMPTY_PLAYER_COMBO: PlayerComboState = {
  stage: -1,
  frame: 0,
  activeStyle: null,
  queuedStyle: null,
  recoveryTicks: 0,
  tickRemainderMs: 0,
};

// Source `an.b/c/d` frame thresholds: light row, then heavy row.
const CLASS_ATTACK_DURATIONS: Record<HeroCombatClass, readonly [readonly number[], readonly number[]]> = {
  6: [[4, 4, 4, 4, 0], [4, 0, 4, 4, 8]],
  7: [[3, 3, 3, 6, 0], [4, 0, 7, 9, 14]],
  8: [[3, 3, 3, 3, 0], [3, 0, 3, 3, 6]],
};

function signedByte(value: number): number {
  return (value << 24) >> 24;
}

function frameDuration(heroClass: HeroCombatClass, style: PlayerAttackStyle, stage: number): number {
  return CLASS_ATTACK_DURATIONS[heroClass][style === 'light' ? 0 : 1][stage] ?? 0;
}

/**
 * Queue a source light (key 5) or heavy (key 7) attack. Stage limits and
 * style restrictions follow `an.a(boolean)`; repeated input leaves the first
 * queued follow-up in place, as the source does.
 */
export function queuePlayerAttack(
  state: PlayerComboState,
  style: PlayerAttackStyle,
  comboLimit: number,
): { state: PlayerComboState; accepted: boolean } {
  const limit = Math.max(1, Math.min(5, Math.trunc(comboLimit)));
  if (state.stage + 1 >= limit || state.recoveryTicks > 0) return { state, accepted: false };
  const nextStage = state.stage + 1;
  if (state.queuedStyle !== null) return { state, accepted: true };
  if (state.stage >= 0 && state.activeStyle === 'heavy') return { state, accepted: false };
  if (state.stage === 0 && style === 'heavy') return { state, accepted: false };
  if (state.stage === 3 && style === 'light') return { state, accepted: false };
  return {
    state: { ...state, queuedStyle: style },
    accepted: true,
  };
}

function impactFrames(heroClass: HeroCombatClass, stage: number, style: PlayerAttackStyle): readonly number[] {
  if (style === 'light') return [heroClass === 6 ? 2 : 1];
  if (heroClass === 6) return stage === 4 ? [1, 6] : [2];
  if (heroClass === 7) return stage === 4 ? [0, 2, 4, 6, 8, 10] : stage === 3 ? [4] : [1];
  return stage === 4 ? [4] : [1];
}

function addImpactIfDue(
  impacts: PlayerComboImpact[],
  heroClass: HeroCombatClass,
  state: PlayerComboState,
): void {
  if (state.stage < 0 || state.activeStyle === null) return;
  if (impactFrames(heroClass, state.stage, state.activeStyle).includes(state.frame)) {
    impacts.push({ stage: state.stage, style: state.activeStyle, frame: state.frame });
  }
}

function advanceOneUpdate(
  state: PlayerComboState,
  heroClass: HeroCombatClass,
  comboLimit: number,
  impacts: PlayerComboImpact[],
  followUps: PlayerComboFollowUp[],
): PlayerComboState {
  if (state.recoveryTicks > 0) {
    const recoveryTicks = state.recoveryTicks - 1;
    return recoveryTicks === 0
      ? { ...EMPTY_PLAYER_COMBO, tickRemainderMs: state.tickRemainderMs }
      : { ...state, recoveryTicks };
  }
  if (state.queuedStyle === null && state.activeStyle === null) return state;

  let next: PlayerComboState = { ...state, frame: signedByte(state.frame + 1) };
  if (next.stage < 0) {
    next = { ...next, stage: 0, activeStyle: next.queuedStyle, queuedStyle: null };
  } else if (next.activeStyle !== null && next.frame === frameDuration(heroClass, next.activeStyle, next.stage)) {
    const limit = Math.max(1, Math.min(5, Math.trunc(comboLimit)));
    if (next.stage + 1 < limit && next.queuedStyle !== null) {
      followUps.push({
        previousStage: next.stage,
        previousStyle: next.activeStyle,
        stage: next.stage + 1,
        style: next.queuedStyle,
      });
      next = {
        ...next,
        stage: next.stage + 1,
        frame: 0,
        activeStyle: next.queuedStyle,
        queuedStyle: null,
      };
    } else {
      const recoveryTicks = next.activeStyle === 'light' ? 1 : 3;
      next = {
        ...next,
        activeStyle: null,
        queuedStyle: null,
        recoveryTicks,
      };
    }
  }
  addImpactIfDue(impacts, heroClass, next);
  return next;
}

/** Advance combo animation and emit source attack hit frames on 71 ms ticks. */
export function advancePlayerCombo(
  state: PlayerComboState,
  elapsedMs: number,
  heroClass: HeroCombatClass,
  comboLimit: number,
): PlayerComboStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('elapsedMs must be a non-negative finite number');
  }
  let next = { ...state, tickRemainderMs: state.tickRemainderMs + elapsedMs };
  const impacts: PlayerComboImpact[] = [];
  const followUps: PlayerComboFollowUp[] = [];
  while (next.tickRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
    next = advanceOneUpdate(next, heroClass, comboLimit, impacts, followUps);
    next.tickRemainderMs -= WORLD_UPDATE_PERIOD_MS;
  }
  return { state: next, impacts, followUps };
}

/** End an unaffordable follow-up at the stage that just reached its end. */
export function cancelPlayerComboFollowUp(
  state: PlayerComboState,
  previousStage: number,
  previousStyle: PlayerAttackStyle,
): PlayerComboState {
  return {
    ...state,
    stage: previousStage,
    activeStyle: null,
    queuedStyle: null,
    recoveryTicks: previousStyle === 'light' ? 1 : 3,
  };
}

export function playerAttackAnimationSlot(state: PlayerComboState): number {
  if (state.stage < 0 || state.activeStyle === null) return 3;
  if (state.stage === 0) return state.activeStyle === 'light' ? 3 : 7;
  if (state.stage === 1) return 4;
  if (state.stage === 2) return state.activeStyle === 'light' ? 5 : 8;
  if (state.stage === 3) return state.activeStyle === 'light' ? 6 : 9;
  return 10;
}

/** Select the source idle, walking, or active attack animation slot. */
export function playerSpriteAnimationSlot(state: PlayerComboState, moving: boolean): number {
  if (state.activeStyle !== null) return playerAttackAnimationSlot(state);
  return moving ? 1 : 0;
}

export function playerAttackPower(basePower: number, impact: PlayerComboImpact): number {
  const lightTenths = [10, 12, 13, 14, 17][impact.stage] ?? 17;
  return Math.trunc((basePower * (impact.style === 'heavy' ? 17 : lightTenths)) / 10);
}

/** Source follow-up cost from the weapon's equipment byte and attack style. */
export function playerAttackSpCost(weaponEquipmentByte: number, style: PlayerAttackStyle): number {
  const baseCost = Math.trunc(weaponEquipmentByte / 4) + 4;
  return style === 'heavy' ? Math.trunc((baseCost * 7) / 5) : baseCost;
}

