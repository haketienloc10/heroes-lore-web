import { describe, expect, it } from 'vitest';
import { isTouchControl, mountTouchControls, TOUCH_CONTROL_KEYS } from '../src/input/touch-controls';

class FakeKeyboardEvent {
  readonly type: string;
  readonly key: string;
  readonly code: string;

  constructor(type: string, init: { key: string; code: string }) {
    this.type = type;
    this.key = init.key;
    this.code = init.code;
  }
}

class FakeButton {
  readonly dataset: DOMStringMap;
  readonly classList = {
    classes: new Set<string>(),
    add: (name: string) => this.classList.classes.add(name),
    remove: (name: string) => this.classList.classes.delete(name),
  };
  private readonly listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();

  constructor(control: string) {
    this.dataset = { touchControl: control } as DOMStringMap;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  setPointerCapture(_pointerId: number): void {}

  dispatch(type: string, init: Record<string, unknown> = {}): void {
    const event = {
      ...init,
      preventDefault: init.preventDefault ?? (() => undefined),
    };
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event as unknown as Event);
      else listener.handleEvent(event as unknown as Event);
    }
  }
}

function withTouchControlHarness() {
  const events: FakeKeyboardEvent[] = [];
  const button = new FakeButton('attack');
  const container = {
    querySelectorAll: <T extends Element>(_selector: string): NodeListOf<T> =>
      [button as unknown as T] as unknown as NodeListOf<T>,
  };
  const windowStub = {
    dispatchEvent: (event: FakeKeyboardEvent) => {
      events.push(event);
      return true;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const documentStub = {
    visibilityState: 'visible',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const overrides = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of [
    ['KeyboardEvent', FakeKeyboardEvent],
    ['window', windowStub],
    ['document', documentStub],
  ] as const) {
    overrides.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const cleanup = mountTouchControls(container as unknown as HTMLElement);
  return {
    button,
    events,
    dispose: () => {
      cleanup();
      for (const [name, descriptor] of overrides) {
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
    },
  };
}

describe('touch control keyboard adapter', () => {
  it('maps movement, confirmation, system, attacks, skills, and items to game inputs', () => {
    expect(TOUCH_CONTROL_KEYS).toEqual({
      up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
      confirm: { key: 'Enter', code: 'Enter', keyCode: 13 },
      system: { key: 'Escape', code: 'Escape', keyCode: 27 },
      attack: { key: '5', code: 'Numpad5', keyCode: 101 },
      heavy: { key: '7', code: 'Numpad7', keyCode: 103 },
      skill1: { key: '1', code: 'Digit1', keyCode: 49 },
      skill3: { key: '3', code: 'Digit3', keyCode: 51 },
      item: { key: '#', code: 'Digit3', keyCode: 35 },
      use: { key: '9', code: 'Digit9', keyCode: 57 },
    });
  });

  it('recognizes only controls with an input mapping', () => {
    expect(isTouchControl('up')).toBe(true);
    expect(isTouchControl('confirm')).toBe(true);
    expect(isTouchControl('system')).toBe(true);
    expect(isTouchControl('attack')).toBe(true);
    expect(isTouchControl('heavy')).toBe(true);
    expect(isTouchControl('skill1')).toBe(true);
    expect(isTouchControl('skill3')).toBe(true);
    expect(isTouchControl('item')).toBe(true);
    expect(isTouchControl('use')).toBe(true);
    expect(isTouchControl(undefined)).toBe(false);
  });

  it('dispatches a keyboard hold and release for native touch events', () => {
    const harness = withTouchControlHarness();
    try {
      harness.button.dispatch('touchstart', { changedTouches: [{ identifier: 4 }] });
      expect(harness.button.classList.classes.has('touch-active')).toBe(true);
      harness.button.dispatch('touchend', { changedTouches: [{ identifier: 4 }] });
      expect(harness.button.classList.classes.has('touch-active')).toBe(false);

      expect(harness.events.map(({ type, key, code }) => ({ type, key, code }))).toEqual([
        { type: 'keydown', key: '5', code: 'Numpad5' },
        { type: 'keyup', key: '5', code: 'Numpad5' },
      ]);
      expect(harness.events.map((event) => Object.getOwnPropertyDescriptor(event, 'keyCode')?.get?.call(event)))
        .toEqual([101, 101]);
    } finally {
      harness.dispose();
    }
  });

  it('keeps a combined pointer and touch press active until both inputs release', () => {
    const harness = withTouchControlHarness();
    try {
      harness.button.dispatch('pointerdown', { pointerId: 8 });
      harness.button.dispatch('touchstart', { changedTouches: [{ identifier: 4 }] });
      expect(harness.button.classList.classes.has('touch-active')).toBe(true);
      harness.button.dispatch('pointerup', { pointerId: 8 });
      expect(harness.events.map(({ type }) => type)).toEqual(['keydown']);
      expect(harness.button.classList.classes.has('touch-active')).toBe(true);

      harness.button.dispatch('touchend', { changedTouches: [{ identifier: 4 }] });
      expect(harness.events.map(({ type }) => type)).toEqual(['keydown', 'keyup']);
      expect(harness.button.classList.classes.has('touch-active')).toBe(false);
    } finally {
      harness.dispose();
    }
  });
});
