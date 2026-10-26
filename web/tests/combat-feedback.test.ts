import { describe, expect, it } from 'vitest';
import {
  advanceDamageNumberAnimation,
  DAMAGE_NUMBER_PAINT_PERIOD_MS,
  INITIAL_DAMAGE_NUMBER_ANIMATION,
  sourceDamageNumberHasVisibleGlyphs,
} from '../src/world/combat-feedback';

describe('source damage number timing', () => {
  it('shows the pinned positive digit sheet and leaves negative source styles blank', () => {
    expect(sourceDamageNumberHasVisibleGlyphs(11)).toBe(true);
    expect(sourceDamageNumberHasVisibleGlyphs(0)).toBe(true);
    expect(sourceDamageNumberHasVisibleGlyphs(-1)).toBe(false);
    expect(sourceDamageNumberHasVisibleGlyphs(-12)).toBe(false);
    expect(() => sourceDamageNumberHasVisibleGlyphs(Number.NaN)).toThrow(RangeError);
  });

  it('keeps the first two source frames blank and shows digits in frames two and three', () => {
    const first = advanceDamageNumberAnimation(INITIAL_DAMAGE_NUMBER_ANIMATION, 2 * DAMAGE_NUMBER_PAINT_PERIOD_MS);
    expect(first).toEqual({
      animation: { frame: 2, remainderMs: 0 },
      finished: false,
      visible: true,
    });
    expect(advanceDamageNumberAnimation(first.animation, DAMAGE_NUMBER_PAINT_PERIOD_MS)).toMatchObject({
      animation: { frame: 3, remainderMs: 0 },
      finished: false,
      visible: true,
    });
  });

  it('retains elapsed remainder while advancing at the measured source paint period', () => {
    const first = advanceDamageNumberAnimation(INITIAL_DAMAGE_NUMBER_ANIMATION, 70);
    expect(first).toEqual({
      animation: { frame: 0, remainderMs: 70 },
      finished: false,
      visible: false,
    });
    expect(advanceDamageNumberAnimation(first.animation, 2)).toEqual({
      animation: { frame: 1, remainderMs: 1 },
      finished: false,
      visible: false,
    });
  });

  it('expires after four source paint frames, including when elapsed time spans the full effect', () => {
    expect(advanceDamageNumberAnimation(INITIAL_DAMAGE_NUMBER_ANIMATION, 4 * DAMAGE_NUMBER_PAINT_PERIOD_MS)).toEqual({
      animation: { frame: 4, remainderMs: 0 },
      finished: true,
      visible: false,
    });
  });

  it('rejects invalid elapsed time and animation state', () => {
    expect(() => advanceDamageNumberAnimation(INITIAL_DAMAGE_NUMBER_ANIMATION, -1)).toThrow(RangeError);
    expect(() => advanceDamageNumberAnimation({ frame: 4, remainderMs: 71 }, 1)).toThrow(RangeError);
  });
});
