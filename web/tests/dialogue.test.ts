import { describe, expect, it } from 'vitest';
import { bitmapTextWidth, type BitmapFontData } from '../src/ui/bitmap-font';
import {
  formatRoninDialogue,
  getScriptFlagChanges,
  isDialogueOnlyScript,
  paginateBitmapDialogue,
  resolveLanguageString,
  resolveScriptDialogue,
  resolveScriptDialogueString,
} from '../src/world/dialogue';

const testFont: BitmapFontData = {
  format: 'heroes-lore-bitmap-font-v1',
  height: 6,
  spaceAdvance: 3,
  letterSpacing: 1,
  glyphOffsets: Array.from({ length: 95 }, (_, index) => index * 5),
  atlasWidth: 470,
};

describe('source event dialogue', () => {
  it('resolves opcode-1 text through the map string table and selected locale', () => {
    const events = {
      scripts: [[[17, 1, 4], [1, 0, 0], [22, 0, 0], [1, 1, 0]]],
      stringIds: [1621, 1622],
    };
    const locale = {
      strings: [
        { id: 1621, text: '$[Reah] Are you sure?' },
        { id: 1622, text: '|[Ronin] Yes, I am.' },
      ],
    };
    expect(resolveScriptDialogue(events, 0, locale)).toEqual([
      '$[Reah] Are you sure?', '|[Ronin] Yes, I am.',
    ]);
    expect(resolveScriptDialogueString(events, 1, locale)).toBe('|[Ronin] Yes, I am.');
  });

  it('resolves direct engine message IDs from the selected locale', () => {
    expect(resolveLanguageString({ strings: [{ id: 2366, text: 'Inventory is full.' }] }, 2366))
      .toBe('Inventory is full.');
    expect(resolveLanguageString({ strings: [{ id: 2366, text: 'Inventory is full.' }] }, -1))
      .toBeUndefined();
  });

  it('uses the speaker substitution recorded for the selected Ronin route', () => {
    expect(formatRoninDialogue('$[Reah] Are you sure?')).toBe('[Ron] Are you sure?');
    expect(formatRoninDialogue('|[Ronin] Yes, I am.')).toBe('[Ron] Yes, I am.');
  });

  it('accepts only text and flag commands in the limited interaction runner', () => {
    const events = {
      scripts: [
        [[1, 0, 0], [9, 54, 0], [99, 0, 0]],
        [[1, 0, 0], [2, 0, 0], [99, 0, 0]],
      ],
    };
    expect(isDialogueOnlyScript(events, 0)).toBe(true);
    expect(isDialogueOnlyScript(events, 1)).toBe(false);
    expect(getScriptFlagChanges(events, 0)).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 54 },
    ]);
  });

  it('wraps long source dialogue into three-line pages using bitmap metrics', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const pages = paginateBitmapDialogue(text, testFont, 34, 3);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.split('\n').length <= 3)).toBe(true);
    expect(pages.join(' ').replaceAll('\n', ' ')).toContain('one two three');
    expect(pages.join(' ').replaceAll('\n', ' ')).toContain('eleven twelve thirteen');
    expect(bitmapTextWidth('one', testFont)).toBeLessThan(34);
  });
});
