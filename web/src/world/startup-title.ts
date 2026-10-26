export type StartupTitleSplashPage = 'brand-splash' | 'title-splash';

export interface StartupBrandSplashFrame {
  /** Source `bf.f109a`, the center position of the Hands-On logo. */
  logoCenterY: number;
  /** Source `bf.f110a`, subtracted from the logo center as the image leaves. */
  logoOffsetY: number;
  /** Source `bf.c`, which controls the settle blink and later offset doubling. */
  phase: number;
}

export const SOURCE_BRAND_SPLASH_TICK_MS = 20;

export function createStartupBrandSplashFrame(): StartupBrandSplashFrame {
  return { logoCenterY: -20, logoOffsetY: 1, phase: 0 };
}

/** Advance one `bf.paint()` update of source startup state 10. */
export function advanceStartupBrandSplashFrame(
  frame: StartupBrandSplashFrame,
  screenHeight = 320,
): { frame: StartupBrandSplashFrame; finished: boolean } {
  let { logoCenterY, logoOffsetY, phase } = frame;
  if (phase > 40) logoOffsetY *= 2;

  if (phase === 0) {
    const screenCenterY = Math.floor(screenHeight / 2);
    if (logoCenterY < screenCenterY - 1) {
      // Java integer division truncates toward zero, matching the source `int` expression.
      logoCenterY += Math.trunc((screenCenterY - logoCenterY) / 2);
    } else {
      phase = 1;
    }
  } else {
    if (phase === 1 || phase === 3) logoCenterY = Math.floor(screenHeight / 2) - 1;
    else if (phase === 2 || phase === 4) logoCenterY = Math.floor(screenHeight / 2);
    phase += 1;
  }

  const nextFrame = { logoCenterY, logoOffsetY, phase };
  return { frame: nextFrame, finished: logoOffsetY > screenHeight };
}

/** Source `bf.keyPressed()` moves from the manufacturer logo to the game title. */
export function advanceStartupTitleSplashInput(page: StartupTitleSplashPage): StartupTitleSplashPage | 'menu' {
  return page === 'brand-splash' ? 'title-splash' : 'menu';
}

