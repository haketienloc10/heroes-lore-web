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
export type WeaponProcCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SourceEnemyStatusId = 0 | 1 | 2 | 3 | 4;
export const ENEMY_RESPAWN_DELAY_STEP = 16;

/** Source selects /enm/data{min(playthroughMode, 2)} for its saved mode byte. */
export function enemyDataVariantForPlaythroughMode(playthroughMode: number): 0 | 1 | 2 {
  if (!Number.isInteger(playthroughMode) || playthroughMode < 0 || playthroughMode > 127) {
    throw new RangeError('Playthrough mode must be a non-negative source byte');
  }
  return playthroughMode >= 2 ? 2 : playthroughMode as 0 | 1;
}

export interface SourceEnemyStatusEffect {
  id: SourceEnemyStatusId;
  /** Source `ce.b`, advanced once for each enemy update. */
  ticksElapsed: number;
}

/** Source `s.i`: weapon subtype proc chance in percent, indexed by `s.c`. */
export const WEAPON_PROC_CHANCE_PERCENT = [20, 16, 6, 13, 13, 10, 10, 10, 10] as const;

/** Source `s.h`: proc code to enemy `ce` status ID; -1 means no status. */
export const WEAPON_PROC_ENEMY_STATUS: readonly (SourceEnemyStatusId | null)[] = [
  0, 1, null, null, null, 4, 3, 2, null,
];

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
  /** Source `instanceof au`: it overrides ordinary hit response and is immune to skill-ID 3/5 level-2 sweeps. */
  sourceAu?: boolean;
  /** Source sprite-set value retained separately from its render texture key. */
  spriteId?: number;
  /** Render-only key for a boss animation set, separate from its combat sprite ID. */
  renderSpriteId?: number;
  sourceBehavior?: EventEnemyPlacement['sourceBehavior'];
  sourceRenderOffsetY?: number;
  /** Source `cj.e` footprint for special `au` subclasses. */
  sourceFootprintWidth?: 1 | 2 | 3;
  /** Shared lifecycle key for a constructed source boss group. */
  sourceGroupId?: string;
  /** Special subclass update state. Not persisted; recreated with each map. */
  sourceCbAi?: {
    state: 1 | 2 | 3 | 4;
    tick: number;
    patternIndex: number;
    attackType: 1 | 2 | 3;
    attackDuration: number;
    attackCooldown: number;
    movementCooldown: number;
    stunTicksRemaining: number;
  };
  /** Source `aq` actor state on map 13; it does not move from its spawn tile. */
  sourceAqAi?: {
    state: 1 | 2 | 3;
    tick: number;
    /** Source `ak.p`, initialized from enemy record `i.i`. */
    attackDelay: number;
    /** Source `ak.o`, initialized from enemy record `i.h`. */
    actionDelay: number;
    /** Source `ak.r`, accumulated while the actor is in state 2. */
    turnAccumulation: number;
    facing: Direction;
    idleFrameCount: number;
    walkFrameCount: number;
    attackFrameCount: number;
  };
  /** Source `af`/`bc`/`cc` update state for the linked map-13 second wave. */
  sourceMap13Ai?: {
    state: 1 | 2 | 3;
    tick: number;
    /** Source `ak.p`, decremented only while the actor is idle. */
    attackCooldown: number;
    facing: Direction;
    idleFrameCount: number;
    attackFrameCount: number;
    /** `cc.v`, the fallback heal rotation through af, bc, and cc. */
    supportCycle: 0 | 1 | 2;
    /** `bc.v/w`, the player cell sampled at attack frame 4. */
    sampledPlayerTileX: number | null;
    sampledPlayerTileY: number | null;
  };
  /** Source `az`/`aj` attacker or `cf` hazard loop on map 15. */
  sourceMap15Ai?:
    | {
      role: 'az' | 'aj';
      state: 1 | 2 | 3 | 5;
      tick: number;
      attackDelay: number;
      actionDelay: number;
      turnAccumulation: number;
      facing: Direction;
      lifetimeTicks: number;
      /** `aj.w`, which alternates the paired strikes between directions 1 and 2. */
      attackPhase: 1 | 2;
    }
    | {
      role: 'cf';
      state: 1 | 2 | 3 | 5;
      tick: number;
      attackDelay: number;
      actionDelay: number;
      facing: Direction;
      attacksSinceRest: number;
      /** Moving four-cell occupancy row in the source `f14a` grid. */
      hazardRow: number | null;
      collisionSettled: boolean;
    };
  /** Source death updates before `l()` removes the entity. */
  deathUpdatesBeforeRemoval?: number;
  /** Marker passed directly to the type-0 dispatcher when the source removes this enemy. */
  directTypeZeroMarkerOnRemoval?: number;
  tileX: number;
  tileY: number;
  /** Source entity pixel origin; movement advances this by 8 pixels per update. */
  pixelX: number;
  pixelY: number;
  /** Source `ak.d` sets this after a successful hit. */
  provoked: boolean;
  definition: EnemyDefinition;
  hp: number;
  /** Transient `ce` statuses held by the source `ak` actor; not serialized. */
  sourceStatusEffects?: SourceEnemyStatusEffect[];
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
  /** Source `ak.c`: retained reference to the player actor or active action. */
  pursuitTarget?: 'player' | 'action' | null;
  /** Source `ak.f`, set by the last paint according to the enemy's viewport bounds. */
  sourceRenderedOnScreen?: boolean;
  /** Remaining source attack-animation updates after the strike begins. */
  attackAnimationTicksRemaining?: number;
  /** The source impact frame can damage the player at most once per attack. */
  attackHitResolved?: boolean;
}

export function enemyFootprintWidth(enemy: Pick<EnemyCombatant, 'definition' | 'sourceFootprintWidth'>): number {
  return enemy.sourceFootprintWidth ?? (enemy.definition.classCode === 2 ? 2 : 1);
}

/** Apply `af.m()` when the map-13 lead boss enters its source death state. */
export function removeSourceMap13BossCompanions(
  combatants: readonly EnemyCombatant[],
  newlyDefeatedSourceOrders: ReadonlySet<number>,
): EnemyCombatant[] {
  const defeatedGroupIds = new Set(combatants
    .filter((enemy) => newlyDefeatedSourceOrders.has(enemy.sourceOrder) &&
      enemy.enemyId === 36 && enemy.sourceGroupId !== undefined)
    .map(({ sourceGroupId }) => sourceGroupId!));
  if (defeatedGroupIds.size === 0) return [...combatants];
  return combatants.map((enemy) => {
    if (enemy.enemyId === 36 || enemy.state === 'removed' || enemy.sourceGroupId === undefined ||
      !defeatedGroupIds.has(enemy.sourceGroupId)) return enemy;
    return {
      ...enemy,
      state: 'removed',
      deathUpdatesRemaining: 0,
      respawnDelayRemaining: null,
    };
  });
}

/** Apply `cf.m()` immediately when the map-15 hazard enters its source death state. */
export function removeSourceMap15HazardCompanions(
  combatants: readonly EnemyCombatant[],
  newlyDefeatedSourceOrders: ReadonlySet<number>,
): EnemyCombatant[] {
  const defeatedGroups = new Set(combatants
    .filter((enemy) => newlyDefeatedSourceOrders.has(enemy.sourceOrder) &&
      enemy.sourceBehavior === 'map15-cf' && enemy.sourceGroupId !== undefined)
    .map(({ sourceGroupId }) => sourceGroupId!));
  if (defeatedGroups.size === 0) return [...combatants];
  return combatants.map((enemy) => {
    if ((enemy.sourceBehavior !== 'map15-az' && enemy.sourceBehavior !== 'map15-aj') ||
      enemy.state === 'removed' || enemy.sourceGroupId === undefined ||
      !defeatedGroups.has(enemy.sourceGroupId)) return enemy;
    return {
      ...enemy,
      state: 'removed',
      deathUpdatesRemaining: 0,
      respawnDelayRemaining: null,
    };
  });
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

/** Fixed fresh-game Ronin baseline; live defense derives from saved stats and gear. */
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
    /** Source proc 4 drains HP by half of the calculated enemy damage. */
    playerHpCost: number;
    /** Source proc 3 drains SP by 80% of the calculated enemy damage. */
    playerSpCost: number;
    procCode: WeaponProcCode | null;
  };

export type SourceSkillDamageResult =
  | { kind: 'no-target'; combatants: EnemyCombatant[] }
  | { kind: 'hit'; combatants: EnemyCombatant[]; target: EnemyCombatant; damage: number };

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
      ...(placement.spriteId === undefined ? {} : { spriteId: placement.spriteId }),
      ...(placement.renderSpriteId === undefined ? {} : { renderSpriteId: placement.renderSpriteId }),
      ...(placement.sourceBehavior === undefined ? {} : { sourceBehavior: placement.sourceBehavior }),
      ...(placement.sourceRenderOffsetY === undefined
        ? {}
        : { sourceRenderOffsetY: placement.sourceRenderOffsetY }),
      ...(placement.sourceBehavior === undefined ? {} : { sourceAu: true }),
      ...(placement.sourceFootprintWidth === undefined
        ? {}
        : { sourceFootprintWidth: placement.sourceFootprintWidth }),
      ...(placement.sourceGroupId === undefined
        ? {}
        : { sourceGroupId: placement.sourceGroupId }),
      ...(placement.sourceBehavior !== 'map11-cb' ? {} : {
        sourceCbAi: {
          state: 1 as const,
          tick: -1,
          patternIndex: 0,
          attackType: 1 as const,
          // `/boss/spr/1_32` source state 3 has 15 frames (pattern 1).
          attackDuration: 15,
          attackCooldown: definition.behaviorTiming[1],
          movementCooldown: definition.behaviorTiming[0],
          stunTicksRemaining: 0,
        },
      }),
      ...(placement.sourceBehavior !== 'map13-aq' ? {} : {
        sourceAqAi: {
          state: 1 as const,
          tick: -1,
          attackDelay: definition.behaviorTiming[1],
          actionDelay: definition.behaviorTiming[0],
          turnAccumulation: 0,
          facing: 2 as const,
          // Tracks in /boss/spr/2_35 resolve the `i.j/k/l` animation bounds.
          idleFrameCount: 6,
          walkFrameCount: 4,
          attackFrameCount: 5,
        },
      }),
      ...(!['map13-af', 'map13-bc', 'map13-cc'].includes(placement.sourceBehavior ?? '') ? {} : {
        sourceMap13Ai: {
          state: 1 as const,
          tick: -1,
          attackCooldown: definition.behaviorTiming[1],
          facing: 2 as const,
          idleFrameCount: placement.sourceBehavior === 'map13-af' ? 6 : 4,
          attackFrameCount: placement.sourceBehavior === 'map13-af'
            ? 5
            : placement.sourceBehavior === 'map13-bc' ? 14 : 8,
          supportCycle: 0 as const,
          sampledPlayerTileX: null,
          sampledPlayerTileY: null,
        },
        animationStateIndex: 0 as const,
        animationDirection: 2 as const,
      }),
      ...(placement.sourceBehavior !== 'map15-az' && placement.sourceBehavior !== 'map15-aj'
        ? {}
        : {
          sourceMap15Ai: {
            role: placement.sourceBehavior === 'map15-az' ? 'az' as const : 'aj' as const,
            state: 1 as const,
            tick: -1,
            attackDelay: definition.behaviorTiming[1],
            actionDelay: definition.behaviorTiming[0],
            turnAccumulation: 0,
            facing: 1 as const,
            lifetimeTicks: 0,
            attackPhase: 2 as const,
          },
        }),
      ...(placement.sourceBehavior !== 'map15-cf' ? {} : {
        sourceMap15Ai: {
          role: 'cf' as const,
          state: 2 as const,
          tick: -1,
          attackDelay: definition.behaviorTiming[1],
          actionDelay: definition.behaviorTiming[0],
          facing: 1 as const,
          attacksSinceRest: 0,
          hazardRow: null,
          collisionSettled: false,
        },
      }),
      ...(placement.deathUpdatesBeforeRemoval === undefined
        ? {}
        : { deathUpdatesBeforeRemoval: placement.deathUpdatesBeforeRemoval }),
      ...(placement.directTypeZeroMarkerOnRemoval === undefined
        ? {}
        : { directTypeZeroMarkerOnRemoval: placement.directTypeZeroMarkerOnRemoval }),
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
      // `ak` starts visible until its first paint updates the source `f` flag.
      sourceRenderedOnScreen: true,
      animationStateIndex: placement.sourceBehavior === 'map15-cf' ? 1 : 0,
      animationDirection: placement.sourceBehavior?.startsWith('map15-') ? 1 : 2,
      animationFrameIndex: -1,
    };
  });
}

/** Advance `ak.n()` once; a death is removed by the fourth update after lethal damage. */
export function advanceEnemyDeathTick(combatants: EnemyCombatant[]): EnemyCombatant[] {
  return combatants.map((enemy) => {
    if (enemy.state !== 'death-pending') return enemy;
    // `cf.l()` writes the hazard collision and intentionally never calls `au.l()`.
    if (enemy.sourceBehavior === 'map15-cf') return enemy;
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
    sourceStatusEffects: [],
    state: 'alive',
    deathUpdatesRemaining: 0,
    respawnDelayRemaining: null,
    damageReactionTicksRemaining: 0,
    damageReactionDirection: null,
    provoked: false,
    attackCooldownTicksRemaining: enemy.definition.behaviorTiming[1],
    actionDelayTicksRemaining: enemy.definition.behaviorTiming[0],
    pursuitRetargetProgress: 0,
    pursuitTarget: null,
    attackAnimationTicksRemaining: 0,
    attackHitResolved: false,
    // Respawn creates a fresh `ak` instance, whose source `f` starts true.
    sourceRenderedOnScreen: true,
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

/** Start the ordinary `ak` hit response; `au` overrides the source damage handler. */
export function beginEnemyDamageReaction(
  enemy: EnemyCombatant,
  direction: Direction,
): EnemyCombatant {
  if (enemy.sourceAu === true) return enemy;
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

/** The special `au` incoming-hit path doubles the evasion threshold without a cap. */
function calculateSourceAuEvasionThreshold(
  enemy: Pick<EnemyDefinition, 'evasion'>,
  attacker: Pick<BasicAttackProfile, 'dexterity' | 'evasionBonus' | 'skillAdjustment'>,
): number {
  const threshold = enemy.evasion - (attacker.dexterity + attacker.evasionBonus) -
    Math.trunc(attacker.skillAdjustment / 5) + 10;
  return threshold * 2;
}

/** Apply one ordinary, neutral or elemental player hit using the source ordering. */
export function resolveBasicAttack(
  combatants: EnemyCombatant[],
  targetSourceOrder: number | undefined,
  profile: BasicAttackProfile,
  roll0to99: number,
  critical = false,
  procCode: WeaponProcCode | null = null,
): BasicAttackResult {
  if (!Number.isInteger(roll0to99) || roll0to99 < 0 || roll0to99 > 99) {
    throw new RangeError('Attack roll must be an integer from 0 through 99');
  }
  const index = targetSourceOrder === undefined
    ? -1
    : combatants.findIndex((enemy) => enemy.sourceOrder === targetSourceOrder &&
      enemy.state === 'alive' && enemy.hp > 0);
  if (index < 0) return { kind: 'no-target', combatants };

  const originalTarget = combatants[index];
  // Ordinary `ak` targets call `t()` before resolving damage. Special `au`
  // targets override that hit path and retain sleep status.
  const target = originalTarget.sourceAu === true
    ? originalTarget
    : clearSourceEnemySleepOnHit(originalTarget);
  const evasionThreshold = target.sourceAu === true
    ? calculateSourceAuEvasionThreshold(target.definition, profile)
    : calculateEnemyEvasionThreshold(target.definition, profile);
  if (roll0to99 < evasionThreshold) {
    if (target !== originalTarget) {
      const awakenedCombatants = [...combatants];
      awakenedCombatants[index] = target;
      return { kind: 'miss', combatants: awakenedCombatants, target, evasionThreshold };
    }
    return { kind: 'miss', combatants, target, evasionThreshold };
  }
  const defense = target.sourceAu !== true &&
    target.sourceStatusEffects?.some(({ id }) => id === 4)
    ? Math.trunc(target.definition.defense / 2)
    : target.definition.defense;
  const calculatedDamage = calculateEnemyDamage({
    power: profile.power,
    defense,
    attackElement: profile.attackElement,
    targetElement: target.definition.elementCode,
    applyDamageBonus: critical,
    bonusTenths: profile.criticalDamageBonusTenths,
  }).damage;
  let damage = calculatedDamage;
  let playerHpCost = 0;
  let playerSpCost = 0;
  switch (procCode) {
    case 2:
      if (target.sourceAu !== true) damage = target.definition.attack;
      break;
    case 3:
      playerSpCost = Math.trunc((calculatedDamage * (target.sourceAu === true ? 30 : 80)) / 100);
      break;
    case 4:
      playerHpCost = Math.trunc(calculatedDamage / 2);
      break;
    case 8:
      damage *= 2;
      break;
  }
  const procStatusId = target.sourceAu === true || procCode === null
    ? null
    : WEAPON_PROC_ENEMY_STATUS[procCode];
  let sourceStatusEffects = target.sourceStatusEffects;
  if (procStatusId !== null) {
    const previous = sourceStatusEffects ?? [];
    const existingIndex = previous.findIndex(({ id }) => id === procStatusId);
    if (existingIndex >= 0) {
      sourceStatusEffects = previous.map((effect, effectIndex) => effectIndex === existingIndex
        ? { ...effect, ticksElapsed: 0 }
        : effect);
    } else {
      sourceStatusEffects = [...previous, { id: procStatusId, ticksElapsed: 0 }];
    }
  }
  const nextTarget: EnemyCombatant = {
    ...target,
    ...(sourceStatusEffects === undefined ? {} : { sourceStatusEffects }),
    hp: Math.max(0, target.hp - damage),
    state: target.hp - damage <= 0 ? 'death-pending' : 'alive',
    deathUpdatesRemaining: target.hp - damage <= 0
      ? target.deathUpdatesBeforeRemoval ?? 3
      : 0,
    respawnDelayRemaining: target.hp - damage <= 0 ? null : target.respawnDelayRemaining,
    // Source `ak.a(...)` resets `n.k` when it enters state 5. The browser's
    // -1 cursor selects source frame 0 when the idle death track next advances.
    animationFrameIndex: target.hp - damage <= 0 ? -1 : target.animationFrameIndex,
  };
  const nextCombatants = [...combatants];
  nextCombatants[index] = nextTarget;
  return {
    kind: 'hit',
    combatants: nextCombatants,
    target: nextTarget,
    damage,
    evasionThreshold,
    playerHpCost,
    playerSpCost,
    procCode,
  };
}

/** Select the source weapon proc, then offhand proc, with source short-circuit rolls. */
export function selectWeaponProcCode(
  weaponCode: number | undefined | null,
  offhandCode: number | undefined | null,
  roll0to99: () => number,
): WeaponProcCode | null {
  const isProcCode = (value: number | undefined | null): value is WeaponProcCode =>
    Number.isInteger(value) && value !== null && value !== undefined && value >= 0 && value <= 8;
  const rollFor = (code: WeaponProcCode): boolean => {
    const roll = roll0to99();
    if (!Number.isInteger(roll) || roll < 0 || roll > 99) {
      throw new RangeError('Weapon proc roll must be an integer from 0 through 99');
    }
    return roll < WEAPON_PROC_CHANCE_PERCENT[code];
  };
  if (isProcCode(weaponCode) && rollFor(weaponCode)) return weaponCode;
  if (isProcCode(offhandCode) && rollFor(offhandCode)) return offhandCode;
  return null;
}

/**
 * Apply the direct `ak.a(int, byte)` damage path used by player skills.
 * Unlike ordinary player attacks this path has no evasion or defense roll;
 * only the source elemental multiplier is applied.
 */
export function applySourceSkillDamage(
  combatants: EnemyCombatant[],
  targetSourceOrder: number | undefined,
  power: number,
  attackElement: ElementCode,
): SourceSkillDamageResult {
  const index = targetSourceOrder === undefined
    ? -1
    : combatants.findIndex((enemy) => enemy.sourceOrder === targetSourceOrder &&
      enemy.state === 'alive' && enemy.hp > 0);
  if (index < 0) return { kind: 'no-target', combatants };

  // Ordinary `ak.a(int, byte)` clears status 0. Special `au` subclasses
  // override that method and take direct skill damage without waking.
  const target = combatants[index].sourceAu === true
    ? combatants[index]
    : clearSourceEnemySleepOnHit(combatants[index]);
  const damage = calculateEnemyDamage({
    power: Math.max(0, power),
    defense: 0,
    attackElement,
    targetElement: target.definition.elementCode,
  }).damage;
  const hp = Math.max(0, target.hp - damage);
  const nextTarget: EnemyCombatant = {
    ...target,
    hp,
    state: hp === 0 ? 'death-pending' : 'alive',
    deathUpdatesRemaining: hp === 0 ? target.deathUpdatesBeforeRemoval ?? 3 : 0,
    respawnDelayRemaining: hp === 0 ? null : target.respawnDelayRemaining,
    // The direct `ak.a(int, byte)` path sets source `k` to 0 on death. The
    // ordinary `ak.b(int)` combat path instead uses the -1 first-frame cursor.
    animationFrameIndex: hp === 0 ? 0 : target.animationFrameIndex,
  };
  const nextCombatants = [...combatants];
  nextCombatants[index] = nextTarget;
  return { kind: 'hit', combatants: nextCombatants, target: nextTarget, damage };
}

function clearSourceEnemySleepOnHit(target: EnemyCombatant): EnemyCombatant {
  const statuses = target.sourceStatusEffects;
  if (statuses === undefined || !statuses.some(({ id }) => id === 0)) return target;
  return {
    ...target,
    sourceStatusEffects: statuses.filter(({ id }) => id !== 0),
  };
}

/**
 * Apply `ak.b(int)`'s flat counterattack damage from skill ID 0 level 2.
 * The source subtracts this amount directly, without defense or element rolls.
 */
export function applySourceCounterDamage(
  combatants: EnemyCombatant[],
  targetSourceOrder: number | undefined,
  power: number,
): SourceSkillDamageResult {
  const index = targetSourceOrder === undefined
    ? -1
    : combatants.findIndex((enemy) => enemy.sourceOrder === targetSourceOrder &&
      enemy.state === 'alive' && enemy.hp > 0);
  if (index < 0) return { kind: 'no-target', combatants };

  const target = combatants[index];
  const damage = Math.max(0, Math.trunc(power));
  const hp = Math.max(0, target.hp - damage);
  const nextTarget: EnemyCombatant = {
    ...target,
    hp,
    state: hp === 0 ? 'death-pending' : 'alive',
    deathUpdatesRemaining: hp === 0 ? target.deathUpdatesBeforeRemoval ?? 3 : 0,
    respawnDelayRemaining: hp === 0 ? null : target.respawnDelayRemaining,
    animationFrameIndex: hp === 0 ? -1 : target.animationFrameIndex,
  };
  const nextCombatants = [...combatants];
  nextCombatants[index] = nextTarget;
  return { kind: 'hit', combatants: nextCombatants, target: nextTarget, damage };
}

/**
 * Apply `ak.c(byte)` from skill IDs 3/5 level 2. The call subtracts the
 * target's maximum HP directly, and the source helper excludes `au` bosses.
 */
export function applySourceInstantKillDamage(
  combatants: EnemyCombatant[],
  targetSourceOrder: number | undefined,
  matchingElement: 1 | 3,
): SourceSkillDamageResult {
  const index = targetSourceOrder === undefined
    ? -1
    : combatants.findIndex((enemy) => enemy.sourceOrder === targetSourceOrder &&
      enemy.state === 'alive' && enemy.hp > 0 && enemy.sourceAu !== true &&
      enemy.definition.elementCode === matchingElement);
  if (index < 0) return { kind: 'no-target', combatants };

  const target = combatants[index];
  const damage = target.definition.maxHp;
  const hp = Math.max(0, target.hp - damage);
  const nextTarget: EnemyCombatant = {
    ...target,
    hp,
    state: hp === 0 ? 'death-pending' : 'alive',
    deathUpdatesRemaining: hp === 0 ? target.deathUpdatesBeforeRemoval ?? 3 : 0,
    respawnDelayRemaining: hp === 0 ? null : target.respawnDelayRemaining,
    animationFrameIndex: hp === 0 ? -1 : target.animationFrameIndex,
  };
  const nextCombatants = [...combatants];
  nextCombatants[index] = nextTarget;
  return { kind: 'hit', combatants: nextCombatants, target: nextTarget, damage };
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
