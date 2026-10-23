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

/** The selected Ronin route displays event speaker markers as [Ron] in the reference. */
export function formatRoninDialogue(text: string): string {
  return text.replace(/^[$|]\[[^\]]+\]\s*/, '[Ron] ');
}

/** Keep the speaker label from an event string while removing its control marker. */
export function formatSourceDialogue(text: string): string {
  return text.replace(/^[$|](?=\[[^\]]+\])/, '');
}

/** Text-only scripts can be displayed without pretending to run other commands. */
export function isDialogueOnlyScript(
  events: Pick<EventOperationData, 'scripts'>,
  scriptIndex: number,
): boolean {
  const commands = events.scripts[scriptIndex];
  return commands !== undefined && commands.some(([opcode]) => opcode === 1) &&
    commands.every(([opcode]) => [1, 9, 10, 26, 29, 99].includes(opcode));
}

/** Extract only the source game/quest flag mutations from a selected script. */
export function getScriptFlagChanges(
  events: Pick<EventOperationData, 'scripts'>,
  scriptIndex: number,
): EventFlagChange[] {
  const changes: EventFlagChange[] = [];
  for (const [opcode, low, high] of events.scripts[scriptIndex] ?? []) {
    if (opcode !== 9 && opcode !== 10) continue;
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
): string[] {
  if (!Number.isFinite(maximumWidth) || maximumWidth <= 0 ||
    !Number.isInteger(maximumLines) || maximumLines <= 0) return [];

  const rows: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      rows.push('');
      continue;
    }
    let row = '';
    for (const word of words) {
      const candidate = row.length === 0 ? word : `${row} ${word}`;
      if (row.length > 0 && bitmapTextWidth(candidate, font) > maximumWidth) {
        rows.push(row);
        row = word;
      } else {
        row = candidate;
      }
    }
    rows.push(row);
  }

  const pages: string[] = [];
  for (let index = 0; index < rows.length; index += maximumLines) {
    pages.push(rows.slice(index, index + maximumLines).join('\n'));
  }
  return pages;
}
