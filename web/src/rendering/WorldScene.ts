import Phaser from 'phaser';
import {
  actorOccupiedCellIndices,
  advanceActor,
  createPlayerActor,
  displaceActorFromSourceHit,
  didReachMapEventBoundary,
  requestActorDirection,
  releaseActorDirectionAndCheckBoundary,
  WORLD_UPDATE_PERIOD_MS,
  type Direction,
  type PlayerActor,
} from '../world/actor';
import {
  advanceSourceCameraScroll,
  sourceEventCameraFocusAction,
  sourceCameraFollowAxes,
  sourceCameraScrollTarget,
  sourceFixedMapCameraScrollTarget,
} from '../world/source-camera';
import {
  findSpriteRecord,
  parseCharacterSpriteLayout,
  type CharacterSpriteLayout,
  type CharacterSpritePart,
} from '../world/character-sprites';
import {
  heroArmorAtlas,
  heroEffectAtlasFolder,
  heroHeadAtlas,
  heroHeadLayout,
  heroShieldAtlas,
  hasHeroShieldSpriteResources,
  heroSpriteAtlasAssetBase,
  heroSpriteLayoutAssetPath,
  resolveHeroSpriteResourceClass,
  heroWeaponAtlas,
  heroWeaponAtlasFolder,
  type HeroSpriteResourceClass,
} from '../world/hero-sprite-appearance';
import {
  applyDynamicCollisionChanges,
  applyDynamicMapTileChanges,
  createWorldGrid,
  parseBaseMapData,
  parseBaseCollisionData,
  parseMapDecorationData,
  type BaseMapData,
  type BaseCollisionData,
  type MapDecorationData,
  type WorldGrid,
} from '../world/map-data';
import {
  parseGeneratedAssetPaths,
  resolveMapAssetPaths,
  type MapAssetPaths,
} from '../world/map-assets';
import {
  applyEventFlagChanges,
  applyInitialMapEventState,
  createEntityOccupancy,
  parseEventOperationData,
  prepareMapTransition,
  resolveEventScriptEffects,
  resolveInteractionScript,
  resolveMapTransition,
  sourceMapTransitionDirection,
  resolveTriggerScript,
  type DynamicEnemyPlacement,
  type DynamicNpcPlacement,
  type EventOperationData,
  type EventFlagChange,
  type EventScriptSelection,
  type MapTransition,
  type PreparedMapTransition,
} from '../world/event-data';
import {
  addSourceConstructedMapEnemies,
  addSourceMap13SecondWaveEnemies,
} from '../world/source-map-entities';
import {
  advanceMap11CbAiTick,
  advanceMap13AqAiTick,
  advanceMap13GroupAiTick,
  advanceMap15AttackerAiTick,
  advanceMap15HazardAiTick,
  advanceMap15HazardDeathTick,
  enterMap15SourceDeathState,
  resetMap13AqActionWhileBlocked,
  resetMap13GroupActionWhileBlocked,
  resetMap15ActionWhileBlocked,
  sourceCustomEnemyActionContinuesWhileBlocked,
  sourceMap15HazardCollisionWrites,
  sourceMap13AfDeathEffectSpawns,
} from '../world/source-enemy-ai';
import { bitmapTextWidth, drawBitmapText, type BitmapFontData } from '../ui/bitmap-font';
import {
  drawGameplayHud,
  NEW_GAME_RONIN_HUD,
  type GameplayHudAssets,
} from '../ui/game-hud';
import {
  advanceSourceInventorySlotSnapshot,
  parseGameSave,
  preservedSourceInventorySlotIndices,
  prepareNextSourceCycle,
  snapshotSourceInventorySlots,
  writeGameSave,
  type GameSaveState,
  type SourceInventorySlotSnapshot,
} from '../world/save-data';
import {
  DEFAULT_GAME_OPTIONS,
  gameSpeedScale,
  readGameOptions,
  type GameOptions,
} from '../world/game-options';
import { addSourcePlayTimeSeconds } from '../world/play-time';
import {
  advanceSourcePaintClock,
  sourceActorSimulationDelta,
  sourceGameplaySimulationDelta,
  shouldResumeSourceEventBeforeWorldUpdate,
  sourceWorldUpdateScope,
} from '../world/source-world-update';
import {
  formatSourceDialogue,
  formatRoninDialogue,
  paginateBitmapDialogue,
  resolveLanguageString,
  resolveScriptDialogue,
  resolveScriptDialogueString,
} from '../world/dialogue';
import {
  advanceEventCutscene,
  advanceEventCutsceneDialogue,
  canRunEventCutscene,
  createEventCutscene,
  selectEventCutsceneChoice,
  type EventCutsceneState,
} from '../world/event-cutscene';
import { isEndingHeroClassId, type EndingHeroClassId } from '../world/ending';
import {
  adjustAttributeDraft,
  applyAttributeDraft,
  createAttributeDraft,
  createBasePlayerAttributes,
  hasAttributeDraftChanges,
  PLAYER_ATTRIBUTE_KEYS,
  type AttributeDraft,
  type PlayerAttributeKey,
  type PlayerAttributes,
} from '../world/attributes';
import {
  advanceEnemyDamageReaction,
  advanceEnemyRespawnDelay,
  advanceEnemyDeathTick,
  beginEnemyDamageReaction,
  consumeEnemyAttackImpactFrame,
  createEnemyCombatants,
  enemyAttackImpactFrame,
  enemyDataVariantForPlaythroughMode,
  enemyDamageReactionOffset,
  parseEnemyDataTable,
  respawnEnemy,
  applySourceCounterDamage,
  applySourceInstantKillDamage,
  applySourceSkillDamage,
  resolveEnemyMeleeDefense,
  enemyFootprintWidth,
  removeSourceMap13BossCompanions,
  removeSourceMap15HazardCompanions,
  resolveBasicAttack,
  selectWeaponProcCode,
  starterRoninDefenseForLevel,
  STARTER_RONIN_ATTACK,
  type EnemyCombatant,
  type EnemyDataTable,
} from '../world/combat';
import {
  advanceSourceEnemyStatuses,
  resetSourceEnemyActionWhileBlocked,
  sourceEnemyActionIsBlocked,
} from '../world/enemy-status';
import {
  advanceSourceClassEightProjectileTick,
  beginSourceClassEightProjectile,
  type SourceClassEightProjectile,
} from '../world/player-projectiles';
import {
  advancePlayerCombo,
  cancelPlayerComboFollowUp,
  EMPTY_PLAYER_COMBO,
  playerAttackPower,
  playerAttackSpCost,
  playerSpritePose,
  queuePlayerAttack,
  type PlayerAttackStyle,
  type PlayerComboImpact,
  type PlayerComboState,
} from '../world/player-combo';
import {
  assignPlayerSkillLevelSlot,
  advancePlayerSkillAction,
  awardPlayerSkillExperience,
  createPlayerSkillActionState,
  PLAYER_SKILL_LEVEL_UNLOCK_RANKS,
  playerSkillLevelForActionButton,
  restoreSkillResource,
  sourceActionNeedsActorTargetReselection,
  startPlayerSkillAction,
  type PlayerSkillActionState,
  type PlayerSkillActionButton,
  type PlayerSkillLevelSlot,
  type PlayerSkillVisualSpawn,
} from '../world/player-skill-action';
import {
  advancePlayerSkillAttachedVisuals,
  createPlayerSkillAttachedVisual,
  playerSkillAuraLayers,
  sourceInstantKillAttachedVisualSpawn,
  type ActivePlayerSkillAttachedVisual,
  type PlayerSkillAttachedVisualTarget,
} from '../world/player-skill-attached-visuals';
import { advanceSourceEmotionFrame } from '../world/source-emotion';
import {
  findPlayerSkillEffect,
  parsePlayerSkillEffectCatalog,
  playerSkillEffectFrameComponents,
  playerSkillEffectFrameCount,
  type PlayerSkillEffectCatalog,
  type PlayerSkillEffectType,
} from '../world/player-skill-effects';
import {
  getPlayerSkillActionState,
  playerSkillDescriptionStringId,
  playerSkillNameStringId,
  selectActivePlayerSkill,
  sourcePlayerSkillElement,
} from '../world/player-skills';
import {
  selectPlayerAttackTargets,
  resolveSourceClassSixLungeImpact,
  findEnemyOccupyingSourceCell,
} from '../world/player-attack-targeting';
import {
  advanceEnemySpriteFrame,
  enemySpriteFrameAt,
  findEnemySpriteAnimation,
  findEnemySpriteTrack,
  parseEnemySpriteAnimationCatalog,
  sourceEnemySpriteStateForRender,
  type EnemySpriteAnimation,
} from '../world/enemy-sprites';
import {
  advanceBossSpriteFrame,
  bossSpriteFrameAt,
  findBossSpriteTrack,
  MAP13_AF_RENDER_SPRITE_ID,
  MAP11_CB_RENDER_SPRITE_ID,
  MAP13_AQ_RENDER_SPRITE_ID,
  MAP13_BC_RENDER_SPRITE_ID,
  MAP13_CC_RENDER_SPRITE_ID,
  MAP15_AJ_RENDER_SPRITE_ID,
  MAP15_AZ_RENDER_SPRITE_ID,
  MAP15_CF_RENDER_SPRITE_ID,
  parseBossSpriteAnimationCatalog,
  parseBossAttackEffectCatalog,
  sourceBossDeathSpriteState,
  type BossAttackEffect,
  type BossSpriteAnimation,
  type BossSpriteState,
} from '../world/boss-sprites';
import {
  advanceNpcSpriteFrames,
  adaptEnemyAnimationForNpc,
  findNpcSpriteAnimation,
  findNpcSpriteTrack,
  isNpcWithinSourceViewport,
  npcSpriteFrameAt,
  parseNpcSpriteAnimationCatalog,
  resolveNpcSpriteRenderPlacements,
  sourceEnemySpriteIdForNpc,
  sourceNpcTextureSource,
  type NpcSpriteAnimation,
  type NpcSpriteState,
} from '../world/npc-sprites';
import { advanceNpcMotion, resolveNpcCutsceneVisualStates } from '../world/npc-motion';
import {
  advanceEnemyAttackEffect,
  advanceEnemyProjectileTick,
  beginEnemyProjectile,
  beginEnemyProjectileAtCell,
  parseEnemyAttackEffectCatalog,
  type EnemyAttackEffect,
  type EnemyAttackEffectAnimation,
  type EnemyProjectile,
} from '../world/enemy-attacks';
import { awardSourceExperience, enemyExperienceSourceAmount } from '../world/progression';
import {
  SOURCE_PLAYER_LEVEL_UP_ATLAS_FRAME_COUNT,
  advanceSourcePlayerLevelUpAtlasAnimation,
  advanceSourcePlayerLevelUpFlash,
  createSourcePlayerLevelUpAtlasAnimation,
  createSourcePlayerLevelUpFlash,
  parsePlayerLevelUpEffectCatalog,
  sourcePlayerLevelUpFlashIsVisible,
  type PlayerLevelUpEffect,
  type SourcePlayerLevelUpAtlasAnimation,
  type SourcePlayerLevelUpFlash,
} from '../world/player-level-up-effects';
import { createRuntimeSourceRandomStreams } from '../world/source-random';
import {
  createSourceEquipmentInventoryState,
  findEquipmentItem,
  parseEquipmentDataTable,
  type EquipmentDataTable,
} from '../world/equipment-data';
import {
  calculateEquipmentStats,
  cloneEquipmentLoadout,
  createStartingEquipment,
  EQUIPMENT_SLOT_LABELS,
  equipmentInventoryIndicesForSlot,
  equipmentSlotForCategory,
  equipInventoryItem,
  normalizeEquipmentInventory,
  type EquipmentLoadout,
  type EquipmentStats,
} from '../world/equipment';
import {
  applyCommerceOrbAttribute,
  findCommerceItem,
  identifyCommerceEquipment,
  isCommerceStackable,
  mixCommerceItems,
  parseCommerceCatalog,
  purchaseCommerceItem,
  sellCommerceItem,
  upgradeCommerceEquipment,
  type CommerceCatalog,
  type CommerceItemReference,
  type EquipmentTarget,
} from '../world/commerce';
import {
  advanceEnemyBehaviorTick,
  enemyFacesPlayer,
  enemyHasPlayerWithinFacingRange,
  shouldPauseSourceEnemyBrainOffscreen,
  updateEnemySourceViewportOnPaint,
  usesOrdinarySourceEnemyUpdate,
} from '../world/enemy-ai';
import {
  advanceGroundDropTicks,
  CONSUMABLE_CATEGORIES,
  GROUND_DROP_LIFETIME_TICKS,
  isGroundDropVisible,
  NEW_GAME_WALLET,
  nextConsumableCategory,
  pickupGroundDrop,
  rollEnemyDrops,
  selectedConsumableCount,
  useConsumableAtIndex,
  useSelectedConsumable,
  type GroundDrop,
  type InventoryStack,
} from '../world/loot';
import {
  advanceEnemyRespawnCadence,
  ENEMY_RESPAWN_CADENCE_TICKS,
  findEnemyRespawnPlacement,
} from '../world/enemy-lifecycle';
import {
  advancePlayerStatusTick,
  applyPlayerPoison,
  createPlayerStatusState,
  enemyHitAppliesPoison,
  retainPlayerStatusEffects,
  sourcePlayerStatusMarkerBlinkOffset,
  sourcePlayerStatusMarkerHorizontalOffset,
  type PlayerStatusState,
} from '../world/player-status';
import {
  advancePlayerRecoveryTick,
  createPlayerRecoveryState,
  type PlayerRecoveryActivity,
  type PlayerRecoveryState,
} from '../world/player-recovery';
import {
  consumePlayerHitRenderOffset,
  EMPTY_PLAYER_HIT_FEEDBACK,
  recordPlayerHitFeedback,
  type PlayerHitFeedbackState,
} from '../world/player-hit-feedback';
import {
  advanceDamageNumberAnimation,
  INITIAL_DAMAGE_NUMBER_ANIMATION,
  sourceDamageNumberHasVisibleGlyphs,
  type DamageNumberAnimation,
} from '../world/combat-feedback';
import {
  advanceSourceWeaponProcFeedback as advanceWeaponProcFeedbackAnimation,
  createSourceWeaponProcFeedbackAnimation,
  sourceWeaponProcEmotionImageIndex,
  type SourceWeaponProcFeedbackAnimation,
} from '../world/weapon-proc-feedback';
import {
  advanceGameOverSequence,
  beginGameOverSequence,
  type GameOverSequence,
} from '../world/game-over';

const MAP_IDS = [64, 0, 27] as const;
const HERO_SOURCE_ANIMATION_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const HERO_LAYOUT_PARTS = ['a', 'b', 'e', 'hA', 'hB', 'w'] as const;
// Fresh-game setup clears the bitfield and sets flag 0 before loading map 00.
const OBSERVED_NEW_GAME_FLAGS = new Set([0]);
const NEW_GAME_START = { mapId: 0, tileX: 22, tileY: 4 };
const OPENING_SCRIPT_TRIGGER = 10;
const OPENING_SCRIPT_TRIGGER_TYPE = 0;
const OPENING_SCRIPT_INDEX = 9;
const ENEMY_ANIMATION_CATALOG = '/assets/generated/enemy-animations/catalog.json';
const BOSS_ANIMATION_CATALOG = '/assets/generated/boss-animations/catalog.json';
const BOSS_ATTACK_EFFECT_CATALOG = '/assets/generated/boss-attack-effects/catalog.json';
const ENEMY_ATTACK_EFFECT_CATALOG = '/assets/generated/enemy-attack-effects/catalog.json';
const PLAYER_SKILL_EFFECT_CATALOG = '/assets/generated/player-skill-effects/catalog.json';
const NPC_ANIMATION_CATALOG = '/assets/generated/npc-animations/catalog.json';
const PLAYER_SKILL_ATLAS_IMAGE_COUNTS = { fi: 13, wa: 15, gr: 15 } as const;
type EnemyTextureSet = Map<number, string>;
type EnemyTextureSets = Map<number, EnemyTextureSet>;

function enemyRenderAnimationState(
  enemy: EnemyCombatant,
  bossAnimation?: BossSpriteAnimation,
): number {
  if (enemy.sourceAu === true && enemy.state === 'death-pending') {
    return bossAnimation === undefined
      ? 0
      : sourceBossDeathSpriteState(bossAnimation, enemy.animationDirection ?? 2);
  }
  if (usesOrdinarySourceEnemyUpdate(enemy)) {
    return sourceEnemySpriteStateForRender(
      enemy.state,
      enemy.animationStateIndex ?? 0,
      true,
    ) ?? 0;
  }
  const map15State = enemy.sourceMap15Ai;
  if (map15State !== undefined) {
    if (enemy.state === 'death-pending' || map15State.state === 5) {
      return map15State.role === 'cf' ? 2 : 0;
    }
    if (map15State.state === 3) return 3;
    if (map15State.state === 2) return map15State.role === 'cf' ? 1 : 0;
    return 0;
  }
  const aqState = enemy.sourceAqAi?.state;
  if (aqState !== undefined) return aqState === 2 ? 1 : aqState === 3 ? 3 : 0;
  const sourceState = enemy.sourceCbAi?.state;
  if (sourceState === undefined) {
    if (enemy.sourceBehavior?.startsWith('map13-')) {
      return enemy.animationStateIndex === 2 ? 3 : enemy.animationStateIndex ?? 0;
    }
    return enemy.animationStateIndex ?? 0;
  }
  if (sourceState === 2) return 1;
  if (sourceState === 3) return enemy.sourceCbAi!.attackType + 2;
  return 0;
}

function sourceMapSpawnRenderSpriteIds(mapId: number): number[] {
  if (mapId === 13) {
    return [MAP13_AF_RENDER_SPRITE_ID, MAP13_BC_RENDER_SPRITE_ID, MAP13_CC_RENDER_SPRITE_ID];
  }
  if (mapId === 15) {
    return [MAP15_CF_RENDER_SPRITE_ID, MAP15_AZ_RENDER_SPRITE_ID, MAP15_AJ_RENDER_SPRITE_ID];
  }
  return [];
}

type NpcTextureKeys = Map<string, string>;
type RenderedMapObject = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

function getEventTileIds(events: EventOperationData): number[] {
  const tileIds = new Set<number>();
  for (const script of events.scripts) {
    for (let index = 0; index + 1 < script.length; index += 1) {
      if (script[index][0] === 42 && script[index + 1][0] === 43) {
        // Tile 128 is the source event's empty-tile sentinel, not an atlas image.
        if (script[index + 1][2] !== 128) tileIds.add(script[index + 1][2]);
        index += 1;
      }
    }
  }
  return [...tileIds];
}

function resolveTextTableStrings(tableValue: unknown, localeValue: unknown): string[] {
  if (typeof tableValue !== 'object' || tableValue === null ||
    !('format' in tableValue) || tableValue.format !== 'heroes-lore-text-table-v1' ||
    !('stringIds' in tableValue) || !Array.isArray(tableValue.stringIds)) return [];
  const resolved: string[] = [];
  for (const id of tableValue.stringIds) {
    if (!Number.isInteger(id)) return [];
    const text = resolveLanguageString(localeValue, Number(id));
    if (text === undefined) return [];
    resolved.push(text);
  }
  return resolved;
}

interface NpcActorSprite {
  sourceOrder: number;
  npcId: number;
  staticImage: Phaser.GameObjects.Image | null;
  direction: Direction;
  stateIndex: NpcSpriteState;
  frameIndex: number;
  container: Phaser.GameObjects.Container;
  emotionImage: Phaser.GameObjects.Image;
  componentSprites: Phaser.GameObjects.Image[];
  textureKeys: NpcTextureKeys;
}

interface RenderedWorld {
  world: WorldGrid;
  tilesetId: number;
  /** Initial player emotion selected by the map's source action block, if any. */
  startupHeroEmotion: number | null | undefined;
  events: EventOperationData;
  tileKeys: Map<number, string>;
  objectTextureKeys: Map<number, string>;
  decorationObjectCount: number;
  decorationSprites: Map<number, Phaser.GameObjects.Image>;
  enemies: EnemyCombatant[];
  enemySprites: Map<number, Phaser.GameObjects.Container>;
  enemyStatusDisplays: Map<number, EnemyStatusSpriteDisplay>;
  npcSprites: Map<number, NpcActorSprite>;
  enemyTextureKeys: EnemyTextureSets;
  enemyProjectiles: EnemyProjectile[];
  enemyProjectileSprites: Map<number, Phaser.GameObjects.Container>;
  playerProjectiles: SourceClassEightProjectile[];
  nextPlayerProjectileId: number;
  enemyAttackAnimations: EnemyAttackEffectAnimation[];
  enemyAttackSprites: Map<number, Phaser.GameObjects.Container>;
  nextEnemyAttackVisualId: number;
  playerSkillVisuals: ActivePlayerSkillVisual[];
  playerSkillVisualSprites: Map<number, Phaser.GameObjects.Container>;
  nextPlayerSkillVisualId: number;
  enemyAttachedSkillVisuals: ActivePlayerSkillAttachedVisual[];
  enemyAttachedSkillVisualSprites: Map<number, Phaser.GameObjects.Container>;
  groundDrops: GroundDrop[];
  groundDropSprites: Map<number, Phaser.GameObjects.Image>;
  nextGroundDropId: number;
  enemyUpdateRemainderMs: number;
  respawnCadenceTicks: number;
  visibleNpcSourceOrders: ReadonlySet<number>;
  occupiedCellIndices: ReadonlySet<number>;
  width: number;
  height: number;
  objects: RenderedMapObject[];
}

interface EnemyStatusSpriteDisplay {
  container: Phaser.GameObjects.Container;
  signature: string;
  icons: Map<number, Phaser.GameObjects.Image>;
}

interface ActivePlayerSkillVisual extends PlayerSkillVisualSpawn {
  id: number;
  frameIndex: number;
}

interface DamageNumberPopup {
  mapId: number;
  effectOwner: 'hero' | 'map';
  frames: Phaser.GameObjects.Image[];
  baseX: number;
  baseY: number;
  animation: DamageNumberAnimation;
}

interface ActiveSourcePlayerLevelUpFlash {
  animation: SourcePlayerLevelUpFlash;
  sprite: Phaser.GameObjects.Image;
}

interface ActiveSourcePlayerLevelUpAtlasEffect {
  animation: SourcePlayerLevelUpAtlasAnimation;
  components: Array<{ frameIndex: number; sprite: Phaser.GameObjects.Image }>;
}

interface ActiveSourceWeaponProcFeedback {
  animation: SourceWeaponProcFeedbackAnimation;
  emotionImageIndex: number;
  sprite: Phaser.GameObjects.Image;
}

type CommerceScreen =
  | 'shop-list' | 'sell-list' | 'quantity' | 'confirm'
  | 'refiner-main' | 'orb-target' | 'orb-list' | 'mix-select'
  | 'blacksmith-main' | 'upgrade-target' | 'identify-target' | 'message';
type CommercePendingAction = 'buy' | 'sell' | 'orb' | 'upgrade' | 'identify' | 'mix';
interface CommerceMenuSession {
  service: 'shop' | 'refiner' | 'blacksmith';
  screen: CommerceScreen;
  tab: number;
  selection: number;
  quantity: number;
  item: CommerceItemReference | null;
  selectedInventoryIndex: number | null;
  target: EquipmentTarget | null;
  pendingAction: CommercePendingAction | null;
  pendingReturn: CommerceScreen;
  messageReturn: CommerceScreen;
  message: string;
  selectedIngredients: number[];
  confirmationSelection: 0 | 1;
}

/** Renders the starting house and follows its data-driven map-change event. */
export class WorldScene extends Phaser.Scene {
  private readonly randomStreams = createRuntimeSourceRandomStreams();
  private actor: PlayerActor = createPlayerActor();
  private playerCombo: PlayerComboState = { ...EMPTY_PLAYER_COMBO };
  private playerHitFeedback: PlayerHitFeedbackState = { ...EMPTY_PLAYER_HIT_FEEDBACK };
  private playerSkillAction: PlayerSkillActionState = createPlayerSkillActionState(0);
  private playerSkillActionStates = new Map<number, PlayerSkillActionState>();
  private nextPlayerSkillActionId = 1;
  private playerAttachedSkillVisuals: ActivePlayerSkillAttachedVisual[] = [];
  private playerAttachedSkillVisualSprites = new Map<number, Phaser.GameObjects.Container>();
  private nextPlayerAttachedSkillVisualId = 1;
  private world: WorldGrid | null = null;
  private maps = new Map<number, RenderedWorld>();
  private enemyDataTable: EnemyDataTable | null = null;
  private equipmentDataTable: EquipmentDataTable | null = null;
  private commerceCatalog: CommerceCatalog | null = null;
  private enemyAnimations = new Map<number, EnemySpriteAnimation>();
  private bossAnimations = new Map<number, BossSpriteAnimation>();
  private bossAttackEffects = new Map<number, BossAttackEffect>();
  private npcAnimations = new Map<number, NpcSpriteAnimation>();
  private pendingNpcAnimationPasses = 0;
  private sourcePaintRemainderMs = 0;
  private pendingSkillAttachedVisualPasses = 0;
  private enemyAttackEffects = new Map<number, EnemyAttackEffect>();
  private playerSkillEffects: PlayerSkillEffectCatalog | null = null;
  private playerLevelUpEffect: PlayerLevelUpEffect | null = null;
  private damageNumberPopups: DamageNumberPopup[] = [];
  private playerLevelUpFlashes: ActiveSourcePlayerLevelUpFlash[] = [];
  private playerLevelUpAtlasEffects: ActiveSourcePlayerLevelUpAtlasEffect[] = [];
  private mapIdsToLoad: number[] = [...MAP_IDS];
  private generatedAssetPaths: ReadonlySet<string> = new Set();
  private preloadedMapAssetPaths = new Map<number, MapAssetPaths>();
  private currentMapId = 64;
  private loadingMapTransition = false;
  private unavailableMapIds = new Set<number>();
  private fontLayout: BitmapFontData | null = null;
  private openingDialogVisible = false;
  private worldDialogueVisible = false;
  private openingDialogOverlay: Phaser.GameObjects.Image | null = null;
  private openingDialogContext: CanvasRenderingContext2D | null = null;
  private openingDialogTexture: Phaser.Textures.CanvasTexture | null = null;
  private gameplayHud: Phaser.GameObjects.Image | null = null;
  private gameplayHudContext: CanvasRenderingContext2D | null = null;
  private gameplayHudAssets: GameplayHudAssets | null = null;
  private gameplayHudTexture: Phaser.Textures.CanvasTexture | null = null;
  private pickupNoticeCanvas: HTMLCanvasElement | null = null;
  private pickupNoticeContext: CanvasRenderingContext2D | null = null;
  private pickupNoticeTexture: Phaser.Textures.CanvasTexture | null = null;
  private pickupNoticeOverlay: Phaser.GameObjects.Image | null = null;
  private pickupNoticeTicksRemaining = 0;
  private pickupNoticeText = '';
  private playerStatusContainer: Phaser.GameObjects.Container | null = null;
  private playerStatusMarkerOrder: number[] = [];
  private playerStatusMarkerContainers = new Map<number, Phaser.GameObjects.Container>();
  private playerStatusMarkerIcons = new Map<number, Phaser.GameObjects.Image>();
  private heroEmotionImage: Phaser.GameObjects.Image | null = null;
  private sourceWeaponProcFeedback: ActiveSourceWeaponProcFeedback[] = [];
  private openingDialogueText = '[Ron] Are you sure you want to quit your job?';
  private dialogueRevealElapsedMs = 0;
  private openingDialoguePages = ['[Ron] Are you sure you want to quit your job?'];
  private openingDialoguePageIndex = 0;
  private openingCutsceneState: EventCutsceneState | null = null;
  private openingCutsceneCommands: number[][] | null = null;
  private openingCutsceneEvents: EventOperationData | null = null;
  private openingCutsceneAppliedFlagCount = 0;
  private openingCutsceneAppliedPlayerChangeCount = 0;
  private openingCutsceneAppliedTileChangeCount = 0;
  private openingCutsceneAppliedHeroPositionChangeCount = 0;
  private openingCutsceneUsesRoninFormatting = false;
  private openingCutsceneBlankOverlay: Phaser.GameObjects.Rectangle | null = null;
  private eventCameraBaseScroll: { x: number; y: number } | null = null;
  private sourceCameraBaseScroll: { x: number; y: number } | null = null;
  private sourceCameraShakeOffset: { x: number; y: number } | null = null;
  private worldLanguage: unknown = null;
  private itemCategoryNames: string[] = [];
  private pendingWorldDialogueFlags: EventFlagChange[] = [];
  private pendingWorldDialogueTransition: MapTransition | undefined;
  private initialGuardianIndex = 0;
  private guardianIndices: number[] = [0, 1];
  private heroClassId: EndingHeroClassId = 6;
  private heroSpriteResourceClass: HeroSpriteResourceClass = 1;
  private unavailableSourceAssetsMessage: string | null = null;
  private hasHeroShieldLayout = false;
  private playthroughMode = 0;
  private completionPoints = 0;
  private playTimeSeconds = 0;
  private playTimeSessionStartedAtMs = 0;
  private characterAttributes: PlayerAttributes = createBasePlayerAttributes(6);
  private skillIds: number[] = [0, 1];
  private activeSkillId = 0;
  private comboLimit = 1;
  private hudState = { ...NEW_GAME_RONIN_HUD };
  private wallet = NEW_GAME_WALLET;
  private inventoryValue: InventoryStack[] = [];
  private specialInventoryValue: InventoryStack[] = [];
  private preservedSourceRmsInventorySlots: {
    regular: SourceInventorySlotSnapshot | null;
    special: SourceInventorySlotSnapshot | null;
  } | null = null;
  private equipmentSlots: EquipmentLoadout = [null, null, null, null, null];
  private savedEquipmentLoadoutPresent = false;
  private equipmentStats: EquipmentStats | null = null;
  private playerStatus: PlayerStatusState = createPlayerStatusState();
  private playerRecovery: PlayerRecoveryState = createPlayerRecoveryState();
  private gameFlags: ReadonlySet<number> = new Set(OBSERVED_NEW_GAME_FLAGS);
  private questFlags: ReadonlySet<number> = new Set();
  private bodyLayout: CharacterSpriteLayout | null = null;
  private armorLayout: CharacterSpriteLayout | null = null;
  private effectLayout: CharacterSpriteLayout | null = null;
  private headLayout: CharacterSpriteLayout | null = null;
  private alternateHeadLayout: CharacterSpriteLayout | null = null;
  private weaponLayout: CharacterSpriteLayout | null = null;
  private shieldLayout: CharacterSpriteLayout | null = null;
  private heroContainer: Phaser.GameObjects.Container | null = null;
  private heroParts = new Map<number, Phaser.GameObjects.Image>();
  private pressedDirections: Array<{ code: string; direction: Direction }> = [];
  private systemMenuVisible = false;
  private systemMenuSelection = 0;
  private skillMenuVisible = false;
  private skillLevelMenuVisible = false;
  private skillSelection = 0;
  private skillLevelActionButton: PlayerSkillActionButton = '1';
  private skillLevelSelection: PlayerSkillLevelSlot = 0;
  private inventoryMenuVisible = false;
  private inventorySelection = 0;
  private equipmentMenuMode: 'slots' | 'slot-items' | 'bag' = 'slots';
  private equipmentSlotSelection = 0;
  private attributeMenuVisible = false;
  private attributeConfirmationVisible = false;
  private attributeConfirmationSelection: 0 | 1 = 0;
  private attributeSelection = 0;
  private attributeDraft: AttributeDraft = createAttributeDraft(0);
  private systemMenuMessage = '';
  private commerceMenu: CommerceMenuSession | null = null;
  private systemMenuCanvas: HTMLCanvasElement | null = null;
  private systemMenuContext: CanvasRenderingContext2D | null = null;
  private systemMenuTexture: Phaser.Textures.CanvasTexture | null = null;
  private systemMenuOverlay: Phaser.GameObjects.Image | null = null;
  private gameOverSequence: GameOverSequence | null = null;
  private gameOverReturnPending = false;
  private gameOverCanvas: HTMLCanvasElement | null = null;
  private gameOverContext: CanvasRenderingContext2D | null = null;
  private gameOverTexture: Phaser.Textures.CanvasTexture | null = null;
  private gameOverOverlay: Phaser.GameObjects.Image | null = null;
  private gameOptions: GameOptions = { ...DEFAULT_GAME_OPTIONS };

  constructor() {
    super({ key: 'WorldScene' });
  }

  init(data: unknown): void {
    this.world = null;
    this.maps.clear();
    this.generatedAssetPaths = new Set();
    this.preloadedMapAssetPaths.clear();
    this.enemyDataTable = null;
    this.equipmentDataTable = null;
    this.commerceCatalog = null;
    this.enemyAnimations.clear();
    this.bossAnimations.clear();
    this.bossAttackEffects.clear();
    this.npcAnimations.clear();
    this.pendingNpcAnimationPasses = 0;
    this.sourcePaintRemainderMs = 0;
    this.pendingSkillAttachedVisualPasses = 0;
    this.enemyAttackEffects.clear();
    this.playerLevelUpEffect = null;
    this.damageNumberPopups = [];
    this.playerLevelUpFlashes = [];
    this.playerLevelUpAtlasEffects = [];
    this.loadingMapTransition = false;
    this.unavailableMapIds.clear();
    this.fontLayout = null;
    this.worldDialogueVisible = false;
    this.openingDialogOverlay = null;
    this.openingDialogContext = null;
    this.openingDialogTexture = null;
    this.gameplayHud = null;
    this.gameplayHudContext = null;
    this.gameplayHudAssets = null;
    this.gameplayHudTexture = null;
    this.pickupNoticeCanvas = null;
    this.pickupNoticeContext = null;
    this.pickupNoticeTexture = null;
    this.pickupNoticeOverlay = null;
    this.pickupNoticeTicksRemaining = 0;
    this.pickupNoticeText = '';
    this.playerStatusContainer = null;
    this.playerStatusMarkerOrder = [];
    this.playerStatusMarkerContainers.clear();
    this.playerStatusMarkerIcons.clear();
    this.heroEmotionImage = null;
    for (const feedback of this.sourceWeaponProcFeedback) feedback.sprite.destroy();
    this.sourceWeaponProcFeedback = [];
    this.systemMenuCanvas = null;
    this.systemMenuContext = null;
    this.systemMenuTexture = null;
    this.systemMenuOverlay = null;
    this.heroContainer = null;
    this.heroParts.clear();
    this.heroSpriteResourceClass = 1;
    this.unavailableSourceAssetsMessage = null;
    this.hasHeroShieldLayout = false;
    this.bodyLayout = null;
    this.armorLayout = null;
    this.effectLayout = null;
    this.headLayout = null;
    this.alternateHeadLayout = null;
    this.weaponLayout = null;
    this.shieldLayout = null;
    this.gameOverSequence = null;
    this.gameOverReturnPending = false;
    this.gameOverCanvas = null;
    this.gameOverContext = null;
    this.gameOverTexture = null;
    this.gameOverOverlay = null;
    this.openingDialogueText = '[Ron] Are you sure you want to quit your job?';
    this.dialogueRevealElapsedMs = 0;
    this.openingDialoguePages = ['[Ron] Are you sure you want to quit your job?'];
    this.openingDialoguePageIndex = 0;
    this.openingCutsceneState = null;
    this.openingCutsceneCommands = null;
    this.openingCutsceneEvents = null;
    this.openingCutsceneAppliedFlagCount = 0;
    this.openingCutsceneAppliedPlayerChangeCount = 0;
    this.openingCutsceneAppliedTileChangeCount = 0;
    this.openingCutsceneAppliedHeroPositionChangeCount = 0;
    this.openingCutsceneUsesRoninFormatting = false;
    this.openingCutsceneBlankOverlay = null;
    this.worldLanguage = null;
    this.itemCategoryNames = [];
    this.pendingWorldDialogueFlags = [];
    this.pendingWorldDialogueTransition = undefined;
    this.pressedDirections = [];
    try {
      this.gameOptions = readGameOptions(window.localStorage);
    } catch {
      this.gameOptions = { ...DEFAULT_GAME_OPTIONS };
    }
    for (const key of [
      'gameplay-hud', 'world-system-menu', 'opening-dialog-overlay', 'world-game-over',
      'world-pickup-notice',
    ]) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    if (this.cache.json.exists('world-enemy-data')) this.cache.json.remove('world-enemy-data');
    if (this.cache.json.exists('world-asset-manifest')) this.cache.json.remove('world-asset-manifest');
    const startRoute = typeof data === 'object' && data !== null && 'startRoute' in data
      ? (data as { startRoute?: unknown }).startRoute
      : undefined;
    const guardianIndices = typeof data === 'object' && data !== null &&
      'guardianIndices' in data && Array.isArray((data as { guardianIndices?: unknown }).guardianIndices)
      ? (data as { guardianIndices: unknown[] }).guardianIndices
      : [];
    const restoreState = typeof data === 'object' && data !== null && 'saveState' in data
      ? parseGameSave((data as { saveState?: unknown }).saveState)
      : null;
    const requestedHeroClassId = typeof data === 'object' && data !== null &&
      'heroClassId' in data ? (data as { heroClassId?: unknown }).heroClassId : undefined;
    this.heroClassId = restoreState?.heroClassId ??
      (isEndingHeroClassId(requestedHeroClassId) ? requestedHeroClassId : 6);
    this.playthroughMode = startRoute === 'new-game-plus'
      ? 1
      : (restoreState?.playthroughMode ?? 0);
    this.completionPoints = restoreState?.completionPoints ?? 0;
    this.playTimeSeconds = restoreState?.playTimeSeconds ?? 0;
    this.characterAttributes = restoreState?.attributes ?? createBasePlayerAttributes(this.heroClassId);
    this.systemMenuVisible = false;
    this.skillMenuVisible = false;
    this.skillLevelMenuVisible = false;
    this.skillSelection = 0;
    this.skillLevelActionButton = '1';
    this.skillLevelSelection = 0;
    this.commerceMenu = null;
    this.systemMenuSelection = 0;
    this.inventoryMenuVisible = false;
    this.inventorySelection = 0;
    this.equipmentMenuMode = 'slots';
    this.equipmentSlotSelection = 0;
    this.attributeMenuVisible = false;
    this.attributeConfirmationVisible = false;
    this.attributeConfirmationSelection = 0;
    this.attributeSelection = 0;
    this.attributeDraft = createAttributeDraft(0);
    this.systemMenuMessage = '';
    this.hudState = { ...NEW_GAME_RONIN_HUD };
    this.wallet = NEW_GAME_WALLET;
    this.equipmentSlots = [null, null, null, null, null];
    this.savedEquipmentLoadoutPresent = false;
    this.equipmentStats = null;
    this.comboLimit = 1;
    this.inventory = [];
    this.specialInventory = [];
    this.playerStatus = createPlayerStatusState();
    this.playerStatusMarkerOrder = [];
    this.playerRecovery = createPlayerRecoveryState();
    this.playerCombo = { ...EMPTY_PLAYER_COMBO };
    this.playerHitFeedback = { ...EMPTY_PLAYER_HIT_FEEDBACK };
    this.playerSkillActionStates.clear();
    this.nextPlayerSkillActionId = 1;
    this.guardianIndices = [...new Set(guardianIndices.filter((index): index is number =>
      Number.isInteger(index) && Number(index) >= 0 && Number(index) <= 2,
    ))];
    this.skillIds = [...this.guardianIndices];
    this.activeSkillId = this.skillIds[0] ?? 0;
    if ((startRoute === 'load-game' || startRoute === 'new-game-plus') && restoreState !== null) {
      this.currentMapId = restoreState.mapId;
      this.actor = {
        ...createPlayerActor(restoreState.tileX * 16, restoreState.tileY * 16),
        direction: restoreState.direction,
      };
      this.openingDialogVisible = false;
      this.gameFlags = new Set(restoreState.gameFlags);
      this.questFlags = new Set(restoreState.questFlags);
      this.guardianIndices = [...restoreState.guardianIndices];
      this.skillIds = [...restoreState.skillIds];
      this.activeSkillId = restoreState.activeSkillId;
      for (const progress of restoreState.skillProgress) {
        this.playerSkillActionStates.set(progress.skillId, createPlayerSkillActionState(
          progress.skillId,
          this.characterAttributes.will,
          progress.skillRank,
          progress.skillExperience,
          progress.skillLevelSlotOne,
          progress.skillLevelSlotThree,
        ));
      }
      this.comboLimit = restoreState.comboLimit;
      this.hudState = { ...restoreState.hud };
      this.wallet = restoreState.wallet;
      this.inventory = restoreState.inventory.map((stack) => ({ ...stack }));
      this.specialInventory = restoreState.specialInventory.map((stack) => ({ ...stack }));
      this.preservedSourceRmsInventorySlots = {
        regular: snapshotSourceInventorySlots(this.inventory, restoreState.sourceInventorySlotIndices, 30),
        special: snapshotSourceInventorySlots(this.specialInventory, restoreState.sourceSpecialInventorySlotIndices, 15),
      };
      this.savedEquipmentLoadoutPresent = restoreState.equipmentSlots !== null;
      this.equipmentSlots = restoreState.equipmentSlots === null
        ? [null, null, null, null, null]
        : cloneEquipmentLoadout(restoreState.equipmentSlots);
      this.hudState.selectedItemCount = selectedConsumableCount(
        this.inventory,
        this.hudState.selectedItemCategory,
      );
    } else if (startRoute === 'new-game') {
      this.preservedSourceRmsInventorySlots = null;
      this.playthroughMode = 0;
      this.currentMapId = NEW_GAME_START.mapId;
      this.actor = createPlayerActor(NEW_GAME_START.tileX * 16, NEW_GAME_START.tileY * 16);
      this.openingDialogVisible = true;
      this.gameFlags = new Set(OBSERVED_NEW_GAME_FLAGS);
      this.questFlags = new Set();
      if (this.guardianIndices.length === 0) this.guardianIndices = [0, 1];
      this.skillIds = [...this.guardianIndices];
    } else {
      this.currentMapId = 64;
      this.actor = createPlayerActor();
      this.openingDialogVisible = false;
      this.gameFlags = new Set(OBSERVED_NEW_GAME_FLAGS);
      this.questFlags = new Set();
    }
    this.initialGuardianIndex = this.guardianIndices[0] ?? 0;
    const activeSkillId = this.activeSkillId;
    this.playerSkillAction = getPlayerSkillActionState(
      activeSkillId,
      this.characterAttributes.will,
      this.nextPlayerSkillActionId,
      this.playerSkillActionStates,
    );
    this.mapIdsToLoad = [...new Set([...MAP_IDS, this.currentMapId])];
  }

  private get inventory(): InventoryStack[] {
    return this.inventoryValue;
  }

  private set inventory(value: InventoryStack[]) {
    this.updateInventory(value);
  }

  private updateInventory(value: InventoryStack[], sourceReplacementIndex?: number): void {
    if (this.preservedSourceRmsInventorySlots !== null) {
      this.preservedSourceRmsInventorySlots.regular = advanceSourceInventorySlotSnapshot(
        this.preservedSourceRmsInventorySlots.regular,
        value,
        30,
        sourceReplacementIndex === undefined
          ? []
          : [{ oldIndex: sourceReplacementIndex, nextIndex: sourceReplacementIndex }],
      );
    }
    this.inventoryValue = value;
  }

  private get specialInventory(): InventoryStack[] {
    return this.specialInventoryValue;
  }

  private set specialInventory(value: InventoryStack[]) {
    if (this.preservedSourceRmsInventorySlots !== null) {
      this.preservedSourceRmsInventorySlots.special = advanceSourceInventorySlotSnapshot(
        this.preservedSourceRmsInventorySlots.special,
        value,
        15,
      );
    }
    this.specialInventoryValue = value;
  }

  preload(): void {
    this.load.once('filecomplete-json-world-asset-manifest', () => {
      this.generatedAssetPaths = parseGeneratedAssetPaths(
        this.cache.json.get('world-asset-manifest') as unknown,
      );
      const heroSpriteResourceClass = resolveHeroSpriteResourceClass(
        this.heroClassId,
        this.generatedAssetPaths,
      );
      if (heroSpriteResourceClass === null) {
        this.unavailableSourceAssetsMessage =
          `Hero class ${this.heroClassId} source sprite resources are unavailable.`;
        return;
      }
      let missingMapId: number | undefined;
      for (const mapId of this.mapIdsToLoad) {
        const paths = resolveMapAssetPaths(mapId, this.heroClassId, this.generatedAssetPaths);
        if (paths === null) {
          missingMapId = mapId;
          break;
        }
        this.preloadedMapAssetPaths.set(mapId, paths);
      }
      if (missingMapId !== undefined) {
        this.unavailableSourceAssetsMessage =
          `Map ${missingMapId} source resources for hero class ${this.heroClassId} are unavailable.`;
        return;
      }
      if (this.generatedAssetPaths.has('player-level-up-effects/catalog.json')) {
        this.load.json(
          'world-player-level-up-effects',
          '/assets/generated/player-level-up-effects/catalog.json',
        );
        for (const assetPath of this.generatedAssetPaths) {
          const match = /^atlases\/char\/lvup\/(\d{3})\.png$/.exec(assetPath);
          if (match?.[1] === undefined) continue;
          this.load.image(
            `world-player-level-up-atlas-${Number(match[1])}`,
            `/assets/generated/${assetPath}`,
          );
        }
      }
      this.heroSpriteResourceClass = heroSpriteResourceClass;
      for (const part of HERO_LAYOUT_PARTS) {
        this.load.json(
          `hero-layout-${part}`,
          heroSpriteLayoutAssetPath(this.heroSpriteResourceClass, part),
        );
      }
      this.hasHeroShieldLayout = this.heroSpriteResourceClass === 3 && this.heroClassId === 8 &&
        hasHeroShieldSpriteResources(this.heroSpriteResourceClass, this.generatedAssetPaths);
      if (this.hasHeroShieldLayout) {
        this.load.json('hero-layout-s', heroSpriteLayoutAssetPath(3, 's'));
      }
      for (const mapId of this.mapIdsToLoad) {
        const paths = this.preloadedMapAssetPaths.get(mapId)!;
        this.load.json(`world-map-${mapId}`, paths.map);
        this.load.json(`world-collision-${mapId}`, paths.collision);
        this.load.json(`world-decorations-${mapId}`, paths.decorations);
        this.load.json(`world-events-${mapId}`, paths.events);
      }
    });
    this.load.json('world-asset-manifest', '/assets/generated/asset-manifest.json');
    this.load.json('world-font-layout', '/assets/generated/fonts/small.json');
    this.load.json('world-language-en-GB', '/assets/generated/language/en-GB.json');
    this.load.json('world-item-category-texts', '/assets/generated/text-tables/itm/itmtp.json');
    const enemyDataVariant = enemyDataVariantForPlaythroughMode(this.playthroughMode);
    this.load.json('world-enemy-data', `/assets/generated/enemy-data/data${enemyDataVariant}.json`);
    this.load.json('world-equipment-data', '/assets/generated/equipment-data/catalog.json');
    this.load.json('world-commerce-data', '/assets/generated/commerce-data/catalog.json');
    this.load.json('world-enemy-animations', ENEMY_ANIMATION_CATALOG);
    this.load.json('world-boss-animations', BOSS_ANIMATION_CATALOG);
    this.load.json('world-boss-attack-effects', BOSS_ATTACK_EFFECT_CATALOG);
    this.load.json('world-npc-animations', NPC_ANIMATION_CATALOG);
    this.load.json('world-enemy-attack-effects', ENEMY_ATTACK_EFFECT_CATALOG);
    this.load.json('world-player-skill-effects', PLAYER_SKILL_EFFECT_CATALOG);
    this.load.image('world-font-atlas', '/assets/generated/fonts/small.png');
    this.load.image(
      'world-player-level-up-flash',
      '/assets/generated/standalone/en-GB/_img_etcui__0.png',
    );
    for (let index = 0; index < 7; index += 1) {
      this.load.image(
        `world-hud-frame-${index}`,
        `/assets/generated/atlases/img/uifrm/${String(index).padStart(3, '0')}.png`,
      );
    }
    this.load.image('world-hud-digits', '/assets/generated/atlases/img/glb/005.png');
    this.load.image('world-player-status-background', '/assets/generated/atlases/img/keepst/000.png');
    for (let statusId = 5; statusId <= 7; statusId += 1) {
      this.load.image(
        `world-player-status-${statusId}`,
        `/assets/generated/atlases/img/keepst/${String(statusId + 1).padStart(3, '0')}.png`,
      );
    }
    for (let statusId = 0; statusId <= 4; statusId += 1) {
      this.load.image(
        `world-enemy-status-${statusId}`,
        `/assets/generated/atlases/img/keepst/${String(statusId + 1).padStart(3, '0')}.png`,
      );
    }
    for (let index = 0; index < 12; index += 1) {
      this.load.image(
        `world-emotion-${index}`,
        `/assets/generated/atlases/img/emoti/${String(index).padStart(3, '0')}.png`,
      );
    }
    this.load.spritesheet(
      'world-damage-digits',
      '/assets/generated/atlases/img/etcui/005.png',
      { frameWidth: 7, frameHeight: 9 },
    );
    for (const category of CONSUMABLE_CATEGORIES) {
      this.load.image(
        `world-hud-item-category-${category}`,
        `/assets/generated/atlases/img/icoitm/${String(category).padStart(3, '0')}.png`,
      );
    }
    this.load.image('world-ground-item', '/assets/generated/atlases/img/etcui/009.png');
    this.load.image('world-ground-currency', '/assets/generated/atlases/img/etcui/010.png');
    this.load.image(
      'world-hud-guardian-skill',
      `/assets/generated/atlases/grd/grdico/${String(6 + this.activeSkillId * 4).padStart(3, '0')}.png`,
    );
    for (let skillId = 0; skillId < 6; skillId += 1) {
      this.load.image(
        `world-skill-icon-${skillId}`,
        `/assets/generated/atlases/grd/grdico/${String(skillId).padStart(3, '0')}.png`,
      );
      this.load.image(
        `world-skill-hud-icon-${skillId}`,
        `/assets/generated/atlases/grd/grdico/${String(6 + skillId * 4).padStart(3, '0')}.png`,
      );
    }
    for (const [atlasFamily, imageCount] of Object.entries(PLAYER_SKILL_ATLAS_IMAGE_COUNTS)) {
      for (let imageIndex = 0; imageIndex < imageCount; imageIndex += 1) {
        this.load.image(
          `world-player-skill-atlas-${atlasFamily}-${imageIndex}`,
          `/assets/generated/atlases/grd/${atlasFamily}/${String(imageIndex).padStart(3, '0')}.png`,
        );
      }
    }
  }

  create(): void {
    if (this.unavailableSourceAssetsMessage !== null) {
      this.showAssetMessage(this.unavailableSourceAssetsMessage);
      return;
    }
    const rawBodyLayout = this.cache.json.get('hero-layout-b') as unknown;
    const rawArmorLayout = this.cache.json.get('hero-layout-a') as unknown;
    const rawEffectLayout = this.cache.json.get('hero-layout-e') as unknown;
    const rawHeadLayout = this.cache.json.get('hero-layout-hA') as unknown;
    const rawAlternateHeadLayout = this.cache.json.get('hero-layout-hB') as unknown;
    const rawWeaponLayout = this.cache.json.get('hero-layout-w') as unknown;
    const rawShieldLayout = this.hasHeroShieldLayout
      ? this.cache.json.get('hero-layout-s') as unknown
      : undefined;
    this.fontLayout = this.cache.json.get('world-font-layout') as BitmapFontData;
    const language = this.cache.json.get('world-language-en-GB') as unknown;
    const itemCategoryTexts = this.cache.json.get('world-item-category-texts') as unknown;
    const rawEnemyData = this.cache.json.get('world-enemy-data') as unknown;
    const rawEquipmentData = this.cache.json.get('world-equipment-data') as unknown;
    const rawCommerceData = this.cache.json.get('world-commerce-data') as unknown;
    this.worldLanguage = language;
    this.itemCategoryNames = resolveTextTableStrings(itemCategoryTexts, language);
    try {
      this.enemyDataTable = parseEnemyDataTable(rawEnemyData);
    } catch {
      this.showAssetMessage('Enemy definitions are missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      this.equipmentDataTable = parseEquipmentDataTable(rawEquipmentData);
    } catch {
      this.showAssetMessage('Equipment definitions are missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      this.commerceCatalog = parseCommerceCatalog(rawCommerceData);
    } catch {
      this.showAssetMessage('Shop and service definitions are missing or invalid. Run npm run assets:extract.');
      return;
    }
    try {
      this.equipmentSlots = this.savedEquipmentLoadoutPresent
        ? cloneEquipmentLoadout(this.equipmentSlots)
        : createStartingEquipment(this.heroClassId, this.equipmentDataTable);
      this.inventory = normalizeEquipmentInventory(this.inventory, this.equipmentDataTable);
      this.recalculateEquipmentStats();
    } catch {
      this.showAssetMessage('Player equipment state is invalid. Start a new game or load a valid save.');
      return;
    }
    try {
      const animationCatalog = parseEnemySpriteAnimationCatalog(
        this.cache.json.get('world-enemy-animations') as unknown,
      );
      this.enemyAnimations = new Map(animationCatalog.sprites.map((animation) => [
        animation.spriteId,
        animation,
      ]));
    } catch {
      this.showAssetMessage('Enemy animation data is missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      const animationCatalog = parseBossSpriteAnimationCatalog(
        this.cache.json.get('world-boss-animations') as unknown,
      );
      const map11Boss = animationCatalog.sprites.find((animation) =>
        animation.bossId === 1 && animation.enemyId === 32);
      const map13Boss = animationCatalog.sprites.find((animation) =>
        animation.bossId === 2 && animation.enemyId === 35);
      const map13SecondWave = [36, 37, 38].map((enemyId) =>
        animationCatalog.sprites.find((animation) =>
          animation.bossId === 2 && animation.enemyId === enemyId));
      const map15Actors = [39, 40, 41].map((enemyId) =>
        animationCatalog.sprites.find((animation) =>
          animation.bossId === 3 && animation.enemyId === enemyId));
      if (map11Boss === undefined || map13Boss === undefined ||
        map13SecondWave.some((animation) => animation === undefined) ||
        map15Actors.some((animation) => animation === undefined)) {
        throw new TypeError('Map 11, map 13, or map 15 boss animation is missing');
      }
      this.bossAnimations = new Map([
        [MAP11_CB_RENDER_SPRITE_ID, map11Boss],
        [MAP13_AQ_RENDER_SPRITE_ID, map13Boss],
        [MAP13_AF_RENDER_SPRITE_ID, map13SecondWave[0]!],
        [MAP13_BC_RENDER_SPRITE_ID, map13SecondWave[1]!],
        [MAP13_CC_RENDER_SPRITE_ID, map13SecondWave[2]!],
        [MAP15_CF_RENDER_SPRITE_ID, map15Actors[0]!],
        [MAP15_AZ_RENDER_SPRITE_ID, map15Actors[1]!],
        [MAP15_AJ_RENDER_SPRITE_ID, map15Actors[2]!],
      ]);
    } catch {
      this.showAssetMessage('Boss animation data is missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      const effectCatalog = parseBossAttackEffectCatalog(
        this.cache.json.get('world-boss-attack-effects') as unknown,
      );
      this.bossAttackEffects = new Map(effectCatalog.effects.map((effect) => [effect.enemyId, effect]));
    } catch {
      this.showAssetMessage('Boss attack effects are missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      const npcAnimationCatalog = parseNpcSpriteAnimationCatalog(
        this.cache.json.get('world-npc-animations') as unknown,
      );
      this.npcAnimations = new Map(npcAnimationCatalog.sprites.map((animation) => [
        animation.npcId, animation,
      ]));
      for (const npcId of [3, 6]) {
        const enemySpriteId = sourceEnemySpriteIdForNpc(npcId);
        const enemyAnimation = enemySpriteId === undefined
          ? undefined
          : this.enemyAnimations.get(enemySpriteId);
        if (enemyAnimation === undefined) {
          throw new TypeError(`NPC ${npcId} enemy-backed animation is missing`);
        }
        this.npcAnimations.set(npcId, adaptEnemyAnimationForNpc(npcId, enemyAnimation));
      }
    } catch {
      this.showAssetMessage('NPC animation data is missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      const effectCatalog = parseEnemyAttackEffectCatalog(
        this.cache.json.get('world-enemy-attack-effects') as unknown,
      );
      this.enemyAttackEffects = new Map(effectCatalog.effects.map((effect) => [effect.spriteId, effect]));
    } catch {
      this.showAssetMessage('Enemy attack effects are missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    try {
      this.playerSkillEffects = parsePlayerSkillEffectCatalog(
        this.cache.json.get('world-player-skill-effects') as unknown,
      );
    } catch {
      this.showAssetMessage('Player skill effects are missing or invalid.\nRun npm run assets:extract.');
      return;
    }
    if (this.cache.json.exists('world-player-level-up-effects')) {
      try {
        this.playerLevelUpEffect = parsePlayerLevelUpEffectCatalog(
          this.cache.json.get('world-player-level-up-effects') as unknown,
        );
      } catch {
        // Effect type 4 is optional for older generated asset sets.
        this.playerLevelUpEffect = null;
      }
    }
    const parsedMaps: Array<{
      id: number;
      map: BaseMapData;
      decorations: MapDecorationData;
      decorationObjectCount: number;
      world: WorldGrid;
      events: EventOperationData;
      enemies: EnemyCombatant[];
      visibleNpcSourceOrders: ReadonlySet<number>;
      npcEmotions: Readonly<Record<number, number | null>>;
      startupHeroEmotion: number | null | undefined;
    }> = [];
    try {
      for (const mapId of this.mapIdsToLoad) {
        const map = parseBaseMapData(this.cache.json.get(`world-map-${mapId}`) as unknown);
        const collision = parseBaseCollisionData(
          this.cache.json.get(`world-collision-${mapId}`) as unknown,
        );
        const decorations = parseMapDecorationData(
          this.cache.json.get(`world-decorations-${mapId}`) as unknown,
        );
        const events = parseEventOperationData(
          this.cache.json.get(`world-events-${mapId}`) as unknown,
        );
        if (decorations.tilesetId !== map.tilesetId) {
          throw new TypeError(`Map ${mapId} and its decoration tileset differ`);
        }
        const initialState = applyInitialMapEventState(
          createWorldGrid(map, collision),
          events,
          this.gameFlags,
          decorations,
        );
        const effectiveDecorations = initialState.decorations;
        const effectiveEvents = addSourceConstructedMapEnemies(mapId, {
          ...events,
          npcPlacements: initialState.npcPlacements,
          enemyPlacements: initialState.enemyPlacements,
        });
        parsedMaps.push({
          id: mapId,
          map: initialState.world.map,
          decorations: effectiveDecorations,
          decorationObjectCount: decorations.objects.length,
          events: effectiveEvents,
          enemies: createEnemyCombatants(effectiveEvents.enemyPlacements, this.enemyDataTable),
          world: initialState.world,
          visibleNpcSourceOrders: initialState.visibleNpcSourceOrders,
          npcEmotions: initialState.npcEmotions,
          startupHeroEmotion: initialState.heroEmotion,
        });
      }
      this.bodyLayout = parseCharacterSpriteLayout(rawBodyLayout);
      this.armorLayout = parseCharacterSpriteLayout(rawArmorLayout);
      this.effectLayout = parseCharacterSpriteLayout(rawEffectLayout);
      this.headLayout = parseCharacterSpriteLayout(rawHeadLayout);
      this.alternateHeadLayout = parseCharacterSpriteLayout(rawAlternateHeadLayout);
      this.weaponLayout = parseCharacterSpriteLayout(rawWeaponLayout);
      this.shieldLayout = rawShieldLayout === undefined || rawShieldLayout === null
        ? null
        : parseCharacterSpriteLayout(rawShieldLayout);
    } catch {
      this.showAssetMessage('World map or hero data is missing or invalid.\nRun npm run assets:extract.');
      return;
    }

    const openingMapEvents = parsedMaps.find(({ id }) => id === NEW_GAME_START.mapId)?.events;
    const openingSelection = this.openingDialogVisible && openingMapEvents !== undefined
      ? resolveTriggerScript(
        openingMapEvents,
        OPENING_SCRIPT_TRIGGER,
        OPENING_SCRIPT_TRIGGER_TYPE,
        this.gameFlags,
        this.questFlags,
        this.inventory,
      )
      : undefined;
    if (openingSelection?.scriptIndex === OPENING_SCRIPT_INDEX) {
      this.openingCutsceneCommands = openingSelection.commands;
      this.openingCutsceneEvents = openingMapEvents!;
      this.openingCutsceneState = createEventCutscene(
        OPENING_SCRIPT_INDEX, this.actor.direction, this.inventory, this.skillIds, this.comboLimit,
        this.heroClassId, this.questFlags.has(29),
      );
      this.openingCutsceneUsesRoninFormatting = true;
      this.pumpOpeningCutscene(0);
    }

    const requiredMapTextures: string[] = [];
    const queuedMaps: Array<{
      id: number;
      map: BaseMapData;
      decorations: MapDecorationData;
      decorationObjectCount: number;
      world: WorldGrid;
      events: EventOperationData;
      enemies: EnemyCombatant[];
      visibleNpcSourceOrders: ReadonlySet<number>;
      npcEmotions: Readonly<Record<number, number | null>>;
      tileKeys: Map<number, string>;
      objectKeys: Map<number, string>;
      npcTextureKeys: NpcTextureKeys;
      enemyTextureKeys: EnemyTextureSets;
    }> = [];
    for (const {
      id, map, decorations, decorationObjectCount, world, events, enemies,
      visibleNpcSourceOrders, npcEmotions, startupHeroEmotion,
    } of parsedMaps) {
      const mapName = String(id).padStart(2, '0');
      const tileKeys = new Map<number, string>();
      const tilesetPath = `/assets/generated/atlases/m/t/t${String(map.tilesetId).padStart(2, '0')}`;
      for (const tileId of new Set([...map.tileIds.flat(), ...getEventTileIds(events)])) {
        const key = `map-${id}-tile-${tileId}`;
        tileKeys.set(tileId, key);
        requiredMapTextures.push(key);
        this.load.image(key, `${tilesetPath}/${String(tileId).padStart(3, '0')}.png`);
      }
      const objectKeys = new Map<number, string>();
      const objectAtlasPath = `/assets/generated/atlases/${decorations.objectAtlas}`;
      for (const atlasIndex of new Set([
        ...decorations.loadedImageIds,
        ...decorations.objects.map(({ atlasIndex }) => atlasIndex),
      ])) {
        const key = `map-${id}-object-${atlasIndex}`;
        objectKeys.set(atlasIndex, key);
        requiredMapTextures.push(key);
        this.load.image(key, `${objectAtlasPath}/${String(atlasIndex).padStart(3, '0')}.png`);
      }
      const npcTextureKeys = this.queueNpcTextures(
        events,
        (key, path) => {
          if (requiredMapTextures.includes(key) || this.textures.exists(key)) return;
          requiredMapTextures.push(key);
          this.load.image(key, path);
        },
      );
      const enemyTextureKeys = this.queueEnemySpriteTextures(
        [...events.enemyPlacements.flatMap(({ enemyId, spriteId, renderSpriteId }) => [
          renderSpriteId ?? spriteId ?? enemyId,
          ...(renderSpriteId === undefined ? [] : [spriteId ?? enemyId]),
        ]), ...sourceMapSpawnRenderSpriteIds(id)],
        (key, path) => {
          if (requiredMapTextures.includes(key) || this.textures.exists(key)) return;
          requiredMapTextures.push(key);
          this.load.image(key, path);
        },
      );
      this.maps.set(id, {
        world,
        tilesetId: map.tilesetId,
        startupHeroEmotion,
        events,
        tileKeys,
        objectTextureKeys: objectKeys,
        decorationObjectCount,
        decorationSprites: new Map(),
        enemies,
        enemySprites: new Map(),
        enemyStatusDisplays: new Map(),
        npcSprites: new Map(),
        enemyTextureKeys,
        enemyProjectiles: [],
        enemyProjectileSprites: new Map(),
        playerProjectiles: [],
        nextPlayerProjectileId: 1,
        enemyAttackAnimations: [],
        enemyAttackSprites: new Map(),
        nextEnemyAttackVisualId: 1,
        playerSkillVisuals: [],
        playerSkillVisualSprites: new Map(),
        nextPlayerSkillVisualId: 1,
        enemyAttachedSkillVisuals: [],
        enemyAttachedSkillVisualSprites: new Map(),
        groundDrops: [],
        groundDropSprites: new Map(),
        nextGroundDropId: 1,
        enemyUpdateRemainderMs: 0,
        respawnCadenceTicks: ENEMY_RESPAWN_CADENCE_TICKS,
        visibleNpcSourceOrders,
        occupiedCellIndices: createEntityOccupancy(
          events,
          map.width,
          map.height,
          visibleNpcSourceOrders,
          undefined,
          this.activeEnemyPlacements(enemies),
        ),
        width: map.width * map.tileSize,
        height: map.height * map.tileSize,
        objects: [],
      });
      queuedMaps.push({
        id,
        map,
        decorations,
        decorationObjectCount,
        world,
        events,
        enemies,
        visibleNpcSourceOrders,
        npcEmotions,
        tileKeys,
        objectKeys,
        npcTextureKeys,
        enemyTextureKeys,
      });
    }

    const heroTextures = this.loadHeroTextures();

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const missingMapTexture = requiredMapTextures.some((key) => !this.textures.exists(key));
      const missingHero = heroTextures.some(({ key }) => !this.textures.exists(key));
      if (missingMapTexture || missingHero) {
        this.showAssetMessage('World map or hero images are incomplete.\nRun npm run assets:extract.');
        return;
      }
      for (const {
        id, map, decorations, decorationObjectCount, events, enemies, visibleNpcSourceOrders,
        npcEmotions, tileKeys, objectKeys, npcTextureKeys, enemyTextureKeys,
      } of queuedMaps) {
        const rendered = this.renderStaticMap(
          map, tileKeys, decorations, objectKeys, events, visibleNpcSourceOrders,
          npcEmotions, npcTextureKeys, enemyTextureKeys,
        );
        const renderedWorld = this.maps.get(id)!;
        renderedWorld.objects = rendered.objects;
        renderedWorld.decorationSprites = rendered.decorationSprites;
        renderedWorld.decorationObjectCount = decorationObjectCount;
        renderedWorld.objectTextureKeys = objectKeys;
        renderedWorld.enemySprites = rendered.enemySprites;
        renderedWorld.npcSprites = rendered.npcSprites;
        renderedWorld.enemies = enemies;
        renderedWorld.occupiedCellIndices = this.mapEntityOccupancy(renderedWorld);
        if (id !== this.currentMapId) this.setMapObjectsVisible(renderedWorld, false);
      }
      this.world = this.maps.get(this.currentMapId)?.world ?? null;
      this.playTimeSessionStartedAtMs = Date.now();
      this.createHero();
      const entryMap = this.maps.get(this.currentMapId);
      if (entryMap !== undefined) this.centerCameraForMapEntry(entryMap);
      if (this.openingDialogVisible) {
        this.createOpeningCutsceneBlankOverlay();
        this.syncOpeningCutscenePresentation();
        if (this.openingCutsceneState?.status === 'dialogue' ||
          this.openingCutsceneState?.status === 'choice') this.createOpeningDialog();
      }
      else this.createGameplayHud();
      this.bindMovementKeys();
      if (!this.openingDialogVisible) {
        const currentMap = this.maps.get(this.currentMapId);
        if (currentMap !== undefined) this.tryCurrentCellAutomaticEvent(currentMap);
      }
    });
    this.load.start();
  }

  update(_time: number, delta: number): void {
    if (this.gameOverReturnPending) {
      this.gameOverReturnPending = false;
      this.scene.start('StartupFlowScene', { skipStartupSplash: true });
      return;
    }
    // The source keeps its world tick in gameplay mode beneath the System overlay.
    // Commerce handoffs use a separate source mode and hold the map simulation.
    if (this.loadingMapTransition || this.commerceMenu !== null || this.world === null || this.heroContainer === null) return;
    const frameDelta = delta * gameSpeedScale(this.gameOptions);
    const sourcePaintClock = advanceSourcePaintClock(frameDelta, this.sourcePaintRemainderMs);
    this.sourcePaintRemainderMs = sourcePaintClock.remainderMs;
    if (shouldResumeSourceEventBeforeWorldUpdate(
      this.openingCutsceneState?.sourceEventResumePending ?? false,
      this.actor.tickRemainderMs,
      frameDelta,
    )) this.pumpOpeningCutscene(0);
    this.advanceDialogueReveal(frameDelta);
    const cutsceneStatus = this.openingCutsceneState?.status ?? null;
    const sourceWorldTickDuringDelay = this.openingCutsceneState?.sourceWorldTickDuringDelay ?? false;
    const sourceUpdateScope = sourceWorldUpdateScope(
      this.worldDialogueVisible,
      this.openingDialogVisible,
      cutsceneStatus,
      sourceWorldTickDuringDelay,
    );
    // Mode-4 movement calls m.n()/ad.c() for the hero and NPCs, but skips the
    // ordinary m.i()/ad.b() pass that updates enemies, projectiles, and drops.
    const pausedForEventDialogue = sourceUpdateScope === 'paused';
    const sourceActorDelta = sourceActorSimulationDelta(frameDelta, sourceUpdateScope);
    // Source ag.m11a() text/choice states do not call m.n(). Its camera helper
    // still runs in mode 4. Back-edge yielding also advances the event script
    // without a map tick, while flashes/shakes tick their event state only.
    const cutsceneMovesCamera = (this.openingCutsceneState?.cameraMoveSpeed ?? 0) !== 0;
    const cutsceneNeedsEventOnlyTick = cutsceneStatus === 'flash' || cutsceneStatus === 'shake' ||
      (cutsceneStatus === 'delay' && !sourceWorldTickDuringDelay);
    if (pausedForEventDialogue && this.openingDialogVisible &&
      (cutsceneMovesCamera || cutsceneNeedsEventOnlyTick)) {
      this.pumpOpeningCutscene(frameDelta);
    }
    const simulationDelta = sourceGameplaySimulationDelta(frameDelta, sourceUpdateScope);
    const sourceMapVisibleDuringEvent = this.worldDialogueVisible || (
      this.openingDialogVisible && this.openingCutsceneState !== null &&
      !this.openingCutsceneState.screenBlank && this.openingCutsceneState.screenFlashColor === null
    );
    if (this.openingDialogVisible && sourceMapVisibleDuringEvent) {
      this.pendingNpcAnimationPasses += sourcePaintClock.passes;
      this.pendingSkillAttachedVisualPasses += sourcePaintClock.passes;
    }
    if (simulationDelta === 0 && !this.openingDialogVisible) return;
    if (simulationDelta > 0) {
      this.updateDamageNumberPopups(simulationDelta);
      this.advanceSourceWeaponProcFeedback(simulationDelta);
    }
    const updateMapId = this.currentMapId;
    if (simulationDelta > 0 && this.gameOverSequence !== null) {
      const advanced = advanceGameOverSequence(this.gameOverSequence, simulationDelta);
      this.gameOverSequence = advanced.sequence;
      for (const revealWidth of advanced.revealWidths) this.renderGameOverScreen(revealWidth);
      if (advanced.completed) this.gameOverReturnPending = true;
      return;
    }
    if (simulationDelta > 0 && this.hudState.hp <= 0) {
      this.beginGameOver();
      return;
    }
    if (simulationDelta > 0) this.advanceEnemyDeathLifecycle(simulationDelta);
    if (simulationDelta > 0 && this.hudState.hp <= 0) {
      this.beginGameOver();
      return;
    }
    if (sourceActorDelta > 0) this.advancePlayerCombat(sourceActorDelta);
    const frameStartActor = this.actor;
    const npcWorldUpdates = Math.floor(
      (this.actor.tickRemainderMs + sourceActorDelta) / WORLD_UPDATE_PERIOD_MS,
    );
    const fullWorldUpdates = Math.floor(
      (this.actor.tickRemainderMs + simulationDelta) / WORLD_UPDATE_PERIOD_MS,
    );
    for (let update = 0; update < fullWorldUpdates; update += 1) this.advancePickupNotice();
    const occupiedCellIndices = this.maps.get(this.currentMapId)?.occupiedCellIndices;
    let remainingActorDelta = sourceActorDelta;
    while (remainingActorDelta > 0) {
      const previousActor = this.actor;
      const timeToWorldUpdate = WORLD_UPDATE_PERIOD_MS - previousActor.tickRemainderMs;
      const stepDelta = Math.min(remainingActorDelta, timeToWorldUpdate);
      const completedWorldUpdate = stepDelta >= timeToWorldUpdate;
      if (completedWorldUpdate) this.advancePlayerStatus();
      const advanceCutsceneOnThisWorldUpdate = this.openingDialogVisible &&
        this.openingCutsceneState !== null && (
          this.openingCutsceneState.status === 'running' ||
          this.openingCutsceneState.status === 'delay' ||
          this.openingCutsceneState.status === 'flash' ||
          this.openingCutsceneState.status === 'shake' ||
          this.openingCutsceneState.cameraMoveSpeed !== 0
        );
      this.actor = advanceActor(this.world, previousActor, stepDelta, occupiedCellIndices);
      remainingActorDelta -= stepDelta;
      if (!this.openingDialogVisible && didReachMapEventBoundary(previousActor, this.actor)) {
        this.tryMapTransition();
      }
      if (this.loadingMapTransition || this.currentMapId !== updateMapId) return;

      if (completedWorldUpdate) {
        const activeMap = this.maps.get(this.currentMapId);
        if (activeMap !== undefined && this.advancePlayerSkillActionTick(activeMap)) {
          activeMap.occupiedCellIndices = this.mapEntityOccupancy(activeMap);
        }
      }
      if (completedWorldUpdate && advanceCutsceneOnThisWorldUpdate) {
        this.pumpOpeningCutscene(WORLD_UPDATE_PERIOD_MS);
        if (this.loadingMapTransition || this.currentMapId !== updateMapId) return;
      }
    }
    if (this.world === null || this.heroContainer === null) return;
    this.updateHeroSprite();
    const hitFeedback = consumePlayerHitRenderOffset(this.playerHitFeedback);
    this.playerHitFeedback = hitFeedback.state;
    this.heroContainer.setPosition(
      this.actor.x + 8 + hitFeedback.offset.x,
      this.actor.y + 8 + hitFeedback.offset.y,
    );
    this.heroContainer.setDepth(this.actor.y + 8);
    this.syncPlayerAttachedSkillVisualSprites();
    this.syncPlayerStatusDisplay();
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined) return;
    // `ar.paint` renders NPCs once per paced gameplay pass. World-update
    // boundaries provide that cadence while Phaser may draw several times
    // between source passes, so apply these cursor steps after the next draw.
    if (!this.openingDialogVisible) this.pendingNpcAnimationPasses += npcWorldUpdates;
    this.advanceNpcSpriteMotion(currentMap, npcWorldUpdates);
    const maxScrollX = Math.max(0, currentMap.width - this.scale.width);
    const maxScrollY = Math.max(0, currentMap.height - (this.scale.height - 21));
    const cutsceneCamera = this.openingDialogVisible ? this.openingCutsceneState : null;
    const mapShake = this.sourceCameraShakeOffset ?? { x: 0, y: 0 };
    const sourceMapFixedCamera = this.currentMapId === 13 || this.currentMapId === 15;
    const eventCameraFocusAction = sourceEventCameraFocusAction(
      this.gameOptions.camera,
      cutsceneCamera !== null,
      cutsceneCamera?.cameraSnapPending ?? false,
    );
    if (sourceMapFixedCamera && cutsceneCamera?.cameraMode !== 'fixed') {
      // ad.f6b is set on maps 13 and 15. Their renderer always reads the live
      // m.f270a/m.b target and places it 30 pixels lower, regardless of br.d.
      const mapCameraTargetActor = cutsceneCamera === null && this.gameOptions.camera &&
        this.currentMapId === updateMapId
        ? { ...this.actor, x: frameStartActor.x, y: frameStartActor.y }
        : this.actor;
      this.eventCameraBaseScroll = null;
      const fixedMapCameraTarget = sourceFixedMapCameraScrollTarget(
        mapCameraTargetActor,
        currentMap.width,
        currentMap.height,
        this.scale.width,
        this.scale.height,
      );
      this.sourceCameraBaseScroll = fixedMapCameraTarget;
      if (cutsceneCamera?.cameraSnapPending) {
        this.openingCutsceneState = { ...cutsceneCamera, cameraSnapPending: false };
      }
      this.cameras.main.setScroll(
        fixedMapCameraTarget.x + (cutsceneCamera?.screenShakeX ?? 0) + mapShake.x,
        fixedMapCameraTarget.y + (cutsceneCamera?.screenShakeY ?? 0) + mapShake.y,
      );
    } else if (!sourceMapFixedCamera && cutsceneCamera !== null &&
      (eventCameraFocusAction === 'hold-focus' || eventCameraFocusAction === 'snap-to-target')) {
      // Mode 4 calls ag.m12b(), which updates m.f270a/m.b. Camera-On map
      // rendering reads m.c/m.d instead, and mode 4 does not run m.a() to
      // ease those display coordinates. Opcode 34 is the one source command
      // that explicitly copies the hero target into m.c/m.d.
      this.eventCameraBaseScroll = null;
      if (eventCameraFocusAction === 'snap-to-target') {
        this.sourceCameraBaseScroll = sourceCameraScrollTarget(
          this.actor,
          currentMap.width,
          currentMap.height,
          this.scale.width,
          this.scale.height,
          false,
        );
        this.openingCutsceneState = { ...cutsceneCamera, cameraSnapPending: false };
      } else if (this.sourceCameraBaseScroll === null) {
        this.sourceCameraBaseScroll = {
          x: this.cameras.main.scrollX,
          y: this.cameras.main.scrollY,
        };
      }
      this.cameras.main.setScroll(
        this.sourceCameraBaseScroll.x + (cutsceneCamera.screenShakeX ?? 0) + mapShake.x,
        this.sourceCameraBaseScroll.y + (cutsceneCamera.screenShakeY ?? 0) + mapShake.y,
      );
    } else if (cutsceneCamera?.cameraMode === 'fixed') {
      if (this.eventCameraBaseScroll === null) {
        this.eventCameraBaseScroll = {
          x: this.cameras.main.scrollX,
          y: this.cameras.main.scrollY,
        };
      }
      const position = cutsceneCamera.cameraPositionTile;
      const absoluteTarget = position === null ? null : sourceMapFixedCamera
        ? sourceFixedMapCameraScrollTarget(
          { ...this.actor, x: position.x * 16, y: position.y * 16 },
          currentMap.width,
          currentMap.height,
          this.scale.width,
          this.scale.height,
        )
        : sourceCameraScrollTarget(
          { ...this.actor, x: position.x * 16, y: position.y * 16 },
          currentMap.width,
          currentMap.height,
          this.scale.width,
          this.scale.height,
          false,
        );
      const baseScrollX = absoluteTarget?.x ?? this.eventCameraBaseScroll.x;
      const baseScrollY = absoluteTarget?.y ?? this.eventCameraBaseScroll.y;
      const fixedScrollX = Phaser.Math.Clamp(
        baseScrollX + cutsceneCamera.cameraPanX + cutsceneCamera.screenShakeX,
        0,
        maxScrollX,
      );
      const fixedScrollY = Phaser.Math.Clamp(
        baseScrollY + cutsceneCamera.cameraPanY + cutsceneCamera.screenShakeY,
        0,
        maxScrollY,
      );
      this.sourceCameraBaseScroll = { x: fixedScrollX, y: fixedScrollY };
      this.cameras.main.setScroll(
        fixedScrollX + mapShake.x,
        fixedScrollY + mapShake.y,
      );
    } else {
      this.eventCameraBaseScroll = null;
      const cameraTargetActor = this.gameOptions.camera && this.currentMapId === updateMapId
        ? { ...this.actor, x: frameStartActor.x, y: frameStartActor.y }
        : this.actor;
      const cameraTarget = sourceCameraScrollTarget(
        cameraTargetActor,
        currentMap.width,
        currentMap.height,
        this.scale.width,
        this.scale.height,
        this.gameOptions.camera,
      );
      const targetScrollX = Phaser.Math.Clamp(
        cameraTarget.x + (cutsceneCamera?.screenShakeX ?? 0),
        0,
        maxScrollX,
      );
      const targetScrollY = Phaser.Math.Clamp(
        cameraTarget.y + (cutsceneCamera?.screenShakeY ?? 0),
        0,
        maxScrollY,
      );
      if (this.gameOptions.camera) {
        if (this.sourceCameraBaseScroll === null) {
          this.sourceCameraBaseScroll = {
            x: this.cameras.main.scrollX,
            y: this.cameras.main.scrollY,
          };
        }
        const followAxes = sourceCameraFollowAxes(this.actor.direction);
        // The source runs this integer easing once in each paced gameplay paint;
        // apply it at the corresponding 71 ms world-update boundaries here.
        for (let update = 0; update < npcWorldUpdates; update += 1) {
          if (followAxes.horizontal) {
            this.sourceCameraBaseScroll.x = Phaser.Math.Clamp(
              advanceSourceCameraScroll(this.sourceCameraBaseScroll.x, targetScrollX),
              0,
              maxScrollX,
            );
          }
          if (followAxes.vertical) {
            this.sourceCameraBaseScroll.y = Phaser.Math.Clamp(
              advanceSourceCameraScroll(this.sourceCameraBaseScroll.y, targetScrollY),
              0,
              maxScrollY,
            );
          }
        }
        this.cameras.main.setScroll(
          this.sourceCameraBaseScroll.x + mapShake.x,
          this.sourceCameraBaseScroll.y + mapShake.y,
        );
      } else {
        this.sourceCameraBaseScroll = { x: targetScrollX, y: targetScrollY };
        this.cameras.main.setScroll(targetScrollX + mapShake.x, targetScrollY + mapShake.y);
      }
    }
    this.sourceCameraShakeOffset = null;
  }

  private beginGameOver(): void {
    this.gameOverSequence = beginGameOverSequence();
    this.pressedDirections = [];
    this.actor = {
      ...this.actor,
      moving: false,
      stopAfterTile: false,
      queuedDirection: null,
    };
    this.updateHeroSprite();
  }

  private renderGameOverScreen(revealWidth: number): void {
    if (this.gameOverCanvas === null || this.gameOverContext === null) {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 320;
      const context = canvas.getContext('2d');
      if (context === null) return;
      context.imageSmoothingEnabled = false;
      if (this.textures.exists('world-game-over')) this.textures.remove('world-game-over');
      const texture = this.textures.addCanvas('world-game-over', canvas);
      if (texture === null) return;
      this.gameOverCanvas = canvas;
      this.gameOverContext = context;
      this.gameOverTexture = texture;
      this.gameOverOverlay = this.add.image(0, 0, texture)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(100000);
      this.heroContainer?.setPosition(120, 180).setScrollFactor(0).setDepth(100001);
    }

    const context = this.gameOverContext;
    if (context === null || this.fontLayout === null || this.gameOverTexture === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 240, 320);
    const fontAtlas = this.textures.get('world-font-atlas').getSourceImage() as CanvasImageSource;
    const text = 'G A M E  O V E R';
    const textX = 120 - bitmapTextWidth(text, this.fontLayout) / 2;
    context.save();
    context.beginPath();
    context.rect(textX, 0, revealWidth, 320);
    context.clip();
    drawBitmapText(context, fontAtlas, this.fontLayout, text, textX + 1, 141, '#808080', 'left');
    drawBitmapText(context, fontAtlas, this.fontLayout, text, textX, 140, '#ffffff', 'left');
    context.restore();
    this.gameOverTexture.refresh();
  }

  private advancePlayerSkillActionTick(map: RenderedWorld): boolean {
    map.playerSkillVisuals = map.playerSkillVisuals.flatMap((visual) => {
      const nextFrame = visual.frameIndex + 1;
      return nextFrame >= playerSkillEffectFrameCount(visual.effectType)
        ? []
        : [{ ...visual, frameIndex: nextFrame }];
    });
    const step = advancePlayerSkillAction(
      this.playerSkillAction,
      WORLD_UPDATE_PERIOD_MS,
      (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      () => this.randomStreams.entity.nextInt(),
      { tileX: this.actor.x >> 4, tileY: this.actor.y >> 4 },
    );
    this.playerSkillAction = step.state;
    if (step.cameraShakeOffset !== undefined) {
      this.sourceCameraShakeOffset = step.cameraShakeOffset;
    }
    for (const visual of step.visualSpawns) this.addPlayerSkillVisual(map, visual);
    for (const visual of step.attachedVisualSpawns) {
      this.addPlayerAttachedSkillVisual(visual, { kind: 'player' });
    }
    if (this.playerSkillAction.skillId !== null) {
      this.playerSkillActionStates.set(this.playerSkillAction.skillId, this.playerSkillAction);
    }
    let occupancyChanged = false;
    if (step.statusEffectsCleared) {
      this.playerStatus = retainPlayerStatusEffects(this.playerStatus, []);
      this.syncPlayerStatusDisplay();
    }
    this.syncPlayerStatusDisplay();
    for (const effect of step.restoreEffects) {
      if (effect.resource === 'hp') {
        this.hudState.hp = restoreSkillResource(
          this.hudState.hp, this.hudState.maxHp, effect.percent,
        );
      } else {
        this.hudState.sp = restoreSkillResource(
          this.hudState.sp, this.hudState.maxSp, effect.percent,
        );
      }
    }
    if (step.restoreEffects.length > 0) this.refreshGameplayHud();
    for (const pulse of step.damagePulses) {
      const target = findEnemyOccupyingSourceCell(map.enemies, pulse.tileX, pulse.tileY);
      if (target === undefined) continue;
      const result = applySourceSkillDamage(
        map.enemies,
        target.sourceOrder,
        pulse.power,
        pulse.elementCode,
      );
      map.enemies = result.combatants;
      if (result.kind !== 'hit') continue;
      map.enemies = map.enemies.map((enemy) => enemy.sourceOrder === result.target.sourceOrder
        ? beginEnemyDamageReaction(enemy, this.playerSkillAction.facing)
        : enemy);
      this.showDamageNumber(result.target.tileX, result.target.tileY, result.damage);
      if (target.state === 'alive' && result.target.state === 'death-pending') {
        this.rewardDefeatedEnemy(map, result.target);
        occupancyChanged = true;
      }
    }
    for (const cell of step.instantKillCells) {
      const target = findEnemyOccupyingSourceCell(map.enemies, cell.tileX, cell.tileY);
      const skillId = this.playerSkillAction.skillId;
      const attachedVisual = sourceInstantKillAttachedVisualSpawn(
        skillId,
        target === undefined
          ? undefined
          : { sourceAu: target.sourceAu, elementCode: target.definition.elementCode },
      );
      if (attachedVisual === null) {
        this.addPlayerSkillVisual(map, {
          effectType: 10,
          skillId: skillId ?? 3,
          levelSlot: 2,
          tileX: cell.tileX,
          tileY: cell.tileY,
        });
      } else if (target !== undefined) {
        this.addEnemyAttachedSkillVisual(map, attachedVisual, target.sourceOrder);
      }
      if (target === undefined) continue;
      const result = applySourceInstantKillDamage(
        map.enemies,
        target.sourceOrder,
        cell.elementCode,
      );
      map.enemies = result.combatants;
      if (result.kind !== 'hit') continue;
      this.showDamageNumber(result.target.tileX, result.target.tileY, result.damage);
      if (target.state === 'alive' && result.target.state === 'death-pending') {
        this.rewardDefeatedEnemy(map, result.target);
        occupancyChanged = true;
      }
    }
    return occupancyChanged;
  }

  private applyPlayerSkillCounterattack(
    map: RenderedWorld,
    attacker: EnemyCombatant,
  ): EnemyCombatant {
    if (this.playerSkillAction.counterattackBoostTicksRemaining <= 0) return attacker;
    const power = (this.playerSkillAction.skillRank * 2) + 40 + this.playerSkillAction.skillPowerStat;
    const result = applySourceCounterDamage([attacker], attacker.sourceOrder, power);
    if (result.kind !== 'hit') return attacker;
    this.showDamageNumber(result.target.tileX, result.target.tileY, result.damage);
    if (attacker.state === 'alive' && result.target.state === 'death-pending') {
      this.rewardDefeatedEnemy(map, result.target);
    }
    return result.target;
  }

  private recordSourcePlayerHit(direction: Direction | undefined): void {
    // `n` initializes actors facing south; source `an.a(...)` records the
    // attacker-facing direction and applies its offset on the next paint.
    this.playerHitFeedback = recordPlayerHitFeedback(
      this.playerHitFeedback,
      direction ?? 2,
    );
  }

  private advanceEnemyDeathLifecycle(elapsedMs: number): void {
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined) return;
    currentMap.enemyUpdateRemainderMs += elapsedMs;
    let occupancyChanged = false;
    while (currentMap.enemyUpdateRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
      currentMap.enemyUpdateRemainderMs -= WORLD_UPDATE_PERIOD_MS;
      this.advanceGroundDrops(currentMap);
      occupancyChanged = this.advanceEnemyAttackEntities(currentMap) || occupancyChanged;
      this.pendingSkillAttachedVisualPasses += 1;

      const cadence = advanceEnemyRespawnCadence(currentMap.respawnCadenceTicks);
      currentMap.respawnCadenceTicks = cadence.ticksRemaining;
      if (cadence.shouldAdvanceTimers) {
        currentMap.enemies = currentMap.enemies.map((enemy) => {
          if (enemy.state !== 'respawn-wait') return enemy;
          const waitingEnemy = advanceEnemyRespawnDelay(enemy);
          if ((waitingEnemy.respawnDelayRemaining ?? 0) >= 0) return waitingEnemy;
          const placement = findEnemyRespawnPlacement(waitingEnemy, {
            collision: currentMap.world.collision,
            occupiedCellIndices: currentMap.occupiedCellIndices,
            playerTileX: this.actor.x >> 4,
            playerTileY: this.actor.y >> 4,
          }, (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum));
          if (placement === undefined) {
            return { ...waitingEnemy, respawnDelayRemaining: 0 };
          }
          const revived = respawnEnemy(waitingEnemy, placement.tileX, placement.tileY);
          const sprite = currentMap.enemySprites.get(revived.sourceOrder);
          sprite?.setPosition(
            revived.tileX * 16 + enemyFootprintWidth(revived) * 8,
            revived.tileY * 16 + 14 + (revived.sourceRenderOffsetY ?? 0),
          ).setDepth(revived.tileY * 16 + 14 + (revived.sourceRenderOffsetY ?? 0)).setVisible(true);
          occupancyChanged = true;
          return revived;
        });
      }

      currentMap.enemies = currentMap.enemies.map((enemy) => {
        const tick = advanceSourceEnemyStatuses(
          enemy,
          (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
        );
        if (tick.poisonDamage > 0) {
          this.showDamageNumber(tick.enemy.tileX, tick.enemy.tileY, tick.poisonDamage);
        }
        if (enemy.state === 'alive' && tick.enemy.state === 'death-pending') {
          this.rewardDefeatedEnemy(currentMap, tick.enemy);
          occupancyChanged = true;
        }
        return tick.enemy;
      });

      const previous = currentMap.enemies.map((enemy) =>
        shouldPauseSourceEnemyBrainOffscreen(
          enemy,
          this.actor.x >> 4,
          this.actor.y >> 4,
        ) ? enemy : advanceEnemyDamageReaction(enemy));
      let pursuitEnemies = [...previous];
      for (let index = 0; index < pursuitEnemies.length; index += 1) {
        const enemy = pursuitEnemies[index];
        if (enemy.state !== 'alive') continue;
        if (shouldPauseSourceEnemyBrainOffscreen(
          enemy,
          this.actor.x >> 4,
          this.actor.y >> 4,
        )) continue;
        if (sourceEnemyActionIsBlocked(enemy) && !sourceCustomEnemyActionContinuesWhileBlocked(enemy)) {
          pursuitEnemies[index] = enemy.sourceMap13Ai !== undefined
            ? resetMap13GroupActionWhileBlocked(enemy)
            : enemy.sourceAqAi !== undefined
              ? resetMap13AqActionWhileBlocked(enemy)
              : enemy.sourceMap15Ai !== undefined
                ? resetMap15ActionWhileBlocked(enemy)
                : resetSourceEnemyActionWhileBlocked(enemy);
          continue;
        }
        const occupiedCellIndices = this.mapEntityOccupancy(currentMap, pursuitEnemies);
        if (enemy.sourceCbAi !== undefined) {
          const bossTick = advanceMap11CbAiTick(enemy, {
            collision: currentMap.world.collision,
            occupiedCellIndices,
            playerTileX: this.actor.x >> 4,
            playerTileY: this.actor.y >> 4,
            randomInteger: (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
          });
          pursuitEnemies[index] = bossTick.enemy;
          if (bossTick.enemy.pixelX !== enemy.pixelX || bossTick.enemy.pixelY !== enemy.pixelY) {
            occupancyChanged = true;
          }
          if (bossTick.immediateHitPower !== undefined && this.hudState.hp > 0 &&
            !this.playerSkillAction.damageImmunityActive) {
            const counteredBoss = this.applyPlayerSkillCounterattack(currentMap, bossTick.enemy);
            pursuitEnemies[index] = counteredBoss;
            if (bossTick.enemy.state === 'alive' && counteredBoss.state === 'death-pending') {
              occupancyChanged = true;
            }
            const attackSource = {
              ...counteredBoss,
              definition: { ...counteredBoss.definition, attack: bossTick.immediateHitPower },
            };
            const defenseProfile = this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level);
            const defense = resolveEnemyMeleeDefense(
              attackSource,
              {
                ...defenseProfile,
                doubleDefense: defenseProfile.doubleDefense ||
                  this.playerSkillAction.defenseBoostTicksRemaining > 0,
              },
              (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
            );
            if (!defense.evaded) {
              this.recordSourcePlayerHit(bossTick.enemy.animationDirection);
              this.hudState.hp = Math.max(0, this.hudState.hp - defense.damage);
              this.refreshGameplayHud();
              this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -defense.damage, 'hero');
            }
          }
          for (const direction of bossTick.projectileDirections ?? []) {
            currentMap.enemyProjectiles.push(beginEnemyProjectile(
              currentMap.nextEnemyAttackVisualId++,
              enemy.sourceOrder,
              bossTick.enemy.renderSpriteId ?? bossTick.enemy.spriteId ?? enemy.enemyId,
              bossTick.enemy.tileX,
              bossTick.enemy.tileY,
              direction,
            ));
          }
          continue;
        }
        if (enemy.sourceAqAi !== undefined) {
          const bossTick = advanceMap13AqAiTick(enemy, {
            playerTileX: this.actor.x >> 4,
            playerTileY: this.actor.y >> 4,
            rawRandomInteger: () => this.randomStreams.entity.nextInt(),
          });
          pursuitEnemies[index] = bossTick.enemy;
          for (const projectile of bossTick.projectileSpawns ?? []) {
            currentMap.enemyProjectiles.push(beginEnemyProjectileAtCell(
              currentMap.nextEnemyAttackVisualId++,
              enemy.sourceOrder,
              bossTick.enemy.renderSpriteId ?? bossTick.enemy.spriteId ?? enemy.enemyId,
              projectile.tileX,
              projectile.tileY,
              projectile.direction,
              projectile.remainingSegments,
            ));
          }
          continue;
        }
        if (enemy.sourceMap13Ai !== undefined) {
          const bossTick = advanceMap13GroupAiTick(enemy, {
            enemies: pursuitEnemies,
            playerTileX: this.actor.x >> 4,
            playerTileY: this.actor.y >> 4,
          });
          pursuitEnemies[index] = bossTick.enemy;
          if (bossTick.companionUpdate !== undefined) {
            const companionIndex = pursuitEnemies.findIndex(({ sourceOrder }) =>
              sourceOrder === bossTick.companionUpdate!.sourceOrder);
            if (companionIndex >= 0) pursuitEnemies[companionIndex] = bossTick.companionUpdate;
          }
          for (const projectile of bossTick.projectileSpawns ?? []) {
            currentMap.enemyProjectiles.push(beginEnemyProjectileAtCell(
              currentMap.nextEnemyAttackVisualId++,
              enemy.sourceOrder,
              bossTick.enemy.renderSpriteId ?? enemy.enemyId,
              projectile.tileX,
              projectile.tileY,
              projectile.direction,
              projectile.remainingSegments,
            ));
          }
          for (const effect of bossTick.effectSpawns ?? []) {
            currentMap.enemyAttackAnimations.push({
              id: currentMap.nextEnemyAttackVisualId++,
              spriteId: bossTick.enemy.renderSpriteId ?? enemy.enemyId,
              tileX: effect.tileX,
              tileY: effect.tileY,
              frameIndex: 0,
            });
          }
          for (const effect of bossTick.attachedEffectSpawns ?? []) {
            currentMap.enemyAttackAnimations.push({
              id: currentMap.nextEnemyAttackVisualId++,
              spriteId: MAP13_CC_RENDER_SPRITE_ID,
              tileX: effect.tileX,
              tileY: effect.tileY,
              frameIndex: 0,
              attachedSourceOrder: effect.sourceOrder,
            });
          }
          if (bossTick.immediateHitPower !== undefined && this.hudState.hp > 0 &&
            !this.playerSkillAction.damageImmunityActive) {
            const counteredBoss = this.applyPlayerSkillCounterattack(currentMap, bossTick.enemy);
            pursuitEnemies[index] = counteredBoss;
            if (bossTick.enemy.state === 'alive' && counteredBoss.state === 'death-pending') {
              occupancyChanged = true;
            }
            const attackSource = {
              ...counteredBoss,
              definition: { ...counteredBoss.definition, attack: bossTick.immediateHitPower },
            };
            const defenseProfile = this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level);
            const defense = resolveEnemyMeleeDefense(
              attackSource,
              {
                ...defenseProfile,
                doubleDefense: defenseProfile.doubleDefense ||
                  this.playerSkillAction.defenseBoostTicksRemaining > 0,
              },
              (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
            );
            if (!defense.evaded) {
              this.recordSourcePlayerHit(bossTick.enemy.animationDirection);
              this.hudState.hp = Math.max(0, this.hudState.hp - defense.damage);
              this.refreshGameplayHud();
              this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -defense.damage, 'hero');
            }
          }
          continue;
        }
        if (enemy.sourceMap15Ai !== undefined) {
          const spriteId = enemy.renderSpriteId ?? enemy.spriteId ?? enemy.enemyId;
          const animation = this.bossAnimations.get(spriteId);
          if (animation === undefined) continue;
          const idleTrack = findBossSpriteTrack(animation, 0, 1);
          const walkTrack = enemy.sourceMap15Ai.role === 'cf'
            ? findBossSpriteTrack(animation, 1, 1)
            : idleTrack;
          const playerTileX = this.actor.x >> 4;
          const playerTileY = this.actor.y >> 4;
          const sourceTick = enemy.sourceMap15Ai.role === 'cf'
            ? advanceMap15HazardAiTick(enemy, {
              playerTileX,
              playerTileY,
              playerOccupiedCellIndices: actorOccupiedCellIndices(
                this.actor,
                currentMap.world.collision.width,
              ),
              mapWidth: currentMap.world.collision.width,
              idleFrameCount: idleTrack.frameCount,
              walkFrameCount: walkTrack.frameCount,
              attackFrameCount: findBossSpriteTrack(animation, 3, 2).frameCount,
            })
            : advanceMap15AttackerAiTick(enemy, {
              playerTileX,
              playerTileY,
              rawRandomInteger: () => this.randomStreams.entity.nextInt(),
              idleFrameCount: idleTrack.frameCount,
              walkFrameCount: walkTrack.frameCount,
              attackFrameCountForDirection: (direction) =>
                findBossSpriteTrack(animation, 3, direction).frameCount,
            });
          pursuitEnemies[index] = sourceTick.enemy;
          if (sourceTick.cameraShakeOffset !== undefined) {
            this.sourceCameraShakeOffset = sourceTick.cameraShakeOffset;
          }
          if (sourceTick.occupancyChanged === true ||
            sourceTick.enemy.pixelY !== enemy.pixelY) occupancyChanged = true;
          if (sourceTick.immediateHitPower !== undefined && this.hudState.hp > 0 &&
            !this.playerSkillAction.damageImmunityActive) {
            if (sourceTick.knockbackDirection !== undefined && sourceTick.knockbackPixels !== undefined) {
              this.actor = displaceActorFromSourceHit(
                this.actor,
                sourceTick.knockbackDirection,
                sourceTick.knockbackPixels,
              );
            }
            const counteredBoss = this.applyPlayerSkillCounterattack(currentMap, sourceTick.enemy);
            pursuitEnemies[index] = counteredBoss;
            if (sourceTick.enemy.state === 'alive' && counteredBoss.state === 'death-pending') {
              occupancyChanged = true;
            }
            const attackSource = {
              ...counteredBoss,
              definition: { ...counteredBoss.definition, attack: sourceTick.immediateHitPower },
            };
            const defenseProfile = this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level);
            const defense = resolveEnemyMeleeDefense(
              attackSource,
              {
                ...defenseProfile,
                doubleDefense: defenseProfile.doubleDefense ||
                  this.playerSkillAction.defenseBoostTicksRemaining > 0,
              },
              (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
            );
            if (!defense.evaded) {
              this.recordSourcePlayerHit(sourceTick.enemy.animationDirection);
              this.hudState.hp = Math.max(0, this.hudState.hp - defense.damage);
              this.refreshGameplayHud();
              this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -defense.damage, 'hero');
            }
          }
          continue;
        }
        if (enemy.directTypeZeroMarkerOnRemoval !== undefined) continue;
        const animation = this.enemyAnimations.get(enemy.spriteId ?? enemy.enemyId);
        const attackTrack = animation === undefined
          ? undefined
          : findEnemySpriteTrack(animation, 2, enemy.animationDirection ?? 2);
        const moved = advanceEnemyBehaviorTick(enemy, {
          collision: currentMap.world.collision,
          occupiedCellIndices,
          playerTileX: this.actor.x >> 4,
          playerTileY: this.actor.y >> 4,
          playerAction: {
            tileX: this.playerSkillAction.tileX,
            tileY: this.playerSkillAction.tileY,
            phase: this.playerSkillAction.phase,
            needsActorTargetReselection: sourceActionNeedsActorTargetReselection(this.playerSkillAction),
          },
          randomInteger: (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
          rawRandomInteger: () => this.randomStreams.entity.nextInt(),
        }, attackTrack?.frameCount);
        if (moved.pixelX !== enemy.pixelX || moved.pixelY !== enemy.pixelY) occupancyChanged = true;
        pursuitEnemies[index] = moved;
      }
      pursuitEnemies = pursuitEnemies.map(enterMap15SourceDeathState);
      const advancedSprites = pursuitEnemies.map((pursued) => {
        const persistentMap15Corpse = pursued.state === 'death-pending' &&
          pursued.sourceBehavior === 'map15-cf';
        const ordinaryDeathPose = pursued.state === 'death-pending' &&
          usesOrdinarySourceEnemyUpdate(pursued);
        const sourceAuDeathPose = pursued.state === 'death-pending' && pursued.sourceAu === true;
        if (pursued.state !== 'alive' && !persistentMap15Corpse && !ordinaryDeathPose &&
          !sourceAuDeathPose) return pursued;
        const renderSpriteId = pursued.renderSpriteId ?? pursued.spriteId ?? pursued.enemyId;
        const bossAnimation = this.bossAnimations.get(renderSpriteId);
        if (bossAnimation !== undefined) {
          const track = findBossSpriteTrack(
            bossAnimation,
            enemyRenderAnimationState(pursued, bossAnimation) as BossSpriteState,
            pursued.animationDirection ?? 2,
          );
          return {
            ...pursued,
            animationFrameIndex: persistentMap15Corpse
              ? Math.min((pursued.animationFrameIndex ?? -1) + 1, track.frameCount - 1)
              : advanceBossSpriteFrame(pursued.animationFrameIndex ?? -1, track),
          };
        }
        const animation = this.enemyAnimations.get(renderSpriteId);
        if (animation === undefined) return pursued;
        const renderState = ordinaryDeathPose || sourceAuDeathPose
          ? 0
          : pursued.animationStateIndex ?? 0;
        const track = findEnemySpriteTrack(animation, renderState as 0 | 1 | 2, pursued.animationDirection ?? 2);
        return {
          ...pursued,
          animationFrameIndex: advanceEnemySpriteFrame(pursued.animationFrameIndex ?? -1, track),
        };
      });
      const playerTileX = this.actor.x >> 4;
      const playerTileY = this.actor.y >> 4;
      const attackChecked = advancedSprites.map((enemy) => {
        if (enemy.sourceCbAi !== undefined || enemy.sourceAqAi !== undefined ||
          enemy.sourceMap13Ai !== undefined || enemy.sourceMap15Ai !== undefined) return enemy;
        if (shouldPauseSourceEnemyBrainOffscreen(
          enemy,
          playerTileX,
          playerTileY,
        )) return enemy;
        const consumed = consumeEnemyAttackImpactFrame(
          enemy,
          enemyAttackImpactFrame(enemy.enemyId),
        );
        const behaviorType = consumed.definition.behaviorType;
        const reachesPlayer = behaviorType >= 2
          ? enemyHasPlayerWithinFacingRange(consumed, playerTileX, playerTileY, 3)
          : enemyFacesPlayer(consumed, playerTileX, playerTileY);
        if (consumed === enemy || !reachesPlayer ||
          this.hudState.hp <= 0) return consumed;
        if (behaviorType === 3) {
          if (this.enemyAttackEffects.has(consumed.enemyId)) {
            currentMap.enemyProjectiles.push(beginEnemyProjectile(
              currentMap.nextEnemyAttackVisualId++,
              consumed.sourceOrder,
              consumed.enemyId,
              consumed.tileX,
              consumed.tileY,
              consumed.animationDirection ?? 2,
            ));
          }
          return consumed;
        }
        if (behaviorType === 2 && this.enemyAttackEffects.has(consumed.enemyId)) {
          currentMap.enemyAttackAnimations.push({
            id: currentMap.nextEnemyAttackVisualId++,
            spriteId: consumed.enemyId,
            tileX: playerTileX,
            tileY: playerTileY,
            frameIndex: 0,
          });
        }
        if (this.playerSkillAction.damageImmunityActive) return consumed;
        const countered = this.applyPlayerSkillCounterattack(currentMap, consumed);
        if (consumed.state === 'alive' && countered.state === 'death-pending') occupancyChanged = true;
        const defenseProfile = this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level);
        const result = resolveEnemyMeleeDefense(
          countered,
          {
            ...defenseProfile,
            doubleDefense: defenseProfile.doubleDefense ||
              this.playerSkillAction.defenseBoostTicksRemaining > 0,
          },
          (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
        );
        if (!result.evaded) {
          this.recordSourcePlayerHit(consumed.animationDirection);
          this.hudState.hp = Math.max(0, this.hudState.hp - result.damage);
          this.refreshGameplayHud();
          this.showDamageNumber(playerTileX, playerTileY, -result.damage, 'hero');
          if (enemyHitAppliesPoison(
            consumed.definition.behaviorType,
            result.evaded,
            (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
          )) {
            this.playerStatus = applyPlayerPoison(this.playerStatus);
            this.syncPlayerStatusDisplay();
          }
        }
        return countered;
      });
      const defeatedSourceOrders = new Set(attackChecked.flatMap((enemy) =>
        enemy.state === 'death-pending' && enemy.enemyId === 36 &&
          enemy.sourceGroupId !== undefined
          ? [enemy.sourceOrder]
          : []));
      const withBossGroupDeaths = removeSourceMap13BossCompanions(
        attackChecked,
        defeatedSourceOrders,
      );
      const defeatedMap15HazardOrders = new Set(withBossGroupDeaths.flatMap((enemy) =>
        enemy.state === 'death-pending' && enemy.sourceBehavior === 'map15-cf'
          ? [enemy.sourceOrder]
          : []));
      const withMap15CompanionDeaths = removeSourceMap15HazardCompanions(
        withBossGroupDeaths,
        defeatedMap15HazardOrders,
      );
      if (withMap15CompanionDeaths.some((enemy, index) =>
        enemy.state !== withBossGroupDeaths[index]?.state)) occupancyChanged = true;
      const withMap15DeathTicks = withMap15CompanionDeaths.map(advanceMap15HazardDeathTick);
      for (let index = 0; index < withMap15DeathTicks.length; index += 1) {
        const prior = withMap15CompanionDeaths[index];
        const settled = withMap15DeathTicks[index];
        if (prior.sourceMap15Ai?.role !== 'cf' || settled.sourceMap15Ai?.role !== 'cf' ||
          prior.sourceMap15Ai.collisionSettled || !settled.sourceMap15Ai.collisionSettled) continue;
        currentMap.world = {
          ...currentMap.world,
          collision: applyDynamicCollisionChanges(
            currentMap.world.collision,
            sourceMap15HazardCollisionWrites(settled),
          ),
        };
        this.world = currentMap.world;
      }
      const next = withMap15DeathTicks.map((enemy) =>
        shouldPauseSourceEnemyBrainOffscreen(
          enemy,
          playerTileX,
          playerTileY,
        ) ? enemy : advanceEnemyDeathTick([enemy])[0] ?? enemy);
      let automaticEnemyRemovalEventStarted = false;
      let sourceMap13WaveEvents: EventOperationData | undefined;
      for (let index = 0; index < next.length; index += 1) {
        const prior = previous[index];
        const defeatedEnemy = next[index];
        for (const effect of sourceMap13AfDeathEffectSpawns(
          defeatedEnemy,
          defeatedEnemy.deathUpdatesRemaining,
          (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
        )) {
          currentMap.enemyAttackAnimations.push({
            id: currentMap.nextEnemyAttackVisualId++,
            spriteId: MAP13_CC_RENDER_SPRITE_ID,
            tileX: effect.tileX,
            tileY: effect.tileY,
            frameIndex: 0,
          });
        }
        if (prior.state !== defeatedEnemy.state && defeatedEnemy.state === 'removed') {
          currentMap.enemySprites.get(defeatedEnemy.sourceOrder)?.setVisible(false);
          occupancyChanged = true;
        }
        if (prior.state === 'death-pending' &&
          (defeatedEnemy.state === 'respawn-wait' || defeatedEnemy.state === 'removed')) {
          currentMap.enemySprites.get(defeatedEnemy.sourceOrder)?.setVisible(false);
          occupancyChanged = true;
          if (defeatedEnemy.sourceAqAi !== undefined) {
            sourceMap13WaveEvents = addSourceMap13SecondWaveEnemies(currentMap.events);
          }
          if (defeatedEnemy.directTypeZeroMarkerOnRemoval !== undefined) {
            automaticEnemyRemovalEventStarted = this.tryTypeZeroMarker(
              currentMap,
              defeatedEnemy.directTypeZeroMarkerOnRemoval,
            ) || automaticEnemyRemovalEventStarted;
          }
        }
      }
      if (sourceMap13WaveEvents !== undefined && sourceMap13WaveEvents !== currentMap.events) {
        const previousPlacements = currentMap.events.enemyPlacements.length;
        const additions = sourceMap13WaveEvents.enemyPlacements.slice(previousPlacements);
        currentMap.events = sourceMap13WaveEvents;
        const spawnedEnemies = createEnemyCombatants(additions, this.enemyDataTable!);
        next.push(...spawnedEnemies);
        for (const enemy of spawnedEnemies) this.addSourceEnemySprite(currentMap, enemy);
        occupancyChanged = true;
      }
      currentMap.enemies = next;
      this.syncEnemySpritePositions(currentMap);
      this.syncEnemyAttackSprites(currentMap);
      if (this.hudState.hp <= 0 || automaticEnemyRemovalEventStarted) break;
    }
    if (occupancyChanged) {
      currentMap.occupiedCellIndices = this.mapEntityOccupancy(currentMap);
    }
  }

  private advanceEnemyAttackEntities(map: RenderedWorld): boolean {
    let occupancyChanged = false;
    map.enemyAttackAnimations = map.enemyAttackAnimations.flatMap((animation) => {
      if (animation.attachedSourceOrder !== undefined && !map.enemies.some((enemy) =>
        enemy.sourceOrder === animation.attachedSourceOrder &&
        (enemy.state === 'alive' || enemy.state === 'death-pending'))) return [];
      const effect = this.attackEffectForSprite(animation.spriteId);
      if (effect === undefined) return [];
      const advanced = advanceEnemyAttackEffect(animation, effect.frameCount);
      return advanced === undefined ? [] : [advanced];
    });

    const projectiles: EnemyProjectile[] = [];
    const spawned: EnemyProjectile[] = [];
    for (const projectile of map.enemyProjectiles) {
      const effect = this.attackEffectForSprite(projectile.spriteId);
      if (effect === undefined) continue;
      const result = advanceEnemyProjectileTick(
        projectile,
        effect.frameCount,
        this.actor.x >> 4,
        this.actor.y >> 4,
        map.world.map.width,
        map.world.map.height,
        map.nextEnemyAttackVisualId,
      );
      if (result.projectile !== undefined) projectiles.push(result.projectile);
      if (result.spawned !== undefined) {
        spawned.push(result.spawned);
        map.nextEnemyAttackVisualId += 1;
      }
      if (!result.hitPlayer || this.hudState.hp <= 0) continue;
      const attacker = map.enemies.find(({ sourceOrder }) => sourceOrder === projectile.sourceOrder);
      if (attacker === undefined) continue;
      if (this.playerSkillAction.damageImmunityActive) continue;
      const counteredAttacker = this.applyPlayerSkillCounterattack(map, attacker);
      if (counteredAttacker !== attacker) {
        map.enemies = map.enemies.map((enemy) => enemy.sourceOrder === attacker.sourceOrder
          ? counteredAttacker
          : enemy);
      }
      const defenseProfile = this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level);
      const defense = resolveEnemyMeleeDefense(
        counteredAttacker,
        {
          ...defenseProfile,
          doubleDefense: defenseProfile.doubleDefense ||
            this.playerSkillAction.defenseBoostTicksRemaining > 0,
        },
        (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      );
      if (!defense.evaded) {
        this.recordSourcePlayerHit(projectile.direction);
        this.hudState.hp = Math.max(0, this.hudState.hp - defense.damage);
        this.refreshGameplayHud();
        this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -defense.damage, 'hero');
      }
    }
    const playerProjectiles: SourceClassEightProjectile[] = [];
    const spawnedPlayerProjectiles: SourceClassEightProjectile[] = [];
    for (const projectile of map.playerProjectiles) {
      const result = advanceSourceClassEightProjectileTick(
        projectile,
        map.world.map.width,
        map.world.map.height,
        map.nextPlayerProjectileId,
      );
      if (result.projectile !== undefined) playerProjectiles.push(result.projectile);
      if (result.spawned !== undefined) {
        spawnedPlayerProjectiles.push(result.spawned);
        map.nextPlayerProjectileId += 1;
      }
      if (result.hitCell === undefined) continue;
      const target = findEnemyOccupyingSourceCell(
        map.enemies,
        result.hitCell.tileX,
        result.hitCell.tileY,
      );
      if (target === undefined) continue;
      const attack = resolveBasicAttack(
        map.enemies,
        target.sourceOrder,
        {
          ...projectile.attackProfile,
          attackElement: sourcePlayerSkillElement(this.playerSkillAction.skillId),
        },
        this.randomStreams.range.nextSourceRange(0, 99),
        projectile.critical,
        projectile.procCode,
      );
      map.enemies = attack.combatants;
      if (attack.kind !== 'hit') continue;
      map.enemies = attack.combatants.map((enemy) => enemy.sourceOrder === attack.target.sourceOrder
        ? beginEnemyDamageReaction(enemy, projectile.direction)
        : enemy);
      this.applyPlayerWeaponProcCosts(attack.playerHpCost, attack.playerSpCost);
      this.showDamageNumber(attack.target.tileX, attack.target.tileY, attack.damage);
      if (target.state === 'alive' && attack.target.state === 'death-pending') {
        this.rewardDefeatedEnemy(map, attack.target);
        occupancyChanged = true;
      }
    }
    map.playerProjectiles = [...playerProjectiles, ...spawnedPlayerProjectiles];
    map.enemyProjectiles = [...projectiles, ...spawned];
    this.syncEnemyAttackSprites(map);
    return occupancyChanged;
  }

  private createGroundDropSprite(map: RenderedWorld, drop: GroundDrop): void {
    const texture = drop.kind === 'currency' ? 'world-ground-currency' : 'world-ground-item';
    const sprite = this.add.image(drop.tileX * 16 + 8, drop.tileY * 16 + 8, texture)
      .setOrigin(0.5)
      .setDepth(drop.tileY * 16 + 8);
    sprite.setVisible(isGroundDropVisible(drop));
    map.groundDropSprites.set(drop.id, sprite);
    map.objects.push(sprite);
  }

  private advanceGroundDrops(map: RenderedWorld): void {
    map.groundDrops = advanceGroundDropTicks(map.groundDrops);
    const activeIds = new Set(map.groundDrops.map((drop) => drop.id));
    for (const [id, sprite] of map.groundDropSprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        map.groundDropSprites.delete(id);
        map.objects = map.objects.filter((object) => object !== sprite);
      }
    }
    for (const drop of map.groundDrops) {
      map.groundDropSprites.get(drop.id)?.setVisible(isGroundDropVisible(drop));
    }
  }

  private tryPickupGroundDrop(): boolean {
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return false;
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined) return false;
    const result = pickupGroundDrop(
      currentMap.groundDrops,
      this.actor.x >> 4,
      this.actor.y >> 4,
      this.inventory,
      this.wallet,
      (category, itemId) => {
        const definition = this.equipmentDataTable === null
          ? undefined
          : findEquipmentItem(this.equipmentDataTable, category, itemId);
        return definition === undefined
          ? undefined
          : createSourceEquipmentInventoryState(
            definition,
            (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
            'ground-pickup',
          );
      },
      this.specialInventory,
    );
    if (result.pickedUp === null) {
      if (result.status === 'no-space') {
        this.showPickupNotice(this.commerceText(2375, 'no space'));
      }
      return false;
    }
    currentMap.groundDrops = result.drops;
    this.inventory = result.inventory;
    this.specialInventory = result.specialInventory;
    this.wallet = result.wallet;
    const sprite = currentMap.groundDropSprites.get(result.pickedUp.id);
    if (sprite !== undefined) {
      sprite.destroy();
      currentMap.groundDropSprites.delete(result.pickedUp.id);
      currentMap.objects = currentMap.objects.filter((object) => object !== sprite);
    }
    this.hudState.selectedItemCount = selectedConsumableCount(
      this.inventory,
      this.hudState.selectedItemCategory,
    );
    this.refreshGameplayHud();
    if (result.pickedUp.kind === 'currency') {
      const amount = result.pickedUp.sourceAmount > 0
        ? result.pickedUp.sourceAmount * 9 : result.pickedUp.sourceAmount;
      this.showPickupNotice(`${this.commerceText(2330, 'Gain')} ${amount} ${this.commerceText(2376, 'G')}`);
    } else {
      const categoryName = this.itemCategoryNames[result.pickedUp.category] ?? 'Item';
      this.showPickupNotice(`${this.commerceText(2330, 'Gain')} ${categoryName}`);
    }
    return true;
  }

  private showPickupNotice(text: string): void {
    if (this.fontLayout === null) return;
    if (this.pickupNoticeCanvas === null || this.pickupNoticeContext === null ||
      this.pickupNoticeTexture === null || this.pickupNoticeOverlay === null) {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 320;
      const context = canvas.getContext('2d');
      if (context === null) return;
      context.imageSmoothingEnabled = false;
      if (this.textures.exists('world-pickup-notice')) this.textures.remove('world-pickup-notice');
      const texture = this.textures.addCanvas('world-pickup-notice', canvas);
      if (texture === null) return;
      this.pickupNoticeCanvas = canvas;
      this.pickupNoticeContext = context;
      this.pickupNoticeTexture = texture;
      this.pickupNoticeOverlay = this.add.image(0, 0, texture)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(50001);
    }
    this.pickupNoticeText = text;
    this.pickupNoticeTicksRemaining = 16;
    this.renderPickupNotice();
  }

  private advancePickupNotice(): void {
    if (this.pickupNoticeTicksRemaining <= 0) return;
    this.pickupNoticeTicksRemaining -= 1;
    if (this.pickupNoticeTicksRemaining === 0) {
      this.pickupNoticeText = '';
      this.pickupNoticeOverlay?.setVisible(false);
      this.pickupNoticeContext?.clearRect(0, 0, 240, 320);
      this.pickupNoticeTexture?.refresh();
    }
  }

  private renderPickupNotice(): void {
    const context = this.pickupNoticeContext;
    const texture = this.pickupNoticeTexture;
    if (context === null || texture === null || this.fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    const x = 70;
    const y = 274;
    const width = 100;
    const height = 23;
    const color = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
    context.fillStyle = color(6233919);
    context.fillRect(x + 2, y + 2, width - 4, height - 4);
    context.fillStyle = color(4136767);
    context.fillRect(x + 1, y, width - 2, 1);
    context.fillRect(x, y + 1, 1, height - 2);
    context.fillRect(x + 1, y + height - 1, width - 2, 1);
    context.fillRect(x + width - 1, y + 1, 1, height - 1);
    context.fillStyle = color(10452799);
    context.fillRect(x + 1, y + 1, width - 4, 1);
    context.fillRect(x + 1, y + 1, 1, height - 4);
    context.fillStyle = color(4144959);
    context.fillRect(x + width - 2, y + 1, 1, height - 3);
    context.fillRect(x + 1, y + height - 2, width - 3, 1);
    const fontAtlas = this.textures.get('world-font-atlas').getSourceImage() as CanvasImageSource;
    drawBitmapText(context, fontAtlas, this.fontLayout, this.pickupNoticeText,
      x + width / 2, y + 3, '#ffffff', 'center');
    texture.refresh();
    this.pickupNoticeOverlay?.setVisible(true);
  }

  private cycleSelectedItem(): void {
    this.hudState.selectedItemCategory = nextConsumableCategory(this.hudState.selectedItemCategory);
    this.hudState.selectedItemCount = selectedConsumableCount(
      this.inventory,
      this.hudState.selectedItemCategory,
    );
    this.refreshGameplayHud();
  }

  private useSelectedItem(): void {
    const result = useSelectedConsumable(
      this.inventory,
      this.hudState,
      this.playerStatus.effects,
      this.hudState.hp > 0 && this.gameOverSequence === null,
    );
    if (!result.used) return;
    this.inventory = result.inventory;
    this.playerStatus = retainPlayerStatusEffects(this.playerStatus, result.statusEffects, {
      deferPoisonRemoval: result.state.selectedItemCategory === 10,
    });
    this.hudState = { ...this.hudState, ...result.state };
    this.refreshGameplayHud();
    this.syncPlayerStatusDisplay();
  }

  private advancePlayerStatus(): void {
    const result = advancePlayerStatusTick(
      this.playerStatus,
      this.hudState.hp,
      this.hudState.maxHp,
    );
    this.playerStatus = result.state;
    if (result.hpLoss > 0) {
      this.hudState.hp = result.hp;
      this.refreshGameplayHud();
    }
    if (result.poisonPulse) {
      this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -result.damageNumber, 'hero');
    }
    this.syncPlayerStatusDisplay();
  }

  private syncPlayerStatusDisplay(): void {
    const activeIds = new Set<number>();
    if (this.playerSkillAction.comboPowerBoostTicksRemaining > 0) activeIds.add(5);
    if (this.playerSkillAction.defenseBoostTicksRemaining > 0) activeIds.add(6);
    if (this.playerStatus.effects.includes(7)) activeIds.add(7);
    const ordered = this.playerStatusMarkerOrder.filter((statusId) => activeIds.has(statusId));
    for (const statusId of [5, 6, 7]) {
      if (activeIds.has(statusId) && !ordered.includes(statusId)) ordered.push(statusId);
    }
    this.playerStatusMarkerOrder = ordered;

    const container = this.playerStatusContainer;
    if (container === null) return;
    container.setPosition(this.actor.x + 8, this.actor.y + 1)
      .setDepth(this.actor.y + 9)
      .setVisible(ordered.length > 0);
    for (const [statusId, marker] of this.playerStatusMarkerContainers) {
      const index = ordered.indexOf(statusId);
      marker.setVisible(index >= 0);
      if (index < 0) continue;
      marker.setX(sourcePlayerStatusMarkerHorizontalOffset(index, ordered.length));
      const elapsedTicks = statusId === 5
        ? 140 - this.playerSkillAction.comboPowerBoostTicksRemaining
        : statusId === 6
          ? 160 - this.playerSkillAction.defenseBoostTicksRemaining
          : this.playerStatus.poisonTicksElapsed ?? 0;
      this.playerStatusMarkerIcons.get(statusId)?.setPosition(
        0,
        -29 + sourcePlayerStatusMarkerBlinkOffset(elapsedTicks),
      );
    }
  }

  private rewardDefeatedEnemy(map: RenderedWorld, enemy: EnemyCombatant): void {
    const drops = rollEnemyDrops({
      tileX: enemy.tileX,
      tileY: enemy.tileY,
      definition: enemy.definition,
    }, this.hudState.level, {
      between: (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
    });
    for (const drop of drops) {
      const groundDrop: GroundDrop = {
        ...drop,
        id: map.nextGroundDropId++,
        ticksRemaining: GROUND_DROP_LIFETIME_TICKS,
      };
      map.groundDrops.push(groundDrop);
      this.createGroundDropSprite(map, groundDrop);
    }
    this.awardPlayerExperience(enemyExperienceSourceAmount(
      this.hudState.level,
      enemy.definition.experienceRewardCode,
    ));
    this.recalculateEquipmentStats();
  }

  private applyPlayerWeaponProcCosts(hpCost: number, spCost: number): void {
    if (hpCost <= 0 && spCost <= 0) return;
    if (hpCost > 0) this.hudState.hp = Math.max(0, this.hudState.hp - hpCost);
    if (spCost > 0) this.hudState.sp = Math.max(0, this.hudState.sp - spCost);
    this.refreshGameplayHud();
    if (hpCost > 0) this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, -hpCost, 'hero');
  }

  private awardPlayerExperience(sourceAmount: number): void {
    const previousLevel = this.hudState.level;
    this.hudState = awardSourceExperience(this.hudState, sourceAmount);
    for (let level = previousLevel; level < this.hudState.level; level += 1) {
      this.addPlayerLevelUpFlash();
    }
    this.playerSkillAction = awardPlayerSkillExperience(this.playerSkillAction, sourceAmount);
    const skillId = this.playerSkillAction.skillId;
    if (skillId !== null) this.playerSkillActionStates.set(skillId, this.playerSkillAction);
  }

  private addPlayerLevelUpFlash(): void {
    if (this.heroContainer === null || !this.textures.exists('world-player-level-up-flash')) return;
    const sprite = this.add.image(0, 5, 'world-player-level-up-flash')
      .setOrigin(0.5, 1);
    this.heroContainer.add(sprite);
    this.playerLevelUpFlashes.push({
      animation: createSourcePlayerLevelUpFlash(this.pendingNpcAnimationPasses),
      sprite,
    });
    const effect = this.playerLevelUpEffect;
    if (effect === null) return;
    const components: ActiveSourcePlayerLevelUpAtlasEffect['components'] = [];
    for (let frameIndex = 0;
      frameIndex < Math.min(effect.frameCount, SOURCE_PLAYER_LEVEL_UP_ATLAS_FRAME_COUNT);
      frameIndex += 1) {
      for (const component of effect.frames[frameIndex] ?? []) {
        if (component.sourceAtlasId !== 13) continue;
        const textureKey = `world-player-level-up-atlas-${component.imageIndex}`;
        if (!this.textures.exists(textureKey)) continue;
        const image = this.add.image(component.offsetX, component.offsetY, textureKey)
          .setOrigin(0, 0)
          .setVisible(frameIndex === 0);
        this.heroContainer.add(image);
        components.push({ frameIndex, sprite: image });
      }
    }
    if (components.length === 0) return;
    this.playerLevelUpAtlasEffects.push({
      animation: createSourcePlayerLevelUpAtlasAnimation(this.pendingNpcAnimationPasses),
      components,
    });
  }

  private advancePlayerLevelUpFlashes(sourcePaintPasses: number): void {
    const hero = this.heroContainer;
    const playerPainted = hero !== null && hero.visible &&
      this.cameras.main.worldView.contains(hero.x, hero.y);
    for (let index = this.playerLevelUpFlashes.length - 1; index >= 0; index -= 1) {
      const flash = this.playerLevelUpFlashes[index];
      if (flash === undefined) continue;
      const next = advanceSourcePlayerLevelUpFlash(
        flash.animation,
        sourcePaintPasses,
        playerPainted,
      );
      if (next === null) {
        flash.sprite.destroy();
        this.playerLevelUpFlashes.splice(index, 1);
        continue;
      }
      flash.animation = next;
      flash.sprite.setVisible(sourcePlayerLevelUpFlashIsVisible(next.frameIndex));
    }
    for (let index = this.playerLevelUpAtlasEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.playerLevelUpAtlasEffects[index];
      if (effect === undefined) continue;
      const next = advanceSourcePlayerLevelUpAtlasAnimation(
        effect.animation,
        sourcePaintPasses,
        playerPainted,
      );
      if (next === null) {
        for (const component of effect.components) component.sprite.destroy();
        this.playerLevelUpAtlasEffects.splice(index, 1);
        continue;
      }
      effect.animation = next;
      for (const component of effect.components) {
        component.sprite.setVisible(component.frameIndex === next.frameIndex);
      }
    }
  }

  private activeEnemyPlacements(enemies: readonly EnemyCombatant[]): DynamicEnemyPlacement[] {
    // `az`/`aj` constructors clear their `f14a` cells and never reinsert them.
    return enemies
      .filter((enemy) => (enemy.state === 'alive' || enemy.state === 'death-pending') &&
        enemy.sourceBehavior !== 'map15-az' && enemy.sourceBehavior !== 'map15-aj')
      .flatMap((enemy) => {
        const footprintWidth = enemyFootprintWidth(enemy);
        const placements: DynamicEnemyPlacement[] = [{
          sourceOrder: enemy.sourceOrder,
          tileX: enemy.tileX,
          tileY: enemy.tileY,
          footprintWidth,
        }];
        if (enemy.sourceBehavior?.startsWith('map15-') && enemy.pixelY % 16 !== 0) {
          placements.push({
            sourceOrder: enemy.sourceOrder,
            tileX: enemy.tileX,
            tileY: enemy.tileY + 1,
            footprintWidth,
          });
        }
        const hazardRow = enemy.sourceMap15Ai?.role === 'cf'
          ? enemy.sourceMap15Ai.hazardRow
          : null;
        if (hazardRow !== null && hazardRow !== undefined) {
          placements.push({
            sourceOrder: enemy.sourceOrder,
            tileX: 6,
            tileY: hazardRow,
            footprintWidth: 4,
          });
        }
        return placements;
      });
  }

  private activeNpcPlacements(map: RenderedWorld): DynamicNpcPlacement[] {
    const tileCenter = map.world.map.tileSize / 2;
    return map.events.npcPlacements.map((placement) => {
      const sprite = map.npcSprites.get(placement.sourceOrder);
      return {
        sourceOrder: placement.sourceOrder,
        pixelX: sprite === undefined
          ? placement.tileX * map.world.map.tileSize
          : Math.round(sprite.container.x - tileCenter),
        pixelY: sprite === undefined
          ? placement.tileY * map.world.map.tileSize
          : Math.round(sprite.container.y - tileCenter),
        occupiesCells: sprite === undefined || sprite.stateIndex === 0,
      };
    });
  }

  private mapEntityOccupancy(
    map: RenderedWorld,
    enemies: readonly EnemyCombatant[] = map.enemies,
  ): ReadonlySet<number> {
    return createEntityOccupancy(
      map.events,
      map.world.map.width,
      map.world.map.height,
      map.visibleNpcSourceOrders,
      undefined,
      this.activeEnemyPlacements(enemies),
      this.activeNpcPlacements(map),
    );
  }

  private setMapObjectsVisible(map: RenderedWorld, visible: boolean): void {
    map.objects.forEach((object) => object.setVisible(visible));
    for (const [sourceOrder, sprite] of map.npcSprites) {
      sprite.container.setVisible(visible && map.visibleNpcSourceOrders.has(sourceOrder));
    }
  }

  private syncEnemySpritePositions(map: RenderedWorld): void {
    for (const enemy of map.enemies) {
      const sprite = map.enemySprites.get(enemy.sourceOrder);
      if (sprite === undefined) continue;
      const widthOffset = enemyFootprintWidth(enemy) * 8;
      const baseY = enemy.pixelY + 14;
      const offset = enemyDamageReactionOffset(enemy);
      const renderY = baseY + (enemy.sourceRenderOffsetY ?? 0) + offset.y;
      sprite.setPosition(
        enemy.pixelX + widthOffset + offset.x,
        renderY,
      ).setDepth(renderY);
      this.syncEnemyStatusDisplay(
        map,
        enemy,
        enemy.pixelX + widthOffset + offset.x,
        renderY - 30 - (enemy.definition.classCode * 3),
        renderY + 1,
      );
      const ordinaryDeathPose = enemy.state === 'death-pending' &&
        usesOrdinarySourceEnemyUpdate(enemy);
      const sourceAuDeathPose = enemy.state === 'death-pending' && enemy.sourceAu === true;
      if (enemy.state === 'alive' || ordinaryDeathPose || sourceAuDeathPose ||
        (enemy.state === 'death-pending' && enemy.sourceBehavior === 'map15-cf')) {
        const spriteId = enemy.renderSpriteId ?? enemy.spriteId ?? enemy.enemyId;
        this.setEnemySpriteFrame(
          sprite,
          spriteId,
          map.enemyTextureKeys.get(spriteId),
          enemyRenderAnimationState(enemy, this.bossAnimations.get(spriteId)),
          enemy.animationDirection ?? 2,
          enemy.animationFrameIndex ?? -1,
        );
      }
    }
    this.syncEnemyAttachedSkillVisualSprites(map);
  }

  private syncEnemyStatusDisplay(
    map: RenderedWorld,
    enemy: EnemyCombatant,
    x: number,
    y: number,
    depth: number,
  ): void {
    const effects = enemy.state === 'removed' || enemy.state === 'respawn-wait'
      ? []
      : enemy.sourceStatusEffects ?? [];
    let display = map.enemyStatusDisplays.get(enemy.sourceOrder);
    if (display === undefined) {
      if (effects.length === 0) return;
      const container = this.add.container(x, y).setDepth(depth);
      display = { container, signature: '', icons: new Map() };
      map.enemyStatusDisplays.set(enemy.sourceOrder, display);
      map.objects.push(container);
    }
    display.container.setPosition(x, y).setDepth(depth);
    const signature = effects.map(({ id }) => id).join(',');
    if (signature !== display.signature) {
      display.container.removeAll(true);
      display.icons.clear();
      for (const [index, effect] of effects.entries()) {
        const horizontalOffset = (6 * (effects.length - 1)) - (12 * index);
        const background = this.add.image(horizontalOffset, 0, 'world-player-status-background')
          .setOrigin(0.5, 0);
        const icon = this.add.image(horizontalOffset, 1, `world-enemy-status-${effect.id}`)
          .setOrigin(0.5, 0);
        display.container.add([background, icon]);
        display.icons.set(effect.id, icon);
      }
      display.signature = signature;
    }
    display.container.setVisible(effects.length > 0);
    for (const effect of effects) {
      display.icons.get(effect.id)?.setY(1 + (effect.ticksElapsed % 2));
    }
  }

  private addSourceEnemySprite(map: RenderedWorld, enemy: EnemyCombatant): void {
    const spriteId = enemy.renderSpriteId ?? enemy.spriteId ?? enemy.enemyId;
    const textureSet = map.enemyTextureKeys.get(spriteId);
    if (textureSet === undefined || !this.bossAnimations.has(spriteId)) {
      throw new Error(`Source boss animation ${spriteId} was not queued for this map`);
    }
    const widthOffset = enemyFootprintWidth(enemy) * 8;
    const y = enemy.tileY * 16 + 14 + (enemy.sourceRenderOffsetY ?? 0);
    const sprite = this.add.container(enemy.tileX * 16 + widthOffset, y).setDepth(y);
    this.setEnemySpriteFrame(
      sprite,
      spriteId,
      textureSet,
      enemyRenderAnimationState(enemy),
      enemy.animationDirection ?? 2,
      enemy.animationFrameIndex ?? 0,
    );
    map.enemySprites.set(enemy.sourceOrder, sprite);
    map.objects.push(sprite);
  }

  /** Resolve current/ahead triggers after the actor reaches or stops at a tile boundary. */
  private tryMapTransition(): void {
    if (this.openingDialogVisible || this.worldDialogueVisible) return;
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined || this.actor.moving ||
      this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return;
    if (this.tryCurrentCellAutomaticEvent(currentMap)) return;
    const directionDelta: Record<Direction, { x: number; y: number }> = {
      1: { x: 0, y: -1 },
      2: { x: 0, y: 1 },
      3: { x: -1, y: 0 },
      4: { x: 1, y: 0 },
    };
    const tileX = this.actor.x >> 4;
    const tileY = this.actor.y >> 4;
    const delta = directionDelta[this.actor.direction];
    const targetX = (this.actor.x >> 4) + delta.x;
    const targetY = (this.actor.y >> 4) + delta.y;
    const marker = currentMap.world.collision.values[targetY]?.[targetX];
    if (marker === undefined || marker === 0 || marker === -128) return;

    // P1M-R04 reaches this source type-3 trigger after New Game; flag 0 is
    // inferred from the observed transition and the trigger's packed predicate.
    const selection = resolveTriggerScript(
      currentMap.events, marker, 3, this.gameFlags, this.questFlags, this.inventory,
    );
    if (selection !== undefined && canRunEventCutscene(
      selection.commands,
      currentMap.events.npcPlacements.length,
      { width: currentMap.world.map.width, height: currentMap.world.map.height },
      this.equipmentDataTable ?? undefined,
      currentMap.decorationObjectCount,
    )) {
      this.startOrderedEventCutscene(selection, currentMap.events);
      return;
    }
    const destination = resolveMapTransition(
      currentMap.events,
      marker,
      3,
      this.gameFlags,
      this.questFlags,
      { inventory: this.inventory },
    );
    this.transitionToMap(destination);
  }

  /** Dispatch a type-0 event on the actor's current cell. */
  private tryCurrentCellAutomaticEvent(currentMap: RenderedWorld): boolean {
    if (this.openingDialogVisible || this.worldDialogueVisible || this.actor.moving ||
      this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return false;
    const tileX = this.actor.x >> 4;
    const tileY = this.actor.y >> 4;
    const marker = currentMap.world.collision.values[tileY]?.[tileX];
    if (marker === undefined || marker === 0 || marker === -128) return false;

    return this.tryTypeZeroMarker(currentMap, marker);
  }

  /** Dispatch source type 0 even when the marker came from an entity callback, not collision. */
  private tryTypeZeroMarker(currentMap: RenderedWorld, marker: number): boolean {
    if (this.openingDialogVisible || this.worldDialogueVisible) return false;
    const selection = resolveTriggerScript(
      currentMap.events, marker, 0, this.gameFlags, this.questFlags, this.inventory,
    );
    if (selection !== undefined && canRunEventCutscene(
      selection.commands,
      currentMap.events.npcPlacements.length,
      { width: currentMap.world.map.width, height: currentMap.world.map.height },
      this.equipmentDataTable ?? undefined,
      currentMap.decorationObjectCount,
    )) {
      this.startOrderedEventCutscene(selection, currentMap.events);
      return true;
    }

    const destination = resolveMapTransition(
      currentMap.events,
      marker,
      0,
      this.gameFlags,
      this.questFlags,
      { inventory: this.inventory },
    );
    if (destination === undefined) return false;
    this.transitionToMap(destination);
    return true;
  }

  private skipOpeningCutscene(): void {
    if (!this.openingDialogVisible) return;
    this.pumpOpeningCutscene(0, true);
  }

  private pumpOpeningCutscene(elapsedMs: number, skipWaits = false): void {
    const state = this.openingCutsceneState;
    const commands = this.openingCutsceneCommands;
    if (state === null || commands === null) return;
    const events = this.openingCutsceneEvents;
    if (events === null) return;
    this.openingCutsceneState = advanceEventCutscene(
      state,
      commands,
      (stringIndex) => {
        const line = resolveScriptDialogueString(events, stringIndex, this.worldLanguage);
        if (line === undefined || this.fontLayout === null) return [];
        return paginateBitmapDialogue(
          this.openingCutsceneUsesRoninFormatting ? formatRoninDialogue(line) : formatSourceDialogue(line),
          this.fontLayout,
          this.scale.width - 28,
          3,
        );
      },
      elapsedMs,
      skipWaits,
      (languageStringId) => {
        const line = resolveLanguageString(this.worldLanguage, languageStringId);
        if (line === undefined || this.fontLayout === null) return [];
        return paginateBitmapDialogue(
          formatSourceDialogue(line), this.fontLayout, this.scale.width - 28, 3,
        );
      },
      (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      this.equipmentDataTable ?? undefined,
    );
    const nextState = this.openingCutsceneState;
    if (nextState === null) return;
    if (nextState.status === 'dialogue' || nextState.status === 'choice') this.createOpeningDialog();
    const newHeroPositionChanges = nextState.heroPositionChanges.slice(
      this.openingCutsceneAppliedHeroPositionChangeCount,
    );
    if (newHeroPositionChanges.length > 0) {
      const position = newHeroPositionChanges[newHeroPositionChanges.length - 1];
      this.actor = {
        ...this.actor,
        x: position.tileX * 16,
        y: position.tileY * 16,
      };
      this.openingCutsceneAppliedHeroPositionChangeCount = nextState.heroPositionChanges.length;
    }
    this.syncOpeningCutscenePresentation();
    this.inventory = nextState.inventory.map((stack) => ({ ...stack }));
    this.skillIds = [...nextState.skillIds];
    this.comboLimit = nextState.comboLimit;
    const newPlayerChanges = nextState.playerChanges.slice(this.openingCutsceneAppliedPlayerChangeCount);
    let refreshHud = false;
    for (const change of newPlayerChanges) {
      if (change.kind === 'wallet') {
        this.wallet = Math.max(0, (this.wallet + change.amount) | 0);
      } else if (change.kind === 'hp') {
        this.hudState.hp = Math.min(this.hudState.maxHp, Math.max(0, this.hudState.hp + change.amount));
        refreshHud = true;
      } else if (change.kind === 'sp') {
        this.hudState.sp = Math.min(this.hudState.maxSp, Math.max(0, this.hudState.sp + change.amount));
        refreshHud = true;
      } else {
        this.awardPlayerExperience(change.amount);
        this.recalculateEquipmentStats();
        refreshHud = true;
      }
    }
    this.openingCutsceneAppliedPlayerChangeCount = nextState.playerChanges.length;
    if (refreshHud) this.refreshGameplayHud();
    const selectedCount = selectedConsumableCount(this.inventory, this.hudState.selectedItemCategory);
    if (selectedCount !== this.hudState.selectedItemCount) {
      this.hudState.selectedItemCount = selectedCount;
      this.refreshGameplayHud();
    }
    const newTileChanges = nextState.tileChanges.slice(this.openingCutsceneAppliedTileChangeCount);
    if (newTileChanges.length > 0) {
      const currentMap = this.maps.get(this.currentMapId);
      if (currentMap !== undefined) {
        currentMap.world = applyDynamicMapTileChanges(currentMap.world, newTileChanges);
        this.world = currentMap.world;
        for (const change of newTileChanges) {
          const image = currentMap.objects[change.tileY * currentMap.world.map.width + change.tileX];
          const textureKey = currentMap.tileKeys.get(change.tileId);
          if (image instanceof Phaser.GameObjects.Image && textureKey !== undefined) {
            image.setTexture(textureKey).setVisible(true);
          } else if (image instanceof Phaser.GameObjects.Image && change.tileId === 128) {
            image.setVisible(false);
          }
        }
      }
      this.openingCutsceneAppliedTileChangeCount = nextState.tileChanges.length;
    }
    const newFlagChanges = nextState.flagChanges.slice(this.openingCutsceneAppliedFlagCount);
    if (newFlagChanges.length > 0) {
      const flags = applyEventFlagChanges(
        { gameFlags: this.gameFlags, questFlags: this.questFlags },
        newFlagChanges,
      );
      this.gameFlags = flags.gameFlags;
      this.questFlags = flags.questFlags;
      this.openingCutsceneAppliedFlagCount = nextState.flagChanges.length;
    }
    if (nextState.status === 'transfer' && nextState.transition !== null) {
      this.transitionToMap({ ...nextState.transition, flagChanges: [] });
    } else if (nextState.status === 'service' && nextState.serviceRequest !== null) {
      this.openingDialogVisible = false;
      this.openingDialogOverlay?.setVisible(false);
      this.openCommerceMenu(nextState.serviceRequest);
    } else if (nextState.status === 'ending') {
      this.openingDialogVisible = false;
      this.scene.start('EndingScene', {
        heroClassId: this.heroClassId,
        newGamePlusState: prepareNextSourceCycle(this.createSaveState()),
      });
    } else if (nextState.status === 'ended') {
      this.openingDialogVisible = false;
      this.openingDialogOverlay?.setVisible(false);
      this.createGameplayHud();
    }
  }

  private startOrderedEventCutscene(
    selection: EventScriptSelection,
    events: EventOperationData,
    usesRoninFormatting = false,
  ): void {
    this.openingCutsceneCommands = selection.commands;
    this.openingCutsceneEvents = events;
    this.openingCutsceneState = createEventCutscene(
      selection.scriptIndex, this.actor.direction, this.inventory, this.skillIds, this.comboLimit,
      this.heroClassId, this.questFlags.has(29),
    );
    this.eventCameraBaseScroll = null;
    this.openingCutsceneAppliedFlagCount = 0;
    this.openingCutsceneAppliedPlayerChangeCount = 0;
    this.openingCutsceneAppliedTileChangeCount = 0;
    this.openingCutsceneAppliedHeroPositionChangeCount = 0;
    this.openingCutsceneUsesRoninFormatting = usesRoninFormatting;
    this.openingDialogVisible = true;
    this.worldDialogueVisible = false;
    this.pendingWorldDialogueFlags = [];
    this.pendingWorldDialogueTransition = undefined;
    this.pressedDirections = [];
    this.createOpeningCutsceneBlankOverlay();
    this.pumpOpeningCutscene(0);
    if (this.openingCutsceneState?.status === 'dialogue' ||
      this.openingCutsceneState?.status === 'choice') this.createOpeningDialog();
  }

  private createOpeningCutsceneBlankOverlay(): void {
    if (this.openingCutsceneBlankOverlay !== null) return;
    this.openingCutsceneBlankOverlay = this.add.rectangle(
      0, 0, this.scale.width, this.scale.height, 0x000000,
    )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(50000)
      .setVisible(this.openingCutsceneState?.screenBlank ?? false);
  }

  private syncOpeningCutscenePresentation(): void {
    const state = this.openingCutsceneState;
    if (state === null) return;
    this.actor = {
      ...this.actor,
      direction: state.heroDirection,
      moving: state.heroMoving,
      stopAfterTile: false,
      queuedDirection: null,
    };
    this.openingCutsceneBlankOverlay?.setFillStyle(
      state.screenBlank || state.screenFlashColor === 'black' ? 0x000000 : 0xffffff,
    );
    this.openingCutsceneBlankOverlay?.setVisible(
      state.screenBlank || state.screenFlashColor !== null,
    );
    this.syncEventCutsceneEmotionSprites(state);
    this.syncEventCutsceneNpcSprites(state);
    if (state.cameraMode === 'fixed') {
      if (this.eventCameraBaseScroll === null) {
        this.eventCameraBaseScroll = {
          x: this.cameras.main.scrollX,
          y: this.cameras.main.scrollY,
        };
      }
    } else {
      this.eventCameraBaseScroll = null;
    }
    const showingDialogue = state.status === 'dialogue' || state.status === 'choice';
    this.openingDialogOverlay?.setVisible(showingDialogue);
    if (showingDialogue) {
      this.openingDialoguePages = state.dialoguePages;
      this.openingDialoguePageIndex = state.dialoguePageIndex;
      this.setOpeningDialogueText(state.dialoguePages[state.dialoguePageIndex] ?? '');
      this.renderOpeningDialog();
    }
  }

  private advanceDialogue(): void {
    if (!this.openingDialogVisible && !this.worldDialogueVisible) return;
    if (this.isDialogueRevealing()) {
      this.revealDialogueImmediately();
      return;
    }
    if (this.openingDialogVisible) {
      const state = this.openingCutsceneState;
      if (state?.status === 'choice') return;
      if (state?.status !== 'dialogue') return;
      this.openingCutsceneState = advanceEventCutsceneDialogue(state);
      if (this.openingCutsceneState.status === 'dialogue') {
        this.syncOpeningCutscenePresentation();
      } else {
        this.pumpOpeningCutscene(0);
      }
      return;
    }
    if (this.openingDialoguePageIndex + 1 >= this.openingDialoguePages.length) {
      const pendingFlags = this.pendingWorldDialogueFlags;
      const pendingTransition = this.pendingWorldDialogueTransition;
      this.pendingWorldDialogueFlags = [];
      this.pendingWorldDialogueTransition = undefined;
      const transferred = pendingTransition !== undefined && this.transitionToMap({
        ...pendingTransition,
        flagChanges: pendingFlags,
      });
      if (!transferred) {
        const nextFlags = applyEventFlagChanges(
          { gameFlags: this.gameFlags, questFlags: this.questFlags },
          pendingFlags,
        );
        this.gameFlags = nextFlags.gameFlags;
        this.questFlags = nextFlags.questFlags;
        this.worldDialogueVisible = false;
        this.openingDialogOverlay?.setVisible(false);
      }
      return;
    }
    this.openingDialoguePageIndex += 1;
    this.setOpeningDialogueText(this.openingDialoguePages[this.openingDialoguePageIndex]);
    this.renderOpeningDialog();
  }

  private dispatchInteractionTrigger(): void {
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return;
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined || this.worldLanguage === null) return;
    const tileX = this.actor.x >> 4;
    const tileY = this.actor.y >> 4;
    const directionDelta: Record<Direction, { x: number; y: number }> = {
      1: { x: 0, y: -1 },
      2: { x: 0, y: 1 },
      3: { x: -1, y: 0 },
      4: { x: 1, y: 0 },
    };
    const facing = directionDelta[this.actor.direction];
    const selection = resolveInteractionScript(
      currentMap.events,
      currentMap.world.collision.values[tileY]?.[tileX],
      currentMap.world.collision.values[tileY + facing.y]?.[tileX + facing.x],
      this.gameFlags,
      this.questFlags,
      this.inventory,
    );
    if (selection === undefined) return;
    if (canRunEventCutscene(
      selection.commands,
      currentMap.events.npcPlacements.length,
      { width: currentMap.world.map.width, height: currentMap.world.map.height },
      this.equipmentDataTable ?? undefined,
      currentMap.decorationObjectCount,
    )) {
      this.startOrderedEventCutscene(selection, currentMap.events);
      return;
    }
    const effects = resolveEventScriptEffects(currentMap.events, selection.scriptIndex);
    if (effects === undefined) return;
    const sourceLines = resolveScriptDialogue(
      currentMap.events, selection.scriptIndex, this.worldLanguage,
    );
    if (sourceLines.length === 0) {
      if (effects.destination !== undefined) {
        const transferred = this.transitionToMap({
          ...effects.destination,
          scriptIndex: effects.scriptIndex,
          flagChanges: effects.flagChanges,
        });
        if (transferred) return;
      }
      const nextFlags = applyEventFlagChanges(
        { gameFlags: this.gameFlags, questFlags: this.questFlags }, effects.flagChanges,
      );
      this.gameFlags = nextFlags.gameFlags;
      this.questFlags = nextFlags.questFlags;
      return;
    }
    if (this.fontLayout === null) return;
    const pages = sourceLines.flatMap((line) => paginateBitmapDialogue(
      formatSourceDialogue(line), this.fontLayout!, this.scale.width - 28, 3,
    ));
    if (pages.length === 0) return;
    this.pendingWorldDialogueFlags = effects.flagChanges;
    this.pendingWorldDialogueTransition = effects.destination === undefined
      ? undefined
      : { ...effects.destination, scriptIndex: effects.scriptIndex, flagChanges: effects.flagChanges };
    this.openingDialoguePages = pages;
    this.openingDialoguePageIndex = 0;
    this.setOpeningDialogueText(this.openingDialoguePages[0]);
    this.worldDialogueVisible = true;
    this.createOpeningDialog();
  }

  private moveEventChoiceSelection(): void {
    const state = this.openingCutsceneState;
    if (state?.status !== 'choice') return;
    this.openingCutsceneState = {
      ...state,
      choiceSelection: state.choiceSelection === 0 ? 1 : 0,
    };
    this.syncOpeningCutscenePresentation();
  }

  private confirmEventChoice(selection?: 0 | 1): void {
    const state = this.openingCutsceneState;
    if (state?.status !== 'choice') return;
    this.openingCutsceneState = selectEventCutsceneChoice(
      state,
      selection ?? state.choiceSelection,
    );
    this.pumpOpeningCutscene(0);
    if (this.openingCutsceneState?.status === 'dialogue') this.createOpeningDialog();
  }

  /** Recreate the destination from its source data for each map entry. */
  private transitionToMap(destination: MapTransition | undefined): boolean {
    if (destination === undefined) return false;
    if (this.unavailableMapIds.has(destination.mapId)) return false;
    if (this.loadingMapTransition) return true;

    this.loadingMapTransition = true;
    const prepared = prepareMapTransition(
      { gameFlags: this.gameFlags, questFlags: this.questFlags },
      destination,
    );
    void this.loadAdditionalMap(destination.mapId, prepared.flags.gameFlags).then((map) => {
      if (!this.isValidMapEntry(prepared.destination, map)) {
        this.destroyRenderedWorld(map, destination.mapId);
        this.loadingMapTransition = false;
        return;
      }
      const previous = this.maps.get(destination.mapId);
      if (previous !== undefined) this.destroyRenderedWorld(previous, destination.mapId);
      this.maps.set(destination.mapId, map);
      this.loadingMapTransition = false;
      this.applyMapTransition(prepared);
    }).catch((error: unknown) => {
      this.loadingMapTransition = false;
      this.unavailableMapIds.add(destination.mapId);
      this.gameFlags = new Set(prepared.flags.gameFlags);
      this.questFlags = new Set(prepared.flags.questFlags);
      this.worldDialogueVisible = false;
      this.pendingWorldDialogueFlags = [];
      this.pendingWorldDialogueTransition = undefined;
      this.openingDialogOverlay?.setVisible(false);
      if (import.meta.env.DEV) console.error('Map transition load failed', error);
      this.showAssetMessage(`Map ${destination.mapId} could not be loaded.`);
    });
    return true;
  }

  private isValidMapEntry(destination: MapTransition, map: RenderedWorld): boolean {
    return Number.isInteger(destination.tileX) && Number.isInteger(destination.tileY) &&
      destination.tileX >= 0 && destination.tileY >= 0 &&
      destination.tileX < map.world.map.width && destination.tileY < map.world.map.height;
  }

  private destroyRenderedWorld(map: RenderedWorld, mapId: number): void {
    for (const object of map.objects) object.destroy();
    map.objects = [];
    this.damageNumberPopups = this.damageNumberPopups.filter((popup) => {
      if (popup.mapId !== mapId) return true;
      popup.frames.forEach((frame) => frame.destroy());
      return false;
    });
  }

  private async loadAdditionalMap(
    mapId: number,
    gameFlags: ReadonlySet<number>,
  ): Promise<RenderedWorld> {
    const paths = this.preloadedMapAssetPaths.get(mapId) ??
      resolveMapAssetPaths(mapId, this.heroClassId, this.generatedAssetPaths);
    if (paths === null) {
      throw new Error(`Map ${mapId} source resources for hero class ${this.heroClassId} are unavailable`);
    }
    const readJson = async (url: string): Promise<unknown> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Map asset request failed: ${url}`);
      return response.json() as Promise<unknown>;
    };
    const [mapValue, collisionValue, decorationValue, eventValue] = await Promise.all([
      readJson(paths.map),
      readJson(paths.collision),
      readJson(paths.decorations),
      readJson(paths.events),
    ]);
    const map = parseBaseMapData(mapValue);
    const collision = parseBaseCollisionData(collisionValue);
    const decorations = parseMapDecorationData(decorationValue);
    const events = parseEventOperationData(eventValue);
    if (decorations.tilesetId !== map.tilesetId) {
      throw new TypeError(`Map ${mapId} and its decoration tileset differ`);
    }
    const initialState = applyInitialMapEventState(
      createWorldGrid(map, collision), events, gameFlags, decorations,
    );
    const effectiveMap = initialState.world.map;
    const effectiveDecorations = initialState.decorations;
    const effectiveEvents = addSourceConstructedMapEnemies(mapId, {
      ...events,
      npcPlacements: initialState.npcPlacements,
      enemyPlacements: initialState.enemyPlacements,
    });

    const requiredTextures = new Set<string>();
    const queueImage = (key: string, path: string): void => {
      if (this.textures.exists(key) || requiredTextures.has(key)) return;
      requiredTextures.add(key);
      this.load.image(key, path);
    };
    const tileKeys = new Map<number, string>();
    const tilesetPath = `/assets/generated/atlases/m/t/t${String(effectiveMap.tilesetId).padStart(2, '0')}`;
    for (const tileId of new Set([
      ...effectiveMap.tileIds.flat(),
      ...getEventTileIds(effectiveEvents),
    ])) {
      const key = `map-${mapId}-tile-${tileId}`;
      tileKeys.set(tileId, key);
      queueImage(key, `${tilesetPath}/${String(tileId).padStart(3, '0')}.png`);
    }
    const objectKeys = new Map<number, string>();
    const objectAtlasPath = `/assets/generated/atlases/${effectiveDecorations.objectAtlas}`;
    for (const atlasIndex of new Set([
      ...effectiveDecorations.loadedImageIds,
      ...effectiveDecorations.objects.map(({ atlasIndex }) => atlasIndex),
    ])) {
      const key = `map-${mapId}-object-${atlasIndex}`;
      objectKeys.set(atlasIndex, key);
      queueImage(key, `${objectAtlasPath}/${String(atlasIndex).padStart(3, '0')}.png`);
    }
    const npcTextureKeys = this.queueNpcTextures(
      effectiveEvents,
      queueImage,
    );
    const enemyTextureKeys = this.queueEnemySpriteTextures(
      [...effectiveEvents.enemyPlacements.flatMap(({ enemyId, spriteId, renderSpriteId }) => [
        renderSpriteId ?? spriteId ?? enemyId,
        ...(renderSpriteId === undefined ? [] : [spriteId ?? enemyId]),
      ]), ...sourceMapSpawnRenderSpriteIds(mapId)],
      queueImage,
    );

    if (requiredTextures.size > 0) {
      await new Promise<void>((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });
      if ([...requiredTextures].some((key) => !this.textures.exists(key))) {
        throw new Error(`Map ${mapId} has missing image assets`);
      }
    }

    const objects = this.renderStaticMap(
      effectiveMap,
      tileKeys,
      effectiveDecorations,
      objectKeys,
      effectiveEvents,
      initialState.visibleNpcSourceOrders,
      initialState.npcEmotions,
      npcTextureKeys,
      enemyTextureKeys,
    );
    const enemies = this.enemyDataTable === null
      ? []
      : createEnemyCombatants(effectiveEvents.enemyPlacements, this.enemyDataTable);
    objects.objects.forEach((object) => object.setVisible(false));
    return {
      world: initialState.world,
      tilesetId: effectiveMap.tilesetId,
      startupHeroEmotion: initialState.heroEmotion,
      events: effectiveEvents,
      tileKeys,
      objectTextureKeys: objectKeys,
      decorationObjectCount: decorations.objects.length,
      decorationSprites: objects.decorationSprites,
      enemies,
      enemySprites: objects.enemySprites,
      enemyStatusDisplays: new Map(),
      npcSprites: objects.npcSprites,
      enemyTextureKeys,
      enemyProjectiles: [],
      enemyProjectileSprites: new Map(),
      playerProjectiles: [],
      nextPlayerProjectileId: 1,
      enemyAttackAnimations: [],
      enemyAttackSprites: new Map(),
      nextEnemyAttackVisualId: 1,
      playerSkillVisuals: [],
      playerSkillVisualSprites: new Map(),
      nextPlayerSkillVisualId: 1,
      enemyAttachedSkillVisuals: [],
      enemyAttachedSkillVisualSprites: new Map(),
      groundDrops: [],
      groundDropSprites: new Map(),
      nextGroundDropId: 1,
      enemyUpdateRemainderMs: 0,
      respawnCadenceTicks: ENEMY_RESPAWN_CADENCE_TICKS,
      visibleNpcSourceOrders: initialState.visibleNpcSourceOrders,
      occupiedCellIndices: createEntityOccupancy(
        effectiveEvents,
        map.width,
        map.height,
        initialState.visibleNpcSourceOrders,
        undefined,
        this.activeEnemyPlacements(enemies),
      ),
      width: map.width * map.tileSize,
      height: map.height * map.tileSize,
      objects: objects.objects,
    };
  }

  private applyMapTransition(transition: PreparedMapTransition): boolean {
    const { destination, flags } = transition;
    const nextMap = this.maps.get(destination.mapId);
    if (nextMap === undefined || !this.isValidMapEntry(destination, nextMap)) return false;

    nextMap.occupiedCellIndices = this.mapEntityOccupancy(nextMap);
    this.gameFlags = new Set(flags.gameFlags);
    this.questFlags = new Set(flags.questFlags);
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap !== undefined) this.setMapObjectsVisible(currentMap, false);
    this.setMapObjectsVisible(nextMap, true);
    this.currentMapId = destination.mapId;
    this.world = nextMap.world;
    this.actor = createPlayerActor(
      destination.tileX * 16,
      destination.tileY * 16,
      sourceMapTransitionDirection(destination.entryDirectionIndex),
    );
    this.applyStartupHeroEmotion(nextMap);
    this.centerCameraForMapEntry(nextMap);
    this.eventCameraBaseScroll = null;
    this.pressedDirections = [];
    this.openingDialogVisible = false;
    this.worldDialogueVisible = false;
    this.pendingWorldDialogueFlags = [];
    this.pendingWorldDialogueTransition = undefined;
    this.openingDialogOverlay?.setVisible(false);
    this.openingCutsceneBlankOverlay?.setVisible(false);
    this.createGameplayHud();
    this.tryCurrentCellAutomaticEvent(nextMap);
    return true;
  }

  /** The source centers both axes immediately when the map manager loads a map. */
  private centerCameraForMapEntry(map: RenderedWorld): void {
    const position = sourceCameraScrollTarget(
      this.actor,
      map.width,
      map.height,
      this.scale.width,
      this.scale.height,
      false,
    );
    this.cameras.main.setScroll(position.x, position.y);
    this.sourceCameraBaseScroll = position;
  }

  private createGameplayHud(): void {
    if (this.gameplayHud !== null) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.scale.width;
    canvas.height = 36;
    const context = canvas.getContext('2d');
    if (context === null) return;
    const frame = Array.from({ length: 7 }, (_, index) =>
      this.textures.get(`world-hud-frame-${index}`).getSourceImage() as CanvasImageSource,
    );
    const assets: GameplayHudAssets = {
      frame,
      digits: this.textures.get('world-hud-digits').getSourceImage() as CanvasImageSource,
      itemCategoryIcons: Object.fromEntries(CONSUMABLE_CATEGORIES.map((category) => [
        category,
        this.textures.get(`world-hud-item-category-${category}`).getSourceImage() as CanvasImageSource,
      ])) as GameplayHudAssets['itemCategoryIcons'],
      guardianSkillIcon: this.textures.get('world-hud-guardian-skill').getSourceImage() as CanvasImageSource,
    };
    this.gameplayHudContext = context;
    this.gameplayHudAssets = assets;
    drawGameplayHud(context, assets, this.hudState, this.scale.width);
    if (this.textures.exists('gameplay-hud')) this.textures.remove('gameplay-hud');
    const texture = this.textures.addCanvas('gameplay-hud', canvas);
    if (texture === null) return;
    this.gameplayHudTexture = texture;
    this.gameplayHud = this.add.image(0, this.scale.height - 36, texture)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(50000);
  }

  private refreshGameplayHud(): void {
    if (this.gameplayHudContext === null || this.gameplayHudAssets === null ||
      this.gameplayHudTexture === null) return;
    this.gameplayHudContext.clearRect(0, 0, this.scale.width, 36);
    drawGameplayHud(
      this.gameplayHudContext,
      this.gameplayHudAssets,
      this.hudState,
      this.scale.width,
    );
    this.gameplayHudTexture.refresh();
  }

  private recalculateEquipmentStats(): void {
    if (this.equipmentDataTable === null) return;
    this.equipmentStats = calculateEquipmentStats(
      this.equipmentSlots,
      this.equipmentDataTable,
      this.heroClassId,
      this.hudState.level,
      this.characterAttributes,
    );
    this.hudState.maxHp = this.equipmentStats.maxHp;
    this.hudState.maxSp = this.equipmentStats.maxSp;
    this.hudState.hp = Math.min(this.hudState.hp, this.hudState.maxHp);
    this.hudState.sp = Math.min(this.hudState.sp, this.hudState.maxSp);
    this.refreshGameplayHud();
  }

  private openInventoryMenu(): void {
    this.inventoryMenuVisible = true;
    this.inventorySelection = Math.min(this.inventorySelection, Math.max(0, this.inventory.length - 1));
    this.equipmentMenuMode = 'slots';
    this.equipmentSlotSelection = Math.min(this.equipmentSlotSelection, EQUIPMENT_SLOT_LABELS.length - 1);
    this.systemMenuMessage = '';
    this.renderInventoryMenu();
  }

  private closeInventoryMenu(): void {
    this.inventoryMenuVisible = false;
    this.systemMenuMessage = '';
    this.renderSystemMenu();
  }

  private backFromInventoryMenu(): void {
    if (this.equipmentMenuMode !== 'slots') {
      this.equipmentMenuMode = 'slots';
      this.systemMenuMessage = '';
      this.renderInventoryMenu();
      return;
    }
    this.closeInventoryMenu();
  }

  private openCompatibleEquipmentItems(): void {
    const indices = equipmentInventoryIndicesForSlot(this.inventory, this.equipmentSlotSelection, this.heroClassId);
    if (indices.length === 0) {
      this.systemMenuMessage = `No ${EQUIPMENT_SLOT_LABELS[this.equipmentSlotSelection].toLowerCase()} items in the bag.`;
      this.renderInventoryMenu();
      return;
    }
    if (!indices.includes(this.inventorySelection)) this.inventorySelection = indices[0];
    this.equipmentMenuMode = 'slot-items';
    this.systemMenuMessage = '';
    this.renderInventoryMenu();
  }

  private moveCompatibleEquipmentSelection(delta: -1 | 1): void {
    const indices = equipmentInventoryIndicesForSlot(this.inventory, this.equipmentSlotSelection, this.heroClassId);
    if (indices.length === 0) return;
    const selectedIndex = indices.indexOf(this.inventorySelection);
    const nextPosition = (Math.max(0, selectedIndex) + delta + indices.length) % indices.length;
    this.inventorySelection = indices[nextPosition];
  }

  private openAttributeMenu(): void {
    this.attributeMenuVisible = true;
    this.attributeConfirmationVisible = false;
    this.attributeConfirmationSelection = 0;
    this.attributeSelection = 0;
    this.attributeDraft = createAttributeDraft(this.hudState.attributePoints);
    this.systemMenuMessage = '';
    this.renderSystemMenu();
  }

  private closeAttributeMenu(): void {
    this.attributeMenuVisible = false;
    this.attributeConfirmationVisible = false;
    this.systemMenuMessage = '';
    this.renderSystemMenu();
  }

  private handleAttributeMenuKey(event: KeyboardEvent): void {
    if (this.attributeConfirmationVisible) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        this.attributeConfirmationSelection = this.attributeConfirmationSelection === 0 ? 1 : 0;
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (this.attributeConfirmationSelection === 0) {
          this.commitAttributeDraft();
          return;
        }
        this.attributeConfirmationVisible = false;
      } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
        this.attributeConfirmationVisible = false;
      }
      this.renderAttributeMenu();
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const delta = event.key === 'ArrowUp' ? -1 : 1;
      this.attributeSelection = (this.attributeSelection + delta + PLAYER_ATTRIBUTE_KEYS.length) %
        PLAYER_ATTRIBUTE_KEYS.length;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const attribute = PLAYER_ATTRIBUTE_KEYS[this.attributeSelection];
      this.attributeDraft = adjustAttributeDraft(this.attributeDraft, attribute, direction);
      this.systemMenuMessage = '';
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!hasAttributeDraftChanges(this.attributeDraft)) {
        this.systemMenuMessage = 'Choose an attribute point first.';
      } else {
        this.attributeConfirmationVisible = true;
        this.attributeConfirmationSelection = 0;
        this.systemMenuMessage = '';
      }
    } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
      this.closeAttributeMenu();
      return;
    }
    this.renderAttributeMenu();
  }

  private handleAttributeMenuPointer(pointer: Phaser.Input.Pointer): void {
    if (this.attributeConfirmationVisible) {
      if (pointer.y >= 174 && pointer.y <= 212) {
        this.attributeConfirmationSelection = pointer.x < 120 ? 0 : 1;
        if (pointer.x < 120) this.commitAttributeDraft();
        else {
          this.attributeConfirmationVisible = false;
          this.renderAttributeMenu();
        }
      }
      return;
    }
    const rowTop = 118;
    const rowHeight = 20;
    const row = Math.floor((pointer.y - rowTop) / rowHeight);
    if (row >= 0 && row < PLAYER_ATTRIBUTE_KEYS.length) {
      this.attributeSelection = row;
      if (pointer.x >= 184) {
        this.attributeDraft = adjustAttributeDraft(
          this.attributeDraft,
          PLAYER_ATTRIBUTE_KEYS[row],
          1,
        );
      } else if (pointer.x >= 160) {
        this.attributeDraft = adjustAttributeDraft(
          this.attributeDraft,
          PLAYER_ATTRIBUTE_KEYS[row],
          -1,
        );
      }
      this.systemMenuMessage = '';
      this.renderAttributeMenu();
      return;
    }
    if (pointer.y >= 237 && pointer.y <= 266) {
      if (pointer.x < 120) {
        if (hasAttributeDraftChanges(this.attributeDraft)) {
          this.attributeConfirmationVisible = true;
          this.attributeConfirmationSelection = 0;
          this.systemMenuMessage = '';
        } else this.systemMenuMessage = 'Choose an attribute point first.';
        this.renderAttributeMenu();
      } else this.closeAttributeMenu();
    }
  }

  private previewCharacterAttributes(): PlayerAttributes {
    return applyAttributeDraft(this.characterAttributes, this.attributeDraft);
  }

  private commitAttributeDraft(): void {
    this.characterAttributes = this.previewCharacterAttributes();
    this.hudState.attributePoints = this.attributeDraft.remainingPoints;
    this.recalculateEquipmentStats();
    this.attributeMenuVisible = false;
    this.attributeConfirmationVisible = false;
    this.systemMenuMessage = 'Attributes updated.';
    this.renderSystemMenu();
  }

  private equipInventorySelection(expectedSlot: number): void {
    const selected = this.inventory[this.inventorySelection];
    if (selected === undefined || equipmentSlotForCategory(selected.category) !== expectedSlot) {
      this.systemMenuMessage = 'Choose an item that fits this slot.';
      this.renderInventoryMenu();
      return;
    }
    if (selected.equipmentState?.sourceFlag !== true) {
      this.equipmentMenuMode = 'slots';
      this.systemMenuMessage = 'Identify this equipment before equipping it.';
      this.renderInventoryMenu();
      return;
    }
    const result = equipInventoryItem(this.inventory, this.equipmentSlots, this.inventorySelection);
    if (result === null) {
      this.systemMenuMessage = 'Select an equipment item to equip.';
      this.renderInventoryMenu();
      return;
    }
    this.updateInventory(
      result.inventory,
      result.removed === null ? undefined : this.inventorySelection,
    );
    this.equipmentSlots = result.equipment;
    this.inventorySelection = Math.min(this.inventorySelection, Math.max(0, this.inventory.length - 1));
    this.equipmentMenuMode = 'slots';
    this.equipmentSlotSelection = result.slot;
    this.recalculateEquipmentStats();
    this.hudState.selectedItemCount = selectedConsumableCount(
      this.inventory,
      this.hudState.selectedItemCategory,
    );
    this.systemMenuMessage = `${this.commerceStackName(result.equipped)} equipped.`;
    this.renderInventoryMenu();
  }

  private activateInventorySelection(): void {
    const selected = this.inventory[this.inventorySelection];
    if (selected === undefined) return;
    if (selected.category <= 6) {
      const slot = equipmentSlotForCategory(selected.category);
      if (slot !== null) {
        this.equipmentSlotSelection = slot;
        this.equipmentMenuMode = 'slots';
        this.systemMenuMessage = `Choose ${EQUIPMENT_SLOT_LABELS[slot].toLowerCase()}, then select an item.`;
      } else {
        this.systemMenuMessage = 'Choose an equipment slot first.';
      }
      this.renderInventoryMenu();
      return;
    }
    const result = useConsumableAtIndex(
      this.inventory,
      this.hudState,
      this.playerStatus.effects,
      this.inventorySelection,
      this.hudState.hp > 0 && this.gameOverSequence === null,
    );
    if (!result.used) {
      this.systemMenuMessage = 'This item cannot be used here.';
      this.renderInventoryMenu();
      return;
    }
    this.inventory = result.inventory;
    this.playerStatus = retainPlayerStatusEffects(this.playerStatus, result.statusEffects, {
      deferPoisonRemoval: result.state.selectedItemCategory === 10,
    });
    this.hudState = { ...this.hudState, ...result.state };
    this.refreshGameplayHud();
    this.syncPlayerStatusDisplay();
    this.systemMenuMessage = `${this.commerceStackName(selected)} used.`;
    this.renderInventoryMenu();
  }

  private handleInventoryMenuPointer(y: number): void {
    if (y >= 68 && y < 128 && this.equipmentMenuMode === 'slots') {
      const slot = Math.floor((y - 68) / 11);
      if (slot < 0 || slot >= EQUIPMENT_SLOT_LABELS.length) return;
      this.equipmentSlotSelection = slot;
      this.openCompatibleEquipmentItems();
      return;
    }
    if (y >= 150 && y < 246) {
      const visibleIndices = this.equipmentMenuMode === 'slot-items'
        ? equipmentInventoryIndicesForSlot(this.inventory, this.equipmentSlotSelection, this.heroClassId)
        : this.inventory.map((_, index) => index);
      const position = this.equipmentMenuMode === 'slot-items'
        ? visibleIndices.indexOf(this.inventorySelection)
        : this.inventorySelection;
      const firstVisible = Math.floor(Math.max(0, position) / 8) * 8;
      const index = visibleIndices[firstVisible + Math.floor((y - 150) / 12)];
      if (index === undefined) return;
      this.inventorySelection = index;
      if (this.equipmentMenuMode === 'slots') this.equipmentMenuMode = 'bag';
      this.activateInventorySelection();
      return;
    }
    if (y >= 250 && y <= 282) {
      if (this.equipmentMenuMode === 'slot-items') {
        this.equipmentMenuMode = 'slots';
      } else {
        this.equipmentMenuMode = this.equipmentMenuMode === 'slots' ? 'bag' : 'slots';
      }
      this.systemMenuMessage = '';
      this.renderInventoryMenu();
      return;
    }
  }

  private openSystemMenu(): void {
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0 ||
      this.openingDialogVisible || this.worldDialogueVisible || this.loadingMapTransition) return;
    this.pressedDirections = [];
    this.systemMenuSelection = 0;
    this.skillMenuVisible = false;
    this.skillLevelMenuVisible = false;
    this.inventoryMenuVisible = false;
    this.inventorySelection = 0;
    this.attributeMenuVisible = false;
    this.attributeConfirmationVisible = false;
    this.systemMenuMessage = '';
    this.systemMenuVisible = true;
    if (this.systemMenuCanvas === null || this.systemMenuContext === null) {
      this.systemMenuCanvas = document.createElement('canvas');
      this.systemMenuCanvas.width = 240;
      this.systemMenuCanvas.height = 320;
      this.systemMenuContext = this.systemMenuCanvas.getContext('2d');
      if (this.systemMenuContext === null) {
        this.systemMenuCanvas = null;
        this.systemMenuVisible = false;
        return;
      }
      this.systemMenuContext.imageSmoothingEnabled = false;
      const texture = this.textures.addCanvas('world-system-menu', this.systemMenuCanvas);
      if (texture === null) {
        this.systemMenuCanvas = null;
        this.systemMenuContext = null;
        this.systemMenuVisible = false;
        return;
      }
      this.systemMenuTexture = texture;
      this.systemMenuOverlay = this.add.image(0, 0, texture)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(100000);
    }
    this.systemMenuOverlay?.setVisible(true);
    this.renderSystemMenu();
  }

  private closeSystemMenu(): void {
    if (this.commerceMenu !== null) {
      this.closeCommerceMenu();
      return;
    }
    this.systemMenuVisible = false;
    this.skillMenuVisible = false;
    this.skillLevelMenuVisible = false;
    this.inventoryMenuVisible = false;
    this.attributeMenuVisible = false;
    this.attributeConfirmationVisible = false;
    this.systemMenuMessage = '';
    this.pressedDirections = [];
    this.systemMenuOverlay?.setVisible(false);
  }

  private openCommerceMenu(service: 'shop' | 'refiner' | 'blacksmith'): void {
    if (this.systemMenuCanvas === null || this.systemMenuContext === null) {
      this.systemMenuCanvas = document.createElement('canvas');
      this.systemMenuCanvas.width = 240;
      this.systemMenuCanvas.height = 320;
      this.systemMenuContext = this.systemMenuCanvas.getContext('2d');
      if (this.systemMenuContext === null) {
        this.systemMenuCanvas = null;
        return;
      }
      this.systemMenuContext.imageSmoothingEnabled = false;
      const texture = this.textures.addCanvas('world-system-menu', this.systemMenuCanvas);
      if (texture === null) {
        this.systemMenuCanvas = null;
        this.systemMenuContext = null;
        return;
      }
      this.systemMenuTexture = texture;
      this.systemMenuOverlay = this.add.image(0, 0, texture)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(100000);
    }
    const screen: CommerceScreen = service === 'shop'
      ? 'shop-list'
      : service === 'refiner' ? 'refiner-main' : 'blacksmith-main';
    this.commerceMenu = {
      service, screen, tab: 0, selection: 0, quantity: 1, item: null, target: null,
      selectedInventoryIndex: null,
      pendingAction: null, pendingReturn: screen, messageReturn: screen, message: '',
      selectedIngredients: [], confirmationSelection: 0,
    };
    this.systemMenuVisible = true;
    this.systemMenuSelection = 0;
    this.inventoryMenuVisible = false;
    this.pressedDirections = [];
    this.systemMenuOverlay?.setVisible(true);
    this.renderCommerceMenu();
  }

  private closeCommerceMenu(): void {
    this.commerceMenu = null;
    this.systemMenuVisible = false;
    this.inventoryMenuVisible = false;
    this.systemMenuMessage = '';
    this.pressedDirections = [];
    this.systemMenuOverlay?.setVisible(false);
    if (this.openingCutsceneState?.status === 'service') {
      this.openingCutsceneState = {
        ...this.openingCutsceneState, status: 'ended', serviceRequest: null, cameraMode: 'hero',
      };
    }
    this.refreshCommerceHud();
  }

  private commerceText(stringId: number, fallback: string): string {
    return resolveLanguageString(this.worldLanguage, stringId) ?? fallback;
  }

  private commerceItemName(reference: CommerceItemReference): string {
    const item = this.commerceCatalog === null
      ? undefined : findCommerceItem(this.commerceCatalog, reference.category, reference.itemId);
    return item === undefined
      ? reference.category + ':' + reference.itemId
      : this.commerceText(item.nameStringId, reference.category + ':' + reference.itemId);
  }

  private commerceStackName(stack: InventoryStack): string {
    if (stack.category < 7 && stack.equipmentState?.sourceFlag === false) {
      return this.commerceText(1567, 'Unidentified');
    }
    return this.commerceItemName({ category: stack.category, itemId: stack.itemId });
  }

  private commerceTargetOptions(kind: 'upgrade' | 'identify' | 'orb'): EquipmentTarget[] {
    const eligible = (stack: InventoryStack | null | undefined): boolean => {
      if (stack === null || stack === undefined || stack.category > 6 || stack.equipmentState === undefined) return false;
      if (kind === 'identify') return !stack.equipmentState.sourceFlag;
      if (kind === 'orb') return stack.category === 3 && stack.equipmentState.sourceFlag;
      return true;
    };
    const targets: EquipmentTarget[] = [];
    this.inventory.forEach((stack, index) => {
      if (eligible(stack)) targets.push({ location: 'inventory', index });
    });
    this.equipmentSlots.forEach((stack, slot) => {
      if (eligible(stack)) targets.push({ location: 'equipment', slot });
    });
    return targets;
  }

  private commerceTargetStack(target: EquipmentTarget): InventoryStack | null {
    return target.location === 'inventory'
      ? this.inventory[target.index] ?? null : this.equipmentSlots[target.slot] ?? null;
  }

  private commerceTargetLabel(target: EquipmentTarget): string {
    const stack = this.commerceTargetStack(target);
    if (stack === null) return 'Empty';
    const location = target.location === 'inventory' ? 'Bag' : 'Equipped';
    return location + ': ' + this.commerceStackName(stack) + ' +' +
      (stack.equipmentState?.upgradeByte ?? 0);
  }

  private commerceListLength(session: CommerceMenuSession): number {
    if (session.screen === 'shop-list') return this.commerceCatalog?.shopStock[session.tab]?.length ?? 0;
    if (session.screen === 'sell-list') return this.inventory.length;
    if (session.screen === 'orb-target') return this.commerceTargetOptions('orb').length;
    if (session.screen === 'orb-list') return this.inventory.filter((stack) => stack.category === 17).length;
    if (session.screen === 'upgrade-target') return this.commerceTargetOptions('upgrade').length;
    if (session.screen === 'identify-target') return this.commerceTargetOptions('identify').length;
    if (session.screen === 'mix-select') return this.inventory.filter((stack) =>
      [7, 9, 12, 13, 14, 15, 16].includes(stack.category)).length;
    if (session.screen === 'refiner-main' || session.screen === 'blacksmith-main') return 2;
    return 0;
  }

  private commerceQuantityMaximum(session: CommerceMenuSession): number {
    if (session.item === null || !isCommerceStackable(session.item.category)) return 1;
    if (session.pendingAction !== 'sell') return 99;
    const stack = session.selectedInventoryIndex === null
      ? undefined : this.inventory[session.selectedInventoryIndex];
    return stack?.category === session.item.category && stack.itemId === session.item.itemId
      ? stack.count : 1;
  }

  private showCommerceMessage(message: string, returnScreen?: CommerceScreen): void {
    const session = this.commerceMenu;
    if (session === null) return;
    session.message = message;
    session.messageReturn = returnScreen ?? session.screen;
    session.screen = 'message';
    session.selection = 0;
    this.renderCommerceMenu();
  }

  private startCommerceConfirmation(action: CommercePendingAction, returnScreen: CommerceScreen): void {
    const session = this.commerceMenu;
    if (session === null) return;
    session.pendingAction = action;
    session.pendingReturn = returnScreen;
    session.confirmationSelection = 0;
    session.screen = 'confirm';
    this.renderCommerceMenu();
  }

  private refreshCommerceHud(): void {
    this.hudState.selectedItemCount = selectedConsumableCount(
      this.inventory, this.hudState.selectedItemCategory,
    );
    this.recalculateEquipmentStats();
    this.refreshGameplayHud();
  }

  private executeCommerceAction(): void {
    const session = this.commerceMenu;
    const catalog = this.commerceCatalog;
    if (session === null || catalog === null) return;
    const action = session.pendingAction;
    if (action === 'buy' && session.item !== null && this.equipmentDataTable !== null) {
      const result = purchaseCommerceItem(
        catalog, this.equipmentDataTable, this.inventory, this.wallet,
        session.item.category, session.item.itemId, session.quantity,
        (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      );
      this.inventory = result.inventory;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      const itemName = this.commerceItemName(session.item);
      if (result.status === 'purchased') {
        this.showCommerceMessage(this.commerceText(1601, 'You bought') + ' ' + itemName + ' ' +
          this.commerceText(1602, 'the item.'), 'shop-list');
      } else if (result.status === 'not-enough-money') {
        this.showCommerceMessage(this.commerceText(1598, 'Not enough money.'), 'shop-list');
      } else if (result.status === 'inventory-full') {
        this.showCommerceMessage(this.commerceText(1599, "You can't carry") + ' ' +
          this.commerceText(1600, 'any more items.'), 'shop-list');
      } else this.showCommerceMessage('This item cannot be purchased.', 'shop-list');
      return;
    }
    if (action === 'sell' && session.item !== null) {
      const result = sellCommerceItem(
        catalog, this.inventory, this.wallet,
        session.item.category, session.item.itemId, session.quantity,
        session.selectedInventoryIndex ?? undefined,
      );
      session.selectedInventoryIndex = null;
      this.inventory = result.inventory;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      if (result.status === 'sold') this.showCommerceMessage(this.commerceText(1614, 'Sold.'), 'sell-list');
      else if (result.status === 'not-sellable') {
        this.showCommerceMessage(this.commerceText(1609, "You can't sell") + ' ' +
          this.commerceText(1610, 'this item.'), 'sell-list');
      } else this.showCommerceMessage(this.commerceText(1611, 'No more items') + ' ' +
        this.commerceText(1612, 'to sell.'), 'sell-list');
      return;
    }
    if (action === 'orb' && session.target !== null && session.item !== null) {
      const result = applyCommerceOrbAttribute(
        this.inventory, this.equipmentSlots, this.wallet, session.target, session.item.itemId,
      );
      this.inventory = result.inventory;
      this.equipmentSlots = result.equipment;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      const message = result.status === 'refined' ? this.commerceText(1566, 'Attribute is given.')
        : result.status === 'not-enough-money' ? this.commerceText(1564, 'Not enough money.')
          : result.status === 'already-attributed' ? this.commerceText(1568, 'Already attributed')
            : this.commerceText(1561, 'There is no orb.');
      this.showCommerceMessage(message, 'refiner-main');
      return;
    }
    if (action === 'upgrade' && session.target !== null && this.equipmentDataTable !== null) {
      const result = upgradeCommerceEquipment(
        this.inventory, this.equipmentSlots, this.equipmentDataTable,
        this.wallet, session.target,
        (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      );
      this.inventory = result.inventory;
      this.equipmentSlots = result.equipment;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      const message = result.status === 'enhanced' ? this.commerceText(901, 'Refined successfully!')
        : result.status === 'equipment-destroyed' ? this.commerceText(920, 'Device is destroyed.')
          : result.status === 'maximum-level'
            ? this.commerceText(897, 'The device you selected is') + ' ' +
              this.commerceText(898, 'already fully refined.')
            : result.status === 'not-enough-money' ? this.commerceText(899, 'Not enough money.')
              : result.status === 'not-enough-material' ? this.commerceText(896, 'Not enough Mithril.')
                : this.commerceText(894, 'Choose your device');
      this.showCommerceMessage(message, 'blacksmith-main');
      return;
    }
    if (action === 'identify' && session.target !== null) {
      const result = identifyCommerceEquipment(
        this.inventory, this.equipmentSlots, this.wallet, session.target,
      );
      this.inventory = result.inventory;
      this.equipmentSlots = result.equipment;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      this.showCommerceMessage(
        result.status === 'identified' ? this.commerceText(911, 'Identified successfully!')
          : result.status === 'not-enough-money' ? this.commerceText(899, 'Not enough money.')
            : this.commerceText(912, 'Already Identified.'),
        'blacksmith-main',
      );
      return;
    }
    if (action === 'mix') {
      const result = mixCommerceItems(catalog, this.inventory, this.wallet, session.selectedIngredients);
      this.inventory = result.inventory;
      this.wallet = result.wallet;
      this.refreshCommerceHud();
      const message = result.status === 'mixed'
        ? this.commerceText(1583, 'Mixture successful.') + ' ' +
          (result.result === null ? '' : this.commerceItemName(result.result))
        : result.status === 'failed' ? this.commerceText(1586, 'Mixture failed.')
          : result.status === 'not-enough-money' ? this.commerceText(1580, 'Not enough money.')
            : result.status === 'not-enough-materials' ? this.commerceText(1587, 'Not enough quantities.')
              : result.status === 'inventory-full'
                ? this.commerceText(1584, "You can't carry") + ' ' +
                  this.commerceText(1585, 'items any more.')
                : this.commerceText(1578, 'You must select 2 or more materials');
      session.selectedIngredients = [];
      this.showCommerceMessage(message, 'refiner-main');
    }
  }

  private activateCommerceSelection(): void {
    const session = this.commerceMenu;
    const catalog = this.commerceCatalog;
    if (session === null || catalog === null) return;
    if (session.screen === 'quantity') {
      this.startCommerceConfirmation(session.pendingAction ?? 'buy', session.pendingReturn);
      return;
    }
    const selectQuantity = (
      action: 'buy' | 'sell', item: CommerceItemReference, back: CommerceScreen,
      selectedInventoryIndex: number | null = null,
    ): void => {
      session.item = item;
      session.selectedInventoryIndex = selectedInventoryIndex;
      session.pendingAction = action;
      session.pendingReturn = back;
      session.quantity = 1;
      session.screen = 'quantity';
      this.renderCommerceMenu();
    };
    if (session.screen === 'shop-list') {
      const item = catalog.shopStock[session.tab]?.[session.selection];
      if (item !== undefined) selectQuantity('buy', item, 'shop-list');
      return;
    }
    if (session.screen === 'sell-list') {
      const stack = this.inventory[session.selection];
      if (stack !== undefined) selectQuantity(
        'sell', { category: stack.category, itemId: stack.itemId }, 'sell-list', session.selection,
      );
      return;
    }
    if (session.screen === 'refiner-main' || session.screen === 'blacksmith-main') {
      session.screen = session.service === 'refiner'
        ? session.selection === 0 ? 'orb-target' : 'mix-select'
        : session.selection === 0 ? 'upgrade-target' : 'identify-target';
      session.selection = 0;
      session.selectedIngredients = [];
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'orb-target' || session.screen === 'upgrade-target' ||
      session.screen === 'identify-target') {
      const kind = session.screen === 'orb-target' ? 'orb'
        : session.screen === 'upgrade-target' ? 'upgrade' : 'identify';
      const target = this.commerceTargetOptions(kind)[session.selection];
      if (target === undefined) {
        const messageId = kind === 'orb' ? 1559 : kind === 'upgrade' ? 894 : 902;
        this.showCommerceMessage(this.commerceText(messageId, 'Choose your item'), session.service === 'refiner'
          ? 'refiner-main' : 'blacksmith-main');
        return;
      }
      session.target = target;
      if (kind === 'orb') {
        if (this.commerceTargetStack(target)?.equipmentState?.subtypeBytes[0] !== -1) {
          this.showCommerceMessage(this.commerceText(1568, 'Already attributed'), 'refiner-main');
          return;
        }
        const orbs = this.inventory.filter((stack) => stack.category === 17);
        if (orbs.length === 0) this.showCommerceMessage(this.commerceText(1561, 'There is no orb.'), 'refiner-main');
        else {
          session.screen = 'orb-list';
          session.selection = 0;
          this.renderCommerceMenu();
        }
      } else this.startCommerceConfirmation(kind, session.screen);
      return;
    }
    if (session.screen === 'orb-list') {
      const orb = this.inventory.filter((stack) => stack.category === 17)[session.selection];
      if (orb !== undefined) {
        session.item = { category: 17, itemId: orb.itemId };
        this.startCommerceConfirmation('orb', 'orb-list');
      }
      return;
    }
    if (session.screen === 'mix-select') {
      const options = this.inventory.flatMap((stack, index) =>
        [7, 9, 12, 13, 14, 15, 16].includes(stack.category) ? [index] : []);
      const inventoryIndex = options[session.selection];
      const stack = inventoryIndex === undefined ? undefined : this.inventory[inventoryIndex];
      if (inventoryIndex === undefined || stack === undefined) return;
      const selectedCount = session.selectedIngredients.filter((index) => {
        const selected = this.inventory[index];
        return selected?.category === stack.category && selected.itemId === stack.itemId;
      }).length;
      if (session.selectedIngredients.length >= 3) {
        this.showCommerceMessage(this.commerceText(1578, 'You must select 2 or more materials'), 'mix-select');
      } else if (selectedCount >= stack.count) {
        this.showCommerceMessage(this.commerceText(1587, 'Not enough quantities.'), 'mix-select');
      } else {
        session.selectedIngredients.push(inventoryIndex);
        this.renderCommerceMenu();
      }
    }
  }

  private handleCommerceMenuKey(event: KeyboardEvent): void {
    const session = this.commerceMenu;
    if (session === null) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
      if (session.screen === 'message') session.screen = session.messageReturn;
      else if (session.screen === 'confirm') session.screen = session.pendingReturn;
      else if (session.service === 'shop' && session.screen === 'sell-list') session.screen = 'shop-list';
      else if (session.screen === 'shop-list' || session.screen === 'refiner-main' ||
        session.screen === 'blacksmith-main') {
        this.closeCommerceMenu();
        return;
      } else session.screen = session.service === 'shop' ? 'shop-list'
        : session.service === 'refiner' ? 'refiner-main' : 'blacksmith-main';
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'confirm') {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        session.confirmationSelection = session.confirmationSelection === 0 ? 1 : 0;
        this.renderCommerceMenu();
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (session.confirmationSelection === 0) this.executeCommerceAction();
        else {
          session.screen = session.pendingReturn;
          this.renderCommerceMenu();
        }
      }
      return;
    }
    if (session.screen === 'message') {
      if (event.key === 'Enter' || event.key === ' ') {
        session.screen = session.messageReturn;
        session.selection = 0;
        this.renderCommerceMenu();
      }
      return;
    }
    if (session.screen === 'quantity') {
      const maximum = this.commerceQuantityMaximum(session);
      const amount = event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10
        : event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      if (amount !== 0) {
        session.quantity = Math.max(1, Math.min(maximum, session.quantity + amount));
        this.renderCommerceMenu();
      } else if (event.key === 'Enter' || event.key === ' ') {
        this.startCommerceConfirmation(session.pendingAction ?? 'buy', session.pendingReturn);
      }
      return;
    }
    if (session.screen === 'mix-select') {
      if (event.key.toLowerCase() === 'm') {
        if (session.selectedIngredients.length < 2) {
          this.showCommerceMessage(this.commerceText(1578, 'You must select 2 or more materials'), 'mix-select');
        } else this.startCommerceConfirmation('mix', 'mix-select');
        return;
      }
      if (event.key === 'Backspace') {
        session.selectedIngredients.pop();
        this.renderCommerceMenu();
        return;
      }
    }
    if (session.screen === 'shop-list' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      session.tab = (session.tab + (event.key === 'ArrowLeft' ? 5 : 1)) % 6;
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    if ((event.key === '*' || event.key === '#' || event.code === 'NumpadMultiply') &&
      session.screen === 'shop-list') {
      session.screen = 'sell-list';
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const count = this.commerceListLength(session);
      if (count > 0) {
        session.selection = (session.selection + (event.key === 'ArrowUp' ? count - 1 : 1)) % count;
      }
      this.renderCommerceMenu();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') this.activateCommerceSelection();
  }

  private handleCommerceMenuPointer(pointer: Phaser.Input.Pointer): void {
    const session = this.commerceMenu;
    if (session === null) return;
    if (session.screen === 'message' && pointer.y >= 240) {
      session.screen = session.messageReturn;
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'quantity' && pointer.y >= 132 && pointer.y < 162 &&
      pointer.x >= 60 && pointer.x <= 180 && session.item !== null) {
      const maximum = this.commerceQuantityMaximum(session);
      session.quantity = Math.max(1, Math.min(maximum, session.quantity + (pointer.x < 120 ? -1 : 1)));
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'shop-list' && pointer.y >= 250 && pointer.y < 270) {
      session.screen = 'sell-list';
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'confirm' && pointer.y >= 175 && pointer.y <= 220) {
      session.confirmationSelection = pointer.x < 145 ? 0 : 1;
      if (session.confirmationSelection === 0) this.executeCommerceAction();
      else {
        session.screen = session.pendingReturn;
        this.renderCommerceMenu();
      }
      return;
    }
    if (pointer.y >= 270) {
      if (pointer.x < 90) {
        const event = { key: 'Escape', repeat: false, preventDefault: () => {} } as KeyboardEvent;
        this.handleCommerceMenuKey(event);
      } else if (session.screen === 'mix-select' && pointer.x < 150) {
        const event = { key: 'm', repeat: false, preventDefault: () => {} } as KeyboardEvent;
        this.handleCommerceMenuKey(event);
      } else if (session.screen === 'confirm') {
        if (pointer.x < 145) session.confirmationSelection = 0;
        else session.confirmationSelection = 1;
        if (pointer.x < 145) this.executeCommerceAction();
        else {
          session.screen = session.pendingReturn;
          this.renderCommerceMenu();
        }
      } else this.activateCommerceSelection();
      return;
    }
    if (session.screen === 'confirm') {
      session.confirmationSelection = pointer.x < 145 ? 0 : 1;
      this.renderCommerceMenu();
      return;
    }
    if (session.screen === 'shop-list' && pointer.y >= 43 && pointer.y < 67) {
      session.tab = Math.min(5, Math.floor(pointer.x / 40));
      session.selection = 0;
      this.renderCommerceMenu();
      return;
    }
    const start = session.screen === 'shop-list' ? 78
      : session.screen === 'refiner-main' || session.screen === 'blacksmith-main' ? 108 : 58;
    if (pointer.y < start || pointer.y >= 250) return;
    const row = Math.floor((pointer.y - start) / 18);
    const first = Math.floor(session.selection / 10) * 10;
    const selected = first + row;
    if (row >= 0 && row < 10 && selected < this.commerceListLength(session)) {
      session.selection = selected;
      if (session.screen === 'mix-select') this.activateCommerceSelection();
      else this.renderCommerceMenu();
    }
  }

  private renderCommerceMenu(): void {
    const context = this.systemMenuContext;
    const session = this.commerceMenu;
    const catalog = this.commerceCatalog;
    if (context === null || this.fontLayout === null || session === null || catalog === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.78)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(9, 22, 222, 277);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(10, 23, 220, 275);
    context.strokeStyle = '#ffffff';
    context.strokeRect(12, 25, 216, 271);
    const title = session.service === 'shop' ? this.commerceText(1590, 'Shop')
      : session.service === 'refiner' ? this.commerceText(1570, 'Refiner')
        : this.commerceText(904, 'Blacksmith');
    this.drawMenuText(context, title, 120, 38, '#ffffff', 'center');
    this.drawMenuText(context, 'Gold ' + this.wallet, 218, 39, '#bfbf7f', 'right');
    const rows = (labels: string[], start: number): void => {
      const first = Math.floor(session.selection / 10) * 10;
      for (let row = 0; row < 10; row += 1) {
        const index = first + row;
        const label = labels[index];
        if (label === undefined) break;
        this.drawMenuText(context, (index === session.selection ? '> ' : '  ') + label,
          20, start + row * 18, '#ffffff', 'left');
      }
    };
    const nameForStack = (stack: InventoryStack): string => this.commerceStackName(stack);
    if (session.screen === 'shop-list') {
      const labels = [1591, 1592, 1593, 1594, 1595, 1596].map((id, index) =>
        this.commerceText(id, ['Item', 'Weapon', 'Shield', 'Armor', 'Helmet', 'Shoes'][index]));
      this.drawMenuText(context, labels.map((label, index) =>
        index === session.tab ? '[' + label + ']' : label).join(' '), 120, 52, '#bfbf7f', 'center');
      const stock = catalog.shopStock[session.tab] ?? [];
      rows(stock.map((reference) => {
        const item = findCommerceItem(catalog, reference.category, reference.itemId);
        return this.commerceItemName(reference) + '  ' + (item?.sourceValue ?? 0);
      }), 78);
      this.drawMenuText(context, '# Sell', 120, 263, '#bfbf7f', 'center');
    } else if (session.screen === 'sell-list') {
      rows(this.inventory.map((stack) => {
        const price = findCommerceItem(catalog, stack.category, stack.itemId)?.sourceValue ?? 0;
        return nameForStack(stack) + ' x' + stack.count + '  ' + Math.trunc(price * stack.count / 5);
      }), 58);
      if (this.inventory.length === 0) {
        this.drawMenuText(context, this.commerceText(1607, 'No items to sell.'), 120, 136, '#ffffff', 'center');
      }
    } else if (session.screen === 'quantity') {
      const item = session.item;
      const definition = item === null ? undefined : findCommerceItem(catalog, item.category, item.itemId);
      const price = definition?.sourceValue ?? 0;
      const selling = session.pendingAction === 'sell';
      this.drawMenuText(context, item === null ? '' : this.commerceItemName(item), 20, 80, '#ffffff', 'left');
      this.drawMenuText(context, this.commerceText(selling ? 1615 : 1604,
        selling ? 'How many will I sell?' : 'How many will you buy?'), 20, 109, '#bfbf7f', 'left');
      this.drawMenuText(context, '[-] ' + session.quantity + ' [+]', 120, 147, '#ffffff', 'center');
      this.drawMenuText(context, (selling ? 'Earn ' : 'Pay ') +
        Math.trunc(price * session.quantity / (selling ? 5 : 1)), 120, 173, '#ffffff', 'center');
    } else if (session.screen === 'confirm') {
      const action = session.pendingAction;
      const id = action === 'buy' ? 1597 : action === 'sell' ? 1613
        : action === 'mix' ? 1588 : action === 'upgrade' ? 900 : action === 'identify' ? 910 : 1565;
      const fallback = action === 'buy' ? 'Will you buy?' : action === 'sell' ? 'Will you sell?'
        : action === 'upgrade' ? 'Refine it?' : action === 'identify' ? 'Identify it?'
          : action === 'mix' ? 'Proceed with this?' : 'Give attribute?';
      this.drawMenuText(context, this.commerceText(id, fallback), 120, 78, '#ffffff', 'center');
      const targetName = session.target === null ? '' : this.commerceTargetLabel(session.target);
      const itemName = session.item === null ? '' : this.commerceItemName(session.item);
      this.drawMenuText(context, targetName || itemName, 120, 112, '#bfbf7f', 'center');
      const itemPrice = session.item === null ? 0
        : findCommerceItem(catalog, session.item.category, session.item.itemId)?.sourceValue ?? 0;
      const cost = action === 'buy' ? itemPrice * session.quantity
        : action === 'sell' ? Math.trunc(itemPrice * session.quantity / 5)
          : action === 'orb' ? 500 : action === 'identify' ? 100
            : action === 'mix' ? 500 : 0;
      if (action === 'upgrade' && session.target !== null) {
        const stack = this.commerceTargetStack(session.target);
        const level = stack?.equipmentState?.upgradeByte ?? 0;
        this.drawMenuText(context, 'Cost ' + (level * 100) + '  Mithril ' + (level + 1),
          120, 145, '#ffffff', 'center');
      } else this.drawMenuText(context, (action === 'sell' ? 'Receive ' : 'Cost ') + cost,
        120, 145, '#ffffff', 'center');
      this.drawMenuText(context, (session.confirmationSelection === 0 ? '> ' : '  ') + 'Yes',
        72, 195, '#ffffff', 'left');
      this.drawMenuText(context, (session.confirmationSelection === 1 ? '> ' : '  ') + 'No',
        144, 195, '#ffffff', 'left');
    } else if (session.screen === 'refiner-main') {
      this.drawMenuText(context, this.commerceText(1556, 'What are you looking for?'),
        20, 68, '#ffffff', 'left');
      rows([this.commerceText(1557, 'Give attribute'), this.commerceText(1558, 'Mix items')], 108);
    } else if (session.screen === 'orb-target') {
      rows(this.commerceTargetOptions('orb').map((target) => this.commerceTargetLabel(target)), 58);
      this.drawMenuText(context, this.commerceText(1559, 'Choose your item'), 120, 258, '#bfbf7f', 'center');
    } else if (session.screen === 'orb-list') {
      rows(this.inventory.filter((stack) => stack.category === 17).map(nameForStack), 58);
      this.drawMenuText(context, this.commerceText(1560, 'Choose your orb'), 120, 258, '#bfbf7f', 'center');
    } else if (session.screen === 'mix-select') {
      const options = this.inventory.flatMap((stack, index) =>
        [7, 9, 12, 13, 14, 15, 16].includes(stack.category) ? [index] : []);
      rows(options.map((index) => {
        const stack = this.inventory[index];
        const selected = session.selectedIngredients.filter((entry) => entry === index).length;
        return (selected > 0 ? '[' + selected + '] ' : '') + nameForStack(stack) + ' x' + stack.count;
      }), 58);
      this.drawMenuText(context, 'Selected ' + session.selectedIngredients.length + '/3',
        120, 250, '#bfbf7f', 'center');
      this.drawMenuText(context, 'Enter Add  Backspace Undo  M Mix', 120, 269, '#ffffff', 'center');
    } else if (session.screen === 'blacksmith-main') {
      this.drawMenuText(context, this.commerceText(891, 'What do you need?'), 20, 68, '#ffffff', 'left');
      rows([this.commerceText(892, 'Refining device'), this.commerceText(893, 'Identifying device')], 108);
    } else if (session.screen === 'upgrade-target') {
      rows(this.commerceTargetOptions('upgrade').map((target) => this.commerceTargetLabel(target)), 58);
    } else if (session.screen === 'identify-target') {
      rows(this.commerceTargetOptions('identify').map((target) => this.commerceTargetLabel(target)), 58);
    } else if (session.screen === 'message') {
      const words = session.message.split(/\s+/);
      let line = '';
      let y = 122;
      for (const word of words) {
        const candidate = line.length === 0 ? word : line + ' ' + word;
        if (bitmapTextWidth(candidate, this.fontLayout) > 194) {
          this.drawMenuText(context, line, 120, y, '#ffffff', 'center');
          y += 18;
          line = word;
        } else line = candidate;
      }
      if (line.length > 0) this.drawMenuText(context, line, 120, y, '#ffffff', 'center');
      this.drawMenuText(context, 'Enter Continue', 120, 260, '#bfbf7f', 'center');
    }
    this.drawMenuText(context, 'Esc Back', 44, 286, '#ffffff', 'center');
    this.drawMenuText(context, 'Enter OK', 190, 286, '#ffffff', 'center');
    this.systemMenuTexture?.refresh();
  }

  private createSaveState(): GameSaveState {
    const savedAt = Date.now();
    if (this.preservedSourceRmsInventorySlots !== null) {
      this.preservedSourceRmsInventorySlots.regular = advanceSourceInventorySlotSnapshot(
        this.preservedSourceRmsInventorySlots.regular,
        this.inventory,
        30,
      );
      this.preservedSourceRmsInventorySlots.special = advanceSourceInventorySlotSnapshot(
        this.preservedSourceRmsInventorySlots.special,
        this.specialInventory,
        15,
      );
    }
    const inventorySlotIndices = preservedSourceInventorySlotIndices(
      this.inventory,
      this.preservedSourceRmsInventorySlots?.regular ?? null,
    );
    const specialInventorySlotIndices = preservedSourceInventorySlotIndices(
      this.specialInventory,
      this.preservedSourceRmsInventorySlots?.special ?? null,
    );
    return {
      version: 1,
      savedAt,
      mapId: this.currentMapId,
      tileX: this.actor.x / 16,
      tileY: this.actor.y / 16,
      direction: this.actor.direction,
      playthroughMode: this.playthroughMode,
      completionPoints: this.completionPoints,
      playTimeSeconds: addSourcePlayTimeSeconds(
        this.playTimeSeconds,
        this.playTimeSessionStartedAtMs,
        savedAt,
      ),
      gameFlags: [...this.gameFlags],
      questFlags: [...this.questFlags],
      guardianIndices: [...this.guardianIndices],
      heroClassId: this.heroClassId,
      attributes: { ...this.characterAttributes },
      skillIds: [...this.skillIds],
      activeSkillId: this.activeSkillId,
      skillProgress: this.skillIds.map((skillId) => {
        const action = this.playerSkillAction.skillId === skillId
          ? this.playerSkillAction
          : this.playerSkillActionStates.get(skillId) ?? createPlayerSkillActionState(
            skillId,
            this.characterAttributes.will,
          );
        return {
          skillId,
          skillRank: action.skillRank,
          skillExperience: action.skillExperience,
          skillLevelSlotOne: action.skillLevelSlotOne,
          skillLevelSlotThree: action.skillLevelSlotThree,
        };
      }),
      comboLimit: this.comboLimit,
      hud: { ...this.hudState },
      wallet: this.wallet,
      inventory: this.inventory.map((stack) => ({ ...stack })),
      ...(inventorySlotIndices === undefined ? {} : { sourceInventorySlotIndices: inventorySlotIndices }),
      specialInventory: this.specialInventory.map((stack) => ({ ...stack })),
      ...(specialInventorySlotIndices === undefined
        ? {}
        : { sourceSpecialInventorySlotIndices: specialInventorySlotIndices }),
      equipmentSlots: cloneEquipmentLoadout(this.equipmentSlots),
    };
  }

  private saveCurrentGame(): void {
    if (this.hudState.hp <= 0 || this.gameOverSequence !== null) {
      this.systemMenuMessage = 'Cannot save while defeated.';
      this.renderSystemMenu();
      return;
    }
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0 ||
      this.maps.get(this.currentMapId) === undefined) {
      this.systemMenuMessage = 'Stop on a tile before saving.';
      this.renderSystemMenu();
      return;
    }
    const state = this.createSaveState();
    try {
      writeGameSave(window.localStorage, state);
      this.systemMenuMessage = 'Game saved.';
    } catch {
      this.systemMenuMessage = 'Save failed. Browser storage is unavailable.';
    }
    this.renderSystemMenu();
  }

  private renderSystemMenu(): void {
    if (this.commerceMenu !== null) {
      this.renderCommerceMenu();
      return;
    }
    if (this.attributeMenuVisible) {
      this.renderAttributeMenu();
      return;
    }
    const context = this.systemMenuContext;
    if (context === null || this.fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.68)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(34, 87, 172, 166);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(35, 88, 170, 164);
    context.strokeStyle = '#ffffff';
    context.strokeRect(37, 90, 166, 160);
    this.drawMenuText(context, 'SYSTEM', 120, 105, '#ffffff', 'center');
    const entries = ['Status / Attributes', 'Inventory', 'Skills', 'Save Game', 'Resume'];
    entries.forEach((entry, index) => {
      this.drawMenuText(context, `${this.systemMenuSelection === index ? '>' : ' '} ${entry}`,
        48, 129 + index * 17, '#ffffff', 'left');
    });
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 218, '#ffffff', 'center');
    }
    this.drawMenuText(context, 'Arrows Select  Enter OK  Esc Back', 120, 273, '#ffffff', 'center');
    this.systemMenuTexture?.refresh();
  }

  private openSkillMenu(): void {
    this.skillMenuVisible = true;
    this.skillLevelMenuVisible = false;
    this.skillSelection = Math.max(0, this.skillIds.indexOf(this.activeSkillId));
    this.systemMenuMessage = '';
    this.renderSkillMenu();
  }

  private handleSkillMenuPointer(pointerY: number): void {
    if (pointerY >= 260 && pointerY < 292) {
      this.openSkillLevelMenu();
      return;
    }
    const firstRowY = 64;
    const rowHeight = 25;
    const index = Math.floor((pointerY - firstRowY) / rowHeight);
    if (pointerY < firstRowY || index < 0 || index >= this.skillIds.length || index >= 5) return;
    this.skillSelection = index;
    this.activateSkillSelection();
  }

  private openSkillLevelMenu(): void {
    const skillId = this.skillIds[this.skillSelection];
    if (skillId === undefined) return;
    const state = this.playerSkillState(skillId);
    this.skillLevelMenuVisible = true;
    this.skillLevelActionButton = '1';
    this.skillLevelSelection = state.skillLevelSlotOne ?? 0;
    this.systemMenuMessage = '';
    this.renderSkillLevelMenu();
  }

  private handleSkillLevelMenuPointer(pointerX: number, pointerY: number): void {
    if (pointerY >= 68 && pointerY < 100) {
      this.skillLevelActionButton = pointerX < 120 ? '1' : '3';
      const skillId = this.skillIds[this.skillSelection];
      const state = skillId === undefined ? null : this.playerSkillState(skillId);
      if (state !== null) this.skillLevelSelection =
        (this.skillLevelActionButton === '1' ? state.skillLevelSlotOne : state.skillLevelSlotThree) ?? 0;
      this.systemMenuMessage = '';
      this.renderSkillLevelMenu();
      return;
    }
    if (pointerY >= 105 && pointerY < 204) {
      this.skillLevelSelection = Math.floor((pointerY - 105) / 33) as PlayerSkillLevelSlot;
      this.assignSkillLevelSelection();
    }
  }

  private assignSkillLevelSelection(): void {
    const skillId = this.skillIds[this.skillSelection];
    if (skillId === undefined) {
      this.systemMenuMessage = 'No learned skill.';
      this.renderSkillLevelMenu();
      return;
    }
    const source = this.playerSkillState(skillId);
    if (this.playerSkillAction.skillId === skillId && source.phase !== 0) {
      this.systemMenuMessage = 'Wait until the current skill finishes.';
      this.renderSkillLevelMenu();
      return;
    }
    const result = assignPlayerSkillLevelSlot(source, this.skillLevelActionButton, this.skillLevelSelection);
    if (!result.accepted) {
      this.systemMenuMessage = result.reason === 'locked'
        ? `Requires skill rank ${PLAYER_SKILL_LEVEL_UNLOCK_RANKS[this.skillLevelSelection]}.`
        : 'That level is already assigned to a button.';
      this.renderSkillLevelMenu();
      return;
    }
    if (this.playerSkillAction.skillId === skillId) this.playerSkillAction = result.state;
    this.playerSkillActionStates.set(skillId, result.state);
    this.systemMenuMessage = `Button ${this.skillLevelActionButton} assigned level ${this.skillLevelSelection + 1}.`;
    this.renderSkillLevelMenu();
  }

  private playerSkillState(skillId: number): PlayerSkillActionState {
    if (this.playerSkillAction.skillId === skillId) return this.playerSkillAction;
    return this.playerSkillActionStates.get(skillId) ?? createPlayerSkillActionState(
      skillId,
      this.characterAttributes.will,
    );
  }

  private activateSkillSelection(): void {
    if (this.playerSkillAction.phase !== 0) {
      this.systemMenuMessage = 'Wait until the current skill finishes.';
      this.renderSkillMenu();
      return;
    }
    const nextActiveSkillId = selectActivePlayerSkill(this.skillIds, this.skillSelection);
    if (nextActiveSkillId === null) {
      this.systemMenuMessage = 'No learned skill in that slot.';
      this.renderSkillMenu();
      return;
    }
    this.setActivePlayerSkill(nextActiveSkillId);
    const skillId = this.activeSkillId;
    if (skillId !== undefined && this.textures.exists(`world-skill-hud-icon-${skillId}`) &&
      this.gameplayHudAssets !== null) {
      this.gameplayHudAssets.guardianSkillIcon = this.textures
        .get(`world-skill-hud-icon-${skillId}`).getSourceImage() as CanvasImageSource;
      this.refreshGameplayHud();
    }
    this.systemMenuMessage = skillId === undefined ? 'No learned skill.' :
      `${this.playerSkillName(skillId)} selected.`;
    this.renderSkillMenu();
  }

  private setActivePlayerSkill(skillId: number): void {
    this.activeSkillId = skillId;
    const currentSkillId = this.playerSkillAction.skillId;
    if (currentSkillId !== null) this.playerSkillActionStates.set(currentSkillId, this.playerSkillAction);
    this.playerSkillAction = getPlayerSkillActionState(
      skillId,
      this.characterAttributes.will,
      this.nextPlayerSkillActionId,
      this.playerSkillActionStates,
    );
  }

  private playerSkillName(skillId: number): string {
    return resolveLanguageString(this.worldLanguage, playerSkillNameStringId(skillId)) ?? `Skill ${skillId + 1}`;
  }

  private renderSkillMenu(): void {
    const context = this.systemMenuContext;
    if (context === null || this.fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.78)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(9, 27, 222, 268);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(10, 28, 220, 266);
    context.strokeStyle = '#ffffff';
    context.strokeRect(12, 30, 216, 262);
    this.drawMenuText(context, 'SKILLS', 120, 45, '#ffffff', 'center');
    this.skillIds.slice(0, 5).forEach((skillId, index) => {
      const y = 70 + index * 25;
      const active = skillId === this.activeSkillId;
      const selected = index === this.skillSelection;
      if (selected) {
        context.fillStyle = '#292929';
        context.fillRect(17, y - 4, 206, 21);
      }
      const iconKey = `world-skill-icon-${skillId}`;
      if (this.textures.exists(iconKey)) {
        context.drawImage(this.textures.get(iconKey).getSourceImage() as CanvasImageSource, 22, y - 1, 17, 17);
      }
      this.drawMenuText(context, `${selected ? '>' : ' '} ${this.playerSkillName(skillId)}${active ? '  [Active]' : ''}`,
        46, y + 5, '#ffffff', 'left');
    });
    if (this.skillIds.length === 0) {
      this.drawMenuText(context, 'No learned skills.', 120, 136, '#ffffff', 'center');
    }
    const selectedSkillId = this.skillIds[this.skillSelection];
    const description = selectedSkillId === undefined ? undefined :
      resolveLanguageString(this.worldLanguage, playerSkillDescriptionStringId(selectedSkillId));
    if (description !== undefined) {
      const words = description.split(/\s+/);
      let line = '';
      let lineY = 215;
      for (const word of words) {
        const candidate = line.length === 0 ? word : `${line} ${word}`;
        if (bitmapTextWidth(candidate, this.fontLayout) > 194) {
          this.drawMenuText(context, line, 22, lineY, '#bfbf7f', 'left');
          lineY += 12;
          line = word;
        } else line = candidate;
      }
      if (line !== '') this.drawMenuText(context, line, 22, lineY, '#bfbf7f', 'left');
    }
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 250, '#bfbf7f', 'center');
    }
    this.drawMenuText(context, 'Enter Active  Tab / Tap Levels', 120, 270, '#ffffff', 'center');
    this.drawMenuText(context, 'Esc Back', 120, 286, '#ffffff', 'center');
    this.systemMenuTexture?.refresh();
  }

  private renderSkillLevelMenu(): void {
    const context = this.systemMenuContext;
    if (context === null) return;
    const skillId = this.skillIds[this.skillSelection];
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.78)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(9, 27, 222, 268);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(10, 28, 220, 266);
    context.strokeStyle = '#ffffff';
    context.strokeRect(12, 30, 216, 262);
    this.drawMenuText(context, 'SKILL LEVELS', 120, 45, '#ffffff', 'center');
    if (skillId === undefined) {
      this.drawMenuText(context, 'No learned skill.', 120, 88, '#ffffff', 'center');
    } else {
      const state = this.playerSkillState(skillId);
      this.drawMenuText(context, this.playerSkillName(skillId), 120, 61, '#bfbf7f', 'center');
      for (const button of ['1', '3'] as const) {
        const selected = this.skillLevelActionButton === button;
        const x = button === '1' ? 30 : 130;
        if (selected) {
          context.fillStyle = '#292929';
          context.fillRect(x - 7, 70, 88, 27);
        }
        const boundSlot = button === '1' ? state.skillLevelSlotOne : state.skillLevelSlotThree;
        this.drawMenuText(context, `Button ${button}: ${boundSlot === null ? 'None' : `Level ${boundSlot + 1}`}`,
          x, 84, '#ffffff', 'left');
      }
      for (const slot of [0, 1, 2] as const) {
        const y = 113 + slot * 33;
        if (this.skillLevelSelection === slot) {
          context.fillStyle = '#292929';
          context.fillRect(22, y - 5, 196, 25);
        }
        const requiredRank = PLAYER_SKILL_LEVEL_UNLOCK_RANKS[slot];
        const locked = state.skillRank < requiredRank;
        const currentlyBound = state.skillLevelSlotOne === slot || state.skillLevelSlotThree === slot;
        const label = `Level ${slot + 1}${locked ? `  Rank ${requiredRank}` : currentlyBound ? '  Assigned' : ''}`;
        this.drawMenuText(context, label, 35, y + 7, locked ? '#7f7f7f' : '#ffffff', 'left');
      }
      this.drawMenuText(context, `Skill rank ${state.skillRank}`, 120, 218, '#bfbf7f', 'center');
    }
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 248, '#ffffff', 'center');
    }
    this.drawMenuText(context, 'Left/Right Button  Up/Down Level  Enter Set', 120, 270, '#ffffff', 'center');
    this.drawMenuText(context, 'Esc Back', 120, 286, '#ffffff', 'center');
    this.systemMenuTexture?.refresh();
  }

  private renderAttributeMenu(): void {
    const context = this.systemMenuContext;
    if (context === null || this.fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.78)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(9, 27, 222, 268);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(10, 28, 220, 266);
    context.strokeStyle = '#ffffff';
    context.strokeRect(12, 30, 216, 262);
    this.drawMenuText(context, 'CHARACTER STATUS', 120, 45, '#ffffff', 'center');
    this.drawMenuText(context, `POINTS ${this.attributeDraft.remainingPoints}`, 120, 65, '#bfbf7f', 'center');

    const previewStats = this.equipmentDataTable === null
      ? this.equipmentStats
      : calculateEquipmentStats(
        this.equipmentSlots,
        this.equipmentDataTable,
        this.heroClassId,
        this.hudState.level,
        this.previewCharacterAttributes(),
      );
    const labels: Record<PlayerAttributeKey, string> = {
      power: 'Power', hp: 'HP', agility: 'Agility', will: 'Will',
    };
    PLAYER_ATTRIBUTE_KEYS.forEach((attribute, index) => {
      const y = 122 + index * 20;
      const selected = index === this.attributeSelection;
      if (selected) {
        context.fillStyle = '#292929';
        context.fillRect(18, y - 3, 204, 16);
      }
      this.drawMenuText(context, `${selected ? '>' : ' '} ${labels[attribute]}`, 24, y, '#ffffff', 'left');
      this.drawMenuText(context, String(previewStats?.attributes[attribute] ?? this.characterAttributes[attribute]),
        143, y, '#ffffff', 'right');
      this.drawMenuText(context, '-', 171, y, '#bfbf7f', 'center');
      this.drawMenuText(context, '+', 198, y, '#bfbf7f', 'center');
    });
    if (previewStats !== null) {
      this.drawMenuText(context, `ATK ${previewStats.attack.power}  DEF ${previewStats.defense.defense}`,
        120, 211, '#ffffff', 'center');
      this.drawMenuText(context, `MAX HP ${previewStats.maxHp}  SP ${previewStats.maxSp}`,
        120, 226, '#ffffff', 'center');
    }
    this.drawMenuText(context, 'Left/Right Adjust  Up/Down Select', 120, 247, '#bfbf7f', 'center');
    this.drawMenuText(context, 'Enter Apply  Esc Back', 120, 263, '#ffffff', 'center');
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 280, '#ffffff', 'center');
    }

    if (this.attributeConfirmationVisible) {
      context.fillStyle = 'rgba(0, 0, 0, 0.88)';
      context.fillRect(34, 132, 172, 76);
      context.strokeStyle = '#ffffff';
      context.strokeRect(36, 134, 168, 72);
      this.drawMenuText(context, 'Apply attribute changes?', 120, 151, '#ffffff', 'center');
      this.drawMenuText(context, `${this.attributeConfirmationSelection === 0 ? '>' : ' '} Yes`, 83, 180,
        '#ffffff', 'center');
      this.drawMenuText(context, `${this.attributeConfirmationSelection === 1 ? '>' : ' '} No`, 157, 180,
        '#ffffff', 'center');
      this.drawMenuText(context, 'Left/Right Select  Enter OK', 120, 195, '#bfbf7f', 'center');
    }
    this.systemMenuTexture?.refresh();
  }

  private renderInventoryMenu(): void {
    const context = this.systemMenuContext;
    if (context === null || this.fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    context.fillStyle = 'rgba(0, 0, 0, 0.76)';
    context.fillRect(0, 0, 240, 320);
    context.fillStyle = '#000000';
    context.fillRect(9, 27, 222, 268);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(10, 28, 220, 266);
    context.strokeStyle = '#ffffff';
    context.strokeRect(12, 30, 216, 262);
    const heading = this.equipmentMenuMode === 'slot-items'
      ? `CHOOSE ${EQUIPMENT_SLOT_LABELS[this.equipmentSlotSelection]} ITEM`
      : this.equipmentMenuMode === 'bag' ? 'INVENTORY' : 'EQUIPMENT / INVENTORY';
    this.drawMenuText(context, heading, 120, 43, '#ffffff', 'center');
    this.drawMenuText(context, 'EQUIPPED', 20, 59, '#bfbf7f', 'left');
    this.equipmentSlots.forEach((stack, slot) => {
      const label = EQUIPMENT_SLOT_LABELS[slot];
      const item = stack === null ? 'EMPTY' : this.commerceStackName(stack);
      const marker = (this.equipmentMenuMode === 'slots' || this.equipmentMenuMode === 'slot-items') &&
        slot === this.equipmentSlotSelection ? '>' : ' ';
      this.drawMenuText(context, `${marker}${label}  ${item}`, 20, 73 + slot * 11, '#ffffff', 'left');
    });
    const stats = this.equipmentStats;
    if (stats !== null) {
      this.drawMenuText(context, `ATK ${stats.attack.power}  DEF ${stats.defense.defense}  HP ${stats.maxHp}  SP ${stats.maxSp}`,
        20, 132, '#bfbf7f', 'left');
    }
    this.drawMenuText(context, `INVENTORY ${this.inventory.length}/${30}`, 20, 146, '#ffffff', 'left');
    const visibleIndices = this.equipmentMenuMode === 'slot-items'
      ? equipmentInventoryIndicesForSlot(this.inventory, this.equipmentSlotSelection, this.heroClassId)
      : this.inventory.map((_, index) => index);
    const selectionPosition = this.equipmentMenuMode === 'slot-items'
      ? Math.max(0, visibleIndices.indexOf(this.inventorySelection))
      : this.inventorySelection;
    const firstVisible = Math.floor(selectionPosition / 8) * 8;
    for (let row = 0; row < 8; row += 1) {
      const index = visibleIndices[firstVisible + row];
      if (index === undefined) break;
      const stack = this.inventory[index];
      if (stack === undefined) continue;
      const marker = this.equipmentMenuMode !== 'slots' && index === this.inventorySelection ? '>' : ' ';
      this.drawMenuText(context,
        `${marker} ${String(index + 1).padStart(2, '0')} ${this.commerceStackName(stack)} x${stack.count}`,
        20, 160 + row * 12, '#ffffff', 'left');
    }
    if (visibleIndices.length === 0) {
      const emptyMessage = this.equipmentMenuMode === 'slot-items' ? 'No compatible item in the bag.' : 'No items carried.';
      this.drawMenuText(context, emptyMessage, 120, 177, '#ffffff', 'center');
    }
    const controlText = this.equipmentMenuMode === 'slots'
      ? 'Up/Down Slot  Enter Choose  Tab Bag'
      : this.equipmentMenuMode === 'slot-items'
        ? 'Up/Down Item  Enter Equip'
        : 'Up/Down Select  Enter Use  Tab Slots';
    this.drawMenuText(context, controlText, 120, 263, '#ffffff', 'center');
    this.drawMenuText(context,
      this.equipmentMenuMode === 'slot-items' ? 'Esc Back to Slots' : 'Esc Back',
      120, 276, '#ffffff', 'center');
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 287, '#bfbf7f', 'center');
    }
    this.systemMenuTexture?.refresh();
  }

  private drawMenuText(
    context: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    color: string,
    alignment: 'left' | 'center' | 'right',
  ): void {
    if (this.fontLayout === null) return;
    const atlas = this.textures.get('world-font-atlas').getSourceImage() as CanvasImageSource;
    drawBitmapText(context, atlas, this.fontLayout, value, x, y, color, alignment);
  }

  private loadHeroTextures(): Array<{ key: string; path: string }> {
    const texturePrefix = `hero-c${this.heroSpriteResourceClass}`;
    const imageBase = heroSpriteAtlasAssetBase(this.heroSpriteResourceClass);
    const weaponFolders = Array.from({ length: 5 }, (_, index) => `w${index + 1}`)
      .flatMap((folder) => [folder, ...[1, 2, 3].map((element) => `${folder}-element-${element}`)]);
    const resources = [
      { layout: this.bodyLayout!, folders: ['b'], componentSlots: new Set([0]) },
      { layout: this.armorLayout!, folders: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], componentSlots: new Set([2, 3, 4, 5]) },
      { layout: this.headLayout!, folders: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'], componentSlots: new Set([1]) },
      { layout: this.alternateHeadLayout!, folders: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'], componentSlots: new Set([1]) },
      { layout: this.weaponLayout!, folders: weaponFolders, componentSlots: new Set([6]) },
      { layout: this.effectLayout!, folders: ['e', 'e-element-1', 'e-element-3'], componentSlots: new Set([7]) },
    ];
    if (this.shieldLayout !== null) {
      resources.push({
        layout: this.shieldLayout,
        folders: ['s1', 's2', 's3', 's5'],
        componentSlots: new Set(this.shieldLayout.records.map(({ componentSlot }) => componentSlot)),
      });
    }
    const textures: Array<{ key: string; path: string }> = [];
    const queuedKeys = new Set<string>();
    for (const { layout, folders, componentSlots } of resources) {
      for (const record of layout.records) {
        if (!componentSlots.has(record.componentSlot) ||
          !HERO_SOURCE_ANIMATION_SLOTS.includes(record.animationSlot as typeof HERO_SOURCE_ANIMATION_SLOTS[number])) continue;
        for (const part of record.frames.flat()) {
          if (part.imageIndex === 255) continue;
          for (const folder of folders) {
            const key = `${texturePrefix}-${folder}-${part.imageIndex}`;
            if (queuedKeys.has(key)) continue;
            const path = `${imageBase}/${folder}/${String(part.imageIndex).padStart(3, '0')}.png`;
            this.load.image(key, path);
            textures.push({ key, path });
            queuedKeys.add(key);
          }
        }
      }
    }
    const shadow = { key: 'hero-shadow', path: '/assets/generated/atlases/img/etcui/003.png' };
    this.load.image(shadow.key, shadow.path);
    textures.push(shadow);
    return textures;
  }

  private createHero(): void {
    this.heroContainer = this.add.container(this.actor.x + 8, this.actor.y + 8).setDepth(this.actor.y + 8);
    this.heroContainer.add(this.add.image(0, -3, 'hero-shadow').setOrigin(0.5, 1));
    this.playerStatusContainer = this.add.container(this.actor.x + 8, this.actor.y + 1)
      .setDepth(this.actor.y + 9);
    this.playerStatusMarkerContainers.clear();
    this.playerStatusMarkerIcons.clear();
    for (const statusId of [5, 6, 7]) {
      const background = this.add.image(0, -30, 'world-player-status-background')
        .setOrigin(0.5, 0);
      const icon = this.add.image(0, -29, `world-player-status-${statusId}`)
        .setOrigin(0.5, 0);
      const marker = this.add.container(0, 0).add([background, icon]).setVisible(false);
      this.playerStatusContainer.add(marker);
      this.playerStatusMarkerContainers.set(statusId, marker);
      this.playerStatusMarkerIcons.set(statusId, icon);
    }
    this.syncPlayerStatusDisplay();
    this.updateHeroSprite();
    this.heroEmotionImage = this.add.image(0, -39, 'world-emotion-0')
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.heroContainer.add(this.heroEmotionImage);
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap !== undefined) this.applyStartupHeroEmotion(currentMap);
  }

  private applyStartupHeroEmotion(map: RenderedWorld): void {
    if (map.startupHeroEmotion === undefined) return;
    for (const feedback of this.sourceWeaponProcFeedback) feedback.sprite.destroy();
    this.sourceWeaponProcFeedback = [];
    this.damageNumberPopups = this.damageNumberPopups.filter((popup) => {
      if (popup.effectOwner !== 'hero') return true;
      popup.frames.forEach((frame) => frame.destroy());
      return false;
    });
    if (this.heroEmotionImage !== null) {
      this.setEventEmotionImage(this.heroEmotionImage, map.startupHeroEmotion);
    }
  }

  private syncEventCutsceneEmotionSprites(state: EventCutsceneState): void {
    if (state.heroEmotionChanged && this.heroEmotionImage !== null) {
      this.setEventEmotionImage(this.heroEmotionImage, state.heroEmotion);
    }
    const activeMap = this.maps.get(this.currentMapId);
    if (activeMap === undefined) return;
    for (const [sourceOrderText, emotionIndex] of Object.entries(state.npcEmotions)) {
      const sprite = activeMap.npcSprites.get(Number(sourceOrderText));
      if (sprite !== undefined) this.setEventEmotionImage(sprite.emotionImage, emotionIndex);
    }
  }

  private setEventEmotionImage(
    image: Phaser.GameObjects.Image,
    emotionIndex: number | null,
  ): void {
    image.setData('sourceEmotionFrame', 0).setY(-39);
    if (emotionIndex === null) {
      image.setVisible(false);
      return;
    }
    image.setTexture(`world-emotion-${emotionIndex}`).setVisible(true);
  }

  private advanceEventEmotionAnimation(map: RenderedWorld, sourcePaintPasses: number): void {
    const viewport = this.cameras.main.worldView;
    const isPainted = (x: number, y: number): boolean =>
      x + 16 >= viewport.x && y >= viewport.y &&
      x - 16 <= viewport.x + viewport.width &&
      y <= viewport.y + viewport.height + 32;
    const advance = (image: Phaser.GameObjects.Image): void => {
      if (!image.visible) return;
      const frameIndex = image.getData('sourceEmotionFrame');
      const nextFrame = advanceSourceEmotionFrame(
        typeof frameIndex === 'number' ? frameIndex : 0,
        sourcePaintPasses,
      );
      image.setData('sourceEmotionFrame', nextFrame).setY(-39 + nextFrame);
    };
    if (this.heroEmotionImage !== null && this.heroContainer !== null &&
      this.heroContainer.visible &&
      isPainted(this.heroContainer.x, this.heroContainer.y)) {
      advance(this.heroEmotionImage);
    }
    for (const sprite of map.npcSprites.values()) {
      if (sprite.container.visible && isPainted(sprite.container.x, sprite.container.y)) {
        advance(sprite.emotionImage);
      }
    }
  }

  private updateHeroSprite(): void {
    if (this.heroContainer === null || this.bodyLayout === null || this.armorLayout === null ||
      this.effectLayout === null || this.headLayout === null || this.alternateHeadLayout === null ||
      this.weaponLayout === null) return;
    const pose = playerSpritePose(
      this.playerCombo,
      this.actor.direction,
      this.actor.moving,
      this.actor.animationFrame,
      this.hudState.hp <= 0,
    );
    const directionSlot = pose.directionSlot;
    const animationSlot = pose.animationSlot;
    const frameIndex = pose.frameIndex;
    const activeSkillElement = sourcePlayerSkillElement(this.playerSkillAction.skillId);
    const parts: Array<{ layer: number; sourceOrder: number; partOrder: number; folder: string; part: CharacterSpritePart }> = [];
    const appendLayoutParts = (
      layout: CharacterSpriteLayout,
      componentSlots: readonly number[],
      folder: string,
    ): void => {
      for (const componentSlot of componentSlots) {
        const record = findSpriteRecord(layout, componentSlot, animationSlot, directionSlot);
        const frameParts = this.heroFrame(record?.frames, frameIndex);
        frameParts.forEach((part, partOrder) => {
          if (part.imageIndex !== 255) {
            parts.push({ layer: componentSlot, sourceOrder: record?.sourceOrder ?? 0, partOrder, folder, part });
          }
        });
      }
    };

    appendLayoutParts(this.bodyLayout, [0], 'b');

    const armor = this.equipmentSlots[1];
    if (armor !== null) {
      const armorAtlas = heroArmorAtlas(this.heroClassId, armor.itemId);
      if (armorAtlas !== null) appendLayoutParts(this.armorLayout, [2, 3, 4, 5], `a${armorAtlas}`);
    }

    const head = this.equipmentSlots[3];
    const headItemId = head?.itemId ?? 0;
    const headAtlas = heroHeadAtlas(headItemId);
    if (headAtlas !== null) {
      const layout = heroHeadLayout(headItemId) === 'hA' ? this.headLayout : this.alternateHeadLayout;
      appendLayoutParts(layout, [1], `h${headAtlas}`);
    }

    const shield = this.equipmentSlots[2];
    if (shield !== null && this.shieldLayout !== null) {
      const shieldAtlas = heroShieldAtlas(this.heroClassId, shield.itemId);
      if (shieldAtlas !== null) {
        const componentSlots = [...new Set(this.shieldLayout.records.map(({ componentSlot }) => componentSlot))];
        appendLayoutParts(this.shieldLayout, componentSlots, `s${shieldAtlas}`);
      }
    }

    const canDrawWeaponLayers = ![1, 5, 9, 15].includes(this.maps.get(this.currentMapId)?.tilesetId ?? 0);
    if (canDrawWeaponLayers) {
      const weapon = this.equipmentSlots[0];
      if (weapon !== null) {
        const weaponAtlas = heroWeaponAtlas(this.heroClassId, weapon.itemId);
        if (weaponAtlas !== null) {
          appendLayoutParts(this.weaponLayout, [6], heroWeaponAtlasFolder(weaponAtlas, activeSkillElement));
        }
      }
      appendLayoutParts(this.effectLayout, [7], heroEffectAtlasFolder(activeSkillElement));
    }

    parts.sort((left, right) => left.layer - right.layer ||
      left.sourceOrder - right.sourceOrder || left.partOrder - right.partOrder);
    this.syncHeroParts(parts);
  }

  private heroFrame(frames: CharacterSpritePart[][] | undefined, frameIndex: number): CharacterSpritePart[] {
    if (frames === undefined || frames.length === 0) return [];
    const index = ((frameIndex % frames.length) + frames.length) % frames.length;
    return frames[index] ?? [];
  }

  private syncHeroParts(parts: Array<{ folder: string; part: CharacterSpritePart }>): void {
    if (this.heroContainer === null) return;
    parts.forEach(({ folder, part }, index) => {
      const texture = `hero-c${this.heroSpriteResourceClass}-${folder}-${part.imageIndex}`;
      let image = this.heroParts.get(index);
      if (image === undefined) {
        image = this.add.image(part.x, part.y, texture).setOrigin(0, 0);
        this.heroContainer!.add(image);
        this.heroParts.set(index, image);
      } else {
        image.setTexture(texture).setPosition(part.x, part.y).setVisible(true);
      }
      image.setFlipX(part.mirrored);
    });
    for (const [index, image] of this.heroParts) {
      if (index >= parts.length) image.setVisible(false);
    }
  }

  private bindMovementKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) return;
    const directions: Record<string, Direction> = {
      ArrowUp: 1,
      ArrowDown: 2,
      ArrowLeft: 3,
      ArrowRight: 4,
      '8': 1,
      '2': 2,
      '4': 3,
      '6': 4,
    };
    const keydown = (event: KeyboardEvent): void => {
      if (this.loadingMapTransition) {
        event.preventDefault();
        return;
      }
      if (this.systemMenuVisible) {
        event.preventDefault();
        if (event.repeat) return;
        if (this.commerceMenu !== null) {
          this.handleCommerceMenuKey(event);
          return;
        }
        if (this.skillMenuVisible) {
          if (this.skillLevelMenuVisible) {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              this.skillLevelActionButton = event.key === 'ArrowLeft' ? '1' : '3';
              const skillId = this.skillIds[this.skillSelection];
              if (skillId !== undefined) {
                const state = this.playerSkillState(skillId);
                this.skillLevelSelection = (this.skillLevelActionButton === '1'
                  ? state.skillLevelSlotOne
                  : state.skillLevelSlotThree) ?? 0;
              }
              this.systemMenuMessage = '';
              this.renderSkillLevelMenu();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              const delta = event.key === 'ArrowUp' ? -1 : 1;
              this.skillLevelSelection = (this.skillLevelSelection + delta + 3) % 3 as PlayerSkillLevelSlot;
              this.systemMenuMessage = '';
              this.renderSkillLevelMenu();
            } else if (event.key === 'Enter' || event.key === ' ') {
              this.assignSkillLevelSelection();
            } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w' || event.key === 'Tab') {
              this.skillLevelMenuVisible = false;
              this.systemMenuMessage = '';
              this.renderSkillMenu();
            }
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (this.skillIds.length > 0) {
              const delta = event.key === 'ArrowUp' ? -1 : 1;
              this.skillSelection = (this.skillSelection + delta + this.skillIds.length) % this.skillIds.length;
            }
            this.systemMenuMessage = '';
            this.renderSkillMenu();
          } else if (event.key === 'Enter' || event.key === ' ') {
            this.activateSkillSelection();
          } else if (event.key === 'Tab' || event.key === 'ArrowRight') {
            this.openSkillLevelMenu();
          } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
            this.skillMenuVisible = false;
            this.skillLevelMenuVisible = false;
            this.systemMenuMessage = '';
            this.renderSystemMenu();
          }
        } else if (this.attributeMenuVisible) {
          this.handleAttributeMenuKey(event);
        } else if (this.inventoryMenuVisible) {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const delta = event.key === 'ArrowUp' ? -1 : 1;
            if (this.equipmentMenuMode === 'slots') {
              this.equipmentSlotSelection = (this.equipmentSlotSelection + delta + EQUIPMENT_SLOT_LABELS.length) %
                EQUIPMENT_SLOT_LABELS.length;
            } else if (this.equipmentMenuMode === 'slot-items') {
              this.moveCompatibleEquipmentSelection(delta);
            } else if (this.inventory.length > 0) {
              this.inventorySelection = (this.inventorySelection + delta + this.inventory.length) % this.inventory.length;
            }
            this.systemMenuMessage = '';
            this.renderInventoryMenu();
          } else if (event.key === 'Enter' || event.key === ' ') {
            if (this.equipmentMenuMode === 'slots') this.openCompatibleEquipmentItems();
            else if (this.equipmentMenuMode === 'slot-items') {
              this.equipInventorySelection(this.equipmentSlotSelection);
            } else this.activateInventorySelection();
          } else if (event.key === 'Tab') {
            this.equipmentMenuMode = this.equipmentMenuMode === 'bag' ? 'slots' : 'bag';
            this.systemMenuMessage = '';
            this.renderInventoryMenu();
          } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
            this.backFromInventoryMenu();
          }
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const delta = event.key === 'ArrowUp' ? -1 : 1;
          this.systemMenuSelection = (this.systemMenuSelection + delta + 5) % 5;
          this.systemMenuMessage = '';
          this.renderSystemMenu();
        } else if (event.key === 'Enter' || event.key === ' ') {
          if (this.systemMenuSelection === 0) this.openAttributeMenu();
          else if (this.systemMenuSelection === 1) this.openInventoryMenu();
          else if (this.systemMenuSelection === 2) this.openSkillMenu();
          else if (this.systemMenuSelection === 3) this.saveCurrentGame();
          else this.closeSystemMenu();
        } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
          this.closeSystemMenu();
        }
        return;
      }
      if (this.openingDialogVisible || this.worldDialogueVisible) {
        event.preventDefault();
        if (this.openingDialogVisible && event.key.toLowerCase() === 'w') {
          this.skipOpeningCutscene();
        } else if (this.openingDialogVisible && this.openingCutsceneState?.status === 'choice' &&
          !event.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          this.moveEventChoiceSelection();
        } else if (this.openingDialogVisible && this.openingCutsceneState?.status === 'choice' &&
          (event.key === 'Enter' || event.key === ' ')) {
          this.confirmEventChoice();
        } else if (event.key === 'Enter' || event.key === ' ') {
          this.advanceDialogue();
        }
        return;
      }
      if (this.hudState.hp <= 0) {
        event.preventDefault();
        return;
      }
      if (event.key === '#' || event.code === 'NumpadMultiply') {
        event.preventDefault();
        if (!event.repeat) this.cycleSelectedItem();
        return;
      }
      if (event.key === '9' || event.code === 'Numpad9') {
        event.preventDefault();
        if (!event.repeat) this.useSelectedItem();
        return;
      }
      if (event.key === '5' || event.code === 'Numpad5') {
        event.preventDefault();
        this.performBasicAttack('light');
        return;
      }
      if (event.key === '7' || event.code === 'Numpad7') {
        event.preventDefault();
        this.performBasicAttack('heavy');
        return;
      }
      if (event.key === '1' || event.code === 'Numpad1') {
        event.preventDefault();
        if (!event.repeat) this.performPlayerSkill(0);
        return;
      }
      if (event.key === '3' || event.code === 'Numpad3') {
        event.preventDefault();
        if (!event.repeat) this.performPlayerSkill(1);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.dispatchInteractionTrigger();
        return;
      }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
        event.preventDefault();
        this.openSystemMenu();
        return;
      }
      const direction = directions[event.key] ?? directions[event.key.toLowerCase()];
      if (direction === undefined || this.playerCombo.activeStyle !== null || this.playerCombo.queuedStyle !== null ||
        this.playerCombo.recoveryTicks > 0 || this.actor.moving && this.pressedDirections.some(({ code }) => code === event.code)) return;
      event.preventDefault();
      this.pressedDirections = this.pressedDirections.filter(({ code }) => code !== event.code);
      this.pressedDirections.push({ code: event.code, direction });
      this.actor = requestActorDirection(this.actor, direction);
    };
    const keyup = (event: KeyboardEvent): void => {
      if (!this.pressedDirections.some(({ code }) => code === event.code)) return;
      event.preventDefault();
      this.pressedDirections = this.pressedDirections.filter(({ code }) => code !== event.code);
      if (this.hudState.hp <= 0) return;
      const next = this.pressedDirections.at(-1);
      if (next === undefined) {
        const released = releaseActorDirectionAndCheckBoundary(this.actor);
        this.actor = released.actor;
        if (released.reachedMapEventBoundary) this.tryMapTransition();
      } else {
        this.actor = requestActorDirection(this.actor, next.direction);
      }
    };
    keyboard.on('keydown', keydown);
    keyboard.on('keyup', keyup);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown', keydown);
      keyboard.off('keyup', keyup);
    });

    const pointerUp = (pointer: Phaser.Input.Pointer): void => {
      if (this.systemMenuVisible) {
        if (this.commerceMenu !== null) {
          this.handleCommerceMenuPointer(pointer);
          return;
        }
        if (this.skillMenuVisible) {
          if (this.skillLevelMenuVisible) this.handleSkillLevelMenuPointer(pointer.x, pointer.y);
          else this.handleSkillMenuPointer(pointer.y);
        } else if (this.attributeMenuVisible) {
          this.handleAttributeMenuPointer(pointer);
        } else if (this.inventoryMenuVisible) {
          this.handleInventoryMenuPointer(pointer.y);
        } else if (pointer.y >= 128 && pointer.y < 213) {
          const selection = Math.min(4, Math.floor((pointer.y - 128) / 17));
          this.systemMenuSelection = selection;
          if (selection === 0) this.openAttributeMenu();
          else if (selection === 1) this.openInventoryMenu();
          else if (selection === 2) this.openSkillMenu();
          else if (selection === 3) this.saveCurrentGame();
          else this.closeSystemMenu();
        }
        return;
      }
      if ((this.openingDialogVisible || this.worldDialogueVisible) && pointer.y >= 307) {
        if (this.openingDialogVisible && pointer.x >= 180) this.skipOpeningCutscene();
        else if (pointer.x <= 80) this.advanceDialogue();
      }
      const state = this.openingCutsceneState;
      if (this.openingDialogVisible && state?.status === 'choice' &&
        pointer.y >= 140 && pointer.y <= 190) {
        this.confirmEventChoice(pointer.y < 158 ? 0 : 1);
      }
    };
    this.input.on('pointerup', pointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off('pointerup', pointerUp));

    const advanceSourcePaintAnimationsAfterRender = (): void => {
      if (!this.scene.isVisible()) {
        this.pendingNpcAnimationPasses = 0;
        this.pendingSkillAttachedVisualPasses = 0;
        return;
      }
      const sourcePaintPasses = this.pendingNpcAnimationPasses;
      this.pendingNpcAnimationPasses = 0;
      const skillAttachedVisualPasses = this.pendingSkillAttachedVisualPasses;
      this.pendingSkillAttachedVisualPasses = 0;
      if (sourcePaintPasses === 0 && skillAttachedVisualPasses === 0) return;
      const activeMap = this.maps.get(this.currentMapId);
      if (activeMap === undefined) return;
      if (sourcePaintPasses > 0) {
        this.advanceEventEmotionAnimation(activeMap, sourcePaintPasses);
        this.advancePlayerLevelUpFlashes(sourcePaintPasses);
        activeMap.enemies = [...updateEnemySourceViewportOnPaint(
          activeMap.enemies,
          this.cameras.main.worldView,
          sourcePaintPasses,
        )];
        this.advanceNpcSpriteAnimations(activeMap, sourcePaintPasses);
      }
      if (skillAttachedVisualPasses > 0) {
        // Source `n.b(Graphics,...)` advances each attached `bi` after drawing it.
        this.playerAttachedSkillVisuals = advancePlayerSkillAttachedVisuals(
          this.playerAttachedSkillVisuals,
          skillAttachedVisualPasses,
        );
        activeMap.enemyAttachedSkillVisuals = advancePlayerSkillAttachedVisuals(
          activeMap.enemyAttachedSkillVisuals,
          skillAttachedVisualPasses,
        );
        this.syncPlayerAttachedSkillVisualSprites();
        this.syncEnemyAttachedSkillVisualSprites(activeMap);
      }
    };
    this.game.events.on(Phaser.Core.Events.POST_RENDER, advanceSourcePaintAnimationsAfterRender);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, advanceSourcePaintAnimationsAfterRender);
      this.pendingNpcAnimationPasses = 0;
      this.pendingSkillAttachedVisualPasses = 0;
    });
  }

  private createOpeningDialog(): void {
    if (this.fontLayout === null) return;
    if (this.openingDialogOverlay !== null) {
      this.openingDialogOverlay.setVisible(true);
      this.renderOpeningDialog();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 320;
    const context = canvas.getContext('2d');
    if (context === null) return;
    this.openingDialogContext = context;
    context.imageSmoothingEnabled = false;
    const texture = this.textures.addCanvas('opening-dialog-overlay', canvas);
    if (texture === null) return;
    this.openingDialogTexture = texture;
    this.openingDialogOverlay = this.add.image(0, 0, texture)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100000);
    this.renderOpeningDialog();
  }

  private setOpeningDialogueText(text: string): void {
    if (this.openingDialogueText === text) return;
    this.openingDialogueText = text;
    this.dialogueRevealElapsedMs = 0;
  }

  private advanceDialogueReveal(elapsedMs: number): void {
    if (this.gameOptions.speech || (!this.openingDialogVisible && !this.worldDialogueVisible)) return;
    const totalCharacters = [...this.openingDialogueText].length;
    const previousCount = Math.floor(this.dialogueRevealElapsedMs / WORLD_UPDATE_PERIOD_MS);
    this.dialogueRevealElapsedMs = Math.min(
      totalCharacters * WORLD_UPDATE_PERIOD_MS,
      this.dialogueRevealElapsedMs + elapsedMs,
    );
    const nextCount = Math.floor(this.dialogueRevealElapsedMs / WORLD_UPDATE_PERIOD_MS);
    if (nextCount !== previousCount) this.renderOpeningDialog();
  }

  private isDialogueRevealing(): boolean {
    return !this.gameOptions.speech &&
      this.dialogueRevealElapsedMs < [...this.openingDialogueText].length * WORLD_UPDATE_PERIOD_MS;
  }

  private revealDialogueImmediately(): void {
    this.dialogueRevealElapsedMs = [...this.openingDialogueText].length * WORLD_UPDATE_PERIOD_MS;
    this.renderOpeningDialog();
  }

  private visibleDialogueText(text: string): string {
    if (this.gameOptions.speech) return text;
    const visibleCharacters = Math.floor(this.dialogueRevealElapsedMs / WORLD_UPDATE_PERIOD_MS);
    return [...text].slice(0, visibleCharacters).join('');
  }

  private renderOpeningDialog(): void {
    const context = this.openingDialogContext;
    const fontLayout = this.fontLayout;
    if (context === null || fontLayout === null) return;
    context.clearRect(0, 0, 240, 320);
    const state = this.openingCutsceneState;
    if (this.openingDialogVisible && state?.status === 'choice') {
      context.strokeStyle = '#1f1f3f';
      context.strokeRect(60, 116, 120, 72);
      context.strokeStyle = '#5f5f5f';
      context.strokeRect(61, 117, 118, 70);
      context.fillStyle = '#000000';
      context.fillRect(62, 118, 116, 68);
      const fontAtlas = this.textures.get('world-font-atlas').getSourceImage() as CanvasImageSource;
      const question = this.visibleDialogueText(this.openingDialogueText).split('\n').slice(0, 2);
      for (const [index, line] of question.entries()) {
        drawBitmapText(context, fontAtlas, fontLayout, line, 66, 123 + index * 8, '#ffffff', 'left');
      }
      const yes = resolveLanguageString(this.worldLanguage, 2343) ?? 'Yes';
      const no = resolveLanguageString(this.worldLanguage, 2344) ?? 'No';
      const options = [yes, no];
      options.forEach((option, index) => {
        const y = 151 + index * 12;
        if (state.choiceSelection === index) {
          drawBitmapText(context, fontAtlas, fontLayout, '>', 67, y, '#ffffff', 'left');
        }
        drawBitmapText(context, fontAtlas, fontLayout, option, 77, y, '#ffffff', 'left');
      });
      this.openingDialogTexture?.refresh();
      return;
    }
    context.strokeStyle = '#1f1f3f';
    context.strokeRect(4, 269, 231, 40);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(5, 270, 229, 38);
    context.fillStyle = '#000000';
    context.fillRect(6, 271, 227, 36);
    context.fillStyle = '#04a98b';
    context.fillRect(23, 311, 188, 1);
    context.fillStyle = '#81d7c4';
    context.fillRect(24, 312, 185, 1);
    const fontAtlas = this.textures.get('world-font-atlas').getSourceImage() as CanvasImageSource;
    for (const [index, line] of this.visibleDialogueText(this.openingDialogueText).split('\n').slice(0, 3).entries()) {
      drawBitmapText(context, fontAtlas, fontLayout, line, 14, 275 + index * 8, '#ffffff', 'left');
    }
    drawBitmapText(context, fontAtlas, fontLayout, 'Next', 1, 310, '#ffffff', 'left');
    if (this.openingDialogVisible) {
      drawBitmapText(context, fontAtlas, fontLayout, 'Skip', 239, 310, '#ffffff', 'right');
    }
    this.openingDialogTexture?.refresh();
  }

  private queueNpcTextures(
    events: EventOperationData,
    queueImage: (key: string, path: string) => void,
  ): NpcTextureKeys {
    const textureKeys: NpcTextureKeys = new Map();
    const imageIds = new Set([
      ...events.npcPlacements.map(({ imageId }) => imageId),
      ...events.scripts.flatMap((script) => script.flatMap(([opcode, , imageId]) =>
        opcode === 41 ? [imageId] : [])),
    ]);
    for (const imageId of imageIds) {
      const animation = this.npcAnimations.get(imageId);
      const textureSource = sourceNpcTextureSource(imageId, animation !== undefined);
      if (animation !== undefined) {
        if (textureSource?.kind !== 'animated') {
          throw new TypeError(`Animated NPC ${imageId} has no texture source`);
        }
        const componentImageIndices = new Set(animation.tracks.flatMap((track) =>
          track.frames.flatMap((frame) => frame
            .filter(({ imageIndex }) => imageIndex >= 0)
            .map(({ imageIndex }) => imageIndex))));
        for (const imageIndex of componentImageIndices) {
          const key = `world-npc-frame-${imageId}-${imageIndex}`;
          textureKeys.set(`${imageId}:${imageIndex}`, key);
          queueImage(
            key,
            `${textureSource.atlasDirectory}/${String(imageIndex).padStart(3, '0')}.png`,
          );
        }
      } else if (textureSource?.kind === 'static') {
        const key = `world-npc-${imageId}`;
        textureKeys.set(String(imageId), key);
        queueImage(key, textureSource.imagePath);
      }
    }
    return textureKeys;
  }

  private queueEnemySpriteTextures(
    enemyIds: readonly number[],
    queueImage: (key: string, path: string) => void,
  ): EnemyTextureSets {
    const textureSets: EnemyTextureSets = new Map();
    for (const enemyId of new Set(enemyIds)) {
      const animation = this.enemyAnimations.get(enemyId);
      const bossAnimation = this.bossAnimations.get(enemyId);
      const effect = this.enemyAttackEffects.get(enemyId);
      const bossEffect = bossAnimation === undefined
        ? undefined
        : this.bossAttackEffects.get(bossAnimation.enemyId);
      const imageIndices = [...new Set([
        ...(animation?.tracks.flatMap((track) => track.frames.flatMap((frame) =>
          frame.map(({ imageIndex }) => imageIndex))) ?? []),
        ...(bossAnimation?.tracks.flatMap((track) => track.frames.flatMap((frame) =>
          frame.map(({ imageIndex }) => imageIndex))) ?? []),
        ...(effect?.frames.flatMap((frame) => frame.map(({ imageIndex }) => imageIndex)) ?? []),
        ...(bossEffect?.frames.flatMap((frame) => frame.map(({ imageIndex }) => imageIndex)) ?? []),
      ].filter((imageIndex) => imageIndex >= 0))];
      const textures: EnemyTextureSet = new Map();
      for (const imageIndex of imageIndices) {
        const key = bossAnimation === undefined
          ? `world-enemy-${enemyId}-sprite-${imageIndex}`
          : `world-boss-${bossAnimation.bossId}-${bossAnimation.enemyId}-sprite-${imageIndex}`;
        textures.set(imageIndex, key);
        queueImage(
          key,
          bossAnimation === undefined
            ? `/assets/generated/atlases/enm/${String(enemyId).padStart(2, '0')}/${String(imageIndex).padStart(3, '0')}.png`
            : `/assets/generated/atlases/boss/${String(bossAnimation.bossId)}/${String(imageIndex).padStart(3, '0')}.png`,
        );
      }
      textureSets.set(enemyId, textures);
    }
    return textureSets;
  }

  private setEnemySpriteFrame(
    container: Phaser.GameObjects.Container,
    spriteId: number,
    textureSet: EnemyTextureSet | undefined,
    stateIndex: number,
    direction: Direction,
    frameIndex: number,
  ): void {
    const bossAnimation = this.bossAnimations.get(spriteId);
    if (bossAnimation !== undefined) {
      if (stateIndex < 0 || stateIndex > 5) return;
      const track = findBossSpriteTrack(bossAnimation, stateIndex as BossSpriteState, direction);
      const components = bossSpriteFrameAt(track, Math.max(0, frameIndex))
        .filter((component) => component.imageIndex >= 0 && textureSet?.has(component.imageIndex));
      while (container.length > components.length) container.removeAt(container.length - 1, true);
      for (const [index, component] of components.entries()) {
        const textureKey = textureSet!.get(component.imageIndex)!;
        let image = container.getAt(index) as Phaser.GameObjects.Image | undefined;
        if (image === undefined) {
          image = this.add.image(component.offsetX, component.offsetY, textureKey)
            .setOrigin(0, 0)
            .setFlipX(component.mirrored);
          container.add(image);
        } else {
          image.setTexture(textureKey)
            .setPosition(component.offsetX, component.offsetY)
            .setOrigin(0, 0)
            .setFlipX(component.mirrored)
            .setVisible(true);
        }
      }
      return;
    }
    const animation = this.enemyAnimations.get(spriteId);
    if (animation === undefined || textureSet === undefined || stateIndex < 0 || stateIndex > 2) return;
    const track = findEnemySpriteTrack(animation, stateIndex as 0 | 1 | 2, direction);
    const components = enemySpriteFrameAt(track, Math.max(0, frameIndex))
      .filter((component) => component.imageIndex >= 0 && textureSet.has(component.imageIndex));
    while (container.length > components.length) container.removeAt(container.length - 1, true);
    for (const [index, component] of components.entries()) {
      const textureKey = textureSet.get(component.imageIndex)!;
      let image = container.getAt(index) as Phaser.GameObjects.Image | undefined;
      if (image === undefined) {
        image = this.add.image(component.offsetX, component.offsetY, textureKey)
          .setOrigin(0, 0)
          .setFlipX(component.mirrored);
        container.add(image);
      } else {
        image.setTexture(textureKey)
          .setPosition(component.offsetX, component.offsetY)
          .setOrigin(0, 0)
          .setFlipX(component.mirrored)
          .setVisible(true);
      }
    }
  }

  private setEnemyAttackEffectFrame(
    container: Phaser.GameObjects.Container,
    spriteId: number,
    textureSet: EnemyTextureSet | undefined,
    frameIndex: number,
  ): void {
    const effect = this.attackEffectForSprite(spriteId);
    if (effect === undefined || textureSet === undefined || frameIndex >= effect.frameCount) {
      while (container.length > 0) container.removeAt(container.length - 1, true);
      return;
    }
    const components = effect.frames[frameIndex]
      .filter((component) => component.imageIndex >= 0 && textureSet.has(component.imageIndex));
    while (container.length > components.length) container.removeAt(container.length - 1, true);
    for (const [index, component] of components.entries()) {
      const textureKey = textureSet.get(component.imageIndex)!;
      let image = container.getAt(index) as Phaser.GameObjects.Image | undefined;
      if (image === undefined) {
        image = this.add.image(component.offsetX, component.offsetY, textureKey)
          .setOrigin(0, 0)
          .setFlipX(component.mirrored);
        container.add(image);
      } else {
        image.setTexture(textureKey)
          .setPosition(component.offsetX, component.offsetY)
          .setOrigin(0, 0)
          .setFlipX(component.mirrored)
          .setVisible(true);
      }
    }
  }

  private addPlayerSkillVisual(map: RenderedWorld, visual: PlayerSkillVisualSpawn): void {
    map.playerSkillVisuals.push({
      ...visual,
      id: map.nextPlayerSkillVisualId,
      frameIndex: 0,
    });
    map.nextPlayerSkillVisualId += 1;
  }

  private addPlayerAttachedSkillVisual(
    visual: Parameters<typeof createPlayerSkillAttachedVisual>[1],
    target: PlayerSkillAttachedVisualTarget,
  ): void {
    this.playerAttachedSkillVisuals.push(createPlayerSkillAttachedVisual(
      this.nextPlayerAttachedSkillVisualId++, visual, target,
      this.pendingSkillAttachedVisualPasses,
    ));
  }

  private addEnemyAttachedSkillVisual(
    map: RenderedWorld,
    visual: Parameters<typeof createPlayerSkillAttachedVisual>[1],
    sourceOrder: number,
  ): void {
    map.enemyAttachedSkillVisuals.push(createPlayerSkillAttachedVisual(
      this.nextPlayerAttachedSkillVisualId++, visual, { kind: 'enemy', sourceOrder },
      this.pendingSkillAttachedVisualPasses,
    ));
  }

  private setAttachedSkillEffectFrame(
    container: Phaser.GameObjects.Container,
    visual: ActivePlayerSkillAttachedVisual,
  ): void {
    while (container.length > 0) container.removeAt(container.length - 1, true);
    if (visual.frameIndex < 0) return;
    const elementCode = sourcePlayerSkillElement(visual.skillId);
    if (elementCode === 0) return;
    const atlasFamily = elementCode === 1 ? 'fi' : elementCode === 2 ? 'wa' : 'gr';
    const textureForImage = (imageIndex: number): string =>
      `world-player-skill-atlas-${atlasFamily}-${imageIndex}`;
    if (visual.kind === 'skill-0-aura') {
      for (const layer of playerSkillAuraLayers(visual.frameIndex)) {
        const textureKey = textureForImage(layer.imageIndex);
        if (!this.textures.exists(textureKey)) continue;
        container.add(this.add.image(0, layer.yOffset, textureKey).setOrigin(0.5, 1));
      }
      return;
    }
    if (visual.sourceStreamSlot === null || this.playerSkillEffects === null) return;
    const effect = findPlayerSkillEffect(
      this.playerSkillEffects,
      visual.skillId,
      visual.sourceStreamSlot,
    );
    const components = effect?.frames[visual.frameIndex] ?? [];
    for (const component of components) {
      if (component.sourceAtlasFlag !== 0) continue;
      const textureKey = textureForImage(component.imageIndex);
      if (!this.textures.exists(textureKey)) continue;
      container.add(this.add.image(component.offsetX, component.offsetY, textureKey).setOrigin(1, 0));
    }
  }

  private syncPlayerAttachedSkillVisualSprites(): void {
    const activeIds = new Set(this.playerAttachedSkillVisuals.map(({ id }) => id));
    for (const [id, sprite] of this.playerAttachedSkillVisualSprites) {
      if (activeIds.has(id)) continue;
      sprite.destroy();
      this.playerAttachedSkillVisualSprites.delete(id);
    }
    for (const visual of this.playerAttachedSkillVisuals) {
      let sprite = this.playerAttachedSkillVisualSprites.get(visual.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        this.playerAttachedSkillVisualSprites.set(visual.id, sprite);
      }
      sprite.setPosition(this.actor.x + 8, this.actor.y + 9)
        .setDepth(this.actor.y + 17)
        .setVisible(visual.frameIndex >= 0);
      this.setAttachedSkillEffectFrame(sprite, visual);
    }
  }

  private syncEnemyAttachedSkillVisualSprites(map: RenderedWorld): void {
    const attachedEnemies = new Map(map.enemies
      .filter((enemy) => enemy.state === 'alive' || enemy.state === 'death-pending')
      .map((enemy) => [enemy.sourceOrder, enemy] as const));
    const renderableVisuals = map.enemyAttachedSkillVisuals.filter((visual) =>
      visual.target.kind === 'enemy' && attachedEnemies.has(visual.target.sourceOrder));
    const activeIds = new Set(renderableVisuals.map(({ id }) => id));
    for (const [id, sprite] of map.enemyAttachedSkillVisualSprites) {
      if (activeIds.has(id)) continue;
      sprite.destroy();
      map.enemyAttachedSkillVisualSprites.delete(id);
      map.objects = map.objects.filter((object) => object !== sprite);
    }
    for (const visual of renderableVisuals) {
      if (visual.target.kind !== 'enemy') continue;
      const enemy = attachedEnemies.get(visual.target.sourceOrder);
      if (enemy === undefined) continue;
      let sprite = map.enemyAttachedSkillVisualSprites.get(visual.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        map.enemyAttachedSkillVisualSprites.set(visual.id, sprite);
        map.objects.push(sprite);
      }
      sprite.setPosition(enemy.pixelX + 8, enemy.pixelY + 9)
        .setDepth(enemy.pixelY + 17 + (enemy.sourceRenderOffsetY ?? 0))
        .setVisible(visual.frameIndex >= 0);
      this.setAttachedSkillEffectFrame(sprite, visual);
    }
  }

  private setPlayerSkillEffectFrame(
    container: Phaser.GameObjects.Container,
    visual: ActivePlayerSkillVisual,
  ): void {
    while (container.length > 0) container.removeAt(container.length - 1, true);
    const catalog = this.playerSkillEffects;
    const elementCode = sourcePlayerSkillElement(visual.skillId);
    if (catalog === null || elementCode === null) return;
    const atlasFamily = elementCode === 1 ? 'fi' : elementCode === 2 ? 'wa' : 'gr';
    const textureForImage = (imageIndex: number): string =>
      `world-player-skill-atlas-${atlasFamily}-${imageIndex}`;
    const addAtlasImage = (
      imageIndex: number,
      x: number,
      y: number,
      originX = 0,
      originY = 0,
    ): void => {
      const textureKey = textureForImage(imageIndex);
      if (!this.textures.exists(textureKey)) return;
      container.add(this.add.image(x, y, textureKey).setOrigin(originX, originY));
    };

    if (visual.effectType === 10) {
      if (visual.frameIndex === 0) addAtlasImage(0, 0, 0, 0, 0.5);
      else if (visual.frameIndex === 1) {
        addAtlasImage(0, 0, 0, 0, 0.5);
        addAtlasImage(1, 0, 3, 0, 0.5);
      } else addAtlasImage(1, 0, 3, 0, 0.5);
      return;
    }

    const risingEffect = visual.effectType === 4 || visual.effectType === 5 || visual.effectType === 7;
    if (risingEffect && visual.frameIndex < 3) {
      const imageIndex = visual.effectType === 4 ? 8 : 11;
      const textureKey = textureForImage(imageIndex);
      if (!this.textures.exists(textureKey)) return;
      const image = this.add.image(0, 0, textureKey).setOrigin(0, 0.5);
      const verticalOffsets = [0.7, 0.5, 0.3] as const;
      image.setY(image.height * verticalOffsets[visual.frameIndex]);
      container.add(image);
      return;
    }

    const sourceFrameIndex = visual.frameIndex - (risingEffect ? 3 : 0);
    const components = playerSkillEffectFrameComponents(
      catalog,
      visual.effectType,
      visual.skillId,
      visual.levelSlot,
      sourceFrameIndex,
    );
    for (const component of components) {
      if (component.sourceAtlasFlag !== 0) continue;
      addAtlasImage(component.imageIndex, component.offsetX, component.offsetY);
    }
  }

  private syncPlayerSkillVisualSprites(map: RenderedWorld): void {
    const activeVisualIds = new Set(map.playerSkillVisuals.map(({ id }) => id));
    for (const [id, sprite] of map.playerSkillVisualSprites) {
      if (activeVisualIds.has(id)) continue;
      sprite.destroy();
      map.playerSkillVisualSprites.delete(id);
      map.objects = map.objects.filter((object) => object !== sprite);
    }
    for (const visual of map.playerSkillVisuals) {
      let sprite = map.playerSkillVisualSprites.get(visual.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        map.playerSkillVisualSprites.set(visual.id, sprite);
        map.objects.push(sprite);
      }
      const x = visual.tileX * 16;
      const y = visual.tileY * 16;
      sprite.setPosition(x, y).setDepth(y + 8);
      this.setPlayerSkillEffectFrame(sprite, visual);
    }
  }

  private attackEffectForSprite(spriteId: number): EnemyAttackEffect | undefined {
    const bossAnimation = this.bossAnimations.get(spriteId);
    if (bossAnimation !== undefined) return this.bossAttackEffects.get(bossAnimation.enemyId);
    return this.enemyAttackEffects.get(spriteId);
  }

  private syncEnemyAttackSprites(map: RenderedWorld): void {
    const activeProjectileIds = new Set(map.enemyProjectiles.map(({ id }) => id));
    for (const [id, sprite] of map.enemyProjectileSprites) {
      if (!activeProjectileIds.has(id)) {
        sprite.destroy();
        map.enemyProjectileSprites.delete(id);
        map.objects = map.objects.filter((object) => object !== sprite);
      }
    }
    for (const projectile of map.enemyProjectiles) {
      const effect = this.attackEffectForSprite(projectile.spriteId);
      const textureSet = map.enemyTextureKeys.get(projectile.spriteId);
      if (effect === undefined || textureSet === undefined) continue;
      let sprite = map.enemyProjectileSprites.get(projectile.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        map.enemyProjectileSprites.set(projectile.id, sprite);
        map.objects.push(sprite);
      }
      const delta = {
        1: { x: 0, y: -1 }, 2: { x: 0, y: 1 },
        3: { x: -1, y: 0 }, 4: { x: 1, y: 0 },
      }[projectile.direction];
      const displayFrameIndex = Math.max(0, projectile.frameIndex - 1);
      const halfTileOffset = effect.frameCount === 2 && projectile.frameIndex === 2 ? 8 : 0;
      const x = projectile.tileX * 16 + 8 + delta.x * halfTileOffset;
      const y = projectile.tileY * 16 + 9 + delta.y * halfTileOffset;
      sprite.setPosition(x, y).setDepth(y);
      this.setEnemyAttackEffectFrame(sprite, projectile.spriteId, textureSet, displayFrameIndex);
    }

    const attachedEnemies = new Map(map.enemies
      .filter((enemy) => enemy.state === 'alive' || enemy.state === 'death-pending')
      .map((enemy) => [enemy.sourceOrder, enemy] as const));
    const activeAttackIds = new Set(map.enemyAttackAnimations
      .filter((animation) => animation.attachedSourceOrder === undefined ||
        attachedEnemies.has(animation.attachedSourceOrder))
      .map(({ id }) => id));
    for (const [id, sprite] of map.enemyAttackSprites) {
      if (!activeAttackIds.has(id)) {
        sprite.destroy();
        map.enemyAttackSprites.delete(id);
        map.objects = map.objects.filter((object) => object !== sprite);
      }
    }
    for (const animation of map.enemyAttackAnimations) {
      const attachedEnemy = animation.attachedSourceOrder === undefined
        ? undefined
        : attachedEnemies.get(animation.attachedSourceOrder);
      if (animation.attachedSourceOrder !== undefined && attachedEnemy === undefined) continue;
      const textureSet = map.enemyTextureKeys.get(animation.spriteId);
      if (textureSet === undefined) continue;
      let sprite = map.enemyAttackSprites.get(animation.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        map.enemyAttackSprites.set(animation.id, sprite);
        map.objects.push(sprite);
      }
      const offset = attachedEnemy === undefined
        ? { x: 0, y: 0 }
        : enemyDamageReactionOffset(attachedEnemy);
      const x = attachedEnemy === undefined
        ? animation.tileX * 16 + 8
        : attachedEnemy.pixelX + enemyFootprintWidth(attachedEnemy) * 8 + offset.x;
      const y = attachedEnemy === undefined
        ? animation.tileY * 16 + 8
        : attachedEnemy.pixelY + 14 + offset.y;
      sprite.setPosition(x, y).setDepth(y + 1);
      this.setEnemyAttackEffectFrame(sprite, animation.spriteId, textureSet, animation.frameIndex);
    }
    this.syncPlayerSkillVisualSprites(map);
  }

  private renderStaticMap(
    map: BaseMapData,
    tileKeys: Map<number, string>,
    decorations: MapDecorationData,
    objectKeys: Map<number, string>,
    events: EventOperationData,
    visibleNpcSourceOrders: ReadonlySet<number>,
    npcEmotions: Readonly<Record<number, number | null>>,
    npcTextureKeys: NpcTextureKeys,
    enemyTextureKeys: EnemyTextureSets,
  ): {
    objects: RenderedMapObject[];
    decorationSprites: Map<number, Phaser.GameObjects.Image>;
    enemySprites: Map<number, Phaser.GameObjects.Container>;
    npcSprites: Map<number, NpcActorSprite>;
  } {
    const renderedObjects: RenderedMapObject[] = [];
    const decorationSprites = new Map<number, Phaser.GameObjects.Image>();
    const enemySprites = new Map<number, Phaser.GameObjects.Container>();
    const npcSprites = new Map<number, NpcActorSprite>();
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tileId = map.tileIds[y][x];
        renderedObjects.push(this.add
          .image(x * map.tileSize, y * map.tileSize, tileKeys.get(tileId)!)
          .setOrigin(0, 0)
          .setDepth(0));
      }
    }

    const sortedObjects = [...decorations.objects].sort((first, second) => {
      const firstDepth = first.tileY * map.tileSize + first.offsetY;
      const secondDepth = second.tileY * map.tileSize + second.offsetY;
      return firstDepth - secondDepth || first.sourceOrder - second.sourceOrder;
    });
    for (const object of sortedObjects) {
      const key = objectKeys.get(object.atlasIndex);
      if (key === undefined) continue;
      const sprite = this.add
        .image(
          object.tileX * map.tileSize + object.offsetX,
          object.tileY * map.tileSize + object.offsetY,
          key,
        )
        .setOrigin(0.5, 1)
        .setDepth(object.tileY * map.tileSize + object.offsetY + 1);
      renderedObjects.push(sprite);
      decorationSprites.set(object.sourceOrder, sprite);
    }
    for (const { placement: npc, visible } of resolveNpcSpriteRenderPlacements(
      events.npcPlacements,
      visibleNpcSourceOrders,
    )) {
      const x = npc.tileX * map.tileSize + 8;
      const y = npc.tileY * map.tileSize + 8;
      const animation = this.npcAnimations.get(npc.imageId);
      if (animation !== undefined) {
        const container = this.add.container(x, y).setDepth(y).setVisible(visible);
        container.add(this.add.image(0, -3, 'hero-shadow').setOrigin(0.5, 1));
        const emotionImage = this.add.image(0, -39, 'world-emotion-0')
          .setOrigin(0.5, 0)
          .setVisible(false);
        const initialEmotion = npcEmotions[npc.sourceOrder];
        if (initialEmotion !== undefined) this.setEventEmotionImage(emotionImage, initialEmotion);
        const sprite: NpcActorSprite = {
          sourceOrder: npc.sourceOrder,
          npcId: npc.imageId,
          staticImage: null,
          direction: 2,
          stateIndex: 0,
          // Source n.a() initializes k to -1. The first visible paint draws
          // frame zero, then the post-render hook advances the cursor to 0.
          frameIndex: -1,
          container,
          emotionImage,
          componentSprites: [],
          textureKeys: npcTextureKeys,
        };
        this.setNpcSpriteFrame(sprite);
        container.add(emotionImage);
        renderedObjects.push(container);
        npcSprites.set(npc.sourceOrder, sprite);
        continue;
      }
      const key = npcTextureKeys.get(String(npc.imageId));
      if (key === undefined) continue;
      const container = this.add.container(x, y).setDepth(y).setVisible(visible);
      const emotionImage = this.add.image(0, -39, 'world-emotion-0')
        .setOrigin(0.5, 0)
        .setVisible(false);
      const initialEmotion = npcEmotions[npc.sourceOrder];
      if (initialEmotion !== undefined) this.setEventEmotionImage(emotionImage, initialEmotion);
      const bodyImage = this.add.image(0, 0, key).setOrigin(0.5, 1);
      container.add([
        this.add.image(0, -3, 'hero-shadow').setOrigin(0.5, 1),
        bodyImage,
        emotionImage,
      ]);
      renderedObjects.push(container);
      npcSprites.set(npc.sourceOrder, {
        sourceOrder: npc.sourceOrder,
        npcId: npc.imageId,
        staticImage: bodyImage,
        direction: 2,
        stateIndex: 0,
        frameIndex: 0,
        container,
        emotionImage,
        componentSprites: [],
        textureKeys: npcTextureKeys,
      });
    }
    for (const enemy of events.enemyPlacements) {
      const spriteId = enemy.renderSpriteId ?? enemy.spriteId ?? enemy.enemyId;
      const textureSet = enemyTextureKeys.get(spriteId);
      if (textureSet === undefined ||
        (!this.enemyAnimations.has(spriteId) && !this.bossAnimations.has(spriteId))) continue;
      const sourceFootprintWidth = enemy.sourceFootprintWidth ??
        (this.enemyDataTable?.records[enemy.enemyId]?.classCode === 2 ? 2 : 1);
      const x = enemy.tileX * map.tileSize + sourceFootprintWidth * 8;
      const y = enemy.tileY * map.tileSize + 14 + (enemy.sourceRenderOffsetY ?? 0);
      const sprite = this.add.container(x, y).setDepth(y);
      this.setEnemySpriteFrame(
        sprite,
        spriteId,
        textureSet,
        enemy.sourceBehavior === 'map15-cf' ? 1 : 0,
        enemy.sourceBehavior?.startsWith('map15-') ? 1 : 2,
        0,
      );
      renderedObjects.push(sprite);
      enemySprites.set(enemy.sourceOrder, sprite);
    }
    return { objects: renderedObjects, decorationSprites, enemySprites, npcSprites };
  }

  private setNpcSpriteFrame(sprite: NpcActorSprite): void {
    const animation = this.npcAnimations.get(sprite.npcId);
    if (animation === undefined) return;
    const track = findNpcSpriteTrack(animation, sprite.stateIndex, sprite.direction);
    const components = npcSpriteFrameAt(track, sprite.frameIndex).flatMap((component) => {
      const key = sprite.textureKeys.get(`${sprite.npcId}:${component.imageIndex}`);
      return component.imageIndex < 0 || key === undefined ? [] : [{ component, key }];
    });
    while (sprite.componentSprites.length > components.length) {
      const image = sprite.componentSprites.pop()!;
      sprite.container.remove(image, true);
    }
    for (const [index, { component, key }] of components.entries()) {
      let image = sprite.componentSprites[index];
      if (image === undefined) {
        image = this.add.image(component.offsetX, component.offsetY, key).setOrigin(0, 0);
        sprite.componentSprites[index] = image;
        sprite.container.add(image);
      } else {
        image.setTexture(key)
          .setPosition(component.offsetX, component.offsetY)
          .setOrigin(0, 0)
          .setVisible(true);
      }
      image.setFlipX(component.mirrored);
    }
  }

  private setNpcSpriteImage(sprite: NpcActorSprite, imageId: number): void {
    sprite.npcId = imageId;
    sprite.frameIndex = 0;
    const animation = this.npcAnimations.get(imageId);
    if (animation !== undefined) {
      sprite.staticImage?.setVisible(false);
      this.setNpcSpriteFrame(sprite);
      return;
    }
    for (const component of sprite.componentSprites) {
      sprite.container.remove(component);
      component.destroy();
    }
    sprite.componentSprites = [];
    const key = sprite.textureKeys.get(String(imageId));
    if (key === undefined) {
      sprite.staticImage?.setVisible(false);
      return;
    }
    if (sprite.staticImage === null) {
      sprite.staticImage = this.add.image(0, 0, key).setOrigin(0.5, 1);
      sprite.container.addAt(sprite.staticImage, 1);
    } else {
      sprite.staticImage.setTexture(key);
    }
    sprite.staticImage.setPosition(0, 0).setOrigin(0.5, 1).setVisible(true);
  }

  private syncEventCutsceneNpcSprites(state: EventCutsceneState): void {
    const activeMap = this.maps.get(this.currentMapId);
    if (activeMap === undefined) return;
    let occupancyChanged = false;
    const visibleNpcSourceOrders = new Set(activeMap.visibleNpcSourceOrders);
    for (const [sourceOrderText, visible] of Object.entries(state.npcVisibility)) {
      const sourceOrder = Number(sourceOrderText);
      if (visible) {
        if (!visibleNpcSourceOrders.has(sourceOrder)) {
          visibleNpcSourceOrders.add(sourceOrder);
          occupancyChanged = true;
        }
      } else if (visibleNpcSourceOrders.delete(sourceOrder)) {
        occupancyChanged = true;
      }
      activeMap.npcSprites.get(sourceOrder)?.container.setVisible(visible);
    }
    activeMap.visibleNpcSourceOrders = visibleNpcSourceOrders;
    for (const [sourceOrderText, imageId] of Object.entries(state.npcImages)) {
      const sourceOrder = Number(sourceOrderText);
      const placement = activeMap.events.npcPlacements.find((candidate) =>
        candidate.sourceOrder === sourceOrder,
      );
      if (placement !== undefined) placement.imageId = imageId;
      const sprite = activeMap.npcSprites.get(sourceOrder);
      if (sprite !== undefined && sprite.npcId !== imageId) this.setNpcSpriteImage(sprite, imageId);
    }
    for (const [sourceOrderText, imageId] of Object.entries(state.objectImages)) {
      const sprite = activeMap.decorationSprites.get(Number(sourceOrderText));
      if (sprite === undefined) continue;
      const textureKey = activeMap.objectTextureKeys.get(imageId);
      if (textureKey === undefined) {
        sprite.setVisible(false);
      } else {
        sprite.setTexture(textureKey).setVisible(true);
      }
    }
    const visualStates = resolveNpcCutsceneVisualStates(
      [...activeMap.npcSprites.values()].map((sprite) => ({
        sourceOrder: sprite.sourceOrder,
        direction: sprite.direction,
        moving: sprite.stateIndex === 1,
      })),
      state.npcDirections,
      state.npcMoving,
    );
    for (const visualState of visualStates) {
      const sprite = activeMap.npcSprites.get(visualState.sourceOrder);
      if (sprite === undefined) continue;
      let changed = false;
      if (visualState.direction !== sprite.direction) {
        sprite.direction = visualState.direction;
        changed = true;
      }
      const stateIndex: NpcSpriteState = visualState.moving ? 1 : 0;
      if (stateIndex !== sprite.stateIndex) {
        sprite.stateIndex = stateIndex;
        changed = true;
        occupancyChanged = true;
      }
      if (changed) {
        sprite.frameIndex = 0;
        this.setNpcSpriteFrame(sprite);
      }
    }
    if (occupancyChanged) activeMap.occupiedCellIndices = this.mapEntityOccupancy(activeMap);
  }

  private advanceNpcSpriteAnimations(map: RenderedWorld, sourcePaintPasses: number): void {
    if (sourcePaintPasses <= 0) return;
    const viewport = this.cameras.main.worldView;
    for (const sprite of map.npcSprites.values()) {
      if (!sprite.container.visible || !isNpcWithinSourceViewport(sprite.container, viewport)) continue;
      const animation = this.npcAnimations.get(sprite.npcId);
      if (animation === undefined) continue;
      const track = findNpcSpriteTrack(animation, sprite.stateIndex, sprite.direction);
      // Source `ab.a(Graphics,...)` advances the cursor once for every visible
      // source gameplay paint. Batch elapsed source passes after this Phaser
      // draw so browser RAF frequency does not set the NPC animation rate.
      sprite.frameIndex = advanceNpcSpriteFrames(sprite.frameIndex, track, sourcePaintPasses);
      this.setNpcSpriteFrame(sprite);
    }
  }

  private advanceNpcSpriteMotion(map: RenderedWorld, worldUpdates: number): void {
    if (worldUpdates === 0) return;
    let occupancyChanged = false;
    for (const sprite of map.npcSprites.values()) {
      const next = advanceNpcMotion({
        x: sprite.container.x,
        y: sprite.container.y,
        direction: sprite.direction,
        moving: sprite.stateIndex === 1,
      }, worldUpdates);
      if (next.x !== sprite.container.x || next.y !== sprite.container.y) {
        sprite.container.setPosition(next.x, next.y).setDepth(next.y);
        occupancyChanged = true;
      }
    }
    if (occupancyChanged) map.occupiedCellIndices = this.mapEntityOccupancy(map);
  }

  private performBasicAttack(style: PlayerAttackStyle): void {
    if (this.loadingMapTransition || this.systemMenuVisible || this.openingDialogVisible || this.worldDialogueVisible ||
      this.world === null || this.hudState.hp <= 0) return;
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return;
    if (this.tryPickupGroundDrop()) return;
    const queued = queuePlayerAttack(this.playerCombo, style, this.comboLimit);
    if (!queued.accepted) return;
    this.playerCombo = queued.state;
    this.updateHeroSprite();
  }

  private performPlayerSkill(actionButton: 0 | 1): void {
    if (this.loadingMapTransition || this.systemMenuVisible || this.openingDialogVisible ||
      this.worldDialogueVisible || this.world === null || this.hudState.hp <= 0) return;
    const activeSkillId = this.activeSkillId;
    if (this.playerSkillAction.skillId !== activeSkillId) this.setActivePlayerSkill(activeSkillId);
    const button = actionButton === 0 ? '1' : '3';
    const levelSlot = playerSkillLevelForActionButton(this.playerSkillAction, button);
    if (levelSlot === null) return;
    const started = startPlayerSkillAction(
      { ...this.playerSkillAction, nextActionId: this.nextPlayerSkillActionId },
      levelSlot,
      this.actor.x >> 4,
      this.actor.y >> 4,
      this.actor.direction,
      this.characterAttributes.will,
    );
    if (started.accepted) {
      this.playerSkillAction = started.state;
      this.nextPlayerSkillActionId = started.state.nextActionId;
      this.playerSkillActionStates.set(activeSkillId, started.state);
    }
  }

  private advancePlayerCombat(elapsedMs: number): void {
    const currentMap = this.maps.get(this.currentMapId);
    let remainingMs = elapsedMs;
    while (remainingMs > 0) {
      const untilNextTick = WORLD_UPDATE_PERIOD_MS - this.playerCombo.tickRemainderMs;
      const sliceMs = Math.min(remainingMs, untilNextTick);
      const completesWorldTick = sliceMs === untilNextTick;
      const recoveryActivity: PlayerRecoveryActivity = this.actor.moving
        ? 'walking'
        : this.playerCombo.activeStyle !== null ? 'other' : 'idle';
      const step = advancePlayerCombo(this.playerCombo, sliceMs, this.heroClassId, this.comboLimit);
      this.playerCombo = step.state;
      remainingMs -= sliceMs;
      if (completesWorldTick && !this.openingDialogVisible) {
        this.advancePlayerRecovery(recoveryActivity);
      }
      let failedFollowUpStage: number | null = null;
      for (const followUp of step.followUps) {
        const cost = playerAttackSpCost(
          this.equippedWeaponDefinition()?.equipmentByte ?? 0,
          followUp.style,
        );
        if (this.hudState.sp < cost) {
          this.playerCombo = cancelPlayerComboFollowUp(
            this.playerCombo,
            followUp.previousStage,
            followUp.previousStyle,
          );
          failedFollowUpStage = followUp.stage;
          break;
        }
        this.hudState.sp -= cost;
        this.refreshGameplayHud();
      }
      if (currentMap !== undefined) {
        for (const impact of step.impacts) {
          if (failedFollowUpStage !== null && impact.stage >= failedFollowUpStage) break;
          this.resolvePlayerComboImpact(currentMap, impact);
        }
      }
    }
  }

  private advancePlayerRecovery(activity: PlayerRecoveryActivity): void {
    const result = advancePlayerRecoveryTick(this.playerRecovery, activity, {
      level: this.hudState.level,
      attributes: this.equipmentStats?.attributes ?? this.characterAttributes,
      hp: this.hudState.hp,
      maxHp: this.hudState.maxHp,
      sp: this.hudState.sp,
      maxSp: this.hudState.maxSp,
    }, true, this.playerSkillAction.recoveryBoostTicksRemaining > 0 ? 2 : 1);
    this.playerRecovery = result.state;
    if (result.hpChange === 0 && result.spChange === 0) return;
    this.hudState.hp = result.hp;
    this.hudState.sp = result.sp;
    this.refreshGameplayHud();
  }

  private equippedWeaponDefinition() {
    const weapon = this.equipmentSlots[0];
    return weapon === null || this.equipmentDataTable === null
      ? undefined
      : findEquipmentItem(this.equipmentDataTable, weapon.category, weapon.itemId);
  }

  private resolvePlayerComboImpact(currentMap: RenderedWorld, impact: PlayerComboImpact): void {
    const baseProfile = this.equipmentStats?.attack ?? STARTER_RONIN_ATTACK;
    const basePower = this.playerSkillAction.comboPowerBoostTicksRemaining > 0
      ? Math.floor((baseProfile.power * 3) / 2)
      : baseProfile.power;
    const profile = {
      ...baseProfile,
      attackElement: sourcePlayerSkillElement(this.playerSkillAction.skillId),
      power: playerAttackPower(basePower, impact),
    };
    const variationWidth = Math.trunc(profile.power / 10);
    if (variationWidth > 0) profile.power += this.randomStreams.entity.nextInt() % variationWidth;
    const weapon = this.equipmentSlots[0];
    const offhand = this.equipmentSlots[1];
    const procCode = selectWeaponProcCode(
      weapon?.equipmentState?.subtypeBytes[2],
      offhand?.equipmentState?.subtypeBytes[0],
      () => this.randomStreams.range.nextSourceRange(0, 99),
    );
    const critical = Math.abs(this.randomStreams.entity.nextInt() % 100) < (profile.criticalChance ?? 0);
    const directionDelta: Record<Direction, { x: number; y: number }> = {
      1: { x: 0, y: -1 },
      2: { x: 0, y: 1 },
      3: { x: -1, y: 0 },
      4: { x: 1, y: 0 },
    };
    const forward = directionDelta[this.actor.direction];
    const sourceFrontTarget = findEnemyOccupyingSourceCell(
      currentMap.enemies,
      (this.actor.x >> 4) + forward.x,
      (this.actor.y >> 4) + forward.y,
    );
    if (sourceFrontTarget !== undefined && procCode !== null) {
      this.showSourceWeaponProcFeedback(procCode);
    }
    if (procCode === 8 && sourceFrontTarget !== undefined) {
      this.applyPlayerWeaponProcCosts(Math.trunc(this.hudState.maxHp / 25), 0);
    }
    if (this.heroClassId === 8 && impact.style === 'heavy' &&
      (impact.stage === 2 || impact.stage === 3 || impact.stage === 4)) {
      currentMap.playerProjectiles.push(beginSourceClassEightProjectile(
        currentMap.nextPlayerProjectileId++,
        this.actor.x >> 4,
        this.actor.y >> 4,
        this.actor.direction,
        impact.stage,
        profile,
        critical,
        procCode,
      ));
      return;
    }
    const resolveTargets = (targets: readonly EnemyCombatant[]): void => {
      for (const target of targets) {
        const currentTarget = currentMap.enemies.find((enemy) => enemy.sourceOrder === target.sourceOrder);
        if (currentTarget === undefined || currentTarget.state !== 'alive' || currentTarget.hp <= 0) continue;
        const previousTargetState = currentTarget.state;
        const result = resolveBasicAttack(
          currentMap.enemies,
          target.sourceOrder,
          profile,
          this.randomStreams.range.nextSourceRange(0, 99),
          critical,
          procCode,
        );
        currentMap.enemies = result.combatants;
        if (result.kind !== 'hit') continue;
        currentMap.enemies = currentMap.enemies.map((enemy) => enemy.sourceOrder === result.target.sourceOrder
          ? beginEnemyDamageReaction(enemy, this.actor.direction)
          : enemy);
        this.applyPlayerWeaponProcCosts(result.playerHpCost, result.playerSpCost);
        this.showDamageNumber(result.target.tileX, result.target.tileY, result.damage);
        if (previousTargetState === 'alive' && result.target.state === 'death-pending') {
          this.rewardDefeatedEnemy(currentMap, result.target);
        }
      }
    };

    resolveTargets(selectPlayerAttackTargets(
      currentMap.enemies,
      this.actor.x >> 4,
      this.actor.y >> 4,
      this.actor.direction,
      this.heroClassId,
      impact,
    ));

    if (this.heroClassId !== 6 || impact.style !== 'heavy' || (impact.stage !== 2 && impact.stage !== 3)) return;
    const playerTileX = this.actor.x >> 4;
    const playerTileY = this.actor.y >> 4;
    const lunge = resolveSourceClassSixLungeImpact(
      currentMap.enemies,
      currentMap.world.collision,
      this.mapEntityOccupancy(currentMap),
      playerTileX,
      playerTileY,
      this.actor.direction,
      impact.stage,
    );
    if (lunge.distance === 0) return;
    this.actor = {
      ...this.actor,
      x: this.actor.x + (lunge.destinationTileX - playerTileX) * 16,
      y: this.actor.y + (lunge.destinationTileY - playerTileY) * 16,
      moving: false,
      stopAfterTile: false,
      queuedDirection: null,
    };
    resolveTargets(lunge.followUpTargets);
  }

  /** `signedValue` follows the source `av(7)` font-style polarity. */
  private showDamageNumber(
    tileX: number,
    tileY: number,
    signedValue: number,
    effectOwner: DamageNumberPopup['effectOwner'] = 'map',
  ): void {
    if (!sourceDamageNumberHasVisibleGlyphs(signedValue)) return;
    const digits = String(Math.abs(signedValue)).split('').map(Number);
    const baseX = tileX * 16 + 9;
    const baseY = tileY * 16 + 8;
    const left = baseX - (digits.length * 6) / 2;
    const depth = baseY + 7;
    const frames = digits.map((digit, index) => this.add
      .image(left + index * 6, baseY - 30, 'world-damage-digits', digit)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setVisible(false));
    this.damageNumberPopups.push({
      mapId: this.currentMapId,
      effectOwner,
      frames,
      baseX: left,
      baseY,
      animation: INITIAL_DAMAGE_NUMBER_ANIMATION,
    });
  }

  private showSourceWeaponProcFeedback(procCode: number): void {
    const imageIndex = sourceWeaponProcEmotionImageIndex(procCode);
    if (imageIndex === null || this.heroContainer === null) return;
    const sprite = this.add.image(-8, -47, `world-emotion-${imageIndex}`)
      .setOrigin(0, 0);
    this.heroContainer.add(sprite);
    this.sourceWeaponProcFeedback.push({
      animation: createSourceWeaponProcFeedbackAnimation(),
      emotionImageIndex: imageIndex,
      sprite,
    });
  }

  private advanceSourceWeaponProcFeedback(elapsedMs: number): void {
    for (let index = this.sourceWeaponProcFeedback.length - 1; index >= 0; index -= 1) {
      const feedback = this.sourceWeaponProcFeedback[index];
      if (feedback === undefined) continue;
      const step = advanceWeaponProcFeedbackAnimation(
        feedback.animation,
        feedback.emotionImageIndex,
        elapsedMs,
      );
      if (step.finished) {
        feedback.sprite.destroy();
        this.sourceWeaponProcFeedback.splice(index, 1);
        continue;
      }
      feedback.animation = step.animation;
      feedback.sprite.setY(-47 + step.verticalOffset);
    }
  }

  private updateDamageNumberPopups(elapsedMs: number): void {
    for (let index = this.damageNumberPopups.length - 1; index >= 0; index -= 1) {
      const popup = this.damageNumberPopups[index];
      if (popup.mapId !== this.currentMapId) {
        popup.frames.forEach((frame) => frame.destroy());
        this.damageNumberPopups.splice(index, 1);
        continue;
      }
      const step = advanceDamageNumberAnimation(popup.animation, elapsedMs);
      popup.animation = step.animation;
      popup.frames.forEach((frame, digitIndex) => {
        frame.setPosition(
          popup.baseX + digitIndex * 6,
          popup.baseY - 30 - popup.animation.frame * 4,
        ).setVisible(step.visible);
      });
      if (step.finished) {
        popup.frames.forEach((frame) => frame.destroy());
        this.damageNumberPopups.splice(index, 1);
      }
    }
  }

  private showAssetMessage(message: string): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e6eefb',
        align: 'center',
        lineSpacing: 5,
      })
      .setOrigin(0.5);
  }
}
