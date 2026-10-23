import type { Direction } from './actor';
import type { EndingHeroClassId } from './ending';
import type { EventFlagChange, MapTransition } from './event-data';
import type { DynamicMapTileChange } from './map-data';
import { changeInventoryQuantity, type InventoryStack } from './loot';
import {
  createSourceEquipmentInventoryState,
  findEquipmentItem,
  type EquipmentDataTable,
} from './equipment-data';

export type EventCutsceneStatus =
  | 'running' | 'dialogue' | 'choice' | 'delay' | 'flash' | 'shake' | 'transfer'
  | 'service' | 'ending' | 'ended' | 'unsupported';
export type EventServiceRequest = 'shop' | 'refiner' | 'blacksmith';

export interface EventCutsceneState {
  commandIndex: number;
  scriptIndex: number;
  status: EventCutsceneStatus;
  dialogueStringIndex: number | null;
  dialogueEndsCutscene: boolean;
  dialoguePages: string[];
  dialoguePageIndex: number;
  choiceSelection: 0 | 1;
  choiceSkipCount: number;
  delayRemainingMs: number;
  heroDirection: Direction;
  heroMoving: boolean;
  heroEmotion: number | null;
  heroEmotionChanged: boolean;
  cameraMode: 'hero' | 'fixed';
  cameraMoveDirection: number;
  cameraMoveSpeed: number;
  cameraTickRemainderMs: number;
  cameraPanX: number;
  cameraPanY: number;
  /** Source ag.f37b; -1 is its no-NPC sentinel. */
  cameraFollowNpcIndex: number | null;
  /** Source camera position from opcode 39, in signed-byte map tiles. */
  cameraPositionTile: { x: number; y: number } | null;
  npcDirections: Record<number, Direction>;
  npcMoving: Record<number, boolean>;
  npcImages: Record<number, number>;
  npcEmotions: Record<number, number | null>;
  npcVisibility: Record<number, boolean>;
  screenBlank: boolean;
  screenFlashColor: 'black' | 'white' | null;
  screenFlashStepsRemaining: number;
  screenShakeX: number;
  screenShakeY: number;
  screenShakeValues: number[];
  tileChanges: DynamicMapTileChange[];
  inventory: InventoryStack[];
  playerChanges: EventPlayerChange[];
  experienceAwards: number[];
  skillIds: number[];
  /** Source `an.z`, the maximum attack-chain step unlocked by event opcode 19. */
  comboLimit: number;
  heroClassId: EndingHeroClassId;
  serviceRequest: EventServiceRequest | null;
  flagChanges: EventFlagChange[];
  transition: Omit<MapTransition, 'flagChanges'> | null;
  unsupportedOpcode: number | null;
}

export interface EventPlayerChange {
  kind: 'wallet' | 'hp' | 'sp' | 'experience';
  amount: number;
}

export type ScriptDialogueResolver = (stringIndex: number) => string[];

export const EVENT_CUTSCENE_TICK_MS = 71;
export const EVENT_CAMERA_DIRECTION_VECTORS = [
  { x: 0, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
] as const;

const RENDERED_CUTSCENE_OPCODES = new Set([
  1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 21, 22, 23, 24, 26, 29, 30,
  2, 13, 14, 19, 20, 25, 31, 34, 35, 36, 37, 38, 39, 41, 42, 43, 46, 49, 50, 99,
  44, 45, 48,
]);

export function createEventCutscene(
  scriptIndex: number,
  direction: Direction,
  inventory: readonly InventoryStack[] = [],
  skillIds: readonly number[] = [],
  comboLimit = 1,
  heroClassId: EndingHeroClassId = 6,
): EventCutsceneState {
  if (!Number.isInteger(comboLimit) || comboLimit < 1 || comboLimit > 127) {
    throw new RangeError('comboLimit must be a signed positive byte');
  }
  if (![6, 7, 8].includes(heroClassId)) throw new RangeError('Unknown hero class');
  return {
    commandIndex: 0,
    scriptIndex,
    status: 'running',
    dialogueStringIndex: null,
    dialogueEndsCutscene: false,
    dialoguePages: [],
    dialoguePageIndex: 0,
    choiceSelection: 0,
    choiceSkipCount: 0,
    delayRemainingMs: 0,
    heroDirection: direction,
    heroMoving: false,
    heroEmotion: null,
    heroEmotionChanged: false,
    cameraMode: 'hero',
    cameraMoveDirection: 0,
    cameraMoveSpeed: 0,
    cameraTickRemainderMs: 0,
    cameraPanX: 0,
    cameraPanY: 0,
    cameraFollowNpcIndex: null,
    cameraPositionTile: null,
    npcDirections: {},
    npcMoving: {},
    npcImages: {},
    npcEmotions: {},
    npcVisibility: {},
    screenBlank: false,
    screenFlashColor: null,
    screenFlashStepsRemaining: 0,
    screenShakeX: 0,
    screenShakeY: 0,
    screenShakeValues: [],
    tileChanges: [],
    inventory: inventory.map((stack) => ({ ...stack })),
    playerChanges: [],
    experienceAwards: [],
    skillIds: [...skillIds],
    comboLimit,
    heroClassId,
    serviceRequest: null,
    flagChanges: [],
    transition: null,
    unsupportedOpcode: null,
  };
}

/** True when this interpreter can run every command in the stream without dropping behavior. */
export function canRunEventCutscene(
  commands: readonly (readonly number[])[],
  npcPlacementCount?: number,
  mapSize?: { width: number; height: number },
  equipmentDataTable?: EquipmentDataTable,
): boolean {
  if (commands.length === 0 || commands.some(([opcode]) => !RENDERED_CUTSCENE_OPCODES.has(opcode))) {
    return false;
  }
  for (let index = 0; index < commands.length; index += 1) {
    const [opcode, first = 0] = commands[index];
    const [, , second = 0] = commands[index];
    if (opcode === 11) {
      const quantityCommand = commands[index + 1];
      const rawQuantity = quantityCommand?.[1] ?? 0;
      const quantity = rawQuantity > 127 ? rawQuantity - 256 : rawQuantity;
      if (first < 0 || first > 23 || !Number.isInteger(second) || second < 0 || second > 255 ||
        quantityCommand?.[0] !== 21 || quantity === -128) return false;
      if (first < 7 && quantity > 0 && findEquipmentItem(equipmentDataTable ?? { categories: [] }, first, second) === undefined) {
        return false;
      }
      index += 1;
    } else if (opcode === 2 && (
      !Number.isInteger(first) || first < 0 || first > 255 ||
      !Number.isInteger(second) || second <= 0 || index + second > commands.length
    )) {
      return false;
    } else if (opcode === 31 && (
      !Number.isInteger(first) || first <= 0 || index + first > commands.length
    )) {
      return false;
    } else if (opcode === 21) {
      return false;
    } else if (opcode === 49 && (first < 0 || first > 12)) {
      return false;
    } else if (opcode === 50 && (second < 0 || second > 12)) {
      return false;
    } else if ([10, 12, 13, 14].includes(opcode) && (
      !Number.isInteger(first) || first < 0 || first > 255 ||
      !Number.isInteger(second) || second < 0 || second > 255
    )) {
      return false;
    } else if (opcode === 18 && (!Number.isInteger(first) || first < 0 || first > 2)) {
      return false;
    } else if (opcode === 19 && (!Number.isInteger(first) || first < 0 || first > 255)) {
      return false;
    } else if (opcode === 36 && (!Number.isInteger(first) || first < 0 || first > 255)) {
      return false;
    } else if (opcode === 39 && (
      !Number.isInteger(first) || first < 0 || first > 255 ||
      !Number.isInteger(second) || second < 0 || second > 255
    )) {
      return false;
    } else if (opcode === 42) {
      const propertyCommand = commands[index + 1];
      if (!Number.isInteger(first) || first < 0 || first > 255 ||
        !Number.isInteger(second) || second < 0 || second > 255 ||
        propertyCommand?.[0] !== 43 || !Number.isInteger(propertyCommand[1]) ||
        propertyCommand[1] < 0 || propertyCommand[1] > 255 ||
        !Number.isInteger(propertyCommand[2]) || propertyCommand[2] < 0 || propertyCommand[2] > 255 ||
        (mapSize !== undefined && (first >= mapSize.width || second >= mapSize.height))) return false;
      index += 1;
    } else if (opcode === 43) {
      return false;
    } else if (opcode === 37 && (
      first < 1 || first > 8 || !Number.isInteger(second) || second < 0 || second > 255
    )) {
      return false;
    }
    if (npcPlacementCount !== undefined && [15, 16, 17, 41, 46, 50].includes(opcode) &&
      (first < 0 || first >= npcPlacementCount)) return false;
  }
  if (commands.some(([opcode, first = 0, second = 0]) =>
    opcode === 30 && (first | ((second << 2) & 768)) === 29 && (second & 3) === 2,
  )) return false;
  const result = advanceEventCutscene(
    createEventCutscene(0, 2), commands, () => [], 0, true,
    undefined, undefined, equipmentDataTable, false,
  );
  return result.status === 'ended' || result.status === 'transfer' ||
    result.status === 'service' || result.status === 'ending';
}

function isDirection(value: number): value is Direction {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

/** Run source event commands in order until dialogue, a timed wait, transfer, or end. */
export function advanceEventCutscene(
  source: EventCutsceneState,
  commands: readonly (readonly number[])[],
  resolveDialogue: ScriptDialogueResolver,
  elapsedMs = 0,
  skipWaits = false,
  resolveSystemMessage?: ScriptDialogueResolver,
  randomInteger: (minimum: number, maximum: number) => number = () => 0,
  equipmentDataTable?: EquipmentDataTable,
  rollEquipmentBonuses = true,
): EventCutsceneState {
  let state = {
    ...source,
    npcDirections: { ...source.npcDirections },
    npcMoving: { ...source.npcMoving },
    npcImages: { ...source.npcImages },
    npcEmotions: { ...source.npcEmotions },
    npcVisibility: { ...source.npcVisibility },
    flagChanges: [...source.flagChanges],
    inventory: source.inventory.map((stack) => ({ ...stack })),
    playerChanges: [...source.playerChanges],
    experienceAwards: [...source.experienceAwards],
    skillIds: [...source.skillIds],
    comboLimit: source.comboLimit,
    heroClassId: source.heroClassId,
    screenShakeValues: [...source.screenShakeValues],
    tileChanges: [...source.tileChanges],
  };
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('elapsedMs must be non-negative');
  if (state.status === 'transfer' || state.status === 'service' ||
    state.status === 'ending' || state.status === 'ended' ||
    state.status === 'unsupported') return state;
  if (state.cameraMode === 'fixed' && state.cameraMoveSpeed !== 0 && elapsedMs > 0) {
    const accumulatedMs = state.cameraTickRemainderMs + elapsedMs;
    const ticks = Math.floor(accumulatedMs / EVENT_CUTSCENE_TICK_MS);
    state.cameraTickRemainderMs = accumulatedMs - ticks * EVENT_CUTSCENE_TICK_MS;
    if (ticks > 0) {
      const vector = EVENT_CAMERA_DIRECTION_VECTORS[state.cameraMoveDirection];
      state.cameraPanX += vector.x * state.cameraMoveSpeed * ticks;
      state.cameraPanY += vector.y * state.cameraMoveSpeed * ticks;
    }
  }

  if (state.status === 'dialogue') {
    if (!skipWaits) return state;
    if (state.dialogueEndsCutscene) {
      return {
        ...state,
        status: 'ended',
        dialogueStringIndex: null,
        dialoguePages: [],
        dialoguePageIndex: 0,
        dialogueEndsCutscene: false,
        cameraMode: 'hero',
        cameraMoveDirection: 0,
        cameraMoveSpeed: 0,
        cameraTickRemainderMs: 0,
      };
    }
    state.status = 'running';
    state.dialogueStringIndex = null;
    state.dialoguePages = [];
    state.dialoguePageIndex = 0;
    state.dialogueEndsCutscene = false;
  }
  if (state.status === 'choice') {
    if (!skipWaits) return state;
    state.status = 'running';
    state.commandIndex += 1;
    state.dialogueStringIndex = null;
    state.dialoguePages = [];
    state.dialoguePageIndex = 0;
    state.choiceSkipCount = 0;
  }
  if (state.status === 'delay') {
    if (skipWaits) {
      state.delayRemainingMs = 0;
    } else {
      state.delayRemainingMs = Math.max(0, state.delayRemainingMs - elapsedMs);
      if (state.delayRemainingMs > 0) return state;
    }
    state.status = 'running';
  }
  if (state.status === 'flash') {
    if (skipWaits) {
      state.status = 'running';
      state.screenFlashColor = null;
      state.screenFlashStepsRemaining = 0;
      state.delayRemainingMs = 0;
    } else {
      state.delayRemainingMs = Math.max(0, state.delayRemainingMs - elapsedMs);
      if (state.delayRemainingMs > 0) return state;
      if (state.screenFlashStepsRemaining <= 1) {
        state.status = 'running';
        state.screenFlashColor = null;
        state.screenFlashStepsRemaining = 0;
        state.delayRemainingMs = 0;
      } else {
        state.screenFlashStepsRemaining -= 1;
        state.screenFlashColor = state.screenFlashColor === 'white' ? 'black' : 'white';
        state.delayRemainingMs = EVENT_CUTSCENE_TICK_MS;
        return state;
      }
    }
  }
  if (state.status === 'shake') {
    if (skipWaits) {
      state.screenShakeValues = [];
      state.screenShakeX = 0;
      state.screenShakeY = 0;
      state.delayRemainingMs = 0;
      state.status = 'running';
      state.commandIndex += 1;
    } else {
      state.delayRemainingMs = Math.max(0, state.delayRemainingMs - elapsedMs);
      if (state.delayRemainingMs > 0) return state;
      if (state.screenShakeValues.length >= 2) {
        state.screenShakeX = state.screenShakeValues.shift()!;
        state.screenShakeY = state.screenShakeValues.shift()!;
        state.delayRemainingMs = EVENT_CUTSCENE_TICK_MS;
        return state;
      }
      state.screenShakeX = 0;
      state.screenShakeY = 0;
      state.status = 'running';
      state.commandIndex += 1;
    }
  }

  while (state.commandIndex < commands.length) {
    const [opcode, first = 0, second = 0] = commands[state.commandIndex];
    if (opcode === 1) {
      state.commandIndex += 1;
      if (skipWaits) continue;
      const pages = resolveDialogue(first);
      if (pages.length === 0) continue;
      state.status = 'dialogue';
      state.dialogueStringIndex = first;
      state.dialoguePages = pages;
      state.dialoguePageIndex = 0;
      return state;
    }
    if (opcode === 2) {
      if (skipWaits) {
        state.commandIndex += 1;
        continue;
      }
      const pages = resolveDialogue(first);
      if (pages.length === 0) {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      state.status = 'choice';
      state.dialogueStringIndex = first;
      state.dialoguePages = pages;
      state.dialoguePageIndex = 0;
      state.choiceSelection = 0;
      state.choiceSkipCount = second;
      return state;
    }
    if (opcode === 31) {
      state.commandIndex += first;
      continue;
    }
    if (opcode === 20) {
      state.commandIndex += 1;
      state.status = 'ending';
      state.cameraMode = 'hero';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      return state;
    }
    if (opcode === 11) {
      const quantityCommand = commands[state.commandIndex + 1];
      if (quantityCommand?.[0] !== 21) {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      const rawQuantity = quantityCommand[1] ?? 0;
      const quantity = rawQuantity > 127 ? rawQuantity - 256 : rawQuantity;
      const equipmentItem = first < 7 && quantity > 0
        ? findEquipmentItem(equipmentDataTable ?? { categories: [] }, first, second)
        : undefined;
      if (first < 7 && quantity > 0 && equipmentItem === undefined) {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      const equipmentState = equipmentItem === undefined
        ? undefined
        : createSourceEquipmentInventoryState(equipmentItem, randomInteger, 'event', rollEquipmentBonuses);
      const result = changeInventoryQuantity(state.inventory, first, second, quantity, equipmentState);
      if (result.status === 'unsupported-item') {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      state.commandIndex += 2;
      if (result.status === 'inventory-full' || result.status === 'missing-item') {
        if (skipWaits) continue;
        const stringId = result.status === 'inventory-full' ? 2366 : 2367;
        const pages = resolveSystemMessage?.(stringId) ?? [];
        if (pages.length === 0) {
          return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
        }
        state.status = 'dialogue';
        state.dialogueStringIndex = stringId;
        state.dialoguePages = pages;
        state.dialoguePageIndex = 0;
        state.dialogueEndsCutscene = true;
        return state;
      }
      state.inventory = result.inventory;
      continue;
    }
    if (opcode === 21) {
      return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
    }
    if (opcode === 12) {
      const amount = first * 256 + second;
      state.experienceAwards.push(amount);
      state.playerChanges.push({ kind: 'experience', amount });
    } else if (opcode === 25) {
      if (skipWaits) {
        state.commandIndex += 1;
        continue;
      }
      state.screenShakeValues = Array.from({ length: 6 }, () => randomInteger(-5, 5));
      state.screenShakeX = state.screenShakeValues.shift()!;
      state.screenShakeY = state.screenShakeValues.shift()!;
      state.delayRemainingMs = EVENT_CUTSCENE_TICK_MS;
      state.status = 'shake';
      return state;
    } else if (opcode === 42) {
      const propertyCommand = commands[state.commandIndex + 1];
      if (propertyCommand?.[0] !== 43) {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      const rawCollisionValue = propertyCommand[1] ?? 0;
      state.tileChanges.push({
        tileX: first,
        tileY: second,
        tileId: propertyCommand[2] ?? 0,
        collisionValue: rawCollisionValue > 127 ? rawCollisionValue - 256 : rawCollisionValue,
      });
      state.commandIndex += 2;
      continue;
    } else if (opcode === 43) {
      return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
    } else if (opcode === 3) {
      if (!isDirection(first)) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      state.heroDirection = first;
      state.heroMoving = true;
    } else if (opcode === 4) {
      const ticks = Math.max(0, first - 1);
      state.commandIndex += 1;
      if (!skipWaits && ticks > 0) {
        state.status = 'delay';
        state.delayRemainingMs = ticks * EVENT_CUTSCENE_TICK_MS;
        return state;
      }
      continue;
    } else if (opcode === 5) {
      state.heroMoving = false;
    } else if (opcode === 6) {
      if (!isDirection(first)) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      state.heroDirection = first;
    } else if (opcode === 7) {
      const position = commands[state.commandIndex + 1];
      if (position?.[0] !== 8) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      state.transition = {
        mapId: first,
        regionId: second,
        tileX: position[1],
        tileY: position[2],
        scriptIndex: state.scriptIndex,
      };
      state.commandIndex += 2;
      state.status = 'transfer';
      state.cameraMode = 'hero';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      return state;
    } else if (opcode === 8) {
      return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
    } else if (opcode === 9 || opcode === 30) {
      const operation = second & 3;
      if (operation <= 2) {
        const flagIndex = first | ((second << 2) & 768);
        state.flagChanges = [...state.flagChanges, {
          flagSet: opcode === 9 ? 'game' : 'quest',
          operation: operation === 0 ? 'set' : operation === 1 ? 'clear' : 'toggle',
          flagIndex,
        }];
        // m.e(29) raises the Ronin's source combo limit when gameplay state is 6.
        if (opcode === 30 && flagIndex === 29 && operation === 0 && state.heroClassId === 6) {
          state.comboLimit = Math.max(state.comboLimit, 2);
        }
      }
    } else if (opcode === 10) {
      state.playerChanges.push({ kind: 'wallet', amount: first * 256 + second });
    } else if (opcode === 13) {
      state.playerChanges.push({ kind: 'hp', amount: first * 256 + second });
    } else if (opcode === 14) {
      state.playerChanges.push({ kind: 'sp', amount: first * 256 + second });
    } else if (opcode === 15) {
      if (!isDirection(second)) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      state.npcDirections[first] = second;
      state.npcMoving[first] = true;
    } else if (opcode === 16) {
      state.npcMoving[first] = false;
    } else if (opcode === 17) {
      if (!isDirection(second)) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      state.npcDirections[first] = second;
    } else if (opcode === 41) {
      state.npcImages[first] = second;
    } else if (opcode === 18) {
      const skillId = [4, 3, 5][first];
      if (skillId === undefined) return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      if (!state.skillIds.includes(skillId) && state.skillIds.length < 5) state.skillIds.push(skillId);
    } else if (opcode === 19) {
      // Java reads this event argument as a signed byte; values above 127 become
      // negative and cannot raise the player's source combo limit.
      const requestedLimit = first > 127 ? first - 256 : first;
      if (requestedLimit > state.comboLimit) state.comboLimit = requestedLimit;
    } else if (opcode === 22) {
      state.screenBlank = true;
    } else if (opcode === 23) {
      state.screenBlank = false;
    } else if (opcode === 24) {
      if (!skipWaits) {
        state.screenFlashColor = 'white';
        state.screenFlashStepsRemaining = 5;
        state.delayRemainingMs = EVENT_CUTSCENE_TICK_MS;
        state.status = 'flash';
        state.commandIndex += 1;
        return state;
      }
    } else if (opcode === 34) {
      state.cameraMode = 'hero';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraPanX = 0;
      state.cameraPanY = 0;
      state.cameraFollowNpcIndex = null;
      state.cameraPositionTile = null;
    } else if (opcode === 35) {
      state.cameraMode = 'fixed';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraFollowNpcIndex = null;
    } else if (opcode === 36) {
      // Source ag.w() disables hero tracking and camera motion, then stores
      // this byte. ag.m12b() returns while it is set, leaving the camera fixed.
      state.cameraMode = 'fixed';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraFollowNpcIndex = first > 127 ? first - 256 : first;
    } else if (opcode === 37) {
      if (first < 1 || first > 8 || !Number.isInteger(second) || second < 0 || second > 255) {
        return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
      }
      state.cameraMode = 'fixed';
      state.cameraMoveDirection = first;
      state.cameraMoveSpeed = second > 127 ? second - 256 : second;
      state.cameraTickRemainderMs = 0;
      state.cameraFollowNpcIndex = null;
    } else if (opcode === 38) {
      state.cameraMode = 'fixed';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraFollowNpcIndex = null;
    } else if (opcode === 39) {
      state.cameraMode = 'fixed';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraPanX = 0;
      state.cameraPanY = 0;
      state.cameraFollowNpcIndex = null;
      state.cameraPositionTile = {
        x: first > 127 ? first - 256 : first,
        y: second > 127 ? second - 256 : second,
      };
    } else if (opcode === 46) {
      state.npcVisibility[first] = false;
    } else if (opcode === 26 || opcode === 29) {
      // The pinned source handler only logs these event markers.
    } else if (opcode === 49) {
      state.heroEmotion = first > 0 ? first - 1 : null;
      state.heroEmotionChanged = true;
    } else if (opcode === 50) {
      state.npcEmotions[first] = second > 0 ? second - 1 : null;
    } else if (opcode === 44 || opcode === 45 || opcode === 48) {
      state.commandIndex += 1;
      state.serviceRequest = opcode === 45 ? 'shop' : opcode === 48 ? 'refiner' : 'blacksmith';
      state.status = 'service';
      state.cameraMode = 'hero';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      state.cameraPanX = 0;
      state.cameraPanY = 0;
      state.cameraFollowNpcIndex = null;
      state.cameraPositionTile = null;
      return state;
    } else if (opcode === 99) {
      state.commandIndex += 1;
      state.status = 'ended';
      state.cameraMode = 'hero';
      state.cameraMoveDirection = 0;
      state.cameraMoveSpeed = 0;
      state.cameraTickRemainderMs = 0;
      return state;
    } else {
      return { ...state, status: 'unsupported', unsupportedOpcode: opcode };
    }
    state.commandIndex += 1;
  }

  return {
    ...state,
    status: 'ended',
    cameraMode: 'hero',
    cameraMoveDirection: 0,
    cameraMoveSpeed: 0,
    cameraTickRemainderMs: 0,
  };
}

/** Confirm the current text page; the next source command runs only after the final page. */
export function advanceEventCutsceneDialogue(state: EventCutsceneState): EventCutsceneState {
  if (state.status !== 'dialogue') return state;
  if (state.dialoguePageIndex + 1 < state.dialoguePages.length) {
    return { ...state, dialoguePageIndex: state.dialoguePageIndex + 1 };
  }
  if (state.dialogueEndsCutscene) {
    return {
      ...state,
      status: 'ended',
      dialogueStringIndex: null,
      dialoguePages: [],
      dialoguePageIndex: 0,
      dialogueEndsCutscene: false,
      cameraMode: 'hero',
      cameraMoveDirection: 0,
      cameraMoveSpeed: 0,
      cameraTickRemainderMs: 0,
    };
  }
  return {
    ...state,
    status: 'running',
    dialogueStringIndex: null,
    dialoguePages: [],
    dialoguePageIndex: 0,
  };
}

/** Apply the source yes/no jump encoded by opcode 2 and resume the command stream. */
export function selectEventCutsceneChoice(
  state: EventCutsceneState,
  selection: 0 | 1,
): EventCutsceneState {
  if (state.status !== 'choice' || (selection !== 0 && selection !== 1)) return state;
  return {
    ...state,
    status: 'running',
    commandIndex: state.commandIndex + (selection === 0 ? 1 : state.choiceSkipCount),
    dialogueStringIndex: null,
    dialoguePages: [],
    dialoguePageIndex: 0,
    choiceSelection: selection,
    choiceSkipCount: 0,
  };
}
