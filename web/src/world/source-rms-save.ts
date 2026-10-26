/** Source `m.o()` save payload layout reconstructed from the local decompiled sources. */

export type SourceHeroClassId = 6 | 7 | 8;

export interface SourceRmsPrimaryChunks {
  player: Uint8Array;
  inventory: Uint8Array;
  flags: Uint8Array;
  location: Uint8Array;
}

export interface SourceRmsPlayerSkill {
  skillId: number;
  rank: number;
  experience: number;
  skillLevelSlotOne: number | null;
  skillLevelSlotThree: number | null;
}

export interface SourceRmsPlayerState {
  completionPoints: number;
  level: number;
  hp: number;
  sp: number;
  experience: number;
  maxHp: number;
  maxSp: number;
  nextExperience: number;
  comboLimit: number;
  attributePoints: number;
  attributes: { power: number; hp: number; agility: number; will: number };
  equipmentSlots: readonly (Uint8Array | null)[];
  skills: readonly (SourceRmsPlayerSkill | null)[];
  activeSkillSlot: number;
  playTimeSeconds: number;
}

export interface SourceRmsInventoryState {
  wallet: number;
  slots: readonly (Uint8Array | null)[];
}

export interface SourceRmsFlagState {
  gameFlags: number[];
  questFlags: number[];
  playthroughMode: number;
}

export interface SourceRmsLocation {
  mapId: number;
  tileX: number;
  tileY: number;
}

export interface SourceRmsStores {
  heroClassId: SourceHeroClassId;
  primaryStoreName: '_k' | '_s' | '_w';
  primaryRecord: Uint8Array;
  specialStoreName: '_o';
  specialRecord: Uint8Array;
}

export interface SourceRmsSaveState {
  heroClassId: SourceHeroClassId;
  player: SourceRmsPlayerState;
  inventory: SourceRmsInventoryState;
  flags: SourceRmsFlagState;
  location: SourceRmsLocation;
  specialInventory: SourceRmsInventoryState;
}

const SOURCE_RMS_KEY = [5, 11, 8, 81, 3, 20] as const;
const FLAG_BYTE_LENGTH = 128;
const FLAG_CHUNK_LENGTH = FLAG_BYTE_LENGTH * 2 + 1;

function assertByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${label} must be an unsigned byte`);
  }
}

function assertI8(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x80 || value > 0x7f) {
    throw new RangeError(`${label} must fit a signed byte`);
  }
}

function assertClassId(heroClassId: number): asserts heroClassId is SourceHeroClassId {
  if (heroClassId !== 6 && heroClassId !== 7 && heroClassId !== 8) {
    throw new RangeError('Source RMS hero class must be 6, 7, or 8');
  }
}

function writeU16(output: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('Source RMS chunk length exceeds its unsigned-short field');
  }
  output.push((value >>> 8) & 0xff, value & 0xff);
}

function writeI16(output: number[], value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`${label} must fit a signed short`);
  }
  const unsigned = value & 0xffff;
  output.push((unsigned >>> 8) & 0xff, unsigned & 0xff);
}

function writeI8(output: number[], value: number, label: string): void {
  assertI8(value, label);
  output.push(value & 0xff);
}

function writeI32(output: number[], value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new RangeError(`${label} must fit a signed int`);
  }
  output.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function readU16(bytes: Uint8Array, offset: number, label: string): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new TypeError(`Truncated ${label} length`);
  return (bytes[offset] << 8) | bytes[offset + 1];
}

/** `bp.a(byte[], key)`: cyclic XOR plus a trailing unsigned checksum byte. */
export function encryptSourceRmsChunk(plain: Uint8Array): Uint8Array {
  if (plain.length > 0xfffe) throw new RangeError('Source RMS chunk is too large');
  const encrypted = new Uint8Array(plain.length + 1);
  let keyIndex = 0;
  let checksum = 0;
  for (let index = 0; index < plain.length; index += 1) {
    keyIndex = (keyIndex + 1) % SOURCE_RMS_KEY.length;
    const keyByte = SOURCE_RMS_KEY[keyIndex];
    encrypted[index] = plain[index] ^ keyByte;
    checksum = (checksum + keyByte) & 0xff;
  }
  encrypted[plain.length] = checksum;
  return encrypted;
}

/** `bp.b(byte[], key)`: validate the source checksum before exposing the bytes. */
export function decryptSourceRmsChunk(encrypted: Uint8Array): Uint8Array {
  if (encrypted.length === 0) throw new TypeError('Source RMS encrypted chunk is empty');
  const plain = new Uint8Array(encrypted.length - 1);
  let keyIndex = 0;
  let checksum = 0;
  for (let index = 0; index < plain.length; index += 1) {
    keyIndex = (keyIndex + 1) % SOURCE_RMS_KEY.length;
    const keyByte = SOURCE_RMS_KEY[keyIndex];
    plain[index] = encrypted[index] ^ keyByte;
    checksum = (checksum + keyByte) & 0xff;
  }
  if (checksum !== encrypted[encrypted.length - 1]) {
    throw new TypeError('Source RMS encrypted chunk checksum does not match');
  }
  return plain;
}

function copyBytes(bytes: Uint8Array, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${label} must be a byte array`);
  return new Uint8Array(bytes);
}

function appendChunk(output: number[], chunk: Uint8Array, label: string): void {
  const encrypted = encryptSourceRmsChunk(copyBytes(chunk, label));
  writeU16(output, encrypted.length);
  for (const byte of encrypted) output.push(byte);
}

function readChunk(bytes: Uint8Array, offset: number, label: string): { chunk: Uint8Array; nextOffset: number } {
  const length = readU16(bytes, offset, label);
  const start = offset + 2;
  const end = start + length;
  if (length === 0 || end > bytes.length) throw new TypeError(`Truncated ${label} chunk`);
  return { chunk: decryptSourceRmsChunk(bytes.slice(start, end)), nextOffset: end };
}

/** Four source chunks in `m.o()` order: player, regular inventory, flags, map/tile. */
export function encodeSourceRmsPrimaryRecord(chunks: SourceRmsPrimaryChunks): Uint8Array {
  const output: number[] = [];
  appendChunk(output, chunks.player, 'Player');
  appendChunk(output, chunks.inventory, 'Inventory');
  appendChunk(output, chunks.flags, 'Flags');
  appendChunk(output, chunks.location, 'Location');
  return Uint8Array.from(output);
}

export function decodeSourceRmsPrimaryRecord(record: Uint8Array): SourceRmsPrimaryChunks {
  if (!(record instanceof Uint8Array)) throw new TypeError('Source RMS primary record must be a byte array');
  const labels = ['Player', 'Inventory', 'Flags', 'Location'] as const;
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const label of labels) {
    const decoded = readChunk(record, offset, label);
    chunks.push(decoded.chunk);
    offset = decoded.nextOffset;
  }
  if (offset !== record.length) throw new TypeError('Source RMS primary record has trailing bytes');
  return {
    player: chunks[0],
    inventory: chunks[1],
    flags: chunks[2],
    location: chunks[3],
  };
}

function validateFixedSlots(
  slots: readonly (Uint8Array | null)[],
  expectedLength: number,
  label: string,
): void {
  if (slots.length !== expectedLength) throw new TypeError(`${label} must contain ${expectedLength} slots`);
  for (const slot of slots) {
    if (slot !== null && (!(slot instanceof Uint8Array) || slot.length !== 10)) {
      throw new TypeError(`${label} entries must be null or ten-byte source item records`);
    }
  }
}

function appendItemSlots(output: number[], slots: readonly (Uint8Array | null)[]): void {
  for (const slot of slots) {
    output.push(slot === null ? 0 : 1);
    if (slot !== null) output.push(...slot);
  }
}

/** Source `an.m26a()` player/equipment/skill state chunk. */
export function encodeSourceRmsPlayerChunk(state: SourceRmsPlayerState): Uint8Array {
  if (state.skills.length !== 5) throw new TypeError('Source player state must have five skill slots');
  validateFixedSlots(state.equipmentSlots, 5, 'Equipment slots');
  const output: number[] = [];
  writeI8(output, state.completionPoints, 'Completion points');
  writeI8(output, state.level, 'Player level');
  for (const [value, label] of [
    [state.hp, 'HP'], [state.sp, 'SP'], [state.experience, 'Experience'],
    [state.maxHp, 'Maximum HP'], [state.maxSp, 'Maximum SP'],
    [state.nextExperience, 'Next experience'],
  ] as const) writeI32(output, value, label);
  writeI8(output, state.comboLimit, 'Combo limit');
  writeI16(output, state.attributePoints, 'Attribute points');
  writeI16(output, state.attributes.power, 'Power');
  writeI16(output, state.attributes.hp, 'HP attribute');
  writeI16(output, state.attributes.agility, 'Agility');
  writeI16(output, state.attributes.will, 'Will');
  appendItemSlots(output, state.equipmentSlots);

  for (const skill of state.skills) {
    output.push(skill === null ? 0 : 1);
    if (skill === null) continue;
    if (!Number.isInteger(skill.skillId) || skill.skillId < 0 || skill.skillId > 5) {
      throw new RangeError('Skill ID must be from 0 through 5');
    }
    output.push(skill.skillId);
    writeI16(output, skill.rank, 'Skill rank');
    writeI32(output, 1, 'Skill record constant');
    writeI32(output, 1, 'Skill record constant');
    writeI32(output, skill.experience, 'Skill experience');
    for (const [level, label] of [
      [skill.skillLevelSlotOne, 'Skill button-1 level'],
      [skill.skillLevelSlotThree, 'Skill button-3 level'],
    ] as const) {
      if (level !== null && (!Number.isInteger(level) || level < 0 || level > 2)) {
        throw new RangeError(`${label} must be null or from 0 through 2`);
      }
      writeI8(output, level ?? -1, label);
    }
  }

  if (!Number.isInteger(state.activeSkillSlot) || state.activeSkillSlot < 0 || state.activeSkillSlot > 4) {
    throw new RangeError('Active skill slot must be from 0 through 4');
  }
  output.push(state.activeSkillSlot);
  writeI32(output, state.playTimeSeconds, 'Play time');
  return Uint8Array.from(output);
}

/** Source `f.m91c()` inventory chunk, used with 30 bag slots or 15 special slots. */
export function encodeSourceRmsInventoryChunk(state: SourceRmsInventoryState): Uint8Array {
  if (state.slots.length !== 30 && state.slots.length !== 15) {
    throw new TypeError('Source inventory must contain 30 regular or 15 special slots');
  }
  validateFixedSlots(state.slots, state.slots.length, 'Inventory slots');
  const output: number[] = [];
  writeI32(output, state.wallet, 'Wallet');
  appendItemSlots(output, state.slots);
  return Uint8Array.from(output);
}

function readI32(view: DataView, offset: number, label: string): number {
  if (offset + 4 > view.byteLength) throw new TypeError(`Truncated ${label}`);
  return view.getInt32(offset, false);
}

/** Decode source player fields, preserving ten-byte item records as opaque bytes. */
export function decodeSourceRmsPlayerChunk(chunk: Uint8Array): SourceRmsPlayerState {
  if (!(chunk instanceof Uint8Array)) throw new TypeError('Source RMS player chunk must be a byte array');
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  let offset = 0;
  const takeByte = (label: string): number => {
    if (offset >= view.byteLength) throw new TypeError(`Truncated ${label}`);
    return view.getUint8(offset++);
  };
  const takeI8 = (label: string): number => {
    if (offset >= view.byteLength) throw new TypeError(`Truncated ${label}`);
    return view.getInt8(offset++);
  };
  const takeI16 = (label: string): number => {
    if (offset + 2 > view.byteLength) throw new TypeError(`Truncated ${label}`);
    const value = view.getInt16(offset, false);
    offset += 2;
    return value;
  };
  const takeI32 = (label: string): number => {
    const value = readI32(view, offset, label);
    offset += 4;
    return value;
  };
  const completionPoints = takeI8('completion points');
  const level = takeI8('player level');
  const hp = takeI32('HP');
  const sp = takeI32('SP');
  const experience = takeI32('experience');
  const maxHp = takeI32('maximum HP');
  const maxSp = takeI32('maximum SP');
  const nextExperience = takeI32('next experience');
  const comboLimit = takeI8('combo limit');
  const attributePoints = takeI16('attribute points');
  const attributes = {
    power: takeI16('Power'),
    hp: takeI16('HP attribute'),
    agility: takeI16('Agility'),
    will: takeI16('Will'),
  };
  const equipmentSlots: Array<Uint8Array | null> = [];
  for (let slot = 0; slot < 5; slot += 1) {
    const present = takeByte(`equipment slot ${slot}`);
    if (present === 0) equipmentSlots.push(null);
    else {
      if (offset + 10 > view.byteLength) throw new TypeError(`Truncated equipment slot ${slot}`);
      equipmentSlots.push(chunk.slice(offset, offset + 10));
      offset += 10;
    }
  }
  const skills: Array<SourceRmsPlayerSkill | null> = [];
  for (let slot = 0; slot < 5; slot += 1) {
    const present = takeByte(`skill slot ${slot}`);
    if (present === 0) {
      skills.push(null);
      continue;
    }
    const skillId = takeI8(`skill ID ${slot}`);
    if (skillId < 0 || skillId > 5) throw new TypeError(`Invalid source skill ID in slot ${slot}`);
    const rank = takeI16(`skill rank ${slot}`);
    takeI32(`skill constant ${slot}`);
    takeI32(`skill constant ${slot}`);
    const skillExperience = takeI32(`skill experience ${slot}`);
    const buttonOneLevel = takeI8(`skill button-1 level ${slot}`);
    const buttonThreeLevel = takeI8(`skill button-3 level ${slot}`);
    if (![buttonOneLevel, buttonThreeLevel].every((level) => level === -1 || level >= 0 && level <= 2)) {
      throw new TypeError(`Invalid skill level pointer in slot ${slot}`);
    }
    skills.push({
      skillId,
      rank,
      experience: skillExperience,
      skillLevelSlotOne: buttonOneLevel === -1 ? null : buttonOneLevel,
      skillLevelSlotThree: buttonThreeLevel === -1 ? null : buttonThreeLevel,
    });
  }
  const activeSkillSlot = takeByte('active skill slot');
  if (activeSkillSlot > 4) throw new TypeError('Invalid source active skill slot');
  const playTimeSeconds = takeI32('play time');
  if (offset !== view.byteLength) throw new TypeError('Source RMS player chunk has trailing bytes');
  return {
    completionPoints,
    level,
    hp,
    sp,
    experience,
    maxHp,
    maxSp,
    nextExperience,
    comboLimit,
    attributePoints,
    attributes,
    equipmentSlots,
    skills,
    activeSkillSlot,
    playTimeSeconds,
  };
}

export function decodeSourceRmsInventoryChunk(chunk: Uint8Array, slotCount: 30 | 15 = 30): SourceRmsInventoryState {
  if (!(chunk instanceof Uint8Array)) throw new TypeError('Source RMS inventory chunk must be a byte array');
  if (slotCount !== 30 && slotCount !== 15) {
    throw new RangeError('Source inventory slot count must be 30 regular or 15 special slots');
  }
  if (chunk.length < 4) throw new TypeError('Truncated source inventory wallet');
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const wallet = view.getInt32(0, false);
  const slots: Array<Uint8Array | null> = [];
  let offset = 4;
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (offset >= chunk.length) throw new TypeError(`Truncated inventory slot ${slot} marker`);
    const present = chunk[offset++];
    if (present === 0) slots.push(null);
    else {
      if (offset + 10 > chunk.length) throw new TypeError(`Truncated inventory slot ${slot}`);
      slots.push(chunk.slice(offset, offset + 10));
      offset += 10;
    }
  }
  if (offset !== chunk.length) throw new TypeError('Source inventory chunk has trailing bytes');
  return { wallet, slots };
}

/** The separate `/o` record is a two-byte length followed by one encrypted chunk. */
export function encodeSourceRmsSpecialRecord(inventory: Uint8Array): Uint8Array {
  const encrypted = encryptSourceRmsChunk(copyBytes(inventory, 'Special inventory'));
  const output: number[] = [];
  writeU16(output, encrypted.length);
  for (const byte of encrypted) output.push(byte);
  return Uint8Array.from(output);
}

export function decodeSourceRmsSpecialRecord(record: Uint8Array): Uint8Array {
  if (!(record instanceof Uint8Array)) throw new TypeError('Source RMS special record must be a byte array');
  const length = readU16(record, 0, 'Special inventory');
  if (length === 0 || length + 2 !== record.length) {
    throw new TypeError('Source RMS special record has an invalid length');
  }
  return decryptSourceRmsChunk(record.slice(2));
}

/** Source `/k`, `/s`, `/w` store names are selected by hero class. */
export function sourceRmsStoreNames(heroClassId: number): {
  primary: '_k' | '_s' | '_w';
  special: '_o';
} {
  assertClassId(heroClassId);
  return {
    primary: heroClassId === 6 ? '_k' : heroClassId === 7 ? '_s' : '_w',
    special: '_o',
  };
}

/** Source `m.m104a()`: 1024 game bits, 1024 quest bits, then the mode byte. */
export function encodeSourceRmsFlags(
  gameFlags: readonly number[],
  questFlags: readonly number[],
  playthroughMode: number,
): Uint8Array {
  assertI8(playthroughMode, 'Playthrough mode');
  const chunk = new Uint8Array(FLAG_CHUNK_LENGTH);
  for (const [flags, baseOffset, label] of [
    [gameFlags, 0, 'Game'],
    [questFlags, FLAG_BYTE_LENGTH, 'Quest'],
  ] as const) {
    for (const flag of flags) {
      if (!Number.isInteger(flag) || flag < 0 || flag >= FLAG_BYTE_LENGTH * 8) {
        throw new RangeError(`${label} flag must be from 0 through 1023`);
      }
      chunk[baseOffset + Math.floor(flag / 8)] |= 1 << (flag % 8);
    }
  }
  chunk[FLAG_CHUNK_LENGTH - 1] = playthroughMode & 0xff;
  return chunk;
}

export function decodeSourceRmsFlags(chunk: Uint8Array): SourceRmsFlagState {
  if (!(chunk instanceof Uint8Array) || chunk.length !== FLAG_CHUNK_LENGTH) {
    throw new TypeError('Source RMS flags chunk must contain 257 bytes');
  }
  const readFlags = (baseOffset: number): number[] => {
    const flags: number[] = [];
    for (let index = 0; index < FLAG_BYTE_LENGTH * 8; index += 1) {
      if ((chunk[baseOffset + Math.floor(index / 8)] & (1 << (index % 8))) !== 0) flags.push(index);
    }
    return flags;
  };
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return {
    gameFlags: readFlags(0),
    questFlags: readFlags(FLAG_BYTE_LENGTH),
    playthroughMode: view.getInt8(FLAG_CHUNK_LENGTH - 1),
  };
}

/** Source save stores map ID and tile X/Y as three consecutive bytes. */
export function encodeSourceRmsLocation(location: SourceRmsLocation): Uint8Array {
  assertByte(location.mapId, 'Map ID');
  assertByte(location.tileX, 'Tile X');
  assertByte(location.tileY, 'Tile Y');
  return Uint8Array.of(location.mapId, location.tileX, location.tileY);
}

export function decodeSourceRmsLocation(chunk: Uint8Array): SourceRmsLocation {
  if (!(chunk instanceof Uint8Array) || chunk.length !== 3) {
    throw new TypeError('Source RMS location chunk must contain three bytes');
  }
  return { mapId: chunk[0], tileX: chunk[1], tileY: chunk[2] };
}

/** Package primary and `/o` records using the source class-specific stores. */
export function encodeSourceRmsStores(
  heroClassId: number,
  chunks: SourceRmsPrimaryChunks,
  specialInventory: SourceRmsInventoryState,
): SourceRmsStores {
  assertClassId(heroClassId);
  if (specialInventory.slots.length !== 15) {
    throw new TypeError('Source special inventory must contain 15 slots');
  }
  const names = sourceRmsStoreNames(heroClassId);
  return {
    heroClassId,
    primaryStoreName: names.primary,
    primaryRecord: encodeSourceRmsPrimaryRecord(chunks),
    specialStoreName: names.special,
    specialRecord: encodeSourceRmsSpecialRecord(encodeSourceRmsInventoryChunk(specialInventory)),
  };
}

/** Encode a structured source save into its class-specific primary and `/o` records. */
export function encodeSourceRmsSaveState(state: SourceRmsSaveState): SourceRmsStores {
  assertClassId(state.heroClassId);
  if (state.inventory.slots.length !== 30) {
    throw new TypeError('Source regular inventory must contain 30 slots');
  }
  if (state.specialInventory.slots.length !== 15) {
    throw new TypeError('Source special inventory must contain 15 slots');
  }
  return encodeSourceRmsStores(state.heroClassId, {
    player: encodeSourceRmsPlayerChunk(state.player),
    inventory: encodeSourceRmsInventoryChunk(state.inventory),
    flags: encodeSourceRmsFlags(state.flags.gameFlags, state.flags.questFlags, state.flags.playthroughMode),
    location: encodeSourceRmsLocation(state.location),
  }, state.specialInventory);
}

/** Decode both records into their structured source fields without accessing an RMS store. */
export function decodeSourceRmsSaveState(
  heroClassId: number,
  primaryRecord: Uint8Array,
  specialRecord: Uint8Array,
): SourceRmsSaveState {
  assertClassId(heroClassId);
  const primary = decodeSourceRmsPrimaryRecord(primaryRecord);
  return {
    heroClassId,
    player: decodeSourceRmsPlayerChunk(primary.player),
    inventory: decodeSourceRmsInventoryChunk(primary.inventory, 30),
    flags: decodeSourceRmsFlags(primary.flags),
    location: decodeSourceRmsLocation(primary.location),
    specialInventory: decodeSourceRmsInventoryChunk(decodeSourceRmsSpecialRecord(specialRecord), 15),
  };
}
