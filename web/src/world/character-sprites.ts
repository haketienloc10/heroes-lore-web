export interface CharacterSpritePart {
  x: number;
  y: number;
  mirrored: boolean;
  imageIndex: number;
}

export interface CharacterSpriteRecord {
  sourceOrder: number;
  sourceOffset: number;
  componentSlot: number;
  animationSlot: number;
  /** Raw 0-based direction slot from the JAR resource. */
  direction: number;
  frames: CharacterSpritePart[][];
}

export interface CharacterSpriteLayout {
  format: 'heroes-lore-character-sprite-layout-v1';
  nestedFrames: boolean;
  records: CharacterSpriteRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function isSignedByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= -128 && Number(value) <= 127;
}

export function parseCharacterSpriteLayout(value: unknown): CharacterSpriteLayout {
  if (!isRecord(value) || value.format !== 'heroes-lore-character-sprite-layout-v1') {
    throw new TypeError('Unsupported character sprite layout format');
  }
  if (typeof value.nestedFrames !== 'boolean' || !Array.isArray(value.records)) {
    throw new TypeError('Character sprite layout header is invalid');
  }

  const records = value.records.map((rawRecord, recordIndex): CharacterSpriteRecord => {
    if (!isRecord(rawRecord)) {
      throw new TypeError(`Sprite record ${recordIndex} must be an object`);
    }
    const { sourceOrder, sourceOffset, componentSlot, animationSlot, direction, frames } = rawRecord;
    if (!Number.isInteger(sourceOrder) || Number(sourceOrder) < 0 ||
      !Number.isInteger(sourceOffset) || Number(sourceOffset) < 0 ||
      !isByte(componentSlot) || !isByte(animationSlot) || !Number.isInteger(direction) ||
      Number(direction) < 0 || Number(direction) > 3 || !Array.isArray(frames)) {
      throw new TypeError(`Sprite record ${recordIndex} has an invalid header`);
    }
    const parsedFrames = frames.map((rawFrame, frameIndex): CharacterSpritePart[] => {
      if (!Array.isArray(rawFrame)) {
        throw new TypeError(`Sprite record ${recordIndex} frame ${frameIndex} must be an array`);
      }
      return rawFrame.map((rawPart, partIndex): CharacterSpritePart => {
        if (!isRecord(rawPart) || !isSignedByte(rawPart.x) || !isSignedByte(rawPart.y) ||
          typeof rawPart.mirrored !== 'boolean' || !isByte(rawPart.imageIndex)) {
          throw new TypeError(
            `Sprite record ${recordIndex} frame ${frameIndex} part ${partIndex} is invalid`,
          );
        }
        return {
          x: rawPart.x,
          y: rawPart.y,
          mirrored: rawPart.mirrored,
          imageIndex: rawPart.imageIndex,
        };
      });
    });

    return {
      sourceOrder: Number(sourceOrder),
      sourceOffset: Number(sourceOffset),
      componentSlot: Number(componentSlot),
      animationSlot: Number(animationSlot),
      direction: Number(direction),
      frames: parsedFrames,
    };
  });

  return {
    format: 'heroes-lore-character-sprite-layout-v1',
    nestedFrames: value.nestedFrames,
    records,
  };
}

/** Find one component layout using the source's animation and raw direction slots. */
export function findSpriteRecord(
  layout: CharacterSpriteLayout,
  componentSlot: number,
  animationSlot: number,
  direction: number,
): CharacterSpriteRecord | undefined {
  return layout.records.find((record) =>
    record.componentSlot === componentSlot &&
    record.animationSlot === animationSlot &&
    record.direction === direction,
  );
}
