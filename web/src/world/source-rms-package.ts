import type { EquipmentDataTable } from './equipment-data';
import type { GameSaveState } from './save-data';
import {
  decodeSourceRmsStoresAsGameSave,
  encodeGameSaveAsSourceRmsStores,
  type SourceRmsGameSaveDefaults,
} from './source-rms-game-save';
import { sourceRmsStoreNames, type SourceHeroClassId } from './source-rms-save';

export const SOURCE_RMS_PACKAGE_FORMAT = 'heroes-lore-source-rms-record-pair-v1';
export const SOURCE_RMS_PACKAGE_MAX_TEXT_LENGTH = 1_000_000;

export interface SourceRmsPackage {
  format: typeof SOURCE_RMS_PACKAGE_FORMAT;
  heroClassId: SourceHeroClassId;
  primaryStoreName: '_k' | '_s' | '_w';
  primaryRecordHex: string;
  specialStoreName: '_o';
  specialRecordHex: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: unknown, label: string): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(value) || value.length > SOURCE_RMS_PACKAGE_MAX_TEXT_LENGTH) {
    throw new TypeError(`${label} must be a non-empty hexadecimal record`);
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Package the exact source-encrypted records without reading browser storage. */
export function createSourceRmsPackage(save: GameSaveState): SourceRmsPackage {
  const stores = encodeGameSaveAsSourceRmsStores(save);
  return {
    format: SOURCE_RMS_PACKAGE_FORMAT,
    heroClassId: stores.heroClassId,
    primaryStoreName: stores.primaryStoreName,
    primaryRecordHex: bytesToHex(stores.primaryRecord),
    specialStoreName: stores.specialStoreName,
    specialRecordHex: bytesToHex(stores.specialRecord),
  };
}

/** Validate a portable pair and its class-specific native store names. */
export function parseSourceRmsPackage(value: unknown): SourceRmsPackage {
  if (!isRecord(value) || value.format !== SOURCE_RMS_PACKAGE_FORMAT ||
    (value.heroClassId !== 6 && value.heroClassId !== 7 && value.heroClassId !== 8)) {
    throw new TypeError('Unsupported source RMS record-pair package');
  }
  const storeNames = sourceRmsStoreNames(value.heroClassId);
  if (value.primaryStoreName !== storeNames.primary || value.specialStoreName !== storeNames.special) {
    throw new TypeError('Source RMS record-pair store names do not match the hero class');
  }
  const primaryRecord = hexToBytes(value.primaryRecordHex, 'Primary RMS record');
  const specialRecord = hexToBytes(value.specialRecordHex, 'Special RMS record');
  return {
    format: SOURCE_RMS_PACKAGE_FORMAT,
    heroClassId: value.heroClassId,
    primaryStoreName: storeNames.primary,
    primaryRecordHex: bytesToHex(primaryRecord),
    specialStoreName: storeNames.special,
    specialRecordHex: bytesToHex(specialRecord),
  };
}

export function serializeSourceRmsPackage(save: GameSaveState): string {
  return JSON.stringify(createSourceRmsPackage(save), null, 2);
}

/** Convert an explicitly selected package into a web save, applying only RMS-absent defaults. */
export function importSourceRmsPackage(
  text: string,
  equipmentCatalog: EquipmentDataTable,
  defaults: SourceRmsGameSaveDefaults,
): GameSaveState {
  if (text.length > SOURCE_RMS_PACKAGE_MAX_TEXT_LENGTH) {
    throw new TypeError('Source RMS package is too large');
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Source RMS package is not valid JSON');
  }
  const packaged = parseSourceRmsPackage(parsedJson);
  return decodeSourceRmsStoresAsGameSave(
    packaged.heroClassId,
    hexToBytes(packaged.primaryRecordHex, 'Primary RMS record'),
    hexToBytes(packaged.specialRecordHex, 'Special RMS record'),
    equipmentCatalog,
    defaults,
  );
}
