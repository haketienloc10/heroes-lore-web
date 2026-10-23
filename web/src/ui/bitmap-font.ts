export interface BitmapFontData {
  format: 'heroes-lore-bitmap-font-v1';
  height: number;
  spaceAdvance: number;
  letterSpacing: number;
  glyphOffsets: number[];
  atlasWidth: number;
}

export type BitmapTextAlignment = 'left' | 'center' | 'right';

export function bitmapTextWidth(text: string, font: BitmapFontData): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') width += font.spaceAdvance;
    else {
      const index = char.charCodeAt(0) - 33;
      if (index >= 0 && index < 94) {
        width += font.glyphOffsets[index + 1] - font.glyphOffsets[index] - font.letterSpacing;
      }
    }
  }
  return width;
}

/** Draw one source bitmap-font line into a native-size canvas. */
export function drawBitmapText(
  context: CanvasRenderingContext2D,
  atlas: CanvasImageSource,
  font: BitmapFontData,
  text: string,
  x: number,
  y: number,
  color: string,
  alignment: BitmapTextAlignment = 'center',
): void {
  const width = bitmapTextWidth(text, font);
  let destinationX = alignment === 'left' ? x : alignment === 'right' ? x - width : x - width / 2;
  const glyphCanvas = document.createElement('canvas');
  glyphCanvas.height = font.height;
  const glyphContext = glyphCanvas.getContext('2d');
  if (glyphContext === null) return;
  glyphContext.imageSmoothingEnabled = false;
  for (const char of text) {
    if (char === ' ') {
      destinationX += font.spaceAdvance;
      continue;
    }
    const glyphIndex = char.charCodeAt(0) - 33;
    if (glyphIndex < 0 || glyphIndex >= 94) continue;
    const sourceX = font.glyphOffsets[glyphIndex];
    const glyphWidth = font.glyphOffsets[glyphIndex + 1] - sourceX;
    glyphCanvas.width = Math.max(1, glyphWidth);
    glyphContext.clearRect(0, 0, glyphCanvas.width, font.height);
    glyphContext.globalCompositeOperation = 'source-over';
    glyphContext.drawImage(atlas, sourceX, 0, glyphWidth, font.height, 0, 0, glyphWidth, font.height);
    glyphContext.globalCompositeOperation = 'source-in';
    glyphContext.fillStyle = color;
    glyphContext.fillRect(0, 0, glyphWidth, font.height);
    context.drawImage(
      glyphCanvas,
      0,
      0,
      glyphWidth,
      font.height,
      Math.round(destinationX),
      y,
      glyphWidth,
      font.height,
    );
    destinationX += glyphWidth - font.letterSpacing;
  }
}
