import { describe, expect, it, vi } from 'vitest';
import { GameMusicController } from '../src/world/game-music';

describe('game music controller', () => {
  it('waits for a user gesture, then starts once and pauses with Sound off', async () => {
    const playback = { play: vi.fn(), pause: vi.fn() };
    const createPlayback = vi.fn(async () => playback);
    const music = new GameMusicController(createPlayback);

    music.setEnabled(false);
    await music.activateFromUserGesture();
    expect(createPlayback).not.toHaveBeenCalled();

    music.setEnabled(true);
    await music.activateFromUserGesture();
    expect(createPlayback).toHaveBeenCalledTimes(1);
    expect(playback.play).toHaveBeenCalledTimes(1);

    music.setEnabled(false);
    expect(playback.pause).toHaveBeenCalledTimes(1);
    music.setEnabled(true);
    expect(playback.play).toHaveBeenCalledTimes(2);
    await music.activateFromUserGesture();
    expect(playback.play).toHaveBeenCalledTimes(2);
  });

  it('shares initialization for concurrent activation events', async () => {
    let resolvePlayback: ((value: { play(): void; pause(): void }) => void) | undefined;
    const playbackPromise = new Promise<{ play(): void; pause(): void }>((resolve) => {
      resolvePlayback = resolve;
    });
    const playback = { play: vi.fn(), pause: vi.fn() };
    const createPlayback = vi.fn(() => playbackPromise);
    const music = new GameMusicController(createPlayback);

    const first = music.activateFromUserGesture();
    const second = music.activateFromUserGesture();
    expect(createPlayback).toHaveBeenCalledTimes(1);
    resolvePlayback?.(playback);
    await Promise.all([first, second]);
    expect(playback.play).toHaveBeenCalledTimes(1);
  });
});
