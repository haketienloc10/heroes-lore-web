import type { Direction } from './actor';

export interface SourceCameraLookAhead {
  x: number;
  y: number;
}

export interface SourceCameraActor {
  x: number;
  y: number;
  direction: Direction;
}

export interface SourceCameraFollowAxes {
  horizontal: boolean;
  vertical: boolean;
}

export type SourceEventCameraFocusAction =
  | 'regular-follow' | 'live-target' | 'hold-focus' | 'snap-to-target';

/** Select the event-mode focus path from `ad.a(Graphics)` and `ag.m12b()`. */
export function sourceEventCameraFocusAction(
  cameraEnabled: boolean,
  eventModeActive: boolean,
  snapPending: boolean,
): SourceEventCameraFocusAction {
  if (!eventModeActive) return 'regular-follow';
  if (!cameraEnabled) return 'live-target';
  return snapPending ? 'snap-to-target' : 'hold-focus';
}

/**
 * Reproduce the 15-pixel facing offset applied by the original camera-on path
 * in `m.a(true, true)` before the camera eases toward the player.
 */
export function sourceCameraLookAhead(
  direction: Direction,
  cameraEnabled: boolean,
): SourceCameraLookAhead {
  if (!cameraEnabled) return { x: 0, y: 0 };
  switch (direction) {
    case 1: return { x: 0, y: -15 };
    case 2: return { x: 0, y: 15 };
    case 3: return { x: -15, y: 0 };
    case 4: return { x: 15, y: 0 };
  }
}

/** `t.f291a` lets the source camera follow only the facing axis. */
export function sourceCameraFollowAxes(direction: Direction): SourceCameraFollowAxes {
  return {
    horizontal: direction === 3 || direction === 4,
    vertical: direction === 1 || direction === 2,
  };
}

/** Resolve the source camera target from `ar`'s viewport center and `m.g()`. */
export function sourceCameraScrollTarget(
  actor: SourceCameraActor,
  mapWidth: number,
  mapHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  cameraEnabled: boolean,
): { x: number; y: number } {
  const worldViewportHeight = viewportHeight - 21;
  const focusX = Math.floor(viewportWidth / 2) - 8;
  const focusY = Math.floor(worldViewportHeight / 2);
  const lookAhead = sourceCameraLookAhead(actor.direction, cameraEnabled);
  const maxScrollX = Math.max(0, mapWidth - viewportWidth);
  const maxScrollY = Math.max(0, mapHeight - worldViewportHeight);
  return {
    x: Math.min(maxScrollX, Math.max(0, actor.x - focusX + lookAhead.x)),
    y: Math.min(maxScrollY, Math.max(0, actor.y - focusY + lookAhead.y)),
  };
}

/** Resolve `ad.f6b` maps 13/15, which render from the live target plus 30px down. */
export function sourceFixedMapCameraScrollTarget(
  actor: SourceCameraActor,
  mapWidth: number,
  mapHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const worldViewportHeight = viewportHeight - 21;
  const focusX = Math.floor(viewportWidth / 2) - 8;
  const focusY = Math.floor(worldViewportHeight / 2);
  const maxScrollX = Math.max(0, mapWidth - viewportWidth);
  const maxScrollY = Math.max(0, mapHeight - worldViewportHeight);
  return {
    x: Math.min(maxScrollX, Math.max(0, actor.x - focusX)),
    y: Math.min(maxScrollY, Math.max(0, actor.y - focusY - 30)),
  };
}

/** Apply one `m.a(true, true)` integer easing step to a Phaser scroll position. */
export function advanceSourceCameraScroll(currentScroll: number, targetScroll: number): number {
  if (currentScroll === targetScroll) return currentScroll;
  // The J2ME camera stores the inverse scroll translation (focus - world position).
  // Its bytecode computes current + ((target - current + 1) / 2) - 1 using Java
  // integer division, which truncates toward zero. Invert back to Phaser scroll.
  const currentOffset = -currentScroll;
  const targetOffset = -targetScroll;
  const nextOffset = currentOffset + Math.trunc((targetOffset - currentOffset + 1) / 2) - 1;
  return -nextOffset;
}
