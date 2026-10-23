import { describe, expect, it } from 'vitest';
import {
  createRuntimeSourceRandomStreams,
  JavaRandom,
} from '../src/world/source-random';

describe('source Java random streams', () => {
  it('matches the java.util.Random raw integer sequence for seed zero', () => {
    const random = new JavaRandom(0);
    expect(Array.from({ length: 6 }, () => random.nextInt())).toEqual([
      -1155484576,
      -723955400,
      1033096058,
      -1690734402,
      -1557280266,
      1327362106,
    ]);
  });

  it('matches the source absolute-value modulo range helper', () => {
    const random = new JavaRandom(0);
    expect(random.nextSourceRange(0, 9)).toBe(6);
    expect(random.nextSourceRange(1, 7)).toBe(1);
  });

  it('preserves Java Math.abs(int) overflow for Integer.MIN_VALUE', () => {
    const seed = 247775869193412n;
    const raw = new JavaRandom(seed);
    expect(raw.nextInt()).toBe(-0x80000000);

    const range = new JavaRandom(seed);
    expect(range.nextSourceRange(0, 9)).toBe(-8);
  });

  it('consumes a raw draw for a singleton range and returns the source value', () => {
    const random = new JavaRandom(0);
    expect(random.nextSourceRange(4, 4)).toBe(4);
    expect(random.nextInt()).toBe(-723955400);
  });

  it('returns zero without consuming a draw when source width overflows to zero', () => {
    const random = new JavaRandom(0);
    expect(random.nextSourceRange(-0x80000000, 0x7fffffff)).toBe(0);
    expect(random.nextInt()).toBe(-1155484576);
  });

  it('rejects unordered and out-of-range source bounds', () => {
    const random = new JavaRandom(0);
    expect(() => random.nextSourceRange(2, 1)).toThrow(RangeError);
    expect(() => random.nextSourceRange(-0x80000001, 0)).toThrow(RangeError);
  });

  it('creates independent entity and bounded-range streams for a runtime scene', () => {
    const streams = createRuntimeSourceRandomStreams();
    expect(streams.entity).toBeInstanceOf(JavaRandom);
    expect(streams.range).toBeInstanceOf(JavaRandom);
    expect(streams.entity).not.toBe(streams.range);
  });
});
