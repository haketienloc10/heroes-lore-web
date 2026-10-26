import { describe, expect, it } from 'vitest';
import type { EventOperationData } from '../src/world/event-data';
import {
  addSourceConstructedMapEnemies,
  addSourceMap13SecondWaveEnemies,
} from '../src/world/source-map-entities';

function events(enemyPlacements: EventOperationData['enemyPlacements'] = []): EventOperationData {
  return {
    format: 'heroes-lore-event-operations-raw-v1',
    npcImageIds: [],
    npcPlacements: [],
    enemyIds: enemyPlacements.map(({ enemyId }) => enemyId),
    enemyPlacements,
    triggerGroups: [],
    scripts: [],
    stringIds: [],
    descriptors: [],
    actionBlocks: [],
  };
}

describe('source-created map enemies', () => {
  it('adds map 11 enemy 32 with its source position, sprite, death delay, and removal callback', () => {
    const result = addSourceConstructedMapEnemies(11, events([
      { tileX: 4, tileY: 5, enemyId: 24, sourceOrder: 2 },
    ]));

    expect(result.enemyIds).toEqual([24, 32]);
    expect(result.enemyPlacements).toEqual([
      { tileX: 4, tileY: 5, enemyId: 24, sourceOrder: 2 },
      {
        tileX: 10,
        tileY: 9,
        enemyId: 32,
        sourceOrder: 3,
        spriteId: 0,
        renderSpriteId: 256,
        sourceBehavior: 'map11-cb',
        deathUpdatesBeforeRemoval: 24,
        directTypeZeroMarkerOnRemoval: 1,
      },
    ]);
  });

  it('does not change other maps and is idempotent on map 11', () => {
    const mapTen = events();
    expect(addSourceConstructedMapEnemies(10, mapTen)).toBe(mapTen);

    const first = addSourceConstructedMapEnemies(11, events());
    expect(addSourceConstructedMapEnemies(11, first)).toBe(first);
  });

  it('adds map 13 enemy 35 at the source spawn with its boss animation key', () => {
    const result = addSourceConstructedMapEnemies(13, events());
    expect(result.enemyIds).toEqual([35]);
    expect(result.enemyPlacements).toEqual([{
      tileX: 9,
      tileY: 5,
      enemyId: 35,
      sourceOrder: 0,
      spriteId: 0,
      renderSpriteId: 291,
      sourceBehavior: 'map13-aq',
    }]);
    expect(addSourceConstructedMapEnemies(13, result)).toBe(result);
  });

  it('adds map 82 enemy 42 with the source sprite slot and delayed type-0 removal callback', () => {
    const existing = events([
      { tileX: 4, tileY: 12, enemyId: 0, sourceOrder: 0 },
      { tileX: 10, tileY: 12, enemyId: 0, sourceOrder: 1 },
      { tileX: 5, tileY: 14, enemyId: 0, sourceOrder: 2 },
      { tileX: 9, tileY: 14, enemyId: 0, sourceOrder: 3 },
    ]);
    const result = addSourceConstructedMapEnemies(82, existing);

    expect(result.enemyIds).toEqual([0, 0, 0, 0, 42]);
    expect(result.enemyPlacements).toHaveLength(5);
    expect(result.enemyPlacements[4]).toEqual({
      tileX: 7,
      tileY: 10,
      enemyId: 42,
      sourceOrder: 4,
      spriteId: 1,
      sourceBehavior: 'map82-bu',
      deathUpdatesBeforeRemoval: 16,
      directTypeZeroMarkerOnRemoval: 1,
    });
    expect(addSourceConstructedMapEnemies(82, result)).toBe(result);
  });

  it('adds map 15 actors in loader order with subclass footprints and draw offsets', () => {
    const result = addSourceConstructedMapEnemies(15, events());
    expect(result.enemyIds).toEqual([40, 41, 39]);
    expect(result.enemyPlacements).toEqual([
      {
        tileX: 0,
        tileY: 12,
        enemyId: 40,
        sourceOrder: 0,
        spriteId: 1,
        renderSpriteId: 296,
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
        sourceOrder: 1,
        spriteId: 2,
        renderSpriteId: 297,
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
        sourceOrder: 2,
        spriteId: 0,
        renderSpriteId: 295,
        sourceBehavior: 'map15-cf',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map15-cf-encounter',
        deathUpdatesBeforeRemoval: 12,
      },
    ]);
    expect(addSourceConstructedMapEnemies(15, result)).toBe(result);
  });

  it('adds the linked map-13 follow-up group at the source positions and footprints', () => {
    const initial = addSourceConstructedMapEnemies(13, events());
    const result = addSourceMap13SecondWaveEnemies(initial);
    expect(result.enemyIds).toEqual([35, 36, 37, 38]);
    expect(result.enemyPlacements.slice(1)).toEqual([
      {
        tileX: 9,
        tileY: 5,
        enemyId: 36,
        sourceOrder: 1,
        spriteId: 1,
        renderSpriteId: 292,
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
        sourceOrder: 2,
        spriteId: 2,
        renderSpriteId: 293,
        sourceBehavior: 'map13-bc',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map13-stage-two',
      },
      {
        tileX: 13,
        tileY: 5,
        enemyId: 38,
        sourceOrder: 3,
        spriteId: 3,
        renderSpriteId: 294,
        sourceBehavior: 'map13-cc',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map13-stage-two',
      },
    ]);
    expect(addSourceMap13SecondWaveEnemies(result)).toBe(result);
  });
});
