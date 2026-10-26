import {
  findEquipmentItem,
  parseSourceEquipmentInventoryState,
  type EquipmentDataTable,
  type SourceEquipmentInventoryState,
} from './equipment-data';
import {
  decodeSourceRmsInventoryChunk,
  encodeSourceRmsInventoryChunk,
} from './source-rms-save';
import type { InventoryStack } from './loot';

const SOURCE_ITEM_RECORD_LENGTH = 10;
const MAX_SOURCE_ITEM_CATEGORY = 23;

function sourceSignedByte(value: number): number {
  return value < 0x80 ? value : value - 0x100;
}

function signedByteBits(value: number, label: string): number {
  if (!Number.isInteger(value) || value < -0x80 || value > 0x7f) {
    throw new RangeError(`${label} must fit a signed source byte`);
  }
  return value & 0xff;
}

function validateItemIdentity(category: number, itemId: number, count: number): void {
  if (!Number.isInteger(category) || category < 0 || category > MAX_SOURCE_ITEM_CATEGORY) {
    throw new RangeError(`Source item category must be from 0 through ${MAX_SOURCE_ITEM_CATEGORY}`);
  }
  if (!Number.isInteger(itemId) || itemId < 0 || itemId > 0x7f) {
    throw new RangeError('Source item ID must be from 0 through 127');
  }
  if (!Number.isInteger(count) || count < 1 || count > 0x7f) {
    throw new RangeError('Source item count must be from 1 through 127');
  }
}

/** Source `ac.a()` item instance record: category, ID, count, and mutable subtype state. */
export function encodeSourceRmsItemRecord(stack: InventoryStack): Uint8Array {
  validateItemIdentity(stack.category, stack.itemId, stack.count);
  const record = new Uint8Array(SOURCE_ITEM_RECORD_LENGTH);
  record[0] = stack.category;
  record[1] = stack.itemId;
  record[2] = stack.count;

  if (stack.category <= 6) {
    const state = parseSourceEquipmentInventoryState(stack.equipmentState, stack.category);
    if (state === null) throw new TypeError('Source equipment item is missing valid instance state');
    record[3] = state.sourceFlag ? 1 : 0;
    record[4] = signedByteBits(state.upgradeByte, 'Equipment upgrade byte');
    for (let index = 0; index < 4; index += 1) {
      record[5 + index] = signedByteBits(state.bonusValues[index], `Equipment bonus ${index}`);
    }
    if (stack.category <= 2) {
      record[9] = signedByteBits(state.subtypeBytes[2], 'Equipment subtype byte');
    } else if (stack.category === 3) {
      record[9] = signedByteBits(state.subtypeBytes[0], 'Equipment subtype byte');
    }
  } else if (stack.equipmentState !== undefined) {
    throw new TypeError('Non-equipment source item cannot carry equipment instance state');
  }

  return record;
}

/**
 * Decode one occupied source slot. Equipment definitions supply the immutable subtype
 * bytes that `ac.a(byte[])` reloads from `/itm`; the save record overrides the mutable
 * final subtype byte for categories 0–3.
 */
export function decodeSourceRmsItemRecord(
  record: Uint8Array,
  equipmentCatalog?: EquipmentDataTable,
): InventoryStack {
  if (!(record instanceof Uint8Array) || record.length !== SOURCE_ITEM_RECORD_LENGTH) {
    throw new TypeError('Source item record must contain ten bytes');
  }
  const category = sourceSignedByte(record[0]);
  const itemId = sourceSignedByte(record[1]);
  const count = sourceSignedByte(record[2]);
  if (category < 0 || category > MAX_SOURCE_ITEM_CATEGORY || itemId < 0 || count < 1) {
    throw new TypeError('Source item record has an invalid category, ID, or count');
  }

  if (category > 6) return { category, itemId, count };
  const definition = equipmentCatalog === undefined
    ? undefined
    : findEquipmentItem(equipmentCatalog, category, itemId);
  if (definition === undefined) {
    throw new TypeError(`Source equipment definition ${category}:${itemId} is unavailable`);
  }
  const subtypeBytes = definition.subtypeBytes.map(sourceSignedByte);
  if (category <= 2) subtypeBytes[2] = sourceSignedByte(record[9]);
  else if (category === 3) subtypeBytes[0] = sourceSignedByte(record[9]);
  const equipmentState: SourceEquipmentInventoryState = {
    sourceFlag: record[3] === 1,
    upgradeByte: sourceSignedByte(record[4]),
    bonusValues: [
      sourceSignedByte(record[5]),
      sourceSignedByte(record[6]),
      sourceSignedByte(record[7]),
      sourceSignedByte(record[8]),
    ],
    subtypeBytes,
  };
  return { category, itemId, count, equipmentState };
}

export interface SourceRmsInventoryItemsState {
  wallet: number;
  slots: readonly (InventoryStack | null)[];
}

/** Encode inventory slots without compacting gaps, preserving source slot indices. */
export function encodeSourceRmsInventoryItems(state: SourceRmsInventoryItemsState): Uint8Array {
  return encodeSourceRmsInventoryChunk({
    wallet: state.wallet,
    slots: state.slots.map((item) => item === null ? null : encodeSourceRmsItemRecord(item)),
  });
}

/** Restore fixed source slots and reconstruct equipment from the local numeric catalog. */
export function decodeSourceRmsInventoryItems(
  chunk: Uint8Array,
  slotCount: 30 | 15 = 30,
  equipmentCatalog?: EquipmentDataTable,
): SourceRmsInventoryItemsState {
  const source = decodeSourceRmsInventoryChunk(chunk, slotCount);
  return {
    wallet: source.wallet,
    slots: source.slots.map((record) => record === null ? null :
      decodeSourceRmsItemRecord(record, equipmentCatalog)),
  };
}
