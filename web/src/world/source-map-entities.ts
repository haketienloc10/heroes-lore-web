import type { EventEnemyPlacement, EventOperationData } from './event-data';
import {
  MAP11_CB_RENDER_SPRITE_ID,
  MAP13_AF_RENDER_SPRITE_ID,
  MAP13_AQ_RENDER_SPRITE_ID,
  MAP13_BC_RENDER_SPRITE_ID,
  MAP13_CC_RENDER_SPRITE_ID,
  MAP15_AJ_RENDER_SPRITE_ID,
  MAP15_AZ_RENDER_SPRITE_ID,
  MAP15_CF_RENDER_SPRITE_ID,
} from './boss-sprites';

/**
 * Add enemies constructed by the J2ME map loader rather than by an `.evt`
 * placement table. Map 11 creates `cb` at (10,9); map 13 creates `aq` at
 * (9,5). Their source subclasses use boss sprites and enemy data IDs 32/35.
 */
export function addSourceConstructedMapEnemies(
  mapId: number,
  events: EventOperationData,
): EventOperationData {
  if (mapId === 11) {
    if (events.enemyPlacements.some((placement) =>
      placement.enemyId === 32 && placement.tileX === 10 && placement.tileY === 9 &&
      placement.directTypeZeroMarkerOnRemoval === 1,
    )) return events;
    return appendSourceEnemy(events, {
      tileX: 10,
      tileY: 9,
      enemyId: 32,
      spriteId: 0,
      renderSpriteId: MAP11_CB_RENDER_SPRITE_ID,
      sourceBehavior: 'map11-cb',
      deathUpdatesBeforeRemoval: 24,
      directTypeZeroMarkerOnRemoval: 1,
    });
  }
  if (mapId === 13) {
    if (events.enemyPlacements.some((placement) =>
      placement.enemyId === 35 && placement.tileX === 9 && placement.tileY === 5 &&
      placement.sourceBehavior === 'map13-aq',
    )) return events;
    return appendSourceEnemy(events, {
      tileX: 9,
      tileY: 5,
      enemyId: 35,
      spriteId: 0,
      renderSpriteId: MAP13_AQ_RENDER_SPRITE_ID,
      sourceBehavior: 'map13-aq',
    });
  }
  if (mapId === 82) {
    if (events.enemyPlacements.some((placement) =>
      placement.enemyId === 42 && placement.tileX === 7 && placement.tileY === 10 &&
      placement.sourceBehavior === 'map82-bu',
    )) return events;
    return appendSourceEnemy(events, {
      tileX: 7,
      tileY: 10,
      enemyId: 42,
      spriteId: 1,
      sourceBehavior: 'map82-bu',
      // `bu.m()` sets inherited `ak.q` to 16; its `l()` callback dispatches marker 1.
      deathUpdatesBeforeRemoval: 16,
      directTypeZeroMarkerOnRemoval: 1,
    });
  }
  if (mapId === 15) {
    if (events.enemyPlacements.some((placement) =>
      placement.sourceGroupId === 'map15-cf-encounter')) return events;
    const sourceOrder = events.enemyPlacements.reduce(
      (next, placement) => Math.max(next, placement.sourceOrder + 1),
      0,
    );
    const encounter: EventEnemyPlacement[] = [
      {
        tileX: 0,
        tileY: 12,
        enemyId: 40,
        sourceOrder,
        spriteId: 1,
        renderSpriteId: MAP15_AZ_RENDER_SPRITE_ID,
        sourceBehavior: 'map15-az',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map15-cf-encounter',
        deathUpdatesBeforeRemoval: 0,
        sourceRenderOffsetY: -80,
      },
      {
        tileX: 13,
        tileY: 11,
        enemyId: 41,
        sourceOrder: sourceOrder + 1,
        spriteId: 2,
        renderSpriteId: MAP15_AJ_RENDER_SPRITE_ID,
        sourceBehavior: 'map15-aj',
        sourceFootprintWidth: 1,
        sourceGroupId: 'map15-cf-encounter',
        deathUpdatesBeforeRemoval: 0,
        sourceRenderOffsetY: -64,
      },
      {
        tileX: 7,
        tileY: 7,
        enemyId: 39,
        sourceOrder: sourceOrder + 2,
        spriteId: 0,
        renderSpriteId: MAP15_CF_RENDER_SPRITE_ID,
        sourceBehavior: 'map15-cf',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map15-cf-encounter',
        deathUpdatesBeforeRemoval: 12,
      },
    ];
    return {
      ...events,
      enemyIds: [...events.enemyIds, 40, 41, 39],
      enemyPlacements: [...events.enemyPlacements, ...encounter],
    };
  }
  return events;
}

/** Add the three linked `af`/`bc`/`cc` actors after `aq.l()` on map 13. */
export function addSourceMap13SecondWaveEnemies(events: EventOperationData): EventOperationData {
  if (events.enemyPlacements.some((placement) => placement.sourceGroupId === 'map13-stage-two')) {
    return events;
  }
  const sourceOrder = events.enemyPlacements.reduce(
    (next, placement) => Math.max(next, placement.sourceOrder + 1),
    0,
  );
  const wave: EventEnemyPlacement[] = [
    {
      tileX: 9,
      tileY: 5,
      enemyId: 36,
      sourceOrder,
      spriteId: 1,
      renderSpriteId: MAP13_AF_RENDER_SPRITE_ID,
      sourceBehavior: 'map13-af',
      sourceFootprintWidth: 3,
      sourceGroupId: 'map13-stage-two',
      deathUpdatesBeforeRemoval: 24,
      directTypeZeroMarkerOnRemoval: 1,
    },
    {
      tileX: 6,
      tileY: 5,
      enemyId: 37,
      sourceOrder: sourceOrder + 1,
      spriteId: 2,
      renderSpriteId: MAP13_BC_RENDER_SPRITE_ID,
      sourceBehavior: 'map13-bc',
      sourceFootprintWidth: 2,
      sourceGroupId: 'map13-stage-two',
    },
    {
      tileX: 13,
      tileY: 5,
      enemyId: 38,
      sourceOrder: sourceOrder + 2,
      spriteId: 3,
      renderSpriteId: MAP13_CC_RENDER_SPRITE_ID,
      sourceBehavior: 'map13-cc',
      sourceFootprintWidth: 2,
      sourceGroupId: 'map13-stage-two',
    },
  ];
  return {
    ...events,
    enemyIds: [...events.enemyIds, 36, 37, 38],
    enemyPlacements: [...events.enemyPlacements, ...wave],
  };
}

function appendSourceEnemy(
  events: EventOperationData,
  sourceEnemy: Omit<EventEnemyPlacement, 'sourceOrder'>,
): EventOperationData {
  const sourceOrder = events.enemyPlacements.reduce(
    (next, placement) => Math.max(next, placement.sourceOrder + 1),
    0,
  );
  const placement: EventEnemyPlacement = {
    ...sourceEnemy,
    sourceOrder,
  };
  return {
    ...events,
    enemyIds: [...events.enemyIds, placement.enemyId],
    enemyPlacements: [...events.enemyPlacements, placement],
  };
}
