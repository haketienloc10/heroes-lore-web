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
const SHIELD_ATLAS_BY_ITEM: readonly number[] = [0, 0, 0, 1, 1, 1, 2, 2, 2, 4, 4, 4, 2, 0, 4];
const CHARACTER_LAYOUT_PARTS = ['a', 'b', 'e', 'hA', 'hB', 'w'] as const;

export type HeroSpriteResourceClass = 1 | 2 | 3;
export type HeroSpriteLayoutPart = (typeof CHARACTER_LAYOUT_PARTS)[number] | 's';

/** Map source hero IDs 6–8 to the `/c1`–`/c3` sprite resource directories. */
export function heroSpriteResourceClass(heroClassId: number): HeroSpriteResourceClass | null {
  if (!Number.isInteger(heroClassId) || heroClassId < 6 || heroClassId > 8) return null;
  return (heroClassId - 5) as HeroSpriteResourceClass;
}

/** Select a class-specific layout bundle only when its required source layouts exist. */
export function resolveHeroSpriteResourceClass(
  heroClassId: number,
  generatedAssetPaths: ReadonlySet<string>,
): HeroSpriteResourceClass | null {
  const requested = heroSpriteResourceClass(heroClassId);
  if (requested === null) return null;
  const layouts: readonly HeroSpriteLayoutPart[] = heroClassId === 8
    ? [...CHARACTER_LAYOUT_PARTS, 's']
    : CHARACTER_LAYOUT_PARTS;
  const hasLayouts = layouts.every((part) =>
    generatedAssetPaths.has(`character-layouts/${requested}/${part}.json`),
  );
  if (!hasLayouts) return null;
  if (heroClassId === 8 && !hasHeroShieldSpriteResources(requested, generatedAssetPaths)) return null;
  return requested;
}

export function heroSpriteLayoutAssetPath(
  resourceClass: HeroSpriteResourceClass,
  part: HeroSpriteLayoutPart,
): string {
  return `/assets/generated/character-layouts/${resourceClass}/${part}.json`;
}

export function heroSpriteAtlasAssetBase(resourceClass: HeroSpriteResourceClass): string {
  return `/assets/generated/atlases/c${resourceClass}/i`;
}

/** Require class 8's shield layout and atlas images as one complete source bundle. */
export function hasHeroShieldSpriteResources(
  resourceClass: HeroSpriteResourceClass,
  generatedAssetPaths: ReadonlySet<string>,
): boolean {
  return resourceClass === 3 &&
    generatedAssetPaths.has('character-layouts/3/s.json') &&
    [1, 2, 3, 5].every((atlas) =>
      generatedAssetPaths.has(`atlases/c3/i/s${atlas}/000.png`),
    );
}

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

/** Returns the 1-based `/i/sN` shield atlas; source draws this layer only for class 8. */
export function heroShieldAtlas(heroClassId: number, itemId: number): number | null {
  if (heroClassId !== 8 || !Number.isInteger(itemId) || itemId < 0) return null;
  const index = SHIELD_ATLAS_BY_ITEM[itemId];
  return index === undefined ? null : index + 1;
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

/** Source `bt` recolors weapon atlas blue from the active skill's element. */
export function heroWeaponAtlasFolder(atlasSuffix: number, activeElement: number): string {
  if (!Number.isInteger(atlasSuffix) || atlasSuffix < 1 || atlasSuffix > 5) {
    throw new RangeError('Weapon atlas suffix must be from 1 through 5');
  }
  return activeElement >= 1 && activeElement <= 3
    ? `w${atlasSuffix}-element-${activeElement}`
    : `w${atlasSuffix}`;
}

/** Source `bt` recolors the effect atlas for elements 1 and 3 only. */
export function heroEffectAtlasFolder(activeElement: number): string {
  return activeElement === 1 || activeElement === 3 ? `e-element-${activeElement}` : 'e';
}
