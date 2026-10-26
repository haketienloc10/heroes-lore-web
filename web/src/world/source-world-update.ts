import { consumeFixedSteps } from '../core/fixed-step';
import { WORLD_UPDATE_PERIOD_MS } from './actor';

export type SourceWorldUpdateScope = 'full' | 'actor-and-npc' | 'paused';

/**
 * Source event text/choice states advance the script and text reveal without
 * running the gameplay map/player update. Preserve the supplied frame delta
 * for ordinary gameplay; update-scope selection handles event movement mode.
 */
export function shouldPauseSourceWorldSimulation(
  worldDialogueVisible: boolean,
  openingDialogVisible: boolean,
  openingCutsceneStatus: string | null,
  sourceWorldTickDuringDelay: boolean,
): boolean {
  return worldDialogueVisible || (openingDialogVisible && (
    openingCutsceneStatus === 'dialogue' || openingCutsceneStatus === 'choice' ||
    openingCutsceneStatus === 'flash' || openingCutsceneStatus === 'shake' ||
    (openingCutsceneStatus === 'delay' && !sourceWorldTickDuringDelay)
  ));
}

export function sourceWorldSimulationDelta(elapsedMs: number, paused: boolean): number {
  return paused ? 0 : elapsedMs;
}

export function sourceActorSimulationDelta(
  elapsedMs: number,
  scope: SourceWorldUpdateScope,
): number {
  return scope === 'paused' ? 0 : elapsedMs;
}

export function sourceGameplaySimulationDelta(
  elapsedMs: number,
  scope: SourceWorldUpdateScope,
): number {
  return scope === 'full' ? elapsedMs : 0;
}

/** Separate mode-4 hero/NPC ticks from mode-2 enemy and map-entity updates. */
export function sourceWorldUpdateScope(
  worldDialogueVisible: boolean,
  openingDialogVisible: boolean,
  openingCutsceneStatus: string | null,
  sourceWorldTickDuringDelay: boolean,
): SourceWorldUpdateScope {
  if (shouldPauseSourceWorldSimulation(
    worldDialogueVisible,
    openingDialogVisible,
    openingCutsceneStatus,
    sourceWorldTickDuringDelay,
  )) return 'paused';
  if (openingDialogVisible && (
    openingCutsceneStatus === 'running' ||
    (openingCutsceneStatus === 'delay' && sourceWorldTickDuringDelay)
  )) return 'actor-and-npc';
  return 'full';
}

/** Resume a deferred event command only when the next source world tick is due. */
export function shouldResumeSourceEventBeforeWorldUpdate(
  resumePending: boolean,
  tickRemainderMs: number,
  elapsedMs: number,
): boolean {
  if (!Number.isFinite(tickRemainderMs) || tickRemainderMs < 0 || tickRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
    throw new RangeError('World update remainder must be within one source tick');
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Elapsed time must be non-negative and finite');
  }
  return resumePending && tickRemainderMs + elapsedMs >= WORLD_UPDATE_PERIOD_MS;
}

/** Count paced source paint passes independently from simulation ticks. */
export function advanceSourcePaintClock(
  elapsedMs: number,
  remainderMs: number,
): { passes: number; remainderMs: number } {
  const result = consumeFixedSteps(elapsedMs, remainderMs, WORLD_UPDATE_PERIOD_MS);
  return { passes: result.steps, remainderMs: result.remainderMs };
}
