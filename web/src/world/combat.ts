import type { Direction } from './actor';
import type { EventEnemyPlacement } from './event-data';

/** Element codes and damage factors copied from the original `t.a` table. */
export const ELEMENTAL_DAMAGE_TENTHS = [
  [10, 10, 10, 10],
  [10, 10, 6, 13],
  [10, 13, 10, 6],
  [10, 6, 13, 10],
] as const;

export type ElementCode = 0 | 1 | 2 | 3;
export const ENEMY_RESPAWN_DELAY_STEP = 16;

export interface EnemyDamageInput {
  /** Damage value calculated by the attack or skill before enemy defense. */
  power: number;
  /** The enemy definition's defense field (`i.f265c`). */
  defense: number;
  /** Element code supplied by the player's current attack. */
  attackElement: ElementCode;
  /** Element code from the enemy definition. */
  targetElement: ElementCode;
  applyDamageBonus?: boolean;
  /** The source `k.b` value, applied in tenths when the flag is set. */
  bonusTenths?: number;
}

export interface EnemyDamageResult {
  afterDefense: number;
  afterElement: number;
  damage: number;
}

export interface EnemyDefinition {
  index: number;
  labelToken: string;
  /** Source `i.f`; `ak.l()` uses it in the experience award formula. */
  experienceRewardCode: number;
  /** Source `i.f258a`; value 2 occupies two horizontal cells. */
  classCode: number;
  /** Source `i.b`; value 2 suppresses the death respawn queue. */
  shapeCode: number;
  /** Source `i.d`; values 2 and 3 use the longer movement approach range. */
  behaviorType: 0 | 1 | 2 | 3;
  /** Source `i.g`, used as an axis-aligned player acquisition range. */
  acquisitionRange: number;
  /** Source `i.h` action delay and `i.i` attack cooldown. */
  behaviorTiming: [number, number];
  /** Source `i.f259a`; provoked enemies with this flag use the extended range. */
  extendedProvokedRange: boolean;
  elementCode: ElementCode;
  maxHp: number;
  attack: number;
  defense: number;
  evasion: number;
  respawnDelay: number;
  dropCandidates: Array<[number, number, number]>;
}

export interface EnemyDataTable {
  variant: number;
  records: EnemyDefinition[];
}

export interface EnemyCombatant {
  sourceOrder: number;
  enemyId: number;
  tileX: number;
  tileY: number;
  /** Source entity pixel origin; movement advances this by 8 pixels per update. */
  pixelX: number;
  pixelY: number;
  /** Source `ak.d` sets this after a successful hit. */
  provoked: boolean;
  definition: EnemyDefinition;
  hp: number;
  state: 'alive' | 'death-pending' | 'respawn-wait' | 'removed';
  /** Three source updates return early; removal occurs on the following update. */
  deathUpdatesRemaining: number;
  /** Source countdown units, reduced by 16 once per 17 map updates. */
  respawnDelayRemaining: number | null;
  /** Source `ak.s`: a four-update reaction after a successful hit. */
  damageReactionTicksRemaining?: number;
  /** Direction passed by the player's attack when the reaction began. */
  damageReactionDirection?: Direction | null;
  /** Source `n.h - 1`, selecting idle, movement, or attack animation tracks. */
  animationStateIndex?: 0 | 1 | 2;
  /** Source `n.j`; direction values are north, south, west, east as 1–4. */
  animationDirection?: Direction;
  /** Source `n.k`, advanced once per map update. */
  animationFrameIndex?: number;
  /** Source `ak.p`; initialized from `i.i`, then reset to `i.i + 1` on attack. */
  attackCooldownTicksRemaining?: number;
  /** Source `ak.o`; path selection is delayed while an enemy is idle. */
  actionDelayTicksRemaining?: number;
  /** Source `ak.r`, accumulated by `ak.h()` while movement continues. */
  pursuitRetargetProgress?: number;
  /** Remaining source attack-animation updates after the strike begins. */
  attackAnimationTicksRemaining?: number;
  /** The source impact frame can damage the player at most once per attack. */
  attackHitResolved?: boolean;
}

export const ENEMY_DAMAGE_REACTION_TICKS = 4;

export interface BasicAttackProfile {
  /** The fresh-game Ronin attack power observed in R10 is 16. */
  power: number;
  attackElement: ElementCode;
  dexterity: number;
  /** Source `an.o`; this is zero in the R10 baseline snapshot. */
  evasionBonus: number;
  /** Source skill `k.e`, divided by five by the ordinary enemy attack path. */
  skillAdjustment: number;
  /** Source `an.e()` threshold, including the weapon subtype critical bonus. */
  criticalChance?: number;
  /** Source `k.b`, applied in tenths only when the hit is critical. */
  criticalDamageBonusTenths?: number;
}

export const STARTER_RONIN_ATTACK: BasicAttackProfile = {
  power: 16,
  attackElement: 0,
  dexterity: 3,
  evasionBonus: 0,
  skillAdjustment: 0,
  criticalChance: 16,
  criticalDamageBonusTenths: 10,
};

/**
 * Fresh-game Ronin defense fields, derived from the class-6 starter equipment
 * and `an.n()`; equipment menus and stat allocation are not modeled yet.
 */
export const STARTER_RONIN_DEFENSE: PlayerDefenseProfile = {
  dexterity: 3,
  evasionBonus: 0,
  defense: 5,
  doubleDefense: false,
};

/** Apply the level term in `an.n()` while starter gear and attributes remain fixed. */
export function starterRoninDefenseForLevel(level: number): PlayerDefenseProfile {
  return {
    ...STARTER_RONIN_DEFENSE,
    defense: STARTER_RONIN_DEFENSE.defense + Math.floor(Math.max(1, level) / 3),
  };
}

/** Source `i.f256a`: the 1-based enemy animation update that applies a strike. */
export const ENEMY_ATTACK_IMPACT_UPDATES = [
  3, 2, 6, 2, 2, 1, 3, 4, 3, 2, 3, 4, 2, 3, 2, 2, 2, 3, 3, 3, 3,
  3, 6, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
] as const;

export interface PlayerDefenseProfile {
  dexterity: number;
  evasionBonus: number;
  defense: number;
  doubleDefense: boolean;
}

export interface EnemyMeleeDefenseResult {
  evaded: boolean;
  evasionThreshold: number;
  damage: number;
}

export type BasicAttackResult =
  | { kind: 'no-target'; combatants: EnemyCombatant[] }
  | { kind: 'miss'; combatants: EnemyCombatant[]; target: EnemyCombatant; evasionThreshold: number }
  | {
    kind: 'hit';
    combatants: EnemyCombatant[];
    target: EnemyCombatant;
    damage: number;
    evasionThreshold: number;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function parseDefinition(value: unknown, index: number): EnemyDefinition {
  if (!isRecord(value) || value.index !== index || typeof value.labelToken !== 'string' ||
    !isByte(value.baseCode) ||
    !isRecord(value.packedAttributes) || !isByte(value.packedAttributes.classCode) ||
    !isByte(value.packedAttributes.shapeCode) || !isByte(value.packedAttributes.elementCode) ||
    !isByte(value.packedAttributes.variantCode) || !Array.isArray(value.behaviorCodes) ||
    value.behaviorCodes.length !== 3 || !value.behaviorCodes.every(isByte) ||
    !isRecord(value.statusFlags) || typeof value.statusFlags.bit3 !== 'boolean' ||
    !Number.isInteger(value.maxHp) || Number(value.maxHp) <= 0 ||
    !Number.isInteger(value.attack) || Number(value.attack) < 0 ||
    !Number.isInteger(value.defense) || Number(value.defense) < 0 ||
    !Number.isInteger(value.evasion) || Number(value.evasion) < 0 ||
    !Number.isInteger(value.respawnDelay) || Number(value.respawnDelay) < 0 ||
    !Array.isArray(value.dropCandidates) || !value.dropCandidates.every((candidate) =>
      Array.isArray(candidate) && candidate.length === 3 && candidate.every(isByte))) {
    throw new TypeError(`Enemy definition ${index} is invalid`);
  }
  const elementCode = Number(value.packedAttributes.elementCode);
  const classCode = Number(value.packedAttributes.classCode);
  const shapeCode = Number(value.packedAttributes.shapeCode);
  const behaviorType = Number(value.packedAttributes.variantCode);
  if (classCode > 3 || shapeCode > 3 || elementCode > 3 || behaviorType > 3) {
    throw new TypeError(`Enemy definition ${index} has an unknown packed attribute`);
  }
  return {
    index,
    labelToken: value.labelToken,
    experienceRewardCode: Number(value.baseCode),
    classCode,
    shapeCode,
    behaviorType: behaviorType as 0 | 1 | 2 | 3,
    acquisitionRange: Number(value.behaviorCodes[0]),
    behaviorTiming: [Number(value.behaviorCodes[1]), Number(value.behaviorCodes[2])],
    extendedProvokedRange: value.statusFlags.bit3,
    elementCode: elementCode as ElementCode,
    maxHp: Number(value.maxHp),
    attack: Number(value.attack),
    defense: Number(value.defense),
    evasion: Number(value.evasion),
    respawnDelay: Number(value.respawnDelay),
    dropCandidates: value.dropCandidates.map((candidate) => [...candidate] as [number, number, number]),
  };
}

/** Read only the enemy fields currently mapped from the extracted source tables. */
export function parseEnemyDataTable(value: unknown): EnemyDataTable {
  if (!isRecord(value) || value.format !== 'heroes-lore-enemy-data-v1' ||
    !Number.isInteger(value.variant) || Number(value.variant) < 0 || Number(value.variant) > 2 ||
    !Array.isArray(value.records) || value.records.length !== 43) {
    throw new TypeError('Unsupported or incomplete enemy data table');
  }
  return {
    variant: Number(value.variant),
    records: value.records.map((record, index) => parseDefinition(record, index)),
  };
}

/** Create one live HP record per static event placement. */
export function createEnemyCombatants(
  placements: readonly EventEnemyPlacement[],
  table: EnemyDataTable,
): EnemyCombatant[] {
  return placements.map((placement) => {
    const definition = table.records[placement.enemyId];
    if (definition === undefined) {
      throw new TypeError(`Map placement references missing enemy ${placement.enemyId}`);
    }
    return {
      sourceOrder: placement.sourceOrder,
      enemyId: placement.enemyId,
      tileX: placement.tileX,
      tileY: placement.tileY,
      pixelX: placement.tileX * 16,
      pixelY: placement.tileY * 16,
      provoked: false,
      definition,
      hp: definition.maxHp,
      state: 'alive',
      deathUpdatesRemaining: 0,
      respawnDelayRemaining: null,
      attackCooldownTicksRemaining: definition.behaviorTiming[1],
      actionDelayTicksRemaining: definition.behaviorTiming[0],
      pursuitRetargetProgress: 0,
      attackAnimationTicksRemaining: 0,
      attackHitResolved: false,
      animationStateIndex: 0,
      animationDirection: 2,
      animationFrameIndex: -1,
    };
  });
}

/** Advance `ak.n()` once; a death is removed by the fourth update after lethal damage. */
export function advanceEnemyDeathTick(combatants: EnemyCombatant[]): EnemyCombatant[] {
  return combatants.map((enemy) => {
    if (enemy.state !== 'death-pending') return enemy;
    if (enemy.deathUpdatesRemaining > 0) {
      return { ...enemy, deathUpdatesRemaining: enemy.deathUpdatesRemaining - 1 };
    }
    return enemy.definition.shapeCode === 2
      ? { ...enemy, state: 'removed' }
      : {
        ...enemy,
        state: 'respawn-wait',
        respawnDelayRemaining: enemy.definition.respawnDelay,
      };
  });
}

/** The source map loop reduces queued respawn delay by 16 at each cadence. */
export function advanceEnemyRespawnDelay(enemy: EnemyCombatant): EnemyCombatant {
  if (enemy.state !== 'respawn-wait' || enemy.respawnDelayRemaining === null) return enemy;
  return {
    ...enemy,
    respawnDelayRemaining: enemy.respawnDelayRemaining - ENEMY_RESPAWN_DELAY_STEP,
  };
}

/** Recreate an enemy object after its source respawn placement is accepted. */
export function respawnEnemy(
  enemy: EnemyCombatant,
  tileX: number,
  tileY: number,
): EnemyCombatant {
  if (enemy.state !== 'respawn-wait' || !Number.isInteger(tileX) || !Number.isInteger(tileY)) {
    throw new TypeError('Only a waiting enemy can be respawned at an integer map position');
  }
  return {
    ...enemy,
    tileX,
    tileY,
    pixelX: tileX * 16,
    pixelY: tileY * 16,
    hp: enemy.definition.maxHp,
    state: 'alive',
    deathUpdatesRemaining: 0,
    respawnDelayRemaining: null,
    damageReactionTicksRemaining: 0,
    damageReactionDirection: null,
    provoked: false,
    attackCooldownTicksRemaining: enemy.definition.behaviorTiming[1],
    actionDelayTicksRemaining: enemy.definition.behaviorTiming[0],
    pursuitRetargetProgress: 0,
    attackAnimationTicksRemaining: 0,
    attackHitResolved: false,
    animationStateIndex: 0,
    animationDirection: 2,
    animationFrameIndex: -1,
  };
}

/** Return the living enemy in the single cell directly ahead of the player. */
export function findFacingEnemy(
  combatants: readonly EnemyCombatant[],
  playerTileX: number,
  playerTileY: number,
  direction: Direction,
): EnemyCombatant | undefined {
  const delta: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  const targetX = playerTileX + delta[direction].x;
  const targetY = playerTileY + delta[direction].y;
  return combatants.find((enemy) => enemy.state === 'alive' && enemy.hp > 0 &&
    enemy.tileX === targetX && enemy.tileY === targetY);
}

/** Start the source directional reaction after a successful `ak.a(...)` hit. */
export function beginEnemyDamageReaction(
  enemy: EnemyCombatant,
  direction: Direction,
): EnemyCombatant {
  return {
    ...enemy,
    provoked: true,
    damageReactionTicksRemaining: ENEMY_DAMAGE_REACTION_TICKS,
    damageReactionDirection: direction,
  };
}

/** Advance `ak.d()`'s damage reaction once on a world map update. */
export function advanceEnemyDamageReaction(enemy: EnemyCombatant): EnemyCombatant {
  const remaining = enemy.damageReactionTicksRemaining ?? 0;
  if (remaining <= 0) return enemy;
  const nextRemaining = remaining - 1;
  return {
    ...enemy,
    damageReactionTicksRemaining: nextRemaining,
    damageReactionDirection: nextRemaining === 0 ? null : enemy.damageReactionDirection ?? null,
  };
}

/** `ak.a(Graphics)` offsets the source sprite 3px on reaction states 3 and 1. */
export function enemyDamageReactionOffset(
  enemy: EnemyCombatant,
): { x: number; y: number } {
  const ticks = enemy.damageReactionTicksRemaining ?? 0;
  const direction = enemy.damageReactionDirection;
  if ((ticks !== 3 && ticks !== 1) || direction === null || direction === undefined) {
    return { x: 0, y: 0 };
  }
  const delta: Record<Direction, { x: number; y: number }> = {
    1: { x: 0, y: -1 },
    2: { x: 0, y: 1 },
    3: { x: -1, y: 0 },
    4: { x: 1, y: 0 },
  };
  return { x: delta[direction].x * 3, y: delta[direction].y * 3 };
}

/** The ordinary `ak` path's evasion threshold, capped at 50. */
export function calculateEnemyEvasionThreshold(
  enemy: Pick<EnemyDefinition, 'evasion'>,
  attacker: Pick<BasicAttackProfile, 'dexterity' | 'evasionBonus' | 'skillAdjustment'>,
): number {
  const threshold = enemy.evasion - (attacker.dexterity + attacker.evasionBonus) -
    Math.trunc(attacker.skillAdjustment / 5) + 10;
  return Math.min(50, threshold);
}

/** Apply one ordinary, neutral or elemental player hit using the source ordering. */
export function resolveBasicAttack(
  combatants: EnemyCombatant[],
  targetSourceOrder: number | undefined,
  profile: BasicAttackProfile,
  roll0to99: number,
  critical = false,
): BasicAttackResult {
  if (!Number.isInteger(roll0to99) || roll0to99 < 0 || roll0to99 > 99) {
    throw new RangeError('Attack roll must be an integer from 0 through 99');
  }
  const index = targetSourceOrder === undefined
    ? -1
    : combatants.findIndex((enemy) => enemy.sourceOrder === targetSourceOrder &&
      enemy.state === 'alive' && enemy.hp > 0);
  if (index < 0) return { kind: 'no-target', combatants };

  const target = combatants[index];
  const evasionThreshold = calculateEnemyEvasionThreshold(target.definition, profile);
  if (roll0to99 < evasionThreshold) {
    return { kind: 'miss', combatants, target, evasionThreshold };
  }
  const damage = calculateEnemyDamage({
    power: profile.power,
    defense: target.definition.defense,
    attackElement: profile.attackElement,
    targetElement: target.definition.elementCode,
    applyDamageBonus: critical,
    bonusTenths: profile.criticalDamageBonusTenths,
  }).damage;
  const nextTarget: EnemyCombatant = {
    ...target,
    hp: Math.max(0, target.hp - damage),
    state: target.hp - damage <= 0 ? 'death-pending' : 'alive',
    deathUpdatesRemaining: target.hp - damage <= 0 ? 3 : 0,
    respawnDelayRemaining: target.hp - damage <= 0 ? null : target.respawnDelayRemaining,
  };
  const nextCombatants = [...combatants];
  nextCombatants[index] = nextTarget;
  return {
    kind: 'hit',
    combatants: nextCombatants,
    target: nextTarget,
    damage,
    evasionThreshold,
  };
}

/**
 * Port of the ordinary `ak` defense/damage branch: defense is
 * subtracted first, the element table is applied with integer truncation, and
 * the conditional `k.b` bonus is then added in tenths.
 */
export function calculateEnemyDamage(input: EnemyDamageInput): EnemyDamageResult {
  const afterDefense = Math.max(0, input.power - input.defense);
  const factor = ELEMENTAL_DAMAGE_TENTHS[input.attackElement][input.targetElement];
  const afterElement = Math.trunc((afterDefense * factor) / 10);
  const damage = input.applyDamageBonus
    ? afterElement + Math.trunc((afterElement * (input.bonusTenths ?? 0)) / 10)
    : afterElement;

  return { afterDefense, afterElement, damage };
}

/**
 * Port of `an.a(ak, attack, direction)` for an ordinary enemy melee hit.
 * `randomInteger` supplies the two source `g.a` rolls in order: evasion, then
 * the attack-power variance when the hit is not evaded.
 */
export function resolveEnemyMeleeDefense(
  enemy: EnemyCombatant,
  profile: PlayerDefenseProfile,
  randomInteger: (minimum: number, maximum: number) => number,
): EnemyMeleeDefenseResult {
  const evasionThreshold = Math.max(8, Math.min(
    60,
    profile.dexterity + profile.evasionBonus - enemy.definition.evasion + 10,
  ));
  if (randomInteger(0, 99) < evasionThreshold) {
    return { evaded: true, evasionThreshold, damage: 0 };
  }

  const variance = Math.floor(enemy.definition.attack / 10);
  const variation = randomInteger(variance === 0 ? 0 : -variance, variance);
  const defense = profile.doubleDefense ? profile.defense * 2 : profile.defense;
  const damage = Math.max(0, enemy.definition.attack + variation - defense);
  return { evaded: false, evasionThreshold, damage };
}

/** Source impact frame index for an enemy definition with a known sprite ID. */
export function enemyAttackImpactFrame(enemyId: number): number | undefined {
  const update = ENEMY_ATTACK_IMPACT_UPDATES[enemyId];
  return update === undefined ? undefined : update - 1;
}

/** Consume `ak.j()`'s one exact attack-frame callback for the current strike. */
export function consumeEnemyAttackImpactFrame(
  enemy: EnemyCombatant,
  impactFrame: number | undefined,
): EnemyCombatant {
  if (enemy.state !== 'alive' || enemy.animationStateIndex !== 2 ||
    enemy.attackHitResolved || impactFrame === undefined ||
    enemy.animationFrameIndex !== impactFrame) return enemy;
  return { ...enemy, attackHitResolved: true };
}
