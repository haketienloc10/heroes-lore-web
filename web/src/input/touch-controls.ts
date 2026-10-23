export const TOUCH_CONTROL_KEYS = {
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
} as const;

export type TouchControl = keyof typeof TOUCH_CONTROL_KEYS;

export function isTouchControl(value: string | undefined): value is TouchControl {
  return value !== undefined && Object.hasOwn(TOUCH_CONTROL_KEYS, value);
}

function dispatchKey(control: TouchControl, type: 'keydown' | 'keyup'): void {
  const mapping = TOUCH_CONTROL_KEYS[control];
  const event = new KeyboardEvent(type, {
    key: mapping.key,
    code: mapping.code,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    keyCode: { get: () => mapping.keyCode },
    which: { get: () => mapping.keyCode },
  });
  window.dispatchEvent(event);
}

/** Route touch holds through the same keyboard input handlers used on desktop. */
export function mountTouchControls(container: HTMLElement): () => void {
  const pointers = new Map<number, TouchControl>();
  const activePointers = new Map<TouchControl, Set<number>>();
  const buttons: Array<{ element: HTMLButtonElement; control: TouchControl }> = [];

  for (const element of container.querySelectorAll<HTMLButtonElement>('[data-touch-control]')) {
    const controlValue = element.dataset.touchControl;
    if (!isTouchControl(controlValue)) {
      throw new TypeError(`Unknown touch control: ${controlValue ?? '(missing)'}`);
    }
    buttons.push({ element, control: controlValue });
  }

  const releasePointer = (pointerId: number): void => {
    const control = pointers.get(pointerId);
    if (control === undefined) return;
    pointers.delete(pointerId);
    const controlPointers = activePointers.get(control);
    controlPointers?.delete(pointerId);
    if (controlPointers?.size === 0) {
      activePointers.delete(control);
      dispatchKey(control, 'keyup');
    }
  };

  const releaseAll = (): void => {
    for (const pointerId of [...pointers.keys()]) releasePointer(pointerId);
  };

  const handlers = buttons.map(({ element, control }) => {
    const pointerdown = (event: PointerEvent): void => {
      event.preventDefault();
      releasePointer(event.pointerId);
      pointers.set(event.pointerId, control);
      const controlPointers = activePointers.get(control) ?? new Set<number>();
      const firstPointer = controlPointers.size === 0;
      controlPointers.add(event.pointerId);
      activePointers.set(control, controlPointers);
      if (firstPointer) dispatchKey(control, 'keydown');
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events and detached controls cannot capture a pointer.
      }
    };
    const pointerup = (event: PointerEvent): void => {
      event.preventDefault();
      releasePointer(event.pointerId);
    };
    element.addEventListener('pointerdown', pointerdown);
    element.addEventListener('pointerup', pointerup);
    element.addEventListener('pointercancel', pointerup);
    element.addEventListener('lostpointercapture', pointerup);
    return { element, pointerdown, pointerup };
  });

  const visibilitychange = (): void => {
    if (document.visibilityState !== 'visible') releaseAll();
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', visibilitychange);

  return (): void => {
    releaseAll();
    window.removeEventListener('blur', releaseAll);
    document.removeEventListener('visibilitychange', visibilitychange);
    for (const { element, pointerdown, pointerup } of handlers) {
      element.removeEventListener('pointerdown', pointerdown);
      element.removeEventListener('pointerup', pointerup);
      element.removeEventListener('pointercancel', pointerup);
      element.removeEventListener('lostpointercapture', pointerup);
    }
  };
}
