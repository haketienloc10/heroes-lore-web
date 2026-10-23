import { describe, expect, it } from 'vitest';
import {
  findSpriteRecord,
  parseCharacterSpriteLayout,
} from '../src/world/character-sprites';

const layout = {
  format: 'heroes-lore-character-sprite-layout-v1',
  nestedFrames: false,
  records: [{
    sourceOrder: 0,
    sourceOffset: 0,
    componentSlot: 1,
    animationSlot: 3,
    direction: 1,
    frames: [
      [{ x: -4, y: -24, mirrored: true, imageIndex: 3 }],
      [],
    ],
  }],
};

describe('character sprite layout data', () => {
  it('preserves source offsets, frame order, and mirrored image flags', () => {
    const parsed = parseCharacterSpriteLayout(layout);
    expect(findSpriteRecord(parsed, 1, 3, 1)?.frames).toEqual([
      [{ x: -4, y: -24, mirrored: true, imageIndex: 3 }],
      [],
    ]);
  });

  it('rejects invalid direction slots and malformed frame parts', () => {
    expect(() => parseCharacterSpriteLayout({
      ...layout,
      records: [{ ...layout.records[0], direction: 4 }],
    })).toThrow(TypeError);
    expect(() => parseCharacterSpriteLayout({
      ...layout,
      records: [{ ...layout.records[0], frames: [[{ ...layout.records[0].frames[0][0], x: 128 }]] }],
    })).toThrow(TypeError);
  });
});
