export type EquipmentBonusRanges = readonly [readonly [number, number], readonly [number, number],
  readonly [number, number], readonly [number, number]];

export interface EquipmentItemDefinition {
  category: number;
  itemId: number;
  sourceValue: number;
  equipmentByte: number;
  equipmentType: number;
  characteristicFlag: boolean;
  bonusRollCount: number;
  bonusRanges: EquipmentBonusRanges;
  subtypeBytes: number[];
}

export interface EquipmentDataTable {
  categories: EquipmentItemDefinition[][];
}

/** The byte fields serialized by `d.a()` and the category-specific subclasses. */
export interface SourceEquipmentInventoryState {
  sourceFlag: boolean;
  upgradeByte: number;
  bonusValues: [number, number, number, number];
  subtypeBytes: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnsignedByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function isSignedByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= -128 && Number(value) <= 127;
}

function parseItem(value: unknown, category: number, itemId: number): EquipmentItemDefinition {
  if (!isRecord(value) || value.itemId !== itemId || !isUnsignedByte(value.recordTypeCode) ||
    !Number.isInteger(value.sourceValue) || Number(value.sourceValue) < -0x80000000 ||
    Number(value.sourceValue) > 0x7fffffff || !isUnsignedByte(value.equipmentByte) ||
    !isSignedByte(value.equipmentType) || typeof value.characteristicFlag !== 'boolean' ||
    !Number.isInteger(value.bonusRollCount) || Number(value.bonusRollCount) < 0 ||
    Number(value.bonusRollCount) > 4 || !Array.isArray(value.bonusRanges) ||
    value.bonusRanges.length !== 4 || !value.bonusRanges.every((range) => Array.isArray(range) &&
      range.length === 2 && isSignedByte(range[0]) && isSignedByte(range[1]) && range[0] <= range[1]) ||
    !Array.isArray(value.subtypeBytes) || !value.subtypeBytes.every(isUnsignedByte)) {
    throw new TypeError(`Equipment definition ${category}:${itemId} is invalid`);
  }
  const eligibleSlots = value.bonusRanges.filter(([minimum, maximum]) => minimum !== 0 || maximum !== 0).length;
  const expectedSubtypeByteCount = category <= 2 ? 3 : category === 3 ? 1 : 0;
  if (Number(value.bonusRollCount) > eligibleSlots || value.subtypeBytes.length !== expectedSubtypeByteCount) {
    throw new TypeError(`Equipment definition ${category}:${itemId} has inconsistent source data`);
  }
  return {
    category,
    itemId,
    sourceValue: Number(value.sourceValue),
    equipmentByte: Number(value.equipmentByte),
    equipmentType: Number(value.equipmentType),
    characteristicFlag: value.characteristicFlag,
    bonusRollCount: Number(value.bonusRollCount),
    bonusRanges: value.bonusRanges.map((range) => [Number(range[0]), Number(range[1])] as const) as unknown as EquipmentBonusRanges,
    subtypeBytes: [...value.subtypeBytes] as number[],
  };
}

/** Validate the numeric catalog emitted from the local `/itm/00`–`06` tables. */
export function parseEquipmentDataTable(value: unknown): EquipmentDataTable {
  if (!isRecord(value) || value.format !== 'heroes-lore-equipment-catalog-v1' ||
    value.categoryCount !== 7 || !Array.isArray(value.categories) || value.categories.length !== 7) {
    throw new TypeError('Unsupported or incomplete equipment data catalog');
  }
  const categories = value.categories.map((rawCategory, categoryIndex) => {
    if (!isRecord(rawCategory) || rawCategory.format !== 'heroes-lore-equipment-data-v1' ||
      rawCategory.category !== categoryIndex || rawCategory.sourceResource !== `itm/${String(categoryIndex).padStart(2, '0')}` ||
      !Array.isArray(rawCategory.records) || rawCategory.recordCount !== rawCategory.records.length) {
      throw new TypeError(`Equipment category ${categoryIndex} is invalid`);
    }
    return rawCategory.records.map((item, itemId) => parseItem(item, categoryIndex, itemId));
  });
  return { categories };
}

export function findEquipmentItem(
  catalog: EquipmentDataTable,
  category: number,
  itemId: number,
): EquipmentItemDefinition | undefined {
  return catalog.categories[category]?.[itemId];
}

/** Reproduce the enhancement selection in `d.a(byte, byte[], byte[], byte)`. */
export function createSourceEquipmentInventoryState(
  item: EquipmentItemDefinition,
  randomInteger: (minimum: number, maximum: number) => number,
  acquisition: 'event' | 'ground-pickup',
  rollBonuses = true,
): SourceEquipmentInventoryState {
  const bonusValues: [number, number, number, number] = [0, 0, 0, 0];
  if (rollBonuses) {
    let rolled = 0;
    while (rolled < item.bonusRollCount) {
      const slot = randomInteger(0, 3);
      if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
        throw new RangeError('Equipment bonus slot roll must be from 0 through 3');
      }
      const [minimum, maximum] = item.bonusRanges[slot];
      if (bonusValues[slot] !== 0 || minimum === 0 && maximum === 0) continue;
      const value = randomInteger(minimum, maximum);
      if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
        throw new RangeError('Equipment bonus roll must be a signed 32-bit integer');
      }
      // The source stores g.a()'s int result through Java's `i2b` cast.
      bonusValues[slot] = (value << 24) >> 24;
      rolled += 1;
    }
  }
  const hasRange = item.bonusRanges.some(([minimum, maximum]) => minimum !== 0 || maximum !== 0);
  const sourceFlag = acquisition === 'event' || !item.characteristicFlag || !hasRange;
  return {
    sourceFlag,
    upgradeByte: 0,
    bonusValues,
    subtypeBytes: item.subtypeBytes.map((byte) => byte >= 128 ? byte - 256 : byte),
  };
}

export function parseSourceEquipmentInventoryState(
  value: unknown,
  category?: number,
): SourceEquipmentInventoryState | null {
  if (!isRecord(value) || typeof value.sourceFlag !== 'boolean' ||
    !isSignedByte(value.upgradeByte) || !Array.isArray(value.bonusValues) || value.bonusValues.length !== 4 ||
    !value.bonusValues.every(isSignedByte) || !Array.isArray(value.subtypeBytes) ||
    value.subtypeBytes.length > 3 || !value.subtypeBytes.every(isSignedByte)) return null;
  if (category !== undefined) {
    if (!Number.isInteger(category) || category < 0 || category > 6) return null;
    const expectedSubtypeByteCount = category <= 2 ? 3 : category === 3 ? 1 : 0;
    if (value.subtypeBytes.length !== expectedSubtypeByteCount) return null;
  }
  return {
    sourceFlag: value.sourceFlag,
    upgradeByte: value.upgradeByte,
    bonusValues: [...value.bonusValues] as [number, number, number, number],
    subtypeBytes: [...value.subtypeBytes] as number[],
  };
}
