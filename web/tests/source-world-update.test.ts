import { describe, expect, it } from 'vitest';
import {
  advanceSourcePaintClock,
  sourceActorSimulationDelta,
  sourceGameplaySimulationDelta,
  shouldPauseSourceWorldSimulation,
  shouldResumeSourceEventBeforeWorldUpdate,
  sourceWorldSimulationDelta,
  sourceWorldUpdateScope,
} from '../src/world/source-world-update';

describe('source event-dialogue world timing', () => {
  it('pauses under ordinary interaction dialogue', () => {
    expect(shouldPauseSourceWorldSimulation(true, false, null, false)).toBe(true);
  });

  it.each(['dialogue', 'choice', 'flash', 'shake'])('pauses under ordered-cutscene %s', (status) => {
    expect(shouldPauseSourceWorldSimulation(false, true, status, false)).toBe(true);
  });

  it('keeps source opcode-4 movement delays active', () => {
    expect(shouldPauseSourceWorldSimulation(false, true, 'delay', true)).toBe(false);
    expect(sourceWorldSimulationDelta(142, false)).toBe(142);
  });

  it('limits ordered movement-mode ticks to the actor and NPC update path', () => {
    expect(sourceWorldUpdateScope(false, true, 'delay', true)).toBe('actor-and-npc');
    expect(sourceActorSimulationDelta(71, 'actor-and-npc')).toBe(71);
    expect(sourceGameplaySimulationDelta(71, 'actor-and-npc')).toBe(0);
    expect(sourceWorldUpdateScope(false, true, 'dialogue', false)).toBe('paused');
    expect(sourceWorldUpdateScope(false, false, null, false)).toBe('full');
    expect(sourceGameplaySimulationDelta(71, 'full')).toBe(71);
  });

  it('does not tick the map for an interpreter back-edge yield', () => {
    expect(shouldPauseSourceWorldSimulation(false, true, 'delay', false)).toBe(true);
    expect(sourceWorldSimulationDelta(142, true)).toBe(0);
  });

  it('resumes deferred event commands at the next source world-update boundary', () => {
    expect(shouldResumeSourceEventBeforeWorldUpdate(true, 0, 35)).toBe(false);
    expect(shouldResumeSourceEventBeforeWorldUpdate(true, 35, 36)).toBe(true);
    expect(shouldResumeSourceEventBeforeWorldUpdate(false, 35, 36)).toBe(false);
    expect(() => shouldResumeSourceEventBeforeWorldUpdate(true, 71, 1)).toThrow(RangeError);
  });

  it('holds the gameplay delta for either modal dialogue path', () => {
    expect(sourceWorldSimulationDelta(142, true)).toBe(0);
  });

  it('counts modal source paints without advancing the world tick', () => {
    expect(advanceSourcePaintClock(35, 0)).toEqual({ passes: 0, remainderMs: 35 });
    expect(advanceSourcePaintClock(36, 35)).toEqual({ passes: 1, remainderMs: 0 });
    expect(advanceSourcePaintClock(213, 0)).toEqual({ passes: 3, remainderMs: 0 });
  });
});
