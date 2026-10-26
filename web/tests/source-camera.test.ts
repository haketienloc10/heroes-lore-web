import { describe, expect, it } from 'vitest';
import {
  advanceSourceCameraScroll,
  sourceEventCameraFocusAction,
  sourceCameraFollowAxes,
  sourceCameraLookAhead,
  sourceCameraScrollTarget,
  sourceFixedMapCameraScrollTarget,
} from '../src/world/source-camera';

describe('source camera look-ahead', () => {
  it('selects the source Camera-On hold/snap and Camera-Off live-target event paths', () => {
    expect(sourceEventCameraFocusAction(true, false, false)).toBe('regular-follow');
    expect(sourceEventCameraFocusAction(false, true, false)).toBe('live-target');
    expect(sourceEventCameraFocusAction(true, true, false)).toBe('hold-focus');
    expect(sourceEventCameraFocusAction(true, true, true)).toBe('snap-to-target');
  });

  it('offsets the camera 15 pixels toward the facing direction when Camera is on', () => {
    expect(sourceCameraLookAhead(1, true)).toEqual({ x: 0, y: -15 });
    expect(sourceCameraLookAhead(2, true)).toEqual({ x: 0, y: 15 });
    expect(sourceCameraLookAhead(3, true)).toEqual({ x: -15, y: 0 });
    expect(sourceCameraLookAhead(4, true)).toEqual({ x: 15, y: 0 });
  });

  it('does not apply the facing offset when Camera is off', () => {
    for (const direction of [1, 2, 3, 4] as const) {
      expect(sourceCameraLookAhead(direction, false)).toEqual({ x: 0, y: 0 });
    }
  });

  it('follows only the vertical axis for vertical facings and the horizontal axis for horizontal facings', () => {
    expect(sourceCameraFollowAxes(1)).toEqual({ horizontal: false, vertical: true });
    expect(sourceCameraFollowAxes(2)).toEqual({ horizontal: false, vertical: true });
    expect(sourceCameraFollowAxes(3)).toEqual({ horizontal: true, vertical: false });
    expect(sourceCameraFollowAxes(4)).toEqual({ horizontal: true, vertical: false });
  });

  it('uses the source 240x299 viewport focus and facing offset for the scroll target', () => {
    const actor = { x: 320, y: 320, direction: 2 as const };

    expect(sourceCameraScrollTarget(actor, 640, 640, 240, 320, true)).toEqual({ x: 208, y: 186 });
    expect(sourceCameraScrollTarget(actor, 640, 640, 240, 320, false)).toEqual({ x: 208, y: 171 });
  });

  it('uses the map-13/map-15 live focus with the source 30-pixel vertical offset', () => {
    expect(sourceFixedMapCameraScrollTarget(
      { x: 320, y: 320, direction: 2 }, 640, 640, 240, 320,
    )).toEqual({ x: 208, y: 141 });
    expect(sourceFixedMapCameraScrollTarget(
      { x: 2000, y: 2000, direction: 4 }, 640, 640, 240, 320,
    )).toEqual({ x: 400, y: 341 });
  });

  it('clamps the source target to small-map and map-edge scroll limits', () => {
    expect(sourceCameraScrollTarget({ x: 0, y: 0, direction: 1 }, 300, 300, 240, 320, true))
      .toEqual({ x: 0, y: 0 });
    expect(sourceCameraScrollTarget({ x: 580, y: 580, direction: 4 }, 640, 640, 240, 320, true))
      .toEqual({ x: 400, y: 341 });
  });

  it('applies the source integer easing recurrence once per camera update', () => {
    expect(advanceSourceCameraScroll(100, 110)).toBe(105);
    expect(advanceSourceCameraScroll(110, 100)).toBe(106);
    expect(advanceSourceCameraScroll(100, 101)).toBe(101);
    // The source recurrence can retain a one-pixel trailing offset in this direction.
    expect(advanceSourceCameraScroll(101, 100)).toBe(101);
    expect(advanceSourceCameraScroll(100, 100)).toBe(100);
  });
});
