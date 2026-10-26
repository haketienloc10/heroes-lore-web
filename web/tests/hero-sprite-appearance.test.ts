import { describe, expect, it } from 'vitest';
import generatedAssetManifest from '../public/assets/generated/asset-manifest.json';
import {
  heroArmorAtlas,
  heroShieldAtlas,
  hasHeroShieldSpriteResources,
  heroSpriteAtlasAssetBase,
  heroEffectAtlasFolder,
  heroHeadAtlas,
  heroHeadLayout,
  heroSpriteLayoutAssetPath,
  heroSpriteResourceClass,
  resolveHeroSpriteResourceClass,
  heroWeaponAtlas,
  heroWeaponAtlasFolder,
} from '../src/world/hero-sprite-appearance';

describe('source hero equipment sprite selection', () => {
  it('maps Ronin weapon and armor IDs to the source image groups', () => {
    expect(heroWeaponAtlas(6, 0)).toBe(1);
    expect(heroWeaponAtlas(6, 6)).toBe(2);
    expect(heroWeaponAtlas(6, 30)).toBe(1);
    expect(heroArmorAtlas(6, 0)).toBeNull();
    expect(heroArmorAtlas(6, 1)).toBe(1);
    expect(heroArmorAtlas(6, 18)).toBe(4);
  });

  it('selects class-specific resource directories when the full source layout set exists', () => {
    const layouts = (resourceClass: number, includeShield = false): string[] => [
      'a', 'b', 'e', 'hA', 'hB', 'w', ...(includeShield ? ['s'] : []),
    ].map((part) => `character-layouts/${resourceClass}/${part}.json`);
    const class8Resources = new Set([
      ...layouts(3, true),
      ...[1, 2, 3, 5].map((atlas) => `atlases/c3/i/s${atlas}/000.png`),
    ]);
    expect([6, 7, 8, 5].map(heroSpriteResourceClass)).toEqual([1, 2, 3, null]);
    expect(resolveHeroSpriteResourceClass(7, new Set(layouts(2)))).toBe(2);
    expect(resolveHeroSpriteResourceClass(8, class8Resources)).toBe(3);
    expect(resolveHeroSpriteResourceClass(8, new Set(layouts(3)))).toBeNull();
    expect(resolveHeroSpriteResourceClass(7, new Set(layouts(2).slice(0, -1)))).toBeNull();
    expect(resolveHeroSpriteResourceClass(5, new Set(layouts(1)))).toBeNull();
    expect(heroSpriteLayoutAssetPath(2, 'b')).toBe('/assets/generated/character-layouts/2/b.json');
    expect(heroSpriteAtlasAssetBase(3)).toBe('/assets/generated/atlases/c3/i');
    const shieldAssets = new Set([
      'character-layouts/3/s.json',
      ...[1, 2, 3, 5].map((atlas) => `atlases/c3/i/s${atlas}/000.png`),
    ]);
    expect(hasHeroShieldSpriteResources(3, shieldAssets)).toBe(true);
    expect(hasHeroShieldSpriteResources(2, shieldAssets)).toBe(false);
    expect(hasHeroShieldSpriteResources(3, new Set(['character-layouts/3/s.json']))).toBe(false);
  });

  it('does not resolve missing class-7/8 art from the checked-in asset manifest', () => {
    const generated = new Set(generatedAssetManifest.files.map(({ path }) => path));
    expect(resolveHeroSpriteResourceClass(6, generated)).toBe(1);
    expect(resolveHeroSpriteResourceClass(7, generated)).toBeNull();
    expect(resolveHeroSpriteResourceClass(8, generated)).toBeNull();
  });

  it('maps shield item IDs through the source class-8 shield table', () => {
    expect([0, 3, 6, 9, 12, 14].map((itemId) => heroShieldAtlas(8, itemId)))
      .toEqual([1, 2, 3, 5, 3, 5]);
    expect(heroShieldAtlas(7, 0)).toBeNull();
    expect(heroShieldAtlas(8, 15)).toBeNull();
  });

  it('selects head atlas and layout using the separate source lookups', () => {
    expect(heroHeadAtlas(3)).toBe(1);
    expect(heroHeadAtlas(4)).toBe(2);
    expect(heroHeadLayout(3)).toBe('hA');
    expect(heroHeadLayout(4)).toBe('hB');
  });

  it('returns no appearance for unknown class or item IDs', () => {
    expect(heroWeaponAtlas(6, 37)).toBeNull();
    expect(heroArmorAtlas(9, 1)).toBeNull();
    expect(heroHeadAtlas(16)).toBeNull();
  });

  it('selects the source weapon and effect palette by the active skill element', () => {
    expect(heroWeaponAtlasFolder(2, 0)).toBe('w2');
    expect(heroWeaponAtlasFolder(2, 1)).toBe('w2-element-1');
    expect(heroWeaponAtlasFolder(2, 2)).toBe('w2-element-2');
    expect(heroWeaponAtlasFolder(2, 3)).toBe('w2-element-3');
    expect(heroEffectAtlasFolder(0)).toBe('e');
    expect(heroEffectAtlasFolder(1)).toBe('e-element-1');
    expect(heroEffectAtlasFolder(2)).toBe('e');
    expect(heroEffectAtlasFolder(3)).toBe('e-element-3');
    expect(() => heroWeaponAtlasFolder(6, 1)).toThrow(RangeError);
  });
});
