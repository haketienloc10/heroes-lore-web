import type { MapDecorationData, WorldGrid } from './map-data';
import type { InventoryStack } from './loot';

export interface EventOperationData {
  format: 'heroes-lore-event-operations-raw-v1';
  npcImageIds: number[];
  npcPlacements: EventNpcPlacement[];
  enemyIds: number[];
  enemyPlacements: EventEnemyPlacement[];
  triggerGroups: number[][][];
  scripts: number[][][];
  stringIds: number[];
  descriptors: EventDescriptor[];
  actionBlocks: EventActionBlock[];
}

export interface EventDescriptor {
  cellIndex: number;
  rawMarkerByte: number;
}

export interface EventAction {
  opcode: number;
  arguments: number[];
}

export interface EventActionBlock {
  actions: EventAction[];
}

export interface EventNpcPlacement {
  tileX: number;
  tileY: number;
  imageId: number;
  sourceOrder: number;
}

export interface EventEnemyPlacement {
  tileX: number;
  tileY: number;
  enemyId: number;
  sourceOrder: number;
}

export interface MapTransition {
  mapId: number;
  regionId: number;
  tileX: number;
  tileY: number;
  scriptIndex: number;
  flagChanges: EventFlagChange[];
}

export interface EventScriptSelection {
  scriptIndex: number;
  commands: number[][];
}

export interface EventScriptEffects {
  scriptIndex: number;
  dialogueStringIndices: number[];
  flagChanges: EventFlagChange[];
  destination?: {
    mapId: number;
    regionId: number;
    tileX: number;
    tileY: number;
  };
}

export interface EventFlagChange {
  flagSet: 'game' | 'quest';
  operation: 'set' | 'clear' | 'toggle';
  flagIndex: number;
}

export interface EventFlagState {
  gameFlags: ReadonlySet<number>;
  questFlags: ReadonlySet<number>;
}

export interface PreparedMapTransition {
  destination: MapTransition;
  flags: EventFlagState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTables(value: unknown, width: number, label: string): number[][][] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of tables`);
  return value.map((rawTable, tableIndex) => {
    if (!Array.isArray(rawTable)) throw new TypeError(`${label} table ${tableIndex} must be an array`);
    return rawTable.map((rawRow, rowIndex) => {
      if (!Array.isArray(rawRow) || rawRow.length !== width || !rawRow.every(
        (cell) => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) <= 255,
      )) {
        throw new TypeError(`${label} table ${tableIndex} row ${rowIndex} is invalid`);
      }
      return [...rawRow] as number[];
    });
  });
}

function parseDescriptors(value: unknown): EventDescriptor[] {
  if (!Array.isArray(value)) throw new TypeError('descriptors must be an array');
  return value.map((rawDescriptor, index) => {
    if (!isRecord(rawDescriptor) || !Number.isInteger(rawDescriptor.cellIndex) ||
      Number(rawDescriptor.cellIndex) < 0 || Number(rawDescriptor.cellIndex) > 1023 ||
      !Number.isInteger(rawDescriptor.rawMarkerByte) || Number(rawDescriptor.rawMarkerByte) < 0 ||
      Number(rawDescriptor.rawMarkerByte) > 255) {
      throw new TypeError(`Event descriptor ${index} is invalid`);
    }
    return {
      cellIndex: Number(rawDescriptor.cellIndex),
      rawMarkerByte: Number(rawDescriptor.rawMarkerByte),
    };
  });
}

function parseActionBlocks(value: unknown): EventActionBlock[] {
  if (!Array.isArray(value)) throw new TypeError('actionBlocks must be an array');
  return value.map((rawBlock, blockIndex) => {
    if (!isRecord(rawBlock) || !Array.isArray(rawBlock.actions)) {
      throw new TypeError(`Action block ${blockIndex} is invalid`);
    }
    const actions = rawBlock.actions.map((rawAction, actionIndex): EventAction => {
      if (!isRecord(rawAction) || !Number.isInteger(rawAction.opcode) ||
        !Array.isArray(rawAction.arguments) || rawAction.arguments.length !== 3 ||
        !rawAction.arguments.every((argument) => Number.isInteger(argument) &&
          Number(argument) >= 0 && Number(argument) <= 255)) {
        throw new TypeError(`Action ${blockIndex}:${actionIndex} is invalid`);
      }
      return { opcode: Number(rawAction.opcode), arguments: [...rawAction.arguments] as number[] };
    });
    return { actions };
  });
}

function parseEnemyPlacements(value: unknown): EventEnemyPlacement[] {
  if (!Array.isArray(value)) throw new TypeError('enemyPlacements must be an array');
  return value.map((rawPlacement, index): EventEnemyPlacement => {
    if (!isRecord(rawPlacement)) throw new TypeError(`Enemy placement ${index} must be an object`);
    const { tileX, tileY, enemyId, sourceOrder } = rawPlacement;
    const isByte = (entry: unknown): entry is number =>
      Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255;
    if (!isByte(tileX) || !isByte(tileY) || !isByte(enemyId) ||
      !Number.isInteger(sourceOrder) || Number(sourceOrder) < 0) {
      throw new TypeError(`Enemy placement ${index} has invalid values`);
    }
    return { tileX, tileY, enemyId, sourceOrder: Number(sourceOrder) };
  });
}

function parseStringIds(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((id) =>
    (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) ||
    (typeof id === 'string' && /^\d+$/.test(id) && Number.isSafeInteger(Number(id))),
  )) {
    throw new TypeError('stringIds must contain non-negative locale IDs');
  }
  return value.map(Number);
}

/** Preserve the .evt script tables needed by the source trigger dispatcher. */
export function parseEventOperationData(value: unknown): EventOperationData {
  if (!isRecord(value) || value.format !== 'heroes-lore-event-operations-raw-v1') {
    throw new TypeError('Unsupported raw event-operation format');
  }
  if (!Array.isArray(value.npcImageIds) || !value.npcImageIds.every(
    (id) => Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 255,
  ) || !Array.isArray(value.npcPlacements) || !Array.isArray(value.enemyIds) ||
    !value.enemyIds.every((id) => Number.isInteger(id) && Number(id) >= 0 && Number(id) <= 255)) {
    throw new TypeError('NPC/enemy image references or placements are invalid');
  }
  const npcPlacements = value.npcPlacements.map((rawPlacement, index): EventNpcPlacement => {
    if (!isRecord(rawPlacement)) throw new TypeError(`NPC placement ${index} must be an object`);
    const { tileX, tileY, imageId, sourceOrder } = rawPlacement;
    const isByte = (entry: unknown): entry is number =>
      Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255;
    if (!isByte(tileX) || !isByte(tileY) || !isByte(imageId) ||
      !Number.isInteger(sourceOrder) || Number(sourceOrder) < 0) {
      throw new TypeError(`NPC placement ${index} has invalid values`);
    }
    return { tileX, tileY, imageId, sourceOrder: Number(sourceOrder) };
  });
  return {
    format: 'heroes-lore-event-operations-raw-v1',
    npcImageIds: [...value.npcImageIds] as number[],
    npcPlacements,
    enemyIds: [...value.enemyIds] as number[],
    enemyPlacements: parseEnemyPlacements(value.enemyPlacements),
    triggerGroups: parseTables(value.triggerGroups, 7, 'triggerGroups'),
    scripts: parseTables(value.scripts, 3, 'scripts'),
    stringIds: parseStringIds(value.stringIds),
    descriptors: parseDescriptors(value.descriptors),
    actionBlocks: parseActionBlocks(value.actionBlocks),
  };
}

export interface InitialMapEventState {
  world: WorldGrid;
  decorations: MapDecorationData;
  visibleNpcSourceOrders: ReadonlySet<number>;
  npcEmotions: Readonly<Record<number, number | null>>;
  npcPlacements: EventNpcPlacement[];
  enemyPlacements: EventEnemyPlacement[];
  actionBlockIndex: number | undefined;
}

export interface DynamicEnemyPlacement {
  sourceOrder: number;
  tileX: number;
  tileY: number;
  footprintWidth: number;
}

/** Build occupied map-cell indices from visible static NPC and enemy placements. */
export function createEntityOccupancy(
  events: EventOperationData,
  mapWidth: number,
  mapHeight: number,
  visibleNpcSourceOrders: ReadonlySet<number>,
  visibleEnemySourceOrders: ReadonlySet<number> = new Set(
    events.enemyPlacements.map(({ sourceOrder }) => sourceOrder),
  ),
  activeEnemyPlacements?: readonly DynamicEnemyPlacement[],
): ReadonlySet<number> {
  if (!Number.isInteger(mapWidth) || mapWidth <= 0 || !Number.isInteger(mapHeight) || mapHeight <= 0) {
    throw new RangeError('Map dimensions must be positive integers');
  }
  const occupied = new Set<number>();
  const addCell = (tileX: number, tileY: number): void => {
    if (tileX >= 0 && tileY >= 0 && tileX < mapWidth && tileY < mapHeight) {
      occupied.add(tileY * mapWidth + tileX);
    }
  };
  for (const npc of events.npcPlacements) {
    if (visibleNpcSourceOrders.has(npc.sourceOrder)) addCell(npc.tileX, npc.tileY);
  }
  const enemyPlacements = activeEnemyPlacements ?? events.enemyPlacements
    .filter(({ sourceOrder }) => visibleEnemySourceOrders.has(sourceOrder))
    .map(({ sourceOrder, tileX, tileY }) => ({ sourceOrder, tileX, tileY, footprintWidth: 1 }));
  for (const enemy of enemyPlacements) {
    if (!Number.isInteger(enemy.footprintWidth) || enemy.footprintWidth < 1) {
      throw new RangeError('Enemy footprint width must be a positive integer');
    }
    for (let offset = 0; offset < enemy.footprintWidth; offset += 1) {
      addCell(enemy.tileX + offset, enemy.tileY);
    }
  }
  return occupied;
}

/** Apply the source loader's flag-selected map, decoration, enemy, and NPC operations. */
export function applyInitialMapEventState(
  world: WorldGrid,
  events: EventOperationData,
  gameFlags: ReadonlySet<number>,
  decorations: MapDecorationData,
): InitialMapEventState {
  const selected = events.descriptors.find((descriptor) => gameFlags.has(descriptor.cellIndex));
  const actionBlockIndex = selected?.rawMarkerByte;
  const actions = actionBlockIndex === undefined ? undefined : events.actionBlocks[actionBlockIndex]?.actions;
  const tileIds = world.map.tileIds.map((row) => [...row]);
  const collisionValues = world.collision.values.map((row) => [...row]);
  let decorationObjects = decorations.objects.map((object) => ({ ...object }));
  const npcPlacements = events.npcPlacements.map((placement) => ({ ...placement }));
  const enemyPlacements = events.enemyPlacements.map((placement) => ({ ...placement }));
  const visibleNpcSourceOrders = new Set(events.npcPlacements.map(({ sourceOrder }) => sourceOrder));
  const npcEmotions: Record<number, number | null> = {};

  for (const action of actions ?? []) {
    const [first, second, third] = action.arguments;
    if (action.opcode === 100 && second < tileIds.length && first < tileIds[second].length) {
      tileIds[second][first] = third;
    } else if (action.opcode === 101 && second < collisionValues.length && first < collisionValues[second].length) {
      collisionValues[second][first] = third < 128 ? third : third - 256;
    } else if (action.opcode === 102) {
      const object = decorationObjects.find(({ sourceOrder }) => sourceOrder === third);
      if (object !== undefined) {
        object.tileX = first;
        object.tileY = second;
      }
    } else if (action.opcode === 103) {
      decorationObjects = decorationObjects.filter(({ sourceOrder }) => sourceOrder !== first);
    } else if (action.opcode === 104) {
      const placement = npcPlacements.find(({ sourceOrder }) => sourceOrder === third);
      if (placement !== undefined) {
        placement.tileX = first;
        placement.tileY = second;
      }
    } else if (action.opcode === 109) {
      const object = decorationObjects.find(({ sourceOrder }) => sourceOrder === first);
      if (object !== undefined) object.atlasIndex = second;
    } else if (action.opcode === 110) {
      const placement = npcPlacements.find(({ sourceOrder }) => sourceOrder === first);
      if (placement !== undefined) placement.imageId = second;
    } else if (action.opcode === 105) {
      visibleNpcSourceOrders.delete(first);
    } else if (action.opcode === 112) {
      const placement = npcPlacements.find(({ sourceOrder }) => sourceOrder === first);
      if (placement !== undefined) npcEmotions[first] = second > 0 ? second - 1 : null;
    }
  }

  return {
    world: {
      map: { ...world.map, tileIds },
      collision: { ...world.collision, values: collisionValues },
    },
    decorations: { ...decorations, objects: decorationObjects },
    visibleNpcSourceOrders,
    npcEmotions,
    npcPlacements,
    enemyPlacements,
    actionBlockIndex,
  };
}

function hasFlag(flags: ReadonlySet<number>, index: number): boolean {
  return flags.has(index);
}

/** Select a flag- and trigger-type-qualified script using the source packed predicate. */
export function resolveTriggerScript(
  data: EventOperationData,
  signedTriggerMarker: number,
  triggerType: 0 | 1 | 2 | 3,
  gameFlags: ReadonlySet<number>,
  questFlags: ReadonlySet<number> = new Set<number>(),
  inventory: readonly InventoryStack[] = [],
): EventScriptSelection | undefined {
  if (!Number.isInteger(signedTriggerMarker) || signedTriggerMarker === 0) return undefined;
  const triggerId = Math.abs(signedTriggerMarker);
  if (triggerId > 127) return undefined;
  const triggerRows = data.triggerGroups[triggerId - 1];
  if (triggerRows === undefined) return undefined;

  for (const row of triggerRows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== triggerType) continue;

    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    const firstUsesGameFlags = (packedTypeAndFlags & 32) === 0;
    const secondUsesGameFlags = (packedTypeAndFlags & 16) === 0;
    const firstFlags = firstUsesGameFlags ? gameFlags : questFlags;
    const secondFlags = secondUsesGameFlags ? gameFlags : questFlags;
    if (!hasFlag(firstFlags, firstFlag) || !hasFlag(secondFlags, secondFlag)) continue;
    if (itemCategory !== 255 && !inventory.some((stack) =>
      stack.category === itemCategory && stack.itemId === itemId && stack.count >= itemCount,
    )) continue;
    if (scriptIndex === 255) continue;

    const commands = data.scripts[scriptIndex];
    if (commands !== undefined) return { scriptIndex, commands };
  }
  return undefined;
}

/** The source checks a trigger on the actor's cell before a type-2 trigger ahead. */
export function resolveInteractionScript(
  data: EventOperationData,
  currentCellMarker: number | undefined,
  cellAheadMarker: number | undefined,
  gameFlags: ReadonlySet<number>,
  questFlags: ReadonlySet<number> = new Set<number>(),
  inventory: readonly InventoryStack[] = [],
): EventScriptSelection | undefined {
  if (currentCellMarker !== undefined && currentCellMarker !== 0) {
    const current = resolveTriggerScript(data, currentCellMarker, 1, gameFlags, questFlags, inventory);
    if (current !== undefined) return current;
  }
  if (cellAheadMarker !== undefined && cellAheadMarker !== 0) {
    return resolveTriggerScript(data, cellAheadMarker, 2, gameFlags, questFlags, inventory);
  }
  return undefined;
}

/**
 * Interpret the script commands used by supported dialogue and map-transfer routes.
 * Unknown gameplay commands reject the script unless an explicit skip is requested.
 * A map transfer ends interpretation, matching the source command handler which
 * consumes its following hero-position command and queues the transfer.
 */
export function resolveEventScriptEffects(
  data: Pick<EventOperationData, 'scripts'>,
  scriptIndex: number,
  options: { allowSkippedCommands?: boolean } = {},
): EventScriptEffects | undefined {
  if (!Number.isInteger(scriptIndex) || scriptIndex < 0) return undefined;
  const commands = data.scripts[scriptIndex];
  if (commands === undefined) return undefined;
  const dialogueStringIndices: number[] = [];
  const flagChanges: EventFlagChange[] = [];

  for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
    const [opcode, first, second] = commands[commandIndex];
    if (opcode === 1) {
      dialogueStringIndices.push(first);
      continue;
    }
    if (opcode === 7) {
      const position = commands[commandIndex + 1];
      if (position === undefined || position[0] !== 8) return undefined;
      return {
        scriptIndex,
        dialogueStringIndices,
        flagChanges,
        destination: {
          mapId: first,
          regionId: second,
          tileX: position[1],
          tileY: position[2],
        },
      };
    }
    if (opcode === 8) return undefined;
    if (opcode === 9 || opcode === 30) {
      const operation = second & 3;
      if (operation <= 2) {
        flagChanges.push({
          flagSet: opcode === 9 ? 'game' : 'quest',
          operation: operation === 0 ? 'set' : operation === 1 ? 'clear' : 'toggle',
          flagIndex: first | ((second << 2) & 768),
        });
      }
      continue;
    }
    if (opcode === 26 || opcode === 29) continue;
    if (opcode === 99) {
      return { scriptIndex, dialogueStringIndices, flagChanges };
    }
    if (options.allowSkippedCommands === true) continue;
    return undefined;
  }
  return undefined;
}

/** Apply script game/quest flag opcodes while preserving the prior state. */
export function applyEventFlagChanges(
  state: EventFlagState,
  changes: readonly EventFlagChange[],
): EventFlagState {
  const gameFlags = new Set(state.gameFlags);
  const questFlags = new Set(state.questFlags);
  for (const { flagSet, operation, flagIndex } of changes) {
    const flags = flagSet === 'game' ? gameFlags : questFlags;
    if (operation === 'set') flags.add(flagIndex);
    else if (operation === 'clear') flags.delete(flagIndex);
    else if (flags.has(flagIndex)) flags.delete(flagIndex);
    else flags.add(flagIndex);
  }
  return { gameFlags, questFlags };
}

/** Resolve a map transfer's flag effects once so loading and committing share the same state. */
export function prepareMapTransition(
  state: EventFlagState,
  destination: MapTransition,
): PreparedMapTransition {
  return {
    destination,
    flags: applyEventFlagChanges(state, destination.flagChanges),
  };
}

/**
 * Resolve a source type-0..3 trigger and its map-change command.
 * Event condition bits and script opcodes 7/8/9/30 follow ag and m in the pinned JAR.
 * Inventory trigger rows check category, item ID, and minimum quantity against
 * the current stack list. Script prefixes other than flag mutations and the
 * source's logging-only BGM markers are unresolved during normal play; explicit
 * skip input may fast-forward them to the script's map change.
 */
export function resolveMapTransition(
  data: EventOperationData,
  signedTriggerMarker: number,
  triggerType: 0 | 1 | 2 | 3,
  gameFlags: ReadonlySet<number>,
  questFlags: ReadonlySet<number> = new Set<number>(),
  options: {
    allowSkippedCommands?: boolean;
    inventory?: readonly InventoryStack[];
  } = {},
): MapTransition | undefined {
  const selection = resolveTriggerScript(
    data, signedTriggerMarker, triggerType, gameFlags, questFlags, options.inventory,
  );
  if (selection === undefined) return undefined;
  const effects = resolveEventScriptEffects(data, selection.scriptIndex, options);
  if (effects?.destination === undefined ||
    (options.allowSkippedCommands !== true && effects.dialogueStringIndices.length > 0)) return undefined;
  return { ...effects.destination, scriptIndex: effects.scriptIndex, flagChanges: effects.flagChanges };
}
