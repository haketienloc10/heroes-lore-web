import { describe, expect, it } from 'vitest';
import {
  advanceStartupBrandSplashFrame,
  advanceStartupTitleSplashInput,
  createStartupBrandSplashFrame,
} from '../src/world/startup-title';

describe('source title splash', () => {
  it('moves the manufacturer logo to center, settles, then exits after the source offset grows', () => {
    let frame = createStartupBrandSplashFrame();
    expect(frame).toEqual({ logoCenterY: -20, logoOffsetY: 1, phase: 0 });

    for (let update = 0; update < 8; update += 1) {
      frame = advanceStartupBrandSplashFrame(frame).frame;
    }
    expect(frame).toMatchObject({ logoCenterY: 159, logoOffsetY: 1, phase: 0 });

    let finished = false;
    let updates = 8;
    while (!finished && updates < 80) {
      const next = advanceStartupBrandSplashFrame(frame);
      frame = next.frame;
      finished = next.finished;
      updates += 1;
    }
    expect(finished).toBe(true);
    expect(frame.logoOffsetY).toBeGreaterThan(320);
    expect(updates).toBe(58);
  });

  it('advances brand logo to the game title, then the menu, on separate keypresses', () => {
    expect(advanceStartupTitleSplashInput('brand-splash')).toBe('title-splash');
    expect(advanceStartupTitleSplashInput('title-splash')).toBe('menu');
  });
});
