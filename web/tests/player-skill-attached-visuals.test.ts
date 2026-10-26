import { describe, expect, it } from 'vitest';
import {
  advancePlayerSkillAttachedVisuals,
  createPlayerSkillAttachedVisual,
  playerSkillAuraLayers,
  sourceInstantKillAttachedVisualSpawn,
} from '../src/world/player-skill-attached-visuals';

describe('source player skill actor-attached visuals', () => {
  it('consumes `bi` delay after each actor paint before drawing frame zero', () => {
    let [visual] = [createPlayerSkillAttachedVisual(1, {
      skillId: 1,
      sourceStreamSlot: 0,
      kind: 'stream',
      durationTicks: 8,
      delayTicks: 4,
    }, { kind: 'player' })];
    expect(visual).toMatchObject({ frameIndex: -4, delayTicksRemaining: 4 });
    for (const remaining of [3, 2, 1, 0]) {
      [visual] = advancePlayerSkillAttachedVisuals([visual]);
      expect(visual).toMatchObject({
        frameIndex: remaining === 0 ? 0 : -remaining,
        delayTicksRemaining: remaining,
      });
    }
    [visual] = advancePlayerSkillAttachedVisuals([visual]);
    expect(visual).toMatchObject({ frameIndex: 1, delayTicksRemaining: 0 });
  });

  it('draws frame zero before advancing and removes a `bi` track at its duration', () => {
    let [visual] = [createPlayerSkillAttachedVisual(1, {
      skillId: 2,
      sourceStreamSlot: 2,
      kind: 'stream',
      durationTicks: 3,
      delayTicks: 0,
    }, { kind: 'enemy', sourceOrder: 17 })];
    expect(visual.frameIndex).toBe(0);
    [visual] = advancePlayerSkillAttachedVisuals([visual]);
    expect(visual.frameIndex).toBe(1);
    [visual] = advancePlayerSkillAttachedVisuals([visual]);
    expect(visual.frameIndex).toBe(2);
    expect(advancePlayerSkillAttachedVisuals([visual])).toEqual([]);
  });

  it('batches elapsed source paint passes and leaves zero-pass visuals unchanged', () => {
    const visual = createPlayerSkillAttachedVisual(1, {
      skillId: 4,
      sourceStreamSlot: 1,
      kind: 'stream',
      durationTicks: 8,
      delayTicks: 2,
    }, { kind: 'player' });
    expect(advancePlayerSkillAttachedVisuals([visual], 0)).toEqual([visual]);
    expect(advancePlayerSkillAttachedVisuals([visual], 3)).toMatchObject([
      { frameIndex: 1, delayTicksRemaining: 0 },
    ]);
    expect(() => advancePlayerSkillAttachedVisuals([visual], -1)).toThrow(RangeError);
  });

  it('does not age a visual by paint passes that occurred before it spawned', () => {
    const lateVisual = createPlayerSkillAttachedVisual(2, {
      skillId: 4,
      sourceStreamSlot: 1,
      kind: 'stream',
      durationTicks: 8,
      delayTicks: 0,
    }, { kind: 'player' }, 2);
    expect(advancePlayerSkillAttachedVisuals([lateVisual], 3)).toMatchObject([
      { frameIndex: 1, pendingPaintPassesBeforeBirth: 0 },
    ]);
  });

  it('matches the skill-0 level-2 aura image cadence', () => {
    expect([0, 1, 2, 3, 4].map(playerSkillAuraLayers)).toEqual([
      [],
      [{ imageIndex: 0, yOffset: 9 }],
      [{ imageIndex: 0, yOffset: 9 }, { imageIndex: 1, yOffset: 12 }],
      [{ imageIndex: 1, yOffset: 12 }],
      [],
    ]);
  });

  it('attaches skill-3 and skill-5 level-2 streams only to matching ordinary enemies', () => {
    expect(sourceInstantKillAttachedVisualSpawn(3, { elementCode: 1 })).toMatchObject({
      skillId: 3,
      sourceStreamSlot: 2,
      durationTicks: 7,
    });
    expect(sourceInstantKillAttachedVisualSpawn(5, { elementCode: 3 })).toMatchObject({
      skillId: 5,
      sourceStreamSlot: 2,
      durationTicks: 9,
    });
    expect(sourceInstantKillAttachedVisualSpawn(3, undefined)).toBeNull();
    expect(sourceInstantKillAttachedVisualSpawn(3, { elementCode: 3 })).toBeNull();
    expect(sourceInstantKillAttachedVisualSpawn(5, { sourceAu: true, elementCode: 3 })).toBeNull();
  });
});
