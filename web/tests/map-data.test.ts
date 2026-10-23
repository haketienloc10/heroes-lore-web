import { describe, expect, it } from 'vitest';
import {
  applyDynamicMapTileChanges,
  createWorldGrid,
  isCellPassable,
  parseBaseCollisionData,
  parseBaseMapData,
  parseMapDecorationData,
} from '../src/world/map-data';

const map = {
  format: 'heroes-lore-map-v1',
  tilesetId: 15,
  width: 2,
  height: 2,
  tileSize: 16,
  tileIds: [[3, 8], [10, 255]],
};

const collision = {
  format: 'heroes-lore-base-collision-v1',
  width: 2,
  height: 2,
  tileSize: 16,
  values: [[0, 4], [-1, -128]],
  passabilityRule: 'base value >= 0',
};

const decorations = {
  format: 'heroes-lore-map-decorations-v1',
  tilesetId: 15,
  objectAtlas: 'm/t/o15',
  loadedImageIds: [3, 7],
  imageAnchor: 'center-bottom',
  sortKey: 'tileY * 16 + offsetY',
  objects: [{ tileX: 1, tileY: 1, offsetX: -2, offsetY: 4, atlasIndex: 7, sourceOrder: 0 }],
};

describe('base map data', () => {
  it('parses row-major tile IDs without changing dimensions or values', () => {
    expect(parseBaseMapData(map)).toMatchObject({
      tilesetId: 15,
      width: 2,
      height: 2,
      tileIds: [[3, 8], [10, 255]],
    });
  });

  it('rejects map rows that do not match the declared dimensions', () => {
    expect(() => parseBaseMapData({ ...map, tileIds: [[1, 2]] })).toThrow(TypeError);
  });

  it('keeps signed collision bytes and rejects dimensions that differ from the map', () => {
    expect(parseBaseCollisionData(collision).values).toEqual([[0, 4], [-1, -128]]);
    expect(() => createWorldGrid(map, { ...collision, height: 1 })).toThrow(TypeError);
  });

  it('applies the verified base-cell rule and bounds checks', () => {
    const world = createWorldGrid(map, collision);
    expect(isCellPassable(world, 0, 0)).toBe(true);
    expect(isCellPassable(world, 1, 1)).toBe(false);
    expect(isCellPassable(world, -1, 0)).toBe(false);
    expect(isCellPassable(world, 2, 1)).toBe(false);
    expect(isCellPassable(world, 0, 0, true)).toBe(false);
  });

  it('applies ordered dynamic tile and signed collision writes without mutating the base grid', () => {
    const world = createWorldGrid(map, collision);
    const changed = applyDynamicMapTileChanges(world, [
      { tileX: 1, tileY: 0, tileId: 4, collisionValue: 0 },
      { tileX: 1, tileY: 0, tileId: 6, collisionValue: -3 },
    ]);

    expect(changed.map.tileIds).toEqual([[3, 6], [10, 255]]);
    expect(changed.collision.values).toEqual([[0, -3], [-1, -128]]);
    expect(world.map.tileIds).toEqual(map.tileIds);
    expect(world.collision.values).toEqual(collision.values);
    expect(() => applyDynamicMapTileChanges(world, [
      { tileX: 2, tileY: 0, tileId: 0, collisionValue: 0 },
    ])).toThrow(RangeError);
  });

  it('preserves event decoration positions, offsets, and atlas references', () => {
    expect(parseMapDecorationData(decorations).objects).toEqual([
      { tileX: 1, tileY: 1, offsetX: -2, offsetY: 4, atlasIndex: 7, sourceOrder: 0 },
    ]);
    expect(() => parseMapDecorationData({
      ...decorations,
      objects: [{ ...decorations.objects[0], offsetY: 128 }],
    })).toThrow(TypeError);
  });
});
