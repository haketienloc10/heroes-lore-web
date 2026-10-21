/**
 * Utility toán học độc lập framework; KHÔNG phải cadence đã xác minh của game gốc.
 * Dùng để minh họa cách tách cơ chế khỏi Phaser và kiểm thử deterministic.
 */
export function consumeFixedSteps(
  elapsedMs: number,
  remainderMs: number,
  stepMs: number,
): { steps: number; remainderMs: number } {
  if (![elapsedMs, remainderMs, stepMs].every(Number.isFinite)) {
    throw new RangeError('Durations must be finite');
  }
  if (elapsedMs < 0 || remainderMs < 0 || stepMs <= 0 || remainderMs >= stepMs) {
    throw new RangeError('Invalid fixed-step arguments');
  }
  const total = elapsedMs + remainderMs;
  const steps = Math.floor(total / stepMs);
  return { steps, remainderMs: total - steps * stepMs };
}
