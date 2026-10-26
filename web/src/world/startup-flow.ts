import Phaser from 'phaser';
import {
  bitmapTextWidth,
  drawBitmapText,
  type BitmapFontData,
  type BitmapTextAlignment,
} from '../ui/bitmap-font';
import {
  readGameSaves,
  sourceSaveCompletionPercent,
  writeGameSave,
  type GameSaveState,
} from './save-data';
import { parseEquipmentDataTable, type EquipmentDataTable } from './equipment-data';
import {
  changeGameOption,
  DEFAULT_GAME_OPTIONS,
  GAME_OPTION_ROWS,
  gameOptionValue,
  readGameOptions,
  writeGameOptions,
  type GameOptions,
} from './game-options';
import { gameMusic } from './game-music';
import {
  advanceStartupBrandSplashFrame,
  advanceStartupTitleSplashInput,
  createStartupBrandSplashFrame,
  SOURCE_BRAND_SPLASH_TICK_MS,
  type StartupBrandSplashFrame,
} from './startup-title';
import { startupPointerKeys, type StartupPointerSelection } from './startup-pointer';
import {
  buildStartupAboutPages,
  buildStartupHelpTopics,
  STARTUP_MENU_STRING_IDS,
  type StartupHelpTopic,
} from './startup-content';

type StartPage =
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

const GUARDIANS = [
  { name: 'Hestia', description: ['Fire attribute /', 'Attacker'] },
  { name: 'Ran', description: ['Water attribute /', 'Healer'] },
  { name: 'Pyorghin', description: ['Earth attribute /', 'Mixture of Attacker', 'and Healer'] },
];
const PANEL_X = 43;
const PANEL_Y = 75;
const RONIN_HERO_CLASS_ID = 6;
const HERO_CLASS_NAME_STRING_IDS: Record<GameSaveState['heroClassId'], number> = {
  6: 685,
  7: 686,
  8: 687,
};
const HERO_CLASS_FALLBACK_NAMES: Record<GameSaveState['heroClassId'], string> = {
  6: 'Ronin',
  7: 'Reah',
  8: 'Aramor',
};

/** Reproduces the title menu and New Game selection screens from v2.1.2. */
export class StartupFlowScene extends Phaser.Scene {
  private page: StartPage = 'brand-splash';
  private selectedMenu = 0;
  private selectedOption = 0;
  private selectedHelpTopic = 0;
  private contentPage = 0;
  private selectedGuardian = 0;
  private selectedGuardians = new Set<number>();
  private confirmYes = false;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private canvasTexture: Phaser.Textures.CanvasTexture | null = null;
  private fontLayout: BitmapFontData | null = null;
  private keydown: ((event: KeyboardEvent) => void) | null = null;
  private savedGames: GameSaveState[] = [];
  private selectedSaveIndex = 0;
  private loadGameMessage = '';
  private options: GameOptions = { ...DEFAULT_GAME_OPTIONS };
  private pointerDown: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private startupLanguage: unknown = null;
  private helpTopics: StartupHelpTopic[] = [];
  private aboutPages: string[] = [];
  private brandSplashFrame: StartupBrandSplashFrame = createStartupBrandSplashFrame();
  private brandSplashRemainderMs = 0;

  constructor() {
    super({ key: 'StartupFlowScene' });
  }

  init(data?: unknown): void {
    const skipStartupSplash = typeof data === 'object' && data !== null &&
      'skipStartupSplash' in data && (data as { skipStartupSplash?: unknown }).skipStartupSplash === true;
    this.page = skipStartupSplash ? 'menu' : 'brand-splash';
    this.selectedMenu = 0;
    this.selectedOption = 0;
    this.selectedHelpTopic = 0;
    this.contentPage = 0;
    this.selectedGuardian = 0;
    this.selectedGuardians.clear();
    this.confirmYes = false;
    this.canvas = null;
    this.context = null;
    this.canvasTexture = null;
    this.fontLayout = null;
    this.keydown = null;
    this.savedGames = [];
    this.selectedSaveIndex = 0;
    this.loadGameMessage = '';
    this.options = { ...DEFAULT_GAME_OPTIONS };
    this.pointerDown = null;
    this.startupLanguage = null;
    this.helpTopics = [];
    this.aboutPages = [];
    this.brandSplashFrame = createStartupBrandSplashFrame();
    this.brandSplashRemainderMs = 0;
  }

  preload(): void {
    this.load.json('small-font-layout', '/assets/generated/fonts/small.json');
    this.load.json('startup-language', '/assets/generated/language/en-GB.json');
    this.load.json('startup-help-table', '/assets/generated/text-tables/sgui/help.json');
    this.load.image('small-font-atlas', '/assets/generated/fonts/small.png');
    this.load.image('source-brand-logo', '/assets/generated/atlases/img/logo/004.png');
    for (let index = 2; index <= 4; index += 1) {
      this.load.image(
        `source-title-${index}`,
        `/assets/generated/atlases/img/title1/${String(index).padStart(3, '0')}.png`,
      );
    }
    for (let index = 0; index <= 20; index += 1) {
      this.load.image(
        `start-ui-${index}`,
        `/assets/generated/atlases/sgui/mm/etc/${String(index).padStart(3, '0')}.png`,
      );
    }
    this.load.image('ronin-face', '/assets/generated/atlases/sgui/mm/face/000.png');
    for (const heroClassId of [7, 8]) {
      this.load.image(
        `source-save-face-${heroClassId}`,
        `/assets/generated/atlases/sgui/mm/face/${String(heroClassId - 6).padStart(3, '0')}.png`,
      );
    }
    for (let guardian = 0; guardian < 3; guardian += 1) {
      this.load.image(
        `guardian-${guardian}`,
        `/assets/generated/atlases/grd/${guardian}/000.png`,
      );
      this.load.image(
        `guardian-selected-${guardian}`,
        `/assets/generated/atlases/grd/${guardian}/001.png`,
      );
    }
  }

  create(): void {
    this.fontLayout = this.cache.json.get('small-font-layout') as BitmapFontData;
    this.startupLanguage = this.cache.json.get('startup-language') as unknown;
    this.helpTopics = buildStartupHelpTopics(
      this.startupLanguage,
      this.cache.json.get('startup-help-table') as unknown,
      this.fontLayout,
    );
    this.aboutPages = buildStartupAboutPages(this.startupLanguage, this.fontLayout);
    try {
      this.savedGames = readGameSaves(window.localStorage);
    } catch {
      this.savedGames = [];
    }
    try {
      this.options = readGameOptions(window.localStorage);
    } catch {
      this.options = { ...DEFAULT_GAME_OPTIONS };
    }
    gameMusic.setEnabled(this.options.sound);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 240;
    this.canvas.height = 320;
    this.context = this.canvas.getContext('2d');
    if (this.context === null || !this.textures.exists('small-font-atlas') ||
      !this.textures.exists('source-brand-logo') ||
      [2, 3, 4].some((index) => !this.textures.exists(`source-title-${index}`))) {
      this.add.text(12, 12, 'The game interface assets are incomplete.\nRun npm run assets:extract.', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '12px',
      });
      return;
    }
    this.context.imageSmoothingEnabled = false;
    if (this.textures.exists('startup-flow-canvas')) this.textures.remove('startup-flow-canvas');
    this.canvasTexture = this.textures.addCanvas('startup-flow-canvas', this.canvas);
    this.add.image(0, 0, 'startup-flow-canvas').setOrigin(0, 0);
    this.renderPage();

    this.pointerDown = (pointer: Phaser.Input.Pointer): void => {
      void gameMusic.activateFromUserGesture();
      const selection: StartupPointerSelection = {
        selectedMenu: this.selectedMenu,
        selectedOption: this.selectedOption,
        selectedHelpTopic: this.selectedHelpTopic,
        selectedGuardian: this.selectedGuardian,
        confirmYes: this.confirmYes,
        helpTopicCount: this.helpTopics.length,
        selectedSaveIndex: this.selectedSaveIndex,
        saveCount: this.savedGames.length,
      };
      const keys = startupPointerKeys(this.page, pointer.x, pointer.y, selection);
      for (const key of keys) this.handleInputKey(key);
    };
    this.input.on('pointerdown', this.pointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.pointerDown !== null) this.input.off('pointerdown', this.pointerDown);
    });

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      this.keydown = (event: KeyboardEvent): void => this.handleKey(event);
      keyboard.on('keydown', this.keydown);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this.keydown !== null) keyboard.off('keydown', this.keydown);
      });
    }
  }

  update(_time: number, delta: number): void {
    if (this.page === 'brand-splash') {
      this.brandSplashRemainderMs += Math.max(0, delta);
      let changed = false;
      while (this.brandSplashRemainderMs >= SOURCE_BRAND_SPLASH_TICK_MS) {
        this.brandSplashRemainderMs -= SOURCE_BRAND_SPLASH_TICK_MS;
        const next = advanceStartupBrandSplashFrame(this.brandSplashFrame);
        this.brandSplashFrame = next.frame;
        changed = true;
        if (next.finished) {
          this.page = 'title-splash';
          break;
        }
      }
      if (changed) this.renderPage();
    }
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key;
    if (this.page === 'brand-splash' || this.page === 'title-splash') {
      event.preventDefault();
      this.handleInputKey(key);
      return;
    }
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Backspace'];
    if (!navigationKeys.includes(key) && !['w', 's', 'i', 'e'].includes(key.toLowerCase())) {
      return;
    }
    event.preventDefault();
    this.handleInputKey(key);
  }

  private handleInputKey(key: string): void {
    void gameMusic.activateFromUserGesture();
    if (this.page === 'brand-splash' || this.page === 'title-splash') {
      this.page = advanceStartupTitleSplashInput(this.page);
      this.renderPage();
      return;
    }
    if (this.page === 'menu') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'exit-confirm';
      } else if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        this.selectedMenu = (this.selectedMenu + STARTUP_MENU_STRING_IDS.length - 1) % STARTUP_MENU_STRING_IDS.length;
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        this.selectedMenu = (this.selectedMenu + 1) % STARTUP_MENU_STRING_IDS.length;
      } else if (key === 'Enter' || key === ' ') {
        this.selectMenuOption();
        return;
      }
    } else if (this.page === 'options') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'menu';
      } else if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        this.selectedOption = (this.selectedOption + GAME_OPTION_ROWS.length - 1) % GAME_OPTION_ROWS.length;
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        this.selectedOption = (this.selectedOption + 1) % GAME_OPTION_ROWS.length;
      } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter' || key === ' ') {
        const direction = key === 'ArrowLeft' ? -1 : 1;
        this.options = changeGameOption(
          this.options,
          GAME_OPTION_ROWS[this.selectedOption],
          direction,
        );
        try {
          writeGameOptions(window.localStorage, this.options);
        } catch {
          // Browser storage may be unavailable; use the updated value for this session.
        }
        gameMusic.setEnabled(this.options.sound);
        if (this.options.sound) void gameMusic.activateFromUserGesture();
      }
    } else if (this.page === 'help') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'menu';
      } else if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        this.selectedHelpTopic = Math.max(0, this.selectedHelpTopic - 1);
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        this.selectedHelpTopic = Math.min(this.helpTopics.length - 1, this.selectedHelpTopic + 1);
      } else if ((key === 'Enter' || key === ' ') && this.helpTopics.length > 0) {
        this.contentPage = 0;
        this.page = 'help-content';
      }
    } else if (this.page === 'help-content' || this.page === 'about') {
      const pages = this.page === 'about'
        ? this.aboutPages
        : this.helpTopics[this.selectedHelpTopic]?.pages ?? [];
      if (key === 'Escape' || key === 'Backspace') {
        this.page = this.page === 'about' ? 'menu' : 'help';
      } else if ((key === 'ArrowUp' || key.toLowerCase() === 'w') && this.contentPage > 0) {
        this.contentPage -= 1;
      } else if ((key === 'ArrowDown' || key.toLowerCase() === 's') && this.contentPage + 1 < pages.length) {
        this.contentPage += 1;
      }
    } else if (this.page === 'load-game') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'menu';
      } else if (key.toLowerCase() === 'i') {
        this.chooseSourceRmsPackage();
        return;
      } else if (key.toLowerCase() === 'e') {
        this.exportSelectedSourceRmsPackage();
        return;
      } else if ((key === 'ArrowUp' || key.toLowerCase() === 'w') && this.savedGames.length > 0) {
        this.selectedSaveIndex = (this.selectedSaveIndex + this.savedGames.length - 1) % this.savedGames.length;
      } else if ((key === 'ArrowDown' || key.toLowerCase() === 's') && this.savedGames.length > 0) {
        this.selectedSaveIndex = (this.selectedSaveIndex + 1) % this.savedGames.length;
      } else if ((key === 'Enter' || key === ' ') && this.savedGames.length > 0) {
        this.loadSelectedGame();
        return;
      }
    } else if (this.page === 'exit-confirm') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'menu';
      } else if (key === 'Enter' || key === ' ') {
        this.exitGame();
      }
    } else if (this.page === 'hero') {
      if (key === 'Escape' || key === 'Backspace' || key === 'ArrowLeft') {
        this.page = 'menu';
      } else if (key === 'Enter' || key === ' ') {
        this.selectedGuardian = 0;
        this.selectedGuardians.clear();
        this.page = 'guardians';
      }
    } else if (this.page === 'guardians') {
      if (key === 'Escape' || key === 'Backspace' || key === 'ArrowLeft') {
        this.page = 'hero';
      } else if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        this.selectedGuardian = (this.selectedGuardian + GUARDIANS.length - 1) % GUARDIANS.length;
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        this.selectedGuardian = (this.selectedGuardian + 1) % GUARDIANS.length;
      } else if (key === 'Enter' || key === ' ') {
        if (this.selectedGuardians.has(this.selectedGuardian)) {
          this.selectedGuardians.delete(this.selectedGuardian);
        } else if (this.selectedGuardians.size < 2) {
          this.selectedGuardians.add(this.selectedGuardian);
          if (this.selectedGuardians.size === 2) {
            this.page = 'confirm';
            this.confirmYes = false;
          }
        }
      }
    } else if (this.page === 'confirm') {
      if (key === 'Escape' || key === 'Backspace') {
        this.page = 'guardians';
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 's'].includes(key)) {
        this.confirmYes = !this.confirmYes;
      } else if (key === 'Enter' || key === ' ') {
        if (this.confirmYes) this.beginNewGame();
        else {
          this.page = 'guardians';
          this.selectedGuardians.clear();
        }
      }
    }
    this.renderPage();
  }

  private selectMenuOption(): void {
    switch (this.selectedMenu) {
      case 0:
        this.page = 'hero';
        this.renderPage();
        break;
      case 1:
        this.beginLoadGame();
        break;
      case 2:
        this.page = 'options';
        this.selectedOption = 0;
        this.renderPage();
        break;
      case 3:
        this.selectedHelpTopic = 0;
        this.page = 'help';
        this.renderPage();
        break;
      case 4:
        this.contentPage = 0;
        this.page = 'about';
        this.renderPage();
        break;
      case 5:
        this.page = 'exit-confirm';
        this.renderPage();
        break;
    }
  }

  private exitGame(): void {
    gameMusic.setEnabled(false);
    try {
      window.close();
    } catch {
      // Browsers can refuse to close a tab that was not opened by this page.
    }
    this.page = 'exit';
    this.renderPage();
  }

  private showNotice(message: string): void {
    const context = this.context;
    if (context === null) return;
    this.drawMenu();
    this.drawText(message, 120, 250, '#ffffff');
    this.canvasTexture?.refresh();
  }

  private beginNewGame(): void {
    this.page = 'loading';
    this.renderPage();
    const guardianIndices = [...this.selectedGuardians].sort((first, second) => first - second);
    this.loadGameplayScenesAndStart({
      startRoute: 'new-game',
      guardianIndices,
      heroClassId: RONIN_HERO_CLASS_ID,
    });
  }

  private beginLoadGame(): void {
    this.loadGameMessage = '';
    try {
      this.savedGames = readGameSaves(window.localStorage);
    } catch {
      this.savedGames = [];
    }
    if (this.savedGames.length === 0) this.loadGameMessage = 'No saved game. Import a source record package.';
    this.selectedSaveIndex = Math.max(0, Math.min(this.selectedSaveIndex, this.savedGames.length - 1));
    this.page = 'load-game';
    this.renderPage();
  }

  private loadSelectedGame(): void {
    const saveState = this.savedGames[this.selectedSaveIndex];
    if (saveState === undefined) {
      this.page = 'menu';
      this.renderPage();
      return;
    }
    this.page = 'loading';
    this.renderPage();
    this.loadGameplayScenesAndStart({
      startRoute: 'load-game',
      saveState,
    });
  }

  private chooseSourceRmsPackage(): void {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.hlrms.json,application/json';
    picker.setAttribute('aria-label', 'Import a Heroes Lore source RMS record-pair package');
    picker.style.position = 'fixed';
    picker.style.left = '-10000px';
    const cleanup = (): void => picker.remove();
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      cleanup();
      if (file !== undefined) void this.importSourceRmsFile(file);
    }, { once: true });
    picker.addEventListener('cancel', cleanup, { once: true });
    document.body.append(picker);
    picker.click();
  }

  private async importSourceRmsFile(file: File): Promise<void> {
    try {
      const { importSourceRmsPackage, SOURCE_RMS_PACKAGE_MAX_TEXT_LENGTH } =
        await import('./source-rms-package');
      if (file.size > SOURCE_RMS_PACKAGE_MAX_TEXT_LENGTH) {
        throw new TypeError('Source RMS package is too large');
      }
      const response = await fetch('/assets/generated/equipment-data/catalog.json');
      if (!response.ok) throw new TypeError('Equipment catalog is unavailable');
      const catalog: EquipmentDataTable = parseEquipmentDataTable(await response.json());
      const imported = importSourceRmsPackage(await file.text(), catalog, { savedAt: Date.now() });
      writeGameSave(window.localStorage, imported);
      this.savedGames = readGameSaves(window.localStorage);
      const matchingIndex = this.savedGames.findIndex((save) => save.heroClassId === imported.heroClassId);
      if (matchingIndex >= 0) this.selectedSaveIndex = matchingIndex;
      this.loadGameMessage = 'Source save imported. Press Enter to load it.';
    } catch {
      this.loadGameMessage = 'Import failed: unsupported or unreadable source records.';
    }
    this.renderPage();
  }

  private async exportSelectedSourceRmsPackage(): Promise<void> {
    const save = this.savedGames[this.selectedSaveIndex];
    if (save === undefined) {
      this.loadGameMessage = 'Select a saved game to export.';
      this.renderPage();
      return;
    }
    try {
      const { serializeSourceRmsPackage } = await import('./source-rms-package');
      const content = serializeSourceRmsPackage(save);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `heroes-lore-v2.1.2-class-${save.heroClassId}.hlrms.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      this.loadGameMessage = `Exported ${HERO_CLASS_FALLBACK_NAMES[save.heroClassId]} source records.`;
    } catch {
      this.loadGameMessage = 'Source save export is unavailable in this browser.';
    }
    this.renderPage();
  }

  private loadGameplayScenesAndStart(data: object): void {
    const sceneModules = Promise.all([
      import('../rendering/WorldScene'),
      import('../rendering/EndingScene'),
    ]);
    this.time.delayedCall(900, () => {
      void sceneModules.then(([worldModule, endingModule]) => {
        const manager = this.scene.manager;
        if (manager.keys.WorldScene === undefined) {
          this.scene.add('WorldScene', worldModule.WorldScene);
        }
        if (manager.keys.EndingScene === undefined) {
          this.scene.add('EndingScene', endingModule.EndingScene);
        }
        this.scene.start('WorldScene', data);
      }).catch(() => {
        this.page = 'menu';
        this.renderPage();
        this.showNotice('The game could not be loaded. Please try again.');
      });
    });
  }

  private renderPage(): void {
    const context = this.context;
    if (context === null) return;
    context.clearRect(0, 0, 240, 320);
    if (this.page === 'brand-splash') this.drawBrandSplash();
    else if (this.page === 'title-splash') this.drawTitleSplash();
    else if (this.page === 'menu') this.drawMenu();
    else if (this.page === 'options') this.drawOptions();
    else if (this.page === 'help') this.drawHelpMenu();
    else if (this.page === 'help-content') {
      this.drawTextPage(this.helpTopics[this.selectedHelpTopic]?.title ?? '', this.helpTopics[this.selectedHelpTopic]?.pages ?? []);
    } else if (this.page === 'about') this.drawTextPage('About', this.aboutPages);
    else if (this.page === 'load-game') this.drawLoadGame();
    else if (this.page === 'exit-confirm') this.drawExitConfirmation();
    else if (this.page === 'exit') this.drawExitPage();
    else if (this.page === 'hero') this.drawHeroSelection();
    else if (this.page === 'guardians') this.drawGuardianSelection(false);
    else if (this.page === 'confirm') this.drawGuardianSelection(true);
    else this.drawLoading();
    this.canvasTexture?.refresh();
  }

  private drawBrandSplash(): void {
    const context = this.context!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 240, 320);
    const logo = this.textures.get('source-brand-logo').getSourceImage() as HTMLImageElement;
    const y = this.brandSplashFrame.logoCenterY - this.brandSplashFrame.logoOffsetY;
    context.drawImage(
      logo,
      120 - logo.naturalWidth / 2,
      y - logo.naturalHeight / 2,
    );
  }

  private drawTitleSplash(): void {
    const context = this.context!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 240, 320);
    const drawSourceImage = (index: number, x: number, y: number): void => {
      const image = this.textures.get(`source-title-${index}`).getSourceImage() as CanvasImageSource;
      context.drawImage(image, x, y);
    };

    // These three source components form the title mark in `bf.paint()` state 1.
    drawSourceImage(2, 60, 117);
    drawSourceImage(3, 112, 117);
    drawSourceImage(4, 153, 94);
  }

  private drawMenu(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawPanel(PANEL_X, PANEL_Y, 4);
    this.drawUi(18, Math.floor((PANEL_X + 155 - 109) / 2), 100 + this.selectedMenu * 16);
    for (let index = 0; index < STARTUP_MENU_STRING_IDS.length; index += 1) {
      const label = this.localizedText(STARTUP_MENU_STRING_IDS[index]);
      this.drawText(
        label,
        120,
        107 + index * 16,
        index === this.selectedMenu ? '#ffffff' : '#000000',
      );
    }
    this.drawSoftKeys('OK', 'Exit');
  }

  private drawHelpMenu(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    this.drawText(this.localizedText(2351), 120, 84, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);
    this.helpTopics.forEach((topic, index) => {
      const y = 126 + index * 15;
      if (index === this.selectedHelpTopic) {
        context.strokeStyle = '#ff7b00';
        context.strokeRect(65, y - 3, 103, 13);
      }
      this.drawText(topic.title, 120, y, '#000000');
    });
    this.drawSoftKeys('OK', 'Back');
  }

  private drawLoadGame(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    const title = this.localizedText(STARTUP_MENU_STRING_IDS[1]) || 'Load Game';
    this.drawText(title, 120, 84, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);

    this.savedGames.forEach((save, index) => {
      const centerY = 147 + index * 16;
      if (index === this.selectedSaveIndex) {
        context.strokeStyle = '#ff7b00';
        context.lineWidth = 2;
        context.strokeRect(49, centerY - 8, 68, 16);
        context.lineWidth = 1;
      }
      const name = this.localizedText(HERO_CLASS_NAME_STRING_IDS[save.heroClassId]) ||
        HERO_CLASS_FALLBACK_NAMES[save.heroClassId];
      this.drawText(name, 56, centerY - 3, '#000000', 'left');
    });
    if (this.savedGames.length === 0) {
      this.drawText('No saved game is available.', 83, 150, '#000000', 'left');
    }
    const selected = this.savedGames[this.selectedSaveIndex];
    if (selected !== undefined) {
      const faceKey = selected.heroClassId === 6
        ? 'ronin-face'
        : `source-save-face-${selected.heroClassId}`;
      const face = this.textures.get(faceKey).getSourceImage() as CanvasImageSource;
      context.drawImage(face, 128, 151);
      this.drawText(`Lv ${selected.hud.level}`, 56, 202, '#000000', 'left');
      this.drawText(`${sourceSaveCompletionPercent(selected)}%`, 56, 216, '#000000', 'left');
    }
    this.drawText('I: Import Package', 76, 250, '#000000');
    this.drawText('E: Export Selected', 166, 250, '#000000');
    if (this.loadGameMessage !== '') this.drawText(this.loadGameMessage, 120, 273, '#000000');
    this.drawSoftKeys('Import', 'Back');
  }

  private drawTextPage(title: string, pages: string[]): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    this.drawText(title, 120, 84, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);

    const currentPage = pages[this.contentPage] ?? pages[0] ?? '';
    currentPage.split('\n').forEach((line, index) => {
      if (index < 11 && line.length > 0) this.drawText(line, 55, 119 + index * 10, '#000000', 'left');
    });
    if (pages.length > 1) {
      this.drawText(`${this.contentPage + 1}/${pages.length}`, 178, 108, '#000000', 'right');
    }
    this.drawSoftKeys('', 'Back');
  }

  private drawExitConfirmation(): void {
    this.drawMenu();
    const context = this.context!;
    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#624f3f';
    context.fillRect(30, 121, 180, 78);
    context.strokeStyle = '#fff3cf';
    context.strokeRect(30, 121, 180, 78);
    context.fillStyle = '#000000';
    context.fillRect(33, 124, 174, 72);
    this.drawText(this.localizedText(2332), 120, 136, '#ffffff');
    this.drawSoftKeys(this.localizedText(2343), this.localizedText(2344));
  }

  private drawExitPage(): void {
    const context = this.context!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 240, 320);
    this.drawText('You can close this tab to leave the game.', 120, 151, '#000000');
  }

  private localizedText(id: number): string {
    const strings = (this.startupLanguage as { strings?: unknown } | null)?.strings;
    if (!Array.isArray(strings)) return '';
    const entry = strings[id] as { id?: unknown; text?: unknown } | undefined;
    return entry?.id === id && typeof entry.text === 'string' ? entry.text.replaceAll(';', '\n') : '';
  }

  private drawOptions(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    this.drawText('Options', 120, 81, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);
    GAME_OPTION_ROWS.forEach((option, index) => {
      const y = 132 + index * 20;
      const selected = index === this.selectedOption;
      context.strokeStyle = selected ? '#ff7b00' : '#8f785f';
      context.strokeRect(49, y - 8, 142, 15);
      this.drawText(option === 'gameSpeed' ? 'Game' : option[0].toUpperCase() + option.slice(1), 63, y - 4, selected ? '#ffffff' : '#000000', 'left');
      this.drawText(gameOptionValue(this.options, option), 182, y - 4, selected ? '#ffffff' : '#000000', 'right');
    });
    this.drawSoftKeys('Change', 'Back');
  }

  private drawHeroSelection(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    this.drawText('New Game', 120, 81, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);
    this.drawText('Attacking ability is good.', 64, 115, '#000000', 'left');
    this.drawText('Expert with swords', 64, 123, '#000000', 'left');
    this.drawUi(19, 60, 165);
    this.drawText('Ronin', 64, 165, '#000000', 'left');
    this.drawUi('ronin-face', 128, 157);
    this.drawSoftKeys('OK', 'Back');
  }

  private drawGuardianSelection(confirming: boolean): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawTopFrame(PANEL_X, PANEL_Y);
    this.drawText('New Game', 120, 81, '#000000');
    this.drawPanel(PANEL_X, PANEL_Y + 24, 3);

    const selectionLineY = 167;
    this.drawUi(19, 69, selectionLineY);
    for (let index = 0; index < GUARDIANS.length; index += 1) {
      const selected = this.selectedGuardians.has(index);
      const image = this.textures.get(
        selected ? `guardian-selected-${index}` : `guardian-${index}`,
      ).getSourceImage() as CanvasImageSource;
      const width = image instanceof HTMLImageElement ? image.naturalWidth : 17;
      const height = image instanceof HTMLImageElement ? image.naturalHeight : 38;
      const x = 80 + index * 34;
      const y = (selected ? 146 : 139) + (index === this.selectedGuardian && !confirming ? 1 : 0);
      context.drawImage(image, Math.round(x - width / 2), Math.round(y - height / 2));
      if (!confirming && index === this.selectedGuardian) {
        this.drawUi(20, 77 + index * 34, 158);
      }
    }

    if (confirming) {
      this.drawText('ARE YOU SURE?', 69, 190, '#000000', 'left');
      this.drawUi(17, 118 + (this.confirmYes ? 0 : 28), 203);
      this.drawText('YES', 122, 207, this.confirmYes ? '#ffffff' : '#000000', 'left');
      this.drawText('NO', 150, 207, this.confirmYes ? '#000000' : '#ffffff', 'left');
    } else {
      const item = GUARDIANS[this.selectedGuardian];
      this.drawText(item.name, 69, 179, '#000000', 'left');
      item.description.forEach((line, index) => {
        this.drawText(line, 69, 194 + index * 8, '#000000', 'left');
      });
    }
    this.drawSoftKeys('OK', 'Back');
  }

  private drawLoading(): void {
    const context = this.context!;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 240, 320);
    this.drawText('NOW LOADING', 120, 157, '#ffffff');
  }

  private drawPanel(x: number, y: number, rows: number): void {
    const context = this.context!;
    this.drawUi(3, x, y);
    for (let offset = 0, tileX = x + 12; offset < 4; offset += 1, tileX += 32) {
      this.drawUi(4, tileX, y);
    }
    this.drawUi(5, x + 140, y);
    this.drawUi(6, x, y + 12);
    for (let offset = 0, tileX = x + 12; offset < 4; offset += 1, tileX += 32) {
      this.drawUi(7, tileX, y + 12);
    }
    this.drawUi(8, x + 140, y + 12);
    for (let offset = 0; offset < rows + 1; offset += 1) {
      this.drawUi(9, x, y + 36 + offset * 24);
      this.drawUi(10, x + 140, y + 36 + offset * 24);
    }
    context.fillStyle = '#ffcb79';
    context.fillRect(x + 12, y + 36, 128, (rows + 1) * 24);
    this.drawBottomFrame(x, y + 36 + (rows + 1) * 24);
  }

  private drawTopFrame(x: number, y: number): void {
    this.drawUi(0, x, y);
    this.drawUi(1, x + 12, y);
    this.drawUi(1, x + 44, y);
    this.drawUi(1, x + 76, y);
    this.drawUi(1, x + 108, y);
    this.drawUi(2, x + 140, y);
    this.drawUi(11, x, y + 12);
    this.drawUi(12, x + 12, y + 12);
    this.drawUi(12, x + 44, y + 12);
    this.drawUi(12, x + 76, y + 12);
    this.drawUi(12, x + 108, y + 12);
    this.drawUi(13, x + 140, y + 12);
  }

  private drawBottomFrame(x: number, y: number): void {
    this.drawUi(11, x, y);
    for (let offset = 0, tileX = x + 12; offset < 4; offset += 1, tileX += 32) {
      this.drawUi(12, tileX, y);
    }
    this.drawUi(13, x + 140, y);
  }

  private drawSoftKeys(left: string, right: string): void {
    const context = this.context!;
    const font = this.fontLayout!;
    const leftWidth = left.length > 0 ? bitmapTextWidth(left, font) : 0;
    const rightWidth = bitmapTextWidth(right, font);
    const y = 310;
    context.fillStyle = '#000000';
    if (left.length > 0) context.fillRect(0, y, leftWidth + 2, font.height + 2);
    context.fillRect(240 - rightWidth - 2, y, rightWidth + 2, font.height + 2);
    if (left.length > 0) this.drawText(left, 1, y + 1, '#ffffff', 'left');
    this.drawText(right, 239, y + 1, '#ffffff', 'right');
  }

  private textWidth(text: string): number {
    return bitmapTextWidth(text, this.fontLayout!);
  }

  private drawText(
    text: string,
    x: number,
    y: number,
    color: string,
    align: BitmapTextAlignment = 'center',
  ): void {
    const context = this.context!;
    const font = this.fontLayout!;
    const atlas = this.textures.get('small-font-atlas').getSourceImage() as CanvasImageSource;
    drawBitmapText(context, atlas, font, text, x, y, color, align);
  }

  private drawUi(index: number | 'ronin-face', x: number, y: number): void {
    const context = this.context!;
    const key = index === 'ronin-face' ? 'ronin-face' : `start-ui-${index}`;
    const image = this.textures.get(key).getSourceImage() as CanvasImageSource;
    context.drawImage(image, x, y);
  }
}
