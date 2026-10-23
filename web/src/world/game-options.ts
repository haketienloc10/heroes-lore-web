export const GAME_OPTIONS_STORAGE_KEY = 'heroes-lore-options-v1';

export const GAME_SPEEDS = [
  { label: 'Slow', framesPerSecond: 8 },
  { label: 'Normal', framesPerSecond: 10 },
  { label: 'Fast', framesPerSecond: 14 },
] as const;

export interface GameOptions {
  sound: boolean;
  gameSpeed: 0 | 1 | 2;
  speech: boolean;
  camera: boolean;
}

export type GameOptionKey = keyof GameOptions;

export const DEFAULT_GAME_OPTIONS: Readonly<GameOptions> = {
  sound: true,
  gameSpeed: 2,
  speech: false,
  camera: true,
};

export const GAME_OPTION_ROWS: readonly GameOptionKey[] = [
  'sound',
  'gameSpeed',
  'speech',
  'camera',
];

export function readGameOptions(storage: Pick<Storage, 'getItem'>): GameOptions {
  let parsed: unknown;
  try {
    const saved = storage.getItem(GAME_OPTIONS_STORAGE_KEY);
    if (saved === null) return { ...DEFAULT_GAME_OPTIONS };
    parsed = JSON.parse(saved) as unknown;
  } catch {
    return { ...DEFAULT_GAME_OPTIONS };
  }

  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_GAME_OPTIONS };
  const candidate = parsed as Record<string, unknown>;
  return {
    sound: typeof candidate.sound === 'boolean' ? candidate.sound : DEFAULT_GAME_OPTIONS.sound,
    gameSpeed: isGameSpeed(candidate.gameSpeed) ? candidate.gameSpeed : DEFAULT_GAME_OPTIONS.gameSpeed,
    speech: typeof candidate.speech === 'boolean' ? candidate.speech : DEFAULT_GAME_OPTIONS.speech,
    camera: typeof candidate.camera === 'boolean' ? candidate.camera : DEFAULT_GAME_OPTIONS.camera,
  };
}

export function writeGameOptions(
  storage: Pick<Storage, 'setItem'>,
  options: GameOptions,
): void {
  try {
    storage.setItem(GAME_OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Storage can be disabled by browser privacy settings; runtime settings still apply.
  }
}

export function changeGameOption(
  options: GameOptions,
  option: GameOptionKey,
  direction = 1,
): GameOptions {
  if (option === 'gameSpeed') {
    const gameSpeed = (options.gameSpeed + Math.sign(direction) + GAME_SPEEDS.length) % GAME_SPEEDS.length;
    return { ...options, gameSpeed: gameSpeed as GameOptions['gameSpeed'] };
  }
  return { ...options, [option]: !options[option] };
}

export function gameOptionValue(options: GameOptions, option: GameOptionKey): string {
  if (option === 'gameSpeed') return GAME_SPEEDS[options.gameSpeed].label;
  return options[option] ? 'On' : 'Off';
}

export function gameSpeedScale(options: Pick<GameOptions, 'gameSpeed'>): number {
  return GAME_SPEEDS[options.gameSpeed].framesPerSecond / GAME_SPEEDS[2].framesPerSecond;
}

function isGameSpeed(value: unknown): value is GameOptions['gameSpeed'] {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value < GAME_SPEEDS.length;
}
