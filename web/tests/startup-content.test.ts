import { describe, expect, it } from 'vitest';
import type { BitmapFontData } from '../src/ui/bitmap-font';
import {
  buildStartupAboutPages,
  buildStartupHelpTopics,
  STARTUP_MENU_STRING_IDS,
} from '../src/world/startup-content';

const testFont: BitmapFontData = {
  format: 'heroes-lore-bitmap-font-v1',
  height: 6,
  spaceAdvance: 3,
  letterSpacing: 1,
  glyphOffsets: Array.from({ length: 95 }, (_, index) => index * 5),
  atlasWidth: 470,
};

const locale = {
  strings: [
    { id: 1228, text: 'Basic Controls' },
    { id: 1229, text: 'Guardian' },
    { id: 1230, text: 'Status' },
    { id: 1231, text: 'Item' },
    { id: 1234, text: 'Move: Navigation Keys, 2, 4, 6, 8;Select: Center Nav Key, 5' },
    { id: 1235, text: 'Use Guardian skills.;Choose two at the start.' },
    { id: 1236, text: 'Spend three points when you level up.' },
    { id: 1237, text: 'Use potions to recover your health.' },
    { id: 2333, text: 'TM & Copyright (c) 2007 Hands-On Mobile, Inc.' },
    { id: 2334, text: 'www.HandsOn.com/Heroes' },
    { id: 2355, text: 'Developed By' },
    { id: 2356, text: 'For support contact\nhelp@HandsOn.com ' },
  ],
};

describe('title screen content', () => {
  it('uses the source menu labels and help table entries', () => {
    expect(STARTUP_MENU_STRING_IDS).toEqual([2348, 2349, 2350, 2351, 2352, 2354]);

    const topics = buildStartupHelpTopics(
      locale,
      { format: 'heroes-lore-text-table-v1', stringIds: [1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237] },
      testFont,
    );
    expect(topics.map(({ title }) => title)).toEqual(['Basic Controls', 'Guardian', 'Status', 'Item']);
    expect(topics[0]?.pages.join('\n')).toContain('Navigation Keys');
    expect(topics.every(({ pages }) => pages.every((page) => page.split('\n').length <= 11))).toBe(true);
  });

  it('builds paginated About copy from the pinned source manifest values', () => {
    const pages = buildStartupAboutPages(locale, testFont);
    const rendered = pages.join('\n').replace(/\s+/g, ' ');
    expect(rendered).toContain('(WAP.KA4KA.RU) HEROES LORE');
    expect(rendered).toContain('TM & Copyright (c) 2007 Hands-On Mobile, Inc.');
    expect(rendered).toContain('Developed By');
    expect(rendered).toContain('Hands-On Mobile');
    expect(rendered).toContain('www.HandsOn.com/Heroes');
    expect(rendered).toContain('help@HandsOn.com');
    expect(rendered).toContain('v.2.1.2');
    expect(pages.every((page) => page.split('\n').length <= 11)).toBe(true);
  });
});
