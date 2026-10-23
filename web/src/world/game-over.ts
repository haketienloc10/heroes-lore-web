import { WORLD_UPDATE_PERIOD_MS } from './actor';

export const GAME_OVER_DEATH_TICKS = 24;
export const GAME_OVER_REVEAL_TICKS = 16;

export interface GameOverSequence {
  phase: 'death' | 'reveal';
  ticksRemaining: number;
  remainderMs: number;
}

export interface GameOverAdvance {
  sequence: GameOverSequence | null;
  revealWidths: number[];
  completed: boolean;
}

export function beginGameOverSequence(): GameOverSequence {
  return {
    phase: 'death',
    ticksRemaining: GAME_OVER_DEATH_TICKS,
    remainderMs: 0,
  };
}

/** Advance the source's 71 ms death updates and 16 game-over paint frames. */
export function advanceGameOverSequence(
  sequence: GameOverSequence,
  elapsedMs: number,
): GameOverAdvance {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Game-over elapsed time must be finite and non-negative');
  }
  if (!Number.isInteger(sequence.ticksRemaining) || sequence.ticksRemaining < 0 ||
    sequence.phase === 'death' && sequence.ticksRemaining > GAME_OVER_DEATH_TICKS ||
    sequence.phase === 'reveal' && (sequence.ticksRemaining < 1 ||
      sequence.ticksRemaining > GAME_OVER_REVEAL_TICKS) ||
    sequence.phase !== 'death' && sequence.phase !== 'reveal' ||
    !Number.isFinite(sequence.remainderMs) || sequence.remainderMs < 0 ||
    sequence.remainderMs >= WORLD_UPDATE_PERIOD_MS) {
    throw new RangeError('Invalid game-over sequence state');
  }

  let next: GameOverSequence | null = { ...sequence };
  next.remainderMs += elapsedMs;
  const revealWidths: number[] = [];
  while (next !== null && next.remainderMs >= WORLD_UPDATE_PERIOD_MS) {
    next.remainderMs -= WORLD_UPDATE_PERIOD_MS;
    if (next.phase === 'death') {
      if (next.ticksRemaining > 0) {
        next.ticksRemaining -= 1;
        continue;
      }
      next = { ...next, phase: 'reveal', ticksRemaining: GAME_OVER_REVEAL_TICKS };
    }

    revealWidths.push((GAME_OVER_REVEAL_TICKS + 1 - next.ticksRemaining) * 2);
    next.ticksRemaining -= 1;
    if (next.ticksRemaining === 0) next = null;
  }

  return { sequence: next, revealWidths, completed: next === null };
}
