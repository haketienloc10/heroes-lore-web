import { describe, expect, it } from 'vitest';
import {
  heroArmorAtlas,
  heroHeadAtlas,
  heroHeadLayout,
  heroWeaponAtlas,
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
});
