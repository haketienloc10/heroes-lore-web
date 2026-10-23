/**
 * Source `av` damage numbers advance once per paint. Gameplay paint measured
 * roughly every 71 ms in the controlled P1M reference route (FND-0004).
 */
export const DAMAGE_NUMBER_PAINT_PERIOD_MS = 71;
export const DAMAGE_NUMBER_FRAME_COUNT = 4;

export interface DamageNumberAnimation {
  frame: number;
  remainderMs: number;
}

export const INITIAL_DAMAGE_NUMBER_ANIMATION: DamageNumberAnimation = {
  frame: 0,
  remainderMs: 0,
};

export interface DamageNumberAnimationStep {
  animation: DamageNumberAnimation;
  finished: boolean;
  visible: boolean;
}

/** Advance the original four-paint lifetime without tying logic to Phaser. */
export function advanceDamageNumberAnimation(
  animation: DamageNumberAnimation,
  elapsedMs: number,
): DamageNumberAnimationStep {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 ||
    !Number.isInteger(animation.frame) || animation.frame < 0 ||
    animation.frame > DAMAGE_NUMBER_FRAME_COUNT ||
    !Number.isFinite(animation.remainderMs) || animation.remainderMs < 0 ||
    animation.remainderMs >= DAMAGE_NUMBER_PAINT_PERIOD_MS) {
    throw new RangeError('Damage number animation state or elapsed time is invalid');
  }

  let frame = animation.frame;
  let remainderMs = animation.remainderMs + elapsedMs;
  while (frame < DAMAGE_NUMBER_FRAME_COUNT && remainderMs >= DAMAGE_NUMBER_PAINT_PERIOD_MS) {
    frame += 1;
    remainderMs -= DAMAGE_NUMBER_PAINT_PERIOD_MS;
  }
  const finished = frame >= DAMAGE_NUMBER_FRAME_COUNT;
  return {
    animation: { frame, remainderMs: finished ? 0 : remainderMs },
    finished,
    // The first two source frames use the transparent / blank etcui image.
    visible: frame >= 2 && !finished,
  };
}
