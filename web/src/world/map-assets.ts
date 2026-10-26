export interface MapAssetPaths {
  map: string;
  collision: string;
  decorations: string;
  events: string;
}

/** Paths listed by the local asset extractor's generated asset manifest. */
export function parseGeneratedAssetPaths(value: unknown): ReadonlySet<string> {
  if (typeof value !== 'object' || value === null || !('files' in value) ||
    !Array.isArray(value.files)) return new Set();
  return new Set(value.files.flatMap((file: unknown) => {
    if (typeof file !== 'object' || file === null || !('path' in file) ||
      typeof file.path !== 'string') return [];
    return [file.path];
  }));
}

/** Resolve a base map and the selected hero-class event bundle. */
export function getMapAssetPaths(mapId: number, heroClassId = 6): MapAssetPaths {
  if (!Number.isInteger(mapId) || mapId < 0 || mapId > 255 ||
    !Number.isInteger(heroClassId) || heroClassId < 0 || heroClassId > 255) {
    throw new RangeError('Map and hero class IDs must be unsigned bytes');
  }
  const mapName = String(mapId).padStart(2, '0');
  const variant = String(heroClassId);
  return {
    map: `/assets/generated/maps/${mapName}.json`,
    collision: `/assets/generated/collision/${variant}/${mapName}.json`,
    decorations: `/assets/generated/decorations/${variant}/${mapName}.json`,
    events: `/assets/generated/event-operations/${variant}/${mapName}.json`,
  };
}

/** Resolve only a complete bundle for the selected class; never substitute another class's events. */
export function resolveMapAssetPaths(
  mapId: number,
  heroClassId: number,
  generatedAssetPaths: ReadonlySet<string>,
): MapAssetPaths | null {
  const requested = getMapAssetPaths(mapId, heroClassId);
  const paths = [requested.map, requested.collision, requested.decorations, requested.events];
  return paths.every((path) => generatedAssetPaths.has(path.replace('/assets/generated/', '')))
    ? requested
    : null;
}
