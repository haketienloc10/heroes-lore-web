import { describe, expect, it } from 'vitest';
import { getMapAssetPaths } from '../src/world/map-assets';

describe('world map asset paths', () => {
  it('resolves base maps and the selected hero event variant', () => {
    expect(getMapAssetPaths(2)).toEqual({
      map: '/assets/generated/maps/02.json',
      collision: '/assets/generated/collision/6/02.json',
      decorations: '/assets/generated/decorations/6/02.json',
      events: '/assets/generated/event-operations/6/02.json',
    });
  });

  it('uses at least two digits without truncating larger map IDs', () => {
    expect(getMapAssetPaths(255, 10).map).toBe('/assets/generated/maps/255.json');
    expect(getMapAssetPaths(255, 10).events).toBe('/assets/generated/event-operations/10/255.json');
  });

  it('rejects IDs outside the byte range', () => {
    expect(() => getMapAssetPaths(-1)).toThrow(RangeError);
    expect(() => getMapAssetPaths(1, 256)).toThrow(RangeError);
  });
});
