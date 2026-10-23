export interface BaseMapData {
  format: 'heroes-lore-map-v1';
  tilesetId: number;
  width: number;
  height: number;
  tileSize: 16;
  tileIds: number[][];
}

export interface BaseCollisionData {
  format: 'heroes-lore-base-collision-v1';
  width: number;
  height: number;
  tileSize: 16;
  values: number[][];
  passabilityRule: string;
}

export interface MapDecoration {
  tileX: number;
  tileY: number;
  offsetX: number;
  offsetY: number;
  atlasIndex: number;
  sourceOrder: number;
}

export interface MapDecorationData {
  format: 'heroes-lore-map-decorations-v1';
  tilesetId: number;
  objectAtlas: string;
  loadedImageIds: number[];
  imageAnchor: 'center-bottom';
  sortKey: string;
  objects: MapDecoration[];
}

export interface WorldGrid {
  map: BaseMapData;
  collision: BaseCollisionData;
}

export interface DynamicMapTileChange {
  tileX: number;
  tileY: number;
  tileId: number;
  collisionValue: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validateRows(
  rawRows: unknown,
  width: number,
  height: number,
  isValidCell: (value: unknown) => boolean,
  label: string,
): number[][] {
  if (!Array.isArray(rawRows) || rawRows.length !== height) {
    throw new TypeError(`${label} must have exactly ${height} rows`);
  }

  return rawRows.map((rawRow, y) => {
    if (!Array.isArray(rawRow) || rawRow.length !== width) {
      throw new TypeError(`${label} row ${y} must have exactly ${width} cells`);
    }
    if (!rawRow.every(isValidCell)) {
      throw new TypeError(`${label} row ${y} contains an invalid cell value`);
    }
    return [...rawRow] as number[];
  });
}

export function parseBaseMapData(value: unknown): BaseMapData {
  if (!isRecord(value) || value.format !== 'heroes-lore-map-v1') {
    throw new TypeError('Unsupported base map format');
  }
  const { tilesetId, width, height, tileSize } = value;
  if (!Number.isInteger(tilesetId) || Number(tilesetId) < 0 || Number(tilesetId) > 255) {
    throw new TypeError('tilesetId must be an unsigned byte');
  }
  if (!isPositiveInteger(width) || !isPositiveInteger(height) || tileSize !== 16) {
    throw new TypeError('Map dimensions must be positive and tileSize must be 16');
  }

  return {
    format: 'heroes-lore-map-v1',
    tilesetId: Number(tilesetId),
    width,
    height,
    tileSize: 16,
    tileIds: validateRows(
      value.tileIds,
      width,
      height,
      (cell) => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) <= 255,
      'tileIds',
    ),
  };
}

export function parseBaseCollisionData(value: unknown): BaseCollisionData {
  if (!isRecord(value) || value.format !== 'heroes-lore-base-collision-v1') {
    throw new TypeError('Unsupported base collision format');
  }
  const { width, height, tileSize, passabilityRule } = value;
  if (!isPositiveInteger(width) || !isPositiveInteger(height) || tileSize !== 16) {
    throw new TypeError('Collision dimensions must be positive and tileSize must be 16');
  }
  if (typeof passabilityRule !== 'string') {
    throw new TypeError('Collision data must document its passability rule');
  }

  return {
    format: 'heroes-lore-base-collision-v1',
    width,
    height,
    tileSize: 16,
    values: validateRows(
      value.values,
      width,
      height,
      (cell) => Number.isInteger(cell) && Number(cell) >= -128 && Number(cell) <= 127,
      'values',
    ),
    passabilityRule,
  };
}

export function parseMapDecorationData(value: unknown): MapDecorationData {
  if (!isRecord(value) || value.format !== 'heroes-lore-map-decorations-v1') {
    throw new TypeError('Unsupported map decoration format');
  }
  const { tilesetId, objectAtlas, loadedImageIds, imageAnchor, sortKey, objects } = value;
  if (!Number.isInteger(tilesetId) || Number(tilesetId) < 0 || Number(tilesetId) > 255) {
    throw new TypeError('tilesetId must be an unsigned byte');
  }
  if (typeof objectAtlas !== 'string' || imageAnchor !== 'center-bottom' || typeof sortKey !== 'string') {
    throw new TypeError('Map decoration atlas, anchor, or sort key is invalid');
  }
  if (!Array.isArray(loadedImageIds) || !loadedImageIds.every(
    (imageId) => Number.isInteger(imageId) && Number(imageId) >= 0 && Number(imageId) <= 255,
  )) {
    throw new TypeError('loadedImageIds must contain unsigned bytes');
  }
  if (!Array.isArray(objects)) {
    throw new TypeError('objects must be an array');
  }

  const parsedObjects = objects.map((object, index): MapDecoration => {
    if (!isRecord(object)) {
      throw new TypeError(`Decoration ${index} must be an object`);
    }
    const { tileX, tileY, offsetX, offsetY, atlasIndex, sourceOrder } = object;
    const unsignedByte = (entry: unknown): entry is number =>
      Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255;
    const signedByte = (entry: unknown): entry is number =>
      Number.isInteger(entry) && Number(entry) >= -128 && Number(entry) <= 127;
    if (!unsignedByte(tileX) || !unsignedByte(tileY) || !signedByte(offsetX) || !signedByte(offsetY)) {
      throw new TypeError(`Decoration ${index} has invalid coordinates or offsets`);
    }
    if (!unsignedByte(atlasIndex) || !Number.isInteger(sourceOrder) || Number(sourceOrder) < 0) {
      throw new TypeError(`Decoration ${index} has an invalid image index or source order`);
    }
    return { tileX, tileY, offsetX, offsetY, atlasIndex, sourceOrder: Number(sourceOrder) };
  });

  return {
    format: 'heroes-lore-map-decorations-v1',
    tilesetId: Number(tilesetId),
    objectAtlas,
    loadedImageIds: [...loadedImageIds] as number[],
    imageAnchor: 'center-bottom',
    sortKey,
    objects: parsedObjects,
  };
}

export function createWorldGrid(mapValue: unknown, collisionValue: unknown): WorldGrid {
  const map = parseBaseMapData(mapValue);
  const collision = parseBaseCollisionData(collisionValue);
  if (map.width !== collision.width || map.height !== collision.height) {
    throw new TypeError('Map and base collision dimensions must match');
  }
  return { map, collision };
}

/** Apply ordered source event writes to a map tile and its signed collision byte. */
export function applyDynamicMapTileChanges(
  world: WorldGrid,
  changes: readonly DynamicMapTileChange[],
): WorldGrid {
  if (changes.length === 0) return world;
  const tileIds = world.map.tileIds.map((row) => [...row]);
  const collisionValues = world.collision.values.map((row) => [...row]);
  for (const change of changes) {
    if (!Number.isInteger(change.tileX) || !Number.isInteger(change.tileY) ||
      change.tileX < 0 || change.tileY < 0 ||
      change.tileX >= world.map.width || change.tileY >= world.map.height) {
      throw new RangeError('Dynamic map tile coordinate is outside the map');
    }
    if (!Number.isInteger(change.tileId) || change.tileId < 0 || change.tileId > 255) {
      throw new RangeError('Dynamic map tile ID must be an unsigned byte');
    }
    if (!Number.isInteger(change.collisionValue) ||
      change.collisionValue < -128 || change.collisionValue > 127) {
      throw new RangeError('Dynamic collision value must be a signed byte');
    }
    tileIds[change.tileY][change.tileX] = change.tileId;
    collisionValues[change.tileY][change.tileX] = change.collisionValue;
  }
  return {
    map: { ...world.map, tileIds },
    collision: { ...world.collision, values: collisionValues },
  };
}

/** Tests the signed base-cell rule plus an optional precomputed occupancy flag. */
export function isCellPassable(world: WorldGrid, x: number, y: number, occupied = false): boolean {
  const { collision } = world;
  return (
    !occupied &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < collision.width &&
    y < collision.height &&
    collision.values[y][x] >= 0
  );
}
