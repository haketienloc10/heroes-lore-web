import { describe, expect, it } from 'vitest';
import map15CollisionAsset from '../public/assets/generated/collision/6/15.json';
import map15EventsAsset from '../public/assets/generated/event-operations/6/15.json';
import {
  actorOccupiedCellIndices,
  createPlayerActor,
  displaceActorFromSourceHit,
} from '../src/world/actor';
import {
  advanceEnemyDeathTick,
  createEnemyCombatants,
  parseEnemyDataTable,
  removeSourceMap15HazardCompanions,
  type EnemyCombatant,
} from '../src/world/combat';
import {
  parseEventOperationData,
  resolveMapTransition,
  type EventOperationData,
} from '../src/world/event-data';
import { canRunEventCutscene } from '../src/world/event-cutscene';
import {
  applyDynamicCollisionChanges,
  parseBaseCollisionData,
} from '../src/world/map-data';
import {
  advanceMap15AttackerAiTick,
  advanceMap15HazardAiTick,
  advanceMap15HazardDeathTick,
  enterMap15SourceDeathState,
  sourceMap15HazardCollisionWrites,
} from '../src/world/source-enemy-ai';
import { addSourceConstructedMapEnemies } from '../src/world/source-map-entities';

const table = parseEnemyDataTable({
  format: 'heroes-lore-enemy-data-v1',
  variant: 0,
  records: Array.from({ length: 43 }, (_, index) => ({
    index,
    labelToken: '596',
    baseCode: 55,
    packedAttributes: {
      classCode: [39, 40, 41].includes(index) ? 2 : 0,
      shapeCode: [39, 40, 41].includes(index) ? 2 : 0,
      elementCode: [39, 40, 41].includes(index) ? 3 : 0,
      variantCode: index === 39 ? 2 : 0,
    },
    statusFlags: { bit3: [39, 40, 41].includes(index) },
    maxHp: ({ 39: 14430, 40: 5910, 41: 5910 } as Record<number, number>)[index] ?? 100,
    attack: ({ 39: 210, 40: 200, 41: 200 } as Record<number, number>)[index] ?? 10,
    defense: ({ 39: 77, 40: 59, 41: 59 } as Record<number, number>)[index] ?? 5,
    evasion: ({ 39: 64, 40: 66, 41: 66 } as Record<number, number>)[index] ?? 0,
    behaviorCodes: ({
      39: [5, 11, 10],
      40: [5, 7, 10],
      41: [5, 11, 10],
    } as Record<number, [number, number, number]>)[index] ?? [5, 4, 6],
    respawnDelay: 40,
    dropCandidates: [],
  })),
});

function events(): EventOperationData {
  return {
    format: 'heroes-lore-event-operations-raw-v1',
    npcImageIds: [],
    npcPlacements: [],
    enemyIds: [],
    enemyPlacements: [],
    triggerGroups: [],
    scripts: [],
    stringIds: [],
    descriptors: [],
    actionBlocks: [],
  };
}

function map15Enemies(): EnemyCombatant[] {
  return createEnemyCombatants(
    addSourceConstructedMapEnemies(15, events()).enemyPlacements,
    table,
  );
}

function cfAi(enemy: EnemyCombatant): Extract<
  NonNullable<EnemyCombatant['sourceMap15Ai']>,
  { role: 'cf' }
> {
  const source = enemy.sourceMap15Ai;
  if (source?.role !== 'cf') throw new Error('Expected the map-15 cf hazard');
  return source;
}

function collision() {
  return {
    format: 'heroes-lore-base-collision-v1' as const,
    width: 16,
    height: 16,
    tileSize: 16 as const,
    values: Array.from({ length: 16 }, () => Array<number>(16).fill(0)),
    passabilityRule: 'non-negative cells are passable',
  };
}

function attackerAt(
  sourceOrder: number,
  state: 1 | 2 | 3,
  tick: number,
  phase: 1 | 2 = 1,
): EnemyCombatant {
  const enemy = map15Enemies().find((candidate) => candidate.sourceOrder === sourceOrder)!;
  const source = enemy.sourceMap15Ai!;
  if (source.role === 'cf') throw new Error('Expected a map-15 attacker');
  return {
    ...enemy,
    sourceMap15Ai: { ...source, state, tick, attackPhase: phase },
  };
}

describe('map-15 source actors', () => {
  it('constructs the two attackers before the linked hazard with their AU metadata', () => {
    const enemies = map15Enemies();
    expect(enemies.map(({ enemyId, sourceBehavior, sourceAu }) => [enemyId, sourceBehavior, sourceAu]))
      .toEqual([
        [40, 'map15-az', true],
        [41, 'map15-aj', true],
        [39, 'map15-cf', true],
      ]);
    expect(enemies.map(({ sourceFootprintWidth, deathUpdatesBeforeRemoval }) =>
      [sourceFootprintWidth, deathUpdatesBeforeRemoval])).toEqual([[2, 0], [1, 0], [2, 12]]);
    expect(enemies[0].sourceMap15Ai).toMatchObject({ role: 'az', state: 1, facing: 1 });
    expect(enemies[1].sourceMap15Ai).toMatchObject({ role: 'aj', state: 1, attackPhase: 2 });
    expect(enemies[2].sourceMap15Ai).toMatchObject({ role: 'cf', state: 2, hazardRow: null });
  });

  it('applies az and aj damage on their exact source attack frames and cell ranges', () => {
    const az = attackerAt(0, 3, 4);
    const azHit = advanceMap15AttackerAiTick(az, {
      playerTileX: 3,
      playerTileY: 12,
      rawRandomInteger: () => 1,
      idleFrameCount: 5,
      walkFrameCount: 5,
      attackFrameCountForDirection: () => 14,
    });
    expect(azHit).toMatchObject({ immediateHitPower: 200, enemy: { sourceMap15Ai: { tick: 5 } } });
    expect(advanceMap15AttackerAiTick(az, {
      playerTileX: 1,
      playerTileY: 12,
      rawRandomInteger: () => 1,
      idleFrameCount: 5,
      walkFrameCount: 5,
      attackFrameCountForDirection: () => 14,
    }).immediateHitPower).toBeUndefined();

    const ajFirst = attackerAt(1, 3, 4, 1);
    expect(advanceMap15AttackerAiTick(ajFirst, {
      playerTileX: 10,
      playerTileY: 11,
      rawRandomInteger: () => 1,
      idleFrameCount: 8,
      walkFrameCount: 8,
      attackFrameCountForDirection: (direction) => direction === 1 ? 11 : 14,
    })).toMatchObject({ immediateHitPower: 200, enemy: { sourceMap15Ai: { tick: 5 } } });

    const ajSecond = attackerAt(1, 3, 7, 2);
    expect(advanceMap15AttackerAiTick(ajSecond, {
      playerTileX: 9,
      playerTileY: 10,
      rawRandomInteger: () => 1,
      idleFrameCount: 8,
      walkFrameCount: 8,
      attackFrameCountForDirection: (direction) => direction === 1 ? 11 : 14,
    })).toMatchObject({
      immediateHitPower: 200,
      enemy: { sourceMap15Ai: { tick: 8, lifetimeTicks: 0 } },
    });
  });

  it('resets az lifetime on an in-range strike callback but not after a miss', () => {
    const az = attackerAt(0, 3, 4);
    az.sourceMap15Ai = { ...az.sourceMap15Ai!, lifetimeTicks: 120 } as NonNullable<EnemyCombatant['sourceMap15Ai']>;
    const context = {
      playerTileY: 12,
      rawRandomInteger: () => 1,
      idleFrameCount: 5,
      walkFrameCount: 5,
      attackFrameCountForDirection: () => 14,
    };

    expect(advanceMap15AttackerAiTick(az, { ...context, playerTileX: 3 })).toMatchObject({
      immediateHitPower: 200,
      enemy: { sourceMap15Ai: { lifetimeTicks: 0 } },
    });
    expect(advanceMap15AttackerAiTick(az, { ...context, playerTileX: 1 })).toMatchObject({
      enemy: { sourceMap15Ai: { lifetimeTicks: 121 } },
    });
  });

  it('emits the three source az camera offsets on attack frames 6 through 8', () => {
    const az = attackerAt(0, 3, 5);
    const frames = [5, 6, 7].map((tick) => advanceMap15AttackerAiTick({
      ...az,
      sourceMap15Ai: { ...az.sourceMap15Ai!, state: 3, tick } as NonNullable<EnemyCombatant['sourceMap15Ai']>,
    }, {
      playerTileX: 12,
      playerTileY: 0,
      rawRandomInteger: () => 1,
      idleFrameCount: 5,
      walkFrameCount: 5,
      attackFrameCountForDirection: () => 14,
    }).cameraShakeOffset);
    expect(frames).toEqual([{ x: 2, y: 3 }, { x: -3, y: -1 }, { x: 2, y: -3 }]);
  });

  it('moves az vertically by a half tile and reports occupancy changes', () => {
    const az = map15Enemies()[0];
    az.sourceMap15Ai = {
      ...az.sourceMap15Ai!,
      state: 1,
      tick: -1,
      attackDelay: 1,
      actionDelay: 0,
    } as NonNullable<EnemyCombatant['sourceMap15Ai']>;
    const result = advanceMap15AttackerAiTick(az, {
      playerTileX: 10,
      playerTileY: 16,
      rawRandomInteger: () => 1,
      idleFrameCount: 5,
      walkFrameCount: 5,
      attackFrameCountForDirection: () => 14,
    });
    expect(result).toMatchObject({
      occupancyChanged: true,
      enemy: { pixelY: 200, tileY: 12, sourceMap15Ai: { state: 2, facing: 2 } },
    });
  });

  it('sweeps the cf occupancy row and applies its source down-knockback and half-power tail', () => {
    const cf = map15Enemies()[2];
    cf.sourceMap15Ai = {
      ...cf.sourceMap15Ai!,
      state: 3,
      tick: 5,
    } as NonNullable<EnemyCombatant['sourceMap15Ai']>;
    const firstRow = advanceMap15HazardAiTick(cf, {
      playerTileX: 8,
      playerTileY: 7,
      idleFrameCount: 8,
      walkFrameCount: 14,
      attackFrameCount: 15,
    });
    expect(firstRow).toMatchObject({
      immediateHitPower: 210,
      knockbackDirection: 2,
      knockbackPixels: 16,
      occupancyChanged: true,
      enemy: { sourceMap15Ai: { tick: 6, hazardRow: 7 } },
    });
    expect(displaceActorFromSourceHit(createPlayerActor(8 * 16, 7 * 16), 2, 16).y)
      .toBe(8 * 16);

    const tail = advanceMap15HazardAiTick({
      ...cf,
      sourceMap15Ai: { ...cf.sourceMap15Ai!, state: 3, tick: 11 } as NonNullable<EnemyCombatant['sourceMap15Ai']>,
    }, {
      playerTileX: 8,
      playerTileY: 12,
      idleFrameCount: 8,
      walkFrameCount: 14,
      attackFrameCount: 15,
    });
    expect(tail).toMatchObject({
      immediateHitPower: 105,
      enemy: { sourceMap15Ai: { tick: 12, hazardRow: null } },
    });
    expect(tail.knockbackPixels).toBeUndefined();
  });

  it('checks both source occupancy rows while the player is halfway through a tile', () => {
    const cf = map15Enemies()[2];
    const halfwayPlayer = createPlayerActor(8 * 16, 7 * 16 + 8);
    const hit = advanceMap15HazardAiTick({
      ...cf,
      sourceMap15Ai: { ...cfAi(cf), state: 3, tick: 6 },
    }, {
      playerTileX: halfwayPlayer.x >> 4,
      playerTileY: halfwayPlayer.y >> 4,
      playerOccupiedCellIndices: actorOccupiedCellIndices(halfwayPlayer, 16),
      mapWidth: 16,
      idleFrameCount: 8,
      walkFrameCount: 14,
      attackFrameCount: 15,
    });
    expect(hit).toMatchObject({
      immediateHitPower: 210,
      enemy: { sourceMap15Ai: { tick: 7, hazardRow: 8 } },
    });
  });

  it('rests after three cf attacks and writes the final 4×3 collision region after q=12', () => {
    const cf = map15Enemies()[2];
    const resting = advanceMap15HazardAiTick({
      ...cf,
      sourceMap15Ai: {
        ...cfAi(cf),
        state: 1,
        tick: -1,
        attackDelay: 0,
        attacksSinceRest: 3,
      },
    }, {
      playerTileX: 0,
      playerTileY: 0,
      idleFrameCount: 8,
      walkFrameCount: 14,
      attackFrameCount: 15,
    });
    expect(resting.enemy.sourceMap15Ai).toMatchObject({
      role: 'cf',
      state: 1,
      attacksSinceRest: 0,
      attackDelay: 39,
    });

    let dying: EnemyCombatant = enterMap15SourceDeathState({
      ...cf,
      state: 'death-pending',
      deathUpdatesRemaining: 12,
      sourceMap15Ai: { ...cf.sourceMap15Ai!, hazardRow: 8 } as NonNullable<EnemyCombatant['sourceMap15Ai']>,
    });
    for (let update = 0; update < 12; update += 1) {
      dying = advanceMap15HazardDeathTick(dying);
      expect(dying.sourceMap15Ai).toMatchObject({ role: 'cf', collisionSettled: false });
    }
    expect(dying.deathUpdatesRemaining).toBe(0);
    dying = advanceMap15HazardDeathTick(dying);
    expect(dying.sourceMap15Ai).toMatchObject({ role: 'cf', collisionSettled: true });
    expect(advanceEnemyDeathTick([dying])[0].state).toBe('death-pending');
    const writes = sourceMap15HazardCollisionWrites(dying);
    expect(writes).toHaveLength(12);
    expect(writes.every(({ collisionValue }) => collisionValue === 1)).toBe(true);
    const changed = applyDynamicCollisionChanges(collision(), writes);
    expect(changed.values[7][6]).toBe(1);
    expect(changed.values[9][9]).toBe(1);
    expect(changed.values[6][6]).toBe(0);
  });

  it('activates map 15’s marker-1 transfer after cf settles its death collision writes', () => {
    const cf = map15Enemies()[2];
    let dying: EnemyCombatant = enterMap15SourceDeathState({
      ...cf,
      state: 'death-pending',
      deathUpdatesRemaining: 12,
    });
    for (let update = 0; update < 13; update += 1) {
      dying = advanceMap15HazardDeathTick(dying);
    }

    const collision = parseBaseCollisionData(map15CollisionAsset);
    const changed = applyDynamicCollisionChanges(collision, sourceMap15HazardCollisionWrites(dying));
    const marker = changed.values[9][8];
    const events = parseEventOperationData(map15EventsAsset);
    const transition = resolveMapTransition(events, marker, 0, new Set([0]));

    expect(marker).toBe(1);
    expect(transition).toEqual({
      mapId: 82,
      entryDirectionIndex: 0,
      tileX: 7,
      tileY: 14,
      scriptIndex: 0,
      flagChanges: [],
    });
    expect(canRunEventCutscene(
      events.scripts[transition!.scriptIndex],
      events.npcPlacements.length,
      { width: collision.width, height: collision.height },
      undefined,
      0,
    )).toBe(true);
  });

  it('removes az and aj together when the linked cf actor dies', () => {
    const enemies = map15Enemies();
    const removed = removeSourceMap15HazardCompanions(enemies, new Set([enemies[2].sourceOrder]));
    expect(removed.slice(0, 2).map(({ state }) => state)).toEqual(['removed', 'removed']);
    expect(removed[2].state).toBe('alive');
  });
});
