import type { PlayerSkillAttachedVisualSpawn } from './player-skill-action';

export type PlayerSkillAttachedVisualTarget =
  | { kind: 'player' }
  | { kind: 'enemy'; sourceOrder: number };

export interface ActivePlayerSkillAttachedVisual extends PlayerSkillAttachedVisualSpawn {
  id: number;
  target: PlayerSkillAttachedVisualTarget;
  /** Current `bi.b` frame; negative values represent remaining hidden delay paints. */
  frameIndex: number;
  delayTicksRemaining: number;
  /** Source paint passes already completed before this visual was created in the pending batch. */
  pendingPaintPassesBeforeBirth: number;
}

/** Source `o.a(short)`: matching ordinary enemies receive `bi`; other cells use type-10 feedback. */
export function sourceInstantKillAttachedVisualSpawn(
  skillId: number | null,
  target: { sourceAu?: boolean; elementCode: number } | undefined,
): PlayerSkillAttachedVisualSpawn | null {
  if (target === undefined || target.sourceAu === true) return null;
  if (skillId === 3 && target.elementCode === 1) {
    return {
      skillId,
      sourceStreamSlot: 2,
      kind: 'stream',
      durationTicks: 7,
      delayTicks: 0,
    };
  }
  if (skillId === 5 && target.elementCode === 3) {
    return {
      skillId,
      sourceStreamSlot: 2,
      kind: 'stream',
      durationTicks: 9,
      delayTicks: 0,
    };
  }
  return null;
}

/** Create a `bi` track before the paint pass that first draws it. */
export function createPlayerSkillAttachedVisual(
  id: number,
  spawn: PlayerSkillAttachedVisualSpawn,
  target: PlayerSkillAttachedVisualTarget,
  pendingPaintPassesBeforeBirth = 0,
): ActivePlayerSkillAttachedVisual {
  if (!Number.isSafeInteger(pendingPaintPassesBeforeBirth) || pendingPaintPassesBeforeBirth < 0) {
    throw new RangeError('Paint passes before visual creation must be a non-negative integer');
  }
  const delayTicks = Math.max(0, spawn.delayTicks);
  return {
    ...spawn,
    id,
    target,
    frameIndex: delayTicks === 0 ? 0 : -delayTicks,
    delayTicksRemaining: delayTicks,
    pendingPaintPassesBeforeBirth,
  };
}

/** Advance `bi` after its source-paced actor paint, matching `n.b(Graphics,...)`. */
export function advancePlayerSkillAttachedVisuals(
  visuals: readonly ActivePlayerSkillAttachedVisual[],
  sourcePaintPasses = 1,
): ActivePlayerSkillAttachedVisual[] {
  if (!Number.isSafeInteger(sourcePaintPasses) || sourcePaintPasses < 0) {
    throw new RangeError('Source paint pass count must be a non-negative integer');
  }
  if (sourcePaintPasses === 0) return visuals.map((visual) => ({ ...visual }));
  return visuals.flatMap((visual) => {
    const passesSinceBirth = Math.max(
      0,
      sourcePaintPasses - visual.pendingPaintPassesBeforeBirth,
    );
    const delayedPasses = Math.min(passesSinceBirth, visual.delayTicksRemaining);
    const delayTicksRemaining = visual.delayTicksRemaining - delayedPasses;
    const activePasses = passesSinceBirth - delayedPasses;
    const frameIndex = delayTicksRemaining > 0
      ? -delayTicksRemaining
      : Math.max(0, visual.frameIndex) + activePasses;
    return frameIndex >= visual.durationTicks
      ? []
      : [{ ...visual, frameIndex, delayTicksRemaining, pendingPaintPassesBeforeBirth: 0 }];
  });
}

/** `bi` skill-0 level-2 aura layers for its current frame. */
export function playerSkillAuraLayers(frameIndex: number): Array<{ imageIndex: 0 | 1; yOffset: 9 | 12 }> {
  switch (frameIndex % 4) {
    case 1:
      return [{ imageIndex: 0, yOffset: 9 }];
    case 2:
      return [{ imageIndex: 0, yOffset: 9 }, { imageIndex: 1, yOffset: 12 }];
    case 3:
      return [{ imageIndex: 1, yOffset: 12 }];
    default:
      return [];
  }
}
