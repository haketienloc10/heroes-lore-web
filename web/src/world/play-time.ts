const JAVA_INT_MIN = -2_147_483_648;
const JAVA_INT_MAX = 2_147_483_647;

/**
 * Add wall-clock seconds using the narrowing and overflow behavior of the
 * source save expression in `an.a()`: elapsed seconds are narrowed to an int,
 * then added to the saved int counter.
 */
export function addSourcePlayTimeSeconds(
  savedSeconds: number,
  sessionStartedAtMs: number,
  nowMs: number,
): number {
  if (!Number.isInteger(savedSeconds) || savedSeconds < JAVA_INT_MIN || savedSeconds > JAVA_INT_MAX ||
    !Number.isFinite(sessionStartedAtMs) || !Number.isFinite(nowMs)) {
    throw new RangeError('Source play time requires an int counter and finite timestamps');
  }

  const sourceStartSeconds = Math.trunc(sessionStartedAtMs / 1000) | 0;
  const sourceCurrentSeconds = Math.trunc(nowMs / 1000);
  const elapsedSeconds = (sourceCurrentSeconds - sourceStartSeconds) | 0;
  return (savedSeconds + elapsedSeconds) | 0;
}
