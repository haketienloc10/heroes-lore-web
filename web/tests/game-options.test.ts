import { describe, expect, it } from 'vitest';
import {
  changeGameOption,
  DEFAULT_GAME_OPTIONS,
  gameOptionValue,
  gameSpeedScale,
  GAME_OPTIONS_STORAGE_KEY,
  readGameOptions,
  writeGameOptions,
} from '../src/world/game-options';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('game options', () => {
  it('loads source defaults and restores valid saved values', () => {
    const storage = new MemoryStorage();
    expect(readGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);

    const saved = { sound: false, gameSpeed: 1, speech: true, camera: false } as const;
    writeGameOptions(storage, saved);
    expect(storage.getItem(GAME_OPTIONS_STORAGE_KEY)).toBe(JSON.stringify(saved));
    expect(readGameOptions(storage)).toEqual(saved);
  });

  it('rejects malformed and out-of-range values field by field', () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_OPTIONS_STORAGE_KEY, '{not-json');
    expect(readGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
    storage.setItem(GAME_OPTIONS_STORAGE_KEY, JSON.stringify({ sound: false, gameSpeed: 3 }));
    expect(readGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, sound: false });
  });

  it('cycles the three source game speeds and toggles boolean settings', () => {
    expect(changeGameOption(DEFAULT_GAME_OPTIONS, 'gameSpeed', 1).gameSpeed).toBe(0);
    expect(changeGameOption(DEFAULT_GAME_OPTIONS, 'gameSpeed', -1).gameSpeed).toBe(1);
    expect(changeGameOption(DEFAULT_GAME_OPTIONS, 'speech').speech).toBe(true);
    expect(gameOptionValue(DEFAULT_GAME_OPTIONS, 'gameSpeed')).toBe('Fast');
  });

  it('scales world time to the source 8, 10 and 14 frame rates', () => {
    expect(gameSpeedScale({ gameSpeed: 0 })).toBeCloseTo(8 / 14);
    expect(gameSpeedScale({ gameSpeed: 1 })).toBeCloseTo(10 / 14);
    expect(gameSpeedScale({ gameSpeed: 2 })).toBe(1);
  });
});
