import { DAMAGE_NUMBER_PAINT_PERIOD_MS } from './combat-feedback';

export const SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT = 8;

const EMOTION_IMAGE_BY_PROC_CODE: Readonly<Record<number, number>> = {
  2: 8,
  3: 10,
  4: 11,
  8: 0,
};

export interface SourceWeaponProcFeedbackAnimation {
  /** Source `av.b`, advanced once per gameplay paint. */
  frame: number;
  remainderMs: number;
}

export interface SourceWeaponProcFeedbackStep {
  animation: SourceWeaponProcFeedbackAnimation;
  finished: boolean;
  emotionImageIndex: number;
  verticalOffset: number;
}

export function sourceWeaponProcEmotionImageIndex(procCode: number): number | null {
  if (!Number.isInteger(procCode)) return null;
  return EMOTION_IMAGE_BY_PROC_CODE[procCode] ?? null;
}

export function createSourceWeaponProcFeedbackAnimation(): SourceWeaponProcFeedbackAnimation {
  return { frame: 0, remainderMs: 0 };
}

/** Advance an `av(10)` source emotion marker on the measured gameplay paint cadence. */
export function advanceSourceWeaponProcFeedback(
  animation: SourceWeaponProcFeedbackAnimation,
  emotionImageIndex: number,
  elapsedMs: number,
): SourceWeaponProcFeedbackStep {
  if (!Number.isInteger(animation.frame) || animation.frame < 0 ||
    animation.frame >= SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT ||
    !Number.isFinite(animation.remainderMs) || animation.remainderMs < 0 ||
    animation.remainderMs >= DAMAGE_NUMBER_PAINT_PERIOD_MS ||
    !Number.isInteger(emotionImageIndex) || emotionImageIndex < 0 || emotionImageIndex > 11 ||
    !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Source weapon proc feedback state or elapsed time is invalid');
  }

  let frame = animation.frame;
  let remainderMs = animation.remainderMs + elapsedMs;
  while (frame < SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT &&
    remainderMs >= DAMAGE_NUMBER_PAINT_PERIOD_MS) {
    frame += 1;
    remainderMs -= DAMAGE_NUMBER_PAINT_PERIOD_MS;
  }
  const finished = frame >= SOURCE_WEAPON_PROC_FEEDBACK_FRAME_COUNT;
  return {
    animation: { frame, remainderMs: finished ? 0 : remainderMs },
    finished,
    emotionImageIndex,
    verticalOffset: frame & 1,
  };
}
