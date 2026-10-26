export const TOUCH_CONTROL_KEYS = {
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
  const activeInputs = new Map<string, { control: TouchControl; element: HTMLButtonElement }>();
  const activeControls = new Map<TouchControl, Set<string>>();
  const inputsByButton = new Map<HTMLButtonElement, Set<string>>();
  const buttons: Array<{ element: HTMLButtonElement; control: TouchControl }> = [];

  for (const element of container.querySelectorAll<HTMLButtonElement>('[data-touch-control]')) {
    const controlValue = element.dataset.touchControl;
    if (!isTouchControl(controlValue)) {
      throw new TypeError(`Unknown touch control: ${controlValue ?? '(missing)'}`);
    }
    buttons.push({ element, control: controlValue });
  }

  const releaseInput = (inputId: string): void => {
    const input = activeInputs.get(inputId);
    if (input === undefined) return;
    activeInputs.delete(inputId);
    const { control, element } = input;
    const inputs = activeControls.get(control);
    inputs?.delete(inputId);
    const buttonInputs = inputsByButton.get(element);
    buttonInputs?.delete(inputId);
    if (buttonInputs?.size === 0) {
      inputsByButton.delete(element);
      element.classList.remove('touch-active');
    }
    if (inputs?.size === 0) {
      activeControls.delete(control);
      dispatchKey(control, 'keyup');
    }
  };

  const startInput = (inputId: string, control: TouchControl, element: HTMLButtonElement): void => {
    releaseInput(inputId);
    activeInputs.set(inputId, { control, element });
    const inputs = activeControls.get(control) ?? new Set<string>();
    const firstInput = inputs.size === 0;
    inputs.add(inputId);
    activeControls.set(control, inputs);
    const buttonInputs = inputsByButton.get(element) ?? new Set<string>();
    buttonInputs.add(inputId);
    inputsByButton.set(element, buttonInputs);
    element.classList.add('touch-active');
    if (firstInput) dispatchKey(control, 'keydown');
  };

  const releaseAll = (): void => {
    for (const inputId of [...activeInputs.keys()]) releaseInput(inputId);
  };

  const handlers = buttons.map(({ element, control }) => {
    const pointerdown = (event: PointerEvent): void => {
      event.preventDefault();
      startInput(`pointer:${event.pointerId}`, control, element);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events and detached controls cannot capture a pointer.
      }
    };
    const pointerup = (event: PointerEvent): void => {
      event.preventDefault();
      releaseInput(`pointer:${event.pointerId}`);
    };
    const touchstart = (event: TouchEvent): void => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) {
        startInput(`touch:${touch.identifier}`, control, element);
      }
    };
    const touchend = (event: TouchEvent): void => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) {
        releaseInput(`touch:${touch.identifier}`);
      }
    };
    element.addEventListener('pointerdown', pointerdown);
    element.addEventListener('pointerup', pointerup);
    element.addEventListener('pointercancel', pointerup);
    element.addEventListener('lostpointercapture', pointerup);
    element.addEventListener('touchstart', touchstart, { passive: false });
    element.addEventListener('touchend', touchend, { passive: false });
    element.addEventListener('touchcancel', touchend, { passive: false });
    return { element, pointerdown, pointerup, touchstart, touchend };
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
    for (const { element, pointerdown, pointerup, touchstart, touchend } of handlers) {
      element.removeEventListener('pointerdown', pointerdown);
      element.removeEventListener('pointerup', pointerup);
      element.removeEventListener('pointercancel', pointerup);
      element.removeEventListener('lostpointercapture', pointerup);
      element.removeEventListener('touchstart', touchstart);
      element.removeEventListener('touchend', touchend);
      element.removeEventListener('touchcancel', touchend);
    }
  };
}
