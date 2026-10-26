export type StartupPointerPage =
  | 'brand-splash'
  | 'title-splash'
  | 'menu'
  | 'options'
  | 'help'
  | 'help-content'
  | 'about'
  | 'load-game'
  | 'exit-confirm'
  | 'exit'
  | 'hero'
  | 'guardians'
  | 'confirm'
  | 'loading';

export interface StartupPointerSelection {
  selectedMenu: number;
  selectedOption: number;
  selectedHelpTopic: number;
  selectedGuardian: number;
  confirmYes: boolean;
  helpTopicCount: number;
  selectedSaveIndex: number;
  saveCount: number;
}

const WIDTH = 240;
const HEIGHT = 320;
const SOFT_KEY_TOP = 300;

/** Convert a tap on the 240×320 title canvas into the screen's existing key actions. */
export function startupPointerKeys(
  page: StartupPointerPage,
  x: number,
  y: number,
  selection: StartupPointerSelection,
): string[] {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
    return [];
  }

  if (page === 'brand-splash' || page === 'title-splash') return ['Enter'];

  if (y >= SOFT_KEY_TOP) return softKeyActions(page, x);

  if (page === 'menu') {
    if (x < 48 || x > 192) return [];
    const row = rowAt(y, 107, 16, 6);
    return row === null ? [] : [...moveToIndex(selection.selectedMenu, row, 6, true), 'Enter'];
  }
  if (page === 'options') {
    const row = rowAt(y, 132, 20, 4);
    if (row === null || x < 48 || x > 192) return [];
    const move = moveToIndex(selection.selectedOption, row, 4, true);
    return x >= 142 ? [...move, 'ArrowRight'] : move;
  }
  if (page === 'help') {
    if (x < 54 || x > 186) return [];
    const row = rowAt(y, 126, 15, selection.helpTopicCount);
    return row === null ? [] : [...moveToIndex(selection.selectedHelpTopic, row, selection.helpTopicCount, false), 'Enter'];
  }
  if (page === 'help-content' || page === 'about') {
    return [x < WIDTH / 2 ? 'ArrowUp' : 'ArrowDown'];
  }
  if (page === 'load-game') {
    if (y >= 236 && y < 288) return [x < WIDTH / 2 ? 'i' : 'e'];
    if (x < 48 || x > 116) return [];
    const row = rowAt(y, 147, 16, selection.saveCount);
    return row === null
      ? []
      : [...moveToIndex(selection.selectedSaveIndex, row, selection.saveCount, true), 'Enter'];
  }
  if (page === 'hero') {
    return ['Enter'];
  }
  if (page === 'guardians') {
    if (x < 64 || x > 166 || y < 128 || y > 169) return [];
    const guardian = Math.round((x - 80) / 34);
    if (guardian < 0 || guardian > 2 || Math.abs(x - (80 + guardian * 34)) > 17) return [];
    return [...moveToIndex(selection.selectedGuardian, guardian, 3, true), 'Enter'];
  }
  if (page === 'confirm') {
    if (y < 194 || y > 222 || x < 106 || x > 184) return [];
    const wantsYes = x < 139;
    return [...(wantsYes === selection.confirmYes ? [] : ['ArrowLeft']), 'Enter'];
  }

  return [];
}

function softKeyActions(
  page: StartupPointerPage,
  x: number,
): string[] {
  const left = x < WIDTH / 2;
  if (page === 'menu') return [left ? 'Enter' : 'Backspace'];
  if (page === 'options') return [left ? 'ArrowRight' : 'Backspace'];
  if (page === 'help') return [left ? 'Enter' : 'Backspace'];
  if (page === 'help-content' || page === 'about') return left ? ['ArrowUp'] : ['Backspace'];
  if (page === 'load-game') return left ? ['i'] : ['Backspace'];
  if (page === 'hero') return [left ? 'Enter' : 'Backspace'];
  if (page === 'guardians') return [left ? 'Enter' : 'Backspace'];
  if (page === 'confirm') return [left ? 'Enter' : 'Backspace'];
  if (page === 'exit-confirm') return [left ? 'Enter' : 'Escape'];
  if (page === 'exit' || page === 'loading') return [];
  return [];
}

function rowAt(y: number, firstCenter: number, spacing: number, count: number): number | null {
  if (count <= 0) return null;
  const index = Math.round((y - firstCenter) / spacing);
  if (index < 0 || index >= count || Math.abs(y - (firstCenter + index * spacing)) > spacing / 2) {
    return null;
  }
  return index;
}

function moveToIndex(current: number, target: number, count: number, wrap: boolean): string[] {
  if (count <= 0 || !Number.isInteger(current) || !Number.isInteger(target) || target < 0 || target >= count) {
    return [];
  }
  const start = wrap ? (current + count) % count : Math.min(count - 1, Math.max(0, current));
  if (start === target) return [];
  if (!wrap) {
    const key = target > start ? 'ArrowDown' : 'ArrowUp';
    return Array.from({ length: Math.abs(target - start) }, () => key);
  }
  const downCount = (target - start + count) % count;
  const upCount = (start - target + count) % count;
  const key = downCount <= upCount ? 'ArrowDown' : 'ArrowUp';
  const steps = Math.min(downCount, upCount);
  return Array.from({ length: steps }, () => key);
}
