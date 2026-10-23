import Phaser from 'phaser';
import {
  advanceActor,
  createPlayerActor,
  didReachMapEventBoundary,
  requestActorDirection,
  releaseActorDirection,
  WORLD_UPDATE_PERIOD_MS,
  type Direction,
  type PlayerActor,
} from '../world/actor';
import {
  findSpriteRecord,
  parseCharacterSpriteLayout,
  type CharacterSpriteLayout,
  type CharacterSpritePart,
} from '../world/character-sprites';
import {
  heroArmorAtlas,
  heroHeadAtlas,
  heroHeadLayout,
  heroWeaponAtlas,
} from '../world/hero-sprite-appearance';
import {
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
import { getMapAssetPaths } from '../world/map-assets';
import {
  applyEventFlagChanges,
  applyInitialMapEventState,
  createEntityOccupancy,
  parseEventOperationData,
  prepareMapTransition,
  resolveEventScriptEffects,
  resolveInteractionScript,
  resolveMapTransition,
  resolveTriggerScript,
  type DynamicEnemyPlacement,
  type EventOperationData,
  type EventFlagChange,
  type EventScriptSelection,
  type MapTransition,
  type PreparedMapTransition,
} from '../world/event-data';
import { bitmapTextWidth, drawBitmapText, type BitmapFontData } from '../ui/bitmap-font';
import {
  drawGameplayHud,
  NEW_GAME_RONIN_HUD,
  type GameplayHudAssets,
} from '../ui/game-hud';
import {
  parseGameSave,
  writeGameSave,
  type GameSaveState,
} from '../world/save-data';
import {
  DEFAULT_GAME_OPTIONS,
  gameSpeedScale,
  readGameOptions,
  type GameOptions,
} from '../world/game-options';
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
  enemyDamageReactionOffset,
  parseEnemyDataTable,
  respawnEnemy,
  resolveEnemyMeleeDefense,
  resolveBasicAttack,
  starterRoninDefenseForLevel,
  STARTER_RONIN_ATTACK,
  type EnemyCombatant,
  type EnemyDataTable,
} from '../world/combat';
import {
  advancePlayerCombo,
  cancelPlayerComboFollowUp,
  EMPTY_PLAYER_COMBO,
  playerAttackPower,
  playerAttackSpCost,
  playerSpriteAnimationSlot,
  queuePlayerAttack,
  type PlayerAttackStyle,
  type PlayerComboImpact,
  type PlayerComboState,
} from '../world/player-combo';
import {
  selectPlayerAttackTargets,
  sourceClassSixLungeDistance,
} from '../world/player-attack-targeting';
import {
  advanceEnemySpriteFrame,
  enemySpriteFrameAt,
  findEnemySpriteAnimation,
  findEnemySpriteTrack,
  parseEnemySpriteAnimationCatalog,
  type EnemySpriteAnimation,
} from '../world/enemy-sprites';
import {
  advanceNpcSpriteFrame,
  findNpcSpriteAnimation,
  findNpcSpriteTrack,
  npcSpriteFrameAt,
  parseNpcSpriteAnimationCatalog,
  type NpcSpriteAnimation,
  type NpcSpriteState,
} from '../world/npc-sprites';
import { advanceNpcMotion, resolveNpcCutsceneVisualStates } from '../world/npc-motion';
import {
  advanceEnemyAttackEffect,
  advanceEnemyProjectileTick,
  beginEnemyProjectile,
  parseEnemyAttackEffectCatalog,
  type EnemyAttackEffect,
  type EnemyAttackEffectAnimation,
  type EnemyProjectile,
} from '../world/enemy-attacks';
import { awardEnemyExperience, awardSourceExperience } from '../world/progression';
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
  type PlayerStatusState,
} from '../world/player-status';
import {
  advancePlayerRecoveryTick,
  createPlayerRecoveryState,
  type PlayerRecoveryActivity,
  type PlayerRecoveryState,
} from '../world/player-recovery';
import {
  advanceDamageNumberAnimation,
  INITIAL_DAMAGE_NUMBER_ANIMATION,
  type DamageNumberAnimation,
} from '../world/combat-feedback';
import {
  advanceGameOverSequence,
  beginGameOverSequence,
  type GameOverSequence,
} from '../world/game-over';

const MAP_IDS = [64, 0, 27] as const;
const BODY_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/b.json';
const ARMOR_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/a.json';
const EFFECT_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/e.json';
const HEAD_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/hA.json';
const ALTERNATE_HEAD_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/hB.json';
const WEAPON_LAYOUT_RESOURCE = '/assets/generated/character-layouts/1/w.json';
const HERO_SOURCE_ANIMATION_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const HERO_IMAGE_BASE = '/assets/generated/atlases/c1/i';
const CAMERA_FOCUS_X = 112;
const CAMERA_FOCUS_Y = 139;
// Fresh-game setup clears the bitfield and sets flag 0 before loading map 00.
const OBSERVED_NEW_GAME_FLAGS = new Set([0]);
const NEW_GAME_START = { mapId: 0, tileX: 22, tileY: 4 };
const OPENING_SCRIPT_TRIGGER = 10;
const OPENING_SCRIPT_TRIGGER_TYPE = 0;
const OPENING_SCRIPT_INDEX = 9;
const ENEMY_ANIMATION_CATALOG = '/assets/generated/enemy-animations/catalog.json';
const ENEMY_ATTACK_EFFECT_CATALOG = '/assets/generated/enemy-attack-effects/catalog.json';
const NPC_ANIMATION_CATALOG = '/assets/generated/npc-animations/catalog.json';
const EQUIPMENT_CATEGORY_LABELS: Record<number, string> = {
  0: 'SWORD',
  1: 'STAFF',
  2: 'BLADE',
  3: 'ARMOR',
  4: 'RING',
  5: 'SHIELD',
  6: 'BOOTS',
};

type EnemyTextureSet = Map<number, string>;
type EnemyTextureSets = Map<number, EnemyTextureSet>;
type NpcTextureKeys = Map<string, string>;
type RenderedMapObject = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

function getEventTileIds(events: EventOperationData): number[] {
  const tileIds = new Set<number>();
  for (const script of events.scripts) {
    for (let index = 0; index + 1 < script.length; index += 1) {
      if (script[index][0] === 42 && script[index + 1][0] === 43) {
        tileIds.add(script[index + 1][2]);
        index += 1;
      }
    }
  }
  return [...tileIds];
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
  events: EventOperationData;
  tileKeys: Map<number, string>;
  enemies: EnemyCombatant[];
  enemySprites: Map<number, Phaser.GameObjects.Container>;
  npcSprites: Map<number, NpcActorSprite>;
  enemyTextureKeys: EnemyTextureSets;
  enemyProjectiles: EnemyProjectile[];
  enemyProjectileSprites: Map<number, Phaser.GameObjects.Container>;
  enemyAttackAnimations: EnemyAttackEffectAnimation[];
  enemyAttackSprites: Map<number, Phaser.GameObjects.Container>;
  nextEnemyAttackVisualId: number;
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

interface DamageNumberPopup {
  mapId: number;
  frames: Phaser.GameObjects.Image[];
  baseX: number;
  baseY: number;
  animation: DamageNumberAnimation;
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
  private world: WorldGrid | null = null;
  private maps = new Map<number, RenderedWorld>();
  private enemyDataTable: EnemyDataTable | null = null;
  private equipmentDataTable: EquipmentDataTable | null = null;
  private commerceCatalog: CommerceCatalog | null = null;
  private enemyAnimations = new Map<number, EnemySpriteAnimation>();
  private npcAnimations = new Map<number, NpcSpriteAnimation>();
  private enemyAttackEffects = new Map<number, EnemyAttackEffect>();
  private damageNumberPopups: DamageNumberPopup[] = [];
  private mapIdsToLoad: number[] = [...MAP_IDS];
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
  private playerStatusContainer: Phaser.GameObjects.Container | null = null;
  private playerStatusPoisonIcon: Phaser.GameObjects.Image | null = null;
  private heroEmotionImage: Phaser.GameObjects.Image | null = null;
  private eventEmotionFrame = 0;
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
  private openingCutsceneUsesRoninFormatting = false;
  private openingCutsceneBlankOverlay: Phaser.GameObjects.Rectangle | null = null;
  private eventCameraBaseScroll: { x: number; y: number } | null = null;
  private worldLanguage: unknown = null;
  private pendingWorldDialogueFlags: EventFlagChange[] = [];
  private pendingWorldDialogueTransition: MapTransition | undefined;
  private initialGuardianIndex = 0;
  private guardianIndices: number[] = [0, 1];
  private heroClassId: EndingHeroClassId = 6;
  private characterAttributes: PlayerAttributes = createBasePlayerAttributes(6);
  private skillIds: number[] = [0, 1];
  private comboLimit = 1;
  private hudState = { ...NEW_GAME_RONIN_HUD };
  private wallet = NEW_GAME_WALLET;
  private inventory: InventoryStack[] = [];
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
  private heroContainer: Phaser.GameObjects.Container | null = null;
  private heroParts = new Map<number, Phaser.GameObjects.Image>();
  private pressedDirections: Array<{ code: string; direction: Direction }> = [];
  private systemMenuVisible = false;
  private systemMenuSelection = 0;
  private inventoryMenuVisible = false;
  private inventorySelection = 0;
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
    this.enemyDataTable = null;
    this.equipmentDataTable = null;
    this.commerceCatalog = null;
    this.enemyAnimations.clear();
    this.npcAnimations.clear();
    this.enemyAttackEffects.clear();
    this.damageNumberPopups = [];
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
    this.playerStatusContainer = null;
    this.playerStatusPoisonIcon = null;
    this.heroEmotionImage = null;
    this.eventEmotionFrame = 0;
    this.systemMenuCanvas = null;
    this.systemMenuContext = null;
    this.systemMenuTexture = null;
    this.systemMenuOverlay = null;
    this.heroContainer = null;
    this.heroParts.clear();
    this.bodyLayout = null;
    this.armorLayout = null;
    this.effectLayout = null;
    this.headLayout = null;
    this.alternateHeadLayout = null;
    this.weaponLayout = null;
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
    this.openingCutsceneUsesRoninFormatting = false;
    this.openingCutsceneBlankOverlay = null;
    this.worldLanguage = null;
    this.pendingWorldDialogueFlags = [];
    this.pendingWorldDialogueTransition = undefined;
    this.pressedDirections = [];
    try {
      this.gameOptions = readGameOptions(window.localStorage);
    } catch {
      this.gameOptions = { ...DEFAULT_GAME_OPTIONS };
    }
    for (const key of ['gameplay-hud', 'world-system-menu', 'opening-dialog-overlay', 'world-game-over']) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }
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
    this.characterAttributes = restoreState?.attributes ?? createBasePlayerAttributes(this.heroClassId);
    this.systemMenuVisible = false;
    this.commerceMenu = null;
    this.systemMenuSelection = 0;
    this.inventoryMenuVisible = false;
    this.inventorySelection = 0;
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
    this.playerStatus = createPlayerStatusState();
    this.playerRecovery = createPlayerRecoveryState();
    this.playerCombo = { ...EMPTY_PLAYER_COMBO };
    this.guardianIndices = [...new Set(guardianIndices.filter((index): index is number =>
      Number.isInteger(index) && Number(index) >= 0 && Number(index) <= 2,
    ))];
    this.skillIds = [...this.guardianIndices];
    if (startRoute === 'load-game' && restoreState !== null) {
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
      this.comboLimit = restoreState.comboLimit;
      this.hudState = { ...restoreState.hud };
      this.wallet = restoreState.wallet;
      this.inventory = restoreState.inventory.map((stack) => ({ ...stack }));
      this.savedEquipmentLoadoutPresent = restoreState.equipmentSlots !== null;
      this.equipmentSlots = restoreState.equipmentSlots === null
        ? [null, null, null, null, null]
        : cloneEquipmentLoadout(restoreState.equipmentSlots);
      this.hudState.selectedItemCount = selectedConsumableCount(
        this.inventory,
        this.hudState.selectedItemCategory,
      );
    } else if (startRoute === 'new-game') {
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
    this.mapIdsToLoad = [...new Set([...MAP_IDS, this.currentMapId])];
  }

  preload(): void {
    for (const mapId of this.mapIdsToLoad) {
      const paths = getMapAssetPaths(mapId);
      this.load.json(`world-map-${mapId}`, paths.map);
      this.load.json(`world-collision-${mapId}`, paths.collision);
      this.load.json(`world-decorations-${mapId}`, paths.decorations);
      this.load.json(`world-events-${mapId}`, paths.events);
    }
    this.load.json('hero-body-layout', BODY_LAYOUT_RESOURCE);
    this.load.json('hero-armor-layout', ARMOR_LAYOUT_RESOURCE);
    this.load.json('hero-effect-layout', EFFECT_LAYOUT_RESOURCE);
    this.load.json('hero-head-layout', HEAD_LAYOUT_RESOURCE);
    this.load.json('hero-alternate-head-layout', ALTERNATE_HEAD_LAYOUT_RESOURCE);
    this.load.json('hero-weapon-layout', WEAPON_LAYOUT_RESOURCE);
    this.load.json('world-font-layout', '/assets/generated/fonts/small.json');
    this.load.json('world-language-en-GB', '/assets/generated/language/en-GB.json');
    // R10 confirms data0 for the current fresh-game Ronin route. Other selection
    // modes remain unresolved and are not collapsed into this starter fixture.
    this.load.json('world-enemy-data', '/assets/generated/enemy-data/data0.json');
    this.load.json('world-equipment-data', '/assets/generated/equipment-data/catalog.json');
    this.load.json('world-commerce-data', '/assets/generated/commerce-data/catalog.json');
    this.load.json('world-enemy-animations', ENEMY_ANIMATION_CATALOG);
    this.load.json('world-npc-animations', NPC_ANIMATION_CATALOG);
    this.load.json('world-enemy-attack-effects', ENEMY_ATTACK_EFFECT_CATALOG);
    this.load.image('world-font-atlas', '/assets/generated/fonts/small.png');
    for (let index = 0; index < 7; index += 1) {
      this.load.image(
        `world-hud-frame-${index}`,
        `/assets/generated/atlases/img/uifrm/${String(index).padStart(3, '0')}.png`,
      );
    }
    this.load.image('world-hud-digits', '/assets/generated/atlases/img/glb/005.png');
    this.load.image('world-player-status-background', '/assets/generated/atlases/img/keepst/000.png');
    this.load.image('world-player-status-poison', '/assets/generated/atlases/img/keepst/008.png');
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
      `/assets/generated/atlases/grd/grdico/${String(6 + this.initialGuardianIndex * 4).padStart(3, '0')}.png`,
    );
  }

  create(): void {
    const rawBodyLayout = this.cache.json.get('hero-body-layout') as unknown;
    const rawArmorLayout = this.cache.json.get('hero-armor-layout') as unknown;
    const rawEffectLayout = this.cache.json.get('hero-effect-layout') as unknown;
    const rawHeadLayout = this.cache.json.get('hero-head-layout') as unknown;
    const rawAlternateHeadLayout = this.cache.json.get('hero-alternate-head-layout') as unknown;
    const rawWeaponLayout = this.cache.json.get('hero-weapon-layout') as unknown;
    this.fontLayout = this.cache.json.get('world-font-layout') as BitmapFontData;
    const language = this.cache.json.get('world-language-en-GB') as unknown;
    const rawEnemyData = this.cache.json.get('world-enemy-data') as unknown;
    const rawEquipmentData = this.cache.json.get('world-equipment-data') as unknown;
    const rawCommerceData = this.cache.json.get('world-commerce-data') as unknown;
    this.worldLanguage = language;
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
      const npcAnimationCatalog = parseNpcSpriteAnimationCatalog(
        this.cache.json.get('world-npc-animations') as unknown,
      );
      this.npcAnimations = new Map(npcAnimationCatalog.sprites.map((animation) => [
        animation.npcId, animation,
      ]));
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
    const parsedMaps: Array<{
      id: number;
      map: BaseMapData;
      decorations: MapDecorationData;
      world: WorldGrid;
      events: EventOperationData;
      enemies: EnemyCombatant[];
      visibleNpcSourceOrders: ReadonlySet<number>;
      npcEmotions: Readonly<Record<number, number | null>>;
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
        const effectiveEvents = {
          ...events,
          npcPlacements: initialState.npcPlacements,
          enemyPlacements: initialState.enemyPlacements,
        };
        parsedMaps.push({
          id: mapId,
          map: initialState.world.map,
          decorations: effectiveDecorations,
          events: effectiveEvents,
          enemies: createEnemyCombatants(effectiveEvents.enemyPlacements, this.enemyDataTable),
          world: initialState.world,
          visibleNpcSourceOrders: initialState.visibleNpcSourceOrders,
          npcEmotions: initialState.npcEmotions,
        });
      }
      this.bodyLayout = parseCharacterSpriteLayout(rawBodyLayout);
      this.armorLayout = parseCharacterSpriteLayout(rawArmorLayout);
      this.effectLayout = parseCharacterSpriteLayout(rawEffectLayout);
      this.headLayout = parseCharacterSpriteLayout(rawHeadLayout);
      this.alternateHeadLayout = parseCharacterSpriteLayout(rawAlternateHeadLayout);
      this.weaponLayout = parseCharacterSpriteLayout(rawWeaponLayout);
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
        this.heroClassId,
      );
      this.openingCutsceneUsesRoninFormatting = true;
      this.pumpOpeningCutscene(0);
    }

    const requiredMapTextures: string[] = [];
    const queuedMaps: Array<{
      id: number;
      map: BaseMapData;
      decorations: MapDecorationData;
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
      id, map, decorations, world, events, enemies, visibleNpcSourceOrders, npcEmotions,
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
      for (const atlasIndex of new Set(decorations.objects.map(({ atlasIndex }) => atlasIndex))) {
        const key = `map-${id}-object-${atlasIndex}`;
        objectKeys.set(atlasIndex, key);
        requiredMapTextures.push(key);
        this.load.image(key, `${objectAtlasPath}/${String(atlasIndex).padStart(3, '0')}.png`);
      }
      const npcTextureKeys = this.queueNpcTextures(
        events,
        visibleNpcSourceOrders,
        (key, path) => {
          if (requiredMapTextures.includes(key) || this.textures.exists(key)) return;
          requiredMapTextures.push(key);
          this.load.image(key, path);
        },
      );
      const enemyTextureKeys = this.queueEnemySpriteTextures(
        events.enemyPlacements.map(({ enemyId }) => enemyId),
        (key, path) => {
          if (requiredMapTextures.includes(key) || this.textures.exists(key)) return;
          requiredMapTextures.push(key);
          this.load.image(key, path);
        },
      );
      this.maps.set(id, {
        world,
        tilesetId: map.tilesetId,
        events,
        tileKeys,
        enemies,
        enemySprites: new Map(),
        npcSprites: new Map(),
        enemyTextureKeys,
        enemyProjectiles: [],
        enemyProjectileSprites: new Map(),
        enemyAttackAnimations: [],
        enemyAttackSprites: new Map(),
        nextEnemyAttackVisualId: 1,
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
        id, map, decorations, events, enemies, visibleNpcSourceOrders,
        npcEmotions, tileKeys, objectKeys, npcTextureKeys, enemyTextureKeys,
      } of queuedMaps) {
        const rendered = this.renderStaticMap(
          map, tileKeys, decorations, objectKeys, events, visibleNpcSourceOrders,
          npcEmotions, npcTextureKeys, enemyTextureKeys,
        );
        const renderedWorld = this.maps.get(id)!;
        renderedWorld.objects = rendered.objects;
        renderedWorld.enemySprites = rendered.enemySprites;
        renderedWorld.npcSprites = rendered.npcSprites;
        renderedWorld.enemies = enemies;
        if (id !== this.currentMapId) rendered.objects.forEach((object) => object.setVisible(false));
      }
      this.world = this.maps.get(this.currentMapId)?.world ?? null;
      this.createHero();
      if (this.openingDialogVisible) {
        this.createOpeningCutsceneBlankOverlay();
        this.syncOpeningCutscenePresentation();
        if (this.openingCutsceneState?.status === 'dialogue' ||
          this.openingCutsceneState?.status === 'choice') this.createOpeningDialog();
      }
      else this.createGameplayHud();
      this.bindMovementKeys();
    });
    this.load.start();
  }

  update(_time: number, delta: number): void {
    if (this.gameOverReturnPending) {
      this.gameOverReturnPending = false;
      this.scene.start('StartupFlowScene');
      return;
    }
    // The source keeps its world tick in gameplay mode beneath the System overlay.
    // Commerce handoffs use a separate source mode and hold the map simulation.
    if (this.loadingMapTransition || this.commerceMenu !== null || this.world === null || this.heroContainer === null) return;
    const simulationDelta = delta * gameSpeedScale(this.gameOptions);
    this.advanceDialogueReveal(simulationDelta);
    this.updateDamageNumberPopups(simulationDelta);
    const updateMapId = this.currentMapId;
    if (this.openingDialogVisible && this.openingCutsceneState !== null && (
      this.openingCutsceneState.status === 'delay' ||
      this.openingCutsceneState.status === 'flash' ||
      this.openingCutsceneState.status === 'shake' ||
      this.openingCutsceneState.cameraMoveSpeed !== 0
    )) {
      this.pumpOpeningCutscene(simulationDelta);
      if (this.loadingMapTransition || this.currentMapId !== updateMapId) return;
    }
    if (this.gameOverSequence !== null) {
      const advanced = advanceGameOverSequence(this.gameOverSequence, simulationDelta);
      this.gameOverSequence = advanced.sequence;
      for (const revealWidth of advanced.revealWidths) this.renderGameOverScreen(revealWidth);
      if (advanced.completed) this.gameOverReturnPending = true;
      return;
    }
    if (this.hudState.hp <= 0) {
      this.beginGameOver();
      return;
    }
    this.advanceEnemyDeathLifecycle(simulationDelta);
    if (this.hudState.hp <= 0) {
      this.beginGameOver();
      return;
    }
    this.advancePlayerCombat(simulationDelta);
    const npcWorldUpdates = Math.floor((this.actor.tickRemainderMs + simulationDelta) / WORLD_UPDATE_PERIOD_MS);
    const occupiedCellIndices = this.maps.get(this.currentMapId)?.occupiedCellIndices;
    const previousActor = this.actor;
    this.actor = advanceActor(this.world, previousActor, simulationDelta, occupiedCellIndices);
    if (didReachMapEventBoundary(previousActor, this.actor)) this.tryMapTransition();
    if (this.world === null || this.heroContainer === null) return;
    this.updateHeroSprite();
    this.heroContainer.setPosition(this.actor.x + 8, this.actor.y + 8);
    this.heroContainer.setDepth(this.actor.y + 8);
    this.syncPlayerStatusDisplay();
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined) return;
    this.advanceNpcSpriteMotion(currentMap, npcWorldUpdates);
    this.advanceNpcSpriteAnimations(currentMap);
    this.advanceEventEmotionAnimation(currentMap);
    const maxScrollX = Math.max(0, currentMap.width - this.scale.width);
    const maxScrollY = Math.max(0, currentMap.height - (this.scale.height - 21));
    const cutsceneCamera = this.openingDialogVisible ? this.openingCutsceneState : null;
    if (cutsceneCamera?.cameraMode === 'fixed') {
      if (this.eventCameraBaseScroll === null) {
        this.eventCameraBaseScroll = {
          x: this.cameras.main.scrollX,
          y: this.cameras.main.scrollY,
        };
      }
      const position = cutsceneCamera.cameraPositionTile;
      const baseScrollX = position === null
        ? this.eventCameraBaseScroll.x
        : position.x * 16 - this.scale.width / 2;
      const baseScrollY = position === null
        ? this.eventCameraBaseScroll.y
        : position.y * 16 - this.scale.height / 2;
      this.cameras.main.setScroll(
        Phaser.Math.Clamp(
          baseScrollX + cutsceneCamera.cameraPanX + cutsceneCamera.screenShakeX,
          0,
          maxScrollX,
        ),
        Phaser.Math.Clamp(
          baseScrollY + cutsceneCamera.cameraPanY + cutsceneCamera.screenShakeY,
          0,
          maxScrollY,
        ),
      );
    } else {
      this.eventCameraBaseScroll = null;
      const targetScrollX = Phaser.Math.Clamp(
        this.actor.x - CAMERA_FOCUS_X + (cutsceneCamera?.screenShakeX ?? 0),
        0,
        maxScrollX,
      );
      const targetScrollY = Phaser.Math.Clamp(
        this.actor.y - CAMERA_FOCUS_Y + (cutsceneCamera?.screenShakeY ?? 0),
        0,
        maxScrollY,
      );
      if (this.gameOptions.camera) {
        const lerp = 1 - Math.pow(0.5, simulationDelta / WORLD_UPDATE_PERIOD_MS);
        this.cameras.main.setScroll(
          Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, lerp),
          Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, lerp),
        );
      } else {
        this.cameras.main.setScroll(targetScrollX, targetScrollY);
      }
    }
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

  private advanceEnemyDeathLifecycle(elapsedMs: number): void {
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined) return;
    currentMap.enemyUpdateRemainderMs += elapsedMs;
    let occupancyChanged = false;
    while (currentMap.enemyUpdateRemainderMs >= WORLD_UPDATE_PERIOD_MS) {
      currentMap.enemyUpdateRemainderMs -= WORLD_UPDATE_PERIOD_MS;
      this.advanceGroundDrops(currentMap);
      this.advancePlayerStatus();
      this.advanceEnemyAttackEntities(currentMap);

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
            revived.tileX * 16 + (revived.definition.classCode === 2 ? 16 : 8),
            revived.tileY * 16 + 14,
          ).setDepth(revived.tileY * 16 + 14).setVisible(true);
          occupancyChanged = true;
          return revived;
        });
      }

      const previous = currentMap.enemies.map(advanceEnemyDamageReaction);
      let pursuitEnemies = [...previous];
      for (let index = 0; index < pursuitEnemies.length; index += 1) {
        const enemy = pursuitEnemies[index];
        if (enemy.state !== 'alive') continue;
        const occupiedCellIndices = createEntityOccupancy(
          currentMap.events,
          currentMap.world.map.width,
          currentMap.world.map.height,
          currentMap.visibleNpcSourceOrders,
          undefined,
          this.activeEnemyPlacements(pursuitEnemies),
        );
        const animation = this.enemyAnimations.get(enemy.enemyId);
        const attackTrack = animation === undefined
          ? undefined
          : findEnemySpriteTrack(animation, 2, enemy.animationDirection ?? 2);
        const moved = advanceEnemyBehaviorTick(enemy, {
          collision: currentMap.world.collision,
          occupiedCellIndices,
          playerTileX: this.actor.x >> 4,
          playerTileY: this.actor.y >> 4,
          randomInteger: (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
          rawRandomInteger: () => this.randomStreams.entity.nextInt(),
        }, attackTrack?.frameCount);
        if (moved.pixelX !== enemy.pixelX || moved.pixelY !== enemy.pixelY) occupancyChanged = true;
        pursuitEnemies[index] = moved;
      }
      const advancedSprites = pursuitEnemies.map((pursued) => {
        if (pursued.state !== 'alive') return pursued;
        const animation = this.enemyAnimations.get(pursued.enemyId);
        if (animation === undefined) return pursued;
        const track = findEnemySpriteTrack(
          animation,
          pursued.animationStateIndex ?? 0,
          pursued.animationDirection ?? 2,
        );
        return {
          ...pursued,
          animationFrameIndex: advanceEnemySpriteFrame(pursued.animationFrameIndex ?? -1, track),
        };
      });
      const playerTileX = this.actor.x >> 4;
      const playerTileY = this.actor.y >> 4;
      const attackChecked = advancedSprites.map((enemy) => {
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
        const result = resolveEnemyMeleeDefense(
          consumed,
          this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level),
          (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
        );
        if (!result.evaded) {
          this.hudState.hp = Math.max(0, this.hudState.hp - result.damage);
          this.refreshGameplayHud();
          this.showDamageNumber(playerTileX, playerTileY, result.damage);
          if (enemyHitAppliesPoison(
            consumed.definition.behaviorType,
            result.evaded,
            (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
          )) {
            this.playerStatus = applyPlayerPoison(this.playerStatus);
            this.syncPlayerStatusDisplay();
          }
        }
        return consumed;
      });
      const next = advanceEnemyDeathTick(attackChecked);
      for (let index = 0; index < next.length; index += 1) {
        if (previous[index].state !== 'death-pending' ||
          (next[index].state !== 'respawn-wait' && next[index].state !== 'removed')) continue;
        const defeatedEnemy = next[index];
        currentMap.enemySprites.get(defeatedEnemy.sourceOrder)?.setVisible(false);
        occupancyChanged = true;
      }
      currentMap.enemies = next;
      this.syncEnemySpritePositions(currentMap);
      this.syncEnemyAttackSprites(currentMap);
      if (this.hudState.hp <= 0) break;
    }
    if (occupancyChanged) {
      currentMap.occupiedCellIndices = createEntityOccupancy(
        currentMap.events,
        currentMap.world.map.width,
        currentMap.world.map.height,
        currentMap.visibleNpcSourceOrders,
        undefined,
        this.activeEnemyPlacements(currentMap.enemies),
      );
    }
  }

  private advanceEnemyAttackEntities(map: RenderedWorld): void {
    map.enemyAttackAnimations = map.enemyAttackAnimations.flatMap((animation) => {
      const effect = this.enemyAttackEffects.get(animation.spriteId);
      if (effect === undefined) return [];
      const advanced = advanceEnemyAttackEffect(animation, effect.frameCount);
      return advanced === undefined ? [] : [advanced];
    });

    const projectiles: EnemyProjectile[] = [];
    const spawned: EnemyProjectile[] = [];
    for (const projectile of map.enemyProjectiles) {
      const effect = this.enemyAttackEffects.get(projectile.spriteId);
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
      const defense = resolveEnemyMeleeDefense(
        attacker,
        this.equipmentStats?.defense ?? starterRoninDefenseForLevel(this.hudState.level),
        (minimum, maximum) => this.randomStreams.range.nextSourceRange(minimum, maximum),
      );
      if (!defense.evaded) {
        this.hudState.hp = Math.max(0, this.hudState.hp - defense.damage);
        this.refreshGameplayHud();
        this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, defense.damage);
      }
    }
    map.enemyProjectiles = [...projectiles, ...spawned];
    this.syncEnemyAttackSprites(map);
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
    );
    if (result.pickedUp === null) return false;
    currentMap.groundDrops = result.drops;
    this.inventory = result.inventory;
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
    return true;
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
    const result = useSelectedConsumable(this.inventory, this.hudState, this.playerStatus.effects);
    if (!result.used) return;
    this.inventory = result.inventory;
    this.playerStatus = retainPlayerStatusEffects(this.playerStatus, result.statusEffects);
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
      this.showDamageNumber(this.actor.x >> 4, this.actor.y >> 4, result.damageNumber);
    }
    this.syncPlayerStatusDisplay();
  }

  private syncPlayerStatusDisplay(): void {
    if (this.playerStatusContainer === null || this.playerStatusPoisonIcon === null) return;
    const active = this.playerStatus.effects.includes(7);
    this.playerStatusContainer.setPosition(this.actor.x + 8, this.actor.y - 22)
      .setDepth(this.actor.y + 9)
      .setVisible(active);
    this.playerStatusPoisonIcon.setPosition(0, 1 + ((this.playerStatus.poisonTicksElapsed ?? 0) % 2));
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
    this.hudState = awardEnemyExperience(this.hudState, enemy.definition.experienceRewardCode);
    this.recalculateEquipmentStats();
  }

  private activeEnemyPlacements(enemies: readonly EnemyCombatant[]): DynamicEnemyPlacement[] {
    return enemies
      .filter((enemy) => enemy.state === 'alive' || enemy.state === 'death-pending')
      .map((enemy) => ({
        sourceOrder: enemy.sourceOrder,
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        footprintWidth: enemy.definition.classCode === 2 ? 2 : 1,
      }));
  }

  private syncEnemySpritePositions(map: RenderedWorld): void {
    for (const enemy of map.enemies) {
      const sprite = map.enemySprites.get(enemy.sourceOrder);
      if (sprite === undefined) continue;
      const widthOffset = enemy.definition.classCode === 2 ? 16 : 8;
      const baseY = enemy.pixelY + 14;
      const offset = enemyDamageReactionOffset(enemy);
      sprite.setPosition(
        enemy.pixelX + widthOffset + offset.x,
        baseY + offset.y,
      ).setDepth(baseY + offset.y);
      if (enemy.state === 'alive') {
        this.setEnemySpriteFrame(
          sprite,
          enemy.enemyId,
          map.enemyTextureKeys.get(enemy.enemyId),
          enemy.animationStateIndex ?? 0,
          enemy.animationDirection ?? 2,
          enemy.animationFrameIndex ?? -1,
        );
      }
    }
  }

  /** Resolve current/ahead triggers after the actor reaches or stops at a tile boundary. */
  private tryMapTransition(): void {
    if (this.openingDialogVisible || this.worldDialogueVisible) return;
    const currentMap = this.maps.get(this.currentMapId);
    if (currentMap === undefined || this.actor.moving ||
      this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0) return;
    const directionDelta: Record<Direction, { x: number; y: number }> = {
      1: { x: 0, y: -1 },
      2: { x: 0, y: 1 },
      3: { x: -1, y: 0 },
      4: { x: 1, y: 0 },
    };
    const tileX = this.actor.x >> 4;
    const tileY = this.actor.y >> 4;
    const currentMarker = currentMap.world.collision.values[tileY]?.[tileX];
    if (currentMarker !== undefined && currentMarker !== 0 && currentMarker !== -128) {
      const automaticSelection = resolveTriggerScript(
        currentMap.events, currentMarker, 0, this.gameFlags, this.questFlags, this.inventory,
      );
      if (automaticSelection !== undefined && canRunEventCutscene(
        automaticSelection.commands,
        currentMap.events.npcPlacements.length,
        { width: currentMap.world.map.width, height: currentMap.world.map.height },
        this.equipmentDataTable ?? undefined,
      )) {
        this.startOrderedEventCutscene(automaticSelection, currentMap.events);
        return;
      }
      const automaticDestination = resolveMapTransition(
        currentMap.events,
        currentMarker,
        0,
        this.gameFlags,
        this.questFlags,
        { inventory: this.inventory },
      );
      if (automaticDestination !== undefined) {
        this.transitionToMap(automaticDestination);
        return;
      }
    }
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
    this.syncOpeningCutscenePresentation();
    const nextState = this.openingCutsceneState;
    if (nextState === null) return;
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
        this.hudState = awardSourceExperience(this.hudState, change.amount);
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
            image.setTexture(textureKey);
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
      this.scene.start('EndingScene', { heroClassId: this.heroClassId });
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
      this.heroClassId,
    );
    this.eventCameraBaseScroll = null;
    this.openingCutsceneAppliedFlagCount = 0;
    this.openingCutsceneAppliedPlayerChangeCount = 0;
    this.openingCutsceneAppliedTileChangeCount = 0;
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
    const paths = getMapAssetPaths(mapId);
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
    const effectiveEvents = {
      ...events,
      npcPlacements: initialState.npcPlacements,
      enemyPlacements: initialState.enemyPlacements,
    };

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
    for (const atlasIndex of new Set(effectiveDecorations.objects.map(({ atlasIndex }) => atlasIndex))) {
      const key = `map-${mapId}-object-${atlasIndex}`;
      objectKeys.set(atlasIndex, key);
      queueImage(key, `${objectAtlasPath}/${String(atlasIndex).padStart(3, '0')}.png`);
    }
    const npcTextureKeys = this.queueNpcTextures(
      effectiveEvents,
      initialState.visibleNpcSourceOrders,
      queueImage,
    );
    const enemyTextureKeys = this.queueEnemySpriteTextures(
      effectiveEvents.enemyPlacements.map(({ enemyId }) => enemyId),
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
      events: effectiveEvents,
      tileKeys,
      enemies,
      enemySprites: objects.enemySprites,
      npcSprites: objects.npcSprites,
      enemyTextureKeys,
      enemyProjectiles: [],
      enemyProjectileSprites: new Map(),
      enemyAttackAnimations: [],
      enemyAttackSprites: new Map(),
      nextEnemyAttackVisualId: 1,
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

    this.gameFlags = new Set(flags.gameFlags);
    this.questFlags = new Set(flags.questFlags);
    this.maps.get(this.currentMapId)?.objects.forEach((object) => object.setVisible(false));
    nextMap.objects.forEach((object) => object.setVisible(true));
    this.currentMapId = destination.mapId;
    this.world = nextMap.world;
    this.actor = createPlayerActor(destination.tileX * 16, destination.tileY * 16);
    this.eventCameraBaseScroll = null;
    this.pressedDirections = [];
    this.openingDialogVisible = false;
    this.worldDialogueVisible = false;
    this.pendingWorldDialogueFlags = [];
    this.pendingWorldDialogueTransition = undefined;
    this.openingDialogOverlay?.setVisible(false);
    this.openingCutsceneBlankOverlay?.setVisible(false);
    this.createGameplayHud();
    return true;
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
    this.systemMenuMessage = '';
    this.renderInventoryMenu();
  }

  private closeInventoryMenu(): void {
    this.inventoryMenuVisible = false;
    this.systemMenuMessage = '';
    this.renderSystemMenu();
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

  private equipInventorySelection(): void {
    const result = equipInventoryItem(this.inventory, this.equipmentSlots, this.inventorySelection);
    if (result === null) {
      this.systemMenuMessage = 'Select an equipment item to equip.';
      this.renderInventoryMenu();
      return;
    }
    this.inventory = result.inventory;
    this.equipmentSlots = result.equipment;
    this.inventorySelection = Math.min(this.inventorySelection, Math.max(0, this.inventory.length - 1));
    this.recalculateEquipmentStats();
    this.hudState.selectedItemCount = selectedConsumableCount(
      this.inventory,
      this.hudState.selectedItemCategory,
    );
    this.systemMenuMessage = `${EQUIPMENT_CATEGORY_LABELS[result.equipped.category]} equipped.`;
    this.renderInventoryMenu();
  }

  private handleInventoryMenuPointer(y: number): void {
    if (y < 150 || y >= 246) return;
    const firstVisible = Math.floor(this.inventorySelection / 8) * 8;
    const index = firstVisible + Math.floor((y - 150) / 12);
    if (index >= this.inventory.length) return;
    this.inventorySelection = index;
    this.equipInventorySelection();
  }

  private openSystemMenu(): void {
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0 ||
      this.openingDialogVisible || this.worldDialogueVisible || this.loadingMapTransition) return;
    this.pressedDirections = [];
    this.systemMenuSelection = 0;
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
      );
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
    const selectQuantity = (action: 'buy' | 'sell', item: CommerceItemReference, back: CommerceScreen): void => {
      session.item = item;
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
      if (stack !== undefined) selectQuantity('sell', { category: stack.category, itemId: stack.itemId }, 'sell-list');
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
      const stack = session.item === null || session.pendingAction !== 'sell' ? undefined
        : this.inventory.find((entry) => entry.category === session.item!.category &&
          entry.itemId === session.item!.itemId);
      const maximum = session.item !== null && !isCommerceStackable(session.item.category)
        ? 1 : stack?.count ?? 99;
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

  private saveCurrentGame(): void {
    if (this.actor.moving || this.actor.x % 16 !== 0 || this.actor.y % 16 !== 0 ||
      this.maps.get(this.currentMapId) === undefined) {
      this.systemMenuMessage = 'Stop on a tile before saving.';
      this.renderSystemMenu();
      return;
    }
    const state: GameSaveState = {
      version: 1,
      savedAt: Date.now(),
      mapId: this.currentMapId,
      tileX: this.actor.x / 16,
      tileY: this.actor.y / 16,
      direction: this.actor.direction,
      gameFlags: [...this.gameFlags],
      questFlags: [...this.questFlags],
      guardianIndices: [...this.guardianIndices],
      heroClassId: this.heroClassId,
      attributes: { ...this.characterAttributes },
      skillIds: [...this.skillIds],
      comboLimit: this.comboLimit,
      hud: { ...this.hudState },
      wallet: this.wallet,
      inventory: this.inventory.map((stack) => ({ ...stack })),
      equipmentSlots: cloneEquipmentLoadout(this.equipmentSlots),
    };
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
    context.fillRect(34, 95, 172, 142);
    context.strokeStyle = '#5f5f5f';
    context.strokeRect(35, 96, 170, 140);
    context.strokeStyle = '#ffffff';
    context.strokeRect(37, 98, 166, 136);
    this.drawMenuText(context, 'SYSTEM', 120, 112, '#ffffff', 'center');
    this.drawMenuText(context, `${this.systemMenuSelection === 0 ? '>' : ' '} Status / Attributes`, 48, 137, '#ffffff', 'left');
    this.drawMenuText(context, `${this.systemMenuSelection === 1 ? '>' : ' '} Inventory`, 48, 154, '#ffffff', 'left');
    this.drawMenuText(context, `${this.systemMenuSelection === 2 ? '>' : ' '} Save Game`, 48, 171, '#ffffff', 'left');
    this.drawMenuText(context, `${this.systemMenuSelection === 3 ? '>' : ' '} Resume`, 48, 188, '#ffffff', 'left');
    if (this.systemMenuMessage !== '') {
      this.drawMenuText(context, this.systemMenuMessage, 120, 205, '#ffffff', 'center');
    }
    this.drawMenuText(context, 'Arrows Select  Enter OK  Esc Back', 120, 253, '#ffffff', 'center');
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
    this.drawMenuText(context, 'EQUIPMENT / INVENTORY', 120, 43, '#ffffff', 'center');
    this.drawMenuText(context, 'EQUIPPED', 20, 59, '#bfbf7f', 'left');
    this.equipmentSlots.forEach((stack, slot) => {
      const label = ['WEAPON', 'ARMOR', 'SHIELD', 'BOOTS', 'RING'][slot];
      const item = stack === null ? 'EMPTY' : `${EQUIPMENT_CATEGORY_LABELS[stack.category]} ${String(stack.itemId).padStart(2, '0')}`;
      this.drawMenuText(context, `${label}  ${item}`, 20, 73 + slot * 11, '#ffffff', 'left');
    });
    const stats = this.equipmentStats;
    if (stats !== null) {
      this.drawMenuText(context, `ATK ${stats.attack.power}  DEF ${stats.defense.defense}  HP ${stats.maxHp}  SP ${stats.maxSp}`,
        20, 132, '#bfbf7f', 'left');
    }
    this.drawMenuText(context, `INVENTORY ${this.inventory.length}/${30}`, 20, 146, '#ffffff', 'left');
    const firstVisible = Math.floor(this.inventorySelection / 8) * 8;
    for (let row = 0; row < 8; row += 1) {
      const index = firstVisible + row;
      const stack = this.inventory[index];
      if (stack === undefined) break;
      const label = EQUIPMENT_CATEGORY_LABELS[stack.category] ?? `ITEM${stack.category}`;
      const marker = index === this.inventorySelection ? '>' : ' ';
      this.drawMenuText(context,
        `${marker} ${String(index + 1).padStart(2, '0')} ${label} ${String(stack.itemId).padStart(2, '0')} x${stack.count}`,
        20, 160 + row * 12, '#ffffff', 'left');
    }
    if (this.inventory.length === 0) {
      this.drawMenuText(context, 'No items carried.', 120, 177, '#ffffff', 'center');
    }
    this.drawMenuText(context, 'Up/Down Select  Enter Equip', 120, 263, '#ffffff', 'center');
    this.drawMenuText(context, 'Esc Back', 120, 276, '#ffffff', 'center');
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
    const resources = [
      { layout: this.bodyLayout!, folders: ['b'], componentSlots: new Set([0]) },
      { layout: this.armorLayout!, folders: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], componentSlots: new Set([2, 3, 4, 5]) },
      { layout: this.headLayout!, folders: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'], componentSlots: new Set([1]) },
      { layout: this.alternateHeadLayout!, folders: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'], componentSlots: new Set([1]) },
      { layout: this.weaponLayout!, folders: ['w1', 'w2', 'w3', 'w4', 'w5'], componentSlots: new Set([6]) },
      { layout: this.effectLayout!, folders: ['e'], componentSlots: new Set([7]) },
    ];
    const textures: Array<{ key: string; path: string }> = [];
    const queuedKeys = new Set<string>();
    for (const { layout, folders, componentSlots } of resources) {
      for (const record of layout.records) {
        if (!componentSlots.has(record.componentSlot) ||
          !HERO_SOURCE_ANIMATION_SLOTS.includes(record.animationSlot as typeof HERO_SOURCE_ANIMATION_SLOTS[number])) continue;
        for (const part of record.frames.flat()) {
          if (part.imageIndex === 255) continue;
          for (const folder of folders) {
            const key = `hero-${folder}-${part.imageIndex}`;
            if (queuedKeys.has(key)) continue;
            const path = `${HERO_IMAGE_BASE}/${folder}/${String(part.imageIndex).padStart(3, '0')}.png`;
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
    const statusBackground = this.add.image(0, 0, 'world-player-status-background').setOrigin(0.5);
    this.playerStatusPoisonIcon = this.add.image(0, 1, 'world-player-status-poison').setOrigin(0.5);
    this.playerStatusContainer = this.add.container(this.actor.x + 8, this.actor.y - 22)
      .add([statusBackground, this.playerStatusPoisonIcon])
      .setDepth(this.actor.y + 9)
      .setVisible(false);
    this.updateHeroSprite();
    this.heroEmotionImage = this.add.image(0, -39, 'world-emotion-0')
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.heroContainer.add(this.heroEmotionImage);
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
    if (emotionIndex === null) {
      image.setVisible(false);
      return;
    }
    image.setTexture(`world-emotion-${emotionIndex}`).setVisible(true);
  }

  private advanceEventEmotionAnimation(map: RenderedWorld): void {
    this.eventEmotionFrame = (this.eventEmotionFrame + 1) & 1;
    const yOffset = this.eventEmotionFrame;
    if (this.heroEmotionImage?.visible) this.heroEmotionImage.setY(-39 + yOffset);
    for (const sprite of map.npcSprites.values()) {
      if (sprite.emotionImage.visible) sprite.emotionImage.setY(-39 + yOffset);
    }
  }

  private updateHeroSprite(): void {
    if (this.heroContainer === null || this.bodyLayout === null || this.armorLayout === null ||
      this.effectLayout === null || this.headLayout === null || this.alternateHeadLayout === null ||
      this.weaponLayout === null) return;
    const directionSlot = this.actor.direction - 1;
    const attacking = this.playerCombo.activeStyle !== null;
    const animationSlot = playerSpriteAnimationSlot(this.playerCombo, this.actor.moving);
    const frameIndex = attacking ? this.playerCombo.frame : this.actor.moving ? this.actor.animationFrame : 0;
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

    const canDrawWeaponLayers = ![1, 5, 9, 15].includes(this.maps.get(this.currentMapId)?.tilesetId ?? 0);
    if (canDrawWeaponLayers) {
      const weapon = this.equipmentSlots[0];
      if (weapon !== null) {
        const weaponAtlas = heroWeaponAtlas(this.heroClassId, weapon.itemId);
        if (weaponAtlas !== null) appendLayoutParts(this.weaponLayout, [6], `w${weaponAtlas}`);
      }
      appendLayoutParts(this.effectLayout, [7], 'e');
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
      const texture = `hero-${folder}-${part.imageIndex}`;
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
        if (this.attributeMenuVisible) {
          this.handleAttributeMenuKey(event);
        } else if (this.inventoryMenuVisible) {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (this.inventory.length > 0) {
              const delta = event.key === 'ArrowUp' ? -1 : 1;
              this.inventorySelection = (this.inventorySelection + delta + this.inventory.length) % this.inventory.length;
            }
            this.systemMenuMessage = '';
            this.renderInventoryMenu();
          } else if (event.key === 'Enter' || event.key === ' ') {
            this.equipInventorySelection();
          } else if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
            this.closeInventoryMenu();
          }
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const delta = event.key === 'ArrowUp' ? -1 : 1;
          this.systemMenuSelection = (this.systemMenuSelection + delta + 4) % 4;
          this.systemMenuMessage = '';
          this.renderSystemMenu();
        } else if (event.key === 'Enter' || event.key === ' ') {
          if (this.systemMenuSelection === 0) this.openAttributeMenu();
          else if (this.systemMenuSelection === 1) this.openInventoryMenu();
          else if (this.systemMenuSelection === 2) this.saveCurrentGame();
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
      this.actor = next === undefined
        ? releaseActorDirection(this.actor)
        : requestActorDirection(this.actor, next.direction);
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
        if (this.attributeMenuVisible) {
          this.handleAttributeMenuPointer(pointer);
        } else if (this.inventoryMenuVisible) {
          if (pointer.y >= 150 && pointer.y < 246) this.handleInventoryMenuPointer(pointer.y);
        } else if (pointer.y >= 128 && pointer.y < 199) {
          const selection = Math.min(3, Math.floor((pointer.y - 128) / 17));
          this.systemMenuSelection = selection;
          if (selection === 0) this.openAttributeMenu();
          else if (selection === 1) this.openInventoryMenu();
          else if (selection === 2) this.saveCurrentGame();
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
    visibleNpcSourceOrders: ReadonlySet<number>,
    queueImage: (key: string, path: string) => void,
  ): NpcTextureKeys {
    const textureKeys: NpcTextureKeys = new Map();
    const imageIds = new Set([
      ...events.npcPlacements
        .filter(({ sourceOrder }) => visibleNpcSourceOrders.has(sourceOrder))
        .map(({ imageId }) => imageId),
      ...events.scripts.flatMap((script) => script.flatMap(([opcode, , imageId]) =>
        opcode === 41 ? [imageId] : [])),
    ]);
    for (const imageId of imageIds) {
      const animation = this.npcAnimations.get(imageId);
      if (animation !== undefined) {
        const componentImageIndices = new Set(animation.tracks.flatMap((track) =>
          track.frames.flatMap((frame) => frame
            .filter(({ imageIndex }) => imageIndex >= 0)
            .map(({ imageIndex }) => imageIndex))));
        for (const imageIndex of componentImageIndices) {
          const key = `world-npc-frame-${imageId}-${imageIndex}`;
          textureKeys.set(`${imageId}:${imageIndex}`, key);
          queueImage(
            key,
            `/assets/generated/atlases/npc/${String(imageId).padStart(2, '0')}/${String(imageIndex).padStart(3, '0')}.png`,
          );
        }
      } else if (imageId >= 18) {
        const key = `world-npc-${imageId}`;
        textureKeys.set(String(imageId), key);
        queueImage(key, `/assets/generated/atlases/npc/all/${String(imageId - 18).padStart(3, '0')}.png`);
      } else if (imageId === 16) {
        const key = `world-npc-${imageId}`;
        textureKeys.set(String(imageId), key);
        queueImage(key, '/assets/generated/atlases/npc/16/000.png');
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
      const effect = this.enemyAttackEffects.get(enemyId);
      const imageIndices = [...new Set([
        ...(animation?.tracks.flatMap((track) => track.frames.flatMap((frame) =>
          frame.map(({ imageIndex }) => imageIndex))) ?? []),
        ...(effect?.frames.flatMap((frame) => frame.map(({ imageIndex }) => imageIndex)) ?? []),
      ].filter((imageIndex) => imageIndex >= 0))];
      const textures: EnemyTextureSet = new Map();
      for (const imageIndex of imageIndices) {
        const key = `world-enemy-${enemyId}-sprite-${imageIndex}`;
        textures.set(imageIndex, key);
        queueImage(
          key,
          `/assets/generated/atlases/enm/${String(enemyId).padStart(2, '0')}/${String(imageIndex).padStart(3, '0')}.png`,
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
    stateIndex: 0 | 1 | 2,
    direction: Direction,
    frameIndex: number,
  ): void {
    const animation = this.enemyAnimations.get(spriteId);
    if (animation === undefined || textureSet === undefined) return;
    const track = findEnemySpriteTrack(animation, stateIndex, direction);
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
    const effect = this.enemyAttackEffects.get(spriteId);
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
      const effect = this.enemyAttackEffects.get(projectile.spriteId);
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

    const activeAttackIds = new Set(map.enemyAttackAnimations.map(({ id }) => id));
    for (const [id, sprite] of map.enemyAttackSprites) {
      if (!activeAttackIds.has(id)) {
        sprite.destroy();
        map.enemyAttackSprites.delete(id);
        map.objects = map.objects.filter((object) => object !== sprite);
      }
    }
    for (const animation of map.enemyAttackAnimations) {
      const textureSet = map.enemyTextureKeys.get(animation.spriteId);
      if (textureSet === undefined) continue;
      let sprite = map.enemyAttackSprites.get(animation.id);
      if (sprite === undefined) {
        sprite = this.add.container(0, 0);
        map.enemyAttackSprites.set(animation.id, sprite);
        map.objects.push(sprite);
      }
      const x = animation.tileX * 16 + 8;
      const y = animation.tileY * 16 + 8;
      sprite.setPosition(x, y).setDepth(y + 1);
      this.setEnemyAttackEffectFrame(sprite, animation.spriteId, textureSet, animation.frameIndex);
    }
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
    enemySprites: Map<number, Phaser.GameObjects.Container>;
    npcSprites: Map<number, NpcActorSprite>;
  } {
    const renderedObjects: RenderedMapObject[] = [];
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
      renderedObjects.push(this.add
        .image(
          object.tileX * map.tileSize + object.offsetX,
          object.tileY * map.tileSize + object.offsetY,
          key,
        )
        .setOrigin(0.5, 1)
        .setDepth(object.tileY * map.tileSize + object.offsetY + 1));
    }
    for (const npc of events.npcPlacements) {
      if (!visibleNpcSourceOrders.has(npc.sourceOrder)) continue;
      const x = npc.tileX * map.tileSize + 8;
      const y = npc.tileY * map.tileSize + 8;
      const animation = this.npcAnimations.get(npc.imageId);
      if (animation !== undefined) {
        const container = this.add.container(x, y).setDepth(y);
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
          frameIndex: 0,
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
      const container = this.add.container(x, y).setDepth(y);
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
      const textureSet = enemyTextureKeys.get(enemy.enemyId);
      if (textureSet === undefined || !this.enemyAnimations.has(enemy.enemyId)) continue;
      const enemyWidth = this.enemyDataTable?.records[enemy.enemyId]?.classCode === 2 ? 2 : 1;
      const x = enemy.tileX * map.tileSize + (enemyWidth === 2 ? 16 : 8);
      const y = enemy.tileY * map.tileSize + 14;
      const sprite = this.add.container(x, y).setDepth(y);
      this.setEnemySpriteFrame(sprite, enemy.enemyId, textureSet, 0, 2, 0);
      renderedObjects.push(sprite);
      enemySprites.set(enemy.sourceOrder, sprite);
    }
    return { objects: renderedObjects, enemySprites, npcSprites };
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
    let visibilityChanged = false;
    const visibleNpcSourceOrders = new Set(activeMap.visibleNpcSourceOrders);
    for (const [sourceOrderText, visible] of Object.entries(state.npcVisibility)) {
      const sourceOrder = Number(sourceOrderText);
      if (visible) {
        if (!visibleNpcSourceOrders.has(sourceOrder)) {
          visibleNpcSourceOrders.add(sourceOrder);
          visibilityChanged = true;
        }
      } else if (visibleNpcSourceOrders.delete(sourceOrder)) {
        visibilityChanged = true;
      }
      activeMap.npcSprites.get(sourceOrder)?.container.setVisible(visible);
    }
    if (visibilityChanged) {
      activeMap.visibleNpcSourceOrders = visibleNpcSourceOrders;
      activeMap.occupiedCellIndices = createEntityOccupancy(
        activeMap.events,
        activeMap.width,
        activeMap.height,
        visibleNpcSourceOrders,
        undefined,
        this.activeEnemyPlacements(activeMap.enemies),
      );
    }
    for (const [sourceOrderText, imageId] of Object.entries(state.npcImages)) {
      const sourceOrder = Number(sourceOrderText);
      const placement = activeMap.events.npcPlacements.find((candidate) =>
        candidate.sourceOrder === sourceOrder,
      );
      if (placement !== undefined) placement.imageId = imageId;
      const sprite = activeMap.npcSprites.get(sourceOrder);
      if (sprite !== undefined && sprite.npcId !== imageId) this.setNpcSpriteImage(sprite, imageId);
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
      }
      if (changed) {
        sprite.frameIndex = 0;
        this.setNpcSpriteFrame(sprite);
      }
    }
  }

  private advanceNpcSpriteAnimations(map: RenderedWorld): void {
    for (const sprite of map.npcSprites.values()) {
      const animation = this.npcAnimations.get(sprite.npcId);
      if (animation === undefined) continue;
      const track = findNpcSpriteTrack(animation, sprite.stateIndex, sprite.direction);
      if (track.frameCount <= 1) continue;
      sprite.frameIndex = advanceNpcSpriteFrame(sprite.frameIndex, track);
      this.setNpcSpriteFrame(sprite);
    }
  }

  private advanceNpcSpriteMotion(map: RenderedWorld, worldUpdates: number): void {
    if (worldUpdates === 0) return;
    for (const sprite of map.npcSprites.values()) {
      const next = advanceNpcMotion({
        x: sprite.container.x,
        y: sprite.container.y,
        direction: sprite.direction,
        moving: sprite.stateIndex === 1,
      }, worldUpdates);
      if (next.x !== sprite.container.x || next.y !== sprite.container.y) {
        sprite.container.setPosition(next.x, next.y).setDepth(next.y);
      }
    }
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
    });
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
    const profile = { ...baseProfile, power: playerAttackPower(baseProfile.power, impact) };
    const variationWidth = Math.trunc(profile.power / 10);
    if (variationWidth > 0) profile.power += this.randomStreams.entity.nextInt() % variationWidth;
    const critical = Math.abs(this.randomStreams.entity.nextInt() % 100) < (profile.criticalChance ?? 0);
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
        );
        currentMap.enemies = result.combatants;
        if (result.kind !== 'hit') continue;
        currentMap.enemies = currentMap.enemies.map((enemy) => enemy.sourceOrder === result.target.sourceOrder
          ? beginEnemyDamageReaction(enemy, this.actor.direction)
          : enemy);
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
    const distance = sourceClassSixLungeDistance(
      currentMap.world.collision,
      createEntityOccupancy(
        currentMap.events,
        currentMap.world.map.width,
        currentMap.world.map.height,
        currentMap.visibleNpcSourceOrders,
        undefined,
        this.activeEnemyPlacements(currentMap.enemies),
      ),
      playerTileX,
      playerTileY,
      this.actor.direction,
    );
    if (distance === 0) return;
    const directionDeltas: Record<Direction, { x: number; y: number }> = {
      1: { x: 0, y: -1 },
      2: { x: 0, y: 1 },
      3: { x: -1, y: 0 },
      4: { x: 1, y: 0 },
    };
    const delta = directionDeltas[this.actor.direction];
    this.actor = {
      ...this.actor,
      x: this.actor.x + delta.x * distance * 16,
      y: this.actor.y + delta.y * distance * 16,
      moving: false,
      stopAfterTile: false,
      queuedDirection: null,
    };
    if (impact.stage === 3) {
      resolveTargets(selectPlayerAttackTargets(
        currentMap.enemies,
        this.actor.x >> 4,
        this.actor.y >> 4,
        this.actor.direction,
        this.heroClassId,
        impact,
      ));
    }
  }

  private showDamageNumber(tileX: number, tileY: number, damage: number): void {
    const digits = String(Math.abs(damage)).split('').map(Number);
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
      frames,
      baseX: left,
      baseY,
      animation: INITIAL_DAMAGE_NUMBER_ANIMATION,
    });
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
