import { describe, expect, it } from 'vitest';
import {
  advanceGameOverSequence,
  beginGameOverSequence,
  GAME_OVER_DEATH_TICKS,
  GAME_OVER_REVEAL_TICKS,
} from '../src/world/game-over';
import { WORLD_UPDATE_PERIOD_MS } from '../src/world/actor';

describe('source game-over sequence', () => {
  it('waits through the 24-tick death state before revealing the title', () => {
    const advanced = advanceGameOverSequence(
      beginGameOverSequence(),
      GAME_OVER_DEATH_TICKS * WORLD_UPDATE_PERIOD_MS,
    );

    expect(advanced.sequence).toEqual({
      phase: 'death',
      ticksRemaining: 0,
      remainderMs: 0,
    });
    expect(advanced.revealWidths).toEqual([]);
    expect(advanced.completed).toBe(false);
  });

  it('reveals 16 stepped text frames and completes on the final frame', () => {
    const started = advanceGameOverSequence(
      beginGameOverSequence(),
      (GAME_OVER_DEATH_TICKS + 1) * WORLD_UPDATE_PERIOD_MS,
    );
    expect(started.sequence).toEqual({
      phase: 'reveal',
      ticksRemaining: GAME_OVER_REVEAL_TICKS - 1,
      remainderMs: 0,
    });
    expect(started.revealWidths).toEqual([2]);

    const finished = advanceGameOverSequence(
      started.sequence!,
      (GAME_OVER_REVEAL_TICKS - 1) * WORLD_UPDATE_PERIOD_MS,
    );
    expect(finished.sequence).toBeNull();
    expect(finished.completed).toBe(true);
    expect(finished.revealWidths).toEqual(
      Array.from({ length: GAME_OVER_REVEAL_TICKS - 1 }, (_, index) => (index + 2) * 2),
    );
    expect(finished.revealWidths.at(-1)).toBe(32);
  });

  it('retains sub-tick time and rejects invalid timing input', () => {
    expect(advanceGameOverSequence(beginGameOverSequence(), 70)).toMatchObject({
      sequence: { phase: 'death', ticksRemaining: GAME_OVER_DEATH_TICKS, remainderMs: 70 },
      revealWidths: [],
      completed: false,
    });
    expect(() => advanceGameOverSequence(beginGameOverSequence(), -1)).toThrow(RangeError);
    expect(() => advanceGameOverSequence({
      phase: 'reveal',
      ticksRemaining: 0,
      remainderMs: 0,
    }, 0)).toThrow(RangeError);
  });
});
