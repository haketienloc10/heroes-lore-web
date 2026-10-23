import { describe, expect, it } from 'vitest';
import {
  advanceEnemyDamageReaction,
  advanceEnemyDeathTick,
  advanceEnemyRespawnDelay,
  beginEnemyDamageReaction,
  calculateEnemyDamage,
  calculateEnemyEvasionThreshold,
  consumeEnemyAttackImpactFrame,
  createEnemyCombatants,
  ELEMENTAL_DAMAGE_TENTHS,
  enemyAttackImpactFrame,
  enemyDamageReactionOffset,
  findFacingEnemy,
  parseEnemyDataTable,
  resolveBasicAttack,
  resolveEnemyMeleeDefense,
  respawnEnemy,
  STARTER_RONIN_ATTACK,
  starterRoninDefenseForLevel,
} from '../src/world/combat';

function enemyTableFixture() {
  return {
    format: 'heroes-lore-enemy-data-v1',
    variant: 0,
    records: Array.from({ length: 43 }, (_, index) => ({
      index,
      labelToken: '580',
      baseCode: index === 24 ? 1 : 3,
      packedAttributes: {
        classCode: index === 26 ? 2 : 0,
        shapeCode: index === 25 ? 2 : 0,
        elementCode: 0,
        variantCode: 0,
      },
      statusFlags: { bit3: false },
      maxHp: index === 24 ? 43 : 20,
      attack: 9,
      defense: index === 24 ? 5 : 3,
      evasion: index === 24 ? 6 : 0,
      behaviorCodes: index === 24 ? [2, 7, 10] : [3, 11, 10],
      respawnDelay: 300,
      dropCandidates: [[7, 0, 25]],
    })),
  };
}

function starterEnemy() {
  const table = parseEnemyDataTable(enemyTableFixture());
  return createEnemyCombatants([
    { tileX: 10, tileY: 30, enemyId: 24, sourceOrder: 1 },
  ], table);
}

describe('source-derived enemy damage rules', () => {
  it('preserves the JAR elemental factor table', () => {
    expect(ELEMENTAL_DAMAGE_TENTHS).toEqual([
      [10, 10, 10, 10],
      [10, 10, 6, 13],
      [10, 13, 10, 6],
      [10, 6, 13, 10],
    ]);
  });

  it('subtracts defense before applying the element factor with integer truncation', () => {
    expect(calculateEnemyDamage({
      power: 25,
      defense: 10,
      attackElement: 1,
      targetElement: 2,
    })).toEqual({ afterDefense: 15, afterElement: 9, damage: 9 });
  });

  it('applies the conditional damage bonus after elemental scaling', () => {
    expect(calculateEnemyDamage({
      power: 25,
      defense: 10,
      attackElement: 1,
      targetElement: 2,
      applyDamageBonus: true,
      bonusTenths: 3,
    })).toEqual({ afterDefense: 15, afterElement: 9, damage: 11 });
  });

  it('does not allow defense to turn a hit into healing', () => {
    expect(calculateEnemyDamage({
      power: 8,
      defense: 12,
      attackElement: 0,
      targetElement: 3,
    })).toEqual({ afterDefense: 0, afterElement: 0, damage: 0 });
  });

  it('matches the R10 starter hit against map-27 Dust', () => {
    expect(calculateEnemyDamage({
      power: 16,
      defense: 5,
      attackElement: 0,
      targetElement: 0,
    })).toEqual({ afterDefense: 11, afterElement: 11, damage: 11 });
  });

  it('parses source enemy data and initializes a separate HP state for each placement', () => {
    const enemies = createEnemyCombatants([
      { tileX: 10, tileY: 30, enemyId: 24, sourceOrder: 1 },
      { tileX: 12, tileY: 30, enemyId: 24, sourceOrder: 2 },
    ], parseEnemyDataTable(enemyTableFixture()));

    expect(enemies.map(({ sourceOrder, hp, definition }) => ({
      sourceOrder,
      hp,
      maxHp: definition.maxHp,
      actionDelayTicksRemaining: definition.behaviorTiming[0],
    }))).toEqual([
      { sourceOrder: 1, hp: 43, maxHp: 43, actionDelayTicksRemaining: 7 },
      { sourceOrder: 2, hp: 43, maxHp: 43, actionDelayTicksRemaining: 7 },
    ]);
  });

  it('selects only a living enemy in the cell directly ahead', () => {
    const enemies = starterEnemy();

    expect(findFacingEnemy(enemies, 9, 30, 4)?.sourceOrder).toBe(1);
    expect(findFacingEnemy(enemies, 9, 30, 1)).toBeUndefined();
    expect(findFacingEnemy(enemies, 9, 29, 4)).toBeUndefined();
  });

  it('uses the ordinary ak evasion threshold and leaves miss rolls without HP damage', () => {
    const enemies = starterEnemy();
    expect(calculateEnemyEvasionThreshold(enemies[0].definition, STARTER_RONIN_ATTACK)).toBe(13);

    const result = resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 0);
    expect(result.kind).toBe('miss');
    expect(result.combatants[0].hp).toBe(43);
  });

  it('matches both observed R10 hits against the same target', () => {
    const first = resolveBasicAttack(starterEnemy(), 1, STARTER_RONIN_ATTACK, 99);
    expect(first.kind).toBe('hit');
    if (first.kind !== 'hit') return;
    expect(first.damage).toBe(11);
    expect(first.target.hp).toBe(32);

    const second = resolveBasicAttack(first.combatants, 1, STARTER_RONIN_ATTACK, 99);
    expect(second.kind).toBe('hit');
    if (second.kind !== 'hit') return;
    expect(second.target.hp).toBe(21);
  });

  it('applies the source weapon critical damage bonus after defense and element scaling', () => {
    const result = resolveBasicAttack(starterEnemy(), 1, {
      ...STARTER_RONIN_ATTACK,
      criticalDamageBonusTenths: 10,
    }, 99, true);
    expect(result.kind).toBe('hit');
    if (result.kind !== 'hit') return;
    expect(result.damage).toBe(22);
    expect(result.target.hp).toBe(21);
  });

  it('reproduces the four-update directional enemy hit reaction', () => {
    let target = beginEnemyDamageReaction(starterEnemy()[0], 4);
    expect(target.damageReactionTicksRemaining).toBe(4);
    expect(enemyDamageReactionOffset(target)).toEqual({ x: 0, y: 0 });

    target = advanceEnemyDamageReaction(target);
    expect(enemyDamageReactionOffset(target)).toEqual({ x: 3, y: 0 });
    target = advanceEnemyDamageReaction(target);
    expect(enemyDamageReactionOffset(target)).toEqual({ x: 0, y: 0 });
    target = advanceEnemyDamageReaction(target);
    expect(enemyDamageReactionOffset(target)).toEqual({ x: 3, y: 0 });
    target = advanceEnemyDamageReaction(target);
    expect(target.damageReactionTicksRemaining).toBe(0);
    expect(target.damageReactionDirection).toBeNull();
    expect(enemyDamageReactionOffset(target)).toEqual({ x: 0, y: 0 });
  });

  it('uses the source direction vectors for north and west hit reactions', () => {
    expect(enemyDamageReactionOffset({
      ...starterEnemy()[0],
      damageReactionTicksRemaining: 3,
      damageReactionDirection: 1,
    })).toEqual({ x: 0, y: -3 });
    expect(enemyDamageReactionOffset({
      ...starterEnemy()[0],
      damageReactionTicksRemaining: 1,
      damageReactionDirection: 3,
    })).toEqual({ x: -3, y: 0 });
  });

  it('enters an explicit death-pending state at zero HP and refuses further hits', () => {
    let enemies = starterEnemy();
    for (let index = 0; index < 4; index += 1) {
      enemies = resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).combatants;
    }
    expect(enemies[0].hp).toBe(0);
    expect(enemies[0].state).toBe('death-pending');
    expect(findFacingEnemy(enemies, 9, 30, 4)).toBeUndefined();
    expect(resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).kind).toBe('no-target');
  });

  it('keeps the death state for three source updates and removes it on the fourth', () => {
    let enemies = starterEnemy();
    for (let index = 0; index < 4; index += 1) {
      enemies = resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).combatants;
    }

    for (let update = 0; update < 3; update += 1) {
      enemies = advanceEnemyDeathTick(enemies);
      expect(enemies[0]).toMatchObject({ state: 'death-pending', deathUpdatesRemaining: 2 - update });
    }
    enemies = advanceEnemyDeathTick(enemies);
    expect(enemies[0]).toMatchObject({
      state: 'respawn-wait', hp: 0, respawnDelayRemaining: 300,
    });
    expect(findFacingEnemy(enemies, 9, 30, 4)).toBeUndefined();
  });

  it('uses the recorded shape code to suppress respawn for the source class-two case', () => {
    let enemies = createEnemyCombatants([
      { tileX: 10, tileY: 30, enemyId: 25, sourceOrder: 1 },
    ], parseEnemyDataTable(enemyTableFixture()));
    for (let index = 0; index < 2; index += 1) {
      enemies = resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).combatants;
    }
    for (let index = 0; index < 4; index += 1) enemies = advanceEnemyDeathTick(enemies);
    expect(enemies[0]).toMatchObject({ state: 'removed', respawnDelayRemaining: null });
  });

  it('decrements the source respawn timer by 16 and restores max HP at the accepted spawn cell', () => {
    let enemies = starterEnemy();
    for (let index = 0; index < 4; index += 1) {
      enemies = resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).combatants;
    }
    for (let index = 0; index < 4; index += 1) enemies = advanceEnemyDeathTick(enemies);
    expect(advanceEnemyRespawnDelay(enemies[0]).respawnDelayRemaining).toBe(284);
    const revived = respawnEnemy(enemies[0], 11, 30);
    expect(revived).toMatchObject({
      tileX: 11, tileY: 30, hp: 43, state: 'alive', deathUpdatesRemaining: 0,
      respawnDelayRemaining: null,
    });
  });
});

describe('source-derived enemy melee damage', () => {
  it('uses the source impact frame and consumes it once per attack', () => {
    const enemy = {
      ...starterEnemy()[0],
      animationStateIndex: 2 as const,
      animationFrameIndex: 2,
      attackHitResolved: false,
    };
    expect(enemyAttackImpactFrame(24)).toBe(2);
    const impacted = consumeEnemyAttackImpactFrame(enemy, enemyAttackImpactFrame(24));
    expect(impacted.attackHitResolved).toBe(true);
    expect(consumeEnemyAttackImpactFrame(impacted, 2)).toBe(impacted);
  });

  it('applies fresh Ronin evasion and level-based starter defense to incoming damage', () => {
    const enemy = starterEnemy()[0];
    const rolls: Array<[number, number]> = [];
    const result = resolveEnemyMeleeDefense(
      enemy,
      starterRoninDefenseForLevel(1),
      (minimum, maximum) => {
        rolls.push([minimum, maximum]);
        return rolls.length === 1 ? 99 : 0;
      },
    );
    expect(result).toEqual({ evaded: false, evasionThreshold: 8, damage: 4 });
    expect(rolls).toEqual([[0, 99], [0, 0]]);
    expect(starterRoninDefenseForLevel(3).defense).toBe(6);
  });

  it('stops at the source minimum evasion threshold and skips the damage roll', () => {
    const rolls: Array<[number, number]> = [];
    const result = resolveEnemyMeleeDefense(
      starterEnemy()[0],
      starterRoninDefenseForLevel(1),
      (minimum, maximum) => {
        rolls.push([minimum, maximum]);
        return 7;
      },
    );
    expect(result).toEqual({ evaded: true, evasionThreshold: 8, damage: 0 });
    expect(rolls).toEqual([[0, 99]]);
  });
});
