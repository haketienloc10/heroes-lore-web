const WEAPON_ATLAS_BY_CLASS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 0, 3, 3, 4, 1, 2, 3],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 0, 1, 2, 4, 3, 4, 1],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 0, 2, 4, 1, 2, 4, -1],
];

const ARMOR_ATLAS_BY_CLASS: readonly (readonly number[])[] = [
  [-1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 2, 0, 4, 5, 4, 3],
  [-1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 2, 0, 4, 5, 4, 3],
  [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 2, 0, 4, 5, 4, 3],
];

const HEAD_ATLAS_BY_ITEM: readonly number[] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];

function sourceIndex(table: readonly (readonly number[])[], heroClassId: number, itemId: number): number | null {
  if (!Number.isInteger(heroClassId) || heroClassId < 6 || heroClassId > 8 ||
    !Number.isInteger(itemId) || itemId < 0) return null;
  return table[heroClassId - 6]?.[itemId] ?? null;
}

/** Returns a 1-based `/i/wN` atlas suffix from source `bt.f170a`. */
export function heroWeaponAtlas(heroClassId: number, itemId: number): number | null {
  const index = sourceIndex(WEAPON_ATLAS_BY_CLASS, heroClassId, itemId);
  return index === null || index < 0 ? null : index + 1;
}

/** Returns a 1-based `/i/aN` atlas suffix from source `bt.f171b`; null means no visible armor. */
export function heroArmorAtlas(heroClassId: number, itemId: number): number | null {
  const index = sourceIndex(ARMOR_ATLAS_BY_CLASS, heroClassId, itemId);
  return index === null || index < 0 ? null : index + 1;
}

/** Returns the source `/i/hN` atlas suffix selected by `bt.f172a`. */
export function heroHeadAtlas(itemId: number): number | null {
  if (!Number.isInteger(itemId) || itemId < 0) return null;
  const index = HEAD_ATLAS_BY_ITEM[itemId];
  return index === undefined ? null : index + 1;
}

/** Source `bt.b` selects hA for item IDs 0–3, then hB. */
export function heroHeadLayout(itemId: number): 'hA' | 'hB' {
  return itemId >= 0 && itemId <= 3 ? 'hA' : 'hB';
}
