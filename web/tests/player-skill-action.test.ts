import { describe, expect, it } from 'vitest';
import {
  advancePlayerSkillAction,
  assignPlayerSkillLevelSlot,
  awardPlayerSkillExperience,
  createPlayerSkillActionState,
  playerSkillLevelForActionButton,
  restoreSkillResource,
  sourceActionNeedsActorTargetReselection,
  startPlayerSkillAction,
} from '../src/world/player-skill-action';
import {
  applySourceCounterDamage,
  applySourceInstantKillDamage,
  applySourceSkillDamage,
  createEnemyCombatants,
  parseEnemyDataTable,
} from '../src/world/combat';

function skillEnemy(elementCode = 0) {
  const table = parseEnemyDataTable({
    format: 'heroes-lore-enemy-data-v1',
    variant: 0,
    records: Array.from({ length: 43 }, (_, index) => ({
      index,
      labelToken: '580',
      baseCode: 1,
      packedAttributes: { classCode: 0, shapeCode: 0, elementCode, variantCode: 0 },
      statusFlags: { bit3: false },
      maxHp: 100,
      attack: 8,
      defense: 40,
      evasion: 20,
      behaviorCodes: [2, 7, 10],
      respawnDelay: 300,
      dropCandidates: [],
    })),
  });
  return createEnemyCombatants([{ tileX: 5, tileY: 6, enemyId: 24, sourceOrder: 1 }], table);
}

describe('source player skill action lifecycle', () => {
  it('levels only the active skill from the source x4 experience award', () => {
    const levelTwo = awardPlayerSkillExperience(createPlayerSkillActionState(0), 20);
    expect(levelTwo).toMatchObject({ skillRank: 2, skillExperience: 0 });

    const multipleRanks = awardPlayerSkillExperience(createPlayerSkillActionState(0), 400);
    expect(multipleRanks).toMatchObject({ skillRank: 6, skillExperience: 230 });

    const rankTenSkill = awardPlayerSkillExperience(createPlayerSkillActionState(4), 425);
    expect(rankTenSkill).toMatchObject({ skillRank: 11, skillExperience: 0 });

    const noActiveSkill = createPlayerSkillActionState(null);
    expect(awardPlayerSkillExperience(noActiveSkill, 20)).toBe(noActiveSkill);
  });

  it('opens skill level 1 when progression reaches source rank 9', () => {
    const rankNine = awardPlayerSkillExperience(createPlayerSkillActionState(0), 993);
    expect(rankNine).toMatchObject({
      skillRank: 9,
      skillExperience: 0,
      skillLevelSlotOne: 0,
      skillLevelSlotThree: 1,
      chargeTicksRemaining: [56, 280, 280],
    });
    const charged = advancePlayerSkillAction(rankNine, 280 * 71).state;
    expect(startPlayerSkillAction(charged, 1, 5, 5, 2).accepted).toBe(true);
  });

  it('assigns unlocked levels to separate action buttons and rejects duplicate or locked bindings', () => {
    const starter = createPlayerSkillActionState(0);
    expect(starter).toMatchObject({ skillLevelSlotOne: 0, skillLevelSlotThree: null });
    expect(playerSkillLevelForActionButton(starter, '1')).toBe(0);
    expect(playerSkillLevelForActionButton(starter, '3')).toBeNull();
    expect(assignPlayerSkillLevelSlot(starter, '3', 1)).toMatchObject({
      accepted: false,
      reason: 'locked',
    });

    const rankTwenty = createPlayerSkillActionState(4, 4, 20);
    const assigned = assignPlayerSkillLevelSlot(rankTwenty, '1', 2);
    expect(assigned).toMatchObject({
      accepted: true,
      state: { skillLevelSlotOne: 2, skillLevelSlotThree: 1 },
    });
    expect(assignPlayerSkillLevelSlot(assigned.state, '3', 2)).toMatchObject({
      accepted: false,
      reason: 'already-assigned',
    });
  });

  it('restores the source percentage of a resource maximum and clamps at the maximum', () => {
    expect(restoreSkillResource(30, 72, 30)).toBe(51);
    expect(restoreSkillResource(68, 72, 30)).toBe(72);
    expect(restoreSkillResource(10, 60, 20)).toBe(22);
  });

  it('activates the source 160-update defense buff for skill 2 level 1', () => {
    const initial = createPlayerSkillActionState(2, 4, 9);
    const charged = advancePlayerSkillAction(initial, 270 * 71).state;
    expect(charged.chargeTicksRemaining[1]).toBe(0);
    const started = startPlayerSkillAction(charged, 1, 8, 8, 2);
    expect(started.accepted).toBe(true);

    const active = advancePlayerSkillAction(started.state, 14 * 71).state;
    expect(active).toMatchObject({ phase: 3, effectAge: 1, defenseBoostTicksRemaining: 160 });
    expect(advancePlayerSkillAction(active, 71).state.defenseBoostTicksRemaining).toBe(159);
    expect(advancePlayerSkillAction(active, 160 * 71).state.defenseBoostTicksRemaining).toBe(0);
  });

  it('emits the source actor-attached skill streams, aura, delays, and durations', () => {
    const firstAttachedVisuals = (skillId: number, levelSlot: 0 | 1 | 2) => {
      let state = createPlayerSkillActionState(skillId, 4, 20);
      state = { ...state, chargeTicksRemaining: [0, 0, 0] };
      const started = startPlayerSkillAction(state, levelSlot, 5, 5, 2);
      expect(started.accepted).toBe(true);
      state = started.state;
      for (let tick = 0; tick < 24; tick += 1) {
        const step = advancePlayerSkillAction(state, 71);
        state = step.state;
        if (step.attachedVisualSpawns.length > 0) return step.attachedVisualSpawns;
      }
      throw new Error(`Skill ${skillId} level ${levelSlot} did not emit an attached visual`);
    };

    expect(firstAttachedVisuals(0, 1)).toEqual([{
      skillId: 0,
      sourceStreamSlot: 1,
      kind: 'stream',
      durationTicks: 8,
      delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(0, 2)).toEqual([{
      skillId: 0,
      sourceStreamSlot: null,
      kind: 'skill-0-aura',
      durationTicks: 160,
      delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(1, 0)).toEqual([{
      skillId: 1, sourceStreamSlot: 0, kind: 'stream', durationTicks: 8, delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(1, 1)).toEqual([{
      skillId: 1, sourceStreamSlot: 1, kind: 'stream', durationTicks: 9, delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(1, 2)).toEqual([
      { skillId: 1, sourceStreamSlot: 0, kind: 'stream', durationTicks: 80, delayTicks: 0 },
      { skillId: 1, sourceStreamSlot: 0, kind: 'stream', durationTicks: 8, delayTicks: 4 },
      { skillId: 1, sourceStreamSlot: 0, kind: 'stream', durationTicks: 8, delayTicks: 24 },
      { skillId: 1, sourceStreamSlot: 0, kind: 'stream', durationTicks: 8, delayTicks: 44 },
    ]);
    expect(firstAttachedVisuals(2, 1)).toEqual([{
      skillId: 2, sourceStreamSlot: 1, kind: 'stream', durationTicks: 8, delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(2, 2)).toEqual([{
      skillId: 2, sourceStreamSlot: 2, kind: 'stream', durationTicks: 12, delayTicks: 0,
    }]);
    expect(firstAttachedVisuals(4, 2)).toEqual([{
      skillId: 4, sourceStreamSlot: 2, kind: 'stream', durationTicks: 15, delayTicks: 0,
    }]);
  });

  it('uses the source charge counter before accepting the first skill level', () => {
    const initial = createPlayerSkillActionState(0, 4);
    expect(startPlayerSkillAction(initial, 0, 5, 5, 2).accepted).toBe(false);

    const charged = advancePlayerSkillAction(initial, 56 * 71).state;
    expect(charged.chargeTicksRemaining).toEqual([0, 280, 280]);
    const started = startPlayerSkillAction(charged, 0, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, levelSlot: 0, tileX: 5, tileY: 6, windupTicksRemaining: 10 },
    });
  });

  it('emits the source skill-0 level-0 lane and diagonal hit schedule', () => {
    let state = createPlayerSkillActionState(0, 4);
    state = advancePlayerSkillAction(state, 56 * 71).state;
    state = startPlayerSkillAction(state, 0, 5, 5, 2).state;

    const windup = advancePlayerSkillAction(state, 10 * 71);
    expect(windup.state).toMatchObject({ phase: 3, effectAge: 1, effectComplete: false });
    expect(windup.damagePulses).toEqual([]);

    const effects = advancePlayerSkillAction(windup.state, 12 * 71);
    expect(effects.damagePulses.map(({ tileX, tileY, power, elementCode }) => ({
      tileX, tileY, power, elementCode,
    }))).toEqual([
      { tileX: 5, tileY: 6, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 7, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 8, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 6, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 9, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 7, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 8, power: 47, elementCode: 1 },
      { tileX: 4, tileY: 9, power: 47, elementCode: 1 },
      { tileX: 6, tileY: 9, power: 47, elementCode: 1 },
      { tileX: 5, tileY: 9, power: 47, elementCode: 1 },
      { tileX: 4, tileY: 9, power: 47, elementCode: 1 },
      { tileX: 6, tileY: 9, power: 47, elementCode: 1 },
    ]);
    expect(effects.state.effectAge).toBe(13);
  });

  it('emits the source skill-0 attack effect sprites on their lane cells', () => {
    let state = createPlayerSkillActionState(0, 4);
    state = advancePlayerSkillAction(state, 56 * 71).state;
    state = startPlayerSkillAction(state, 0, 5, 5, 2).state;

    const opening = advancePlayerSkillAction(state, 10 * 71);
    expect(opening.visualSpawns).toEqual([{
      tileX: 5, tileY: 6, effectType: 1, skillId: 0, levelSlot: 0,
    }]);
    const distanceOne = advancePlayerSkillAction(opening.state, 71);
    expect(distanceOne.visualSpawns).toEqual([{
      tileX: 5, tileY: 7, effectType: 1, skillId: 0, levelSlot: 0,
    }]);
    const distanceTwo = advancePlayerSkillAction(distanceOne.state, 71);
    expect(distanceTwo.visualSpawns).toEqual([{
      tileX: 5, tileY: 8, effectType: 1, skillId: 0, levelSlot: 0,
    }]);
    const distanceThree = advancePlayerSkillAction(distanceTwo.state, 3 * 71);
    expect(distanceThree.visualSpawns).toEqual([
      { tileX: 5, tileY: 9, effectType: 2, skillId: 0, levelSlot: 0 },
      { tileX: 4, tileY: 9, effectType: 2, skillId: 0, levelSlot: 0 },
      { tileX: 6, tileY: 9, effectType: 2, skillId: 0, levelSlot: 0 },
      { tileX: 5, tileY: 6, effectType: 1, skillId: 0, levelSlot: 0 },
    ]);
  });

  it('emits overlapping source cross effect waves at the original cadence', () => {
    let state = createPlayerSkillActionState(3, 4);
    state = advancePlayerSkillAction(state, 80 * 71).state;
    state = startPlayerSkillAction(state, 0, 5, 5, 2).state;

    const waves = advancePlayerSkillAction(state, 21 * 71);
    expect(waves.visualSpawns.filter(({ tileX, tileY }) => tileX === 5 && tileY === 6)).toHaveLength(2);
    expect(waves.visualSpawns).toContainEqual({
      tileX: 5, tileY: 4, effectType: 5, skillId: 3, levelSlot: 0,
    });
    expect(waves.visualSpawns).toContainEqual({
      tileX: 5, tileY: 6, effectType: 5, skillId: 3, levelSlot: 0,
    });
    expect(waves.visualSpawns.every(({ effectType }) => effectType === 5)).toBe(true);
  });

  it('emits the source skill-2 level-0 lane twice with its element and power', () => {
    let state = createPlayerSkillActionState(2, 4);
    state = advancePlayerSkillAction(state, 56 * 71).state;
    state = startPlayerSkillAction(state, 0, 5, 5, 2).state;

    const opening = advancePlayerSkillAction(state, 12 * 71);
    expect(opening.damagePulses).toEqual([
      { tileX: 5, tileY: 6, power: 44, elementCode: 3, actionId: 1 },
    ]);
    const remaining = advancePlayerSkillAction(opening.state, 7 * 71);
    expect(remaining.damagePulses.map(({ tileX, tileY, power, elementCode }) => ({
      tileX, tileY, power, elementCode,
    }))).toEqual([
      { tileX: 5, tileY: 7, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 8, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 9, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 6, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 7, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 8, power: 44, elementCode: 3 },
      { tileX: 5, tileY: 9, power: 44, elementCode: 3 },
    ]);
    expect(remaining.state.effectAge).toBe(10);
  });

  it('emits skill-3 level-0 expanding elemental damage crosses', () => {
    let state = createPlayerSkillActionState(3, 4);
    state = advancePlayerSkillAction(state, 80 * 71).state;
    const started = startPlayerSkillAction(state, 0, 5, 5, 2);
    expect(started.accepted).toBe(true);

    const active = advancePlayerSkillAction(started.state, 14 * 71);
    expect(active.state).toMatchObject({ phase: 3, effectAge: 1 });
    expect(active.damagePulses).toEqual([]);
    const firstDamage = advancePlayerSkillAction(active.state, 5 * 71);
    expect(firstDamage.damagePulses).toEqual([
      { tileX: 5, tileY: 6, power: 42, elementCode: 1, actionId: 1 },
    ]);
    const firstRing = advancePlayerSkillAction(firstDamage.state, 3 * 71);
    expect(firstRing.damagePulses).toEqual([
      { tileX: 5, tileY: 5, power: 42, elementCode: 1, actionId: 1 },
      { tileX: 5, tileY: 7, power: 42, elementCode: 1, actionId: 1 },
      { tileX: 4, tileY: 6, power: 42, elementCode: 1, actionId: 1 },
      { tileX: 6, tileY: 6, power: 42, elementCode: 1, actionId: 1 },
    ]);
  });

  it('applies skill-3 level-1 damage at two source-random cells for 80 updates', () => {
    let state = createPlayerSkillActionState(3, 4, 9);
    state = advancePlayerSkillAction(state, 270 * 71).state;
    const started = startPlayerSkillAction(state, 1, 5, 5, 2);
    expect(started.accepted).toBe(true);

    const initialRaw = [4, -1, 5, -1];
    const active = advancePlayerSkillAction(
      started.state,
      20 * 71,
      undefined,
      () => initialRaw.shift() ?? 0,
    );
    expect(active.state).toMatchObject({ phase: 3, effectAge: 1 });
    expect(active.damagePulses).toEqual([
      { tileX: 6, tileY: 5, power: 60, elementCode: 1, actionId: 1 },
      { tileX: 7, tileY: 6, power: 60, elementCode: 1, actionId: 1 },
    ]);
    expect(initialRaw).toEqual([]);

    let trailingRawDraws = 0;
    const tail = advancePlayerSkillAction(
      active.state,
      81 * 71,
      () => 0,
      () => {
        trailingRawDraws += 1;
        return 0;
      },
    );
    expect(tail.damagePulses).toHaveLength(158);
    expect(trailingRawDraws).toBe(81 * 4);
    expect(tail.state).toMatchObject({ phase: 3, effectAge: 82, effectComplete: true });
  });

  it('applies skill-5 level-1 element-3 damage at two source-random cells for 80 updates', () => {
    let state = createPlayerSkillActionState(5, 4);
    state = advancePlayerSkillAction(state, 270 * 71).state;
    const started = startPlayerSkillAction(state, 1, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { skillRank: 20, phase: 1, durationTicks: 10, levelSlot: 1 },
    });

    const initialRaw = [4, -1, 5, -1];
    const active = advancePlayerSkillAction(
      started.state,
      20 * 71,
      undefined,
      () => initialRaw.shift() ?? 0,
    );
    expect(active.state).toMatchObject({ phase: 3, effectAge: 1 });
    expect(active.damagePulses).toEqual([
      { tileX: 6, tileY: 5, power: 71, elementCode: 3, actionId: 1 },
      { tileX: 7, tileY: 6, power: 71, elementCode: 3, actionId: 1 },
    ]);
    expect(active.visualSpawns).toEqual([
      { tileX: 6, tileY: 5, effectType: 9, skillId: 5, levelSlot: 1 },
      { tileX: 7, tileY: 6, effectType: 9, skillId: 5, levelSlot: 1 },
    ]);
    expect(initialRaw).toEqual([]);

    let trailingRawDraws = 0;
    const tail = advancePlayerSkillAction(
      active.state,
      87 * 71,
      () => 0,
      () => {
        trailingRawDraws += 1;
        return 0;
      },
    );
    expect(tail.damagePulses).toHaveLength(158);
    expect(trailingRawDraws).toBe(87 * 4);
    expect(tail.state).toMatchObject({ phase: 3, effectAge: 88, effectComplete: true });
  });

  it('emits the map-12 skill-4 reward attack as element-2 expanding crosses', () => {
    let state = createPlayerSkillActionState(4, 4);
    state = advancePlayerSkillAction(state, 80 * 71).state;
    const started = startPlayerSkillAction(state, 0, 5, 5, 2);
    expect(started.accepted).toBe(true);

    const center = advancePlayerSkillAction(started.state, 14 * 71);
    expect(center.damagePulses).toEqual([
      { tileX: 5, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
    ]);
    expect(center.state).toMatchObject({ phase: 3, effectAge: 5 });

    const firstRing = advancePlayerSkillAction(center.state, 5 * 71);
    expect(firstRing.damagePulses).toEqual([
      { tileX: 5, tileY: 5, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 5, tileY: 7, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 4, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 6, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
    ]);

    const secondWave = advancePlayerSkillAction(firstRing.state, 1 * 71);
    expect(secondWave.damagePulses).toEqual([
      { tileX: 5, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
    ]);
    const secondRing = advancePlayerSkillAction(secondWave.state, 4 * 71);
    expect(secondRing.damagePulses).toEqual([
      { tileX: 5, tileY: 4, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 5, tileY: 8, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 3, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
      { tileX: 7, tileY: 6, power: 69, elementCode: 2, actionId: 1 },
    ]);
  });

  it('emits skill-5 level-0 as element-3 expanding crosses', () => {
    let state = createPlayerSkillActionState(5, 4);
    state = advancePlayerSkillAction(state, 80 * 71).state;
    const started = startPlayerSkillAction(state, 0, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { skillRank: 20, phase: 1, durationTicks: 0, levelSlot: 0 },
    });

    const center = advancePlayerSkillAction(started.state, 14 * 71);
    expect(center.damagePulses).toEqual([
      { tileX: 5, tileY: 6, power: 99, elementCode: 3, actionId: 1 },
    ]);
    expect(center.state.effectAge).toBe(5);

    const firstRing = advancePlayerSkillAction(center.state, 5 * 71);
    expect(firstRing.damagePulses).toEqual([
      { tileX: 5, tileY: 5, power: 99, elementCode: 3, actionId: 1 },
      { tileX: 5, tileY: 7, power: 99, elementCode: 3, actionId: 1 },
      { tileX: 4, tileY: 6, power: 99, elementCode: 3, actionId: 1 },
      { tileX: 6, tileY: 6, power: 99, elementCode: 3, actionId: 1 },
    ]);
  });

  it('returns the source camera shake and consumes its random draws on the first six skill-2 updates', () => {
    let state = createPlayerSkillActionState(2, 4);
    state = advancePlayerSkillAction(state, 56 * 71).state;
    state = startPlayerSkillAction(state, 0, 5, 5, 2).state;
    const draws: Array<[number, number]> = [];

    const opening = advancePlayerSkillAction(state, 16 * 71, (minimum, maximum) => {
      draws.push([minimum, maximum]);
      return 0;
    });

    expect(draws).toEqual(Array.from({ length: 12 }, () => [-4, 4]));
    expect(opening.cameraShakeOffset).toEqual({ x: 0, y: 0 });
    expect(advancePlayerSkillAction(opening.state, 71).cameraShakeOffset).toBeUndefined();
  });

  it('applies skill damage without ordinary enemy defense or evasion', () => {
    const enemy = skillEnemy();
    const result = applySourceSkillDamage(enemy, 1, 47, 1);
    expect(result).toMatchObject({ kind: 'hit', damage: 47 });
    expect(result.combatants[0]).toMatchObject({ hp: 53, state: 'alive' });

    const resistant = createEnemyCombatants([{
      tileX: 5, tileY: 6, enemyId: 24, sourceOrder: 1,
    }], parseEnemyDataTable({
      format: 'heroes-lore-enemy-data-v1',
      variant: 0,
      records: Array.from({ length: 43 }, (_, index) => ({
        index,
        labelToken: '580',
        baseCode: 1,
        packedAttributes: { classCode: 0, shapeCode: 0, elementCode: 2, variantCode: 0 },
        statusFlags: { bit3: false },
        maxHp: 100,
        attack: 8,
        defense: 40,
        evasion: 20,
        behaviorCodes: [2, 7, 10],
        respawnDelay: 300,
        dropCandidates: [],
      })),
    }));
    expect(applySourceSkillDamage(resistant, 1, 47, 1).combatants[0].hp).toBe(72);
  });

  it('wakes a sleeping enemy before direct skill damage and preserves other statuses', () => {
    const sleeping = {
      ...skillEnemy()[0],
      sourceStatusEffects: [
        { id: 0 as const, ticksElapsed: 12 },
        { id: 4 as const, ticksElapsed: 8 },
      ],
    };

    const result = applySourceSkillDamage([sleeping], 1, 47, 1);

    expect(result.kind).toBe('hit');
    if (result.kind === 'hit') {
      expect(result.target.hp).toBe(53);
      expect(result.target.sourceStatusEffects).toEqual([{ id: 4, ticksElapsed: 8 }]);
    }
  });

  it('applies the second starter level combo bonus for the source status duration', () => {
    let state = createPlayerSkillActionState(0, 4, 9);
    state = advancePlayerSkillAction(state, 280 * 71).state;
    const started = startPlayerSkillAction(state, 1, 5, 5, 4);
    expect(started.accepted).toBe(true);
    const windup = advancePlayerSkillAction(started.state, 10 * 71);
    expect(windup.state.comboPowerBoostTicksRemaining).toBe(140);
    expect(sourceActionNeedsActorTargetReselection(windup.state)).toBe(true);
    const expired = advancePlayerSkillAction(windup.state, 140 * 71);
    expect(expired.state.comboPowerBoostTicksRemaining).toBe(0);
  });

  it('runs skill-1 level-0 through its active duration before restoring 30 percent max HP', () => {
    let state = createPlayerSkillActionState(1, 5);
    state = advancePlayerSkillAction(state, 220 * 71).state;
    const started = startPlayerSkillAction(state, 0, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, tileX: 5, tileY: 6, durationTicks: 4 },
    });

    const active = advancePlayerSkillAction(started.state, 10 * 71);
    expect(active.state).toMatchObject({ phase: 2, durationTicksRemaining: 4 });
    expect(active.restoreEffects).toEqual([]);
    const resolved = advancePlayerSkillAction(active.state, 4 * 71);
    expect(resolved.restoreEffects).toEqual([{ resource: 'hp', percent: 30 }]);
    expect(resolved.state).toMatchObject({ phase: 3, effectAge: 1 });
  });

  it('runs skill-1 level-1 through its active duration before restoring 20 percent max SP', () => {
    let state = createPlayerSkillActionState(1, 5, 9);
    state = advancePlayerSkillAction(state, 160 * 71).state;
    const started = startPlayerSkillAction(state, 1, 5, 5, 2);
    expect(started.accepted).toBe(true);
    const active = advancePlayerSkillAction(started.state, 10 * 71);
    expect(active.state).toMatchObject({ phase: 2, durationTicksRemaining: 4 });
    const resolved = advancePlayerSkillAction(active.state, 4 * 71);
    expect(resolved.restoreEffects).toEqual([{ resource: 'sp', percent: 20 }]);
    expect(resolved.state).toMatchObject({ phase: 3, effectAge: 1 });
  });

  it('unlocks skill-4 level-2 at rank 20 and restores 20 percent max HP and SP', () => {
    const belowRank = {
      ...createPlayerSkillActionState(4, 5, 19),
      chargeTicksRemaining: [0, 0, 0] as [number, number, number],
    };
    expect(startPlayerSkillAction(belowRank, 2, 5, 5, 2).accepted).toBe(false);

    const rankTwenty = assignPlayerSkillLevelSlot(createPlayerSkillActionState(4, 5, 20), '1', 2);
    const assigned = advancePlayerSkillAction(rankTwenty.state, 220 * 71);
    expect(rankTwenty.accepted).toBe(true);
    const selectedLevel = playerSkillLevelForActionButton(assigned.state, '1');
    expect(selectedLevel).toBe(2);
    const started = startPlayerSkillAction(assigned.state, selectedLevel!, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, levelSlot: 2, durationTicks: 6, chargeTicksRemaining: [80, 50, 220] },
    });

    const active = advancePlayerSkillAction(started.state, 10 * 71);
    expect(active.state).toMatchObject({ phase: 2, durationTicksRemaining: 6 });
    expect(active.restoreEffects).toEqual([]);
    const resolved = advancePlayerSkillAction(active.state, 6 * 71);
    expect(resolved.restoreEffects).toEqual([
      { resource: 'hp', percent: 20 },
      { resource: 'sp', percent: 20 },
    ]);
    expect(resolved.state).toMatchObject({ phase: 3, effectAge: 1 });

    const ended = advancePlayerSkillAction(resolved.state, 16 * 71);
    expect(ended.state).toMatchObject({ phase: 3, effectAge: 17, effectComplete: true });
  });

  it('unlocks skill-2 level-2 at rank 20 and clears the source attack and defense buffs', () => {
    const belowRank = {
      ...createPlayerSkillActionState(2, 4, 19),
      chargeTicksRemaining: [0, 0, 0] as [number, number, number],
    };
    expect(startPlayerSkillAction(belowRank, 2, 5, 5, 2).accepted).toBe(false);

    const assigned = assignPlayerSkillLevelSlot(createPlayerSkillActionState(2, 4, 20), '1', 2);
    expect(assigned.accepted).toBe(true);
    const charged = advancePlayerSkillAction(assigned.state, 220 * 71).state;
    const withActiveBuffs = {
      ...charged,
      comboPowerBoostTicksRemaining: 120,
      defenseBoostTicksRemaining: 140,
    };
    const started = startPlayerSkillAction(withActiveBuffs, 2, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, levelSlot: 2, durationTicks: 0, chargeTicksRemaining: [56, 50, 220] },
    });

    const effect = advancePlayerSkillAction(started.state, 10 * 71);
    expect(effect.statusEffectsCleared).toBe(true);
    expect(effect.restoreEffects).toEqual([]);
    expect(effect.state).toMatchObject({
      phase: 3,
      effectAge: 1,
      comboPowerBoostTicksRemaining: 0,
      defenseBoostTicksRemaining: 0,
    });
  });

  it('unlocks skill-1 level-2 and doubles passive recovery during its source window', () => {
    const belowRank = {
      ...createPlayerSkillActionState(1, 4, 19),
      chargeTicksRemaining: [0, 0, 0] as [number, number, number],
    };
    expect(startPlayerSkillAction(belowRank, 2, 5, 5, 2).accepted).toBe(false);

    const assigned = assignPlayerSkillLevelSlot(createPlayerSkillActionState(1, 4, 20), '1', 2);
    expect(assigned.accepted).toBe(true);
    const charged = advancePlayerSkillAction(assigned.state, 270 * 71).state;
    const started = startPlayerSkillAction(charged, 2, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, levelSlot: 2, durationTicks: 10, chargeTicksRemaining: [220, 0, 270] },
    });

    const activated = advancePlayerSkillAction(started.state, 20 * 71);
    expect(activated.state).toMatchObject({ phase: 3, effectAge: 1, recoveryBoostTicksRemaining: 81 });
    expect(advancePlayerSkillAction(activated.state, 81 * 71).state).toMatchObject({
      effectAge: 82,
      effectComplete: true,
      recoveryBoostTicksRemaining: 0,
    });
  });

  it('activates skill-0 level-2 counterattack damage for the source effect lifetime', () => {
    const belowRank = {
      ...createPlayerSkillActionState(0, 5, 19),
      chargeTicksRemaining: [0, 0, 0] as [number, number, number],
    };
    expect(startPlayerSkillAction(belowRank, 2, 5, 5, 2).accepted).toBe(false);

    const assigned = assignPlayerSkillLevelSlot(createPlayerSkillActionState(0, 5, 20), '1', 2);
    expect(assigned.accepted).toBe(true);
    const charged = advancePlayerSkillAction(assigned.state, 280 * 71).state;
    const started = startPlayerSkillAction(charged, 2, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, levelSlot: 2, durationTicks: 10, chargeTicksRemaining: [56, 0, 280] },
    });

    const activated = advancePlayerSkillAction(started.state, 20 * 71);
    expect(activated.state).toMatchObject({
      phase: 3,
      effectAge: 1,
      counterattackBoostTicksRemaining: 161,
    });
    expect(advancePlayerSkillAction(activated.state, 161 * 71).state).toMatchObject({
      effectAge: 162,
      effectComplete: true,
      counterattackBoostTicksRemaining: 0,
    });
  });

  it('applies the source counterattack as flat damage without enemy defense', () => {
    const enemy = skillEnemy();
    const counter = applySourceCounterDamage(enemy, 1, 85);
    expect(counter).toMatchObject({
      kind: 'hit',
      damage: 85,
      target: { hp: 15, state: 'alive' },
    });
  });

  it('enforces source rank gates and applies skill-4 level-1 guard immunity', () => {
    const belowRank = advancePlayerSkillAction(createPlayerSkillActionState(4, 4, 8), 270 * 71).state;
    expect(startPlayerSkillAction(belowRank, 1, 5, 5, 2).accepted).toBe(false);

    const ready = advancePlayerSkillAction(createPlayerSkillActionState(4, 4, 9), 270 * 71).state;
    const started = startPlayerSkillAction(ready, 1, 5, 5, 2);
    expect(started).toMatchObject({
      accepted: true,
      state: { phase: 1, durationTicks: 6, levelSlot: 1 },
    });

    const firstGuardVisualDraws = [2, 0, 1, 0];
    const firstGuardVisuals = advancePlayerSkillAction(
      started.state,
      16 * 71,
      () => 0,
      () => firstGuardVisualDraws.shift() ?? 0,
      { tileX: 5, tileY: 5 },
    );
    expect(firstGuardVisuals.visualSpawns).toEqual([
      { tileX: 7, tileY: 6, effectType: 8, skillId: 4, levelSlot: 1 },
      { tileX: 6, tileY: 6, effectType: 8, skillId: 4, levelSlot: 1 },
    ]);

    let rawDraws = 0;
    const guard = advancePlayerSkillAction(
      started.state,
      96 * 71,
      () => 0,
      () => { rawDraws += 1; return 0; },
      { tileX: 5, tileY: 5 },
    );
    expect(guard.state).toMatchObject({
      phase: 3,
      effectAge: 81,
      effectComplete: false,
      damageImmunityActive: true,
    });
    expect(guard.damagePulses).toEqual([]);
    expect(rawDraws).toBe(81 * 4);

    const released = advancePlayerSkillAction(
      guard.state,
      71,
      () => 0,
      () => { rawDraws += 1; return 0; },
      { tileX: 5, tileY: 5 },
    );
    expect(released.state).toMatchObject({ effectAge: 82, effectComplete: true, damageImmunityActive: false });
    expect(rawDraws).toBe(82 * 4);

    const distant = advancePlayerSkillAction(
      started.state,
      16 * 71,
      () => 0,
      () => 0,
      { tileX: 20, tileY: 20 },
    );
    expect(distant.state.damageImmunityActive).toBe(false);
  });

  it.each([
    [3, 1],
    [5, 3],
  ] as const)('runs skill %i level 2 once across four forward cells with element %i', (skillId, elementCode) => {
    const assigned = assignPlayerSkillLevelSlot(
      createPlayerSkillActionState(skillId, 5, 20),
      '1',
      2,
    );
    expect(assigned.accepted).toBe(true);
    const charged = advancePlayerSkillAction(assigned.state, 270 * 71).state;
    const started = startPlayerSkillAction(charged, 2, 5, 5, 4);
    expect(started).toMatchObject({
      accepted: true,
      state: { durationTicks: 8, levelSlot: 2, chargeTicksRemaining: [80, 0, 270] },
    });

    const effect = advancePlayerSkillAction(started.state, 18 * 71);
    expect(effect.instantKillCells).toEqual([6, 7, 8, 9].map((tileX) => ({
      tileX,
      tileY: 5,
      elementCode,
      actionId: 1,
    })));
    expect(advancePlayerSkillAction(effect.state, 71).instantKillCells).toEqual([]);
  });

  it('keeps skill-3 level 2 locked below its source rank-20 requirement', () => {
    const belowRank = {
      ...createPlayerSkillActionState(3, 5, 19),
      chargeTicksRemaining: [0, 0, 0] as [number, number, number],
    };
    expect(startPlayerSkillAction(belowRank, 2, 5, 5, 4)).toEqual({
      state: belowRank,
      accepted: false,
    });
  });

  it('uses source max-HP damage and leaves the au boss class immune to instant-kill skills', () => {
    const ordinary = skillEnemy(1);
    const killed = applySourceInstantKillDamage(ordinary, 1, 1);
    expect(killed).toMatchObject({
      kind: 'hit',
      damage: 100,
      target: { hp: 0, state: 'death-pending' },
    });
    expect(applySourceInstantKillDamage(ordinary, 1, 3)).toMatchObject({
      kind: 'no-target',
      combatants: ordinary,
    });

    const boss = [{ ...ordinary[0], sourceAu: true }];
    expect(applySourceInstantKillDamage(boss, 1, 1)).toEqual({
      kind: 'no-target',
      combatants: boss,
    });
  });
});
