export interface MapAssetPaths {
  map: string;
  collision: string;
  decorations: string;
  events: string;
}

/** Resolve a base map and the hero-variant event bundle used by this route. */
export function getMapAssetPaths(mapId: number, eventVariantId = 6): MapAssetPaths {
  if (!Number.isInteger(mapId) || mapId < 0 || mapId > 255 ||
    !Number.isInteger(eventVariantId) || eventVariantId < 0 || eventVariantId > 255) {
    throw new RangeError('Map and event variant IDs must be unsigned bytes');
  }
  const mapName = String(mapId).padStart(2, '0');
  const variant = String(eventVariantId);
  return {
    map: `/assets/generated/maps/${mapName}.json`,
    collision: `/assets/generated/collision/${variant}/${mapName}.json`,
    decorations: `/assets/generated/decorations/${variant}/${mapName}.json`,
    events: `/assets/generated/event-operations/${variant}/${mapName}.json`,
  };
}
