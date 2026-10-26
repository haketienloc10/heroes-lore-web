import { describe, expect, it } from 'vitest';
import {
  consumePlayerHitRenderOffset,
  EMPTY_PLAYER_HIT_FEEDBACK,
  recordPlayerHitFeedback,
} from '../src/world/player-hit-feedback';

describe('source player hit feedback', () => {
  it.each([
    [1, { x: 0, y: -2 }],
    [2, { x: 0, y: 2 }],
    [3, { x: -2, y: 0 }],
    [4, { x: 2, y: 0 }],
  ] as const)('uses the source two-pixel offset for direction %i', (direction, expected) => {
    const queued = recordPlayerHitFeedback(EMPTY_PLAYER_HIT_FEEDBACK, direction);
    expect(consumePlayerHitRenderOffset(queued).offset).toEqual(expected);
  });

  it('consumes the hit offset on one render only', () => {
    const queued = recordPlayerHitFeedback(EMPTY_PLAYER_HIT_FEEDBACK, 4);
    const firstPaint = consumePlayerHitRenderOffset(queued);
    const secondPaint = consumePlayerHitRenderOffset(firstPaint.state);

    expect(firstPaint.offset).toEqual({ x: 2, y: 0 });
    expect(secondPaint.offset).toEqual({ x: 0, y: 0 });
  });

  it('keeps the last hit direction when several hits precede a paint', () => {
    const firstHit = recordPlayerHitFeedback(EMPTY_PLAYER_HIT_FEEDBACK, 1);
    const secondHit = recordPlayerHitFeedback(firstHit, 3);

    expect(consumePlayerHitRenderOffset(secondHit).offset).toEqual({ x: -2, y: 0 });
  });
});
