import { describe, expect, it } from 'vitest';
import {
  advanceActor,
  claimCurrentCellEventPoll,
  createPlayerActor,
  didReachMapEventBoundary,
  releaseActorDirection,
  releaseActorDirectionAndCheckBoundary,
  requestActorDirection,
  WORLD_UPDATE_PERIOD_MS,
} from '../src/world/actor';
import { createWorldGrid, type BaseCollisionData, type BaseMapData } from '../src/world/map-data';
import { EMPTY_PLAYER_COMBO, playerSpritePose } from '../src/world/player-combo';

const map: BaseMapData = {
  format: 'heroes-lore-map-v1',
  tilesetId: 15,
  width: 4,
  height: 4,
  tileSize: 16,
  tileIds: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
};

function worldWithCollision(values: number[][] = Array.from({ length: 4 }, () => [0, 0, 0, 0])) {
  const collision: BaseCollisionData = {
    format: 'heroes-lore-base-collision-v1',
    width: 4,
    height: 4,
    tileSize: 16,
    values,
    passabilityRule: 'base value >= 0',
  };
  return createWorldGrid(map, collision);
}

describe('source-shaped player movement', () => {
  it('creates a player with the source-selected map-entry facing', () => {
    expect(createPlayerActor(16, 32, 1).direction).toBe(1);
    expect(createPlayerActor(16, 32, 4).direction).toBe(4);
    expect(() => createPlayerActor(16, 32, 5 as 1)).toThrow(RangeError);
  });

  it('requests map-trigger checks at movement boundaries, but not on an idle map arrival', () => {
    const world = worldWithCollision();
    const idle = createPlayerActor(16, 16);
    expect(didReachMapEventBoundary(idle, idle)).toBe(false);

    const moving = requestActorDirection(idle, 4);
    const halfTile = advanceActor(world, moving, WORLD_UPDATE_PERIOD_MS);
    expect(didReachMapEventBoundary(moving, halfTile)).toBe(false);
    const nextTile = advanceActor(world, halfTile, WORLD_UPDATE_PERIOD_MS);
    expect(didReachMapEventBoundary(halfTile, nextTile)).toBe(true);

    const blockedWorld = worldWithCollision([
      [0, 0, 0, 0], [0, 0, -1, 0], [0, 0, 0, 0], [0, 0, 0, 0],
    ]);
    const blocked = advanceActor(blockedWorld, moving, WORLD_UPDATE_PERIOD_MS);
    expect(blocked.moving).toBe(false);
    expect(didReachMapEventBoundary(moving, blocked)).toBe(true);
  });

  it('polls the current-cell automatic event once until the actor moves', () => {
    const firstPoll = claimCurrentCellEventPoll(createPlayerActor(16, 16));
    expect(firstPoll.shouldPoll).toBe(true);
    expect(firstPoll.actor.currentCellEventPolled).toBe(true);

    const repeatedPoll = claimCurrentCellEventPoll(firstPoll.actor);
    expect(repeatedPoll.shouldPoll).toBe(false);
    expect(repeatedPoll.actor).toBe(firstPoll.actor);

    const moved = advanceActor(
      worldWithCollision(),
      requestActorDirection(firstPoll.actor, 4),
      WORLD_UPDATE_PERIOD_MS,
    );
    expect(moved.currentCellEventPolled).toBe(false);
  });

  it('keeps the current-cell poll latched when an outgoing move is blocked', () => {
    const polled = claimCurrentCellEventPoll(createPlayerActor(16, 16)).actor;
    const blockedWorld = worldWithCollision([
      [0, 0, 0, 0], [0, 0, -6, 0], [0, 0, 0, 0], [0, 0, 0, 0],
    ]);
    const moving = requestActorDirection(polled, 4);
    const blocked = advanceActor(blockedWorld, moving, WORLD_UPDATE_PERIOD_MS);

    expect(blocked).toMatchObject({
      x: 16,
      y: 16,
      moving: false,
      currentCellEventPolled: true,
    });
    expect(didReachMapEventBoundary(moving, blocked)).toBe(true);
  });

  it('moves in 8-pixel increments on the 71 ms update period', () => {
    const world = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 4);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 24, y: 16, moving: true, direction: 4 });
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 32, y: 16, moving: true });
  });

  it('resets and advances the source walk cursor on every movement start', () => {
    const world = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 2);
    expect(actor.animationFrame).toBe(-1);
    expect(playerSpritePose(EMPTY_PLAYER_COMBO, actor.direction, actor.moving, actor.animationFrame, false))
      .toMatchObject({ animationSlot: 1, directionSlot: 1, frameIndex: 0 });

    const frameSequence: number[] = [];
    for (let update = 0; update < 4; update += 1) {
      actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
      frameSequence.push(actor.animationFrame);
    }
    expect(frameSequence).toEqual([0, 1, 2, 3]);

    actor = releaseActorDirection(actor);
    expect(playerSpritePose(EMPTY_PLAYER_COMBO, actor.direction, actor.moving, actor.animationFrame, false))
      .toMatchObject({ animationSlot: 0, frameIndex: 0 });
    actor = requestActorDirection(actor, 4);
    expect(actor.animationFrame).toBe(-1);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor.animationFrame).toBe(0);
  });

  it('stops at a blocked next cell and preserves the facing direction', () => {
    const values = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    values[1][2] = -128;
    const world = worldWithCollision(values);
    let actor = requestActorDirection(createPlayerActor(16, 16), 4);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS * 3);
    expect(actor).toMatchObject({ x: 16, y: 16, moving: false, direction: 4 });
  });

  it('stops before an occupied entity cell', () => {
    const world = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 4);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS * 3, new Set([1 * 4 + 2]));
    expect(actor).toMatchObject({ x: 16, y: 16, moving: false, direction: 4 });
  });

  it('rechecks changed collision and occupancy snapshots at movement boundaries', () => {
    const blockedValues = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    blockedValues[1][2] = -1;
    const blockedWorld = worldWithCollision(blockedValues);
    const openWorld = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 4);

    actor = advanceActor(blockedWorld, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 16, y: 16, moving: false, direction: 4 });

    actor = requestActorDirection(actor, 4);
    actor = advanceActor(openWorld, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 24, y: 16, moving: true });
    actor = advanceActor(openWorld, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 32, y: 16, moving: true });

    const enemyOccupiesNextCell = new Set([1 * 4 + 3]);
    actor = advanceActor(openWorld, actor, WORLD_UPDATE_PERIOD_MS, enemyOccupiesNextCell);
    expect(actor).toMatchObject({ x: 32, y: 16, moving: false, direction: 4 });

    actor = requestActorDirection(actor, 4);
    actor = advanceActor(openWorld, actor, WORLD_UPDATE_PERIOD_MS, new Set());
    expect(actor).toMatchObject({ x: 40, y: 16, moving: true });
  });

  it('finishes the current tile before stopping after a mid-tile release', () => {
    const world = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 2);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    actor = releaseActorDirection(actor);
    expect(actor).toMatchObject({ x: 16, y: 24, moving: true, stopAfterTile: true });
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 16, y: 32, moving: false, stopAfterTile: false });
  });

  it('checks a map event when key release stops on an aligned tile', () => {
    const moving = requestActorDirection(createPlayerActor(16, 16), 4);
    const released = releaseActorDirectionAndCheckBoundary(moving);
    expect(released.actor).toMatchObject({ x: 16, y: 16, moving: false });
    expect(released.reachedMapEventBoundary).toBe(true);

    const midTile = advanceActor(worldWithCollision(), moving, WORLD_UPDATE_PERIOD_MS);
    const stoppedAfterTile = releaseActorDirectionAndCheckBoundary(midTile);
    expect(stoppedAfterTile.actor).toMatchObject({ x: 24, y: 16, moving: true, stopAfterTile: true });
    expect(stoppedAfterTile.reachedMapEventBoundary).toBe(false);
  });

  it('applies a queued direction at the next tile boundary', () => {
    const world = worldWithCollision();
    let actor = requestActorDirection(createPlayerActor(16, 16), 2);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    actor = requestActorDirection(actor, 4);
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 16, y: 32, direction: 2, queuedDirection: 4 });
    actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS);
    expect(actor).toMatchObject({ x: 24, y: 32, direction: 4, queuedDirection: null });
  });

  it('rejects invalid elapsed time', () => {
    expect(() => advanceActor(worldWithCollision(), createPlayerActor(), -1)).toThrow(RangeError);
  });
});
