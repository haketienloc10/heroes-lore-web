import { describe, expect, it } from 'vitest';
import generatedAssetManifest from '../public/assets/generated/asset-manifest.json';
import {
  getMapAssetPaths,
  parseGeneratedAssetPaths,
  resolveMapAssetPaths,
} from '../src/world/map-assets';

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

  it('reads generated asset paths from the extractor manifest', () => {
    expect(parseGeneratedAssetPaths({
      files: [{ path: 'collision/7/02.json' }, { path: 42 }, null],
    })).toEqual(new Set(['collision/7/02.json']));
    expect(parseGeneratedAssetPaths(null)).toEqual(new Set());
  });

  it('selects a complete event bundle for the requested hero class', () => {
    const available = new Set([
      'maps/02.json',
      'collision/7/02.json',
      'decorations/7/02.json',
      'event-operations/7/02.json',
    ]);
    expect(resolveMapAssetPaths(2, 7, available)).toEqual(getMapAssetPaths(2, 7));
  });

  it('does not substitute another class when the requested bundle is absent or incomplete', () => {
    const available = new Set([
      'collision/7/02.json',
      'maps/02.json',
      'collision/6/02.json',
      'decorations/6/02.json',
      'event-operations/6/02.json',
    ]);
    expect(resolveMapAssetPaths(2, 7, available)).toBeNull();
  });

  it('requires the base map and selected-class map files before returning a bundle', () => {
    const requested = getMapAssetPaths(2, 6);
    expect(resolveMapAssetPaths(2, 6, new Set([
      'maps/02.json', 'collision/6/02.json', 'decorations/6/02.json',
    ]))).toBeNull();
    expect(resolveMapAssetPaths(2, 6, new Set([
      'maps/02.json', 'collision/6/02.json', 'decorations/6/02.json',
      'event-operations/6/02.json',
    ]))).toEqual(requested);
    expect(resolveMapAssetPaths(2, 8, new Set())).toBeNull();
  });

  it('reports unavailable class map variants from the checked-in asset manifest', () => {
    const generated = parseGeneratedAssetPaths(generatedAssetManifest);
    expect(resolveMapAssetPaths(0, 6, generated)).toEqual(getMapAssetPaths(0, 6));
    expect(resolveMapAssetPaths(0, 7, generated)).toBeNull();
    expect(resolveMapAssetPaths(0, 8, generated)).toBeNull();
  });
});
