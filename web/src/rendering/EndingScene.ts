import Phaser from 'phaser';
import { drawBitmapText, type BitmapFontData } from '../ui/bitmap-font';
import {
  advanceEndingSequence,
  advanceEndingStoryPage,
  createEndingSequence,
  isEndingHeroClassId,
  resolveEndingTextTable,
  type EndingHeroClassId,
  type EndingSequenceState,
} from '../world/ending';

/** Presents the source character epilogue and shared scrolling credits. */
export class EndingScene extends Phaser.Scene {
  private heroClassId: EndingHeroClassId = 6;
  private fontLayout: BitmapFontData | null = null;
  private sequence: EndingSequenceState | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private texture: Phaser.Textures.CanvasTexture | null = null;
  private startedTitle = false;

  constructor() {
    super({ key: 'EndingScene' });
  }

  init(data: unknown): void {
    const requestedClassId = typeof data === 'object' && data !== null && 'heroClassId' in data
      ? (data as { heroClassId?: unknown }).heroClassId
      : undefined;
    this.heroClassId = isEndingHeroClassId(requestedClassId) ? requestedClassId : 6;
    this.fontLayout = null;
    this.sequence = null;
    this.canvas = null;
    this.context = null;
    this.texture = null;
    this.startedTitle = false;
    for (const key of ['ending-font-layout', 'ending-language', 'ending-story-table', 'ending-credit-table']) {
      if (this.cache.json.exists(key)) this.cache.json.remove(key);
    }
    for (const key of ['ending-font-atlas', 'ending-art']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
  }

  preload(): void {
    const classFile = this.heroClassId.toString();
    const artId = String(this.heroClassId - 6).padStart(3, '0');
    this.load.json('ending-font-layout', '/assets/generated/fonts/small.json');
    this.load.image('ending-font-atlas', '/assets/generated/fonts/small.png');
    this.load.json('ending-language', '/assets/generated/language/en-GB.json');
    this.load.json('ending-story-table', `/assets/generated/text-tables/sgui/ed${classFile}.json`);
    this.load.json('ending-credit-table', '/assets/generated/text-tables/sgui/edsr.json');
    this.load.image('ending-art', `/assets/generated/atlases/img/end/${artId}.png`);
  }

  create(): void {
    this.fontLayout = this.cache.json.get('ending-font-layout') as BitmapFontData;
    try {
      const locale = this.cache.json.get('ending-language') as unknown;
      const storyStrings = resolveEndingTextTable(
        this.cache.json.get('ending-story-table') as unknown,
        locale,
      );
      const creditStrings = resolveEndingTextTable(
        this.cache.json.get('ending-credit-table') as unknown,
        locale,
      );
      this.sequence = createEndingSequence(storyStrings, creditStrings);
    } catch {
      this.add.text(12, 12, 'Ending text is missing or invalid. Run npm run assets:extract.', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '12px',
      });
      return;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = 240;
    this.canvas.height = 320;
    this.context = this.canvas.getContext('2d');
    if (this.context === null || !this.textures.exists('ending-font-atlas') ||
      !this.textures.exists('ending-art')) {
      this.add.text(12, 12, 'Ending images are missing. Run npm run assets:extract.', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '12px',
      });
      return;
    }
    this.context.imageSmoothingEnabled = false;
    if (this.textures.exists('ending-canvas')) this.textures.remove('ending-canvas');
    this.texture = this.textures.addCanvas('ending-canvas', this.canvas);
    if (this.texture === null) return;
    this.add.image(0, 0, this.texture).setOrigin(0, 0);
    this.renderSequence();

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      const onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
      keyboard.on('keydown', onKeyDown);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKeyDown));
    }
    const onPointerDown = (): void => this.advanceStory();
    this.input.on('pointerdown', onPointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off('pointerdown', onPointerDown));
  }

  update(_time: number, delta: number): void {
    if (this.sequence === null || this.startedTitle) return;
    this.sequence = advanceEndingSequence(this.sequence, delta);
    if (this.sequence.phase === 'complete') {
      this.startedTitle = true;
      this.scene.start('StartupFlowScene');
      return;
    }
    this.renderSequence();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.sequence?.phase !== 'story') return;
    event.preventDefault();
    this.advanceStory();
  }

  private advanceStory(): void {
    if (this.sequence?.phase !== 'story') return;
    this.sequence = advanceEndingStoryPage(this.sequence);
    this.renderSequence();
  }

  private renderSequence(): void {
    const context = this.context;
    const font = this.fontLayout;
    const sequence = this.sequence;
    if (context === null || font === null || sequence === null || this.texture === null) return;

    context.clearRect(0, 0, 240, 320);
    if (sequence.phase === 'fade') {
      const shade = Math.round((255 * sequence.fadeFramesRemaining) / 16);
      context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      context.fillRect(0, 0, 240, 320);
    } else if (sequence.phase === 'story') {
      context.fillStyle = '#000000';
      context.fillRect(0, 0, 240, 320);
      const rows = sequence.storyPage.length;
      // The source centers each page using the final _N pause row as well.
      let y = 160 - ((rows + 1) * 15) / 2;
      const atlas = this.textures.get('ending-font-atlas').getSourceImage() as CanvasImageSource;
      for (const entry of sequence.storyPage) {
        const lines = entry.split('\n');
        const top = y + Math.max(0, (15 - lines.length * font.height) / 2);
        lines.forEach((line, index) => {
          drawBitmapText(context, atlas, font, line, 120, top + index * font.height, '#ffffff', 'center');
        });
        y += 15;
      }
    } else if (sequence.phase === 'credits') {
      context.fillStyle = '#000000';
      context.fillRect(0, 0, 240, 320);
      const art = this.textures.get('ending-art').getSourceImage() as CanvasImageSource & {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      };
      const artWidth = art.width ?? art.naturalWidth ?? 1;
      const artHeight = art.height ?? art.naturalHeight ?? 1;
      context.drawImage(art, 0, 160 - artHeight / 2, artWidth, artHeight);
      const atlas = this.textures.get('ending-font-atlas').getSourceImage() as CanvasImageSource;
      for (const line of sequence.creditRoll) {
        const lines = line.text.split('\n');
        const top = line.y + Math.max(0, (line.height - lines.length * font.height) / 2);
        lines.forEach((text, index) => {
          drawBitmapText(context, atlas, font, text, 120, top + index * font.height, '#ffffff', 'center');
        });
      }
    }
    this.texture.refresh();
  }
}

