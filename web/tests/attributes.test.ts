import { describe, expect, it } from 'vitest';
import {
  adjustAttributeDraft,
  applyAttributeDraft,
  createAttributeDraft,
  createBasePlayerAttributes,
  hasAttributeDraftChanges,
  parsePlayerAttributes,
} from '../src/world/attributes';

describe('source player attributes', () => {
  it('uses the three source class baselines and migrates older saves to them', () => {
    expect(createBasePlayerAttributes(6)).toEqual({ power: 8, hp: 5, agility: 3, will: 4 });
    expect(createBasePlayerAttributes(7)).toEqual({ power: 3, hp: 4, agility: 8, will: 5 });
    expect(createBasePlayerAttributes(8)).toEqual({ power: 5, hp: 8, agility: 4, will: 3 });
    expect(parsePlayerAttributes(undefined, 7)).toEqual(createBasePlayerAttributes(7));
  });

  it('stages points, returns one to the pool when a staged increment is undone, and never respecs committed stats', () => {
    const initial = createAttributeDraft(2);
    const power = adjustAttributeDraft(initial, 'power', 1);
    const hp = adjustAttributeDraft(power, 'hp', 1);
    expect(hp).toEqual({ increments: { power: 1, hp: 1, agility: 0, will: 0 }, remainingPoints: 0 });
    const undone = adjustAttributeDraft(hp, 'power', -1);
    expect(undone).toEqual({ increments: { power: 0, hp: 1, agility: 0, will: 0 }, remainingPoints: 1 });
    expect(adjustAttributeDraft(undone, 'hp', -1)).toEqual(createAttributeDraft(2));
    expect(adjustAttributeDraft(createAttributeDraft(0), 'power', 1)).toEqual(createAttributeDraft(0));
    expect(hasAttributeDraftChanges(undone)).toBe(true);
  });

  it('applies only staged increments and validates saved source-short values', () => {
    const draft = adjustAttributeDraft(createAttributeDraft(1), 'agility', 1);
    expect(applyAttributeDraft(createBasePlayerAttributes(6), draft)).toEqual({
      power: 8, hp: 5, agility: 4, will: 4,
    });
    expect(parsePlayerAttributes({ power: 40, hp: 20, agility: 18, will: 30 }, 6)).toEqual({
      power: 40, hp: 20, agility: 18, will: 30,
    });
    expect(parsePlayerAttributes({ power: -1, hp: 5, agility: 3, will: 4 }, 6)).toBeNull();
    expect(parsePlayerAttributes({ power: 32768, hp: 5, agility: 3, will: 4 }, 6)).toBeNull();
    expect(parsePlayerAttributes({ power: 8, hp: 5, agility: 3 }, 6)).toBeNull();
  });
});
