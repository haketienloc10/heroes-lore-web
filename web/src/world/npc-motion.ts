import type { Direction } from './actor';

export const NPC_MOVEMENT_STEP_PIXELS = 8;

export interface NpcMotionState {
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
}

export interface NpcCutsceneVisualState {
  sourceOrder: number;
  direction: Direction;
  moving: boolean;
}

const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  1: { x: 0, y: -1 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
  4: { x: 1, y: 0 },
};

/** Move an NPC by the source's eight-pixel step for each world update. */
export function advanceNpcMotion(state: NpcMotionState, worldUpdates: number): NpcMotionState {
  if (!Number.isInteger(worldUpdates) || worldUpdates < 0) {
    throw new RangeError('NPC world update count must be a non-negative integer');
  }
  if (!state.moving || worldUpdates === 0) return state;
  const direction = DIRECTION_VECTOR[state.direction];
  return {
    ...state,
    x: state.x + direction.x * NPC_MOVEMENT_STEP_PIXELS * worldUpdates,
    y: state.y + direction.y * NPC_MOVEMENT_STEP_PIXELS * worldUpdates,
  };
}

/** Apply command-driven direction and motion state to NPCs on the active map. */
export function resolveNpcCutsceneVisualStates(
  npcs: readonly NpcCutsceneVisualState[],
  directions: Readonly<Record<number, Direction>>,
  movingStates: Readonly<Record<number, boolean>>,
): NpcCutsceneVisualState[] {
  return npcs.map((npc) => ({
    ...npc,
    direction: directions[npc.sourceOrder] ?? npc.direction,
    moving: movingStates[npc.sourceOrder] ?? npc.moving,
  }));
}
