import { describe, expect, it } from 'vitest';
import {
  advanceNpcMotion,
  NPC_MOVEMENT_STEP_PIXELS,
  resolveNpcCutsceneVisualStates,
} from '../src/world/npc-motion';

describe('NPC movement', () => {
  it('moves eight pixels per source world update in each facing direction', () => {
    const expected = new Map([
      [1, { x: 32, y: 24 }],
      [2, { x: 32, y: 40 }],
      [3, { x: 24, y: 32 }],
      [4, { x: 40, y: 32 }],
    ]);
    for (const direction of [1, 2, 3, 4] as const) {
      expect(advanceNpcMotion({ x: 32, y: 32, direction, moving: true }, 1))
        .toMatchObject(expected.get(direction)!);
    }
    expect(NPC_MOVEMENT_STEP_PIXELS).toBe(8);
  });

  it('uses the full number of source updates and leaves stopped NPCs in place', () => {
    const moving = advanceNpcMotion({ x: 16, y: 48, direction: 4, moving: true }, 3);
    expect(moving).toEqual({ x: 40, y: 48, direction: 4, moving: true });
    const stopped = { x: 16, y: 48, direction: 4 as const, moving: false };
    expect(advanceNpcMotion(stopped, 3)).toBe(stopped);
    expect(advanceNpcMotion(stopped, 0)).toBe(stopped);
  });

  it('rejects invalid update counts', () => {
    const npc = { x: 0, y: 0, direction: 1 as const, moving: true };
    expect(() => advanceNpcMotion(npc, -1)).toThrow(RangeError);
    expect(() => advanceNpcMotion(npc, 0.5)).toThrow(RangeError);
  });

  it('applies ordered cutscene NPC state by source placement on any active map', () => {
    const map62Npcs = [
      { sourceOrder: 0, direction: 2 as const, moving: false },
      { sourceOrder: 1, direction: 4 as const, moving: false },
    ];
    expect(resolveNpcCutsceneVisualStates(map62Npcs, { 0: 3 }, { 0: true })).toEqual([
      { sourceOrder: 0, direction: 3, moving: true },
      { sourceOrder: 1, direction: 4, moving: false },
    ]);
  });
});
