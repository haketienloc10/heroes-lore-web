import { describe, expect, it } from 'vitest';
import map04CollisionRaw from '../public/assets/generated/collision/6/04.json';
import map05CollisionRaw from '../public/assets/generated/collision/6/05.json';
import map06CollisionRaw from '../public/assets/generated/collision/6/06.json';
import map07CollisionRaw from '../public/assets/generated/collision/6/07.json';
import map08CollisionRaw from '../public/assets/generated/collision/6/08.json';
import map1CollisionRaw from '../public/assets/generated/collision/6/01.json';
import map3CollisionRaw from '../public/assets/generated/collision/6/03.json';
import map41CollisionRaw from '../public/assets/generated/collision/6/41.json';
import map42CollisionRaw from '../public/assets/generated/collision/6/42.json';
import map14CollisionRaw from '../public/assets/generated/collision/6/14.json';
import map12CollisionRaw from '../public/assets/generated/collision/6/12.json';
import map54CollisionRaw from '../public/assets/generated/collision/6/54.json';
import map59CollisionRaw from '../public/assets/generated/collision/6/59.json';
import map62CollisionRaw from '../public/assets/generated/collision/6/62.json';
import map31CollisionRaw from '../public/assets/generated/collision/6/31.json';
import map34CollisionRaw from '../public/assets/generated/collision/6/34.json';
import map35CollisionRaw from '../public/assets/generated/collision/6/35.json';
import map38CollisionRaw from '../public/assets/generated/collision/6/38.json';
import map40CollisionRaw from '../public/assets/generated/collision/6/40.json';
import map51CollisionRaw from '../public/assets/generated/collision/6/51.json';
import map53CollisionRaw from '../public/assets/generated/collision/6/53.json';
import map82CollisionRaw from '../public/assets/generated/collision/6/82.json';
import map31EventsRaw from '../public/assets/generated/event-operations/6/31.json';
import map34EventsRaw from '../public/assets/generated/event-operations/6/34.json';
import map35EventsRaw from '../public/assets/generated/event-operations/6/35.json';
import map38EventsRaw from '../public/assets/generated/event-operations/6/38.json';
import map40EventsRaw from '../public/assets/generated/event-operations/6/40.json';
import map3DecorationsRaw from '../public/assets/generated/decorations/6/03.json';
import map14DecorationsRaw from '../public/assets/generated/decorations/6/14.json';
import map42DecorationsRaw from '../public/assets/generated/decorations/6/42.json';
import map51DecorationsRaw from '../public/assets/generated/decorations/6/51.json';
import map53DecorationsRaw from '../public/assets/generated/decorations/6/53.json';
import map04EventsRaw from '../public/assets/generated/event-operations/6/04.json';
import map05EventsRaw from '../public/assets/generated/event-operations/6/05.json';
import map06EventsRaw from '../public/assets/generated/event-operations/6/06.json';
import map07EventsRaw from '../public/assets/generated/event-operations/6/07.json';
import map08EventsRaw from '../public/assets/generated/event-operations/6/08.json';
import map1EventsRaw from '../public/assets/generated/event-operations/6/01.json';
import map3EventsRaw from '../public/assets/generated/event-operations/6/03.json';
import map14EventsRaw from '../public/assets/generated/event-operations/6/14.json';
import map15EventsRaw from '../public/assets/generated/event-operations/6/15.json';
import map41EventsRaw from '../public/assets/generated/event-operations/6/41.json';
import map42EventsRaw from '../public/assets/generated/event-operations/6/42.json';
import map51EventsRaw from '../public/assets/generated/event-operations/6/51.json';
import map12EventsRaw from '../public/assets/generated/event-operations/6/12.json';
import map11EventsRaw from '../public/assets/generated/event-operations/6/11.json';
import map13EventsRaw from '../public/assets/generated/event-operations/6/13.json';
import map53EventsRaw from '../public/assets/generated/event-operations/6/53.json';
import map54EventsRaw from '../public/assets/generated/event-operations/6/54.json';
import map59EventsRaw from '../public/assets/generated/event-operations/6/59.json';
import map62EventsRaw from '../public/assets/generated/event-operations/6/62.json';
import map82EventsRaw from '../public/assets/generated/event-operations/6/82.json';
import enemyData0Raw from '../public/assets/generated/enemy-data/data0.json';
import map04Raw from '../public/assets/generated/maps/04.json';
import map05Raw from '../public/assets/generated/maps/05.json';
import map06Raw from '../public/assets/generated/maps/06.json';
import map07Raw from '../public/assets/generated/maps/07.json';
import map08Raw from '../public/assets/generated/maps/08.json';
import map3Raw from '../public/assets/generated/maps/03.json';
import map14Raw from '../public/assets/generated/maps/14.json';
import map41Raw from '../public/assets/generated/maps/41.json';
import map42Raw from '../public/assets/generated/maps/42.json';
import map51Raw from '../public/assets/generated/maps/51.json';
import map12Raw from '../public/assets/generated/maps/12.json';
import map53Raw from '../public/assets/generated/maps/53.json';
import map54Raw from '../public/assets/generated/maps/54.json';
import map59Raw from '../public/assets/generated/maps/59.json';
import map62Raw from '../public/assets/generated/maps/62.json';
import {
  applyEventFlagChanges,
  applyInitialMapEventState,
  createEntityOccupancy,
  parseEventOperationData,
  resolveEventScriptEffects,
  resolveMapTransition,
  resolveTriggerScript,
  type EventFlagState,
  type EventOperationData,
} from '../src/world/event-data';
import type { InventoryStack } from '../src/world/loot';
import {
  createEnemyCombatants,
  enemyFootprintWidth,
  parseEnemyDataTable,
} from '../src/world/combat';
import {
  advanceEventCutscene,
  canRunEventCutscene,
  createEventCutscene,
} from '../src/world/event-cutscene';
import {
  applyDynamicMapTileChanges,
  parseBaseCollisionData,
  parseBaseMapData,
  parseMapDecorationData,
  type BaseCollisionData,
  type WorldGrid,
} from '../src/world/map-data';
import {
  addSourceConstructedMapEnemies,
  addSourceMap13SecondWaveEnemies,
} from '../src/world/source-map-entities';

function world(mapRaw: unknown, collisionRaw: unknown): WorldGrid {
  return {
    map: parseBaseMapData(mapRaw),
    collision: parseBaseCollisionData(collisionRaw),
  };
}

/** Four-way collision-grid BFS; enemy occupancy and combat are not simulated. */
function reachable(
  collision: BaseCollisionData,
  start: { x: number; y: number },
  goals: ReadonlySet<number>,
  blockedCells: ReadonlySet<number> = new Set<number>(),
): boolean {
  const indexOf = (x: number, y: number): number => y * collision.width + x;
  const visited = new Set<number>([indexOf(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y }];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    const index = indexOf(cell.x, cell.y);
    if (goals.has(index)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const nextIndex = indexOf(x, y);
      if (x < 0 || y < 0 || x >= collision.width || y >= collision.height ||
        visited.has(nextIndex) || blockedCells.has(nextIndex) ||
        (collision.values[y]?.[x] ?? -1) < 0) continue;
      visited.add(nextIndex);
      queue.push({ x, y });
    }
  }
  return false;
}

function cellsForMarker(collision: BaseCollisionData, marker: number): Set<number> {
  const cells = new Set<number>();
  for (let y = 0; y < collision.height; y += 1) {
    for (let x = 0; x < collision.width; x += 1) {
      if (collision.values[y][x] === marker) cells.add(y * collision.width + x);
    }
  }
  return cells;
}

function passableCellsAdjacentToMarker(collision: BaseCollisionData, marker: number): Set<number> {
  const cells = new Set<number>();
  for (let y = 0; y < collision.height; y += 1) {
    for (let x = 0; x < collision.width; x += 1) {
      if (collision.values[y][x] !== marker) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const adjacentX = x + dx;
        const adjacentY = y + dy;
        if (adjacentX < 0 || adjacentY < 0 ||
          adjacentX >= collision.width || adjacentY >= collision.height ||
          collision.values[adjacentY][adjacentX] < 0) continue;
        cells.add(adjacentY * collision.width + adjacentX);
      }
    }
  }
  return cells;
}

function eventData(raw: unknown): EventOperationData {
  return parseEventOperationData(raw);
}

const sourceEnemyData = parseEnemyDataTable(enemyData0Raw);

function occupiedEventCells(
  events: EventOperationData,
  collision: BaseCollisionData,
  visibleNpcSourceOrders: ReadonlySet<number>,
  enemyPlacements: EventOperationData['enemyPlacements'] = events.enemyPlacements,
): ReadonlySet<number> {
  const enemies = createEnemyCombatants(enemyPlacements, sourceEnemyData);
  const dynamicEnemies = enemies.map((enemy) => ({
    sourceOrder: enemy.sourceOrder,
    tileX: enemy.tileX,
    tileY: enemy.tileY,
    footprintWidth: enemyFootprintWidth(enemy),
  }));
  return createEntityOccupancy(
    events,
    collision.width,
    collision.height,
    visibleNpcSourceOrders,
    new Set(enemies.map(({ sourceOrder }) => sourceOrder)),
    dynamicEnemies,
  );
}

function runSupportedCutscene(
  events: EventOperationData,
  selection: NonNullable<ReturnType<typeof resolveTriggerScript>>,
  mapRaw: unknown,
  inventory: readonly InventoryStack[],
) {
  const map = parseBaseMapData(mapRaw);
  expect(canRunEventCutscene(
    selection.commands,
    events.npcPlacements.length,
    { width: map.width, height: map.height },
  )).toBe(true);
  return advanceEventCutscene(
    createEventCutscene(selection.scriptIndex, 2, inventory),
    selection.commands,
    () => [],
    0,
    true,
  );
}

describe('map-42 upper-entry flag gate', () => {
  it('models why the M210 fresh checkpoint cannot reach marker 3 without flag 51', () => {
    const gameFlags = new Set([0, 1, 3, 5, 6, 54, 75, 87]);
    const questFlags = new Set([1, 2, 4]);
    const map42 = eventData(map42EventsRaw);
    const marker3Events = passableCellsAdjacentToMarker(
      parseBaseCollisionData(map42CollisionRaw), -3,
    );
    expect([...marker3Events]).toEqual([2 * 40 + 8]);

    // M210 arrives at map 42/(37,3) with these flags. Descriptor 0 selects
    // action block 1, which leaves the source bridge at (9,13) closed.
    const m210Map42 = applyInitialMapEventState(
      world(map42Raw, map42CollisionRaw),
      map42,
      gameFlags,
      parseMapDecorationData(map42DecorationsRaw),
    );
    expect(m210Map42.actionBlockIndex).toBe(1);
    expect(m210Map42.world.collision.values[13][9]).toBe(-128);
    expect(reachable(
      m210Map42.world.collision,
      { x: 37, y: 3 },
      marker3Events,
    )).toBe(false);

    // The event predicate itself passes, but the player cannot reach its
    // only passable neighboring tile under M210's startup collision state.
    expect(resolveTriggerScript(map42, -3, 2, gameFlags, questFlags)?.scriptIndex).toBe(2);
    expect(resolveMapTransition(
      map42, -3, 2, gameFlags, questFlags, { allowSkippedCommands: true },
    )).toMatchObject({
      mapId: 14,
      scriptIndex: 2,
      flagChanges: [{ flagSet: 'game', operation: 'clear', flagIndex: 51 }],
    });

    // M226's checkpoint has the same arrival tile with flag 51 set. Its
    // startup action block opens the bridge and the trace reaches marker 3.
    const m226Flags = new Set([...gameFlags, 51]);
    const m226Map42 = applyInitialMapEventState(
      world(map42Raw, map42CollisionRaw),
      map42,
      m226Flags,
      parseMapDecorationData(map42DecorationsRaw),
    );
    expect(m226Map42.actionBlockIndex).toBe(0);
    expect(m226Map42.world.collision.values[13][9]).toBe(0);
    expect(reachable(
      m226Map42.world.collision,
      { x: 37, y: 3 },
      marker3Events,
    )).toBe(true);
  });
});

function continueM210Map42Route(initialFlags: EventFlagState): void {
    let flags = initialFlags;
    const map42 = eventData(map42EventsRaw);
    const map41 = eventData(map41EventsRaw);
    const map42UpperEntry = applyInitialMapEventState(
      world(map42Raw, map42CollisionRaw),
      map42,
      flags.gameFlags,
      parseMapDecorationData(map42DecorationsRaw),
    );
    expect(map42UpperEntry.actionBlockIndex).toBe(1);
    const map42UpperOccupiedCells = occupiedEventCells(
      map42,
      map42UpperEntry.world.collision,
      map42UpperEntry.visibleNpcSourceOrders,
      map42UpperEntry.enemyPlacements,
    );
    const map42UpperReturnCells = cellsForMarker(map42UpperEntry.world.collision, 1);
    expect(reachable(
      map42UpperEntry.world.collision,
      { x: 37, y: 3 },
      map42UpperReturnCells,
      map42UpperOccupiedCells,
    )).toBe(true);
    const toMap41Upper = resolveMapTransition(
      map42, 1, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap41Upper).toMatchObject({ mapId: 41, tileX: 2, tileY: 3, scriptIndex: 0 });

    // M210's upper return reaches map 41's lower portal while the source
    // enemies remain stationary at their entry placements.
    const map41World = world(map41Raw, map41CollisionRaw);
    const map41LowerPortalCells = cellsForMarker(map41World.collision, 3);
    const map41OccupiedCells = occupiedEventCells(
      map41,
      map41World.collision,
      new Set(map41.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
    );
    expect(reachable(
      map41World.collision,
      { x: toMap41Upper!.tileX, y: toMap41Upper!.tileY },
      map41LowerPortalCells,
      map41OccupiedCells,
    )).toBe(true);
    const toMap42Lower = resolveMapTransition(
      map41, 3, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap42Lower).toMatchObject({ mapId: 42, tileX: 37, tileY: 29, scriptIndex: 2 });

    const map42LowerEntry = applyInitialMapEventState(
      world(map42Raw, map42CollisionRaw),
      map42,
      flags.gameFlags,
      parseMapDecorationData(map42DecorationsRaw),
    );
    const map42SwitchCells = passableCellsAdjacentToMarker(
      map42LowerEntry.world.collision, -4,
    );
    const map42LowerOccupiedCells = occupiedEventCells(
      map42,
      map42LowerEntry.world.collision,
      map42LowerEntry.visibleNpcSourceOrders,
      map42LowerEntry.enemyPlacements,
    );
    expect(reachable(
      map42LowerEntry.world.collision,
      { x: toMap42Lower!.tileX, y: toMap42Lower!.tileY },
      map42SwitchCells,
      map42LowerOccupiedCells,
    )).toBe(true);
    const map42Switch = resolveTriggerScript(
      map42, -4, 2, flags.gameFlags, flags.questFlags,
    );
    expect(map42Switch?.scriptIndex).toBe(3);
    expect(canRunEventCutscene(
      map42Switch!.commands,
      map42.npcPlacements.length,
      { width: map42LowerEntry.world.map.width, height: map42LowerEntry.world.map.height },
    )).toBe(true);
    const switchCutscene = advanceEventCutscene(
      createEventCutscene(map42Switch!.scriptIndex, 2),
      map42Switch!.commands,
      () => [],
      0,
      true,
    );
    expect(switchCutscene.status).toBe('ended');
    expect(switchCutscene.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 51 },
    ]);
    flags = applyEventFlagChanges(flags, switchCutscene.flagChanges);
    const map42AfterSwitch = applyDynamicMapTileChanges(
      map42LowerEntry.world,
      switchCutscene.tileChanges,
    );
    expect(map42AfterSwitch.collision.values[13][9]).toBe(4);
    const map42AfterSwitchOccupiedCells = occupiedEventCells(
      map42,
      map42AfterSwitch.collision,
      map42LowerEntry.visibleNpcSourceOrders,
      map42LowerEntry.enemyPlacements,
    );
    expect(reachable(
      map42AfterSwitch.collision,
      { x: 4, y: 15 },
      cellsForMarker(map42AfterSwitch.collision, 2),
      map42AfterSwitchOccupiedCells,
    )).toBe(true);
    const toMap41Lower = resolveMapTransition(
      map42, 2, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap41Lower).toMatchObject({ mapId: 41, tileX: 2, tileY: 29, scriptIndex: 1 });

    const map41UpperPortalCells = cellsForMarker(map41World.collision, 2);
    expect(reachable(
      map41World.collision,
      { x: toMap41Lower!.tileX, y: toMap41Lower!.tileY },
      map41UpperPortalCells,
      map41OccupiedCells,
    )).toBe(true);
    const toMap42Upper = resolveMapTransition(
      map41, 2, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap42Upper).toMatchObject({ mapId: 42, tileX: 37, tileY: 3, scriptIndex: 1 });

    const map42Reentry = applyInitialMapEventState(
      world(map42Raw, map42CollisionRaw),
      map42,
      flags.gameFlags,
      parseMapDecorationData(map42DecorationsRaw),
    );
    expect(map42Reentry.actionBlockIndex).toBe(0);
    expect(map42Reentry.world.collision.values[13][9]).toBe(0);
    const map42Marker3Cells = passableCellsAdjacentToMarker(
      map42Reentry.world.collision, -3,
    );
    const map42ReentryOccupiedCells = occupiedEventCells(
      map42,
      map42Reentry.world.collision,
      map42Reentry.visibleNpcSourceOrders,
      map42Reentry.enemyPlacements,
    );
    expect(reachable(
      map42Reentry.world.collision,
      { x: toMap42Upper!.tileX, y: toMap42Upper!.tileY },
      map42Marker3Cells,
      map42ReentryOccupiedCells,
    )).toBe(true);
    const map42Marker3 = resolveTriggerScript(
      map42, -3, 2, flags.gameFlags, flags.questFlags,
    );
    expect(map42Marker3?.scriptIndex).toBe(2);
    expect(canRunEventCutscene(
      map42Marker3!.commands,
      map42.npcPlacements.length,
      { width: map42Reentry.world.map.width, height: map42Reentry.world.map.height },
    )).toBe(true);
    const map42Exit = resolveMapTransition(
      map42, -3, 2, flags.gameFlags, flags.questFlags,
      { allowSkippedCommands: true },
    );
    expect(map42Exit).toMatchObject({ mapId: 14, tileX: 12, tileY: 16, scriptIndex: 2 });
    flags = applyEventFlagChanges(flags, map42Exit!.flagChanges);
    expect(flags.gameFlags.has(51)).toBe(false);

    const map14 = eventData(map14EventsRaw);
    const map14FromMap42 = applyInitialMapEventState(
      world(map14Raw, map14CollisionRaw),
      map14,
      flags.gameFlags,
      parseMapDecorationData(map14DecorationsRaw),
    );
    expect(map14FromMap42.world.collision.values[map42Exit!.tileY][map42Exit!.tileX]).toBe(1);
    const map14Entry = resolveTriggerScript(
      map14,
      map14FromMap42.world.collision.values[map42Exit!.tileY][map42Exit!.tileX],
      0,
      flags.gameFlags,
      flags.questFlags,
    );
    expect(map14Entry?.scriptIndex).toBe(0);
    expect(canRunEventCutscene(
      map14Entry!.commands,
      map14.npcPlacements.length,
      { width: map14FromMap42.world.map.width, height: map14FromMap42.world.map.height },
    )).toBe(true);
    const toMap15 = resolveMapTransition(
      map14,
      map14FromMap42.world.collision.values[map42Exit!.tileY][map42Exit!.tileX],
      0,
      flags.gameFlags,
      flags.questFlags,
      { allowSkippedCommands: true },
    );
    expect(toMap15).toMatchObject({ mapId: 15, tileX: 7, tileY: 10, scriptIndex: 0 });
    flags = applyEventFlagChanges(flags, toMap15!.flagChanges);
    expect(flags.gameFlags.has(52)).toBe(true);

    const map15 = eventData(map15EventsRaw);
    const map82 = eventData(map82EventsRaw);
    const map51 = eventData(map51EventsRaw);
    const map1 = eventData(map1EventsRaw);
    const map3 = eventData(map3EventsRaw);

    // M280 establishes that `cf.l()` creates this marker after its death delay.
    const toMap82 = resolveMapTransition(map15, 1, 0, flags.gameFlags, flags.questFlags);
    expect(toMap82).toMatchObject({ mapId: 82, tileX: 7, tileY: 14, scriptIndex: 0 });

    // The map-15 return reaches map 82 with its source-constructed `bu` and
    // generated enemies at their entry cells. Verify a tile beside `bu` is
    // reachable while all of those actors remain stationary.
    const map82WithBoss = addSourceConstructedMapEnemies(82, map82);
    const map82Collision = parseBaseCollisionData(map82CollisionRaw);
    const map82OccupiedCells = occupiedEventCells(
      map82WithBoss,
      map82Collision,
      new Set(map82WithBoss.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
    );
    const map82Boss = createEnemyCombatants(
      map82WithBoss.enemyPlacements,
      sourceEnemyData,
    ).find(({ sourceBehavior }) => sourceBehavior === 'map82-bu');
    expect(map82Boss).toBeDefined();
    const map82BossAdjacentCells = new Set<number>();
    for (let x = map82Boss!.tileX; x < map82Boss!.tileX + enemyFootprintWidth(map82Boss!); x += 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const adjacentX = x + dx;
        const adjacentY = map82Boss!.tileY + dy;
        if (adjacentX >= 0 && adjacentY >= 0 &&
          adjacentX < map82Collision.width && adjacentY < map82Collision.height &&
          (map82Collision.values[adjacentY]?.[adjacentX] ?? -1) >= 0 &&
          !map82OccupiedCells.has(adjacentY * map82Collision.width + adjacentX)) {
          map82BossAdjacentCells.add(adjacentY * map82Collision.width + adjacentX);
        }
      }
    }
    expect(map82BossAdjacentCells.size).toBeGreaterThan(0);
    expect(reachable(
      map82Collision,
      { x: toMap82!.tileX, y: toMap82!.tileY },
      map82BossAdjacentCells,
      map82OccupiedCells,
    )).toBe(true);

    // Defeating map 82's source `bu` dispatches marker 1 directly. With flag 73
    // absent, the second source row returns to map 14 at its flag-52 portal.
    const toMap14 = resolveMapTransition(map82WithBoss, 1, 0, flags.gameFlags, flags.questFlags);
    expect(toMap14).toMatchObject({ mapId: 14, tileX: 14, tileY: 2, scriptIndex: 0 });

    const map14World = applyInitialMapEventState(
      world(map14Raw, map14CollisionRaw),
      map14,
      flags.gameFlags,
      parseMapDecorationData(map14DecorationsRaw),
    );
    const map14Portal = map14World.world.collision.values[2][14];
    expect(map14Portal).toBe(2);
    const map14Return = resolveTriggerScript(
      map14, map14Portal, 0, flags.gameFlags, flags.questFlags,
    );
    expect(map14Return?.scriptIndex).toBe(1);
    expect(canRunEventCutscene(
      map14Return!.commands,
      map14.npcPlacements.length,
      { width: map14World.world.map.width, height: map14World.world.map.height },
    )).toBe(true);
    const toMap51 = resolveMapTransition(
      map14, map14Portal, 0, flags.gameFlags, flags.questFlags,
      { allowSkippedCommands: true },
    );
    expect(toMap51).toMatchObject({ mapId: 51, tileX: 26, tileY: 2, scriptIndex: 1 });

    const map51World = applyInitialMapEventState(
      world(map51Raw, map51CollisionRaw),
      map51,
      flags.gameFlags,
      parseMapDecorationData(map51DecorationsRaw),
    );
    const map51EntryMarker = map51World.world.collision.values[2][26];
    expect(map51EntryMarker).toBe(7);
    const flag52Script = resolveTriggerScript(
      map51, map51EntryMarker, 0, flags.gameFlags, flags.questFlags,
    );
    expect(flag52Script?.scriptIndex).toBe(7);
    expect(canRunEventCutscene(
      flag52Script!.commands,
      map51.npcPlacements.length,
      { width: map51World.world.map.width, height: map51World.world.map.height },
    )).toBe(true);
    const scriptEffects = resolveEventScriptEffects(map51, flag52Script!.scriptIndex, {
      allowSkippedCommands: true,
    });
    expect(scriptEffects?.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 53 },
      { flagSet: 'quest', operation: 'set', flagIndex: 16 },
      { flagSet: 'quest', operation: 'set', flagIndex: 14 },
    ]);
    flags = applyEventFlagChanges(flags, scriptEffects!.flagChanges);

    // The script hides NPCs 1–4 after the map-entry action block hides NPC 0.
    // This is the post-cutscene occupancy used by the grid-only route check.
    const hiddenByScript = new Set(flag52Script!.commands
      .filter(([opcode]) => opcode === 46)
      .map(([, npcOrder]) => npcOrder));
    expect([...hiddenByScript].sort()).toEqual([1, 2, 3, 4]);
    expect(map51World.visibleNpcSourceOrders.has(0)).toBe(false);
    expect([...map51World.visibleNpcSourceOrders].every((order) => hiddenByScript.has(order))).toBe(true);

    const map51ExitCells = cellsForMarker(map51World.world.collision, 3);
    expect(reachable(
      map51World.world.collision,
      { x: toMap51!.tileX, y: toMap51!.tileY },
      map51ExitCells,
    )).toBe(true);
    const toMap1 = resolveMapTransition(map51, 3, 0, flags.gameFlags, flags.questFlags);
    expect(toMap1).toMatchObject({ mapId: 1, tileX: 47, tileY: 29, scriptIndex: 2 });

    const map1Collision = parseBaseCollisionData(map1CollisionRaw);
    expect(reachable(
      map1Collision,
      { x: toMap1!.tileX, y: toMap1!.tileY },
      cellsForMarker(map1Collision, 1),
    )).toBe(true);
    const toMap3 = resolveMapTransition(map1, 1, 0, flags.gameFlags, flags.questFlags);
    expect(toMap3).toMatchObject({ mapId: 3, tileX: 3, tileY: 14, scriptIndex: 0 });

    const map3World = applyInitialMapEventState(
      world(map3Raw, map3CollisionRaw),
      map3,
      flags.gameFlags,
      parseMapDecorationData(map3DecorationsRaw),
    );
    expect(map3World.actionBlockIndex).toBe(0);
    expect(map3World.visibleNpcSourceOrders.size).toBe(0);
    const map3ExitCells = cellsForMarker(map3World.world.collision, 4);
    expect(reachable(
      map3World.world.collision,
      { x: toMap3!.tileX, y: toMap3!.tileY },
      map3ExitCells,
    )).toBe(true);
    const toMap4 = resolveMapTransition(
      map3,
      map3World.world.collision.values[31][34],
      0,
      flags.gameFlags,
      flags.questFlags,
    );
    expect(toMap4).toMatchObject({ mapId: 4, tileX: 14, tileY: 36, scriptIndex: 2 });

    // The map-4 material route awards items 4–6 on maps 5–7 before opening
    // the map-8 gate. Enemy occupancy and combat are omitted throughout.
    const map4 = eventData(map04EventsRaw);
    const map4Collision = parseBaseCollisionData(map04CollisionRaw);
    let inventory: InventoryStack[] = [];
    expect(reachable(
      map4Collision,
      { x: toMap4!.tileX, y: toMap4!.tileY },
      cellsForMarker(map4Collision, 2),
    )).toBe(true);
    const toMap5 = resolveMapTransition(
      map4, 2, 0, flags.gameFlags, flags.questFlags,
      { allowSkippedCommands: true, inventory },
    );
    expect(toMap5).toMatchObject({ mapId: 5, tileX: 13, tileY: 13, scriptIndex: 1 });

    const map5 = eventData(map05EventsRaw);
    const map5Collision = parseBaseCollisionData(map05CollisionRaw);
    expect(reachable(
      map5Collision,
      { x: toMap5!.tileX, y: toMap5!.tileY },
      cellsForMarker(map5Collision, 2),
    )).toBe(true);
    const map5RewardScript = resolveTriggerScript(
      map5, 2, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(map5RewardScript?.scriptIndex).toBe(1);
    const map5Reward = runSupportedCutscene(map5, map5RewardScript!, map05Raw, inventory);
    expect(map5Reward.status).toBe('transfer');
    expect(map5Reward.transition).toMatchObject({ mapId: 4, tileX: 3, tileY: 12 });
    expect(map5Reward.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 70 },
    ]);
    flags = applyEventFlagChanges(flags, map5Reward.flagChanges);
    inventory = map5Reward.inventory;
    expect(inventory).toEqual([{ category: 20, itemId: 4, count: 1 }]);

    expect(reachable(
      map4Collision,
      { x: 3, y: 12 },
      cellsForMarker(map4Collision, 3),
    )).toBe(true);
    const toMap6 = resolveMapTransition(
      map4, 3, 0, flags.gameFlags, flags.questFlags,
      { allowSkippedCommands: true, inventory },
    );
    expect(toMap6).toMatchObject({ mapId: 6, tileX: 8, tileY: 14, scriptIndex: 2 });

    const map6 = eventData(map06EventsRaw);
    const map6Collision = parseBaseCollisionData(map06CollisionRaw);
    expect(reachable(
      map6Collision,
      { x: toMap6!.tileX, y: toMap6!.tileY },
      cellsForMarker(map6Collision, 2),
    )).toBe(true);
    const map6RewardScript = resolveTriggerScript(
      map6, 2, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(map6RewardScript?.scriptIndex).toBe(1);
    const map6Reward = runSupportedCutscene(map6, map6RewardScript!, map06Raw, inventory);
    expect(map6Reward.status).toBe('transfer');
    expect(map6Reward.transition).toMatchObject({ mapId: 4, tileX: 14, tileY: 2 });
    expect(map6Reward.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 71 },
    ]);
    flags = applyEventFlagChanges(flags, map6Reward.flagChanges);
    inventory = map6Reward.inventory;
    expect(inventory).toEqual([
      { category: 20, itemId: 4, count: 1 },
      { category: 20, itemId: 5, count: 1 },
    ]);

    expect(reachable(
      map4Collision,
      { x: 14, y: 2 },
      cellsForMarker(map4Collision, 4),
    )).toBe(true);
    const toMap7 = resolveMapTransition(
      map4, 4, 0, flags.gameFlags, flags.questFlags,
      { allowSkippedCommands: true, inventory },
    );
    expect(toMap7).toMatchObject({ mapId: 7, tileX: 3, tileY: 14, scriptIndex: 3 });

    const map7 = eventData(map07EventsRaw);
    const map7Collision = parseBaseCollisionData(map07CollisionRaw);
    expect(reachable(
      map7Collision,
      { x: toMap7!.tileX, y: toMap7!.tileY },
      cellsForMarker(map7Collision, 2),
    )).toBe(true);
    const map7RewardScript = resolveTriggerScript(
      map7, 2, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(map7RewardScript?.scriptIndex).toBe(1);
    const map7Reward = runSupportedCutscene(map7, map7RewardScript!, map07Raw, inventory);
    expect(map7Reward.status).toBe('transfer');
    expect(map7Reward.transition).toMatchObject({ mapId: 4, tileX: 25, tileY: 12 });
    expect(map7Reward.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 72 },
    ]);
    flags = applyEventFlagChanges(flags, map7Reward.flagChanges);
    inventory = map7Reward.inventory;
    expect(inventory).toEqual([
      { category: 20, itemId: 4, count: 1 },
      { category: 20, itemId: 5, count: 1 },
      { category: 20, itemId: 6, count: 1 },
    ]);

    expect(reachable(
      map4Collision,
      { x: 25, y: 12 },
      cellsForMarker(map4Collision, 5),
    )).toBe(true);
    const map4GateScript = resolveTriggerScript(
      map4, 5, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(map4GateScript?.scriptIndex).toBe(4);
    const map4Gate = runSupportedCutscene(map4, map4GateScript!, map04Raw, inventory);
    expect(map4Gate.status).toBe('transfer');
    expect(map4Gate.transition).toMatchObject({ mapId: 8, tileX: 9, tileY: 15 });
    inventory = map4Gate.inventory;
    expect(inventory).toEqual([]);

    const map8 = eventData(map08EventsRaw);
    const map8Collision = parseBaseCollisionData(map08CollisionRaw);
    expect(map8Collision.values[15][9]).toBe(1);
    const map8EntryScript = resolveTriggerScript(
      map8, 1, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(map8EntryScript?.scriptIndex).toBe(0);
    const map8Entry = runSupportedCutscene(map8, map8EntryScript!, map08Raw, inventory);
    expect(map8Entry.status).toBe('transfer');
    expect(map8Entry.transition).toMatchObject({ mapId: 11, tileX: 10, tileY: 10 });
    expect(map8Entry.flagChanges).toEqual([
      { flagSet: 'game', operation: 'set', flagIndex: 73 },
    ]);
    flags = applyEventFlagChanges(flags, map8Entry.flagChanges);

    // Assume the source-created map-11 CB is defeated; its removal callback
    // dispatches marker 1 and flag 73 selects the map-13 route.
    const map11 = addSourceConstructedMapEnemies(11, eventData(map11EventsRaw));
    expect(map11.enemyPlacements.find(({ sourceBehavior }) => sourceBehavior === 'map11-cb'))
      .toMatchObject({ directTypeZeroMarkerOnRemoval: 1, deathUpdatesBeforeRemoval: 24 });
    const toMap13 = resolveMapTransition(map11, 1, 0, flags.gameFlags, flags.questFlags);
    expect(toMap13).toMatchObject({ mapId: 13, tileX: 10, tileY: 10, scriptIndex: 1 });

    // Assume AQ and its linked AF/BC/CC wave are defeated; AF's source
    // removal callback dispatches marker 1 to the flag-73 map-15 branch.
    const map13 = addSourceMap13SecondWaveEnemies(
      addSourceConstructedMapEnemies(13, eventData(map13EventsRaw)),
    );
    const map13Af = map13.enemyPlacements.find(({ sourceBehavior }) => sourceBehavior === 'map13-af');
    expect(map13Af).toMatchObject({ directTypeZeroMarkerOnRemoval: 1, deathUpdatesBeforeRemoval: 24 });
    const toMap15AfterBosses = resolveMapTransition(
      map13, map13Af!.directTypeZeroMarkerOnRemoval!, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap15AfterBosses).toMatchObject({ mapId: 15, tileX: 7, tileY: 10, scriptIndex: 1 });

    // Assume the linked map-15 encounter and map-82 `bu` are defeated. Their
    // source callbacks route through marker 1, and flag 73 selects the ending.
    const toMap82AfterBosses = resolveMapTransition(
      map15, 1, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap82AfterBosses).toMatchObject({ mapId: 82, tileX: 7, tileY: 14, scriptIndex: 0 });
    const toMap8Ending = resolveMapTransition(
      map82WithBoss, 1, 0, flags.gameFlags, flags.questFlags,
    );
    expect(toMap8Ending).toMatchObject({ mapId: 8, tileX: 9, tileY: 10, scriptIndex: 1 });
    expect(map8Collision.values[toMap8Ending!.tileY][toMap8Ending!.tileX]).toBe(2);
    const endingScript = resolveTriggerScript(
      map8, 2, 0, flags.gameFlags, flags.questFlags, inventory,
    );
    expect(endingScript?.scriptIndex).toBe(1);
    const endingCutscene = runSupportedCutscene(map8, endingScript!, map08Raw, inventory);
    expect(endingCutscene.status).toBe('ending');
    expect(endingCutscene.flagChanges).toEqual([
      { flagSet: 'quest', operation: 'set', flagIndex: 17 },
    ]);
}

describe('conditional map-15 continuation route', () => {
  it('models the M210 map-42 loop through map 15 and the conditional route to the ending', () => {
    continueM210Map42Route({
      gameFlags: new Set([0, 1, 3, 5, 6, 54, 75, 87]),
      questFlags: new Set([1, 2, 4]),
    });
  });
});

describe('M203 fresh New Game map-3 route and continuation', () => {
  it('models both map-3 gates and joins the return route to the map-42 ending branch', () => {
    const flags: EventFlagState = {
      gameFlags: new Set([0, 1, 3, 5, 6, 54, 75, 87]),
      questFlags: new Set([1, 2, 4]),
    };
    const map3 = eventData(map3EventsRaw);
    const map3Entry = applyInitialMapEventState(
      world(map3Raw, map3CollisionRaw),
      map3,
      flags.gameFlags,
      parseMapDecorationData(map3DecorationsRaw),
    );

    // M203 ends at map 3/(3,14) in an empty-storage New Game with these flags.
    // Neither map-3 gate flag is set, so both corridor NPCs remain present.
    expect(map3Entry.actionBlockIndex).toBeUndefined();
    expect([...map3Entry.visibleNpcSourceOrders]).toEqual([0, 1]);
    const map3OccupiedCells = occupiedEventCells(
      map3,
      map3Entry.world.collision,
      map3Entry.visibleNpcSourceOrders,
      map3Entry.enemyPlacements,
    );
    expect(reachable(
      map3Entry.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(map3Entry.world.collision, 4),
      map3OccupiedCells,
    )).toBe(false);

    // Marker 6's script can set flag 69, but this is not a fresh-run shortcut:
    // M203's visible NPCs block the path even with enemies held at spawn.
    const map3Marker6 = resolveTriggerScript(
      map3, 6, 0, flags.gameFlags, flags.questFlags,
    );
    expect(map3Marker6?.scriptIndex).toBe(5);
    expect(reachable(
      map3Entry.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(map3Entry.world.collision, 6),
    )).toBe(true);
    const map3EnemyOnlyOccupiedCells = occupiedEventCells(
      map3,
      map3Entry.world.collision,
      new Set<number>(),
      map3Entry.enemyPlacements,
    );
    expect(reachable(
      map3Entry.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(map3Entry.world.collision, 6),
      map3EnemyOnlyOccupiedCells,
    )).toBe(true);
    expect(reachable(
      map3Entry.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(map3Entry.world.collision, 6),
      map3OccupiedCells,
    )).toBe(false);
    expect(canRunEventCutscene(
      map3Marker6!.commands,
      map3.npcPlacements.length,
      { width: map3Entry.world.map.width, height: map3Entry.world.map.height },
    )).toBe(true);
    expect(resolveEventScriptEffects(map3, map3Marker6!.scriptIndex, {
      allowSkippedCommands: true,
    })?.flagChanges).toContainEqual({ flagSet: 'game', operation: 'set', flagIndex: 69 });

    // The blocked map-4 exit does not trap the route. M203's arrival can
    // return through marker 1, then use map 1's marker 3 side route.
    let routeFlags = flags;
    expect(reachable(
      map3Entry.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(map3Entry.world.collision, 1),
      map3OccupiedCells,
    )).toBe(true);
    const toMap1 = resolveMapTransition(map3, 1, 0, routeFlags.gameFlags, routeFlags.questFlags);
    expect(toMap1).toMatchObject({ mapId: 1, tileX: 3, tileY: 37, scriptIndex: 0 });
    routeFlags = applyEventFlagChanges(routeFlags, toMap1!.flagChanges);
    const map1 = eventData(map1EventsRaw);
    const map1Collision = parseBaseCollisionData(map1CollisionRaw);
    expect(map1.npcPlacements).toHaveLength(0);
    expect(reachable(
      map1Collision,
      { x: toMap1!.tileX, y: toMap1!.tileY },
      cellsForMarker(map1Collision, 3),
    )).toBe(true);
    const toMap51 = resolveMapTransition(map1, 3, 0, routeFlags.gameFlags, routeFlags.questFlags);
    expect(toMap51).toMatchObject({ mapId: 51, tileX: 2, tileY: 26, scriptIndex: 2 });
    routeFlags = applyEventFlagChanges(routeFlags, toMap51!.flagChanges);

    const map51 = eventData(map51EventsRaw);
    const map51Entry = applyInitialMapEventState(
      world(map51Raw, map51CollisionRaw),
      map51,
      routeFlags.gameFlags,
      parseMapDecorationData(map51DecorationsRaw),
    );
    expect(map51Entry.actionBlockIndex).toBe(1);
    const map51OccupiedCells = occupiedEventCells(
      map51,
      map51Entry.world.collision,
      map51Entry.visibleNpcSourceOrders,
      map51Entry.enemyPlacements,
    );
    const map51NorthApproach = passableCellsAdjacentToMarker(
      map51Entry.world.collision,
      -1,
    );
    expect(reachable(
      map51Entry.world.collision,
      { x: toMap51!.tileX, y: toMap51!.tileY },
      map51NorthApproach,
      map51OccupiedCells,
    )).toBe(true);
    const toMap31 = resolveMapTransition(
      map51,
      -1,
      3,
      routeFlags.gameFlags,
      routeFlags.questFlags,
    );
    expect(toMap31).toMatchObject({ mapId: 31, tileX: 7, tileY: 17, scriptIndex: 0 });
    routeFlags = applyEventFlagChanges(routeFlags, toMap31!.flagChanges);

    // Continue through the checkpointed M208–M210 corridor using its
    // generated event selectors, base collision grids, and static actor cells.
    const map41 = eventData(map41EventsRaw);
    const laterMaps = [
      { id: 31, events: eventData(map31EventsRaw), collision: parseBaseCollisionData(map31CollisionRaw), start: { x: 7, y: 17 }, marker: 2, triggerType: 0, next: [34, 7, 17] },
      { id: 34, events: eventData(map34EventsRaw), collision: parseBaseCollisionData(map34CollisionRaw), start: { x: 7, y: 17 }, marker: 4, triggerType: 0, next: [35, 2, 8] },
      { id: 35, events: eventData(map35EventsRaw), collision: parseBaseCollisionData(map35CollisionRaw), start: { x: 2, y: 8 }, marker: 3, triggerType: 0, next: [38, 7, 17] },
      { id: 38, events: eventData(map38EventsRaw), collision: parseBaseCollisionData(map38CollisionRaw), start: { x: 7, y: 17 }, marker: 2, triggerType: 0, next: [40, 7, 17] },
      { id: 40, events: eventData(map40EventsRaw), collision: parseBaseCollisionData(map40CollisionRaw), start: { x: 7, y: 17 }, marker: -2, triggerType: 2, next: [41, 32, 3] },
      { id: 41, events: map41, collision: parseBaseCollisionData(map41CollisionRaw), start: { x: 32, y: 3 }, marker: 2, triggerType: 0, next: [42, 37, 3] },
    ] as const;
    for (const leg of laterMaps) {
      expect(leg.events.descriptors).toHaveLength(0);
      const occupiedCells = occupiedEventCells(
        leg.events,
        leg.collision,
        new Set(leg.events.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
      );
      expect(reachable(
        leg.collision,
        leg.start,
        leg.marker < 0
          ? passableCellsAdjacentToMarker(leg.collision, leg.marker)
          : cellsForMarker(leg.collision, leg.marker),
        occupiedCells,
      )).toBe(true);
      const transfer = resolveMapTransition(
        leg.events,
        leg.marker,
        leg.triggerType,
        routeFlags.gameFlags,
        routeFlags.questFlags,
      );
      expect(transfer).toMatchObject({
        mapId: leg.next[0],
        tileX: leg.next[1],
        tileY: leg.next[2],
      });
      routeFlags = applyEventFlagChanges(routeFlags, transfer!.flagChanges);
    }
    expect([...routeFlags.gameFlags].sort((a, b) => a - b))
      .toEqual([...flags.gameFlags].sort((a, b) => a - b));
    expect([...routeFlags.questFlags].sort((a, b) => a - b))
      .toEqual([...flags.questFlags].sort((a, b) => a - b));

    // The M203 return route reaches M210's exact map-42 upper checkpoint.
    // Continue the same modeled campaign segment through map 15 and the ending.
    expect(laterMaps[laterMaps.length - 1].next).toEqual([42, 37, 3]);
    continueM210Map42Route(routeFlags);

    // The map-3 marker-6 event can also set flag 69; re-entering map 3 then
    // selects the same source startup block and opens the marker-4 corridor.
    const flag69Map3 = applyInitialMapEventState(
      world(map3Raw, map3CollisionRaw),
      map3,
      new Set([...flags.gameFlags, 69]),
      parseMapDecorationData(map3DecorationsRaw),
    );
    expect(flag69Map3.actionBlockIndex).toBe(1);
    expect(flag69Map3.visibleNpcSourceOrders.size).toBe(0);
    const flag69OccupiedCells = occupiedEventCells(
      map3,
      flag69Map3.world.collision,
      flag69Map3.visibleNpcSourceOrders,
      flag69Map3.enemyPlacements,
    );
    const flag69Marker4 = flag69Map3.world.collision.values[31][34];
    expect(flag69Marker4).toBe(4);
    expect(reachable(
      flag69Map3.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(flag69Map3.world.collision, flag69Marker4),
      flag69OccupiedCells,
    )).toBe(true);
    expect(resolveMapTransition(
      map3, flag69Marker4, 0,
      new Set([...flags.gameFlags, 69]),
      flags.questFlags,
    )).toMatchObject({ mapId: 4, tileX: 14, tileY: 36, scriptIndex: 2 });

    // Map-51 script 7 sets flag 53. Map-3 startup block 0 then hides both
    // NPCs and opens the same static route to marker 4.
    const continuationFlags: EventFlagState = {
      gameFlags: new Set([...flags.gameFlags, 53]),
      questFlags: flags.questFlags,
    };
    const openMap3 = applyInitialMapEventState(
      world(map3Raw, map3CollisionRaw),
      map3,
      continuationFlags.gameFlags,
      parseMapDecorationData(map3DecorationsRaw),
    );
    expect(openMap3.actionBlockIndex).toBe(0);
    expect(openMap3.visibleNpcSourceOrders.size).toBe(0);
    const openMap3OccupiedCells = occupiedEventCells(
      map3,
      openMap3.world.collision,
      openMap3.visibleNpcSourceOrders,
      openMap3.enemyPlacements,
    );
    expect(reachable(
      openMap3.world.collision,
      { x: 3, y: 14 },
      cellsForMarker(openMap3.world.collision, 4),
      openMap3OccupiedCells,
    )).toBe(true);
    const marker4 = openMap3.world.collision.values[31][34];
    expect(marker4).toBe(4);
    const toMap4 = resolveMapTransition(
      map3, marker4, 0, continuationFlags.gameFlags, continuationFlags.questFlags,
    );
    expect(toMap4).toMatchObject({ mapId: 4, tileX: 14, tileY: 36, scriptIndex: 2 });

    // Continue from the generated map-4 arrival with source actor occupancy.
    // Enemies are held at their entry placements; movement and combat are not simulated.
    const map4Events = eventData(map04EventsRaw);
    const map4Collision = parseBaseCollisionData(map04CollisionRaw);
    const map4OccupiedCells = occupiedEventCells(
      map4Events,
      map4Collision,
      new Set(map4Events.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
    );
    expect(reachable(
      map4Collision,
      { x: toMap4!.tileX, y: toMap4!.tileY },
      cellsForMarker(map4Collision, 2),
      map4OccupiedCells,
    )).toBe(true);
    const toMap5 = resolveMapTransition(
      map4Events, 2, 0,
      continuationFlags.gameFlags, continuationFlags.questFlags,
      { allowSkippedCommands: true, inventory: [] },
    );
    expect(toMap5).toMatchObject({ mapId: 5, tileX: 13, tileY: 13, scriptIndex: 1 });
  });
});

describe('M180 map-1 portal continuation', () => {
  it('reaches the map-3 portal marker from the recorded New Game arrival with frozen source enemies', () => {
    const flags: EventFlagState = {
      gameFlags: new Set([0, 1, 3, 5, 6, 54, 75, 87]),
      questFlags: new Set([1, 2, 4]),
    };
    const map1 = eventData(map1EventsRaw);
    const map1Collision = parseBaseCollisionData(map1CollisionRaw);
    expect(map1.enemyPlacements).toHaveLength(18);
    expect(map1.enemyPlacements.every(({ enemyId }) => enemyId === 3)).toBe(true);
    const occupiedCells = occupiedEventCells(
      map1,
      map1Collision,
      new Set(map1.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
    );
    const map1Enemies = createEnemyCombatants(map1.enemyPlacements, sourceEnemyData);
    const enemyAcquisitionCells = new Set<number>();
    for (let y = 0; y < map1Collision.height; y += 1) {
      for (let x = 0; x < map1Collision.width; x += 1) {
        if (map1Enemies.some((enemy) =>
          Math.abs(x - enemy.tileX) <= enemy.definition.acquisitionRange &&
          Math.abs(y - enemy.tileY) <= enemy.definition.acquisitionRange,
        )) enemyAcquisitionCells.add(y * map1Collision.width + x);
      }
    }

    // M180 records a fresh New Game arrival at map 1/(2,17), level 5, with
    // these flags. Its subsequent marker-1 walk attempts returned to the title.
    // The base-grid route exists with fixed enemy cells, but the source
    // acquisition ranges leave no route that avoids every enemy after entry.
    expect(reachable(
      map1Collision,
      { x: 2, y: 17 },
      cellsForMarker(map1Collision, 1),
      occupiedCells,
    )).toBe(true);
    expect(reachable(
      map1Collision,
      { x: 2, y: 17 },
      cellsForMarker(map1Collision, 1),
      new Set([...occupiedCells, ...enemyAcquisitionCells]),
    )).toBe(false);
    expect(resolveMapTransition(
      map1, 1, 0, flags.gameFlags, flags.questFlags,
    )).toMatchObject({ mapId: 3, tileX: 3, tileY: 14, scriptIndex: 0 });
  });
});

describe('M345 map-53 through map-1 flag-49 route model', () => {
  it('models map-53 item acquisition through the map-13 return and flag-49 transfer', () => {
    let flags: EventFlagState = {
      // M92's map-53 arrival flags with an empty inventory for these modeled
      // pickups. This checkpoint does not establish New Game reachability.
      gameFlags: new Set([0, 27, 31, 82]),
      questFlags: new Set([1, 2, 4]),
    };
    let inventory: InventoryStack[] = [];
    const play = (
      events: EventOperationData,
      marker: number,
      triggerType: 0 | 1 | 2 | 3,
      mapRaw: unknown,
    ) => {
      const selection = resolveTriggerScript(
        events, marker, triggerType, flags.gameFlags, flags.questFlags, inventory,
      );
      expect(selection, `marker ${marker} type ${triggerType}`).toBeDefined();
      const state = runSupportedCutscene(events, selection!, mapRaw, inventory);
      expect(['ended', 'transfer']).toContain(state.status);
      flags = applyEventFlagChanges(flags, state.flagChanges);
      inventory = state.inventory;
      return { selection: selection!, state };
    };

    const map53 = eventData(map53EventsRaw);
    const map53Entry = applyInitialMapEventState(
      world(map53Raw, map53CollisionRaw),
      map53,
      flags.gameFlags,
      parseMapDecorationData(map53DecorationsRaw),
    );
    expect(map53Entry.actionBlockIndex).toBeUndefined();
    let map53World = map53Entry.world;
    const map53Arrival = { x: 19, y: 38 };
    expect(reachable(
      map53World.collision,
      map53Arrival,
      cellsForMarker(map53World.collision, 2),
    )).toBe(true);
    const map53Opening = play(map53, 2, 0, map53Raw);
    expect(map53Opening.selection.scriptIndex).toBe(1);
    expect(flags.gameFlags.has(32)).toBe(true);

    expect(reachable(
      map53World.collision,
      map53Arrival,
      passableCellsAdjacentToMarker(map53World.collision, -3),
    )).toBe(true);
    const firstMaterial = play(map53, -3, 2, map53Raw);
    expect(firstMaterial.selection.scriptIndex).toBe(3);
    expect(inventory).toContainEqual({ category: 21, itemId: 2, count: 1 });
    expect(flags.gameFlags.has(33)).toBe(true);

    expect(reachable(
      map53World.collision,
      { x: 36, y: 19 },
      passableCellsAdjacentToMarker(map53World.collision, -6),
    )).toBe(true);
    const keyReward = play(map53, -6, 2, map53Raw);
    expect(keyReward.selection.scriptIndex).toBe(6);
    expect(inventory).toContainEqual({ category: 19, itemId: 9, count: 1 });
    expect(flags.gameFlags.has(39)).toBe(true);

    expect(reachable(
      map53World.collision,
      { x: 5, y: 19 },
      passableCellsAdjacentToMarker(map53World.collision, -7),
    )).toBe(true);
    const firstForge = play(map53, -7, 2, map53Raw);
    expect(firstForge.selection.scriptIndex).toBe(7);
    expect(firstForge.state.tileChanges).toHaveLength(8);
    expect(flags.gameFlags.has(34)).toBe(true);
    map53World = applyDynamicMapTileChanges(map53World, firstForge.state.tileChanges);
    expect(inventory).not.toContainEqual({ category: 21, itemId: 2, count: 1 });

    expect(reachable(
      map53World.collision,
      { x: 17, y: 14 },
      passableCellsAdjacentToMarker(map53World.collision, -4),
    )).toBe(true);
    const secondMaterial = play(map53, -4, 2, map53Raw);
    expect(secondMaterial.selection.scriptIndex).toBe(4);
    expect(inventory).toContainEqual({ category: 21, itemId: 2, count: 1 });
    expect(flags.gameFlags.has(35)).toBe(true);

    expect(reachable(
      map53World.collision,
      { x: 26, y: 29 },
      passableCellsAdjacentToMarker(map53World.collision, -7),
    )).toBe(true);
    const secondForge = play(map53, -7, 2, map53Raw);
    expect(secondForge.selection.scriptIndex).toBe(8);
    expect(secondForge.state.tileChanges).toHaveLength(6);
    expect(flags.gameFlags.has(36)).toBe(true);
    map53World = applyDynamicMapTileChanges(map53World, secondForge.state.tileChanges);
    expect(inventory).not.toContainEqual({ category: 21, itemId: 2, count: 1 });

    expect(reachable(
      map53World.collision,
      { x: 17, y: 14 },
      passableCellsAdjacentToMarker(map53World.collision, -5),
    )).toBe(true);
    const thirdMaterial = play(map53, -5, 2, map53Raw);
    expect(thirdMaterial.selection.scriptIndex).toBe(5);
    expect(inventory).toContainEqual({ category: 21, itemId: 2, count: 1 });
    expect(flags.gameFlags.has(37)).toBe(true);

    expect(reachable(
      map53World.collision,
      { x: 2, y: 4 },
      passableCellsAdjacentToMarker(map53World.collision, -7),
    )).toBe(true);
    const finalForge = play(map53, -7, 2, map53Raw);
    expect(finalForge.selection.scriptIndex).toBe(9);
    expect(flags.gameFlags.has(38)).toBe(true);
    expect(inventory).not.toContainEqual({ category: 21, itemId: 2, count: 1 });

    const toMap54 = play(map53, -7, 2, map53Raw);
    expect(toMap54.selection.scriptIndex).toBe(10);
    expect(toMap54.state.transition).toMatchObject({
      mapId: 54, entryDirectionIndex: 0, tileX: 17, tileY: 14,
    });

    const map54 = eventData(map54EventsRaw);
    const map54Collision = parseBaseCollisionData(map54CollisionRaw);
    const map54NpcCells = occupiedEventCells(
      map54,
      map54Collision,
      new Set(map54.npcPlacements.map(({ sourceOrder }) => sourceOrder)),
      [],
    );
    const map54Arrival = toMap54.state.transition!;
    expect(reachable(
      map54Collision,
      { x: map54Arrival.tileX, y: map54Arrival.tileY },
      passableCellsAdjacentToMarker(map54Collision, 2),
      map54NpcCells,
    )).toBe(true);
    expect(reachable(
      map54Collision,
      { x: map54Arrival.tileX, y: map54Arrival.tileY },
      passableCellsAdjacentToMarker(map54Collision, -4),
      map54NpcCells,
    )).toBe(true);
    expect(reachable(
      map54Collision,
      { x: map54Arrival.tileX, y: map54Arrival.tileY },
      cellsForMarker(map54Collision, 8),
      map54NpcCells,
    )).toBe(true);
    expect(reachable(
      map54Collision,
      { x: map54Arrival.tileX, y: map54Arrival.tileY },
      passableCellsAdjacentToMarker(map54Collision, -6),
      map54NpcCells,
    )).toBe(true);

    // The source NPC grants category-21/item-3. The switch checks this key,
    // then marker 8 turns flag 42 into the map-59 exit flag 46.
    const itemReward = play(map54, 2, 2, map54Raw);
    expect(itemReward.selection.scriptIndex).toBe(1);
    expect(inventory).toContainEqual({ category: 21, itemId: 3, count: 1 });
    expect(flags.gameFlags.has(40)).toBe(true);

    const map54Switch = play(map54, -4, 2, map54Raw);
    expect(map54Switch.selection.scriptIndex).toBe(5);
    expect(flags.gameFlags.has(42)).toBe(true);
    const exitFlag = play(map54, 8, 0, map54Raw);
    expect(exitFlag.selection.scriptIndex).toBe(13);
    expect(flags.gameFlags.has(46)).toBe(true);

    const toMap59 = play(map54, -6, 3, map54Raw);
    expect(toMap59.selection.scriptIndex).toBe(19);
    expect(toMap59.state.transition).toMatchObject({ mapId: 59, tileX: 10, tileY: 26 });

    const map59Collision = parseBaseCollisionData(map59CollisionRaw);
    expect(reachable(
      map59Collision,
      { x: toMap59.state.transition!.tileX, y: toMap59.state.transition!.tileY },
      passableCellsAdjacentToMarker(map59Collision, -2),
    )).toBe(true);
    const toMap12 = play(eventData(map59EventsRaw), -2, 3, map59Raw);
    expect(toMap12.selection.scriptIndex).toBe(1);
    expect(toMap12.state.transition).toMatchObject({ mapId: 12, tileX: 13, tileY: 13 });
    expect(inventory).not.toContainEqual({ category: 19, itemId: 9, count: 1 });
    expect(inventory).toContainEqual({ category: 21, itemId: 3, count: 1 });

    const map12Collision = parseBaseCollisionData(map12CollisionRaw);
    expect(map12Collision.values[13]?.[13]).toBe(1);
    const toMap13 = play(eventData(map12EventsRaw), 1, 0, map12Raw);
    expect(toMap13.selection.scriptIndex).toBe(0);
    expect(toMap13.state.transition).toMatchObject({ mapId: 13, tileX: 10, tileY: 10 });
    expect(flags.gameFlags.has(48)).toBe(true);
    expect(inventory).not.toContainEqual({ category: 21, itemId: 3, count: 1 });

    // Combat is intentionally assumed here. AF's source removal callback
    // dispatches map-13 marker 1; without flag 73, its default row returns to
    // map 12/(12,6), where marker 2 transfers to map 62.
    const map13 = addSourceMap13SecondWaveEnemies(
      addSourceConstructedMapEnemies(13, eventData(map13EventsRaw)),
    );
    const map13Af = map13.enemyPlacements.find(({ sourceBehavior }) => sourceBehavior === 'map13-af');
    expect(map13Af).toMatchObject({ directTypeZeroMarkerOnRemoval: 1, deathUpdatesBeforeRemoval: 24 });
    expect(flags.gameFlags.has(73)).toBe(false);
    const map13Return = resolveMapTransition(
      map13,
      map13Af!.directTypeZeroMarkerOnRemoval!,
      0,
      flags.gameFlags,
      flags.questFlags,
    );
    expect(map13Return).toMatchObject({ mapId: 12, tileX: 12, tileY: 6, scriptIndex: 0 });
    expect(map12Collision.values[6]?.[12]).toBe(2);

    const toMap62 = play(eventData(map12EventsRaw), 2, 0, map12Raw);
    expect(toMap62.selection.scriptIndex).toBe(1);
    expect(toMap62.state.transition).toMatchObject({ mapId: 62, tileX: 16, tileY: 2 });
    const map62Collision = parseBaseCollisionData(map62CollisionRaw);
    expect(map62Collision.values[2]?.[16]).toBe(5);

    const flag49 = play(eventData(map62EventsRaw), 5, 0, map62Raw);
    expect(flag49.selection.scriptIndex).toBe(5);
    expect(flag49.state.flagChanges).toContainEqual({
      flagSet: 'game', operation: 'set', flagIndex: 49,
    });
    expect(flags.gameFlags.has(49)).toBe(true);

    expect(reachable(
      map62Collision,
      { x: toMap62.state.transition!.tileX, y: toMap62.state.transition!.tileY },
      passableCellsAdjacentToMarker(map62Collision, -4),
    )).toBe(true);
    const toMap1 = play(eventData(map62EventsRaw), -4, 3, map62Raw);
    expect(toMap1.selection.scriptIndex).toBe(7);
    expect(toMap1.state.transition).toMatchObject({ mapId: 1, tileX: 2, tileY: 17 });
  });
});
