export interface MusicPlayback {
  play(): void;
  pause(): void;
}

export type MusicPlaybackFactory = () => Promise<MusicPlayback>;

/** Starts the game's single looping MIDI only after a browser user gesture. */
export class GameMusicController {
  private enabled = true;
  private playback: MusicPlayback | null = null;
  private initializing: Promise<void> | null = null;
  private playing = false;

  constructor(private readonly createPlayback: MusicPlaybackFactory) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pause();
    } else if (this.playback !== null) {
      this.play();
    }
  }

  async activateFromUserGesture(): Promise<void> {
    if (!this.enabled) return;
    if (this.playback !== null) {
      this.play();
      return;
    }

    if (this.initializing === null) {
      this.initializing = this.createPlayback()
        .then((playback) => {
          this.playback = playback;
        })
        .finally(() => {
          this.initializing = null;
        });
    }

    try {
      await this.initializing;
    } catch (error) {
      console.warn('Game music could not be initialized.', error);
      return;
    }
    if (this.enabled) this.play();
  }

  private play(): void {
    if (this.playing || this.playback === null) return;
    this.playback.play();
    this.playing = true;
  }

  private pause(): void {
    if (!this.playing || this.playback === null) return;
    this.playback.pause();
    this.playing = false;
  }
}

async function createBrowserMidiPlayback(): Promise<MusicPlayback> {
  const context = new AudioContext();
  // Invoke resume before any await so browsers accept the unlock from the input event.
  const resumed = context.resume();
  try {
    const [midiResponse, soundFontResponse] = await Promise.all([
      fetch('/assets/generated/audio/25.mid'),
      fetch('/assets/generated/audio/GeneralUser-GS.sf2'),
    ]);
    if (!midiResponse.ok || !soundFontResponse.ok) {
      throw new Error('The original MIDI or local GeneralUser GS SoundFont is missing.');
    }
    const [midi, soundFont] = await Promise.all([
      midiResponse.arrayBuffer(),
      soundFontResponse.arrayBuffer(),
    ]);
    await resumed;
    await context.audioWorklet.addModule('/assets/generated/vendor/spessasynth_processor.min.js');

    const [{ Sequencer, WorkletSynthesizer }] = await Promise.all([
      import('spessasynth_lib'),
    ]);
    const synthesizer = new WorkletSynthesizer(context);
    synthesizer.connect(context.destination);
    await synthesizer.isReady;
    await synthesizer.soundBankManager.addSoundBank(soundFont, 'GeneralUser GS');

    const sequencer = new Sequencer(synthesizer);
    sequencer.loopCount = -1;
    sequencer.loadNewSongList([{ binary: midi, fileName: '25.mid' }]);
    return {
      play: () => {
        void context.resume().then(() => sequencer.play()).catch((error: unknown) => {
          console.warn('Game music could not be resumed.', error);
        });
      },
      pause: () => sequencer.pause(),
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

export const gameMusic = new GameMusicController(createBrowserMidiPlayback);
