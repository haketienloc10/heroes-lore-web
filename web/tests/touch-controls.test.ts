import { describe, expect, it } from 'vitest';
import { isTouchControl, TOUCH_CONTROL_KEYS } from '../src/input/touch-controls';

describe('touch control keyboard adapter', () => {
  it('maps movement, confirmation, system, and attack controls to game inputs', () => {
    expect(TOUCH_CONTROL_KEYS).toEqual({
      up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
      confirm: { key: 'Enter', code: 'Enter', keyCode: 13 },
      system: { key: 'Escape', code: 'Escape', keyCode: 27 },
      attack: { key: '5', code: 'Numpad5', keyCode: 101 },
      heavy: { key: '7', code: 'Numpad7', keyCode: 103 },
      item: { key: '#', code: 'Digit3', keyCode: 35 },
      use: { key: '9', code: 'Digit9', keyCode: 57 },
    });
  });

  it('recognizes only controls with an input mapping', () => {
    expect(isTouchControl('up')).toBe(true);
    expect(isTouchControl('confirm')).toBe(true);
    expect(isTouchControl('attack')).toBe(true);
    expect(isTouchControl('heavy')).toBe(true);
    expect(isTouchControl('item')).toBe(true);
    expect(isTouchControl('use')).toBe(true);
    expect(isTouchControl(undefined)).toBe(false);
  });
});
