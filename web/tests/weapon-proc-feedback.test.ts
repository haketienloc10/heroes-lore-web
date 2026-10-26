import { describe, expect, it } from 'vitest';
import {
  advanceSourceWeaponProcFeedback,
  createSourceWeaponProcFeedbackAnimation,
  sourceWeaponProcEmotionImageIndex,
  SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT,
} from '../src/world/weapon-proc-feedback';
import { DAMAGE_NUMBER_PAINT_PERIOD_MS } from '../src/world/combat-feedback';

describe('source weapon proc emotion feedback', () => {
  it.each([
    [2, 8],
    [3, 10],
    [4, 11],
    [8, 0],
  ])('maps proc %i to source emotion image %i', (procCode, imageIndex) => {
    expect(sourceWeaponProcEmotionImageIndex(procCode)).toBe(imageIndex);
  });

  it('does not create an emotion image for proc codes without source type-10 feedback', () => {
    for (const procCode of [-1, 0, 1, 5, 6, 7, 9]) {
      expect(sourceWeaponProcEmotionImageIndex(procCode)).toBeNull();
    }
    expect(sourceWeaponProcEmotionImageIndex(Number.NaN)).toBeNull();
  });

  it('preserves the source alternating one-pixel vertical offset', () => {
    const first = advanceSourceWeaponProcFeedback(
      createSourceWeaponProcFeedbackAnimation(),
      8,
      DAMAGE_NUMBER_PAINT_PERIOD_MS,
    );
    const second = advanceSourceWeaponProcFeedback(
      first.animation,
      first.emotionImageIndex,
      DAMAGE_NUMBER_PAINT_PERIOD_MS,
    );

    expect(first).toMatchObject({ animation: { frame: 1 }, verticalOffset: 1, finished: false });
    expect(second).toMatchObject({ animation: { frame: 2 }, verticalOffset: 0, finished: false });
  });

  it('retains elapsed remainder and expires after eight source paint frames', () => {
    const partial = advanceSourceWeaponProcFeedback(
      createSourceWeaponProcFeedbackAnimation(),
      0,
      DAMAGE_NUMBER_PAINT_PERIOD_MS - 1,
    );
    expect(partial.animation).toEqual({ frame: 0, remainderMs: DAMAGE_NUMBER_PAINT_PERIOD_MS - 1 });

    const complete = advanceSourceWeaponProcFeedback(
      partial.animation,
      partial.emotionImageIndex,
      SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT * DAMAGE_NUMBER_PAINT_PERIOD_MS -
        partial.animation.remainderMs,
    );
    expect(complete).toMatchObject({
      animation: { frame: SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT, remainderMs: 0 },
      finished: true,
    });
  });

  it('rejects invalid state and elapsed time', () => {
    expect(() => advanceSourceWeaponProcFeedback({ frame: 8, remainderMs: 0 }, 0, 1)).toThrow(RangeError);
    expect(() => advanceSourceWeaponProcFeedback(createSourceWeaponProcFeedbackAnimation(), 12, 1))
      .toThrow(RangeError);
    expect(() => advanceSourceWeaponProcFeedback(createSourceWeaponProcFeedbackAnimation(), 0, -1))
      .toThrow(RangeError);
  });
});
