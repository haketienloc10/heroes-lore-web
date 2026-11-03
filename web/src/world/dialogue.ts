import { bitmapTextWidth, type BitmapFontData } from '../ui/bitmap-font';
import type { EventFlagChange, EventOperationData } from './event-data';

interface LocalizedStringTable {
  strings: Array<{ id: number; text: string }>;
}

function localizedStrings(localeValue: unknown): Map<number, string> | undefined {
  if (typeof localeValue !== 'object' || localeValue === null ||
    !('strings' in localeValue) || !Array.isArray((localeValue as LocalizedStringTable).strings)) return undefined;
  const locale = new Map<number, string>();
  for (const entry of (localeValue as LocalizedStringTable).strings) {
    if (typeof entry === 'object' && entry !== null && Number.isInteger(entry.id) &&
      typeof entry.text === 'string') locale.set(entry.id, entry.text);
  }
  return locale;
}

/** Resolve a direct locale-table ID used by engine messages outside event string tables. */
export function resolveLanguageString(localeValue: unknown, languageStringId: number): string | undefined {
  if (!Number.isInteger(languageStringId) || languageStringId < 0) return undefined;
  return localizedStrings(localeValue)?.get(languageStringId)?.replaceAll(';', '\n');
}

/** Resolve one opcode-1 reference so an interpreter can preserve script command order. */
export function resolveScriptDialogueString(
  events: Pick<EventOperationData, 'stringIds'>,
  stringIndex: number,
  localeValue: unknown,
): string | undefined {
  if (!Number.isInteger(stringIndex) || stringIndex < 0) return undefined;
  const locale = localizedStrings(localeValue);
  if (locale === undefined) return undefined;
  const localeId = events.stringIds[stringIndex];
  return localeId === undefined ? undefined : resolveLanguageString(localeValue, localeId);
}

/** Resolve opcode-1 dialogue references through a map's string table and locale. */
export function resolveScriptDialogue(
  events: Pick<EventOperationData, 'scripts' | 'stringIds'>,
  scriptIndex: number,
  localeValue: unknown,
): string[] {
  if (!Number.isInteger(scriptIndex) || scriptIndex < 0) return [];
  if (localizedStrings(localeValue) === undefined) return [];
  const script = events.scripts[scriptIndex];
  if (script === undefined) return [];

  const lines: string[] = [];
  for (const [opcode, stringIndex] of script) {
    if (opcode !== 1) continue;
    const text = resolveScriptDialogueString(events, stringIndex, localeValue);
    if (text !== undefined) lines.push(text);
  }
  return lines;
}

/** Opening dialogue keeps the source speaker label while removing its control marker. */
export function formatRoninDialogue(text: string): string {
  return formatSourceDialogue(text);
}

/** Source bitmap text suppresses the $, @ and | event control characters. */
export function formatSourceDialogue(text: string): string {
  return text.replace(/[$@|]/g, '');
}

/** Text-only scripts can be displayed without pretending to run other commands. */
export function isDialogueOnlyScript(
  events: Pick<EventOperationData, 'scripts'>,
  scriptIndex: number,
): boolean {
  const commands = events.scripts[scriptIndex];
  return commands !== undefined && commands.some(([opcode]) => opcode === 1) &&
    commands.every(([opcode]) => [1, 9, 26, 29, 99].includes(opcode));
}

/** Extract only the source game/quest flag mutations from a selected script. */
export function getScriptFlagChanges(
  events: Pick<EventOperationData, 'scripts'>,
  scriptIndex: number,
): EventFlagChange[] {
  const changes: EventFlagChange[] = [];
  for (const [opcode, low, high] of events.scripts[scriptIndex] ?? []) {
    if (opcode !== 9 && opcode !== 30) continue;
    const operation = high & 3;
    if (operation <= 2) {
      changes.push({
        flagSet: opcode === 9 ? 'game' : 'quest',
        operation: operation === 0 ? 'set' : operation === 1 ? 'clear' : 'toggle',
        flagIndex: low | ((high << 2) & 768),
      });
    }
  }
  return changes;
}

/** Split localized text into source-font pages with at most three visible lines. */
export function paginateBitmapDialogue(
  text: string,
  font: BitmapFontData,
  maximumWidth: number,
  maximumLines = 3,
  sourceControls = false,
): string[] {
  if (!Number.isFinite(maximumWidth) || maximumWidth <= 0 ||
    !Number.isInteger(maximumLines) || maximumLines <= 0) return [];
  if (text.length === 0) return [];

  const shortTextWidth = sourceControls
    ? bitmapTextWidth(formatSourceDialogue(text), font)
    : bitmapTextWidth(text, font);
  if (text.length > 0 && text.length < 64 && !text.includes('\n') &&
    shortTextWidth <= maximumWidth) return [text];

  const rows: string[] = [];
  const paragraphs = text.split('\n');
  // The source wrapper emits a row for each newline but no trailing empty row.
  if (text.endsWith('\n')) paragraphs.pop();
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    // Source wrapping skips spaces immediately following an explicit newline.
    const paragraph = paragraphIndex === 0 ? paragraphs[paragraphIndex] : paragraphs[paragraphIndex].replace(/^ +/, '');
    if (paragraph.length === 0) {
      rows.push('');
      continue;
    }
    let start = 0;
    while (start < paragraph.length) {
      let width = 0;
      let cursor = start;
      for (; cursor < paragraph.length; cursor += 1) {
        width += bitmapTextWidth(paragraph[cursor], font);
        if (width >= maximumWidth) break;
      }
      if (cursor === paragraph.length) {
        rows.push(paragraph.slice(start));
        break;
      }
      const space = paragraph.lastIndexOf(' ', cursor);
      if (space >= start) {
        rows.push(paragraph.slice(start, space));
        start = space + 1;
      } else {
        // Progress even if one glyph is wider than the available line.
        const end = cursor > start ? cursor : cursor + 1;
        rows.push(paragraph.slice(start, end));
        start = end;
      }
    }
  }

  const pages: string[] = [];
  for (let index = 0; index < rows.length; index += maximumLines) {
    pages.push(rows.slice(index, index + maximumLines).join('\n'));
  }
  return pages;
}
