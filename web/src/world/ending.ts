import { resolveLanguageString } from './dialogue';

export const ENDING_FRAME_MS = 50;
export const ENDING_FADE_FRAMES = 16;
export const ENDING_HERO_CLASS_IDS = [6, 7, 8] as const;

export type EndingHeroClassId = typeof ENDING_HERO_CLASS_IDS[number];
export type EndingPhase = 'fade' | 'story' | 'credits' | 'complete';

export interface EndingCreditLine {
  text: string;
  y: number;
  height: number;
}

export interface EndingSequenceState {
  phase: EndingPhase;
  frameRemainderMs: number;
  fadeFramesRemaining: number;
  storyStrings: string[];
  storyIndex: number;
  storyPage: string[];
  storyDelayFramesRemaining: number;
  creditStrings: string[];
  creditIndex: number;
  creditDelayFramesRemaining: number;
  creditRoll: EndingCreditLine[];
}

interface TextTable {
  format: 'heroes-lore-text-table-v1';
  stringIds: number[];
}

/** Resolve one extracted TDF string-ID table to its source-ordered localized lines. */
export function resolveEndingTextTable(tableValue: unknown, localeValue: unknown): string[] {
  if (typeof tableValue !== 'object' || tableValue === null) {
    throw new TypeError('Ending text table must be an object');
  }
  const table = tableValue as Partial<TextTable>;
  if (table.format !== 'heroes-lore-text-table-v1' || !Array.isArray(table.stringIds) ||
    !table.stringIds.every((id) => Number.isInteger(id) && id >= 0)) {
    throw new TypeError('Ending text table is invalid');
  }
  return table.stringIds.map((id) => {
    const text = resolveLanguageString(localeValue, id);
    if (text === undefined) throw new TypeError(`Ending locale string ${id} is missing`);
    return text;
  });
}

export function isEndingHeroClassId(value: unknown): value is EndingHeroClassId {
  return ENDING_HERO_CLASS_IDS.includes(value as EndingHeroClassId);
}

export function createEndingSequence(
  storyStrings: readonly string[],
  creditStrings: readonly string[],
): EndingSequenceState {
  if (!storyStrings.every((line) => typeof line === 'string') ||
    !creditStrings.every((line) => typeof line === 'string')) {
    throw new TypeError('Ending strings must be text');
  }
  return {
    phase: 'fade',
    frameRemainderMs: 0,
    fadeFramesRemaining: ENDING_FADE_FRAMES,
    storyStrings: [...storyStrings],
    storyIndex: 0,
    storyPage: [],
    storyDelayFramesRemaining: 0,
    creditStrings: [...creditStrings],
    creditIndex: 0,
    creditDelayFramesRemaining: 0,
    creditRoll: [],
  };
}

/** Source story pages end at _N markers; confirmation can skip their remaining wait. */
export function advanceEndingStoryPage(source: EndingSequenceState): EndingSequenceState {
  if (source.phase !== 'story') return source;
  if (source.storyIndex >= source.storyStrings.length) {
    return { ...source, phase: 'credits', storyPage: [] };
  }

  const storyPage: string[] = [];
  let storyIndex = source.storyIndex;
  let storyDelayFramesRemaining = 0;
  while (storyIndex < source.storyStrings.length) {
    const line = source.storyStrings[storyIndex];
    const pause = /^_(\d+)$/.exec(line);
    storyIndex += 1;
    if (pause !== null) {
      storyDelayFramesRemaining = Number(pause[1]);
      break;
    }
    storyPage.push(line);
  }
  return {
    ...source,
    storyIndex,
    storyPage,
    storyDelayFramesRemaining,
  };
}

/** Advance the ending at the source 20-frame-per-second screen cadence. */
export function advanceEndingSequence(
  source: EndingSequenceState,
  elapsedMs: number,
): EndingSequenceState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Ending elapsed time must be finite and non-negative');
  }
  if (source.phase === 'complete') return source;

  const state: EndingSequenceState = {
    ...source,
    frameRemainderMs: source.frameRemainderMs + elapsedMs,
    storyStrings: source.storyStrings,
    storyPage: [...source.storyPage],
    creditStrings: source.creditStrings,
    creditRoll: source.creditRoll.map((line) => ({ ...line })),
  };
  while (state.frameRemainderMs >= ENDING_FRAME_MS && state.phase !== 'complete') {
    state.frameRemainderMs -= ENDING_FRAME_MS;
    if (state.phase === 'fade') {
      state.fadeFramesRemaining = Math.max(0, state.fadeFramesRemaining - 1);
      if (state.fadeFramesRemaining === 0) {
        state.phase = 'story';
        Object.assign(state, advanceEndingStoryPage(state));
      }
      continue;
    }

    if (state.phase === 'story') {
      if (state.storyDelayFramesRemaining > 0) state.storyDelayFramesRemaining -= 1;
      continue;
    }

    if (state.creditIndex >= state.creditStrings.length && state.creditRoll.length === 0) {
      state.phase = 'complete';
      continue;
    }

    if (state.creditDelayFramesRemaining > 0) {
      state.creditDelayFramesRemaining -= 1;
    } else if (state.creditIndex < state.creditStrings.length) {
      const text = state.creditStrings[state.creditIndex];
      state.creditIndex += 1;
      if (text.startsWith('-')) {
        state.creditDelayFramesRemaining = 3;
      } else if (text.startsWith('=')) {
        state.creditDelayFramesRemaining = 9;
      } else {
        state.creditRoll.push({ text, y: 320, height: Math.max(8, text.split('\n').length * 8) });
        state.creditDelayFramesRemaining = 4;
      }
    }

    state.creditRoll = state.creditRoll
      .map((line) => ({ ...line, y: line.y - 2 }))
      .filter((line) => line.y >= -line.height);
  }
  return state;
}

