/** Advance the source `av(10)` cursor, which changes its one-pixel offset after painting. */
export function advanceSourceEmotionFrame(frameIndex: number, sourcePaintPasses: number): number {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new RangeError('Source emotion frame index must be a non-negative integer');
  }
  if (!Number.isInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('Source emotion paint pass count must be a non-negative integer');
  }
  return (frameIndex + sourcePaintPasses) % 2;
}
