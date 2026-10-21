import { describe, expect, it } from 'vitest';
import { consumeFixedSteps } from '../src/core/fixed-step';

describe('consumeFixedSteps (utility, chưa phải behavior gốc)', () => {
  it('giữ phần thời gian còn lại giữa các bước', () => {
    expect(consumeFixedSteps(40, 10, 20)).toEqual({ steps: 2, remainderMs: 10 });
  });

  it('từ chối step không hợp lệ', () => {
    expect(() => consumeFixedSteps(16, 0, 0)).toThrow(RangeError);
  });
});
