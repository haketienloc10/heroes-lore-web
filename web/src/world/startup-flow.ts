import Phaser from 'phaser';
import {
  bitmapTextWidth,
  drawBitmapText,
  type BitmapFontData,
  type BitmapTextAlignment,
} from '../ui/bitmap-font';
import { readGameSave, type GameSaveState } from './save-data';
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

type StartPage = 'menu' | 'options' | 'hero' | 'guardians' | 'confirm' | 'loading';

const MENU_OPTIONS = ['New Game', 'Load Game', 'Options', 'Help', 'About', 'Exit'];
const GUARDIANS = [
  { name: 'Hestia', description: ['Fire attribute /', 'Attacker'] },
  { name: 'Ran', description: ['Water attribute /', 'Healer'] },
  { name: 'Pyorghin', description: ['Earth attribute /', 'Mixture of Attacker', 'and Healer'] },
];
const PANEL_X = 43;
const PANEL_Y = 75;
const RONIN_HERO_CLASS_ID = 6;

/** Reproduces the title menu and New Game selection screens from v2.1.2. */
export class StartupFlowScene extends Phaser.Scene {
  private page: StartPage = 'menu';
  private selectedMenu = 0;
  private selectedOption = 0;
  private selectedGuardian = 0;
  private selectedGuardians = new Set<number>();
  private confirmYes = false;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private canvasTexture: Phaser.Textures.CanvasTexture | null = null;
  private fontLayout: BitmapFontData | null = null;
  private keydown: ((event: KeyboardEvent) => void) | null = null;
  private savedGame: GameSaveState | null = null;
  private options: GameOptions = { ...DEFAULT_GAME_OPTIONS };
  private pointerDown: (() => void) | null = null;

  constructor() {
    super({ key: 'StartupFlowScene' });
  }

  init(): void {
    this.page = 'menu';
    this.selectedMenu = 0;
    this.selectedOption = 0;
    this.selectedGuardian = 0;
    this.selectedGuardians.clear();
    this.confirmYes = false;
    this.canvas = null;
    this.context = null;
    this.canvasTexture = null;
    this.fontLayout = null;
    this.keydown = null;
    this.savedGame = null;
    this.options = { ...DEFAULT_GAME_OPTIONS };
    this.pointerDown = null;
  }

  preload(): void {
    this.load.json('small-font-layout', '/assets/generated/fonts/small.json');
    this.load.image('small-font-atlas', '/assets/generated/fonts/small.png');
    for (let index = 0; index <= 20; index += 1) {
      this.load.image(
        `start-ui-${index}`,
        `/assets/generated/atlases/sgui/mm/etc/${String(index).padStart(3, '0')}.png`,
      );
    }
    this.load.image('ronin-face', '/assets/generated/atlases/sgui/mm/face/000.png');
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
    try {
      this.savedGame = readGameSave(window.localStorage);
    } catch {
      this.savedGame = null;
    }
    try {
      this.options = readGameOptions(window.localStorage);
    } catch {
      this.options = { ...DEFAULT_GAME_OPTIONS };
    }
    gameMusic.setEnabled(this.options.sound);
    this.selectedMenu = this.savedGame === null ? 0 : 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 240;
    this.canvas.height = 320;
    this.context = this.canvas.getContext('2d');
    if (this.context === null || !this.textures.exists('small-font-atlas')) {
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

    this.pointerDown = (): void => { void gameMusic.activateFromUserGesture(); };
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

  private handleKey(event: KeyboardEvent): void {
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Backspace', 'w', 's'].includes(key)) {
      return;
    }
    event.preventDefault();
    void gameMusic.activateFromUserGesture();
    if (this.page === 'menu') {
      if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
        this.selectedMenu = (this.selectedMenu + MENU_OPTIONS.length - 1) % MENU_OPTIONS.length;
      } else if (key === 'ArrowDown' || key.toLowerCase() === 's') {
        this.selectedMenu = (this.selectedMenu + 1) % MENU_OPTIONS.length;
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
        this.showNotice('Move with the arrow keys. Press Enter to select.');
        break;
      case 4:
        this.showNotice('Heroes Lore v2.1.2');
        break;
      case 5:
        this.showNotice('Use the browser tab to leave the game.');
        break;
    }
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
    this.time.delayedCall(900, () => this.scene.start('WorldScene', {
      startRoute: 'new-game',
      guardianIndices,
      heroClassId: RONIN_HERO_CLASS_ID,
    }));
  }

  private beginLoadGame(): void {
    try {
      this.savedGame = readGameSave(window.localStorage);
    } catch {
      this.savedGame = null;
    }
    if (this.savedGame === null) {
      this.showNotice('No saved game is available.');
      return;
    }
    const saveState = this.savedGame;
    this.page = 'loading';
    this.renderPage();
    this.time.delayedCall(900, () => this.scene.start('WorldScene', {
      startRoute: 'load-game',
      saveState,
    }));
  }

  private renderPage(): void {
    const context = this.context;
    if (context === null) return;
    context.clearRect(0, 0, 240, 320);
    if (this.page === 'menu') this.drawMenu();
    else if (this.page === 'options') this.drawOptions();
    else if (this.page === 'hero') this.drawHeroSelection();
    else if (this.page === 'guardians') this.drawGuardianSelection(false);
    else if (this.page === 'confirm') this.drawGuardianSelection(true);
    else this.drawLoading();
    this.canvasTexture?.refresh();
  }

  private drawMenu(): void {
    const context = this.context!;
    context.fillStyle = '#3f1f3f';
    context.fillRect(0, 0, 240, 320);
    this.drawPanel(PANEL_X, PANEL_Y, 4);
    this.drawUi(18, Math.floor((PANEL_X + 155 - 109) / 2), 100 + this.selectedMenu * 16);
    for (let index = 0; index < MENU_OPTIONS.length; index += 1) {
      this.drawText(
        MENU_OPTIONS[index],
        120,
        107 + index * 16,
        index === this.selectedMenu ? '#ffffff' : '#000000',
      );
    }
    this.drawSoftKeys('OK', 'Exit');
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
    const leftWidth = bitmapTextWidth(left, font);
    const rightWidth = bitmapTextWidth(right, font);
    const y = 310;
    context.fillStyle = '#000000';
    context.fillRect(0, y, leftWidth + 2, font.height + 2);
    context.fillRect(240 - rightWidth - 2, y, rightWidth + 2, font.height + 2);
    this.drawText(left, 1, y + 1, '#ffffff', 'left');
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
