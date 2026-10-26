import { describe, expect, it } from 'vitest';
import {
  applyEventFlagChanges,
  applyInitialMapEventState,
  createEntityOccupancy,
  parseEventOperationData,
  prepareMapTransition,
  resolveEventScriptEffects,
  resolveInteractionScript,
  resolveMapTransition,
  resolveTriggerScript,
  sourceMapTransitionDirection,
} from '../src/world/event-data';
import { createWorldGrid } from '../src/world/map-data';
import {
  advanceEventCutscene,
  canRunEventCutscene,
  createEventCutscene,
} from '../src/world/event-cutscene';
import type { MapDecorationData } from '../src/world/map-data';

const rawEvents = {
  format: 'heroes-lore-event-operations-raw-v1',
  npcImageIds: [20],
  npcPlacements: [{ tileX: 22, tileY: 3, imageId: 20, sourceOrder: 0 }],
  enemyIds: [24],
  enemyPlacements: [{ tileX: 10, tileY: 31, enemyId: 24, sourceOrder: 0 }],
  triggerGroups: [
    [[192, 0, 0, 255, 0, 0, 0]],
  ],
  scripts: [
    [[9, 3, 0], [26, 8, 0], [7, 0, 1], [8, 26, 24], [99, 0, 0]],
  ],
  stringIds: [],
  descriptors: [],
  actionBlocks: [],
};

const emptyDecorations: MapDecorationData = {
  format: 'heroes-lore-map-decorations-v1',
  tilesetId: 1,
  objectAtlas: 'm/t/o01',
  loadedImageIds: [],
  imageAnchor: 'center-bottom',
  sortKey: 'source order',
  objects: [],
};

describe('raw map event trigger data', () => {
  it('converts the opcode-7 facing index to the source direction and rejects invalid values', () => {
    expect([0, 1, 2, 3].map(sourceMapTransitionDirection)).toEqual([1, 2, 3, 4]);
    expect(() => sourceMapTransitionDirection(-1)).toThrow(RangeError);
    expect(() => sourceMapTransitionDirection(4)).toThrow(RangeError);
  });

  it('resolves the active type-3 trigger script and its destination', () => {
    const events = parseEventOperationData(rawEvents);
    expect(events.npcPlacements).toEqual(rawEvents.npcPlacements);
    expect(events.enemyIds).toEqual([24]);
    expect(events.enemyPlacements).toEqual(rawEvents.enemyPlacements);
    expect(resolveMapTransition(events, -1, 3, new Set([0]))).toEqual({
      mapId: 0,
      entryDirectionIndex: 1,
      tileX: 26,
      tileY: 24,
      scriptIndex: 0,
      flagChanges: [{ flagSet: 'game', operation: 'set', flagIndex: 3 }],
    });
  });

  it('selects map-62 movement script 7 only after its type-3 game-flag predicate passes', () => {
    const script = [
      [15, 0, 2], [4, 4, 0], [16, 0, 0], [30, 11, 0], [30, 13, 0],
      [7, 1, 3], [8, 2, 17], [99, 0, 0],
    ];
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[], [], [], [[192, 49, 0, 255, 0, 0, 7]]],
      scripts: [...Array.from({ length: 7 }, () => []), script],
    });
    expect(resolveTriggerScript(events, 4, 3, new Set([0]))).toBeUndefined();
    expect(resolveTriggerScript(events, 4, 3, new Set([0, 49]))).toEqual({
      scriptIndex: 7,
      commands: script,
    });
  });

  it('resolves the observed map-00 automatic transfer to map 27', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[[0, 0, 0, 255, 0, 0, 0]]],
      scripts: [[[7, 27, 0], [8, 5, 37], [99, 0, 0]]],
    });
    expect(resolveMapTransition(events, 1, 0, new Set([0]))).toEqual({
      mapId: 27,
      entryDirectionIndex: 0,
      tileX: 5,
      tileY: 37,
      scriptIndex: 0,
      flagChanges: [],
    });
  });

  it('interprets preceding game and quest flag changes in source order', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      scripts: [[
        [9, 3, 0],
        [9, 4, 1],
        [30, 2, 2],
        [26, 5, 0],
        [7, 64, 1],
        [8, 9, 8],
        [99, 0, 0],
      ]],
    });
    expect(resolveMapTransition(events, -1, 3, new Set([0]))?.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 3 },
      { flagSet: 'game', operation: 'clear', flagIndex: 4 },
      { flagSet: 'quest', operation: 'toggle', flagIndex: 2 },
    ]);
  });

  it('resolves dialogue, flags, and a map transfer while stopping at the transfer', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      scripts: [[
        [1, 4, 0], [9, 3, 0], [30, 2, 2], [26, 8, 0],
        [7, 0, 1], [8, 21, 2], [9, 9, 0], [99, 0, 0],
      ]],
    });

    expect(resolveEventScriptEffects(events, 0)).toEqual({
      scriptIndex: 0,
      dialogueStringIndices: [4],
      flagChanges: [
        { flagSet: 'game', operation: 'set', flagIndex: 3 },
        { flagSet: 'quest', operation: 'toggle', flagIndex: 2 },
      ],
      destination: { mapId: 0, entryDirectionIndex: 1, tileX: 21, tileY: 2 },
    });
  });

  it('sign-extends the opcode-7 map and tile coordinates in fallback event resolution', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      scripts: [[[7, 64, 1], [8, 255, 128], [99, 0, 0]]],
    });
    expect(resolveEventScriptEffects(events, 0)?.destination).toEqual({
      mapId: 64,
      entryDirectionIndex: 1,
      tileX: -1,
      tileY: -128,
    });
  });

  it('keeps unsupported gameplay commands out of normal interaction scripts', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      scripts: [[[1, 4, 0], [2, 3, 5], [7, 0, 1], [8, 21, 2]]],
    });

    expect(resolveEventScriptEffects(events, 0)).toBeUndefined();
    expect(resolveEventScriptEffects(events, 0, { allowSkippedCommands: true })).toEqual({
      scriptIndex: 0,
      dialogueStringIndices: [4],
      flagChanges: [],
      destination: { mapId: 0, entryDirectionIndex: 1, tileX: 21, tileY: 2 },
    });
  });

  it('applies set, clear, and toggle flag operations without mutating prior state', () => {
    const original = { gameFlags: new Set([0, 4]), questFlags: new Set([2]) };
    const next = applyEventFlagChanges(original, [
      { flagSet: 'game', operation: 'set', flagIndex: 3 },
      { flagSet: 'game', operation: 'clear', flagIndex: 4 },
      { flagSet: 'quest', operation: 'toggle', flagIndex: 2 },
      { flagSet: 'quest', operation: 'toggle', flagIndex: 5 },
    ]);

    expect([...next.gameFlags].sort()).toEqual([0, 3]);
    expect([...next.questFlags].sort()).toEqual([5]);
    expect([...original.gameFlags].sort()).toEqual([0, 4]);
    expect([...original.questFlags].sort()).toEqual([2]);
  });

  it('prepares one post-transfer flag state for destination startup operations', () => {
    const original = { gameFlags: new Set([0]), questFlags: new Set([2]) };
    const prepared = prepareMapTransition(original, {
      mapId: 62,
      entryDirectionIndex: 0,
      tileX: 16,
      tileY: 6,
      scriptIndex: 2,
      flagChanges: [
        { flagSet: 'game', operation: 'toggle', flagIndex: 0 },
        { flagSet: 'game', operation: 'set', flagIndex: 5 },
        { flagSet: 'quest', operation: 'clear', flagIndex: 2 },
      ],
    });
    const destinationEvents = parseEventOperationData({
      ...rawEvents,
      descriptors: [
        { cellIndex: 0, rawMarkerByte: 0 },
        { cellIndex: 5, rawMarkerByte: 1 },
      ],
      actionBlocks: [
        { actions: [{ opcode: 101, arguments: [1, 0, 0] }] },
        { actions: [{ opcode: 101, arguments: [1, 0, 255] }] },
      ],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 2, height: 1,
      tileSize: 16, tileIds: [[0, 0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 2, height: 1,
      tileSize: 16, values: [[0, 0]], passabilityRule: 'base value >= 0',
    });

    const destinationState = applyInitialMapEventState(
      world, destinationEvents, prepared.flags.gameFlags, emptyDecorations,
    );

    expect(prepared.destination.mapId).toBe(62);
    expect([...prepared.flags.gameFlags]).toEqual([5]);
    expect([...prepared.flags.questFlags]).toEqual([]);
    expect(destinationState.actionBlockIndex).toBe(1);
    expect(destinationState.world.collision.values).toEqual([[0, -1]]);
    expect([...original.gameFlags]).toEqual([0]);
    expect([...original.questFlags]).toEqual([2]);
  });

  it('does not skip unsupported script commands before a map change', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      scripts: [[[1, 0, 0], [7, 0, 1], [8, 26, 24], [99, 0, 0]]],
    });
    expect(resolveMapTransition(events, -1, 3, new Set([0]))).toBeUndefined();
  });

  it('fast-forwards the source startup script only when skip is requested', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[[0, 0, 0, 255, 0, 0, 0]]],
      scripts: [[
        [17, 1, 4], [6, 3, 0], [9, 54, 0], [1, 4, 0],
        [9, 3, 0], [7, 64, 1], [8, 9, 8], [99, 0, 0],
      ]],
    });

    expect(resolveMapTransition(events, 1, 0, new Set([0]))).toBeUndefined();
    expect(resolveMapTransition(events, 1, 0, new Set([0]), new Set(), {
      allowSkippedCommands: true,
    })).toEqual({
      mapId: 64,
      entryDirectionIndex: 1,
      tileX: 9,
      tileY: 8,
      scriptIndex: 0,
      flagChanges: [
        { flagSet: 'game', operation: 'set', flagIndex: 54 },
        { flagSet: 'game', operation: 'set', flagIndex: 3 },
      ],
    });
  });

  it('checks trigger type and both packed story flags', () => {
    const events = parseEventOperationData(rawEvents);
    expect(resolveMapTransition(events, -1, 0, new Set([0]))).toBeUndefined();
    expect(resolveMapTransition(events, -1, 3, new Set())).toBeUndefined();
    expect(resolveMapTransition(events, -2, 3, new Set([0]))).toBeUndefined();
  });

  it('selects an interaction script only when its trigger type and game flags match', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[
        [128, 48, 0, 255, 0, 0, 0],
        [128, 0, 0, 255, 0, 0, 1],
      ]],
      scripts: [
        [[2, 3, 0], [99, 0, 0]],
        [[1, 4, 0], [99, 0, 0]],
      ],
    });

    expect(resolveTriggerScript(events, 1, 2, new Set([0]))).toEqual({
      scriptIndex: 1,
      commands: [[1, 4, 0], [99, 0, 0]],
    });
    expect(resolveTriggerScript(events, 1, 2, new Set())).toBeUndefined();
    expect(resolveTriggerScript(events, 1, 3, new Set([0]))).toBeUndefined();
  });

  it('runs the map-53 material and key route from its extracted interaction events', () => {
    const map62 = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[], [[192, 0, 0, 255, 0, 0, 1]]],
      scripts: [[], [[7, 53, 0], [8, 19, 38], [99, 0, 0]]],
    });
    expect(resolveMapTransition(map62, -2, 3, new Set([0]))).toMatchObject({
      mapId: 53, entryDirectionIndex: 0, tileX: 19, tileY: 38, scriptIndex: 1,
    });

    const map53Scripts = Array.from({ length: 11 }, () => [] as number[][]);
    map53Scripts[3] = [[11, 21, 2], [21, 1, 0], [1, 2, 0], [9, 33, 0], [99, 0, 0]];
    map53Scripts[4] = [[11, 21, 2], [21, 1, 0], [1, 2, 0], [9, 35, 0], [99, 0, 0]];
    map53Scripts[5] = [[11, 21, 2], [21, 1, 0], [1, 2, 0], [9, 37, 0], [99, 0, 0]];
    map53Scripts[6] = [[11, 19, 9], [21, 1, 0], [1, 8, 0], [9, 39, 0], [99, 0, 0]];
    map53Scripts[7] = [
      [1, 5, 0], [24, 0, 0], [9, 34, 0], [11, 21, 2], [21, 255, 0], [35, 0, 0],
      [37, 4, 36], [4, 8, 0], [38, 0, 0], [4, 5, 0], [25, 0, 0],
      [42, 33, 12], [43, 4, 0], [42, 33, 11], [43, 4, 0], [42, 33, 10], [43, 4, 0],
      [42, 33, 9], [43, 4, 0], [4, 6, 0], [35, 0, 0], [37, 2, 36], [4, 8, 0],
      [38, 0, 0], [4, 5, 0], [25, 0, 0], [42, 34, 24], [43, 4, 0], [42, 34, 25],
      [43, 4, 0], [42, 34, 26], [43, 4, 0], [42, 34, 27], [43, 4, 0], [4, 6, 0],
      [34, 0, 0], [99, 0, 0],
    ];
    map53Scripts[8] = [
      [1, 5, 0], [24, 0, 0], [9, 36, 0], [11, 21, 2], [21, 255, 0], [35, 0, 0],
      [37, 3, 36], [4, 5, 0], [38, 0, 0], [4, 5, 0], [25, 0, 0],
      [42, 7, 12], [43, 4, 0], [42, 7, 11], [43, 4, 0], [42, 7, 10], [43, 4, 0],
      [42, 7, 9], [43, 4, 0], [4, 5, 0], [35, 0, 0], [37, 2, 36], [4, 6, 0],
      [38, 0, 0], [4, 5, 0], [25, 0, 0], [42, 5, 24], [43, 4, 0], [42, 5, 25],
      [43, 4, 0], [4, 5, 0], [34, 0, 0], [99, 0, 0],
    ];
    map53Scripts[9] = [
      [1, 6, 0], [9, 38, 0], [11, 21, 2], [21, 255, 0], [25, 0, 0], [1, 7, 0], [99, 0, 0],
    ];
    map53Scripts[10] = [[7, 54, 0], [8, 17, 14], [99, 0, 0]];
    map53Scripts[11] = [[1, 3, 0], [1, 4, 0], [99, 0, 0]];
    map53Scripts[12] = [[1, 9, 0], [99, 0, 0]];
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [
        [[192, 0, 0, 255, 0, 0, 0]],
        [[0, 32, 0, 255, 0, 0, 255], [0, 0, 0, 255, 0, 0, 1]],
        [[128, 33, 0, 255, 0, 0, 12], [128, 0, 0, 255, 0, 0, 3]],
        [[128, 35, 0, 255, 0, 0, 12], [128, 0, 0, 255, 0, 0, 4]],
        [[128, 37, 0, 255, 0, 0, 12], [128, 0, 0, 255, 0, 0, 5]],
        [[128, 39, 0, 255, 0, 0, 12], [128, 0, 0, 255, 0, 0, 6]],
        [
          [128, 38, 0, 19, 9, 1, 10],
          [128, 36, 0, 21, 2, 1, 9],
          [128, 34, 0, 21, 2, 1, 8],
          [128, 34, 0, 255, 0, 0, 2],
          [128, 0, 0, 21, 2, 1, 7],
          [128, 0, 0, 255, 0, 0, 11],
        ],
      ],
      scripts: map53Scripts,
    });
    let gameFlags: ReadonlySet<number> = new Set([0]);
    let inventory: Array<{ category: number; itemId: number; count: number }> = [];

    const interact = (marker: number) => {
      const selection = resolveInteractionScript(events, undefined, marker, gameFlags, new Set(), inventory);
      expect(selection, `interaction marker ${marker}`).toBeDefined();
      const commands = selection!.commands;
      expect(canRunEventCutscene(commands, 0, { width: 40, height: 40 })).toBe(true);
      const result = advanceEventCutscene(
        createEventCutscene(selection!.scriptIndex, 2, inventory), commands, () => ['line'], 0, true,
      );
      expect(['ended', 'transfer']).toContain(result.status);
      gameFlags = applyEventFlagChanges({ gameFlags, questFlags: new Set() }, result.flagChanges).gameFlags;
      inventory = result.inventory;
      return { scriptIndex: selection!.scriptIndex, result };
    };

    const materialOne = interact(-3);
    expect(materialOne.scriptIndex).toBe(3);
    expect(inventory).toEqual([{ category: 21, itemId: 2, count: 1 }]);
    expect(gameFlags.has(33)).toBe(true);

    const key = interact(-6);
    expect(key.scriptIndex).toBe(6);
    expect(inventory).toEqual([
      { category: 21, itemId: 2, count: 1 },
      { category: 19, itemId: 9, count: 1 },
    ]);
    expect(gameFlags.has(39)).toBe(true);

    const firstForge = interact(-7);
    expect(firstForge.scriptIndex).toBe(7);
    expect(firstForge.result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 34 },
    ]);
    expect(firstForge.result.tileChanges).toHaveLength(8);
    expect(inventory).toEqual([{ category: 19, itemId: 9, count: 1 }]);

    const materialTwo = interact(-4);
    expect(materialTwo.scriptIndex).toBe(4);
    expect(inventory).toEqual([
      { category: 19, itemId: 9, count: 1 },
      { category: 21, itemId: 2, count: 1 },
    ]);

    const secondForge = interact(-7);
    expect(secondForge.scriptIndex).toBe(8);
    expect(secondForge.result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 36 },
    ]);
    expect(secondForge.result.tileChanges).toHaveLength(6);
    expect(inventory).toEqual([{ category: 19, itemId: 9, count: 1 }]);

    const materialThree = interact(-5);
    expect(materialThree.scriptIndex).toBe(5);
    expect(inventory).toEqual([
      { category: 19, itemId: 9, count: 1 },
      { category: 21, itemId: 2, count: 1 },
    ]);

    const finalForge = interact(-7);
    expect(finalForge.scriptIndex).toBe(9);
    expect(finalForge.result.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 38 },
    ]);
    expect(inventory).toEqual([{ category: 19, itemId: 9, count: 1 }]);

    const handoff = interact(-7);
    expect(handoff.scriptIndex).toBe(10);
    const transfer = handoff.result;
    expect(transfer.status).toBe('transfer');
    expect(transfer.transition).toMatchObject({ mapId: 54, entryDirectionIndex: 0, tileX: 17, tileY: 14 });
  });

  it('uses source item trigger predicates for category, item ID, and minimum stack count', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[
        [128, 38, 0, 19, 9, 2, 0],
        [128, 0, 0, 255, 0, 0, 1],
      ]],
      scripts: [
        [[7, 54, 0], [8, 17, 14], [99, 0, 0]],
        [[1, 11, 0], [99, 0, 0]],
      ],
    });
    const flags = new Set([0, 38]);

    expect(resolveTriggerScript(events, 1, 2, flags)?.scriptIndex).toBe(1);
    expect(resolveTriggerScript(events, 1, 2, flags, new Set(), [
      { category: 19, itemId: 8, count: 2 },
    ])?.scriptIndex).toBe(1);
    expect(resolveTriggerScript(events, 1, 2, flags, new Set(), [
      { category: 19, itemId: 9, count: 1 },
    ])?.scriptIndex).toBe(1);
    expect(resolveTriggerScript(events, 1, 2, flags, new Set(), [
      { category: 19, itemId: 9, count: 2 },
    ])?.scriptIndex).toBe(0);
    expect(resolveMapTransition(events, 1, 2, flags, new Set(), {
      inventory: [{ category: 19, itemId: 9, count: 2 }],
    })).toMatchObject({ mapId: 54, tileX: 17, tileY: 14, scriptIndex: 0 });
  });

  it('uses the regular inventory for every trigger item category, including category 22', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[
        [128, 0, 0, 22, 5, 2, 0],
        [128, 0, 0, 255, 0, 0, 1],
      ]],
      scripts: [
        [[7, 54, 0], [8, 17, 14], [99, 0, 0]],
        [[1, 11, 0], [99, 0, 0]],
      ],
    });
    const flags = new Set([0]);
    const category22Item = { category: 22, itemId: 5, count: 2 };

    expect(resolveTriggerScript(events, 1, 2, flags)?.scriptIndex).toBe(1);
    expect(resolveTriggerScript(events, 1, 2, flags, new Set(), [
      { category: 22, itemId: 5, count: 1 },
    ])?.scriptIndex).toBe(1);
    expect(resolveTriggerScript(events, 1, 2, flags, new Set(), [category22Item])?.scriptIndex).toBe(0);
    expect(resolveInteractionScript(events, undefined, 1, flags, new Set(), [category22Item])?.scriptIndex).toBe(0);
    expect(resolveMapTransition(events, 1, 2, flags, new Set(), {
      inventory: [category22Item],
    })).toMatchObject({ mapId: 54, tileX: 17, tileY: 14, scriptIndex: 0 });
  });

  it('interprets item-trigger fields as signed source bytes', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [[
        [128, 0, 0, 22, 5, 255, 0],
        [128, 0, 0, 255, 0, 0, 1],
      ]],
      scripts: [
        [[1, 10, 0], [99, 0, 0]],
        [[1, 11, 0], [99, 0, 0]],
      ],
    });

    expect(resolveTriggerScript(events, 1, 2, new Set([0]), new Set(), [
      { category: 22, itemId: 5, count: 1 },
    ])?.scriptIndex).toBe(0);
  });

  it('checks the actor cell before the tile ahead, matching source interaction order', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      triggerGroups: [
        [[64, 0, 0, 255, 0, 0, 0]],
        [[128, 0, 0, 255, 0, 0, 1]],
      ],
      scripts: [
        [[1, 0, 0], [99, 0, 0]],
        [[1, 1, 0], [99, 0, 0]],
      ],
    });

    expect(resolveInteractionScript(events, 1, 2, new Set([0]))?.scriptIndex).toBe(0);
    expect(resolveInteractionScript(events, 0, 2, new Set([0]))?.scriptIndex).toBe(1);
  });

  it('applies the selected source startup block for collision and NPC visibility', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      npcPlacements: [
        { tileX: 0, tileY: 0, imageId: 20, sourceOrder: 0 },
        { tileX: 1, tileY: 0, imageId: 21, sourceOrder: 1 },
      ],
      descriptors: [{ cellIndex: 0, rawMarkerByte: 0 }],
      actionBlocks: [{ actions: [
        { opcode: 101, arguments: [1, 0, 255] },
        { opcode: 105, arguments: [1, 0, 0] },
      ] }],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 2, height: 1,
      tileSize: 16, tileIds: [[0, 0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 2, height: 1,
      tileSize: 16, values: [[0, 0]], passabilityRule: 'base value >= 0',
    });
    const state = applyInitialMapEventState(world, events, new Set([0]), emptyDecorations);
    expect(state.actionBlockIndex).toBe(0);
    expect(state.world.collision.values).toEqual([[0, -1]]);
    expect(state.visibleNpcSourceOrders).toEqual(new Set([0]));
    expect(world.collision.values).toEqual([[0, 0]]);
  });

  it('selects the first matching descriptor with a non-sentinel signed action-block marker', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      descriptors: [
        { cellIndex: 7, rawMarkerByte: 0 },
        { cellIndex: 0, rawMarkerByte: 255 },
        { cellIndex: 1, rawMarkerByte: 2 },
        { cellIndex: 2, rawMarkerByte: 1 },
      ],
      actionBlocks: [10, 11, 12, 13].map((tileId) => ({ actions: [
        { opcode: 100, arguments: [0, 0, tileId] },
      ] })),
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 2, height: 1,
      tileSize: 16, tileIds: [[0, 0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 2, height: 1,
      tileSize: 16, values: [[0, 0]], passabilityRule: 'base value >= 0',
    });

    const state = applyInitialMapEventState(world, events, new Set([0, 1, 2]), emptyDecorations);

    expect(state.actionBlockIndex).toBe(2);
    expect(state.world.map.tileIds).toEqual([[12, 0]]);
  });

  it('applies no startup block when none of the descriptor flags match', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      descriptors: [{ cellIndex: 7, rawMarkerByte: 0 }],
      actionBlocks: [{ actions: [{ opcode: 100, arguments: [0, 0, 12] }] }],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 1, height: 1,
      tileSize: 16, tileIds: [[0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 1, height: 1,
      tileSize: 16, values: [[0]], passabilityRule: 'base value >= 0',
    });

    const state = applyInitialMapEventState(world, events, new Set(), emptyDecorations);

    expect(state.actionBlockIndex).toBeUndefined();
    expect(state.world.map.tileIds).toEqual([[0]]);
  });

  it('applies opcode 112 NPC emotion selection and clearing in action order', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      npcPlacements: [
        { tileX: 0, tileY: 0, imageId: 20, sourceOrder: 0 },
        { tileX: 1, tileY: 0, imageId: 21, sourceOrder: 1 },
      ],
      descriptors: [{ cellIndex: 0, rawMarkerByte: 0 }],
      actionBlocks: [{ actions: [
        { opcode: 112, arguments: [0, 9, 0] },
        { opcode: 112, arguments: [0, 10, 0] },
        { opcode: 112, arguments: [1, 9, 0] },
        { opcode: 112, arguments: [1, 0, 0] },
      ] }],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 2, height: 1,
      tileSize: 16, tileIds: [[0, 0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 2, height: 1,
      tileSize: 16, values: [[0, 0]], passabilityRule: 'base value >= 0',
    });

    const state = applyInitialMapEventState(world, events, new Set([0]), emptyDecorations);

    expect(state.npcEmotions).toEqual({ 0: 9, 1: null });
  });

  it('applies opcode 111 player emotion selection and clearing in action order', () => {
    const makeState = (emotionIds: number[]) => {
      const events = parseEventOperationData({
        ...rawEvents,
        descriptors: [{ cellIndex: 0, rawMarkerByte: 0 }],
        actionBlocks: [{ actions: emotionIds.map((emotionId) => ({
          opcode: 111,
          arguments: [emotionId, 0, 0],
        })) }],
      });
      const world = createWorldGrid({
        format: 'heroes-lore-map-v1', tilesetId: 1, width: 1, height: 1,
        tileSize: 16, tileIds: [[0]],
      }, {
        format: 'heroes-lore-base-collision-v1', width: 1, height: 1,
        tileSize: 16, values: [[0]], passabilityRule: 'base value >= 0',
      });
      return applyInitialMapEventState(world, events, new Set([0]), emptyDecorations);
    };

    expect(makeState([9]).heroEmotion).toBe(8);
    expect(makeState([9, 10]).heroEmotion).toBe(9);
    expect(makeState([9, 0]).heroEmotion).toBeNull();
    expect(makeState([255]).heroEmotion).toBe(-2);
    expect(makeState([]).heroEmotion).toBeUndefined();
  });

  it('occupies visible NPC and enemy placement cells while omitting hidden and out-of-bounds NPCs', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      npcPlacements: [
        { tileX: 1, tileY: 1, imageId: 20, sourceOrder: 0 },
        { tileX: 2, tileY: 1, imageId: 21, sourceOrder: 1 },
        { tileX: 8, tileY: 8, imageId: 22, sourceOrder: 2 },
      ],
      enemyPlacements: [{ tileX: 3, tileY: 2, enemyId: 24, sourceOrder: 0 }],
    });

    expect([...createEntityOccupancy(events, 4, 4, new Set([1, 2]))].sort((a, b) => a - b))
      .toEqual([6, 11]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([2]))]).toEqual([11]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([1, 2]), new Set())])
      .toEqual([6]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([1, 2]), undefined, [
      { sourceOrder: 0, tileX: 2, tileY: 2, footprintWidth: 2 },
    ])].sort((a, b) => a - b)).toEqual([6, 10, 11]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([0]), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 24, pixelY: 16, occupiesCells: true },
    ])].sort((a, b) => a - b)).toEqual([5, 6]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([0]), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 16, pixelY: 24, occupiesCells: true },
    ])].sort((a, b) => a - b)).toEqual([5, 9]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([0]), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 24, pixelY: 24, occupiesCells: true },
    ])].sort((a, b) => a - b)).toEqual([5, 9]);
    expect([...createEntityOccupancy(events, 4, 4, new Set(), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 24, pixelY: 16, occupiesCells: true },
    ])]).toEqual([]);
    expect([...createEntityOccupancy(events, 4, 4, new Set([0]), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 24, pixelY: 16, occupiesCells: false },
    ])]).toEqual([]);
    expect(() => createEntityOccupancy(events, 4, 4, new Set([0]), new Set(), undefined, [
      { sourceOrder: 0, pixelX: 24.5, pixelY: 16, occupiesCells: true },
    ])).toThrow(RangeError);
    expect(() => createEntityOccupancy(events, 0, 4, new Set())).toThrow(RangeError);
  });

  it('matches map 00 fresh-game startup operations for flag 0', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      npcPlacements: Array.from({ length: 5 }, (_, sourceOrder) => ({
        tileX: sourceOrder,
        tileY: 0,
        imageId: 20 + sourceOrder,
        sourceOrder,
      })),
      descriptors: [
        { cellIndex: 48, rawMarkerByte: 3 },
        { cellIndex: 16, rawMarkerByte: 1 },
        { cellIndex: 15, rawMarkerByte: 1 },
        { cellIndex: 54, rawMarkerByte: 0 },
        { cellIndex: 0, rawMarkerByte: 2 },
      ],
      actionBlocks: [
        { actions: [{ opcode: 108, arguments: [0, 0, 0] }] },
        { actions: [{ opcode: 105, arguments: [1, 0, 0] }] },
        { actions: [
          { opcode: 105, arguments: [2, 0, 0] },
          { opcode: 105, arguments: [0, 0, 0] },
          { opcode: 105, arguments: [4, 0, 0] },
          { opcode: 101, arguments: [22, 4, 0] },
        ] },
        { actions: [{ opcode: 101, arguments: [22, 4, 0] }] },
      ],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 23, height: 5,
      tileSize: 16, tileIds: Array.from({ length: 5 }, () => Array(23).fill(0)),
    }, {
      format: 'heroes-lore-base-collision-v1', width: 23, height: 5,
      tileSize: 16, values: Array.from({ length: 5 }, () => Array(23).fill(0)),
      passabilityRule: 'base value >= 0',
    });
    const state = applyInitialMapEventState(world, events, new Set([0]), emptyDecorations);

    expect(state.actionBlockIndex).toBe(2);
    expect(state.visibleNpcSourceOrders).toEqual(new Set([1, 3]));
    expect(state.world.collision.values[4][22]).toBe(0);
  });

  it('applies source startup map, decoration, enemy, and NPC operations in order', () => {
    const events = parseEventOperationData({
      ...rawEvents,
      npcPlacements: [
        { tileX: 0, tileY: 0, imageId: 20, sourceOrder: 0 },
        { tileX: 1, tileY: 0, imageId: 21, sourceOrder: 1 },
      ],
      enemyPlacements: [
        { tileX: 0, tileY: 1, enemyId: 24, sourceOrder: 0 },
        { tileX: 1, tileY: 1, enemyId: 24, sourceOrder: 1 },
      ],
      descriptors: [{ cellIndex: 0, rawMarkerByte: 0 }],
      actionBlocks: [{ actions: [
        { opcode: 100, arguments: [1, 1, 7] },
        { opcode: 101, arguments: [1, 1, 255] },
        { opcode: 102, arguments: [0, 0, 1] },
        { opcode: 103, arguments: [0, 0, 0] },
        { opcode: 104, arguments: [1, 1, 1] },
        { opcode: 109, arguments: [5, 0, 0] },
        { opcode: 110, arguments: [1, 42, 0] },
        { opcode: 105, arguments: [0, 0, 0] },
      ] }],
    });
    const world = createWorldGrid({
      format: 'heroes-lore-map-v1', tilesetId: 1, width: 2, height: 2,
      tileSize: 16, tileIds: [[0, 0], [0, 0]],
    }, {
      format: 'heroes-lore-base-collision-v1', width: 2, height: 2,
      tileSize: 16, values: [[0, 0], [0, 0]], passabilityRule: 'base value >= 0',
    });
    const decorations = {
      format: 'heroes-lore-map-decorations-v1' as const,
      tilesetId: 1,
      objectAtlas: 'm/t/o01',
      loadedImageIds: [0, 1],
      imageAnchor: 'center-bottom' as const,
      sortKey: 'source order',
      objects: Array.from({ length: 6 }, (_, sourceOrder) => ({
        tileX: sourceOrder,
        tileY: 1,
        offsetX: 2,
        offsetY: -1,
        atlasIndex: 1,
        sourceOrder,
      })),
    };

    const state = applyInitialMapEventState(world, events, new Set([0]), decorations);

    expect(state.world.map.tileIds).toEqual([[0, 0], [0, 7]]);
    expect(state.world.collision.values).toEqual([[0, 0], [0, -1]]);
    expect(state.decorations.objects).toEqual([
      { tileX: 0, tileY: 0, offsetX: 2, offsetY: -1, atlasIndex: 1, sourceOrder: 1 },
      { tileX: 2, tileY: 1, offsetX: 2, offsetY: -1, atlasIndex: 1, sourceOrder: 2 },
      { tileX: 3, tileY: 1, offsetX: 2, offsetY: -1, atlasIndex: 1, sourceOrder: 3 },
      { tileX: 4, tileY: 1, offsetX: 2, offsetY: -1, atlasIndex: 1, sourceOrder: 4 },
      { tileX: 5, tileY: 1, offsetX: 2, offsetY: -1, atlasIndex: 0, sourceOrder: 5 },
    ]);
    expect(state.enemyPlacements).toEqual([
      { tileX: 0, tileY: 1, enemyId: 24, sourceOrder: 0 },
      { tileX: 1, tileY: 1, enemyId: 24, sourceOrder: 1 },
    ]);
    expect(state.npcPlacements).toEqual([
      { tileX: 0, tileY: 0, imageId: 20, sourceOrder: 0 },
      { tileX: 1, tileY: 1, imageId: 42, sourceOrder: 1 },
    ]);
    expect(state.visibleNpcSourceOrders).toEqual(new Set([1]));
    expect(createEntityOccupancy(
      { ...events, npcPlacements: state.npcPlacements },
      2,
      2,
      state.visibleNpcSourceOrders,
      new Set(),
    )).toEqual(new Set([3]));
    expect(world.map.tileIds).toEqual([[0, 0], [0, 0]]);
    expect(world.collision.values).toEqual([[0, 0], [0, 0]]);
    expect(decorations.objects[0]).toMatchObject({ tileX: 0, tileY: 1, atlasIndex: 1 });
    expect(decorations.objects[1]).toMatchObject({ tileX: 1, tileY: 1, atlasIndex: 1 });
    expect(events.enemyPlacements[0]).toMatchObject({ tileX: 0, tileY: 1, sourceOrder: 0 });
  });

  it('rejects malformed trigger and script rows', () => {
    expect(() => parseEventOperationData({ ...rawEvents, scripts: [[[7, 0]]] })).toThrow(TypeError);
    expect(() => parseEventOperationData({ ...rawEvents, triggerGroups: [[[0]]] })).toThrow(TypeError);
    expect(() => parseEventOperationData({
      ...rawEvents,
      npcPlacements: [{ tileX: 256, tileY: 0, imageId: 20, sourceOrder: 0 }],
    })).toThrow(TypeError);
    expect(() => parseEventOperationData({
      ...rawEvents,
      enemyPlacements: [{ tileX: -1, tileY: 0, enemyId: 24, sourceOrder: 0 }],
    })).toThrow(TypeError);
  });
});
