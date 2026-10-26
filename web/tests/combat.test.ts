import { describe, expect, it } from 'vitest';
import enemyData0Raw from '../public/assets/generated/enemy-data/data0.json';
import enemyData1Raw from '../public/assets/generated/enemy-data/data1.json';
import enemyData2Raw from '../public/assets/generated/enemy-data/data2.json';
import {
  advanceEnemyDamageReaction,
  advanceEnemyDeathTick,
  advanceEnemyRespawnDelay,
  applySourceSkillDamage,
  beginEnemyDamageReaction,
  calculateEnemyDamage,
  calculateEnemyEvasionThreshold,
  consumeEnemyAttackImpactFrame,
  createEnemyCombatants,
  ELEMENTAL_DAMAGE_TENTHS,
  enemyDataVariantForPlaythroughMode,
  enemyAttackImpactFrame,
  enemyDamageReactionOffset,
  enemyFootprintWidth,
  findFacingEnemy,
  parseEnemyDataTable,
  resolveBasicAttack,
  resolveEnemyMeleeDefense,
  selectWeaponProcCode,
  removeSourceMap13BossCompanions,
  respawnEnemy,
  STARTER_RONIN_ATTACK,
  starterRoninDefenseForLevel,
  type EnemyCombatant,
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
  it('selects the source enemy table from the persisted playthrough mode', () => {
    const tables = [enemyData0Raw, enemyData1Raw, enemyData2Raw].map(parseEnemyDataTable);
    expect(tables.map(({ variant, records }) => [variant, records.length])).toEqual([
      [0, 43], [1, 43], [2, 43],
    ]);
    expect([0, 1, 2, 3, 127].map((mode) =>
      tables[enemyDataVariantForPlaythroughMode(mode)].variant,
    )).toEqual([0, 1, 2, 2, 2]);
    expect(() => enemyDataVariantForPlaythroughMode(-1)).toThrow(RangeError);
    expect(() => enemyDataVariantForPlaythroughMode(128)).toThrow(RangeError);
  });

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

  it('selects weapon then offhand procs with source short-circuit rolls', () => {
    const rolls = [20, 9];
    let draws = 0;
    expect(selectWeaponProcCode(0, 5, () => rolls[draws++])).toBe(5);
    expect(draws).toBe(2);

    draws = 0;
    expect(selectWeaponProcCode(0, 5, () => {
      draws += 1;
      return 19;
    })).toBe(0);
    expect(draws).toBe(1);
    expect(selectWeaponProcCode(-1, -1, () => {
      throw new Error('The source does not roll for a missing proc.');
    })).toBeNull();
  });

  it('applies source proc damage, resource, and status effects only after a hit', () => {
    const enemy = starterEnemy()[0];
    const profile = { ...STARTER_RONIN_ATTACK, power: 25, criticalChance: 0 };
    const code2 = resolveBasicAttack([enemy], 1, profile, 99, false, 2);
    expect(code2.kind).toBe('hit');
    if (code2.kind === 'hit') expect(code2.damage).toBe(enemy.definition.attack);

    const code3 = resolveBasicAttack([enemy], 1, profile, 99, false, 3);
    expect(code3.kind).toBe('hit');
    if (code3.kind === 'hit') {
      expect(code3.damage).toBe(20);
      expect(code3.playerSpCost).toBe(16);
      expect(code3.playerHpCost).toBe(0);
    }

    const code4 = resolveBasicAttack([enemy], 1, profile, 99, false, 4);
    expect(code4.kind).toBe('hit');
    if (code4.kind === 'hit') expect(code4.playerHpCost).toBe(10);

    const code8 = resolveBasicAttack([enemy], 1, profile, 99, false, 8);
    expect(code8.kind).toBe('hit');
    if (code8.kind === 'hit') expect(code8.damage).toBe(40);

    const code0 = resolveBasicAttack([enemy], 1, profile, 99, false, 0);
    expect(code0.kind).toBe('hit');
    if (code0.kind === 'hit') {
      expect(code0.target.sourceStatusEffects).toEqual([{ id: 0, ticksElapsed: 0 }]);
      expect(code0.playerHpCost).toBe(0);
      expect(code0.playerSpCost).toBe(0);
    }
  });

  it('applies defense-down and wakes a sleeping target before the evasion roll', () => {
    const enemy = starterEnemy()[0];
    const profile = { ...STARTER_RONIN_ATTACK, criticalChance: 0 };
    const weakened = resolveBasicAttack([{
      ...enemy,
      sourceStatusEffects: [{ id: 4, ticksElapsed: 0 }],
    }], 1, profile, 99);
    expect(weakened.kind).toBe('hit');
    if (weakened.kind === 'hit') expect(weakened.damage).toBe(14);

    const sleeping = {
      ...enemy,
      definition: { ...enemy.definition, evasion: 100 },
      sourceStatusEffects: [{ id: 0 as const, ticksElapsed: 5 }],
    };
    const missed = resolveBasicAttack([sleeping], 1, profile, 0);
    expect(missed.kind).toBe('miss');
    expect(missed.combatants[0].sourceStatusEffects).toEqual([]);
  });

  it('uses the special au incoming-hit rules for evasion, damage, and status', () => {
    const enemy = starterEnemy()[0];
    const profile = { ...STARTER_RONIN_ATTACK, criticalChance: 0 };
    const evasiveBoss = {
      ...enemy,
      sourceAu: true,
      definition: { ...enemy.definition, evasion: 30 },
    };
    const evaded = resolveBasicAttack([evasiveBoss], 1, profile, 60);
    expect(evaded.kind).toBe('miss');
    if (evaded.kind === 'miss') expect(evaded.evasionThreshold).toBe(74);

    const sleepingBoss = {
      ...enemy,
      sourceAu: true,
      sourceStatusEffects: [{ id: 0 as const, ticksElapsed: 5 }],
    };
    const proc = resolveBasicAttack([sleepingBoss], 1, profile, 99, false, 0);
    expect(proc.kind).toBe('hit');
    if (proc.kind === 'hit') {
      expect(proc.damage).toBe(11);
      expect(proc.target.sourceStatusEffects).toEqual([{ id: 0, ticksElapsed: 5 }]);
    }

    const bossCode3 = resolveBasicAttack([{
      ...enemy,
      sourceAu: true,
    }], 1, profile, 99, false, 3);
    expect(bossCode3.kind).toBe('hit');
    if (bossCode3.kind === 'hit') {
      expect(bossCode3.damage).toBe(11);
      expect(bossCode3.playerSpCost).toBe(3);
    }

    const bossCode4 = resolveBasicAttack([{
      ...enemy,
      sourceAu: true,
    }], 1, profile, 99, false, 4);
    expect(bossCode4.kind).toBe('hit');
    if (bossCode4.kind === 'hit') {
      expect(bossCode4.damage).toBe(11);
      expect(bossCode4.playerHpCost).toBe(5);
    }

    const bossCode8 = resolveBasicAttack([{
      ...enemy,
      sourceAu: true,
    }], 1, profile, 99, false, 8);
    expect(bossCode8.kind).toBe('hit');
    if (bossCode8.kind === 'hit') expect(bossCode8.damage).toBe(22);

    const defenseDownBoss = {
      ...enemy,
      sourceAu: true,
      sourceStatusEffects: [{ id: 4 as const, ticksElapsed: 2 }],
    };
    const fullDefense = resolveBasicAttack([defenseDownBoss], 1, profile, 99);
    expect(fullDefense.kind).toBe('hit');
    if (fullDefense.kind === 'hit') expect(fullDefense.damage).toBe(11);

    const code2 = resolveBasicAttack([{
      ...enemy,
      sourceAu: true,
    }], 1, profile, 99, false, 2);
    expect(code2.kind).toBe('hit');
    if (code2.kind === 'hit') expect(code2.damage).toBe(11);
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

  it('uses explicit source footprints and removes map-13 companions on lead defeat', () => {
    const group = createEnemyCombatants([
      {
        tileX: 9,
        tileY: 5,
        enemyId: 36,
        sourceOrder: 10,
        sourceBehavior: 'map13-af',
        sourceFootprintWidth: 3,
        sourceGroupId: 'map13-stage-two',
      },
      {
        tileX: 6,
        tileY: 5,
        enemyId: 37,
        sourceOrder: 11,
        sourceBehavior: 'map13-bc',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map13-stage-two',
      },
      {
        tileX: 13,
        tileY: 5,
        enemyId: 38,
        sourceOrder: 12,
        sourceBehavior: 'map13-cc',
        sourceFootprintWidth: 2,
        sourceGroupId: 'map13-stage-two',
      },
    ], parseEnemyDataTable(enemyTableFixture()));

    expect(group.map(enemyFootprintWidth)).toEqual([3, 2, 2]);
    const leadDefeated = group.map((enemy) => enemy.sourceOrder === 10
      ? { ...enemy, state: 'death-pending' as const, deathUpdatesRemaining: 24 }
      : enemy);
    const afterSourceDeath = removeSourceMap13BossCompanions(
      leadDefeated,
      new Set([10]),
    );
    expect(afterSourceDeath.map(({ state, deathUpdatesRemaining }) => ({
      state,
      deathUpdatesRemaining,
    }))).toEqual([
      { state: 'death-pending', deathUpdatesRemaining: 24 },
      { state: 'removed', deathUpdatesRemaining: 0 },
      { state: 'removed', deathUpdatesRemaining: 0 },
    ]);
    expect(afterSourceDeath.slice(1).every(({ sourceAu }) => sourceAu === true)).toBe(true);
  });

  it('creates map-82 bu as a stationary source au actor with its source death counter', () => {
    const data = enemyTableFixture();
    data.records[42].packedAttributes.classCode = 1;
    data.records[42].packedAttributes.shapeCode = 2;
    const bu = createEnemyCombatants([{
      tileX: 7,
      tileY: 10,
      enemyId: 42,
      sourceOrder: 4,
      spriteId: 1,
      sourceBehavior: 'map82-bu',
      deathUpdatesBeforeRemoval: 16,
      directTypeZeroMarkerOnRemoval: 1,
    }], parseEnemyDataTable(data))[0];

    expect(bu).toMatchObject({
      sourceAu: true,
      sourceBehavior: 'map82-bu',
      spriteId: 1,
      tileX: 7,
      tileY: 10,
      deathUpdatesBeforeRemoval: 16,
      directTypeZeroMarkerOnRemoval: 1,
    });
    expect(bu.sourceCbAi).toBeUndefined();
    expect(bu.sourceAqAi).toBeUndefined();
    expect(bu.sourceMap13Ai).toBeUndefined();

    let dying: EnemyCombatant = { ...bu, state: 'death-pending', deathUpdatesRemaining: 16 };
    for (let update = 0; update < 16; update += 1) {
      dying = advanceEnemyDeathTick([dying])[0];
    }
    expect(dying).toMatchObject({ state: 'death-pending', deathUpdatesRemaining: 0 });
    expect(advanceEnemyDeathTick([dying])[0].state).toBe('removed');
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

  it('does not apply the ordinary ak hit reaction to au subclasses', () => {
    const boss = { ...starterEnemy()[0], sourceAu: true };
    expect(beginEnemyDamageReaction(boss, 4)).toEqual(boss);
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
    expect(enemies[0].animationFrameIndex).toBe(-1);
    expect(findFacingEnemy(enemies, 9, 30, 4)).toBeUndefined();
    expect(resolveBasicAttack(enemies, 1, STARTER_RONIN_ATTACK, 99).kind).toBe('no-target');
  });

  it('preserves the direct source skill death cursor at frame zero', () => {
    const enemy = starterEnemy()[0];
    const result = applySourceSkillDamage([enemy], enemy.sourceOrder, 10_000, 0);
    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.target.state).toBe('death-pending');
      expect(result.target.animationFrameIndex).toBe(0);
    }
  });

  it('does not wake an au target when direct source skill damage lands', () => {
    const enemy = {
      ...starterEnemy()[0],
      sourceAu: true,
      sourceStatusEffects: [{ id: 0 as const, ticksElapsed: 5 }],
    };
    const result = applySourceSkillDamage([enemy], enemy.sourceOrder, 10, 0);
    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.target.sourceStatusEffects).toEqual([{ id: 0, ticksElapsed: 5 }]);
    }
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

  it('doubles source defense while the player defense skill is active', () => {
    const result = resolveEnemyMeleeDefense(
      starterEnemy()[0],
      { ...starterRoninDefenseForLevel(1), doubleDefense: true },
      (minimum, maximum) => minimum === 0 && maximum === 99 ? 99 : 0,
    );
    expect(result).toEqual({ evaded: false, evasionThreshold: 8, damage: 0 });
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
