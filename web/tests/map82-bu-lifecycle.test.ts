import { describe, expect, it } from 'vitest';
import map82EventsRaw from '../public/assets/generated/event-operations/6/82.json';
import map82CollisionRaw from '../public/assets/generated/collision/6/82.json';
import enemyData0Raw from '../public/assets/generated/enemy-data/data0.json';
import enemyAnimationsRaw from '../public/assets/generated/enemy-animations/catalog.json';
import map82Raw from '../public/assets/generated/maps/82.json';
import {
  advanceActor,
  createPlayerActor,
  releaseActorDirection,
  requestActorDirection,
} from '../src/world/actor';
import {
  advanceEnemyDeathTick,
  advanceEnemyDamageReaction,
  applySourceSkillDamage,
  beginEnemyDamageReaction,
  consumeEnemyAttackImpactFrame,
  createEnemyCombatants,
  enemyAttackImpactFrame,
  parseEnemyDataTable,
  resolveBasicAttack,
  resolveEnemyMeleeDefense,
  STARTER_RONIN_ATTACK,
  starterRoninDefenseForLevel,
} from '../src/world/combat';
import {
  parseEventOperationData,
  resolveMapTransition,
} from '../src/world/event-data';
import { parseBaseCollisionData, parseBaseMapData } from '../src/world/map-data';
import {
  findEnemyOccupyingSourceCell,
  selectPlayerAttackTargets,
  sourceEnemyOccupiesCell,
} from '../src/world/player-attack-targeting';
import {
  advanceEnemyBehaviorTick,
  enemyHasPlayerWithinFacingRange,
} from '../src/world/enemy-ai';
import {
  advanceEnemySpriteFrame,
  findEnemySpriteAnimation,
  findEnemySpriteTrack,
  parseEnemySpriteAnimationCatalog,
} from '../src/world/enemy-sprites';
import {
  advancePlayerSkillAction,
  createPlayerSkillActionState,
  restoreSkillResource,
  startPlayerSkillAction,
} from '../src/world/player-skill-action';
import { addSourceConstructedMapEnemies } from '../src/world/source-map-entities';
import { useSelectedConsumable } from '../src/world/loot';
import { WORLD_UPDATE_PERIOD_MS } from '../src/world/actor';
import {
  advancePlayerRecoveryTick,
  createPlayerRecoveryState,
} from '../src/world/player-recovery';
import { JavaRandom } from '../src/world/source-random';

describe('map-82 bu removal lifecycle', () => {
  it('uses repeated rank-5 class-6 Fireball pulses to reach source removal and both marker-1 branches', () => {
    const sourceEvents = addSourceConstructedMapEnemies(
      82,
      parseEventOperationData(map82EventsRaw),
    );
    const sourceEnemyData = parseEnemyDataTable(enemyData0Raw);
    expect(sourceEnemyData.records[42]).toMatchObject({
      index: 42,
      maxHp: 9050,
      attack: 10,
      defense: 70,
      classCode: 1,
      shapeCode: 2,
      elementCode: 3,
    });
    let combatants = createEnemyCombatants(
      sourceEvents.enemyPlacements,
      sourceEnemyData,
    );
    const selected = selectPlayerAttackTargets(
      combatants,
      7,
      11,
      1,
      6,
      { style: 'light', stage: 0, frame: 0 },
    );

    expect(selected.map(({ enemyId, sourceOrder, sourceAu }) => [enemyId, sourceOrder, sourceAu]))
      .toEqual([[42, 4, true]]);
    const buSourceOrder = selected[0]?.sourceOrder;
    if (buSourceOrder === undefined) return;

    const ordinaryAttack = resolveBasicAttack(combatants, buSourceOrder, {
      ...STARTER_RONIN_ATTACK,
      power: 16,
    }, 99);
    expect(ordinaryAttack.kind).toBe('hit');
    if (ordinaryAttack.kind !== 'hit') return;
    expect(ordinaryAttack).toMatchObject({ damage: 0, target: { hp: 9050, state: 'alive' } });

    let skillAction = advancePlayerSkillAction(
      createPlayerSkillActionState(0, 4, 5),
      56 * WORLD_UPDATE_PERIOD_MS,
    ).state;
    let fireballCastCount = 0;
    let fireballPulseCount = 0;
    let firstFireballDamage: number | undefined;
    while (fireballCastCount < 100 &&
      combatants.find(({ sourceOrder }) => sourceOrder === buSourceOrder)?.state === 'alive') {
      const action = startPlayerSkillAction(skillAction, 0, 7, 11, 1, 4);
      expect(action.accepted).toBe(true);
      skillAction = action.state;
      fireballCastCount += 1;
      let actionTicks = 0;
      while (skillAction.phase !== 0 && actionTicks < 64) {
        const step = advancePlayerSkillAction(skillAction, WORLD_UPDATE_PERIOD_MS);
        skillAction = step.state;
        for (const pulse of step.damagePulses) {
          if (pulse.tileX !== 7 || pulse.tileY !== 10) continue;
          const result = applySourceSkillDamage(
            combatants,
            buSourceOrder,
            pulse.power,
            pulse.elementCode,
          );
          if (result.kind !== 'hit') continue;
          firstFireballDamage ??= result.damage;
          fireballPulseCount += 1;
          combatants = result.combatants;
        }
        actionTicks += 1;
      }
      expect(skillAction.phase).toBe(0);
      if (combatants.find(({ sourceOrder }) => sourceOrder === buSourceOrder)?.state !== 'alive') break;
      for (let tick = 0; tick < 56 && skillAction.chargeTicksRemaining[0] > 0; tick += 1) {
        skillAction = advancePlayerSkillAction(skillAction, WORLD_UPDATE_PERIOD_MS).state;
      }
    }

    expect(fireballCastCount).toBe(60);
    expect(fireballPulseCount).toBe(120);
    expect(firstFireballDamage).toBe(76);
    const defeatedBu = combatants.find(({ sourceOrder }) => sourceOrder === buSourceOrder);
    expect(defeatedBu).toMatchObject({
      sourceAu: true,
      hp: 0,
      state: 'death-pending',
      deathUpdatesRemaining: 16,
    });
    if (defeatedBu === undefined) return;
    expect(beginEnemyDamageReaction(defeatedBu, 1)).toEqual(defeatedBu);

    let afterDeathTicks = combatants;
    for (let tick = 0; tick < 16; tick += 1) {
      afterDeathTicks = advanceEnemyDeathTick(afterDeathTicks);
    }
    expect(afterDeathTicks.find(({ sourceOrder }) => sourceOrder === buSourceOrder)).toMatchObject({
      state: 'death-pending',
      deathUpdatesRemaining: 0,
    });
    const removed = advanceEnemyDeathTick(afterDeathTicks);
    const removedBu = removed.find(({ sourceOrder }) => sourceOrder === buSourceOrder);
    expect(removedBu).toMatchObject({ state: 'removed', directTypeZeroMarkerOnRemoval: 1 });

    expect(resolveMapTransition(sourceEvents, removedBu!.directTypeZeroMarkerOnRemoval!, 0,
      new Set([0, 73]))).toMatchObject({ mapId: 8, tileX: 9, tileY: 10, scriptIndex: 1 });
    expect(resolveMapTransition(sourceEvents, removedBu!.directTypeZeroMarkerOnRemoval!, 0,
      new Set([0]))).toMatchObject({ mapId: 14, tileX: 14, tileY: 2, scriptIndex: 0 });
  });

  it('models why M293’s stationary 60-cast Fireball run is not an encounter simulation', () => {
    const events = addSourceConstructedMapEnemies(
      82,
      parseEventOperationData(map82EventsRaw),
    );
    const collision = parseBaseCollisionData(map82CollisionRaw);
    const enemyData = parseEnemyDataTable(enemyData0Raw);
    const animations = parseEnemySpriteAnimationCatalog(enemyAnimationsRaw);
    const playerTileX = 7;
    const playerTileY = 11;
    const buSourceOrder = events.enemyPlacements.find(({ sourceBehavior }) =>
      sourceBehavior === 'map82-bu')?.sourceOrder;
    if (buSourceOrder === undefined) throw new Error('Map 82 is missing its constructed BU actor');

    let enemies = createEnemyCombatants(events.enemyPlacements, enemyData);
    // Fresh Ronin HP attribute 5 at level 5: `(5 + level) * 12` source HP.
    let playerHp = (5 + 5) * 12;
    const defenseProfile = starterRoninDefenseForLevel(5);
    const rangeRandom = new JavaRandom(1337);
    const entityRandom = new JavaRandom(7331);
    let skill = {
      ...createPlayerSkillActionState(0, 4, 5),
      chargeTicksRemaining: [0, 280, 280] as [number, number, number],
    };
    let casts = 0;
    let damagingPulses = 0;
    let enemyHits = 0;
    let firstHitTick: number | null = null;
    let tick = 0;

    const occupiedCells = (): ReadonlySet<number> => {
      const occupied = new Set<number>();
      for (const enemy of enemies) {
        for (let y = 0; y < collision.height; y += 1) {
          for (let x = 0; x < collision.width; x += 1) {
            if (sourceEnemyOccupiesCell(enemy, x, y)) occupied.add(y * collision.width + x);
          }
        }
      }
      return occupied;
    };

    for (tick = 0; tick < 500 && playerHp > 0 &&
      enemies.find(({ sourceOrder }) => sourceOrder === buSourceOrder)?.state === 'alive'; tick += 1) {
      if (skill.phase === 0 && skill.chargeTicksRemaining[0] === 0) {
        const action = startPlayerSkillAction(skill, 0, playerTileX, playerTileY, 1, 4);
        expect(action.accepted).toBe(true);
        skill = action.state;
        casts += 1;
      }
      const skillStep = advancePlayerSkillAction(skill, WORLD_UPDATE_PERIOD_MS);
      skill = skillStep.state;
      for (const pulse of skillStep.damagePulses) {
        const target = findEnemyOccupyingSourceCell(enemies, pulse.tileX, pulse.tileY);
        if (target === undefined) continue;
        const result = applySourceSkillDamage(
          enemies,
          target.sourceOrder,
          pulse.power,
          pulse.elementCode,
        );
        if (result.kind !== 'hit') continue;
        enemies = result.combatants;
        if (result.damage > 0) damagingPulses += 1;
      }

      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = advanceEnemyDamageReaction(enemies[index]);
        if (enemy.state !== 'alive' || enemy.sourceAu === true) {
          enemies[index] = enemy;
          continue;
        }
        const animation = findEnemySpriteAnimation(animations, enemy.spriteId ?? enemy.enemyId);
        if (animation === undefined) throw new Error(`Enemy animation ${enemy.enemyId} is missing`);
        const attackTrack = findEnemySpriteTrack(animation, 2, enemy.animationDirection ?? 2);
        const moved = advanceEnemyBehaviorTick(enemy, {
          collision,
          occupiedCellIndices: occupiedCells(),
          playerTileX,
          playerTileY,
          randomInteger: (minimum, maximum) => rangeRandom.nextSourceRange(minimum, maximum),
          rawRandomInteger: () => entityRandom.nextInt(),
        }, attackTrack.frameCount);
        const renderTrack = findEnemySpriteTrack(
          animation,
          moved.animationStateIndex ?? 0,
          moved.animationDirection ?? 2,
        );
        const framed = {
          ...moved,
          animationFrameIndex: advanceEnemySpriteFrame(moved.animationFrameIndex ?? -1, renderTrack),
        };
        const hitChecked = consumeEnemyAttackImpactFrame(
          framed,
          enemyAttackImpactFrame(framed.enemyId),
        );
        if (!framed.attackHitResolved && hitChecked.attackHitResolved &&
          enemyHasPlayerWithinFacingRange(hitChecked, playerTileX, playerTileY, 3) && playerHp > 0) {
          const hit = resolveEnemyMeleeDefense(
            hitChecked,
            defenseProfile,
            (minimum, maximum) => rangeRandom.nextSourceRange(minimum, maximum),
          );
          if (!hit.evaded) {
            enemyHits += 1;
            firstHitTick ??= tick;
            playerHp = Math.max(0, playerHp - hit.damage);
          }
        }
        enemies[index] = hitChecked;
      }
    }

    const bu = enemies.find(({ sourceOrder }) => sourceOrder === buSourceOrder);
    expect(events.enemyPlacements.filter(({ enemyId }) => enemyId === 0)).toHaveLength(4);
    expect({ tick, casts, damagingPulses, enemyHits, firstHitTick, playerHp, buHp: bu?.hp }).toEqual({
      tick: 17,
      casts: 1,
      damagingPulses: 2,
      enemyHits: 1,
      firstHitTick: 16,
      playerHp: 0,
      buHp: 8898,
    });
    expect(playerHp).toBe(0);
    expect(bu?.state).toBe('alive');
  });

  const simulateFireballPlan = (
    patrol: boolean,
    perimeter = false,
    passiveRecovery = false,
    piyoraSupport = false,
    healthPotionSupport = false,
  ) => {
    const events = addSourceConstructedMapEnemies(
      82,
      parseEventOperationData(map82EventsRaw),
    );
    const collision = parseBaseCollisionData(map82CollisionRaw);
    const world = { map: parseBaseMapData(map82Raw), collision };
    const enemyData = parseEnemyDataTable(enemyData0Raw);
    const animations = parseEnemySpriteAnimationCatalog(enemyAnimationsRaw);
    const buSourceOrder = events.enemyPlacements.find(({ sourceBehavior }) =>
      sourceBehavior === 'map82-bu')?.sourceOrder;
    if (buSourceOrder === undefined) throw new Error('Map 82 is missing its constructed BU actor');

    let enemies = createEnemyCombatants(events.enemyPlacements, enemyData);
    let actor = createPlayerActor(7 * 16, 14 * 16, 1);
    // Model the M203 checkpoint's level-6 Ronin with all 12 earned points in
    // HP: `(5 + 12 + 6) * 12 = 276`. Fireball rank 5 is an explicit seed.
    let playerHp = (5 + 12 + 6) * 12;
    const defenseProfile = starterRoninDefenseForLevel(6);
    const rangeRandom = new JavaRandom(1337);
    const entityRandom = new JavaRandom(7331);
    let skill = {
      ...createPlayerSkillActionState(0, 4, 5),
      chargeTicksRemaining: [0, 280, 280] as [number, number, number],
    };
    // The optional recovery plans start with Piyora's button-1 charge ready;
    // switching away from Fireball waits until its action has returned to idle.
    let piyora = {
      ...createPlayerSkillActionState(1, 4, 1),
      chargeTicksRemaining: [0, 160, 270] as [number, number, number],
    };
    let activeSkillId: 0 | 1 = 0;
    let piyoraCasts = 0;
    let piyoraHpRestored = 0;
    let piyoraCastTick: number | null = null;
    let piyoraHealTick: number | null = null;
    let piyoraUsed = false;
    // Category 8/item 0 is a source health potion and appears in enemy drop data.
    let inventory = healthPotionSupport
      ? [{ category: 8, itemId: 0, count: 1 }]
      : [];
    let quickPotionsUsed = 0;
    let recovery = createPlayerRecoveryState();
    let casts = 0;

    const occupiedCells = (): ReadonlySet<number> => {
      const occupied = new Set<number>();
      for (const enemy of enemies) {
        for (let y = 0; y < collision.height; y += 1) {
          for (let x = 0; x < collision.width; x += 1) {
            if (sourceEnemyOccupiesCell(enemy, x, y)) occupied.add(y * collision.width + x);
          }
        }
      }
      return occupied;
    };

    actor = requestActorDirection(actor, 3);
    let enemyHits = 0;
    let firstHitTick: number | null = null;
    const hitTrace: { tick: number; sourceOrder: number; damage: number; playerHp: number }[] = [];
    let damagingPulses = 0;
    let ordinaryEnemyUpdates = 0;
    let completedTicks = 0;
    let minPatrolTileX = 7;
    let maxPatrolTileX = 7;
    let minPatrolTileY = 7;
    let maxPatrolTileY = 7;
    let perimeterTargetIndex = 0;
    let corridorPatrolStarted = false;
    const perimeterCorners = [
      [10, 7], [10, 15], [4, 15], [4, 7], [7, 7],
    ] as const;
    let firstWindow: {
      playerHp: number;
      enemyHits: number;
      casts: number;
      damagingPulses: number;
      buHp: number | undefined;
      playerTileX: number;
      playerTileY: number;
    } | undefined;
    for (let tick = 0; tick < 5000 && playerHp > 0 &&
      enemies.find(({ sourceOrder }) => sourceOrder === buSourceOrder)?.state === 'alive'; tick += 1) {
      completedTicks = tick + 1;
      if (passiveRecovery) {
        const recovered = advancePlayerRecoveryTick(
          recovery,
          actor.moving ? 'walking' : 'idle',
          {
            level: 6,
            attributes: { power: 8, hp: 17, agility: 3, will: 4 },
            hp: playerHp,
            maxHp: 276,
            sp: 108,
            maxSp: 108,
          },
        );
        recovery = recovered.state;
        playerHp = recovered.hp;
      }
      if (actor.x % 16 === 0 && actor.y % 16 === 0 &&
        (actor.x >> 4) === 7 && (actor.y >> 4) === 7 && !actor.moving &&
        activeSkillId === 0 && skill.phase === 0 && skill.chargeTicksRemaining[0] === 0) {
        const cast = startPlayerSkillAction(skill, 0, actor.x >> 4, actor.y >> 4, 2, 4);
        expect(cast.accepted).toBe(true);
        skill = cast.state;
        casts += 1;
      }
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = advanceEnemyDamageReaction(enemies[index]);
        if (enemy.state !== 'alive' || enemy.sourceAu === true) {
          enemies[index] = enemy;
          continue;
        }
        const animation = findEnemySpriteAnimation(animations, enemy.spriteId ?? enemy.enemyId);
        if (animation === undefined) throw new Error(`Enemy animation ${enemy.enemyId} is missing`);
        const attackTrack = findEnemySpriteTrack(animation, 2, enemy.animationDirection ?? 2);
        ordinaryEnemyUpdates += 1;
        const moved = advanceEnemyBehaviorTick(enemy, {
          collision,
          occupiedCellIndices: occupiedCells(),
          playerTileX: actor.x >> 4,
          playerTileY: actor.y >> 4,
          randomInteger: (minimum, maximum) => rangeRandom.nextSourceRange(minimum, maximum),
          rawRandomInteger: () => entityRandom.nextInt(),
        }, attackTrack.frameCount);
        const renderTrack = findEnemySpriteTrack(
          animation,
          moved.animationStateIndex ?? 0,
          moved.animationDirection ?? 2,
        );
        const framed = {
          ...moved,
          animationFrameIndex: advanceEnemySpriteFrame(moved.animationFrameIndex ?? -1, renderTrack),
        };
        const hitChecked = consumeEnemyAttackImpactFrame(
          framed,
          enemyAttackImpactFrame(framed.enemyId),
        );
        if (!framed.attackHitResolved && hitChecked.attackHitResolved &&
          enemyHasPlayerWithinFacingRange(hitChecked, actor.x >> 4, actor.y >> 4, 3) && playerHp > 0) {
          const hit = resolveEnemyMeleeDefense(
            hitChecked,
            defenseProfile,
            (minimum, maximum) => rangeRandom.nextSourceRange(minimum, maximum),
          );
          if (!hit.evaded) {
            enemyHits += 1;
            firstHitTick ??= tick;
            playerHp = Math.max(0, playerHp - hit.damage);
            hitTrace.push({ tick, sourceOrder: hitChecked.sourceOrder, damage: hit.damage, playerHp });
          }
        }
        enemies[index] = hitChecked;
      }

      if (healthPotionSupport && playerHp <= 170 &&
        inventory.some(({ category, count }) => category === 8 && count > 0)) {
        const used = useSelectedConsumable(inventory, {
          hp: playerHp,
          maxHp: 276,
          sp: 108,
          maxSp: 108,
          selectedItemCategory: 8,
          selectedItemCount: 1,
        }, [], playerHp > 0);
        if (used.used) {
          inventory = used.inventory;
          playerHp = used.state.hp;
          quickPotionsUsed += 1;
        }
      }

      if (piyoraSupport && activeSkillId === 0 && !piyoraUsed && skill.phase === 0 &&
        playerHp < 276 && piyora.chargeTicksRemaining[0] === 0) {
        activeSkillId = 1;
        const cast = startPlayerSkillAction(piyora, 0, actor.x >> 4, actor.y >> 4, actor.direction, 4);
        expect(cast.accepted).toBe(true);
        piyora = cast.state;
        piyoraCasts += 1;
        piyoraCastTick = tick;
        piyoraUsed = true;
      }

      actor = advanceActor(world, actor, WORLD_UPDATE_PERIOD_MS, occupiedCells());
      if (actor.x % 16 === 0 && actor.y % 16 === 0 &&
        (actor.x >> 4) === 6 && (actor.y >> 4) === 14 && actor.direction === 3) {
        actor = requestActorDirection(releaseActorDirection(actor), 1);
      } else if (actor.x % 16 === 0 && actor.y % 16 === 0 &&
        (actor.x >> 4) === 6 && (actor.y >> 4) === 7 && actor.direction === 1) {
        actor = requestActorDirection(releaseActorDirection(actor), 4);
      } else if (actor.x % 16 === 0 && actor.y % 16 === 0 &&
        (actor.x >> 4) === 7 && (actor.y >> 4) === 7 && actor.direction === 4) {
        actor = releaseActorDirection(actor);
      }
      if ((patrol || perimeter) && tick >= 35 &&
        actor.x % 16 === 0 && actor.y % 16 === 0) {
        minPatrolTileX = Math.min(minPatrolTileX, actor.x >> 4);
        maxPatrolTileX = Math.max(maxPatrolTileX, actor.x >> 4);
        minPatrolTileY = Math.min(minPatrolTileY, actor.y >> 4);
        maxPatrolTileY = Math.max(maxPatrolTileY, actor.y >> 4);
      }
      if (perimeter && tick >= 35 && actor.x % 16 === 0 && actor.y % 16 === 0 &&
        (activeSkillId === 1 || skill.phase === 0)) {
        let [targetX, targetY] = perimeterCorners[perimeterTargetIndex];
        const atTarget = (actor.x >> 4) === targetX && (actor.y >> 4) === targetY &&
          !actor.moving;
        const skillReadyAtFiringTile = activeSkillId === 0 && atTarget &&
          targetX === 7 && targetY === 7 &&
          skill.chargeTicksRemaining[0] === 0;
        if (atTarget && !skillReadyAtFiringTile) {
          perimeterTargetIndex = (perimeterTargetIndex + 1) % perimeterCorners.length;
          [targetX, targetY] = perimeterCorners[perimeterTargetIndex];
        }
        const desiredDirection: 1 | 2 | 3 | 4 | null = skillReadyAtFiringTile
          ? null
          : (actor.x >> 4) < targetX ? 4
            : (actor.x >> 4) > targetX ? 3
              : (actor.y >> 4) < targetY ? 2
                : (actor.y >> 4) > targetY ? 1
                  : null;
        actor = desiredDirection === null
          ? releaseActorDirection(actor)
          : actor.moving && actor.direction === desiredDirection
            ? actor
            : requestActorDirection(releaseActorDirection(actor), desiredDirection);
      }
      if (patrol && !perimeter && tick >= 35 && actor.y === 7 * 16 &&
        actor.x % 16 === 0 && (activeSkillId === 1 || skill.phase === 0)) {
        const tileX = actor.x >> 4;
        const skillReady = activeSkillId === 0 && skill.chargeTicksRemaining[0] === 0;
        let desiredDirection: 1 | 2 | 3 | 4 | null;
        if (skillReady) {
          desiredDirection = tileX < 7 ? 4 : tileX > 7 ? 3 : null;
        } else if (tileX === 4) {
          desiredDirection = 4;
        } else if (tileX === 10) {
          desiredDirection = 3;
        } else if (!corridorPatrolStarted) {
          corridorPatrolStarted = true;
          desiredDirection = 3;
        } else {
          desiredDirection = actor.direction;
        }
        actor = desiredDirection === null
          ? releaseActorDirection(actor)
          : actor.moving && actor.direction === desiredDirection
            ? actor
            : requestActorDirection(releaseActorDirection(actor), desiredDirection);
      }
      const step = activeSkillId === 0
        ? advancePlayerSkillAction(skill, WORLD_UPDATE_PERIOD_MS)
        : advancePlayerSkillAction(piyora, WORLD_UPDATE_PERIOD_MS);
      if (activeSkillId === 0) skill = step.state;
      else piyora = step.state;
      for (const effect of step.restoreEffects) {
        if (effect.resource !== 'hp') continue;
        const restored = restoreSkillResource(playerHp, 276, effect.percent);
        piyoraHpRestored += restored - playerHp;
        playerHp = restored;
        piyoraHealTick ??= tick;
      }
      for (const pulse of step.damagePulses) {
        const target = findEnemyOccupyingSourceCell(enemies, pulse.tileX, pulse.tileY);
        if (target === undefined) continue;
        const result = applySourceSkillDamage(
          enemies,
          target.sourceOrder,
          pulse.power,
          pulse.elementCode,
        );
        if (result.kind !== 'hit') continue;
        enemies = result.combatants;
        if (result.damage > 0) damagingPulses += 1;
      }
      if (activeSkillId === 1 && piyora.phase === 0) activeSkillId = 0;
      if (tick === 34) {
        const bu = enemies.find(({ sourceOrder }) => sourceOrder === buSourceOrder);
        firstWindow = {
          playerHp,
          enemyHits,
          casts,
          damagingPulses,
          buHp: bu?.hp,
          playerTileX: actor.x >> 4,
          playerTileY: actor.y >> 4,
        };
      }
    }

    const bu = enemies.find(({ sourceOrder }) => sourceOrder === buSourceOrder);
    expect(events.enemyPlacements.filter(({ enemyId }) => enemyId === 0)).toHaveLength(4);
    return {
      firstWindow,
      completedTicks,
      ordinaryEnemyUpdates,
      minPatrolTileX,
      maxPatrolTileX,
      minPatrolTileY,
      maxPatrolTileY,
      playerHp,
      enemyHits,
      firstHitTick,
      hitTrace,
      piyoraCasts,
      piyoraHpRestored,
      piyoraCastTick,
      piyoraHealTick,
      quickPotionsUsed,
      casts,
      damagingPulses,
      buHp: bu?.hp,
      buState: bu?.state,
      playerTileX: actor.x >> 4,
      playerTileY: actor.y >> 4,
    };
  };

  it('models ordinary enemy pressure through a full Fireball cooldown at the map-82 firing tile', () => {
    const result = simulateFireballPlan(false);
    const { firstWindow, hitTrace, piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState } = result;
    expect(firstWindow).toEqual({
      playerHp: 276,
      enemyHits: 0,
      casts: 1,
      damagingPulses: 2,
      buHp: 8898,
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(finalState).toEqual({
      completedTicks: 103,
      ordinaryEnemyUpdates: 412,
      minPatrolTileX: 7,
      maxPatrolTileX: 7,
      minPatrolTileY: 7,
      maxPatrolTileY: 7,
      playerHp: 0,
      enemyHits: 3,
      firstHitTick: 70,
      casts: 2,
      damagingPulses: 2,
      buHp: 8898,
      buState: 'alive',
      playerTileX: 7,
      playerTileY: 7,
    });
  });

  it('patrols the full lateral corridor while Fireball recharges', () => {
    const result = simulateFireballPlan(true);
    const { firstWindow, hitTrace, piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState } = result;
    expect(firstWindow).toEqual({
      playerHp: 276,
      enemyHits: 0,
      casts: 1,
      damagingPulses: 2,
      buHp: 8898,
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(finalState).toEqual({
      completedTicks: 126,
      ordinaryEnemyUpdates: 504,
      minPatrolTileX: 4,
      maxPatrolTileX: 10,
      minPatrolTileY: 7,
      maxPatrolTileY: 7,
      playerHp: 0,
      enemyHits: 3,
      firstHitTick: 109,
      casts: 2,
      damagingPulses: 8,
      buHp: 8746,
      buState: 'alive',
      playerTileX: 7,
      playerTileY: 7,
    });
  });

  it('models a full room perimeter while Fireball recharges', () => {
    const result = simulateFireballPlan(false, true);
    const { firstWindow, hitTrace, piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState } = result;
    expect(firstWindow).toEqual({
      playerHp: 276,
      enemyHits: 0,
      casts: 1,
      damagingPulses: 2,
      buHp: 8898,
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(finalState).toEqual({
      completedTicks: 222,
      ordinaryEnemyUpdates: 888,
      minPatrolTileX: 4,
      maxPatrolTileX: 10,
      minPatrolTileY: 7,
      maxPatrolTileY: 15,
      playerHp: 0,
      enemyHits: 3,
      firstHitTick: 122,
      casts: 3,
      damagingPulses: 14,
      buHp: 8594,
      buState: 'alive',
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(hitTrace).toEqual([
      { tick: 122, sourceOrder: 0, damage: 124, playerHp: 152 },
      { tick: 205, sourceOrder: 0, damage: 131, playerHp: 21 },
      { tick: 221, sourceOrder: 0, damage: 123, playerHp: 0 },
    ]);
  });

  it('still dies after three hits with source passive HP recovery active', () => {
    const result = simulateFireballPlan(false, true, true);
    const { firstWindow, hitTrace, piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState } = result;
    expect(firstWindow).toEqual({
      playerHp: 276,
      enemyHits: 0,
      casts: 1,
      damagingPulses: 2,
      buHp: 8898,
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(finalState).toEqual({
      completedTicks: 222,
      ordinaryEnemyUpdates: 888,
      minPatrolTileX: 4,
      maxPatrolTileX: 10,
      minPatrolTileY: 7,
      maxPatrolTileY: 15,
      playerHp: 0,
      enemyHits: 3,
      firstHitTick: 122,
      casts: 3,
      damagingPulses: 14,
      buHp: 8594,
      buState: 'alive',
      playerTileX: 7,
      playerTileY: 7,
    });
    expect(hitTrace).toEqual([
      { tick: 122, sourceOrder: 0, damage: 124, playerHp: 152 },
      { tick: 205, sourceOrder: 0, damage: 131, playerHp: 38 },
      { tick: 221, sourceOrder: 0, damage: 123, playerHp: 0 },
    ]);
  });

  it('uses Piyora on the perimeter but still dies during later enemy pressure', () => {
    const result = simulateFireballPlan(false, true, true, true);
    const {
      firstWindow, hitTrace, piyoraCasts, piyoraHpRestored,
      piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState
    } = result;
    expect(firstWindow).toMatchObject({ playerHp: 276, enemyHits: 0, buHp: 8898 });
    expect(finalState).toEqual({
      completedTicks: 357,
      ordinaryEnemyUpdates: 1428,
      minPatrolTileX: 4,
      maxPatrolTileX: 10,
      minPatrolTileY: 7,
      maxPatrolTileY: 15,
      playerHp: 0,
      enemyHits: 4,
      firstHitTick: 122,
      casts: 3,
      damagingPulses: 13,
      buHp: 8594,
      buState: 'alive',
      playerTileX: 4,
      playerTileY: 13,
    });
    expect({ piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed })
      .toEqual({ piyoraCasts: 1, piyoraHpRestored: 82, piyoraCastTick: 133, piyoraHealTick: 146, quickPotionsUsed: 0 });
    expect(hitTrace).toEqual([
      { tick: 122, sourceOrder: 0, damage: 124, playerHp: 152 },
      { tick: 276, sourceOrder: 0, damage: 136, playerHp: 140 },
      { tick: 340, sourceOrder: 3, damage: 123, playerHp: 34 },
      { tick: 356, sourceOrder: 3, damage: 132, playerHp: 0 },
    ]);
  });

  it('uses one category-8 potion and Piyora without defeating BU', () => {
    const result = simulateFireballPlan(false, true, true, true, true);
    const {
      firstWindow, hitTrace, piyoraCasts, piyoraHpRestored,
      piyoraCastTick, piyoraHealTick, quickPotionsUsed, ...finalState
    } = result;
    expect(firstWindow).toMatchObject({ playerHp: 276, enemyHits: 0, buHp: 8898 });
    expect(finalState).toEqual({
      completedTicks: 357,
      ordinaryEnemyUpdates: 1428,
      minPatrolTileX: 4,
      maxPatrolTileX: 10,
      minPatrolTileY: 7,
      maxPatrolTileY: 15,
      playerHp: 0,
      enemyHits: 4,
      firstHitTick: 122,
      casts: 3,
      damagingPulses: 13,
      buHp: 8594,
      buState: 'alive',
      playerTileX: 4,
      playerTileY: 13,
    });
    expect({ piyoraCasts, piyoraHpRestored, piyoraCastTick, piyoraHealTick, quickPotionsUsed })
      .toEqual({ piyoraCasts: 1, piyoraHpRestored: 14, piyoraCastTick: 133, piyoraHealTick: 146, quickPotionsUsed: 1 });
    expect(hitTrace).toEqual([
      { tick: 122, sourceOrder: 0, damage: 124, playerHp: 152 },
      { tick: 276, sourceOrder: 0, damage: 136, playerHp: 140 },
      { tick: 340, sourceOrder: 3, damage: 123, playerHp: 34 },
      { tick: 356, sourceOrder: 3, damage: 132, playerHp: 0 },
    ]);
  });
});
