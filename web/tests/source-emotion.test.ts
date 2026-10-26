import { describe, expect, it } from 'vitest';
import { advanceSourceEmotionFrame } from '../src/world/source-emotion';

describe('source emotion paint cursor', () => {
  it('starts at offset zero and advances after each source paint', () => {
    expect(advanceSourceEmotionFrame(0, 1)).toBe(1);
    expect(advanceSourceEmotionFrame(1, 1)).toBe(0);
  });

  it('applies batched paints and leaves the cursor unchanged without a paint', () => {
    expect(advanceSourceEmotionFrame(0, 2)).toBe(0);
    expect(advanceSourceEmotionFrame(1, 2)).toBe(1);
    expect(advanceSourceEmotionFrame(1, 0)).toBe(1);
  });

  it('rejects invalid cursor and paint counts', () => {
    expect(() => advanceSourceEmotionFrame(-1, 1)).toThrow(RangeError);
    expect(() => advanceSourceEmotionFrame(0, -1)).toThrow(RangeError);
    expect(() => advanceSourceEmotionFrame(0, 0.5)).toThrow(RangeError);
  });
});
