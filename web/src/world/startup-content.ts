import type { BitmapFontData } from '../ui/bitmap-font';
import { paginateBitmapDialogue, resolveLanguageString } from './dialogue';

export interface StartupHelpTopic {
  title: string;
  pages: string[];
}

export const STARTUP_MENU_STRING_IDS = [2348, 2349, 2350, 2351, 2352, 2354] as const;

const HELP_TOPIC_COUNT = 4;
const HELP_CONTENT_OFFSET = 6;
const HELP_CONTENT_WIDTH = 130;
const SOURCE_PAGE_LINES = 11;

/** Resolve the four help topics exposed by the source title menu on this handset. */
export function buildStartupHelpTopics(
  localeValue: unknown,
  textTableValue: unknown,
  font: BitmapFontData,
): StartupHelpTopic[] {
  if (typeof textTableValue !== 'object' || textTableValue === null ||
    !('stringIds' in textTableValue) || !Array.isArray(textTableValue.stringIds)) return [];

  const stringIds = textTableValue.stringIds;
  const topics: StartupHelpTopic[] = [];
  for (let index = 0; index < HELP_TOPIC_COUNT; index += 1) {
    const titleId = stringIds[index];
    const contentId = stringIds[index + HELP_CONTENT_OFFSET];
    if (!Number.isInteger(titleId) || !Number.isInteger(contentId)) continue;
    const title = resolveLanguageString(localeValue, titleId as number);
    const content = resolveLanguageString(localeValue, contentId as number);
    if (title === undefined || content === undefined) continue;
    topics.push({
      title,
      pages: paginateBitmapDialogue(content, font, HELP_CONTENT_WIDTH, SOURCE_PAGE_LINES),
    });
  }
  return topics;
}

/** Build the About text using the title screen's pinned MIDlet manifest values. */
export function buildStartupAboutPages(localeValue: unknown, font: BitmapFontData): string[] {
  const title = resolveLanguageString(localeValue, 2333);
  const developer = resolveLanguageString(localeValue, 2355);
  const website = resolveLanguageString(localeValue, 2334);
  const support = resolveLanguageString(localeValue, 2356);
  if ([title, developer, website, support].some((value) => value === undefined)) return [];

  const aboutText = [
    '(WAP.KA4KA.RU) HEROES LORE',
    '',
    title,
    '',
    developer,
    'Hands-On Mobile',
    website,
    '',
    support,
    'v.2.1.2',
  ].join('\n');
  return paginateBitmapDialogue(aboutText, font, HELP_CONTENT_WIDTH, SOURCE_PAGE_LINES);
}
