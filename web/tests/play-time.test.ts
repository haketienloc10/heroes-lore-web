import { describe, expect, it } from 'vitest';
import { addSourcePlayTimeSeconds } from '../src/world/play-time';

describe('source play-time accounting', () => {
  it('adds whole elapsed wall-clock seconds to the persisted counter', () => {
    expect(addSourcePlayTimeSeconds(120, 10_999, 15_999)).toBe(125);
    expect(addSourcePlayTimeSeconds(120, 10_999, 10_999)).toBe(120);
  });

  it('uses signed 32-bit narrowing for elapsed time and cumulative overflow', () => {
    expect(addSourcePlayTimeSeconds(7, 2_000, 1_000)).toBe(6);
    expect(addSourcePlayTimeSeconds(2_147_483_647, 0, 1_000)).toBe(-2_147_483_648);
  });

  it('rejects invalid counters and timestamps', () => {
    expect(() => addSourcePlayTimeSeconds(-2_147_483_649, 0, 0)).toThrow(RangeError);
    expect(() => addSourcePlayTimeSeconds(0, Number.NaN, 0)).toThrow(RangeError);
  });
});
