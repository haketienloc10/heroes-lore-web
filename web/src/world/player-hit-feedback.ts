import type { Direction } from './actor';

export interface PlayerHitFeedbackState {
  /** Source `an.r`: the hit direction used by the next player paint only. */
  pendingRenderDirection: Direction | null;
}

export interface PlayerHitRenderOffset {
  x: number;
  y: number;
}

export const EMPTY_PLAYER_HIT_FEEDBACK: PlayerHitFeedbackState = {
  pendingRenderDirection: null,
};

const DIRECTION_VECTOR: Record<Direction, PlayerHitRenderOffset> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};

/** Queue `an.a(ak, short, byte)`'s one-paint hit direction after a non-evaded hit. */
export function recordPlayerHitFeedback(
  state: PlayerHitFeedbackState,
  direction: Direction,
): PlayerHitFeedbackState {
  return { ...state, pendingRenderDirection: direction };
}

/** Consume `an.a(Graphics, int, int)`'s two-pixel directional offset once. */
export function consumePlayerHitRenderOffset(
  state: PlayerHitFeedbackState,
): { state: PlayerHitFeedbackState; offset: PlayerHitRenderOffset } {
  const direction = state.pendingRenderDirection;
  return {
    state: EMPTY_PLAYER_HIT_FEEDBACK,
    offset: direction === null
      ? { x: 0, y: 0 }
      : {
        x: DIRECTION_VECTOR[direction].x * 2,
        y: DIRECTION_VECTOR[direction].y * 2,
      },
  };
}
