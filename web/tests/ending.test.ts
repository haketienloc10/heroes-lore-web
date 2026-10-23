import { describe, expect, it } from 'vitest';
import {
  advanceEndingSequence,
  advanceEndingStoryPage,
  createEndingSequence,
  ENDING_FADE_FRAMES,
  ENDING_FRAME_MS,
  isEndingHeroClassId,
  resolveEndingTextTable,
} from '../src/world/ending';

describe('source ending sequence', () => {
  it('resolves the extracted TDF string IDs through the locale table', () => {
    expect(resolveEndingTextTable({
      format: 'heroes-lore-text-table-v1',
      stringIds: [10, 11],
    }, {
      strings: [{ id: 10, text: 'First;second' }, { id: 11, text: '_32' }],
    })).toEqual(['First\nsecond', '_32']);
    expect(() => resolveEndingTextTable({
      format: 'heroes-lore-text-table-v1', stringIds: [12],
    }, { strings: [] })).toThrow('Ending locale string 12 is missing');
  });

  it('fades to the first story block and waits on source pause markers', () => {
    let state = createEndingSequence(['First line', '_2', 'Second line'], []);
    state = advanceEndingSequence(state, ENDING_FADE_FRAMES * ENDING_FRAME_MS);
    expect(state).toMatchObject({
      phase: 'story',
      fadeFramesRemaining: 0,
      storyPage: ['First line'],
      storyDelayFramesRemaining: 2,
    });

    state = advanceEndingSequence(state, 2 * ENDING_FRAME_MS);
    expect(state.storyDelayFramesRemaining).toBe(0);
    state = advanceEndingStoryPage(state);
    expect(state).toMatchObject({ phase: 'story', storyPage: ['Second line'], storyIndex: 3 });
    state = advanceEndingStoryPage(state);
    expect(state.phase).toBe('credits');
  });

  it('lets story confirmation skip the remaining source pause frames', () => {
    let state = createEndingSequence(['First line', '_48', 'Second line'], []);
    state = advanceEndingSequence(state, ENDING_FADE_FRAMES * ENDING_FRAME_MS);
    expect(state.storyDelayFramesRemaining).toBe(48);
    state = advanceEndingStoryPage(state);
    expect(state).toMatchObject({
      phase: 'story',
      storyPage: ['Second line'],
      storyDelayFramesRemaining: 0,
    });
  });

  it('scrolls source credits and completes only after the final line leaves the screen', () => {
    let state = createEndingSequence([], ['First credit', '-', 'Second credit', '=']);
    state = advanceEndingSequence(state, ENDING_FADE_FRAMES * ENDING_FRAME_MS);
    expect(state.phase).toBe('credits');

    state = advanceEndingSequence(state, ENDING_FRAME_MS);
    expect(state.creditRoll).toEqual([{ text: 'First credit', y: 318, height: 8 }]);
    state = advanceEndingSequence(state, 100_000);
    expect(state.phase).toBe('complete');
    expect(state.creditRoll).toEqual([]);
  });

  it('validates elapsed time and recognizes only source hero classes', () => {
    const state = createEndingSequence([], []);
    expect(() => advanceEndingSequence(state, -1)).toThrow(RangeError);
    expect(isEndingHeroClassId(6)).toBe(true);
    expect(isEndingHeroClassId(8)).toBe(true);
    expect(isEndingHeroClassId(9)).toBe(false);
  });
});
