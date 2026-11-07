#!/usr/bin/env node

/**
 * Drive a fresh New Game route or DEV map preview through normal game UI key
 * input in an owned Chromium process. Chromium is headless; screenshots capture the page.
 * The probe uses real CDP key-down/key-up events, so directional inputs can be
 * held across the game's update ticks. It reads only DEV route telemetry and
 * records app calls to Storage APIs in its disposable Chromium profile. It
 * never opens local game-save files. On a
 * map-preview, HEROES_LORE_OBSERVE_ENEMY=1 records bounded behavior-2/3 attack
 * animation and hit-resolution samples for a selected enemy source order;
 * HEROES_LORE_MAP66_NO_CHOICE=1, HEROES_LORE_MAP59_NO_CHOICE=1,
 * HEROES_LORE_MAP59_YES_CHOICE=1, and HEROES_LORE_MAP59_FULL_CHAIN=1 drive
 * their respective source choice branches; HEROES_LORE_MAP54_ITEM_PRIZE=1
 * verifies the Map54 NPC item-reward interaction; HEROES_LORE_MAP53_BLUEBRICK_CHAIN=1
 * replays the Map53 checkpoint route through Map54 and the Map59→Map13 chain;
 * HEROES_LORE_MAP54_CURRENT_CELL_EXIT=1 checks the Map54 marker-8/marker-6 exit;
 * HEROES_LORE_MAP54_TO_MAP13_CHAIN=1 follows that exit through the Map59 and Map12 prerequisites.
 * Map-preview routes can add an input-free observation window; setting
 * HEROES_LORE_MAP_IDLE_SAMPLE_INTERVAL_MS records DEV actor input and Map15 AI state during it.
 * HEROES_LORE_MAP_PREVIEW_MOVE_SMOKE=1 sends one visible directional move from the DEV preview spawn.
 * HEROES_LORE_MAP37_CLASS6_MULTITARGET=1 verifies the class-6 heavy fan against two adjacent Map37 enemies;
 * HEROES_LORE_MAP37_CLASS6_TRIPLE_TARGET=1 includes the third diagonal source cell;
 * HEROES_LORE_MAP37_CLASS6_LIGHT_FOLLOWUP=1 checks the stage-1 light-combo fan;
 * HEROES_LORE_MAP37_CLASS6_HEAVY_STAGE4_SWEEP=1 checks the eight-cell heavy stage-4 sweep.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileName = process.env.HEROES_LORE_TEST_PROFILE ?? 'max-level';
const routeTarget = process.env.HEROES_LORE_ROUTE_TARGET ?? 'map0';
const mapPreviewId = routeTarget === 'map-preview'
  ? Number(process.env.HEROES_LORE_MAP_ID ?? 13)
  : null;
const map66NoChoiceBranch = process.env.HEROES_LORE_MAP66_NO_CHOICE === '1';
const map27WeaponProcStatus = process.env.HEROES_LORE_MAP27_WEAPON_PROC_STATUS === '1';
const map27WeaponProcStatusSlow = process.env.HEROES_LORE_MAP27_WEAPON_PROC_STATUS_SLOW === '1';
const map27WeaponProcStatusSlowCooldown =
  process.env.HEROES_LORE_MAP27_WEAPON_PROC_STATUS_SLOW_COOLDOWN === '1';
const map27WeaponProcStatusDefense = process.env.HEROES_LORE_MAP27_WEAPON_PROC_STATUS_DEFENSE === '1';
const map27PoisonTickTest = process.env.HEROES_LORE_MAP27_POISON_TICK_TEST === '1';
const map27BasicDamageFormulaTest = process.env.HEROES_LORE_MAP27_BASIC_DAMAGE_FORMULA === '1';
const map27WeaponProcDamageTest = process.env.HEROES_LORE_MAP27_WEAPON_PROC_DAMAGE === '1';
const map27WeaponProcResource = process.env.HEROES_LORE_MAP27_WEAPON_PROC_RESOURCE ?? null;
const map27WeaponProcResourceTest = map27WeaponProcResource !== null;
const map13AuProcSpTest = process.env.HEROES_LORE_MAP13_AU_PROC_SP === '1';
const map13AuProcHpTest = process.env.HEROES_LORE_MAP13_AU_PROC_HP === '1';
const map13AuProcResourceTest = map13AuProcSpTest || map13AuProcHpTest;
const map13AuProcResource = map13AuProcSpTest ? 'sp' : map13AuProcHpTest ? 'hp' : null;
const map27WeaponProcStatusTest = map27WeaponProcStatus || map27WeaponProcStatusSlow ||
  map27WeaponProcStatusSlowCooldown || map27WeaponProcStatusDefense;
const map59NoChoiceBranch = process.env.HEROES_LORE_MAP59_NO_CHOICE === '1';
const map59YesChoiceBranch = process.env.HEROES_LORE_MAP59_YES_CHOICE === '1';
const map59FullChain = process.env.HEROES_LORE_MAP59_FULL_CHAIN === '1';
const map59ChoiceBranch = map59NoChoiceBranch || map59YesChoiceBranch || map59FullChain;
const map54ItemPrize = process.env.HEROES_LORE_MAP54_ITEM_PRIZE === '1';
const map53BluebrickChain = process.env.HEROES_LORE_MAP53_BLUEBRICK_CHAIN === '1';
const map54CurrentCellExit = process.env.HEROES_LORE_MAP54_CURRENT_CELL_EXIT === '1';
const map54ToMap13Chain = process.env.HEROES_LORE_MAP54_TO_MAP13_CHAIN === '1';
if (map54CurrentCellExit && map54ToMap13Chain) {
  throw new Error('Select only one Map54 route probe');
}
const mapPreviewExitMapId = process.env.HEROES_LORE_MAP_PREVIEW_EXIT_MAP_ID === undefined
  ? null
  : Number(process.env.HEROES_LORE_MAP_PREVIEW_EXIT_MAP_ID);
const mapPreviewMovementSmoke = process.env.HEROES_LORE_MAP_PREVIEW_MOVE_SMOKE === '1';
const map37ClassSixMultiTargetTest = process.env.HEROES_LORE_MAP37_CLASS6_MULTITARGET === '1';
const map37ClassSixTripleTargetTest = process.env.HEROES_LORE_MAP37_CLASS6_TRIPLE_TARGET === '1';
const map37ClassSixLightFollowupTest = process.env.HEROES_LORE_MAP37_CLASS6_LIGHT_FOLLOWUP === '1';
const map37ClassSixHeavyStage4SweepTest = process.env.HEROES_LORE_MAP37_CLASS6_HEAVY_STAGE4_SWEEP === '1';
if ([map37ClassSixMultiTargetTest, map37ClassSixTripleTargetTest, map37ClassSixLightFollowupTest,
  map37ClassSixHeavyStage4SweepTest]
  .filter(Boolean).length > 1) {
  throw new Error('Select only one Map37 class-6 fan probe');
}
const observeMapPreviewEnemy = process.env.HEROES_LORE_OBSERVE_ENEMY === '1';
const approachMapPreviewEnemy = process.env.HEROES_LORE_APPROACH_ENEMY === '1';
const mapPreviewIdleObservationMs = Number(process.env.HEROES_LORE_MAP_IDLE_OBSERVATION_MS ?? 0);
const mapPreviewIdleSampleIntervalMs = Number(process.env.HEROES_LORE_MAP_IDLE_SAMPLE_INTERVAL_MS ?? 0);
if (!Number.isInteger(mapPreviewIdleObservationMs) || mapPreviewIdleObservationMs < 0 ||
  mapPreviewIdleObservationMs > 10000) {
  throw new Error('Map idle observation must be from 0 through 10000 milliseconds');
}
if (!Number.isInteger(mapPreviewIdleSampleIntervalMs) || mapPreviewIdleSampleIntervalMs < 0 ||
  mapPreviewIdleSampleIntervalMs > 1000 ||
  (mapPreviewIdleSampleIntervalMs > 0 && mapPreviewIdleObservationMs === 0)) {
  throw new Error('Map idle sample interval must be 0–1000 ms and requires an idle observation window');
}
const enemyObservationTarget = {
  sourceOrder: Number(process.env.HEROES_LORE_ENEMY_ORDER ?? 5),
  enemyId: Number(process.env.HEROES_LORE_ENEMY_ID ?? 4),
  behaviorType: Number(process.env.HEROES_LORE_ENEMY_BEHAVIOR ?? 2),
};
const enemyObservationDurationMs = Number(process.env.HEROES_LORE_ENEMY_OBSERVATION_MS ?? 7000);
if (map27WeaponProcStatusTest && (routeTarget !== 'map-preview' || mapPreviewId !== 27 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Weapon-proc status verification requires an isolated max-level Map27 preview');
}
if (map27PoisonTickTest && (routeTarget !== 'map-preview' || mapPreviewId !== 27 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null ||
  map27WeaponProcStatusTest)) {
  throw new Error('Poison-tick verification requires an isolated max-level Map27 preview');
}
if (map27BasicDamageFormulaTest && (routeTarget !== 'map27-combat' || profileName !== 'damage-survival' ||
  map27WeaponProcStatusTest || map27PoisonTickTest || observeMapPreviewEnemy)) {
  throw new Error('Basic-damage formula verification requires a damage-survival New Game to Map27 route');
}
if (map27WeaponProcDamageTest && (routeTarget !== 'map-preview' || mapPreviewId !== 27 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null ||
  map27WeaponProcStatusTest || map27PoisonTickTest)) {
  throw new Error('Weapon-proc code-8 verification requires an isolated max-level Map27 preview');
}
if (map27WeaponProcResourceTest && (!['sp', 'hp'].includes(map27WeaponProcResource) ||
  routeTarget !== 'map-preview' || mapPreviewId !== 27 || profileName !== 'max-level' ||
  observeMapPreviewEnemy || mapPreviewExitMapId !== null || map27WeaponProcStatusTest ||
  map27PoisonTickTest || map27WeaponProcDamageTest)) {
  throw new Error('Weapon-proc resource verification requires an isolated max-level Map27 SP/HP fixture');
}
if (map13AuProcResourceTest && ([map13AuProcSpTest, map13AuProcHpTest].filter(Boolean).length !== 1 ||
  routeTarget !== 'map-preview' || mapPreviewId !== 13 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null ||
  map27WeaponProcStatusTest || map27PoisonTickTest || map27WeaponProcDamageTest ||
  map27WeaponProcResourceTest)) {
  throw new Error('Source-au proc resource verification requires an isolated max-level Map13 preview');
}
if ([map27WeaponProcStatus, map27WeaponProcStatusSlow, map27WeaponProcStatusSlowCooldown,
  map27WeaponProcStatusDefense]
  .filter(Boolean).length > 1) {
  throw new Error('Select only one Map27 weapon-proc status mapping');
}
const supportedProfiles = routeTarget === 'map27-damage-pursuit' ||
  (routeTarget === 'map27-combat' && map27BasicDamageFormulaTest)
  ? ['damage-survival']
  : routeTarget === 'map-preview' ? ['max-level', 'damage-survival'] : ['max-level'];
if (!supportedProfiles.includes(profileName)) {
  throw new Error(`Route target ${routeTarget} requires one of these profiles: ${supportedProfiles.join(', ')}`);
}
if (!['map0', 'map0-reentry', 'map0-interaction', 'map27', 'map27-pursuit', 'map27-damage-pursuit', 'map27-combat', 'map27-combat-cycle', 'map27-mobile-touch', 'map0-mobile-touch', 'map-preview'].includes(routeTarget)) {
  throw new Error('The held-input route probe does not support this target');
}
if (routeTarget === 'map0-reentry' && profileName !== 'max-level') {
  throw new Error('Map0 re-entry requires the max-level profile');
}
if (mapPreviewId !== null && (!Number.isInteger(mapPreviewId) || mapPreviewId < 0 || mapPreviewId > 255)) {
  throw new Error('Map preview requires HEROES_LORE_MAP_ID to be an integer from 0 through 255');
}
if (map66NoChoiceBranch && (routeTarget !== 'map-preview' || mapPreviewId !== 66 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map66 No-branch verification requires an isolated max-level Map66 preview');
}
if (map59NoChoiceBranch && (routeTarget !== 'map-preview' || mapPreviewId !== 59 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map59 No-branch verification requires an isolated max-level Map59 preview');
}
if (map59YesChoiceBranch && (routeTarget !== 'map-preview' || mapPreviewId !== 59 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map59 Yes-branch verification requires an isolated max-level Map59 preview');
}
if (map59FullChain && (routeTarget !== 'map-preview' || mapPreviewId !== 59 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map59 full-chain verification requires an isolated max-level Map59 preview');
}
if (map54ItemPrize && (routeTarget !== 'map-preview' || mapPreviewId !== 54 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map54 item-prize verification requires an isolated max-level Map54 preview');
}
if (map53BluebrickChain && (routeTarget !== 'map-preview' || mapPreviewId !== 53 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map53 chain verification requires an isolated max-level Map53 checkpoint preview');
}
if (map54CurrentCellExit && (routeTarget !== 'map-preview' || mapPreviewId !== 54 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map54 cell-exit verification requires an isolated max-level Map54 preview');
}
if (map54ToMap13Chain && (routeTarget !== 'map-preview' || mapPreviewId !== 54 ||
  profileName !== 'max-level' || observeMapPreviewEnemy || mapPreviewExitMapId !== null)) {
  throw new Error('Map54-to-Map13 verification requires an isolated max-level Map54 preview');
}
if (observeMapPreviewEnemy && routeTarget !== 'map-preview') {
  throw new Error('Enemy observation is supported only on a DEV map-preview route');
}
if (approachMapPreviewEnemy && (!observeMapPreviewEnemy || routeTarget !== 'map-preview')) {
  throw new Error('Enemy approach requires a DEV map-preview enemy observation');
}
if (mapPreviewExitMapId !== null && (
  routeTarget !== 'map-preview' || mapPreviewId !== 27 || mapPreviewExitMapId !== 17 || observeMapPreviewEnemy
)) {
  throw new Error('Map-preview exit routing currently supports Map27 to Map17 without enemy observation');
}
if (mapPreviewMovementSmoke && (
  routeTarget !== 'map-preview' || profileName !== 'max-level' || observeMapPreviewEnemy ||
  mapPreviewExitMapId !== null || mapPreviewIdleObservationMs > 0 || map66NoChoiceBranch ||
  map59ChoiceBranch || map54ItemPrize || map53BluebrickChain || map54CurrentCellExit ||
  map54ToMap13Chain || map27WeaponProcStatusTest || map27PoisonTickTest ||
  map27BasicDamageFormulaTest || map27WeaponProcDamageTest || map27WeaponProcResourceTest ||
  map13AuProcResourceTest || map37ClassSixMultiTargetTest || map37ClassSixTripleTargetTest ||
  map37ClassSixLightFollowupTest || map37ClassSixHeavyStage4SweepTest
)) {
  throw new Error('Map preview movement smoke requires an isolated DEV max-level preview');
}
if (map37ClassSixMultiTargetTest && (
  routeTarget !== 'map-preview' || mapPreviewId !== 37 || profileName !== 'max-level' ||
  observeMapPreviewEnemy || mapPreviewExitMapId !== null || mapPreviewMovementSmoke ||
  mapPreviewIdleObservationMs > 0 || map27WeaponProcStatusTest || map27PoisonTickTest ||
  map27BasicDamageFormulaTest || map27WeaponProcDamageTest || map27WeaponProcResourceTest ||
  map13AuProcResourceTest
)) {
  throw new Error('Map37 multi-target verification requires an isolated DEV max-level Map37 preview');
}
if (map37ClassSixTripleTargetTest && (
  routeTarget !== 'map-preview' || mapPreviewId !== 37 || profileName !== 'max-level' ||
  observeMapPreviewEnemy || mapPreviewExitMapId !== null || mapPreviewMovementSmoke ||
  mapPreviewIdleObservationMs > 0 || map27WeaponProcStatusTest || map27PoisonTickTest ||
  map27BasicDamageFormulaTest || map27WeaponProcDamageTest || map27WeaponProcResourceTest ||
  map13AuProcResourceTest
)) {
  throw new Error('Map37 triple-target verification requires an isolated DEV max-level Map37 preview');
}
if (map37ClassSixLightFollowupTest && (
  routeTarget !== 'map-preview' || mapPreviewId !== 37 || profileName !== 'max-level' ||
  observeMapPreviewEnemy || mapPreviewExitMapId !== null || mapPreviewMovementSmoke ||
  mapPreviewIdleObservationMs > 0 || map27WeaponProcStatusTest || map27PoisonTickTest ||
  map27BasicDamageFormulaTest || map27WeaponProcDamageTest || map27WeaponProcResourceTest ||
  map13AuProcResourceTest
)) {
  throw new Error('Map37 light-follow-up verification requires an isolated DEV max-level Map37 preview');
}
if (map37ClassSixHeavyStage4SweepTest && (
  routeTarget !== 'map-preview' || mapPreviewId !== 37 || profileName !== 'max-level' ||
  observeMapPreviewEnemy || mapPreviewExitMapId !== null || mapPreviewMovementSmoke ||
  mapPreviewIdleObservationMs > 0 || map27WeaponProcStatusTest || map27PoisonTickTest ||
  map27BasicDamageFormulaTest || map27WeaponProcDamageTest || map27WeaponProcResourceTest ||
  map13AuProcResourceTest
)) {
  throw new Error('Map37 heavy-stage-4 verification requires an isolated DEV max-level Map37 preview');
}
if (mapPreviewIdleObservationMs > 0 && (
  routeTarget !== 'map-preview' || profileName !== 'max-level' || observeMapPreviewEnemy ||
  mapPreviewExitMapId !== null || map66NoChoiceBranch || map59ChoiceBranch || map54ItemPrize ||
  map53BluebrickChain || map54CurrentCellExit || map54ToMap13Chain || map27WeaponProcStatusTest ||
  map27PoisonTickTest || map27BasicDamageFormulaTest || map27WeaponProcDamageTest ||
  map27WeaponProcResourceTest || map13AuProcResourceTest || map37ClassSixLightFollowupTest ||
  map37ClassSixHeavyStage4SweepTest
)) {
  throw new Error('Map idle observation requires an isolated DEV max-level map preview');
}
if (observeMapPreviewEnemy && (
  !Number.isInteger(enemyObservationTarget.sourceOrder) || enemyObservationTarget.sourceOrder < 0 ||
  !Number.isInteger(enemyObservationTarget.enemyId) || enemyObservationTarget.enemyId < 0 ||
  ![2, 3].includes(enemyObservationTarget.behaviorType) ||
  !Number.isInteger(enemyObservationDurationMs) || enemyObservationDurationMs < 1000 || enemyObservationDurationMs > 15000
)) {
  throw new Error('Enemy observation requires an enemy ID/order, behavior 2 or 3, and a 1–15 second window');
}
const attemptNumber = Number(process.env.HEROES_LORE_ROUTE_ATTEMPT ?? 1);
if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
  throw new Error('The held-input route probe attempt number must be between 1 and 3');
}
const defaultMilestoneId = routeTarget === 'map27-combat-cycle' ? 'M988'
  : routeTarget === 'map0-reentry' ? 'M1040'
  : routeTarget === 'map0-interaction' ? 'M1041'
  : routeTarget === 'map27-combat' ? (map27BasicDamageFormulaTest ? 'M1108' : 'M987')
    : routeTarget === 'map27-damage-pursuit' ? 'M992'
    : routeTarget === 'map27-pursuit' ? 'M989'
      : routeTarget === 'map0-mobile-touch' ? 'M991'
      : routeTarget === 'map27-mobile-touch' ? 'M990'
  : routeTarget === 'map-preview' ? (map37ClassSixHeavyStage4SweepTest ? 'M1128' : map37ClassSixLightFollowupTest ? 'M1127' : map37ClassSixTripleTargetTest ? 'M1126' : map37ClassSixMultiTargetTest ? 'M1125' : map13AuProcHpTest ? 'M1113' : map13AuProcSpTest ? 'M1112' : map27WeaponProcResource === 'sp' ? 'M1110' : map27WeaponProcResource === 'hp' ? 'M1111' : map27WeaponProcDamageTest ? 'M1109' : map27PoisonTickTest ? 'M1106' : map27WeaponProcStatusDefense ? 'M1084' : map27WeaponProcStatusSlowCooldown ? 'M1105' : map27WeaponProcStatusSlow ? 'M1083' : map27WeaponProcStatus ? 'M1082' : map66NoChoiceBranch ? 'M1042' : map59NoChoiceBranch ? 'M1043' : map59YesChoiceBranch ? 'M1044' : map59FullChain ? 'M1045' : map54ItemPrize ? 'M1046' : map53BluebrickChain ? 'M1047' : map54ToMap13Chain ? 'M1051' : map54CurrentCellExit ? 'M1049' : mapPreviewExitMapId === 17 ? 'M1023' : 'M1010')
      : routeTarget === 'map27' ? 'M986' : 'M978';
const requestedMilestoneId = process.env.HEROES_LORE_MILESTONE_ID;
if (requestedMilestoneId !== undefined && !/^M\d{3,5}$/.test(requestedMilestoneId)) {
  throw new Error('HEROES_LORE_MILESTONE_ID must look like M1011');
}
const milestoneId = requestedMilestoneId ?? defaultMilestoneId;
const outputDirectoryOverride = process.env.HEROES_LORE_OUTPUT_DIR;
const evidenceRoot = `${resolve(root, 'reference/screenshots/web-render')}${sep}`;
const resolvedOutputOverride = outputDirectoryOverride === undefined
  ? null
  : resolve(root, outputDirectoryOverride);
if (resolvedOutputOverride !== null && !resolvedOutputOverride.startsWith(evidenceRoot)) {
  throw new Error('HEROES_LORE_OUTPUT_DIR must stay under reference/screenshots/web-render');
}

const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const previewScenario = mapPreviewId === null ? null : map13AuProcResourceTest
  ? `map13-au-proc-${map13AuProcResource}`
  : map27WeaponProcResourceTest
  ? `map27-weapon-proc-${map27WeaponProcResource}`
  : map27WeaponProcDamageTest
  ? 'map27-weapon-proc-damage'
  : map27PoisonTickTest
  ? 'map27-poison-tick'
  : map27WeaponProcStatusDefense
  ? 'map27-weapon-proc-status-defense'
  : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown
  ? map27WeaponProcStatusSlowCooldown
    ? 'map27-weapon-proc-status-slow-ai'
    : 'map27-weapon-proc-status-slow'
  : map27WeaponProcStatus
  ? 'map27-weapon-proc-status'
  : map37ClassSixLightFollowupTest
  ? 'map37-class6-light-followup'
  : map37ClassSixHeavyStage4SweepTest
  ? 'map37-class6-heavy-stage4-sweep'
  : map37ClassSixTripleTargetTest
  ? 'map37-class6-triple-target'
  : map37ClassSixMultiTargetTest
  ? 'map37-class6-multitarget'
  : map59YesChoiceBranch
  ? 'map-preview-59-key'
  : map59FullChain ? 'map-preview-59-prereqs'
  : map53BluebrickChain ? 'map53-flag82-bluebrick-route'
  : map54ToMap13Chain ? 'map54-to-map13-chain'
  : map54CurrentCellExit ? 'map54-current-cell-exit-latch'
  : `map-preview-${mapPreviewId}`;
const startUrl = process.env.HEROES_LORE_URL ??
  `http://127.0.0.1:5174/?testProfile=${encodeURIComponent(profileName)}${previewScenario === null ? '' : `&testScenario=${encodeURIComponent(previewScenario)}`}`;
const parsedStartUrl = new URL(startUrl);
if (parsedStartUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedStartUrl.hostname)) {
  throw new Error('The campaign probe can connect only to a local HTTP development server');
}
if (parsedStartUrl.searchParams.get('testProfile') !== profileName) {
  throw new Error(`The start URL must select testProfile=${profileName}`);
}
if (previewScenario !== null && parsedStartUrl.searchParams.get('testScenario') !== previewScenario) {
  throw new Error(`The start URL must select testScenario=${previewScenario}`);
}
const outputBaseDir = resolvedOutputOverride ?? resolve(root, routeTarget === 'map27-combat-cycle'
  ? 'reference/screenshots/web-render/M988-max-level-map27-respawn'
  : routeTarget === 'map0-reentry'
    ? 'reference/screenshots/web-render/M1040-house-reentry'
  : routeTarget === 'map0-interaction'
    ? 'reference/screenshots/web-render/M1041-map0-type2-interaction'
  : routeTarget === 'map27-damage-pursuit'
    ? 'reference/screenshots/web-render/M992-damage-survival-map27-pursuit'
  : routeTarget === 'map0-mobile-touch'
    ? 'reference/screenshots/web-render/M991-mobile-touch-map64-exit'
  : routeTarget === 'map27-mobile-touch'
    ? 'reference/screenshots/web-render/M990-mobile-touch-map27-attack'
  : routeTarget === 'map27-combat'
    ? (map27BasicDamageFormulaTest
      ? 'reference/screenshots/web-render/M1108-map27-basic-damage-formula'
      : 'reference/screenshots/web-render/M987-max-level-map27-combat')
    : routeTarget === 'map27-pursuit'
      ? 'reference/screenshots/web-render/M989-max-level-map27-pursuit'
    : routeTarget === 'map27'
      ? 'reference/screenshots/web-render/M986-max-level-map0-map27'
      : routeTarget === 'map-preview'
        ? (map37ClassSixHeavyStage4SweepTest
        ? 'reference/screenshots/web-render/M1128-map37-class6-heavy-stage4-sweep'
        : map37ClassSixLightFollowupTest
        ? 'reference/screenshots/web-render/M1127-map37-class6-light-followup'
        : map37ClassSixTripleTargetTest
        ? 'reference/screenshots/web-render/M1126-map37-class6-triple-target'
        : map37ClassSixMultiTargetTest
        ? 'reference/screenshots/web-render/M1125-map37-class6-multitarget'
        : map13AuProcResourceTest
        ? `reference/screenshots/web-render/${milestoneId}-map13-au-proc-${map13AuProcResource}`
        : map27WeaponProcResourceTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-${map27WeaponProcResource}`
        : map27WeaponProcDamageTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-damage`
        : map27PoisonTickTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-poison-tick`
        : map27WeaponProcStatusDefense
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-status-defense`
          : map27WeaponProcStatusSlowCooldown
          ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-status-slow-cooldown`
          : map27WeaponProcStatusSlow
          ? 'reference/screenshots/web-render/M1083-map27-weapon-proc-status-slow'
          : map66NoChoiceBranch
          ? 'reference/screenshots/web-render/M1042-map66-reference-book-no'
          : map59NoChoiceBranch
            ? 'reference/screenshots/web-render/M1043-map59-choice-no'
          : map59YesChoiceBranch
            ? 'reference/screenshots/web-render/M1044-map59-choice-yes'
          : map59FullChain
            ? 'reference/screenshots/web-render/M1045-map59-to-map13'
          : map54ItemPrize
            ? 'reference/screenshots/web-render/M1046-map54-item-prize'
          : map53BluebrickChain
            ? 'reference/screenshots/web-render/M1047-map53-bluebrick-chain'
          : map54ToMap13Chain
            ? 'reference/screenshots/web-render/M1051-map54-to-map13-chain'
          : map54CurrentCellExit
            ? 'reference/screenshots/web-render/M1049-map54-current-cell-exit-latch'
          : mapPreviewExitMapId === 17
          ? 'reference/screenshots/web-render/M1023-map27-to-map17'
          : `reference/screenshots/web-render/${milestoneId}-map-preview-${mapPreviewId}`)
      : 'reference/screenshots/web-render/M978-max-level-held-input');
const outputDir = routeTarget === 'map27-pursuit'
  ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map27-combat' && map27BasicDamageFormulaTest
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map0-reentry'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map0-interaction'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map27-damage-pursuit'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map0-mobile-touch'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map27-mobile-touch'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map-preview'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : outputBaseDir;
const userDataDir = await mkdtemp(join(tmpdir(), 'heroes-lore-owned-chromium-'));
const observations = [];
let mapPreviewMovementObservation = null;
let mapPreviewIdleObservation = null;
let map37ClassSixMultiTargetObservation = null;
let map37ClassSixTripleTargetObservation = null;
let map37ClassSixLightFollowupObservation = null;
let map37ClassSixHeavyStage4SweepObservation = null;
const cdpEvents = [];
let browserProcess;
let socket;
let cdp;
let chromeStderr = '';

class DevToolsPage {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else if ([
        'Network.loadingFailed',
        'Runtime.consoleAPICalled',
        'Runtime.exceptionThrown',
        'Log.entryAdded',
      ].includes(message.method)) {
        cdpEvents.push({ method: message.method, params: message.params ?? {} });
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP request timed out: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolvePromise(value); },
        reject: (error) => { clearTimeout(timeout); rejectPromise(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? 'Browser evaluation failed');
    }
    return response.result?.value;
  }
}

async function waitFor(predicate, { timeoutMs = 30000, intervalMs = 50, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await readRuntime();
    if (predicate(lastValue)) return lastValue;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}; last runtime: ${JSON.stringify(lastValue)}`);
}

async function readRuntime() {
  const value = await cdp.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    const raw = host.dataset.testRuntime;
    const playerInputRaw = host.dataset.testPlayerInputState;
    const cutsceneRaw = host.dataset.testEventCutscene;
    const enemyStatusRaw = host.dataset.testEnemyStatusEffects;
    const enemyProjectileRaw = host.dataset.testEnemyProjectiles;
    let runtime = null;
    let playerInputState = null;
    let eventCutscene = null;
    let enemyStatusEffects = [];
    let enemyProjectiles = [];
    if (raw) {
      try { runtime = JSON.parse(raw); } catch {}
    }
    if (playerInputRaw) {
      try { playerInputState = JSON.parse(playerInputRaw); } catch {}
    }
    if (cutsceneRaw) {
      try { eventCutscene = JSON.parse(cutsceneRaw); } catch {}
    }
    if (enemyStatusRaw) {
      try { enemyStatusEffects = JSON.parse(enemyStatusRaw); } catch {}
    }
    if (enemyProjectileRaw) {
      try { enemyProjectiles = JSON.parse(enemyProjectileRaw); } catch {}
    }
    return {
      profile: host.dataset.testProfile ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      playerInputState,
      runtime,
      enemyStatusEffects,
      enemyProjectiles,
      eventCutscene,
    };
  })()`);
  return value ?? null;
}

async function waitForCanvas() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`document.readyState === 'complete' &&
      document.querySelector('#game canvas') !== null`);
    if (ready) return;
    await delay(50);
  }
  throw new Error('Timed out waiting for the game canvas');
}

async function observe(label) {
  const state = await readRuntime();
  const record = { at: new Date().toISOString(), label, state };
  observations.push(record);
  return state;
}

async function tap(key, code, virtualKeyCode, textValue = undefined) {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
  if (textValue !== undefined) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...keyParams });
  }
  await delay(90);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
  await delay(140);
}

async function pulseComboKey(key, code, virtualKeyCode, textValue) {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
  if (textValue !== undefined) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...keyParams });
  }
  await delay(75);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
  await delay(10);
}

async function holdUntil(key, code, virtualKeyCode, predicate, {
  timeoutMs = 8000,
  label,
  recordObservation = true,
} = {}) {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  const deadline = Date.now() + timeoutMs;
  let finalState = null;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
  try {
    while (Date.now() < deadline) {
      finalState = await readRuntime();
      if (predicate(finalState)) {
        if (recordObservation) observations.push({ at: new Date().toISOString(), label, state: finalState });
        return finalState;
      }
      await delay(20);
    }
    if (recordObservation) observations.push({ at: new Date().toISOString(), label: `${label}-timeout`, state: finalState });
    return finalState;
  } finally {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
    await delay(250);
  }
}

async function saveScreenshot(name) {
  const response = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(join(outputDir, name), Buffer.from(response.data, 'base64'));
}

async function waitForDevToolsPort() {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (port !== undefined && /^\d+$/.test(port)) return Number(port);
    } catch {}
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chromium exited before DevTools became ready (${browserProcess.exitCode})`);
    }
    await delay(50);
  }
  throw new Error('Timed out waiting for Chromium DevTools port');
}

async function connectToPage(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page !== undefined) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          socket.addEventListener('open', resolvePromise, { once: true });
          socket.addEventListener('error', rejectPromise, { once: true });
        });
        cdp = new DevToolsPage(socket);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');
        await cdp.send('Log.enable');
        return;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out connecting to Chromium page');
}

async function launch() {
  browserProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=780,380',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browserProcess.stderr.setEncoding('utf8');
  browserProcess.stderr.on('data', (chunk) => { chromeStderr += chunk; });
  const port = await waitForDevToolsPort();
  await connectToPage(port);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const calls = [];
      Object.defineProperty(window, '__heroesLoreStorageCalls', { value: calls });
      const local = window.localStorage;
      const session = window.sessionStorage;
      const storeName = (store) => store === local ? 'localStorage' :
        store === session ? 'sessionStorage' : 'unknownStorage';
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          calls.push({ store: storeName(this), method,
            key: method === 'key' ? null : (args[0] ?? null) });
          return original.apply(this, args);
        };
      }
      const length = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
      if (length?.get && length.configurable) {
        Object.defineProperty(Storage.prototype, 'length', {
          ...length,
          get() {
            calls.push({ store: storeName(this), method: 'length', key: null });
            return length.get.call(this);
          },
        });
      }
    })();`,
  });
  await cdp.send('Page.navigate', { url: startUrl });
  if (routeTarget === 'map27-mobile-touch' || routeTarget === 'map0-mobile-touch') {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await delay(250);
  }
  await waitForCanvas();
  await delay(1500);
  await cdp.send('Page.bringToFront');
}

async function startNewGameAndReachMap64() {
  await observe('fresh-title');
  await saveScreenshot('00-title-screen.png');
  const initialPresses = [
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowRight', 'ArrowRight', 39],
    ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of initialPresses) await tap(key, code, vk);

  await waitFor((state) => state?.mapId === 0 && state?.runtime !== null, {
    timeoutMs: 30000,
    label: 'opening Map0 runtime',
  });
  await observe('new-game-opening-map0');
  // The opening scene initializes asynchronously after the telemetry appears.
  await delay(9000);
  await tap('w', 'KeyW', 87, 'w');
  await waitFor((state) => state?.mapId === 64, {
    timeoutMs: 30000,
    label: 'opening transfer to Map64',
  });
  const state = await observe('map64-bedroom-start');
  const expectedLevel = profileName === 'max-level' ? 99 : 1;
  if (state.level !== expectedLevel || state.profile !== profileName) {
    throw new Error(`Unexpected test profile at Map64: ${JSON.stringify(state)}`);
  }
  await saveScreenshot('01-map64-before-held-move.png');
  return state;
}

async function startNewGameAndReachMapPreview() {
  if (mapPreviewId === null) throw new Error('Map preview route has no map ID');
  await observe('fresh-title');
  await saveScreenshot('00-title-screen.png');
  const initialPresses = [
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowRight', 'ArrowRight', 39],
    ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of initialPresses) await tap(key, code, vk);
  const readyState = await waitFor((candidate) => candidate?.mapPreviewReady === true && candidate?.mapId === mapPreviewId &&
    candidate?.runtime !== null && candidate.tileX !== null && candidate.tileY !== null &&
    candidate.tileX >= 0 && candidate.tileY >= 0 &&
    candidate.tileX < candidate.runtime.mapSize.width &&
    candidate.tileY < candidate.runtime.mapSize.height, {
    timeoutMs: 30000,
    label: `map-preview-${mapPreviewId} in-bounds player spawn`,
  });
  observations.push({ at: new Date().toISOString(), label: `map-preview-${mapPreviewId}-first-ready`, state: readyState });
  if (mapPreviewMovementSmoke) {
    mapPreviewMovementObservation = await runMapPreviewMovementSmoke(readyState);
  }
  if (observeMapPreviewEnemy) {
    observations.push({ at: new Date().toISOString(), label: 'map-preview-enemy-first-ready-state', state: readyState });
    await saveScreenshot('02-map-preview-first-ready.png');
  }
  await delay(mapPreviewMovementSmoke || map37ClassSixMultiTargetTest || map37ClassSixTripleTargetTest ||
    map37ClassSixLightFollowupTest || map37ClassSixHeavyStage4SweepTest ? 0 : 300);
  const settled = await observe(`map-preview-${mapPreviewId}-arrival`);
  const expectedLevel = profileName === 'max-level' ? 99 : 1;
  if (settled.level !== expectedLevel || settled.profile !== profileName || settled.mapId !== mapPreviewId) {
    throw new Error(`Unexpected map preview runtime: ${JSON.stringify(settled)}`);
  }
  await saveScreenshot(`01-map-preview-${mapPreviewId}.png`);
  if (observeMapPreviewEnemy) await saveScreenshot('03-map-preview-settled.png');
  if (mapPreviewIdleObservationMs > 0) {
    const idleSamples = [];
    if (mapPreviewIdleSampleIntervalMs > 0) {
      await cdp.evaluate(`(() => {
        const host = document.querySelector('#game');
        window.__heroesLoreMapIdleSamples = [];
        const startedAt = performance.now();
        window.__heroesLoreMapIdleTimer = setInterval(() => {
          let runtime = null;
          let playerInputState = null;
          try { runtime = JSON.parse(host?.dataset.testRuntime ?? 'null'); } catch {}
          try { playerInputState = JSON.parse(host?.dataset.testPlayerInputState ?? 'null'); } catch {}
          window.__heroesLoreMapIdleSamples.push({
            elapsedMs: Math.round(performance.now() - startedAt),
            mapId: host?.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
            tile: [
              host?.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
              host?.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
            ],
            hp: host?.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
            playerInputState,
            sourceMap15Actors: (runtime?.enemies ?? [])
              .filter((enemy) => enemy.sourceMap15Ai !== undefined)
              .map((enemy) => ({ sourceOrder: enemy.sourceOrder, enemyId: enemy.enemyId, ...enemy.sourceMap15Ai })),
          });
        }, ${mapPreviewIdleSampleIntervalMs});
      })()`);
      await delay(mapPreviewIdleObservationMs);
      const pageSamples = await cdp.evaluate(`(() => {
        clearInterval(window.__heroesLoreMapIdleTimer);
        return window.__heroesLoreMapIdleSamples ?? [];
      })()`);
      if (Array.isArray(pageSamples)) idleSamples.push(...pageSamples);
    } else {
      await delay(mapPreviewIdleObservationMs);
    }
    const idleEnd = await observe(`map-preview-${mapPreviewId}-idle-end`);
    const summarize = (state) => {
      const runtime = state?.runtime;
      const enemies = Array.isArray(runtime?.enemies) ? runtime.enemies : [];
      const npcs = Array.isArray(runtime?.npcs) ? runtime.npcs : [];
      return {
        mapId: state?.mapId ?? null,
        profile: state?.profile ?? null,
        level: state?.level ?? null,
        hp: state?.hp ?? null,
        maxHp: runtime?.resources?.maxHp ?? null,
        tile: [state?.tileX ?? null, state?.tileY ?? null],
        playerInputState: state?.playerInputState ?? null,
        mapSize: runtime?.mapSize ?? null,
        enemyCount: enemies.length,
        aliveEnemyCount: enemies.filter((enemy) => enemy.state === 'alive').length,
        visibleEnemyCount: enemies.filter((enemy) => enemy.sourceRenderedOnScreen === true).length,
        npcCount: npcs.length,
        visibleNpcCount: npcs.filter((npc) => npc.visible === true).length,
        enemyStates: enemies.map((enemy) => ({
          sourceOrder: enemy.sourceOrder,
          enemyId: enemy.enemyId,
          tileX: enemy.tileX,
          tileY: enemy.tileY,
          hp: enemy.hp,
          state: enemy.state,
          animationStateIndex: enemy.animationStateIndex,
          attackCooldownTicksRemaining: enemy.attackCooldownTicksRemaining,
          pursuitTarget: enemy.pursuitTarget,
          sourceMap15Ai: enemy.sourceMap15Ai ?? null,
        })).sort((left, right) => left.sourceOrder - right.sourceOrder),
      };
    };
    const startSummary = summarize(settled);
    const endSummary = summarize(idleEnd);
    const enemyStartByOrder = new Map(startSummary.enemyStates.map((enemy) => [enemy.sourceOrder, enemy]));
    const enemyEndByOrder = new Map(endSummary.enemyStates.map((enemy) => [enemy.sourceOrder, enemy]));
    const changedEnemySourceOrders = [...new Set([
      ...enemyStartByOrder.keys(),
      ...enemyEndByOrder.keys(),
    ])].filter((sourceOrder) => JSON.stringify(enemyStartByOrder.get(sourceOrder)) !==
      JSON.stringify(enemyEndByOrder.get(sourceOrder))).sort((left, right) => left - right);
    const inBounds = Number.isInteger(idleEnd?.tileX) && Number.isInteger(idleEnd?.tileY) &&
      idleEnd.tileX >= 0 && idleEnd.tileY >= 0 &&
      idleEnd.tileX < idleEnd.runtime?.mapSize?.width && idleEnd.tileY < idleEnd.runtime?.mapSize?.height;
    mapPreviewIdleObservation = {
      durationMs: mapPreviewIdleObservationMs,
      inputSentDuringWindow: false,
      playerMovedDuringWindow: startSummary.tile[0] !== endSummary.tile[0] ||
        startSummary.tile[1] !== endSummary.tile[1],
      passed: idleEnd?.mapId === mapPreviewId && idleEnd?.runtime?.mapId === mapPreviewId &&
        idleEnd?.profile === 'max-level' && idleEnd?.level === 99 && idleEnd?.hp > 0 && inBounds &&
        startSummary.mapId === idleEnd?.mapId,
      start: { ...startSummary, enemyStates: undefined },
      end: { ...endSummary, enemyStates: undefined },
      changedEnemyCount: changedEnemySourceOrders.length,
      changedEnemySourceOrders,
      ...(idleSamples.length === 0 ? {} : { samples: idleSamples }),
    };
    await saveScreenshot(`02-map-preview-${mapPreviewId}-idle-end.png`);
  }
  return settled;
}

async function runMapPreviewMovementSmoke(initialState) {
  const mapId = mapPreviewId;
  if (!Number.isInteger(mapId) || initialState?.mapId !== mapId || initialState?.runtime === null) {
    return { passed: false, status: 'invalid-preview-state', startTile: null, targetTile: null, attempts: [] };
  }
  const collisionPath = join(root, 'web', 'public', 'assets', 'generated', 'collision', '6',
    `${String(mapId).padStart(2, '0')}.json`);
  const collisionData = JSON.parse(await readFile(collisionPath, 'utf8'));
  const directions = [
    { name: 'up', dx: 0, dy: -1, key: 'ArrowUp', code: 'ArrowUp', virtualKeyCode: 38 },
    { name: 'right', dx: 1, dy: 0, key: 'ArrowRight', code: 'ArrowRight', virtualKeyCode: 39 },
    { name: 'down', dx: 0, dy: 1, key: 'ArrowDown', code: 'ArrowDown', virtualKeyCode: 40 },
    { name: 'left', dx: -1, dy: 0, key: 'ArrowLeft', code: 'ArrowLeft', virtualKeyCode: 37 },
  ];
  const attempts = [];
  let state = initialState;
  for (const direction of directions) {
    if (state?.mapId !== mapId || state?.runtime === null) break;
    const startTile = { x: state.tileX, y: state.tileY };
    const targetTile = { x: startTile.x + direction.dx, y: startTile.y + direction.dy };
    const occupied = new Set((state.runtime.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    const marker = collisionData.values[targetTile.y]?.[targetTile.x];
    if (marker !== 0 || occupied.has(`${targetTile.x},${targetTile.y}`)) continue;
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: direction.key, code: direction.code,
      windowsVirtualKeyCode: direction.virtualKeyCode,
    });
    const keyDownAt = Date.now();
    await delay(90);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: direction.key, code: direction.code,
      windowsVirtualKeyCode: direction.virtualKeyCode,
    });
    const keyPressDurationMs = Date.now() - keyDownAt;
    const moveDeadline = Date.now() + 1500;
    let moved = await readRuntime();
    while (Date.now() < moveDeadline && moved?.mapId === mapId &&
      moved?.tileX === startTile.x && moved?.tileY === startTile.y) {
      await delay(20);
      moved = await readRuntime();
    }
    const reachedTarget = moved?.mapId === mapId && moved?.tileX === targetTile.x && moved?.tileY === targetTile.y;
    attempts.push({
      direction: direction.name,
      startTile,
      targetTile,
      observedTile: moved === null ? null : { x: moved.tileX, y: moved.tileY },
      mapId: moved?.mapId ?? null,
      hp: moved?.hp ?? null,
      keyPressDurationMs,
      reachedTarget,
    });
    if (reachedTarget) {
      const final = await readRuntime();
      return {
        passed: final?.mapId === mapId && final?.level === 99 && final?.hp > 0,
        status: 'moved-one-ordinary-cell',
        startTile,
        targetTile,
        direction: direction.name,
        afterRelease: final === null ? null : {
          mapId: final.mapId,
          tile: [final.tileX, final.tileY],
          hp: final.hp,
          level: final.level,
        },
        attempts,
      };
    }
    if (moved?.mapId !== mapId || moved?.tileX !== startTile.x || moved?.tileY !== startTile.y) {
      return {
        passed: false,
        status: 'unexpected-displacement-during-input',
        startTile,
        targetTile,
        direction: direction.name,
        observedTile: moved === null ? null : [moved.tileX, moved.tileY],
        attempts,
      };
    }
    state = moved;
  }
  return {
    passed: false,
    status: attempts.length === 0 ? 'no-clear-ordinary-neighbor' : 'no-neighbor-movement-observed',
    startTile: { x: state?.tileX ?? initialState.tileX, y: state?.tileY ?? initialState.tileY },
    targetTile: null,
    attempts,
  };
}

async function runMap37ClassSixMultiTargetAttack(initialState) {
  const expectedTargets = [
    { sourceOrder: 2, enemyId: 18 },
    { sourceOrder: 3, enemyId: 20 },
  ];
  const summarize = (state) => expectedTargets.map(({ sourceOrder, enemyId }) => {
    const enemy = state?.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    return enemy === undefined ? null : {
      sourceOrder,
      enemyId,
      tile: [enemy.tileX, enemy.tileY],
      hp: enemy.hp,
      state: enemy.state,
    };
  });
  const before = await readRuntime();
  const targetsBefore = summarize(before);
  if (before?.mapId !== 37 || before.tileX !== 10 || before.tileY !== 9 ||
    before.runtime?.player?.direction !== 1 || before.level !== 99 ||
    before.hp !== before.runtime?.resources?.maxHp || targetsBefore.some((target) => target === null)) {
    throw new Error(`Map37 multi-target fixture was not ready at its expected state: ${JSON.stringify({ before, targetsBefore })}`);
  }
  observations.push({ at: new Date().toISOString(), label: 'map37-before-class6-heavy-fan', state: before });
  await saveScreenshot('02-map37-before-class6-heavy-fan.png');
  const inputStartedAt = Date.now();
  await tap('7', 'Numpad7', 103, '7');
  const after = await waitFor((state) => {
    if (state?.mapId !== 37 || state?.runtime?.player?.direction !== 1) return false;
    const targets = summarize(state);
    return targets.every((target, index) => target !== null && target.hp < targetsBefore[index].hp);
  }, { timeoutMs: 5000, intervalMs: 20, label: 'both Map37 fan targets lose HP' });
  const targetsAfter = summarize(after);
  await saveScreenshot('03-map37-class6-heavy-fan-hit.png');
  const damage = targetsBefore.map((target, index) => ({
    sourceOrder: target.sourceOrder,
    enemyId: target.enemyId,
    beforeHp: target.hp,
    afterHp: targetsAfter[index]?.hp ?? null,
    damage: targetsAfter[index] === null ? null : target.hp - targetsAfter[index].hp,
  }));
  const passed = damage.length === 2 && damage.every((entry) => Number.isInteger(entry.damage) && entry.damage > 0) &&
    targetsAfter.every((target) => target?.state === 'alive' && target.hp > 0) &&
    after.level === 99 && after.hp === before.hp && after.hp > 0;
  return {
    passed,
    input: 'Numpad7 heavy stage 0',
    sourceClass: 6,
    player: { tile: [before.tileX, before.tileY], direction: before.runtime.player.direction,
      level: before.level, hpBefore: before.hp, hpAfter: after.hp },
    targetsBefore,
    targetsAfter,
    damage,
    expectedSourceCells: [[10, 8], [11, 8], [9, 8]],
    observedElapsedMs: Date.now() - inputStartedAt,
  };
}

async function runMap37ClassSixTripleTargetAttack(initialState) {
  const expectedTargets = [
    { sourceOrder: 2, enemyId: 18, tile: [10, 8] },
    { sourceOrder: 3, enemyId: 20, tile: [11, 8] },
    { sourceOrder: 1, enemyId: 18, tile: [9, 8] },
  ];
  const summarize = (state) => expectedTargets.map(({ sourceOrder, enemyId }) => {
    const enemy = state?.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    return enemy === undefined ? null : {
      sourceOrder,
      enemyId,
      tile: [enemy.tileX, enemy.tileY],
      hp: enemy.hp,
      state: enemy.state,
    };
  });
  const before = await readRuntime();
  const targetsBefore = summarize(before);
  if (before?.mapId !== 37 || before.tileX !== 10 || before.tileY !== 9 ||
    before.runtime?.player?.direction !== 1 || before.level !== 99 ||
    before.hp !== before.runtime?.resources?.maxHp || targetsBefore.some((target, index) =>
      target === null || target.tile[0] !== expectedTargets[index].tile[0] ||
      target.tile[1] !== expectedTargets[index].tile[1])) {
    throw new Error(`Map37 triple-target fixture was not ready at its expected state: ${JSON.stringify({ before, targetsBefore })}`);
  }
  observations.push({ at: new Date().toISOString(), label: 'map37-before-class6-triple-fan', state: before });
  await saveScreenshot('02-map37-before-class6-triple-fan.png');
  const inputStartedAt = Date.now();
  await tap('7', 'Numpad7', 103, '7');
  const after = await waitFor((state) => {
    if (state?.mapId !== 37 || state?.runtime?.player?.direction !== 1) return false;
    const targets = summarize(state);
    return targets.every((target, index) => target !== null && target.hp < targetsBefore[index].hp);
  }, { timeoutMs: 5000, intervalMs: 20, label: 'all three Map37 fan targets lose HP' });
  const targetsAfter = summarize(after);
  await saveScreenshot('03-map37-class6-triple-fan-hit.png');
  const damage = targetsBefore.map((target, index) => ({
    sourceOrder: target.sourceOrder,
    enemyId: target.enemyId,
    tile: target.tile,
    beforeHp: target.hp,
    afterHp: targetsAfter[index]?.hp ?? null,
    damage: targetsAfter[index] === null ? null : target.hp - targetsAfter[index].hp,
  }));
  const passed = damage.length === 3 && damage.every((entry) => Number.isInteger(entry.damage) && entry.damage > 0) &&
    targetsAfter.every((target) => target?.state === 'alive' && target.hp > 0) &&
    after.level === 99 && after.hp === before.hp && after.hp > 0;
  return {
    passed,
    input: 'Numpad7 heavy stage 0',
    sourceClass: 6,
    player: { tile: [before.tileX, before.tileY], direction: before.runtime.player.direction,
      level: before.level, hpBefore: before.hp, hpAfter: after.hp },
    targetsBefore,
    targetsAfter,
    damage,
    expectedSourceCells: [[10, 8], [11, 8], [9, 8]],
    observedElapsedMs: Date.now() - inputStartedAt,
  };
}

async function runMap37ClassSixLightFollowup(initialState) {
  const expectedTargets = [
    { sourceOrder: 2, enemyId: 18, tile: [10, 8] },
    { sourceOrder: 3, enemyId: 20, tile: [11, 8] },
    { sourceOrder: 1, enemyId: 18, tile: [9, 8] },
  ];
  const summarize = (state) => expectedTargets.map(({ sourceOrder, enemyId }) => {
    const enemy = state?.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    return enemy === undefined ? null : {
      sourceOrder,
      enemyId,
      tile: [enemy.tileX, enemy.tileY],
      hp: enemy.hp,
      state: enemy.state,
    };
  });
  const before = await readRuntime();
  const targetsBefore = summarize(before);
  if (before?.mapId !== 37 || before.tileX !== 10 || before.tileY !== 9 ||
    before.runtime?.player?.direction !== 1 || before.level !== 99 ||
    before.hp !== before.runtime?.resources?.maxHp || before.runtime?.combo?.comboLimit !== 2 ||
    targetsBefore.some((target, index) => target === null ||
      target.tile[0] !== expectedTargets[index].tile[0] ||
      target.tile[1] !== expectedTargets[index].tile[1])) {
    throw new Error(`Map37 light-follow-up fixture was not ready: ${JSON.stringify({ before, targetsBefore })}`);
  }
  observations.push({ at: new Date().toISOString(), label: 'map37-before-class6-light-followup', state: before });
  await saveScreenshot('02-map37-before-class6-light-followup.png');

  await pulseComboKey('5', 'Numpad5', 101, '5');
  await pulseComboKey('5', 'Numpad5', 101, '5');
  const afterStage0 = await waitFor((state) => {
    const targets = summarize(state);
    return state?.mapId === 37 && targets[0]?.hp < targetsBefore[0].hp &&
      targets[1]?.hp === targetsBefore[1].hp && targets[2]?.hp === targetsBefore[2].hp &&
      state?.runtime?.combo?.stage === 0 && state.runtime.combo.activeStyle === 'light' &&
      state.runtime.combo.queuedStyle === 'light';
  }, { timeoutMs: 5000, intervalMs: 20, label: 'class-6 light stage-0 forward impact' });
  const stage0Targets = summarize(afterStage0);
  await saveScreenshot('03-map37-class6-light-stage0-hit.png');

  const afterFollowup = await waitFor((state) => {
    if (state?.mapId !== 37 || state?.runtime?.combo?.stage !== 1) return false;
    const targets = summarize(state);
    return targets.every((target, index) => target !== null && target.hp < stage0Targets[index].hp);
  }, { timeoutMs: 5000, intervalMs: 20, label: 'class-6 light stage-1 fan hits all three targets' });
  const targetsAfterFollowup = summarize(afterFollowup);
  await saveScreenshot('04-map37-class6-light-stage1-fan-hit.png');
  const damage = targetsAfterFollowup.map((target, index) => ({
    sourceOrder: target.sourceOrder,
    enemyId: target.enemyId,
    tile: target.tile,
    stage0Hp: stage0Targets[index]?.hp ?? null,
    afterFollowupHp: target.hp,
    followupDamage: stage0Targets[index] === null ? null : stage0Targets[index].hp - target.hp,
    totalDamage: targetsBefore[index].hp - target.hp,
  }));
  const passed = afterStage0.runtime.combo.stage === 0 && afterFollowup.runtime.combo.stage === 1 &&
    damage.length === 3 && damage.every((entry) => Number.isInteger(entry.followupDamage) && entry.followupDamage > 0) &&
    targetsAfterFollowup.every((target) => target.state === 'alive' && target.hp > 0) &&
    afterFollowup.level === 99 && afterFollowup.hp === before.hp && afterFollowup.hp > 0;
  return {
    passed,
    inputs: ['Numpad5 light stage 0', 'Numpad5 queued light stage 1'],
    sourceClass: 6,
    comboLimit: before.runtime.combo.comboLimit,
    player: { tile: [before.tileX, before.tileY], direction: before.runtime.player.direction,
      level: before.level, hpBefore: before.hp, hpAfter: afterFollowup.hp },
    targetsBefore,
    stage0Targets,
    targetsAfterFollowup,
    damage,
  };
}

async function runMap37ClassSixHeavyStage4Sweep(initialState) {
  const expectedTargets = [
    { sourceOrder: 0, enemyId: 18, tile: [9, 8] },
    { sourceOrder: 1, enemyId: 20, tile: [10, 9] },
    { sourceOrder: 2, enemyId: 18, tile: [9, 10] },
    { sourceOrder: 3, enemyId: 20, tile: [8, 9] },
    { sourceOrder: 4, enemyId: 18, tile: [8, 8] },
    { sourceOrder: 5, enemyId: 20, tile: [10, 8] },
    { sourceOrder: 6, enemyId: 18, tile: [8, 10] },
    { sourceOrder: 7, enemyId: 20, tile: [10, 10] },
  ];
  const summarize = (state) => expectedTargets.map(({ sourceOrder, enemyId }) => {
    const enemy = state?.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    return enemy === undefined ? null : {
      sourceOrder,
      enemyId,
      tile: [enemy.tileX, enemy.tileY],
      hp: enemy.hp,
      state: enemy.state,
    };
  });
  const before = await readRuntime();
  const targetsBefore = summarize(before);
  if (before?.mapId !== 37 || before.tileX !== 9 || before.tileY !== 9 ||
    before.runtime?.player?.direction !== 1 || before.level !== 99 ||
    before.hp !== before.runtime?.resources?.maxHp || before.runtime?.combo?.comboLimit !== 5 ||
    targetsBefore.some((target, index) => target === null ||
      target.tile[0] !== expectedTargets[index].tile[0] ||
      target.tile[1] !== expectedTargets[index].tile[1])) {
    throw new Error(`Map37 heavy-stage-4 sweep fixture was not ready: ${JSON.stringify({ before, targetsBefore })}`);
  }
  observations.push({ at: new Date().toISOString(), label: 'map37-before-class6-heavy-stage4-sweep', state: before });
  await saveScreenshot('02-map37-before-class6-heavy-stage4-sweep.png');

  const stageTransitions = [];
  await pulseComboKey('5', 'Numpad5', 101, '5');
  for (let stage = 0; stage <= 3; stage += 1) {
    const active = await waitFor((state) => state?.mapId === 37 &&
      state?.runtime?.combo?.stage === stage && state.runtime.combo.activeStyle === 'light', {
      timeoutMs: 5000,
      intervalMs: 5,
      label: `class-6 light combo stage ${stage} begins`,
    });
    stageTransitions.push({ stage, style: active.runtime.combo.activeStyle, frame: active.runtime.combo.frame });
    if (stage < 3) {
      await pulseComboKey('5', 'Numpad5', 101, '5');
      continue;
    }
    await saveScreenshot('03-map37-class6-light-stage3-before-heavy-queue.png');
    await pulseComboKey('7', 'Numpad7', 103, '7');
  }

  const stage4Start = await waitFor((state) => state?.mapId === 37 &&
    state?.runtime?.combo?.stage === 4 && state.runtime.combo.activeStyle === 'heavy' &&
    state.runtime.combo.frame === 0, {
    timeoutMs: 5000,
    intervalMs: 5,
    label: 'class-6 heavy stage 4 begins before its first impact frame',
  });
  const targetsBeforeSweep = summarize(stage4Start);
  observations.push({ at: new Date().toISOString(), label: 'map37-class6-heavy-stage4-frame0', state: stage4Start });
  await saveScreenshot('04-map37-class6-heavy-stage4-frame0.png');
  const after = await waitFor((state) => {
    if (state?.mapId !== 37 || state?.runtime?.combo?.stage !== 4 ||
      state.runtime.combo.activeStyle !== 'heavy' || state.runtime.combo.frame < 1) return false;
    const targets = summarize(state);
    return targets.every((target, index) => target !== null && target.hp < targetsBeforeSweep[index].hp);
  }, { timeoutMs: 5000, intervalMs: 5, label: 'heavy stage-4 frame-1 sweep damages all eight surrounding cells' });
  const targetsAfter = summarize(after);
  await saveScreenshot('05-map37-class6-heavy-stage4-sweep-hit.png');
  const damage = targetsBeforeSweep.map((target, index) => ({
    sourceOrder: target.sourceOrder,
    enemyId: target.enemyId,
    tile: target.tile,
    beforeHp: target.hp,
    afterHp: targetsAfter[index]?.hp ?? null,
    damage: targetsAfter[index] === null ? null : target.hp - targetsAfter[index].hp,
  }));
  const passed = stageTransitions.length === 4 && stageTransitions.every(({ stage, style }) =>
    style === 'light' && Number.isInteger(stage)) && stage4Start.runtime.combo.frame === 0 &&
    after.runtime.combo.stage === 4 && after.runtime.combo.activeStyle === 'heavy' &&
    damage.length === 8 && damage.every((entry) => Number.isInteger(entry.damage) && entry.damage > 0) &&
    targetsAfter.every((target) => target.state === 'alive' && target.hp > 0) &&
    after.level === 99 && after.hp === before.hp && after.hp > 0;
  return {
    passed,
    inputs: ['Numpad5 x4 for light stages 0–3', 'Numpad7 queued heavy stage 4'],
    sourceClass: 6,
    comboLimit: before.runtime.combo.comboLimit,
    player: { tile: [before.tileX, before.tileY], direction: before.runtime.player.direction,
      level: before.level, hpBefore: before.hp, hpAfter: after.hp },
    stageTransitions,
    targetsBeforeSweep,
    targetsAfter,
    damage,
    sourceCellOrder: expectedTargets.map(({ tile }) => tile),
  };
}

function findMapPath(values, start, goals, occupied, blockedCells = new Set()) {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const key = (x, y) => `${x},${y}`;
  const goalKeys = new Set(goals.map(([x, y]) => key(x, y)));
  const startKey = key(start[0], start[1]);
  const queue = [[start[0], start[1]]];
  const previous = new Map([[startKey, null]]);
  let goalKey = goalKeys.has(startKey) ? startKey : null;
  const directions = [
    { dx: 0, dy: -1, vector: '0,-1' },
    { dx: 1, dy: 0, vector: '1,0' },
    { dx: 0, dy: 1, vector: '0,1' },
    { dx: -1, dy: 0, vector: '-1,0' },
  ];
  for (let index = 0; goalKey === null && index < queue.length; index += 1) {
    const [x, y] = queue[index];
    for (const direction of directions) {
      const nextX = x + direction.dx;
      const nextY = y + direction.dy;
      const nextKey = key(nextX, nextY);
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height ||
        values[nextY][nextX] < 0 || (occupied.has(nextKey) && nextKey !== startKey) ||
        blockedCells.has(nextKey) ||
        previous.has(nextKey)) continue;
      previous.set(nextKey, { parent: key(x, y), vector: direction.vector });
      queue.push([nextX, nextY]);
      if (goalKeys.has(nextKey)) {
        goalKey = nextKey;
        break;
      }
    }
  }
  if (goalKey === null) return null;
  const path = [];
  let currentKey = goalKey;
  while (currentKey !== startKey) {
    const [x, y] = currentKey.split(',').map(Number);
    const entry = previous.get(currentKey);
    if (entry === null || entry === undefined) return null;
    path.push({ x, y, vector: entry.vector });
    currentKey = entry.parent;
  }
  path.reverse();
  return path;
}

async function runMap66NoChoiceBranch(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/66.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/66.json'), 'utf8',
  ));
  const marker = collision.values?.[10]?.[7];
  const markerNpc = eventData.npcPlacements.find((npc) =>
    npc.tileX === 7 && npc.tileY === 10 && npc.sourceOrder === 0);
  const triggerRows = eventData.triggerGroups[Math.abs(marker) - 1] ?? [];
  const gameFlags = new Set(initialState.runtime?.gameFlags ?? []);
  const inventory = initialState.runtime?.inventory ?? [];
  let selectedScriptIndex = null;
  for (const row of triggerRows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== 2) continue;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    if (!gameFlags.has(firstFlag) || !gameFlags.has(secondFlag)) continue;
    if (itemCategory !== 255 && !inventory.some((stack) =>
      stack.category === itemCategory && stack.itemId === itemId && stack.count >= itemCount)) continue;
    selectedScriptIndex = scriptIndex;
    break;
  }
  const choiceCommand = eventData.scripts?.[selectedScriptIndex]?.find((command) => command[0] === 2);
  if (marker !== 2 || markerNpc === undefined || selectedScriptIndex !== 1 ||
    choiceCommand?.[1] !== 8 || choiceCommand?.[2] !== 12 || collision.values?.[10]?.[8] !== 0) {
    throw new Error(`Map66 No-branch source precondition changed: ${JSON.stringify({
      marker, markerNpc, selectedScriptIndex, choiceCommand, approachCell: collision.values?.[10]?.[8],
    })}`);
  }
  const occupied = new Set((initialState.runtime?.entityOccupiedCells ?? [])
    .map((cell) => `${cell.tileX},${cell.tileY}`));
  const path = findMapPath(collision.values, [initialState.tileX, initialState.tileY], [[8, 10]], occupied);
  if (path === null) {
    throw new Error(`No Map66 path from ${initialState.tileX},${initialState.tileY} to the Lesley approach tile`);
  }
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const approachTrace = [];
  let state = initialState;
  for (const step of path) {
    const input = inputs.get(step.vector);
    if (input === undefined) throw new Error(`Unsupported Map66 route vector ${step.vector}`);
    state = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId === 66 && candidate.tileX === step.x && candidate.tileY === step.y, {
      timeoutMs: 5000,
      label: `Map66 Lesley approach ${step.x},${step.y}`,
    });
    approachTrace.push({ tile: [state.tileX, state.tileY], direction: state.runtime?.player?.direction });
  }
  await tap('ArrowLeft', 'ArrowLeft', 37);
  const approach = await observe('map66-lesley-no-approach');
  await saveScreenshot('02-map66-lesley-no-approach.png');
  if (approach.mapId !== 66 || approach.tileX !== 8 || approach.tileY !== 10 ||
    approach.runtime?.player?.direction !== 3) {
    throw new Error(`Map66 player did not face Lesley from (8,10): ${JSON.stringify(approach)}`);
  }

  await tap('Enter', 'Enter', 13);
  state = await waitFor((candidate) => candidate?.mapId === 66 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'dialogue' &&
    candidate.runtime?.dialogueOpen === true, {
    timeoutMs: 5000,
    label: 'Map66 Lesley script-1 dialogue',
  });
  await saveScreenshot('03-map66-lesley-dialogue.png');
  let dialogueAdvancePresses = 0;
  while (state.eventCutscene?.status !== 'choice' && dialogueAdvancePresses < 80) {
    if (state.eventCutscene?.status === 'dialogue') {
      await tap('Enter', 'Enter', 13);
      dialogueAdvancePresses += 1;
    } else if (state.eventCutscene?.status === 'running' || state.eventCutscene?.status === 'delay') {
      await delay(100);
    } else {
      throw new Error(`Map66 script left its dialogue before the choice: ${JSON.stringify(state.eventCutscene)}`);
    }
    state = await readRuntime();
  }
  state = await waitFor((candidate) => candidate?.eventCutscene?.scriptIndex === 1 &&
    candidate.eventCutscene.status === 'choice' && candidate.runtime?.dialogueOpen === true, {
    timeoutMs: 3000,
    label: 'Map66 Reference book 1 Yes/No choice',
  });
  const choiceDefault = state.eventCutscene.choiceSelection;
  await saveScreenshot('04-map66-reference-book-choice.png');
  if (choiceDefault !== 0) throw new Error(`Expected source-default Yes choice, got ${choiceDefault}`);

  await tap('ArrowDown', 'ArrowDown', 40);
  const choiceNo = await waitFor((candidate) => candidate?.eventCutscene?.status === 'choice' &&
    candidate.eventCutscene.choiceSelection === 1, {
    timeoutMs: 2000,
    label: 'Map66 No choice selection',
  });
  await saveScreenshot('05-map66-no-selected.png');
  await tap('Enter', 'Enter', 13);
  const noBranchStart = await waitFor((candidate) => candidate?.eventCutscene?.scriptIndex === 1 &&
    (candidate.eventCutscene.status === 'ended' ||
      candidate.eventCutscene.status === 'dialogue' && candidate.eventCutscene.commandIndex >= 20), {
    timeoutMs: 5000,
    label: 'Map66 No-branch continuation',
  });
  let finished = noBranchStart;
  for (let press = 0; press < 24; press += 1) {
    if (finished.eventCutscene?.status === 'ended' && finished.runtime?.dialogueOpen === false) break;
    if (finished.eventCutscene?.status === 'dialogue') {
      await tap('Enter', 'Enter', 13);
    } else if (finished.eventCutscene?.status !== 'ended') {
      await delay(100);
    }
    finished = await readRuntime();
  }
  finished = await waitFor((candidate) => candidate?.mapId === 66 &&
    candidate.eventCutscene?.status === 'ended' && candidate.runtime?.dialogueOpen === false, {
    timeoutMs: 3000,
    label: 'Map66 No-branch script end',
  });
  const after = await observe('map66-reference-book-no-finished');
  await saveScreenshot('06-map66-no-branch-finished.png');
  const noStateMutation = JSON.stringify(after.runtime?.gameFlags) ===
    JSON.stringify(initialState.runtime?.gameFlags) &&
    JSON.stringify(after.runtime?.questFlags) === JSON.stringify(initialState.runtime?.questFlags) &&
    JSON.stringify(after.runtime?.inventory) === JSON.stringify(initialState.runtime?.inventory);
  const passed = after.mapId === 66 && after.tileX === 8 && after.tileY === 10 &&
    after.level === 99 && after.hp === initialState.hp && choiceDefault === 0 &&
    choiceNo.eventCutscene?.choiceSelection === 1 && noBranchStart.eventCutscene?.commandIndex >= 20 &&
    after.eventCutscene?.status === 'ended' && noStateMutation;
  return {
    passed,
    route: 'visible New Game UI -> DEV max-level Map66 preview -> walk to Lesley -> choose No in script 1',
    source: { marker, markerTile: [7, 10], approachTile: [8, 10], selectedScriptIndex, choiceCommand },
    start: { mapId: initialState.mapId, tile: [initialState.tileX, initialState.tileY], hp: initialState.hp,
      level: initialState.level, gameFlags: initialState.runtime?.gameFlags,
      questFlags: initialState.runtime?.questFlags, inventory: initialState.runtime?.inventory },
    approachTrace,
    approach: { mapId: approach.mapId, tile: [approach.tileX, approach.tileY], direction: approach.runtime?.player?.direction },
    dialogueAdvancePresses,
    choiceDefault,
    choiceNo: { selection: choiceNo.eventCutscene?.choiceSelection, commandIndex: choiceNo.eventCutscene?.commandIndex },
    noBranchStart: { status: noBranchStart.eventCutscene?.status, commandIndex: noBranchStart.eventCutscene?.commandIndex },
    after: { mapId: after.mapId, tile: [after.tileX, after.tileY], hp: after.hp, level: after.level,
      gameFlags: after.runtime?.gameFlags, questFlags: after.runtime?.questFlags,
      inventory: after.runtime?.inventory, eventCutscene: after.eventCutscene },
    noStateMutation,
  };
}

async function runMap59NoChoiceBranch(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/59.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/59.json'), 'utf8',
  ));
  const marker = collision.values?.[4]?.[27];
  const triggerRows = eventData.triggerGroups[Math.abs(marker) - 1] ?? [];
  const gameFlags = new Set(initialState.runtime?.gameFlags ?? []);
  let selectedScriptIndex = null;
  for (const row of triggerRows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== 3) continue;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    if (!gameFlags.has(firstFlag) || !gameFlags.has(secondFlag)) continue;
    if (itemCategory !== 255) {
      const signed = (value) => value > 0x7f ? value - 0x100 : value;
      const wanted = [signed(itemCategory), signed(itemId), signed(itemCount)];
      if (!initialState.runtime?.inventory?.some((stack) => stack.category === wanted[0] &&
        stack.itemId === wanted[1] && stack.count >= wanted[2])) continue;
    }
    selectedScriptIndex = scriptIndex;
    break;
  }
  const choiceCommand = eventData.scripts?.[selectedScriptIndex]?.find((command) => command[0] === 2);
  const markerCells = [];
  for (let y = 0; y < collision.values.length; y += 1) {
    for (let x = 0; x < collision.values[y].length; x += 1) {
      if (collision.values[y][x] === marker) markerCells.push([x, y]);
    }
  }
  const occupied = new Set((initialState.runtime?.entityOccupiedCells ?? [])
    .map((cell) => `${cell.tileX},${cell.tileY}`));
  const markerTile = [27, 4];
  const approachTile = [26, 4];
  if (marker !== -2 || JSON.stringify(markerCells) !== JSON.stringify([[27, 4], [27, 5], [28, 5]]) ||
    selectedScriptIndex !== 1 || choiceCommand?.[1] !== 1 || choiceCommand?.[2] !== 6 ||
    collision.values?.[4]?.[26] !== 0) {
    throw new Error(`Map59 No-branch source precondition changed: ${JSON.stringify({
      marker, markerCells, selectedScriptIndex, choiceCommand, approachCell: collision.values?.[4]?.[26],
    })}`);
  }
  const path = findMapPath(
    collision.values,
    [initialState.tileX, initialState.tileY],
    [approachTile],
    occupied,
    new Set(['16,13']),
  );
  if (path === null) {
    throw new Error(`No Map59 path from ${initialState.tileX},${initialState.tileY} to the type-3 marker`);
  }
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const routeTrace = [];
  let state = initialState;
  for (const step of path) {
    const input = inputs.get(step.vector);
    if (input === undefined) throw new Error(`Unsupported Map59 route vector ${step.vector}`);
    state = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId === 59 && candidate.tileX === step.x && candidate.tileY === step.y, {
      timeoutMs: 5000,
      label: `Map59 type-3 marker approach ${step.x},${step.y}`,
    });
    if (state?.mapId !== 59 || state.tileX !== step.x || state.tileY !== step.y) {
      throw new Error(`Map59 route diverged before the marker: expected ${step.x},${step.y}, ` +
        `observed ${state?.tileX},${state?.tileY}`);
    }
    routeTrace.push({ tile: [state.tileX, state.tileY], hp: state.hp });
  }
  await saveScreenshot('02-map59-type3-marker-approach.png');
  const approach = await observe('map59-type3-marker-approach');
  if (approach.mapId !== 59 || approach.tileX !== approachTile[0] ||
    approach.tileY !== approachTile[1]) {
    throw new Error(`Map59 player did not reach the marker approach: ${JSON.stringify(approach)}`);
  }
  state = await holdUntil('ArrowRight', 'ArrowRight', 39, (candidate) =>
    candidate?.mapId === 59 && candidate.eventCutscene?.scriptIndex === 1 &&
    candidate.eventCutscene.status === 'dialogue', {
    timeoutMs: 5000,
    label: 'Map59 script-1 type-3 dialogue',
  });
  await saveScreenshot('03-map59-choice-dialogue.png');
  let dialogueAdvancePresses = 0;
  while (state.eventCutscene?.status !== 'choice' && dialogueAdvancePresses < 20) {
    if (state.eventCutscene?.status === 'dialogue') {
      await tap('Enter', 'Enter', 13);
      dialogueAdvancePresses += 1;
    } else if (state.eventCutscene?.status === 'running' || state.eventCutscene?.status === 'delay') {
      await delay(100);
    } else {
      throw new Error(`Map59 script left dialogue before its choice: ${JSON.stringify(state.eventCutscene)}`);
    }
    state = await readRuntime();
  }
  state = await waitFor((candidate) => candidate?.mapId === 59 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'choice' &&
    candidate.runtime?.dialogueOpen === true, {
    timeoutMs: 3000,
    label: 'Map59 item-choice selector',
  });
  const choiceDefault = state.eventCutscene.choiceSelection;
  await saveScreenshot('04-map59-choice-default-yes.png');
  if (choiceDefault !== 0) throw new Error(`Expected source-default Yes choice, got ${choiceDefault}`);
  await tap('ArrowDown', 'ArrowDown', 40);
  const choiceNo = await waitFor((candidate) => candidate?.eventCutscene?.status === 'choice' &&
    candidate.eventCutscene.choiceSelection === 1, {
    timeoutMs: 2000,
    label: 'Map59 No choice selection',
  });
  await saveScreenshot('05-map59-choice-no-selected.png');
  await tap('Enter', 'Enter', 13);
  const noBranchStart = await waitFor((candidate) => candidate?.mapId === 59 &&
    candidate.eventCutscene?.scriptIndex === 1 && (candidate.eventCutscene.status === 'ended' ||
      candidate.eventCutscene.commandIndex >= 7), {
    timeoutMs: 5000,
    label: 'Map59 No-branch jump to script end',
  });
  const finished = await waitFor((candidate) => candidate?.mapId === 59 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'ended' &&
    candidate.runtime?.dialogueOpen === false, {
    timeoutMs: 3000,
    label: 'Map59 No-branch script end',
  });
  const after = await observe('map59-no-branch-finished');
  await saveScreenshot('06-map59-no-branch-finished.png');
  const noStateMutation = JSON.stringify(after.runtime?.gameFlags) ===
    JSON.stringify(initialState.runtime?.gameFlags) &&
    JSON.stringify(after.runtime?.questFlags) === JSON.stringify(initialState.runtime?.questFlags) &&
    JSON.stringify(after.runtime?.inventory) === JSON.stringify(initialState.runtime?.inventory);
  const passed = after.mapId === 59 && after.tileX === approachTile[0] &&
    after.tileY === approachTile[1] && after.level === 99 && after.hp > 0 &&
    choiceDefault === 0 && choiceNo.eventCutscene?.choiceSelection === 1 &&
    noBranchStart.eventCutscene?.commandIndex >= 7 &&
    finished.eventCutscene?.status === 'ended' && noStateMutation;
  return {
    passed,
    route: 'visible New Game UI -> DEV max-level Map59 preview -> walk to type-3 marker 2 -> choose No in script 1',
    source: { marker, markerTile, markerCells, approachTile, selectedScriptIndex, choiceCommand },
    start: { mapId: initialState.mapId, tile: [initialState.tileX, initialState.tileY],
      hp: initialState.hp, level: initialState.level, gameFlags: initialState.runtime?.gameFlags,
      questFlags: initialState.runtime?.questFlags, inventory: initialState.runtime?.inventory },
    routeTrace,
    approach: { mapId: approach.mapId, tile: [approach.tileX, approach.tileY], hp: approach.hp },
    dialogueAdvancePresses,
    choiceDefault,
    choiceNo: { selection: choiceNo.eventCutscene?.choiceSelection,
      commandIndex: choiceNo.eventCutscene?.commandIndex },
    noBranchStart: { status: noBranchStart.eventCutscene?.status,
      commandIndex: noBranchStart.eventCutscene?.commandIndex },
    after: { mapId: after.mapId, tile: [after.tileX, after.tileY], hp: after.hp,
      level: after.level, gameFlags: after.runtime?.gameFlags,
      questFlags: after.runtime?.questFlags, inventory: after.runtime?.inventory,
      eventCutscene: after.eventCutscene },
    noStateMutation,
  };
}

async function runMap59YesChoiceBranch(initialState, { followMap12Prerequisite = false } = {}) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/59.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/59.json'), 'utf8',
  ));
  const marker = collision.values?.[4]?.[27];
  const triggerRows = eventData.triggerGroups[Math.abs(marker) - 1] ?? [];
  const gameFlags = new Set(initialState.runtime?.gameFlags ?? []);
  const inventory = initialState.runtime?.inventory ?? [];
  let selectedScriptIndex = null;
  for (const row of triggerRows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== 3) continue;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    if (!gameFlags.has(firstFlag) || !gameFlags.has(secondFlag)) continue;
    if (itemCategory !== 255) {
      const signed = (value) => value > 0x7f ? value - 0x100 : value;
      const wanted = [signed(itemCategory), signed(itemId), signed(itemCount)];
      if (!inventory.some((stack) => stack.category === wanted[0] &&
        stack.itemId === wanted[1] && stack.count >= wanted[2])) continue;
    }
    selectedScriptIndex = scriptIndex;
    break;
  }
  const choiceCommand = eventData.scripts?.[selectedScriptIndex]?.find((command) => command[0] === 2);
  const keyStack = inventory.find((stack) => stack.category === 19 && stack.itemId === 9);
  const markerCells = [];
  for (let y = 0; y < collision.values.length; y += 1) {
    for (let x = 0; x < collision.values[y].length; x += 1) {
      if (collision.values[y][x] === marker) markerCells.push([x, y]);
    }
  }
  const markerTile = [27, 4];
  const approachTile = [26, 4];
  if (marker !== -2 || JSON.stringify(markerCells) !== JSON.stringify([[27, 4], [27, 5], [28, 5]]) ||
    selectedScriptIndex !== 1 || choiceCommand?.[1] !== 1 || choiceCommand?.[2] !== 6 ||
    keyStack?.count !== 1 || collision.values?.[4]?.[26] !== 0) {
    throw new Error(`Map59 Yes-branch source precondition changed: ${JSON.stringify({
      marker, markerCells, selectedScriptIndex, choiceCommand, keyStack,
      approachCell: collision.values?.[4]?.[26],
    })}`);
  }
  const occupied = new Set((initialState.runtime?.entityOccupiedCells ?? [])
    .map((cell) => `${cell.tileX},${cell.tileY}`));
  const path = findMapPath(
    collision.values,
    [initialState.tileX, initialState.tileY],
    [approachTile],
    occupied,
    new Set(['16,13']),
  );
  if (path === null) {
    throw new Error(`No Map59 path from ${initialState.tileX},${initialState.tileY} to the type-3 marker`);
  }
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const routeTrace = [];
  let state = initialState;
  for (const step of path) {
    const input = inputs.get(step.vector);
    if (input === undefined) throw new Error(`Unsupported Map59 route vector ${step.vector}`);
    state = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId === 59 && candidate.tileX === step.x && candidate.tileY === step.y, {
      timeoutMs: 5000,
      label: `Map59 Yes-branch approach ${step.x},${step.y}`,
    });
    if (state?.mapId !== 59 || state.tileX !== step.x || state.tileY !== step.y) {
      throw new Error(`Map59 Yes-branch route diverged: expected ${step.x},${step.y}, ` +
        `observed ${state?.tileX},${state?.tileY}`);
    }
    routeTrace.push({ tile: [state.tileX, state.tileY], hp: state.hp });
  }
  const approach = await observe('map59-yes-branch-type3-marker-approach');
  await saveScreenshot('02-map59-type3-marker-approach.png');
  if (approach.mapId !== 59 || approach.tileX !== approachTile[0] ||
    approach.tileY !== approachTile[1]) {
    throw new Error(`Map59 player did not reach the marker approach: ${JSON.stringify(approach)}`);
  }
  state = await holdUntil('ArrowRight', 'ArrowRight', 39, (candidate) =>
    candidate?.mapId === 59 && candidate.eventCutscene?.scriptIndex === 1 &&
    candidate.eventCutscene.status === 'dialogue', {
    timeoutMs: 5000,
    label: 'Map59 Yes-branch type-3 dialogue',
  });
  await saveScreenshot('03-map59-choice-dialogue.png');
  let dialogueAdvancePresses = 0;
  while (state.eventCutscene?.status !== 'choice' && dialogueAdvancePresses < 20) {
    if (state.eventCutscene?.status === 'dialogue') {
      await tap('Enter', 'Enter', 13);
      dialogueAdvancePresses += 1;
    } else if (state.eventCutscene?.status === 'running' || state.eventCutscene?.status === 'delay') {
      await delay(100);
    } else {
      throw new Error(`Map59 script left dialogue before its choice: ${JSON.stringify(state.eventCutscene)}`);
    }
    state = await readRuntime();
  }
  state = await waitFor((candidate) => candidate?.mapId === 59 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'choice' &&
    candidate.runtime?.dialogueOpen === true, {
    timeoutMs: 3000,
    label: 'Map59 Yes/No selector',
  });
  const choiceDefault = state.eventCutscene.choiceSelection;
  await saveScreenshot('04-map59-choice-default-yes.png');
  if (choiceDefault !== 0) throw new Error(`Expected source-default Yes choice, got ${choiceDefault}`);
  await tap('Enter', 'Enter', 13);
  let map12Start = null;
  let after;
  let map12DialogueSkip = false;
  if (followMap12Prerequisite) {
    map12Start = await waitFor((candidate) => candidate?.mapId === 12 &&
      candidate.tileX === 13 && candidate.tileY === 13 &&
      candidate.eventCutscene?.scriptIndex === 0 && candidate.eventCutscene.status === 'dialogue' &&
      candidate.runtime?.inventory?.every((stack) =>
        stack.category !== 21 || stack.itemId !== 3 || stack.count === 0), {
      timeoutMs: 15000,
      label: 'Map59 transfer and Map12 script-0 prerequisite consumption',
    });
    await observe('map12-script0-after-map59-arrival');
    await saveScreenshot('05-map12-script0-after-map59-yes.png');
    await tap('w', 'KeyW', 87, 'w');
    map12DialogueSkip = true;
    after = await waitFor((candidate) => candidate?.mapId === 13 &&
      candidate.tileX === 10 && candidate.tileY === 10 && candidate.runtime !== null, {
      timeoutMs: 15000,
      label: 'Map12 script-0 transfer to Map13 tile (10,10)',
    });
    await observe('map13-after-map59-chain');
    await saveScreenshot('06-map13-after-map59-chain.png');
  } else {
    after = await waitFor((candidate) => candidate?.mapId === 12 &&
      candidate.tileX === 13 && candidate.tileY === 13 && candidate.runtime !== null, {
      timeoutMs: 15000,
      label: 'Map59 Yes-branch transfer to Map12 tile (13,13)',
    });
    await observe('map59-yes-branch-map12-arrival');
    await saveScreenshot('05-map12-after-map59-yes.png');
  }
  const keyConsumed = !after.runtime?.inventory?.some((stack) =>
    stack.category === 19 && stack.itemId === 9 && stack.count > 0);
  const prerequisiteConsumed = followMap12Prerequisite
    ? !after.runtime?.inventory?.some((stack) =>
      stack.category === 21 && stack.itemId === 3 && stack.count > 0)
    : true;
  const expectedGameFlags = followMap12Prerequisite
    ? [...new Set([...(initialState.runtime?.gameFlags ?? []), 48])].sort((left, right) => left - right)
    : initialState.runtime?.gameFlags;
  const expectedFlags = JSON.stringify(after.runtime?.gameFlags) === JSON.stringify(expectedGameFlags) &&
    JSON.stringify(after.runtime?.questFlags) === JSON.stringify(initialState.runtime?.questFlags);
  const expectedDestination = followMap12Prerequisite
    ? after.mapId === 13 && after.tileX === 10 && after.tileY === 10
    : after.mapId === 12 && after.tileX === 13 && after.tileY === 13;
  const passed = expectedDestination && after.level === 99 && after.hp > 0 &&
    choiceDefault === 0 && keyConsumed && prerequisiteConsumed && expectedFlags;
  return {
    passed,
    route: followMap12Prerequisite
      ? 'visible New Game UI -> DEV max-level Map59 preview with required items -> marker -2 -> choose Yes -> Map12 script 0 -> Map13/(10,10)'
      : 'visible New Game UI -> DEV max-level Map59 preview with category-19/item-9 -> marker -2 -> choose Yes -> Map12/(13,13)',
    source: { marker, markerTile, markerCells, approachTile, selectedScriptIndex, choiceCommand },
    start: { mapId: initialState.mapId, tile: [initialState.tileX, initialState.tileY],
      hp: initialState.hp, level: initialState.level, gameFlags: initialState.runtime?.gameFlags,
      questFlags: initialState.runtime?.questFlags, inventory },
    routeTrace,
    approach: { mapId: approach.mapId, tile: [approach.tileX, approach.tileY], hp: approach.hp },
    dialogueAdvancePresses,
    choiceDefault,
    map12Start: map12Start === null ? null : {
      mapId: map12Start.mapId, tile: [map12Start.tileX, map12Start.tileY],
      eventCutscene: map12Start.eventCutscene, inventory: map12Start.runtime?.inventory,
    },
    map12DialogueSkip,
    after: { mapId: after.mapId, tile: [after.tileX, after.tileY], hp: after.hp,
      level: after.level, gameFlags: after.runtime?.gameFlags,
      questFlags: after.runtime?.questFlags, inventory: after.runtime?.inventory,
      eventCutscene: after.eventCutscene },
    keyConsumed,
    prerequisiteConsumed,
    expectedFlags,
  };
}

async function runMap54ItemPrize(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/54.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/54.json'), 'utf8',
  ));
  const markerTile = [17, 9];
  const approachTile = [16, 9];
  const marker = collision.values?.[markerTile[1]]?.[markerTile[0]];
  const npc = eventData.npcPlacements.find((placement) =>
    placement.tileX === markerTile[0] && placement.tileY === markerTile[1] && placement.sourceOrder === 0);
  const triggerRows = eventData.triggerGroups[Math.abs(marker) - 1] ?? [];
  const initialFlags = new Set(initialState.runtime?.gameFlags ?? []);
  const initialInventory = initialState.runtime?.inventory ?? [];
  const signed = (value) => value > 0x7f ? value - 0x100 : value;
  let selectedScriptIndex = null;
  for (const row of triggerRows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== 2) continue;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    if (!initialFlags.has(firstFlag) || !initialFlags.has(secondFlag)) continue;
    if (itemCategory !== 255 && !initialInventory.some((stack) =>
      stack.category === signed(itemCategory) && stack.itemId === signed(itemId) &&
      stack.count >= signed(itemCount))) continue;
    selectedScriptIndex = scriptIndex;
    break;
  }
  const rewardScript = eventData.scripts?.[selectedScriptIndex] ?? [];
  const rewardCommandIndex = rewardScript.findIndex((command) =>
    command[0] === 11 && command[1] === 21 && command[2] === 3);
  const gameFlagCommandIndex = rewardScript.findIndex((command) =>
    command[0] === 9 && command[1] === 40 && command[2] === 0);
  const rewardCountCommand = rewardScript[rewardCommandIndex + 1];
  const repeatScript = eventData.scripts?.[2] ?? [];
  if (marker !== 2 || npc === undefined || selectedScriptIndex !== 1 ||
    collision.values?.[approachTile[1]]?.[approachTile[0]] !== 0 ||
    rewardCommandIndex < 0 || rewardCountCommand?.[0] !== 21 || rewardCountCommand?.[1] !== 1 ||
    gameFlagCommandIndex <= rewardCommandIndex || JSON.stringify(repeatScript) !== '[[99,0,0]]' ||
    initialFlags.has(40) || initialInventory.length !== 0) {
    throw new Error(`Map54 item-prize source precondition changed: ${JSON.stringify({
      marker, npc, selectedScriptIndex, rewardCommandIndex, rewardCountCommand,
      gameFlagCommandIndex, repeatScript, gameFlags: [...initialFlags], inventory: initialInventory,
      approachCell: collision.values?.[approachTile[1]]?.[approachTile[0]],
    })}`);
  }

  const occupied = new Set((initialState.runtime?.entityOccupiedCells ?? [])
    .map((cell) => `${cell.tileX},${cell.tileY}`));
  const path = findMapPath(
    collision.values,
    [initialState.tileX, initialState.tileY],
    [approachTile],
    occupied,
  );
  if (path === null) {
    throw new Error(`No Map54 path from ${initialState.tileX},${initialState.tileY} to NPC at (17,9)`);
  }
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const routeTrace = [];
  let state = initialState;
  for (const step of path) {
    const input = inputs.get(step.vector);
    if (input === undefined) throw new Error(`Unsupported Map54 route vector ${step.vector}`);
    state = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId === 54 && candidate.tileX === step.x && candidate.tileY === step.y, {
      timeoutMs: 5000,
      label: `Map54 NPC approach ${step.x},${step.y}`,
    });
    if (state?.mapId !== 54 || state.tileX !== step.x || state.tileY !== step.y) {
      throw new Error(`Map54 route diverged: expected ${step.x},${step.y}, ` +
        `observed ${state?.tileX},${state?.tileY}`);
    }
    routeTrace.push({ tile: [state.tileX, state.tileY], hp: state.hp });
  }
  await tap('ArrowRight', 'ArrowRight', 39);
  const approach = await observe('map54-item-prize-npc-approach');
  await saveScreenshot('02-map54-item-prize-npc-approach.png');
  if (approach.mapId !== 54 || approach.tileX !== approachTile[0] ||
    approach.tileY !== approachTile[1]) {
    throw new Error(`Map54 player did not remain beside the item-prize NPC: ${JSON.stringify(approach)}`);
  }

  if (approach.eventCutscene?.scriptIndex !== 1 || approach.eventCutscene?.status !== 'dialogue') {
    await tap('Enter', 'Enter', 13);
  }
  state = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'dialogue' &&
    candidate.runtime?.dialogueOpen === true, {
    timeoutMs: 5000,
    label: 'Map54 NPC reward script-1 dialogue',
  });
  await saveScreenshot('03-map54-item-prize-dialogue.png');
  let dialogueAdvancePresses = 0;
  while (!(state.eventCutscene?.status === 'ended' && state.runtime?.dialogueOpen === false) &&
    dialogueAdvancePresses < 100) {
    if (state.eventCutscene?.status === 'dialogue' || state.eventCutscene?.status === 'choice') {
      await tap('Enter', 'Enter', 13);
      dialogueAdvancePresses += 1;
    } else if (state.eventCutscene?.status === 'running' || state.eventCutscene?.status === 'delay' ||
      state.eventCutscene?.status === 'flash' || state.eventCutscene?.status === 'shake') {
      await delay(100);
    } else if (state.eventCutscene?.status === 'ended' && state.runtime?.dialogueOpen === false) {
      break;
    } else {
      throw new Error(`Map54 reward script left its dialogue unexpectedly: ${JSON.stringify(state.eventCutscene)}`);
    }
    state = await readRuntime();
  }
  const rewarded = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.eventCutscene?.scriptIndex === 1 && candidate.eventCutscene.status === 'ended' &&
    candidate.runtime?.dialogueOpen === false, {
    timeoutMs: 5000,
    label: 'Map54 item-prize script end',
  });
  const afterReward = await observe('map54-item-prize-received');
  await saveScreenshot('04-map54-item-prize-received.png');
  const rewardStack = afterReward.runtime?.inventory?.find((stack) =>
    stack.category === 21 && stack.itemId === 3);
  const expectedGameFlags = [...new Set([...(initialState.runtime?.gameFlags ?? []), 40])]
    .sort((left, right) => left - right);
  const expectedFlags = JSON.stringify(afterReward.runtime?.gameFlags) === JSON.stringify(expectedGameFlags) &&
    JSON.stringify(afterReward.runtime?.questFlags) === JSON.stringify(initialState.runtime?.questFlags);
  const rewardGrantedOnce = rewardStack?.count === 1 && afterReward.runtime?.inventory?.length === 1;
  if (afterReward.mapId !== 54 || afterReward.level !== 99 || afterReward.hp !== initialState.hp ||
    !rewardGrantedOnce || !expectedFlags) {
    throw new Error(`Map54 reward result mismatch: ${JSON.stringify({
      after: afterReward, rewardStack, expectedGameFlags, expectedFlags, rewardGrantedOnce,
    })}`);
  }

  // Re-enter the same NPC after flag 40 has selected its second, no-op script.
  await tap('Enter', 'Enter', 13);
  await delay(300);
  const afterRepeat = await observe('map54-item-prize-npc-repeat');
  await saveScreenshot('05-map54-item-prize-npc-repeat.png');
  const repeatRow = triggerRows.find((row) => {
    const [packedTypeAndFlags, flagLow, flagHigh] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== 2) return false;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    return expectedGameFlags.includes(firstFlag) && expectedGameFlags.includes(secondFlag);
  });
  const repeatScriptSelected = repeatRow?.[6] === 2;
  const repeatNoDuplicate = JSON.stringify(afterRepeat.runtime?.inventory) ===
    JSON.stringify(afterReward.runtime?.inventory) &&
    JSON.stringify(afterRepeat.runtime?.gameFlags) === JSON.stringify(afterReward.runtime?.gameFlags) &&
    JSON.stringify(afterRepeat.runtime?.questFlags) === JSON.stringify(afterReward.runtime?.questFlags);
  const passed = repeatScriptSelected && repeatNoDuplicate && afterRepeat.mapId === 54 &&
    afterRepeat.tileX === approachTile[0] && afterRepeat.tileY === approachTile[1] &&
    afterRepeat.level === 99 && afterRepeat.hp === initialState.hp;
  return {
    passed,
    route: 'visible New Game UI -> DEV max-level Map54 preview -> walk to NPC at (17,9) -> interact -> receive category-21/item-3 -> interact again with game flag 40',
    source: {
      marker,
      markerTile,
      approachTile,
      npc,
      selectedScriptIndex,
      rewardCommandIndex,
      rewardCountCommand,
      gameFlagCommandIndex,
      repeatScriptSelected,
      repeatScriptIndex: repeatRow?.[6] ?? null,
      repeatScript,
    },
    start: {
      mapId: initialState.mapId,
      tile: [initialState.tileX, initialState.tileY],
      hp: initialState.hp,
      level: initialState.level,
      gameFlags: initialState.runtime?.gameFlags,
      questFlags: initialState.runtime?.questFlags,
      inventory: initialInventory,
    },
    routeTrace,
    approach: {
      mapId: approach.mapId,
      tile: [approach.tileX, approach.tileY],
      direction: approach.runtime?.player?.direction,
    },
    dialogueAdvancePresses,
    rewarded: {
      status: rewarded.eventCutscene?.status,
      commandIndex: rewarded.eventCutscene?.commandIndex,
    },
    afterReward: {
      mapId: afterReward.mapId,
      tile: [afterReward.tileX, afterReward.tileY],
      hp: afterReward.hp,
      level: afterReward.level,
      gameFlags: afterReward.runtime?.gameFlags,
      questFlags: afterReward.runtime?.questFlags,
      inventory: afterReward.runtime?.inventory,
      eventCutscene: afterReward.eventCutscene,
      rewardGrantedOnce,
      expectedFlags,
    },
    afterRepeat: {
      mapId: afterRepeat.mapId,
      tile: [afterRepeat.tileX, afterRepeat.tileY],
      hp: afterRepeat.hp,
      level: afterRepeat.level,
      gameFlags: afterRepeat.runtime?.gameFlags,
      questFlags: afterRepeat.runtime?.questFlags,
      inventory: afterRepeat.runtime?.inventory,
      repeatNoDuplicate,
    },
  };
}

function selectMapProbeTriggerScript(eventData, marker, triggerType, runtime) {
  const rows = eventData.triggerGroups[Math.abs(marker) - 1] ?? [];
  const gameFlags = new Set(runtime?.gameFlags ?? []);
  const questFlags = new Set(runtime?.questFlags ?? []);
  const inventory = runtime?.inventory ?? [];
  const signed = (value) => value > 0x7f ? value - 0x100 : value;
  for (const row of rows) {
    const [packedTypeAndFlags, flagLow, flagHigh, itemCategory, itemId, itemCount, scriptIndex] = row;
    if (((packedTypeAndFlags >> 6) & 3) !== triggerType) continue;
    const firstFlag = ((packedTypeAndFlags & 12) << 6) | flagLow;
    const secondFlag = ((packedTypeAndFlags & 3) << 8) | flagHigh;
    const firstFlags = (packedTypeAndFlags & 32) === 0 ? gameFlags : questFlags;
    const secondFlags = (packedTypeAndFlags & 16) === 0 ? gameFlags : questFlags;
    if (!firstFlags.has(firstFlag) || !secondFlags.has(secondFlag)) continue;
    if (itemCategory !== 255 && !inventory.some((stack) =>
      stack.category === signed(itemCategory) && stack.itemId === signed(itemId) &&
      stack.count >= signed(itemCount))) continue;
    return scriptIndex === 255 ? null : { marker, row, scriptIndex };
  }
  return null;
}

function mapMarkerCells(values, marker) {
  const cells = [];
  for (let tileY = 0; tileY < values.length; tileY += 1) {
    for (let tileX = 0; tileX < (values[tileY]?.length ?? 0); tileX += 1) {
      if (values[tileY][tileX] === marker) cells.push([tileX, tileY]);
    }
  }
  return cells;
}

function passableNeighborsOfMarker(values, marker) {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const goals = new Map();
  for (const [tileX, tileY] of mapMarkerCells(values, marker)) {
    for (const [nextX, nextY] of [
      [tileX, tileY - 1], [tileX + 1, tileY], [tileX, tileY + 1], [tileX - 1, tileY],
    ]) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height ||
        values[nextY][nextX] < 0) continue;
      goals.set(`${nextX},${nextY}`, { tileX: nextX, tileY: nextY });
    }
  }
  return [...goals.values()];
}

function applyEventScriptCollisionWrites(values, commands) {
  const updated = values.map((row) => [...row]);
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (command?.[0] !== 42) continue;
    const propertyCommand = commands[index + 1];
    if (propertyCommand?.[0] !== 43) {
      throw new Error(`Opcode 42 at ${index} has no paired opcode 43`);
    }
    const tileX = command[1];
    const tileY = command[2];
    const rawCollision = propertyCommand[1];
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY) ||
      tileX < 0 || tileY < 0 || tileY >= updated.length || tileX >= updated[tileY].length) {
      throw new Error(`Event collision write is outside this map at (${tileX},${tileY})`);
    }
    updated[tileY][tileX] = rawCollision > 0x7f ? rawCollision - 0x100 : rawCollision;
    index += 1;
  }
  return updated;
}

function mapDirectionBetween(start, target) {
  const dx = target[0] - start[0];
  const dy = target[1] - start[1];
  if (dx === 0 && dy === -1) return ['ArrowUp', 'ArrowUp', 38];
  if (dx === 1 && dy === 0) return ['ArrowRight', 'ArrowRight', 39];
  if (dx === 0 && dy === 1) return ['ArrowDown', 'ArrowDown', 40];
  if (dx === -1 && dy === 0) return ['ArrowLeft', 'ArrowLeft', 37];
  throw new Error(`No cardinal input from ${start} to ${target}`);
}

async function walkCampaignMapTo(
  mapId, collisionValues, goals, label, blockedCells = new Set(), allowCombat = true,
) {
  const goalKeys = new Set(goals.map(({ tileX, tileY }) => `${tileX},${tileY}`));
  const temporaryBlocks = new Map();
  const routeTrace = [];
  let noPathTicks = 0;
  for (let move = 0; move < 650; move += 1) {
    const state = await readRuntime();
    if (state?.mapId !== mapId) return { state, routeTrace };
    const currentKey = `${state.tileX},${state.tileY}`;
    if (goalKeys.has(currentKey)) return { state, routeTrace };
    const now = Date.now();
    for (const [key, expiresAt] of temporaryBlocks) {
      if (expiresAt <= now) temporaryBlocks.delete(key);
    }
    const activeBlocks = new Set([...blockedCells, ...temporaryBlocks.keys()]);
    const occupied = new Set((state.runtime?.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    const path = findMapPath(
      collisionValues,
      [state.tileX, state.tileY],
      goals.map(({ tileX, tileY }) => [tileX, tileY]),
      occupied,
      activeBlocks,
    );
    if (path === null) {
      if (allowCombat && await defeatFirstEnemyOnCampaignRoute(
        mapId, collisionValues, goals, label, blockedCells,
      )) {
        noPathTicks = 0;
        continue;
      }
      noPathTicks += 1;
      if (!allowCombat && noPathTicks > 3) return { state: null, routeTrace };
      if (noPathTicks > 30) {
        throw new Error(`No live Map${mapId} route to ${label} from ${state.tileX},${state.tileY}; ` +
          `live enemies: ${JSON.stringify((state.runtime?.enemies ?? [])
            .filter((enemy) => enemy.state === 'alive')
            .map((enemy) => ({ sourceOrder: enemy.sourceOrder, enemyId: enemy.enemyId,
              tile: [enemy.tileX, enemy.tileY], hp: enemy.hp })))}`);
      }
      await delay(120);
      continue;
    }
    noPathTicks = 0;
    const next = path[0];
    const input = mapDirectionBetween([state.tileX, state.tileY], [next.x, next.y]);
    const moved = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId !== mapId || candidate.tileX === next.x && candidate.tileY === next.y, {
      timeoutMs: 1600,
      label: `${label} step ${next.x},${next.y}`,
      recordObservation: false,
    });
    if (moved?.mapId !== mapId) return { state: moved, routeTrace };
    if (moved?.tileX !== next.x || moved?.tileY !== next.y) {
      temporaryBlocks.set(`${next.x},${next.y}`, Date.now() + 1100);
      await delay(80);
      continue;
    }
    routeTrace.push([moved.tileX, moved.tileY]);
  }
  throw new Error(`Map${mapId} route exceeded movement limit while seeking ${label}`);
}

async function defeatFirstEnemyOnCampaignRoute(mapId, collisionValues, goals, label, blockedCells) {
  const state = await readRuntime();
  if (state?.mapId !== mapId || state.runtime === null) return false;
  const staticPath = findMapPath(
    collisionValues,
    [state.tileX, state.tileY],
    goals.map(({ tileX, tileY }) => [tileX, tileY]),
    new Set(),
    blockedCells,
  );
  if (staticPath === null) return false;
  const staticRouteCells = new Set(staticPath.map((step) => `${step.x},${step.y}`));
  const blockers = (state.runtime.enemies ?? []).filter((enemy) => enemy.state === 'alive' &&
    staticRouteCells.has(`${enemy.tileX},${enemy.tileY}`));
  for (const blocker of blockers) {
    const approachGoals = [];
    const occupied = new Set((state.runtime.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    for (const [tileX, tileY] of [
      [blocker.tileX, blocker.tileY - 1], [blocker.tileX + 1, blocker.tileY],
      [blocker.tileX, blocker.tileY + 1], [blocker.tileX - 1, blocker.tileY],
    ]) {
      if (tileX >= 0 && tileY >= 0 && tileY < collisionValues.length &&
        tileX < collisionValues[tileY].length && collisionValues[tileY][tileX] >= 0 &&
        (!occupied.has(`${tileX},${tileY}`) || tileX === state.tileX && tileY === state.tileY)) {
        approachGoals.push({ tileX, tileY });
      }
    }
    if (approachGoals.length === 0) continue;
    const approach = await walkCampaignMapTo(
      mapId, collisionValues, approachGoals,
      `${label} source-order-${blocker.sourceOrder} blocker`, blockedCells, false,
    );
    if (approach.state?.mapId !== mapId) continue;
    for (let attack = 0; attack < 6; attack += 1) {
      const before = await readRuntime();
      const target = before?.runtime?.enemies.find((enemy) => enemy.sourceOrder === blocker.sourceOrder);
      if (before?.mapId !== mapId || target === undefined || target.state !== 'alive') return true;
      if (Math.abs(target.tileX - before.tileX) + Math.abs(target.tileY - before.tileY) !== 1) break;
      const direction = mapDirectionBetween([before.tileX, before.tileY], [target.tileX, target.tileY]);
      await tap(direction[0], direction[1], direction[2]);
      const faced = await readRuntime();
      if (faced?.mapId !== mapId || faced.tileX !== before.tileX || faced.tileY !== before.tileY ||
        faced.runtime?.player?.direction !== ({
          ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4,
        }[direction[0]])) break;
      const hpBefore = faced.runtime?.enemies.find((enemy) => enemy.sourceOrder === blocker.sourceOrder)?.hp;
      await tap('5', 'Numpad5', 101, '5');
      await delay(350);
      const after = await readRuntime();
      const damaged = after?.runtime?.enemies.find((enemy) =>
        enemy.sourceOrder === blocker.sourceOrder && enemy.state === 'alive');
      if (damaged === undefined || damaged.hp < (hpBefore ?? Number.POSITIVE_INFINITY)) {
        observations.push({
          at: new Date().toISOString(),
          label: `${label}-cleared-route-blocker-${blocker.sourceOrder}`,
          state: after,
        });
        await saveScreenshot(`${label}-route-blocker-${blocker.sourceOrder}-after-attack.png`);
        return true;
      }
    }
  }
  return false;
}

async function finishMapCampaignScript(mapId, scriptIndex, label) {
  let state = await waitFor((candidate) => candidate?.mapId === mapId &&
    candidate.eventCutscene?.scriptIndex === scriptIndex, {
    timeoutMs: 8000,
    label: `${label} script ${scriptIndex} start`,
  });
  if (state.eventCutscene?.status === 'choice') {
    throw new Error(`${label} script ${scriptIndex} unexpectedly opened a choice`);
  }
  if (state.eventCutscene?.status === 'dialogue' || state.runtime?.dialogueOpen === true) {
    await saveScreenshot(`${label}-dialogue.png`);
    await tap('w', 'KeyW', 87, 'w');
  }
  state = await waitFor((candidate) => candidate?.mapId === mapId &&
    candidate.eventCutscene?.scriptIndex === scriptIndex &&
    candidate.eventCutscene.status === 'ended' && candidate.runtime?.dialogueOpen === false, {
    timeoutMs: 15000,
    label: `${label} script ${scriptIndex} end`,
  });
  return state;
}

async function interactWithCampaignMarker({
  mapId, collisionValues, eventData, marker, triggerType = 2,
  expectedScriptIndex, label, screenshotName,
}) {
  const state = await readRuntime();
  const selection = selectMapProbeTriggerScript(eventData, marker, triggerType, state.runtime);
  if (selection?.scriptIndex !== expectedScriptIndex) {
    throw new Error(`${label} selected script ${selection?.scriptIndex ?? 'none'}, expected ${expectedScriptIndex}`);
  }
  const goals = passableNeighborsOfMarker(collisionValues, marker);
  if (goals.length === 0) throw new Error(`${label} marker ${marker} has no passable approach tile`);
  const approachRun = await walkCampaignMapTo(mapId, collisionValues, goals, `${label} approach`);
  if (approachRun.state?.mapId !== mapId) {
    throw new Error(`${label} approach unexpectedly transferred to map ${approachRun.state?.mapId}`);
  }
  const approach = approachRun.state;
  const targetMarkerCell = mapMarkerCells(collisionValues, marker)
    .filter(([tileX, tileY]) => Math.abs(tileX - approach.tileX) + Math.abs(tileY - approach.tileY) === 1)
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])[0];
  if (targetMarkerCell === undefined) throw new Error(`${label} lost its adjacent marker cell`);
  const input = mapDirectionBetween([approach.tileX, approach.tileY], targetMarkerCell);
  await tap(input[0], input[1], input[2]);
  const faced = await readRuntime();
  if (faced?.mapId !== mapId || faced.tileX !== approach.tileX || faced.tileY !== approach.tileY) {
    throw new Error(`${label} facing input moved the player away from its approach tile`);
  }
  await saveScreenshot(screenshotName);
  if (faced.eventCutscene?.scriptIndex !== expectedScriptIndex ||
    faced.eventCutscene.status === 'ended') await tap('Enter', 'Enter', 13);
  const completed = await finishMapCampaignScript(mapId, expectedScriptIndex, label);
  const after = await readRuntime();
  return {
    selection,
    approach: { tile: [approach.tileX, approach.tileY], direction: faced.runtime?.player?.direction },
    routeTrace: approachRun.routeTrace,
    after,
    collisionValues: applyEventScriptCollisionWrites(
      collisionValues,
      eventData.scripts[expectedScriptIndex] ?? [],
    ),
    completed,
  };
}

async function runMap54CurrentCellExit(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/54.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/54.json'), 'utf8',
  ));
  const markerEightCell = [5, 13];
  const exitCell = [5, 14];
  const markerEight = collision.values?.[markerEightCell[1]]?.[markerEightCell[0]];
  const exitMarker = collision.values?.[exitCell[1]]?.[exitCell[0]];
  const markerEightSelection = selectMapProbeTriggerScript(eventData, markerEight, 0, initialState.runtime);
  const initialFlags = new Set(initialState.runtime?.gameFlags ?? []);
  const afterMarkerEight = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.tileX === markerEightCell[0] && candidate.tileY === markerEightCell[1] &&
    candidate.runtime?.gameFlags?.includes(42) && candidate.runtime.gameFlags.includes(46) &&
    candidate.eventCutscene?.scriptIndex === 13 && candidate.eventCutscene.status === 'ended', {
    timeoutMs: 5000,
    label: 'Map54 marker 8 script 13 ended with flag 46',
  });
  const exitSelection = selectMapProbeTriggerScript(eventData, exitMarker, 3, afterMarkerEight.runtime);
  const scriptThirteen = eventData.scripts?.[13] ?? [];
  const scriptNineteen = eventData.scripts?.[19] ?? [];
  if (initialState.mapId !== 54 || initialState.tileX !== markerEightCell[0] ||
    initialState.tileY !== markerEightCell[1] || initialState.level !== 99 ||
    !initialFlags.has(42) || markerEight !== 8 || exitMarker !== -6 ||
    markerEightSelection?.scriptIndex !== 13 ||
    JSON.stringify(scriptThirteen) !== '[[9,46,0],[99,0,0]]' ||
    exitSelection?.scriptIndex !== 19 ||
    JSON.stringify(scriptNineteen) !== '[[7,59,0],[8,10,26],[99,0,0]]') {
    throw new Error(`Map54 current-cell/exit source precondition changed: ${JSON.stringify({
      start: { mapId: initialState.mapId, tile: [initialState.tileX, initialState.tileY],
        level: initialState.level, gameFlags: [...initialFlags] },
      markerEight, exitMarker, markerEightSelection, markerEightScript: scriptThirteen,
      afterMarkerEight: { gameFlags: afterMarkerEight.runtime?.gameFlags,
        eventCutscene: afterMarkerEight.eventCutscene },
      exitSelection, exitScript: scriptNineteen,
    })}`);
  }

  await saveScreenshot('02-map54-marker8-script13-ended.png');
  const arrival = await holdUntil('ArrowDown', 'ArrowDown', 40,
    (candidate) => candidate?.mapId === 59 && candidate.tileX === 10 && candidate.tileY === 26, {
      timeoutMs: 12000,
      label: 'Map54 marker -6 transfer to Map59 (10,26)',
    });
  await observe('map59-arrival-after-map54-marker6');
  await saveScreenshot('03-map59-after-marker6-exit.png');
  const passed = arrival?.mapId === 59 && arrival.tileX === 10 && arrival.tileY === 26 &&
    arrival.profile === 'max-level' && arrival.level === 99 && arrival.hp === initialState.hp &&
    arrival.runtime?.gameFlags?.includes(42) && arrival.runtime.gameFlags.includes(46) &&
    arrival.eventCutscene?.status === 'transfer' && arrival.runtime?.transitionPending === false;
  return {
    passed,
    route: 'DEV max-level Map54/(5,13) -> marker 8 type-0 script 13 sets flag 46 -> held Down into marker -6 type-3 script 19 -> Map59/(10,26)',
    source: {
      markerEight,
      markerEightCell,
      markerEightTypeZeroScript: markerEightSelection?.scriptIndex,
      markerEightScript: scriptThirteen,
      exitMarker,
      exitCell,
      exitTypeThreeScript: exitSelection?.scriptIndex,
      exitScript: scriptNineteen,
    },
    start: {
      mapId: initialState.mapId,
      tile: [initialState.tileX, initialState.tileY],
      level: initialState.level,
      hp: initialState.hp,
      gameFlags: [...initialFlags],
      eventCutscene: initialState.eventCutscene,
    },
    afterMarkerEight: {
      mapId: afterMarkerEight.mapId,
      tile: [afterMarkerEight.tileX, afterMarkerEight.tileY],
      gameFlags: afterMarkerEight.runtime?.gameFlags,
      eventCutscene: afterMarkerEight.eventCutscene,
    },
    after: arrival === null ? null : {
      mapId: arrival.mapId,
      tile: [arrival.tileX, arrival.tileY],
      level: arrival.level,
      hp: arrival.hp,
      gameFlags: arrival.runtime?.gameFlags,
      eventCutscene: arrival.eventCutscene,
    },
  };
}

async function walkMap59ToChoiceApproach(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/59.json'), 'utf8',
  ));
  const values = collision.values;
  const approachTile = [26, 4];
  const blockedCells = new Set(['16,13']);
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const routeTrace = [];
  let state = initialState;
  let blockedStepCount = 0;
  let noPathWaits = 0;
  for (let inputCount = 0; inputCount < 160; inputCount += 1) {
    if (state?.mapId !== 59 || state.runtime === null) {
      throw new Error(`Map59 live path left the active map: ${JSON.stringify(state)}`);
    }
    if (state.tileX === approachTile[0] && state.tileY === approachTile[1]) {
      await observe('map59-live-choice-approach');
      await saveScreenshot('04-map59-type3-marker-approach-live.png');
      return { state, routeTrace, blockedStepCount };
    }
    const occupied = new Set((state.runtime?.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    const path = findMapPath(
      values,
      [state.tileX, state.tileY],
      [approachTile],
      occupied,
      blockedCells,
    );
    if (path === null || path.length === 0) {
      await delay(300);
      const refreshed = await readRuntime();
      if (refreshed?.mapId !== 59) throw new Error('Map59 left the active map while waiting for a path');
      if (refreshed.tileX === state.tileX && refreshed.tileY === state.tileY) noPathWaits += 1;
      else noPathWaits = 0;
      if (noPathWaits > 10) {
        throw new Error(`No live-occupancy path to Map59 marker approach from ${state.tileX},${state.tileY}`);
      }
      state = refreshed;
      continue;
    }
    noPathWaits = 0;
    const step = path[0];
    const input = inputs.get(step.vector);
    if (input === undefined) throw new Error(`Unsupported Map59 live-route vector ${step.vector}`);
    const moved = await holdUntil(input[0], input[1], input[2], (candidate) =>
      candidate?.mapId === 59 && candidate.tileX === step.x && candidate.tileY === step.y, {
      timeoutMs: 1800,
      label: `Map59 live-occupancy approach ${step.x},${step.y}`,
    });
    if (moved?.mapId === 59 && moved.tileX === step.x && moved.tileY === step.y) {
      state = moved;
      blockedStepCount = 0;
      routeTrace.push({ tile: [state.tileX, state.tileY], hp: state.hp });
    } else {
      const actual = moved ?? await readRuntime();
      routeTrace.push({
        blocked: true,
        expected: [step.x, step.y],
        observed: actual === null ? null : [actual.tileX, actual.tileY],
      });
      if (actual?.mapId !== 59) throw new Error(`Map59 live route diverged to another map: ${JSON.stringify(actual)}`);
      if (actual.tileX === state.tileX && actual.tileY === state.tileY) blockedStepCount += 1;
      else blockedStepCount = 0;
      if (blockedStepCount > 8) {
        throw new Error(`Map59 live route remained blocked at ${actual.tileX},${actual.tileY}`);
      }
      state = actual;
    }
  }
  throw new Error(`Map59 live route exceeded 160 directional inputs: ${JSON.stringify({
    tile: [state?.tileX, state?.tileY], routeTrace,
  })}`);
}

async function runMap54ToMap13Chain(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/54.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/54.json'), 'utf8',
  ));
  const markerEightCell = [5, 13];
  const exitCell = [5, 14];
  const markerEight = collision.values?.[markerEightCell[1]]?.[markerEightCell[0]];
  const exitMarker = collision.values?.[exitCell[1]]?.[exitCell[0]];
  const inventory = initialState.runtime?.inventory ?? [];
  const key = inventory.find((stack) => stack.category === 19 && stack.itemId === 9);
  const map12Item = inventory.find((stack) => stack.category === 21 && stack.itemId === 3);
  const markerEightSelection = selectMapProbeTriggerScript(eventData, markerEight, 0, initialState.runtime);
  const scriptThirteen = eventData.scripts?.[13] ?? [];
  const scriptNineteen = eventData.scripts?.[19] ?? [];
  if (initialState.mapId !== 54 || initialState.tileX !== markerEightCell[0] ||
    initialState.tileY !== markerEightCell[1] || initialState.level !== 99 ||
    !initialState.runtime?.gameFlags?.includes(42) || markerEight !== 8 || exitMarker !== -6 ||
    key?.count !== 1 || map12Item?.count !== 1 || inventory.length !== 2 ||
    markerEightSelection?.scriptIndex !== 13 ||
    JSON.stringify(scriptThirteen) !== '[[9,46,0],[99,0,0]]' ||
    JSON.stringify(scriptNineteen) !== '[[7,59,0],[8,10,26],[99,0,0]]') {
    throw new Error(`Map54-to-Map13 source precondition changed: ${JSON.stringify({
      start: { mapId: initialState.mapId, tile: [initialState.tileX, initialState.tileY],
        level: initialState.level, gameFlags: initialState.runtime?.gameFlags, inventory },
      markerEight, exitMarker, markerEightSelection, markerEightScript: scriptThirteen,
      exitScript: scriptNineteen,
    })}`);
  }

  const afterMarkerEight = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.tileX === markerEightCell[0] && candidate.tileY === markerEightCell[1] &&
    candidate.runtime?.gameFlags?.includes(42) && candidate.runtime.gameFlags.includes(46) &&
    candidate.eventCutscene?.scriptIndex === 13 && candidate.eventCutscene.status === 'ended', {
    timeoutMs: 5000,
    label: 'Map54 marker 8 script 13 ended with flag 46',
  });
  const exitSelection = selectMapProbeTriggerScript(eventData, exitMarker, 3, afterMarkerEight.runtime);
  if (exitSelection?.scriptIndex !== 19) {
    throw new Error(`Map54 exit selected script ${exitSelection?.scriptIndex}, expected script 19`);
  }
  await saveScreenshot('02-map54-marker8-script13-ended.png');
  const map59Arrival = await holdUntil('ArrowDown', 'ArrowDown', 40,
    (candidate) => candidate?.mapId === 59 && candidate.tileX === 10 && candidate.tileY === 26, {
      timeoutMs: 12000,
      label: 'Map54 marker -6 transfer to Map59 (10,26)',
    });
  const afterMap59 = await observe('map59-arrival-after-map54-marker6');
  await saveScreenshot('03-map59-after-marker6-exit.png');
  if (map59Arrival?.mapId !== 59 || map59Arrival.tileX !== 10 || map59Arrival.tileY !== 26 ||
    !map59Arrival.runtime?.gameFlags?.includes(42) || !map59Arrival.runtime.gameFlags.includes(46) ||
    !map59Arrival.runtime.inventory?.some((stack) =>
      stack.category === 19 && stack.itemId === 9 && stack.count === 1) ||
    !map59Arrival.runtime.inventory?.some((stack) =>
      stack.category === 21 && stack.itemId === 3 && stack.count === 1)) {
    throw new Error(`Map54 transfer did not preserve Map59 prerequisites: ${JSON.stringify(map59Arrival)}`);
  }
  const liveApproach = await walkMap59ToChoiceApproach(afterMap59);
  const map59Chain = await runMap59YesChoiceBranch(liveApproach.state, { followMap12Prerequisite: true });
  const finalState = await readRuntime();
  const expectedGameFlags = [0, 42, 46, 48];
  const passed = map59Chain.passed && finalState?.mapId === 13 &&
    finalState.tileX === 10 && finalState.tileY === 10 && finalState.level === 99 &&
    finalState.hp === initialState.hp &&
    JSON.stringify(finalState.runtime?.gameFlags) === JSON.stringify(expectedGameFlags) &&
    finalState.runtime?.questFlags?.length === 0 && finalState.runtime?.inventory?.length === 0;
  return {
    passed,
    route: 'visible New Game UI -> DEV max-level Map54 checkpoint with flags 0/42 and required items -> marker 8/script 13 -> marker -6/script 19 -> Map59 Yes -> Map12 script 0 -> Map13/(10,10)',
    source: {
      markerEight,
      markerEightCell,
      markerEightTypeZeroScript: markerEightSelection.scriptIndex,
      markerEightScript: scriptThirteen,
      exitMarker,
      exitCell,
      exitTypeThreeScript: exitSelection.scriptIndex,
      exitScript: scriptNineteen,
    },
    start: {
      mapId: initialState.mapId,
      tile: [initialState.tileX, initialState.tileY],
      level: initialState.level,
      hp: initialState.hp,
      gameFlags: initialState.runtime?.gameFlags,
      inventory,
    },
    afterMarkerEight: {
      mapId: afterMarkerEight.mapId,
      tile: [afterMarkerEight.tileX, afterMarkerEight.tileY],
      gameFlags: afterMarkerEight.runtime?.gameFlags,
      eventCutscene: afterMarkerEight.eventCutscene,
    },
    map59Arrival: {
      mapId: map59Arrival.mapId,
      tile: [map59Arrival.tileX, map59Arrival.tileY],
      gameFlags: map59Arrival.runtime?.gameFlags,
      inventory: map59Arrival.runtime?.inventory,
    },
    liveMap59Approach: {
      tile: [liveApproach.state.tileX, liveApproach.state.tileY],
      routeTrace: liveApproach.routeTrace,
      blockedStepCount: liveApproach.blockedStepCount,
    },
    map59Chain,
    after: {
      mapId: finalState?.mapId,
      tile: finalState === null ? null : [finalState.tileX, finalState.tileY],
      level: finalState?.level,
      hp: finalState?.hp,
      gameFlags: finalState?.runtime?.gameFlags,
      questFlags: finalState?.runtime?.questFlags,
      inventory: finalState?.runtime?.inventory,
    },
  };
}

async function runMap53BluebrickToMap13(initialState) {
  const map53Collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/53.json'), 'utf8',
  ));
  const map53Events = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/53.json'), 'utf8',
  ));
  if (initialState.mapId !== 53 || initialState.tileX !== 19 || initialState.tileY !== 38 ||
    JSON.stringify(initialState.runtime?.gameFlags) !== JSON.stringify([0, 27, 31, 82]) ||
    JSON.stringify(initialState.runtime?.questFlags) !== JSON.stringify([1, 2, 4]) ||
    (initialState.runtime?.inventory?.length ?? -1) !== 0 || initialState.level !== 99 || initialState.hp <= 0) {
    throw new Error(`Map53 checkpoint seed changed: ${JSON.stringify(initialState)}`);
  }
  let collisionValues = map53Collision.values.map((row) => [...row]);
  const map53Trace = [];

  const entryMarkerCells = mapMarkerCells(collisionValues, 2);
  const entryRun = await walkCampaignMapTo(53, collisionValues,
    entryMarkerCells.map(([tileX, tileY]) => ({ tileX, tileY })), 'Map53 marker 2');
  if (entryRun.state?.mapId !== 53) throw new Error('Map53 marker 2 caused an unexpected transfer');
  map53Trace.push({ marker: 2, routeStepCount: entryRun.routeTrace.length });
  await finishMapCampaignScript(53, 1, 'map53-entry-marker2');
  await saveScreenshot('02-map53-entry-flag32.png');
  const afterEntry = await readRuntime();
  if (!afterEntry.runtime?.gameFlags?.includes(32)) throw new Error('Map53 entry event did not set flag 32');

  let liveCollision = collisionValues;
  const takeMaterialOne = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -3, expectedScriptIndex: 3, label: 'map53-material-one',
    screenshotName: '03-map53-material-one-approach.png',
  });
  liveCollision = takeMaterialOne.collisionValues;
  map53Trace.push({ marker: -3, scriptIndex: 3, routeStepCount: takeMaterialOne.routeTrace.length });
  await saveScreenshot('04-map53-material-one-received.png');

  const takeKey = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -6, expectedScriptIndex: 6, label: 'map53-key-item',
    screenshotName: '05-map53-key-approach.png',
  });
  liveCollision = takeKey.collisionValues;
  map53Trace.push({ marker: -6, scriptIndex: 6, routeStepCount: takeKey.routeTrace.length });
  await saveScreenshot('06-map53-key-received.png');

  const forgeOne = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -7, expectedScriptIndex: 7, label: 'map53-forge-one',
    screenshotName: '07-map53-forge-one-approach.png',
  });
  liveCollision = forgeOne.collisionValues;
  map53Trace.push({ marker: -7, scriptIndex: 7, routeStepCount: forgeOne.routeTrace.length });
  await saveScreenshot('08-map53-forge-one-complete.png');

  const takeMaterialTwo = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -4, expectedScriptIndex: 4, label: 'map53-material-two',
    screenshotName: '09-map53-material-two-approach.png',
  });
  liveCollision = takeMaterialTwo.collisionValues;
  map53Trace.push({ marker: -4, scriptIndex: 4, routeStepCount: takeMaterialTwo.routeTrace.length });
  await saveScreenshot('10-map53-material-two-received.png');

  const forgeTwo = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -7, expectedScriptIndex: 8, label: 'map53-forge-two',
    screenshotName: '11-map53-forge-two-approach.png',
  });
  liveCollision = forgeTwo.collisionValues;
  map53Trace.push({ marker: -7, scriptIndex: 8, routeStepCount: forgeTwo.routeTrace.length });
  await saveScreenshot('12-map53-forge-two-complete.png');

  const takeMaterialThree = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -5, expectedScriptIndex: 5, label: 'map53-material-three',
    screenshotName: '13-map53-material-three-approach.png',
  });
  liveCollision = takeMaterialThree.collisionValues;
  map53Trace.push({ marker: -5, scriptIndex: 5, routeStepCount: takeMaterialThree.routeTrace.length });
  await saveScreenshot('14-map53-material-three-received.png');

  const forgeThree = await interactWithCampaignMarker({
    mapId: 53, collisionValues: liveCollision, eventData: map53Events,
    marker: -7, expectedScriptIndex: 9, label: 'map53-forge-three',
    screenshotName: '15-map53-forge-three-approach.png',
  });
  liveCollision = forgeThree.collisionValues;
  map53Trace.push({ marker: -7, scriptIndex: 9, routeStepCount: forgeThree.routeTrace.length });
  await saveScreenshot('16-map53-forge-three-complete.png');

  const finalForgeState = await readRuntime();
  const transferSelection = selectMapProbeTriggerScript(map53Events, -7, 2, finalForgeState.runtime);
  if (transferSelection?.scriptIndex !== 10) {
    throw new Error(`Map53 final forge state selected script ${transferSelection?.scriptIndex}, expected 10`);
  }
  const finalForgeApproach = await walkCampaignMapTo(53, liveCollision,
    passableNeighborsOfMarker(liveCollision, -7), 'Map53 final Map54 transfer');
  const adjacent = mapMarkerCells(liveCollision, -7)
    .find(([tileX, tileY]) => Math.abs(tileX - finalForgeApproach.state.tileX) +
      Math.abs(tileY - finalForgeApproach.state.tileY) === 1);
  if (adjacent === undefined) throw new Error('Map53 final forge approach is no longer adjacent');
  const faceTransfer = mapDirectionBetween(
    [finalForgeApproach.state.tileX, finalForgeApproach.state.tileY], adjacent,
  );
  await tap(faceTransfer[0], faceTransfer[1], faceTransfer[2]);
  await tap('Enter', 'Enter', 13);
  const map54Arrival = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.tileX === 17 && candidate.tileY === 14 && candidate.runtime !== null, {
    timeoutMs: 12000,
    label: 'Map53 script 10 transfer to Map54 (17,14)',
  });
  map53Trace.push({ marker: -7, scriptIndex: 10, routeStepCount: finalForgeApproach.routeTrace.length });
  await saveScreenshot('17-map54-arrival.png');

  const map54Collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/54.json'), 'utf8',
  ));
  const map54Events = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/54.json'), 'utf8',
  ));
  let map54Values = map54Collision.values.map((row) => [...row]);
  const map54Start = map54Arrival.runtime;
  const map54RewardSelection = selectMapProbeTriggerScript(map54Events, 2, 2, map54Start);
  if (map54RewardSelection?.scriptIndex !== 1) {
    throw new Error(`Map54 NPC selected script ${map54RewardSelection?.scriptIndex}, expected reward script 1`);
  }
  const npcReward = await interactWithCampaignMarker({
    mapId: 54, collisionValues: map54Values, eventData: map54Events,
    marker: 2, expectedScriptIndex: 1, label: 'map54-category21-item3-reward',
    screenshotName: '18-map54-item-reward-npc-approach.png',
  });
  map54Values = npcReward.collisionValues;
  const afterNpcReward = await readRuntime();
  const prerequisiteStack = afterNpcReward.runtime?.inventory?.find((stack) =>
    stack.category === 21 && stack.itemId === 3);
  if (prerequisiteStack?.count !== 1 || !afterNpcReward.runtime?.gameFlags?.includes(40)) {
    throw new Error(`Map54 failed to grant its Map12 prerequisite: ${JSON.stringify(afterNpcReward.runtime)}`);
  }
  await saveScreenshot('19-map54-item-prerequisite-received.png');

  const map54Switch = await interactWithCampaignMarker({
    mapId: 54, collisionValues: map54Values, eventData: map54Events,
    marker: -4, expectedScriptIndex: 5, label: 'map54-item-switch',
    screenshotName: '20-map54-switch-approach.png',
  });
  map54Values = map54Switch.collisionValues;
  const markerSevenPassThrough = selectMapProbeTriggerScript(
    map54Events, 7, 0, map54Switch.after.runtime,
  );
  if (markerSevenPassThrough !== null) {
    throw new Error(`Map54 marker 7 unexpectedly selects script ${markerSevenPassThrough.scriptIndex} before flag 46`);
  }
  const toMarkerEight = await walkCampaignMapTo(54, map54Values,
    [{ tileX: 5, tileY: 13 }], 'Map54 marker 8 flag-46 switch');
  if (toMarkerEight.state?.mapId !== 54) throw new Error('Map54 marker-8 route unexpectedly transferred');
  const afterMarkerEight = await waitFor((candidate) => candidate?.mapId === 54 &&
    candidate.runtime?.gameFlags?.includes(46), {
    timeoutMs: 5000,
    label: 'Map54 marker 8 script 13 flag 46',
  });
  await saveScreenshot('21-map54-marker8-flag46.png');
  const transferSelectionMap54 = selectMapProbeTriggerScript(map54Events, -6, 3, afterMarkerEight.runtime);
  if (transferSelectionMap54?.scriptIndex !== 19) {
    throw new Error(`Map54 exit selected script ${transferSelectionMap54?.scriptIndex}, expected 19`);
  }
  const map54TransferApproach = await walkCampaignMapTo(54, map54Values,
    passableNeighborsOfMarker(map54Values, -6), 'Map54 Map59 transfer');
  const map54ExitCell = mapMarkerCells(map54Values, -6)
    .find(([tileX, tileY]) => Math.abs(tileX - map54TransferApproach.state.tileX) +
      Math.abs(tileY - map54TransferApproach.state.tileY) === 1);
  if (map54ExitCell === undefined) throw new Error('Map54 transfer approach is no longer adjacent to marker -6');
  const enterMap54Exit = mapDirectionBetween(
    [map54TransferApproach.state.tileX, map54TransferApproach.state.tileY], map54ExitCell,
  );
  const map59Arrival = await holdUntil(enterMap54Exit[0], enterMap54Exit[1], enterMap54Exit[2],
    (candidate) => candidate?.mapId === 59, {
      timeoutMs: 12000,
      label: 'Map54 marker -6 transfer to Map59',
    });
  if (map59Arrival?.mapId !== 59 || map59Arrival.runtime === null) {
    throw new Error(`Map54 marker -6 did not transfer to Map59: ${JSON.stringify(map59Arrival)}`);
  }
  await observe('map59-live-arrival-from-map54');
  await saveScreenshot('22-map59-arrival-from-map54.png');
  const map59Chain = await runMap59YesChoiceBranch(map59Arrival, { followMap12Prerequisite: true });
  const finalState = await readRuntime();
  const passed = map59Chain.passed && finalState?.mapId === 13 && finalState.tileX === 10 &&
    finalState.tileY === 10 && finalState.level === 99 && finalState.hp === initialState.hp &&
    finalState.runtime?.gameFlags?.includes(32) && finalState.runtime.gameFlags.includes(34) &&
    finalState.runtime.gameFlags.includes(36) && finalState.runtime.gameFlags.includes(38) &&
    finalState.runtime.gameFlags.includes(40) && finalState.runtime.gameFlags.includes(42) &&
    finalState.runtime.gameFlags.includes(46) && finalState.runtime.gameFlags.includes(48) &&
    finalState.runtime.inventory.length === 0;
  return {
    passed,
    route: 'DEV max-level Map53 checkpoint (flags 0/27/31/82, empty inventory) -> live item pickups/three forge scripts -> Map54 NPC prerequisite reward -> Map54 switch/flag-46 exit -> Map59 Yes -> Map12 -> Map13',
    start: {
      mapId: initialState.mapId,
      tile: [initialState.tileX, initialState.tileY],
      level: initialState.level,
      hp: initialState.hp,
      gameFlags: initialState.runtime?.gameFlags,
      questFlags: initialState.runtime?.questFlags,
      inventory: initialState.runtime?.inventory,
    },
    map53: {
      trace: map53Trace,
      afterFinalForge: {
        gameFlags: finalForgeState.runtime?.gameFlags,
        inventory: finalForgeState.runtime?.inventory,
      },
      arrivalMap54: { mapId: map54Arrival.mapId, tile: [map54Arrival.tileX, map54Arrival.tileY] },
    },
    map54: {
      npcReward: {
        selection: map54RewardSelection,
        approach: npcReward.approach,
        gameFlags: afterNpcReward.runtime?.gameFlags,
        questFlags: afterNpcReward.runtime?.questFlags,
        inventory: afterNpcReward.runtime?.inventory,
      },
      switchSelection: map54Switch.selection,
      markerSevenPassThrough,
      flag46: afterMarkerEight.runtime?.gameFlags,
      transferSelection: transferSelectionMap54,
      map59Arrival: {
        tile: [map59Arrival.tileX, map59Arrival.tileY],
        gameFlags: map59Arrival.runtime?.gameFlags,
        questFlags: map59Arrival.runtime?.questFlags,
        inventory: map59Arrival.runtime?.inventory,
      },
    },
    map59Chain,
    final: {
      mapId: finalState?.mapId,
      tile: [finalState?.tileX, finalState?.tileY],
      hp: finalState?.hp,
      level: finalState?.level,
      gameFlags: finalState?.runtime?.gameFlags,
      questFlags: finalState?.runtime?.questFlags,
      inventory: finalState?.runtime?.inventory,
    },
  };
}

async function followMap27PreviewExitToMap17(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/27.json'), 'utf8',
  ));
  const eventData = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/event-operations/6/27.json'), 'utf8',
  ));
  const hasMap17Transfer = eventData.scripts.some((script) => script.some((command, index) =>
    command[0] === 7 && command[1] === 17 && script[index + 1]?.[0] === 8));
  if (!hasMap17Transfer) throw new Error('Map27 extracted event data has no command-7/8 transfer to Map17');

  const markerCells = [];
  for (let y = 0; y < collision.values.length; y += 1) {
    for (let x = 0; x < collision.values[y].length; x += 1) {
      if (collision.values[y][x] === -4) markerCells.push([x, y]);
    }
  }
  if (JSON.stringify(markerCells) !== JSON.stringify([[27, 3], [28, 3]])) {
    throw new Error(`Unexpected Map27 exit-marker cells: ${JSON.stringify(markerCells)}`);
  }
  const goals = markerCells.flatMap(([x, y]) => [
    [x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y],
  ]).filter(([x, y]) => y >= 0 && y < collision.values.length && x >= 0 &&
    x < collision.values[y].length && collision.values[y][x] >= 0);
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const trail = [];
  let state = initialState;
  let approach = null;
  let stepCount = 0;
  let noPathSamples = 0;
  const temporarilyBlocked = new Set();
  const failedStepCounts = new Map();
  const maxSteps = collision.width * collision.height;
  while (stepCount < maxSteps && stepCount + trail.length < maxSteps + 40) {
    if (state?.mapId === 17) {
      approach = [state.tileX, state.tileY];
      break;
    }
    if (state?.mapId !== 27 || state.tileX === null || state.tileY === null) {
      throw new Error(`Unexpected state during Map27 exit route: ${JSON.stringify(state)}`);
    }
    const occupied = new Set((state.runtime?.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    const path = findMapPath(collision.values, [state.tileX, state.tileY], goals, occupied, temporarilyBlocked);
    if (path === null) {
      noPathSamples += 1;
      if (noPathSamples > 10) {
        throw new Error(`No open DEV path from ${state.tileX},${state.tileY} to the Map17 exit after refreshing enemy occupancy`);
      }
      await delay(250);
      state = await readRuntime();
      continue;
    }
    noPathSamples = 0;
    if (path.length === 0) {
      approach = [state.tileX, state.tileY];
      break;
    }
    const next = path[0];
    const input = inputs.get(next.vector);
    if (input === undefined) throw new Error(`Invalid Map27 path vector ${next.vector}`);
    const from = [state.tileX, state.tileY];
    const moved = await holdUntil(
      input[0], input[1], input[2],
      (candidate) => candidate?.mapId === 17 ||
        (candidate?.mapId === 27 && candidate.tileX === next.x && candidate.tileY === next.y),
      { timeoutMs: 2500, label: `map27-to-exit-step-${stepCount + 1}`, recordObservation: false },
    );
    if (moved?.mapId === 17) {
      state = moved;
      trail.push({ from, to: [moved.tileX, moved.tileY], transfer: true });
      approach = from;
      break;
    }
    if (moved?.mapId !== 27 || moved.tileX !== next.x || moved.tileY !== next.y) {
      if (moved?.mapId !== 27 || moved.tileX === null || moved.tileY === null) {
        throw new Error(`Map27 exit route left the expected scene at ${from.join(',')} heading ${next.vector}: ${JSON.stringify(moved)}`);
      }
      const blockedKey = `${next.x},${next.y}`;
      const failures = (failedStepCounts.get(blockedKey) ?? 0) + 1;
      failedStepCounts.set(blockedKey, failures);
      temporarilyBlocked.add(blockedKey);
      trail.push({ from, to: [next.x, next.y], blocked: true, actual: [moved.tileX, moved.tileY] });
      if (failures > 3) {
        throw new Error(`Map27 route could not enter ${blockedKey} after three attempts; current tile ${moved.tileX},${moved.tileY}`);
      }
      state = moved;
      continue;
    }
    state = moved;
    trail.push({ from, to: [next.x, next.y], vector: next.vector });
    stepCount += 1;
    if (stepCount % 10 === 0) await saveScreenshot(`map27-exit-step-${stepCount}.png`);
  }
  if (approach === null) throw new Error(`Map27 exit route exceeded ${maxSteps} steps`);

  if (state.mapId === 27) {
    const transfer = await holdUntil(
      'ArrowUp', 'ArrowUp', 38,
      (candidate) => candidate?.mapId === 17,
      { timeoutMs: 8000, label: 'map27-north-exit-to-map17', recordObservation: false },
    );
    state = transfer;
  }
  const arrived = state?.mapId === 17;
  observations.push({ at: new Date().toISOString(), label: 'map-preview-exit-arrival', state });
  await saveScreenshot(arrived ? '02-map17-after-map27-exit.png' : '02-map27-exit-not-triggered.png');
  return {
    fromMapId: 27,
    targetMapId: 17,
    startTile: [initialState.tileX, initialState.tileY],
    approachTile: approach,
    routeStepCount: trail.length,
    trail,
    markerCells,
    arrived,
    finalMapId: state?.mapId ?? null,
    finalTile: state === null ? null : [state.tileX, state.tileY],
  };
}

async function approachMapPreviewEnemyForAttack(initialState) {
  const collision = JSON.parse(await readFile(
    join(root, `web/public/assets/generated/collision/6/${String(mapPreviewId).padStart(2, '0')}.json`), 'utf8',
  ));
  const inputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const isAdjacent = (state, enemy) => state !== null && enemy !== undefined &&
    Math.abs(state.tileX - enemy.tileX) + Math.abs(state.tileY - enemy.tileY) === 1;
  const trail = [];
  const temporarilyBlocked = new Set();
  const failedSteps = new Map();
  const initialEnemy = initialState.runtime.enemies.find((candidate) =>
    candidate.sourceOrder === enemyObservationTarget.sourceOrder);
  let state = initialState;
  let noPathSamples = 0;
  const maxSteps = collision.width * collision.height * 2;

  for (let stepCount = 0; stepCount < maxSteps; stepCount += 1) {
    if (state?.mapId !== mapPreviewId) {
      throw new Error(`Enemy approach left map ${mapPreviewId}: ${JSON.stringify(state)}`);
    }
    const enemy = state.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === enemyObservationTarget.sourceOrder &&
      candidate.enemyId === enemyObservationTarget.enemyId &&
      candidate.behaviorType === enemyObservationTarget.behaviorType);
    if (enemy === undefined) throw new Error(`Target enemy disappeared during approach: ${JSON.stringify(enemyObservationTarget)}`);
    if (isAdjacent(state, enemy)) {
      observations.push({ at: new Date().toISOString(), label: 'map-preview-enemy-approach-end', state });
      await saveScreenshot('map-preview-enemy-approach.png');
      return {
        state,
        summary: {
          startPlayerTile: [initialState.tileX, initialState.tileY],
          startEnemyTile: initialEnemy === undefined ? null : [initialEnemy.tileX, initialEnemy.tileY],
          finalPlayerTile: [state.tileX, state.tileY],
          finalEnemyTile: [enemy.tileX, enemy.tileY],
          stepCount: trail.length,
          trail,
        },
      };
    }

    const occupied = new Set((state.runtime.entityOccupiedCells ?? [])
      .map((cell) => `${cell.tileX},${cell.tileY}`));
    const goals = [
      [enemy.tileX, enemy.tileY - 1],
      [enemy.tileX + 1, enemy.tileY],
      [enemy.tileX, enemy.tileY + 1],
      [enemy.tileX - 1, enemy.tileY],
    ].filter(([x, y]) => y >= 0 && y < collision.values.length && x >= 0 &&
      x < collision.values[y].length && collision.values[y][x] >= 0 &&
      (!occupied.has(`${x},${y}`) || (x === state.tileX && y === state.tileY)));
    const path = findMapPath(collision.values, [state.tileX, state.tileY], goals, occupied, temporarilyBlocked);
    if (path === null || path.length === 0) {
      noPathSamples += 1;
      if (noPathSamples > 20) {
        throw new Error(`No open path to an adjacent tile for target enemy ${enemyObservationTarget.sourceOrder}`);
      }
      await delay(100);
      state = await readRuntime();
      continue;
    }
    noPathSamples = 0;

    const next = path[0];
    const input = inputs.get(next.vector);
    if (input === undefined) throw new Error(`Invalid enemy-approach vector ${next.vector}`);
    const from = [state.tileX, state.tileY];
    const moved = await holdUntil(
      input[0], input[1], input[2],
      (candidate) => {
        const liveEnemy = candidate?.runtime?.enemies?.find((entry) =>
          entry.sourceOrder === enemyObservationTarget.sourceOrder &&
          entry.enemyId === enemyObservationTarget.enemyId &&
          entry.behaviorType === enemyObservationTarget.behaviorType);
        return candidate?.mapId === mapPreviewId &&
          ((candidate.tileX === next.x && candidate.tileY === next.y) || isAdjacent(candidate, liveEnemy));
      },
      { timeoutMs: 1800, label: `map-preview-enemy-approach-${stepCount + 1}`, recordObservation: false },
    );
    if (moved?.mapId !== mapPreviewId || moved.tileX === null || moved.tileY === null) {
      throw new Error(`Enemy approach left map ${mapPreviewId}: ${JSON.stringify(moved)}`);
    }
    const enteredNext = moved.tileX === next.x && moved.tileY === next.y;
    trail.push({ from, to: [moved.tileX, moved.tileY], targetTile: [enemy.tileX, enemy.tileY], enteredNext });
    if (!enteredNext) {
      const blockedKey = `${next.x},${next.y}`;
      const failures = (failedSteps.get(blockedKey) ?? 0) + 1;
      failedSteps.set(blockedKey, failures);
      temporarilyBlocked.add(blockedKey);
      if (failures > 3) throw new Error(`Enemy approach repeatedly failed to enter ${blockedKey}`);
    }
    state = moved;
  }
  throw new Error(`Enemy approach exceeded ${maxSteps} steps`);
}

async function observeMapPreviewEnemyAttack(initialState, { includeMapReadySample = true } = {}) {
  const sample = (state, elapsedMs) => {
    const combatants = (state?.runtime?.enemies ?? []).map((candidate) => ({
      sourceOrder: candidate.sourceOrder,
      enemyId: candidate.enemyId,
      behaviorType: candidate.behaviorType,
      tile: [candidate.tileX, candidate.tileY],
      state: candidate.state,
      animationStateIndex: candidate.animationStateIndex,
      animationDirection: candidate.animationDirection,
      animationFrameIndex: candidate.animationFrameIndex,
      attackCooldownTicksRemaining: candidate.attackCooldownTicksRemaining,
      actionDelayTicksRemaining: candidate.actionDelayTicksRemaining,
      attackAnimationTicksRemaining: candidate.attackAnimationTicksRemaining,
      attackHitResolved: candidate.attackHitResolved,
      sourceRenderedOnScreen: candidate.sourceRenderedOnScreen,
    }));
    const enemy = state?.runtime?.enemies?.find((candidate) =>
      candidate.sourceOrder === enemyObservationTarget.sourceOrder &&
      candidate.enemyId === enemyObservationTarget.enemyId &&
      candidate.behaviorType === enemyObservationTarget.behaviorType);
    return {
      elapsedMs,
      mapId: state?.mapId ?? null,
      playerTile: state === null ? null : [state.tileX, state.tileY],
      playerHp: state?.hp ?? null,
      combatants,
      enemyProjectiles: state?.enemyProjectiles ?? [],
      enemy: enemy === undefined ? null : {
        sourceOrder: enemy.sourceOrder,
        enemyId: enemy.enemyId,
        behaviorType: enemy.behaviorType,
        tile: [enemy.tileX, enemy.tileY],
        hp: enemy.hp,
        state: enemy.state,
        animationStateIndex: enemy.animationStateIndex,
        animationDirection: enemy.animationDirection,
        animationFrameIndex: enemy.animationFrameIndex,
        attackCooldownTicksRemaining: enemy.attackCooldownTicksRemaining,
        actionDelayTicksRemaining: enemy.actionDelayTicksRemaining,
        attackAnimationTicksRemaining: enemy.attackAnimationTicksRemaining,
        attackHitResolved: enemy.attackHitResolved,
        sourceRenderedOnScreen: enemy.sourceRenderedOnScreen,
      },
    };
  };
  const ready = observations.find((entry) => entry.label === 'map-preview-enemy-first-ready-state')?.state ?? null;
  if (includeMapReadySample && ready === null) throw new Error('Enemy observation did not retain the first map-ready runtime sample');
  const readySample = includeMapReadySample ? sample(ready, 0) : null;
  const settledSample = sample(initialState, includeMapReadySample ? 300 : 0);
  if ((includeMapReadySample && (readySample?.enemy === null || readySample?.mapId !== mapPreviewId)) ||
    settledSample.enemy === null || settledSample.mapId !== mapPreviewId) {
    throw new Error(`Target enemy ${JSON.stringify(enemyObservationTarget)} is absent from map ${mapPreviewId}`);
  }

  const isAttacking = (entry) => entry?.enemy !== null && entry?.enemy !== undefined &&
    entry.enemy.animationStateIndex === 2 && (entry.enemy.attackAnimationTicksRemaining ?? 0) > 0;
  let firstAttackScreenshot = false;
  let firstImpactScreenshot = false;
  const captureFramesFor = async (entry) => {
    if (isAttacking(entry) && !firstAttackScreenshot) {
      await saveScreenshot(`04-behavior${enemyObservationTarget.behaviorType}-attack-animation.png`);
      firstAttackScreenshot = true;
    }
    if (isAttacking(entry) && entry.enemy.attackHitResolved === true && !firstImpactScreenshot) {
      await saveScreenshot(`05-behavior${enemyObservationTarget.behaviorType}-hit-resolved.png`);
      firstImpactScreenshot = true;
    }
  };
  const samples = includeMapReadySample ? [readySample, settledSample] : [settledSample];
  if (readySample !== null) await captureFramesFor(readySample);
  await captureFramesFor(settledSample);

  const startedAt = Date.now();
  const deadline = startedAt + enemyObservationDurationMs;
  while (Date.now() < deadline) {
    const state = await readRuntime();
    const entry = sample(state, Date.now() - startedAt + 300);
    if (entry.enemy === null) throw new Error('Target enemy disappeared during the observation window');
    samples.push(entry);
    await captureFramesFor(entry);
    await delay(50);
  }

  const targetSamples = samples.filter((entry) => entry.enemy !== null);
  const attackSamples = targetSamples.filter(isAttacking);
  const hpValues = targetSamples.map((entry) => entry.playerHp).filter(Number.isInteger);
  const attackTransitions = [];
  let previousAttacking = false;
  for (const entry of targetSamples) {
    const attacking = isAttacking(entry);
    if (attacking && !previousAttacking) {
      attackTransitions.push({ elapsedMs: entry.elapsedMs, event: 'attack-animation-start' });
    } else if (!attacking && previousAttacking) {
      attackTransitions.push({ elapsedMs: entry.elapsedMs, event: 'attack-animation-end' });
    }
    previousAttacking = attacking;
  }
  const result = {
    mapId: mapPreviewId,
    profile: profileName,
    seededMapPreview: true,
    target: enemyObservationTarget,
    requestedDurationMs: enemyObservationDurationMs,
    observedDurationMs: Date.now() - startedAt,
    sampleCount: targetSamples.length,
    attackAnimationSampleCount: attackSamples.length,
    attackAnimationObserved: attackSamples.length > 0,
    hitResolvedDuringAttack: attackSamples.some((entry) => entry.enemy.attackHitResolved === true),
    attackTransitions,
    playerHpStart: hpValues[0] ?? null,
    playerHpMinimum: hpValues.length === 0 ? null : Math.min(...hpValues),
    playerHpEnd: hpValues.at(-1) ?? null,
    playerHpRemainedPositive: hpValues.length > 0 && hpValues.every((hp) => hp > 0),
    firstReadySample: readySample,
    settledSample,
    samples,
  };
  await writeFile(join(outputDir, 'enemy-observation.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function followRecordedMap0RouteToMap27() {
  const routePath = join(
    root,
    'reference/screenshots/web-render/M863-newgame-map64-map0-map27-max-level/map0-to-map27-route-trace.json',
  );
  const recordedRoute = JSON.parse(await readFile(routePath, 'utf8'));
  if (recordedRoute.success !== true || recordedRoute.final?.mapId !== 27 || !Array.isArray(recordedRoute.trail)) {
    throw new Error(`M863 route guide is incomplete: ${routePath}`);
  }

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const expectedStart = await readRuntime();
  if (expectedStart?.mapId !== 0 || expectedStart.tileX !== 26 || expectedStart.tileY !== 24) {
    throw new Error(`Unexpected Map0 route start: ${JSON.stringify(expectedStart)}`);
  }
  await saveScreenshot('02-map0-route-start.png');

  for (const step of recordedRoute.trail) {
    const state = await readRuntime();
    if (step.type === 'move') {
      const [fromX, fromY] = step.from;
      const [toX, toY] = step.to;
      if (state?.mapId !== 0 || state.tileX !== fromX || state.tileY !== fromY) {
        throw new Error(`Map0 route diverged before step ${step.action}: ${JSON.stringify(state)}`);
      }
      const input = directionInputs.get(`${toX - fromX},${toY - fromY}`);
      if (input === undefined) throw new Error(`Invalid route direction at step ${step.action}`);
      const moved = await holdUntil(
        input[0], input[1], input[2],
        (candidate) => candidate?.mapId === 0 && candidate.tileX === toX && candidate.tileY === toY,
        { timeoutMs: 3000, label: `map0-route-step-${step.action}` },
      );
      if (moved?.mapId !== 0 || moved.tileX !== toX || moved.tileY !== toY) {
        throw new Error(`Map0 route did not reach step ${step.action}: ${JSON.stringify(moved)}`);
      }
      if ((step.action + 1) % 10 === 0) {
        await saveScreenshot(`map0-route-checkpoint-${step.action + 1}.png`);
      }
      continue;
    }

    if (step.type === 'enter-marker' && state?.mapId === 0 &&
      state.tileX === step.from[0] && state.tileY === step.from[1]) {
      const arrived = await holdUntil(
        'ArrowUp', 'ArrowUp', 38,
        (candidate) => candidate?.mapId === 27,
        { timeoutMs: 8000, label: 'map0-marker-1-to-map27' },
      );
      if (arrived?.mapId !== 27) {
        throw new Error(`Map0 marker did not reach Map27: ${JSON.stringify(arrived)}`);
      }
      await observe('map27-arrival');
      await saveScreenshot('03-map27-arrival.png');
      return arrived;
    }

    throw new Error(`Unexpected Map0 route action: ${JSON.stringify(step)}`);
  }

  throw new Error('Recorded Map0 route ended without entering Map27');
}

async function tapMobileControl(control) {
  const point = await cdp.evaluate(`(() => {
    const button = document.querySelector('[data-touch-control="${control}"]');
    if (!(button instanceof HTMLButtonElement)) return null;
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      bounds: [rect.left, rect.top, rect.width, rect.height],
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
    };
  })()`);
  if (point === null || !point.visible || point.x < 0 || point.y < 0 || point.x > 360 || point.y > 640) {
    throw new Error(`Mobile touch control ${control} is not visible in the viewport: ${JSON.stringify(point)}`);
  }

  let activeWhileHeld = false;
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await delay(140);
    activeWhileHeld = await cdp.evaluate(`document.querySelector('[data-touch-control="${control}"]')?.classList.contains('touch-active') === true`);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await delay(140);
  return { ...point, activeWhileHeld, input: 'CDP touchStart/touchEnd' };
}

async function holdMobileControlUntil(control, predicate, { timeoutMs = 8000, label } = {}) {
  const point = await cdp.evaluate(`(() => {
    const button = document.querySelector('[data-touch-control="${control}"]');
    if (!(button instanceof HTMLButtonElement)) return null;
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      bounds: [rect.left, rect.top, rect.width, rect.height],
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
    };
  })()`);
  if (point === null || !point.visible || point.x < 0 || point.y < 0 || point.x > 360 || point.y > 640) {
    throw new Error(`Mobile touch control ${control} is not visible in the viewport: ${JSON.stringify(point)}`);
  }

  let finalState = null;
  let activeWhileHeld = false;
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 2, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await delay(140);
    activeWhileHeld = await cdp.evaluate(`document.querySelector('[data-touch-control="${control}"]')?.classList.contains('touch-active') === true`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      finalState = await readRuntime();
      if (predicate(finalState)) {
        observations.push({ at: new Date().toISOString(), label, state: finalState });
        break;
      }
      await delay(30);
    }
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(180);
  }

  if (!predicate(finalState)) {
    observations.push({ at: new Date().toISOString(), label: `${label}-timeout`, state: finalState });
    throw new Error(`Mobile touch control ${control} did not reach ${label}: ${JSON.stringify(finalState)}`);
  }
  return { ...point, activeWhileHeld, input: 'held CDP touchStart/touchEnd', state: finalState };
}

async function approachAndAttackMap27Enemy({ touch = false } = {}) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/27.json'),
    'utf8',
  ));
  const previousRun = JSON.parse(await readFile(
    join(root, 'reference/screenshots/web-render/M916-max-level-map27-combat/run-result.json'),
    'utf8',
  ));
  const approach = previousRun.route.filter((step) => step.label === 'map27-combat-approach');
  if (approach.length === 0) throw new Error('M916 has no recorded Map27 combat approach route');

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  if (!touch) {
    for (const step of approach) {
      const state = await readRuntime();
      if (state?.mapId !== 27 || state.tileX !== step.from[0] || state.tileY !== step.from[1]) {
        throw new Error(`Map27 approach diverged before ${JSON.stringify(step)}: ${JSON.stringify(state)}`);
      }
      const destinationOccupied = state.runtime?.entityOccupiedCells?.some((cell) =>
        cell.tileX === step.to[0] && cell.tileY === step.to[1]);
      if (destinationOccupied) break;
      const input = directionInputs.get(`${step.to[0] - step.from[0]},${step.to[1] - step.from[1]}`);
      if (input === undefined) throw new Error(`Invalid Map27 combat approach step: ${JSON.stringify(step)}`);
      const moved = await holdUntil(
        input[0], input[1], input[2],
        (candidate) => candidate?.mapId === 27 && candidate.tileX === step.to[0] && candidate.tileY === step.to[1],
        { timeoutMs: 3000, label: `map27-combat-approach-${step.to.join('-')}` },
      );
      if (moved?.mapId !== 27 || moved.tileX !== step.to[0] || moved.tileY !== step.to[1]) {
        throw new Error(`Map27 combat approach did not reach ${step.to}: ${JSON.stringify(moved)}`);
      }
    }
  }

  const cardinalDirections = [
    { dx: 0, dy: -1, input: directionInputs.get('0,-1') },
    { dx: 0, dy: 1, input: directionInputs.get('0,1') },
    { dx: -1, dy: 0, input: directionInputs.get('-1,0') },
    { dx: 1, dy: 0, input: directionInputs.get('1,0') },
  ];
  const targetOrder = 14;
  let attackReady;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const state = await readRuntime();
    if (state?.mapId !== 27 || state.runtime === null) {
      throw new Error(`WorldScene ended while approaching Map27 enemy: ${JSON.stringify(state)}`);
    }
    const player = state.runtime.player;
    const target = state.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    if (target === undefined || target.state !== 'alive') {
      throw new Error(`Map27 enemy order ${targetOrder} is not alive: ${JSON.stringify(target)}`);
    }
    const dx = target.tileX - player.tileX;
    const dy = target.tileY - player.tileY;
    const direction = cardinalDirections.find((candidate) => candidate.dx === dx && candidate.dy === dy);
    if (direction !== undefined) {
      await tap(direction.input[0], direction.input[1], direction.input[2]);
      const faced = await readRuntime();
      const facedPlayer = faced?.runtime?.player;
      const facedTarget = faced?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
      if (faced?.mapId === 27 && facedPlayer !== undefined && facedTarget?.state === 'alive' &&
        Math.abs(facedTarget.tileX - facedPlayer.tileX) + Math.abs(facedTarget.tileY - facedPlayer.tileY) === 1) {
        attackReady = { state: faced, target: facedTarget, direction: direction.input[0] };
        break;
      }
      continue;
    }

    const width = collision.width;
    const height = collision.height;
    const occupied = new Set(state.runtime.entityOccupiedCells.map((cell) => `${cell.tileX},${cell.tileY}`));
    const start = { x: player.tileX, y: player.tileY, firstDirection: null };
    const startKey = `${start.x},${start.y}`;
    const queue = [start];
    const visited = new Set([startKey]);
    const goalKeys = new Set(cardinalDirections.map((candidate) =>
      `${target.tileX - candidate.dx},${target.tileY - candidate.dy}`));
    let firstStep;
    for (let queueIndex = 0; queueIndex < queue.length && firstStep === undefined; queueIndex += 1) {
      const current = queue[queueIndex];
      if (goalKeys.has(`${current.x},${current.y}`) && current.firstDirection !== null) {
        firstStep = current.firstDirection;
        break;
      }
      for (const candidate of cardinalDirections) {
        const x = current.x + candidate.dx;
        const y = current.y + candidate.dy;
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= width || y >= height || visited.has(key)) continue;
        if ((collision.values[y]?.[x] ?? -1) < 0 || occupied.has(key)) continue;
        visited.add(key);
        queue.push({ x, y, firstDirection: current.firstDirection ?? candidate.input });
      }
    }
    if (firstStep === undefined) {
      throw new Error(`No live-occupancy path to Map27 enemy order ${targetOrder}: ${JSON.stringify({ player, target })}`);
    }
    const beforeTile = [player.tileX, player.tileY];
    const destination = [player.tileX + cardinalDirections.find((candidate) => candidate.input === firstStep).dx,
      player.tileY + cardinalDirections.find((candidate) => candidate.input === firstStep).dy];
    const moved = await holdUntil(
      firstStep[0], firstStep[1], firstStep[2],
      (candidate) => {
        if (candidate?.mapId !== 27) return false;
        if (candidate.tileX === destination[0] && candidate.tileY === destination[1]) return true;
        const candidatePlayer = candidate.runtime?.player;
        const candidateTarget = candidate.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
        return candidatePlayer !== undefined && candidateTarget?.state === 'alive' &&
          Math.abs(candidateTarget.tileX - candidatePlayer.tileX) + Math.abs(candidateTarget.tileY - candidatePlayer.tileY) <= 1;
      },
      { timeoutMs: 3000, label: `map27-live-path-${beforeTile.join('-')}-to-${destination.join('-')}` },
    );
    const movedTarget = moved?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    const isAdjacent = moved?.runtime?.player !== undefined && movedTarget?.state === 'alive' &&
      Math.abs(movedTarget.tileX - moved.runtime.player.tileX) + Math.abs(movedTarget.tileY - moved.runtime.player.tileY) <= 1;
    if (moved?.mapId !== 27 || (moved.tileX !== destination[0] || moved.tileY !== destination[1]) && !isAdjacent) {
      throw new Error(`Map27 live route stalled at ${beforeTile.join(',')}: ${JSON.stringify(moved)}`);
    }
  }

  if (attackReady === undefined) throw new Error(`Could not align next to Map27 enemy order ${targetOrder}`);
  const beforeAttack = await readRuntime();
  const targetBefore = beforeAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  if (targetBefore?.state !== 'alive') throw new Error(`Map27 target left the attack window: ${JSON.stringify(targetBefore)}`);
  await observe('map27-before-light-attack');
  await saveScreenshot('04-map27-before-light-attack.png');
  const touchControl = touch ? await tapMobileControl('attack') : null;
  if (!touch) await tap('5', 'Numpad5', 101, '5');

  const deadline = Date.now() + 5000;
  let afterAttack = await readRuntime();
  let targetAfter = afterAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  while (Date.now() < deadline && targetAfter?.hp === targetBefore.hp && targetAfter?.state === 'alive') {
    await delay(50);
    afterAttack = await readRuntime();
    targetAfter = afterAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  }
  const attackChanged = targetAfter !== undefined &&
    (targetAfter.hp < targetBefore.hp || targetAfter.state !== 'alive');
  const observation = {
    targetOrder,
    enemyId: targetBefore.enemyId,
    playerBefore: {
      tile: [beforeAttack.tileX, beforeAttack.tileY],
      direction: beforeAttack.runtime.player.direction,
      hp: beforeAttack.runtime.resources.hp,
      maxHp: beforeAttack.runtime.resources.maxHp,
      level: beforeAttack.runtime.resources.level,
      sp: beforeAttack.runtime.resources.sp,
    },
    targetBefore: { tile: [targetBefore.tileX, targetBefore.tileY], hp: targetBefore.hp, state: targetBefore.state },
    damage: targetAfter?.hp === undefined ? null : targetBefore.hp - targetAfter.hp,
    facingInput: attackReady.direction,
    attackInput: touch ? 'mobile Attack touch control' : 'Numpad5 light attack',
    touchControl,
    playerAfter: {
      tile: [afterAttack?.tileX, afterAttack?.tileY],
      hp: afterAttack?.runtime?.resources.hp,
      maxHp: afterAttack?.runtime?.resources.maxHp,
      level: afterAttack?.runtime?.resources.level,
      sp: afterAttack?.runtime?.resources.sp,
    },
    targetAfter: targetAfter === undefined
      ? null
      : { tile: [targetAfter.tileX, targetAfter.tileY], hp: targetAfter.hp, state: targetAfter.state },
    attackChanged,
  };
  await observe('map27-after-light-attack');
  await saveScreenshot('05-map27-after-light-attack.png');
  return observation;
}

async function waitForMap27EnemyRespawn(targetOrder) {
  const postAttackWaitStartedAt = Date.now();
  const death = await waitFor((state) => {
    const target = state?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    return state?.mapId === 27 && target?.state === 'respawn-wait';
  }, { timeoutMs: 8000, intervalMs: 50, label: `map27-enemy-${targetOrder}-respawn-wait` });
  const waitingTarget = death.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  const waiting = {
    mapId: death.mapId,
    tile: [death.tileX, death.tileY],
    playerHp: death.runtime.resources.hp,
    playerSp: death.runtime.resources.sp,
    enemy: waitingTarget === undefined ? null : {
      tile: [waitingTarget.tileX, waitingTarget.tileY],
      hp: waitingTarget.hp,
      state: waitingTarget.state,
    },
  };
  observations.push({ at: new Date().toISOString(), label: 'map27-enemy-respawn-wait', state: death });
  await saveScreenshot('06-map27-enemy-respawn-wait.png');

  const restored = await waitFor((state) => {
    const target = state?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    return state?.mapId === 27 && target?.state === 'alive' && target.hp === 43;
  }, { timeoutMs: 45000, intervalMs: 100, label: `map27-enemy-${targetOrder}-respawned` });
  const restoredTarget = restored.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  const revived = {
    mapId: restored.mapId,
    tile: [restored.tileX, restored.tileY],
    playerHp: restored.runtime.resources.hp,
    playerSp: restored.runtime.resources.sp,
    enemy: restoredTarget === undefined ? null : {
      tile: [restoredTarget.tileX, restoredTarget.tileY],
      hp: restoredTarget.hp,
      state: restoredTarget.state,
    },
  };
  observations.push({ at: new Date().toISOString(), label: 'map27-enemy-respawned', state: restored });
  await saveScreenshot('07-map27-enemy-respawned.png');
  return {
    waiting,
    revived,
    elapsedFromPostAttackWaitStartMs: Date.now() - postAttackWaitStartedAt,
  };
}

async function approachAndSampleMap27Pursuit() {
  const approachStart = await readRuntime();
  const approachStartHp = approachStart?.runtime?.resources.hp;
  const previousRun = JSON.parse(await readFile(
    join(root, 'reference/screenshots/web-render/M916-max-level-map27-combat/run-result.json'),
    'utf8',
  ));
  const approach = previousRun.route.filter((step) => step.label === 'map27-combat-approach');
  // Stop beside the enemy's spawn tile. Attempt 2 confirmed the enemy occupies
  // (9,32) and immediately targets the player from (8,32).
  const stopTile = [8, 32];
  const stopIndex = approach.findIndex((step) => step.to?.[0] === stopTile[0] && step.to?.[1] === stopTile[1]);
  if (stopIndex < 0) throw new Error(`M916 has no Map27 pursuit approach to ${stopTile.join(',')}`);

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const route = approach.slice(0, stopIndex + 1);
  const approachSamples = [];
  const approachStartedAt = Date.now();
  const captureEnemySample = (state, elapsedMs) => {
    const player = state?.runtime?.player;
    const enemy = state?.runtime?.enemies.find((candidate) => candidate.sourceOrder === 14);
    if (state?.mapId !== 27 || player === undefined || enemy === undefined) {
      throw new Error(`Map27 pursuit target disappeared during approach sampling: ${JSON.stringify(state)}`);
    }
    return {
      elapsedMs,
      player: { tileX: player.tileX, tileY: player.tileY, direction: player.direction },
      resources: {
        hp: state.runtime.resources.hp,
        maxHp: state.runtime.resources.maxHp,
        sp: state.runtime.resources.sp,
      },
      enemy: {
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        pixelX: enemy.pixelX,
        pixelY: enemy.pixelY,
        hp: enemy.hp,
        state: enemy.state,
        animationStateIndex: enemy.animationStateIndex,
        pursuitTarget: enemy.pursuitTarget,
        attackHitResolved: enemy.attackHitResolved,
      },
    };
  };
  for (const step of route) {
    const state = await readRuntime();
    if (state?.mapId !== 27 || state.tileX !== step.from[0] || state.tileY !== step.from[1]) {
      throw new Error(`Map27 pursuit approach diverged before ${step.from.join(',')}>${step.to.join(',')}: ${state?.mapId}:${state?.tileX},${state?.tileY}`);
    }
    const input = directionInputs.get(`${step.to[0] - step.from[0]},${step.to[1] - step.from[1]}`);
    if (input === undefined) throw new Error(`Invalid Map27 pursuit step: ${JSON.stringify(step)}`);
    const moved = await holdUntil(
      input[0], input[1], input[2],
      (candidate) => candidate?.mapId === 27 && candidate.tileX === step.to[0] && candidate.tileY === step.to[1],
      { timeoutMs: 3000, label: `map27-pursuit-approach-${step.to.join('-')}` },
    );
    if (moved?.mapId !== 27 || moved.tileX !== step.to[0] || moved.tileY !== step.to[1]) {
      throw new Error(`Map27 pursuit approach did not reach ${step.to.join(',')}; stopped at ${moved?.mapId}:${moved?.tileX},${moved?.tileY}`);
    }
    for (let sample = 0; sample < 2; sample += 1) {
      const stateAtStep = await readRuntime();
      approachSamples.push(captureEnemySample(stateAtStep, Date.now() - approachStartedAt));
      await delay(71);
    }
  }

  const start = await readRuntime();
  const sourceOrder = 14;
  const targetAtStart = start?.runtime?.enemies.find((enemy) => enemy.sourceOrder === sourceOrder);
  if (start?.mapId !== 27 || start.tileX !== stopTile[0] || start.tileY !== stopTile[1] || targetAtStart === undefined) {
    throw new Error(`Unexpected Map27 pursuit observation start: ${JSON.stringify({ start, targetAtStart })}`);
  }
  await observe('map27-pursuit-sampling-start');
  await saveScreenshot('map27-pursuit-start.png');

  const samples = [];
  const requestedDurationMs = 12000;
  const sampleIntervalMs = 71;
  const startedAt = Date.now();
  while (Date.now() - startedAt < requestedDurationMs) {
    const state = await readRuntime();
    samples.push(captureEnemySample(state, Date.now() - startedAt));
    await delay(sampleIntervalMs);
  }

  const end = await readRuntime();
  await observe('map27-pursuit-sampling-end');
  await saveScreenshot('map27-pursuit-end.png');
  const allSamples = [...approachSamples, ...samples];
  const enemyTiles = new Set(allSamples.map((sample) => `${sample.enemy.tileX},${sample.enemy.tileY}`));
  const enemyStates = new Set(allSamples.map((sample) => sample.enemy.state));
  const pursuitTargetCounts = Object.fromEntries(allSamples.reduce((counts, sample) => {
    const key = sample.enemy.pursuitTarget ?? 'null';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map()));
  const finalEnemy = end?.runtime?.enemies.find((enemy) => enemy.sourceOrder === sourceOrder);
  return {
    sourceOrder,
    sampleIntervalMs,
    requestedDurationMs,
    actualDurationMs: Date.now() - startedAt,
    sampleCount: samples.length,
    approachSampleCount: approachSamples.length,
    enemyTileCount: enemyTiles.size,
    enemyStates: [...enemyStates],
    pursuitTargetCounts,
    startsAt: { player: [start.tileX, start.tileY], enemy: [targetAtStart.tileX, targetAtStart.tileY] },
    approachStartHp,
    final: end === null ? null : {
      mapId: end.mapId,
      player: [end.tileX, end.tileY],
      hp: end.hp,
      enemy: finalEnemy === undefined ? null : {
        tile: [finalEnemy.tileX, finalEnemy.tileY],
        hp: finalEnemy.hp,
        state: finalEnemy.state,
      },
    },
    approachSamples,
    samples,
    observedPlayerTarget: allSamples.some((sample) => sample.enemy.pursuitTarget === 'player'),
    observedWalkingState: allSamples.some((sample) => sample.enemy.animationStateIndex === 1),
    enemyAttackObserved: allSamples.some((sample) => sample.enemy.attackHitResolved === true),
    playerHpMinimum: Math.min(...allSamples.map((sample) => sample.resources.hp)),
    playerHpDamageObserved: approachStartHp !== undefined &&
      allSamples.some((sample) => sample.resources.hp < approachStartHp),
    playerHpRemainedPositive: allSamples.every((sample) => sample.resources.hp > 0),
  };
}

async function runMap27WeaponProcStatus(
  initialState,
  procCode,
  itemId,
  statusId,
  statusName,
  maximumAttackCount = 20,
  observeSlowCooldown = false,
) {
  const sourceOrder = 14;
  const enemyId = 24;
  const startingEnemy = initialState?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  if (initialState?.mapId !== 27 || initialState.tileX !== 9 || initialState.tileY !== 31 ||
    startingEnemy?.tileX !== 10 || startingEnemy?.tileY !== 31 || startingEnemy.hp !== 5000000) {
    throw new Error(`Weapon-proc fixture did not reach its source target: ${JSON.stringify({ initialState, startingEnemy })}`);
  }
  await saveScreenshot('02-map27-weapon-proc-before-attack.png');
  const attacks = [];
  let previousEnemyHp = startingEnemy.hp;
  for (let attackIndex = 1; attackIndex <= maximumAttackCount; attackIndex += 1) {
    await tap('5', 'Numpad5', 101, '5');
    await delay(120);
    const state = await readRuntime();
    const enemy = state?.runtime?.enemies.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    const status = state?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder) ?? null;
    attacks.push({
      attackIndex,
      hp: enemy?.hp ?? null,
      damage: enemy?.hp === undefined ? null : previousEnemyHp - enemy.hp,
      state: enemy?.state ?? null,
      combo: state?.runtime?.combo ?? null,
      status,
    });
    if (enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    if (status?.effects.some((effect) => effect.id === statusId) === true) break;
  }
  const after = await observe(`map27-weapon-proc-${statusName}-status-observed`);
  await saveScreenshot(`03-map27-weapon-proc-${statusName}-status-observed.png`);
  let finalSnapshot = after;
  const statusEnemy = after?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const observedStatusEffects = after?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder) ?? null;
  const observedStatus = observedStatusEffects?.effects.some((effect) => effect.id === statusId) === true;
  const slowCooldownSamples = [];
  let slowCooldownObservation = null;
  if (observeSlowCooldown && statusId === 1 && observedStatus) {
    const cooldownObservationStartedAt = Date.now();
    let matchingSample = null;
    let current = after;
    while (Date.now() - cooldownObservationStartedAt < 7000) {
      const enemy = current?.runtime?.enemies.find((candidate) =>
        candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
      const effects = current?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder)?.effects ?? [];
      const slowEffect = effects.find((effect) => effect.id === 1) ?? null;
      const sample = {
        elapsedMs: Date.now() - cooldownObservationStartedAt,
        statusTicksElapsed: slowEffect?.ticksElapsed ?? null,
        enemyState: enemy?.state ?? null,
        animationStateIndex: enemy?.animationStateIndex ?? null,
        attackCooldownTicksRemaining: enemy?.attackCooldownTicksRemaining ?? null,
        attackAnimationTicksRemaining: enemy?.attackAnimationTicksRemaining ?? null,
        behaviorTiming: enemy?.behaviorTiming ?? null,
        enemyHp: enemy?.hp ?? null,
        playerHp: current?.hp ?? null,
      };
      if (slowEffect !== null) slowCooldownSamples.push(sample);
      const baseCooldownTicks = enemy?.behaviorTiming?.[1];
      if (slowEffect !== null && enemy?.state === 'alive' && enemy.animationStateIndex === 2 &&
        Number.isInteger(baseCooldownTicks) &&
        enemy.attackCooldownTicksRemaining === baseCooldownTicks * 2 + 1) {
        matchingSample = sample;
        break;
      }
      if (slowEffect === null || current?.hp <= 0) break;
      await delay(40);
      current = await readRuntime();
    }
    if (matchingSample !== null) {
      await observe('map27-status-1-doubled-attack-cooldown');
      await saveScreenshot('04-map27-status-1-doubled-attack-cooldown.png');
    }
    slowCooldownObservation = {
      passed: matchingSample !== null,
      expectedMultiplier: 2,
      observedAttackCooldownTicksRemaining: matchingSample?.attackCooldownTicksRemaining ?? null,
      observedBaseCooldownTicks: matchingSample?.behaviorTiming?.[1] ?? null,
      observedStatusTicksElapsed: matchingSample?.statusTicksElapsed ?? null,
      samples: slowCooldownSamples,
    };
  }
  const followUpAttacks = [];
  if (statusId === 4 && observedStatus && statusEnemy?.hp !== undefined) {
    previousEnemyHp = statusEnemy.hp;
    for (let followUpIndex = 1; followUpIndex <= 3; followUpIndex += 1) {
      await tap('5', 'Numpad5', 101, '5');
      await delay(120);
      const state = await readRuntime();
      const enemy = state?.runtime?.enemies.find((candidate) =>
        candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
      const status = state?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder) ?? null;
      const damage = enemy?.hp === undefined ? null : previousEnemyHp - enemy.hp;
      followUpAttacks.push({
        followUpIndex,
        hp: enemy?.hp ?? null,
        damage,
        state: enemy?.state ?? null,
        combo: state?.runtime?.combo ?? null,
        status,
      });
      if (enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    }
    finalSnapshot = await observe('map27-weapon-proc-defense-down-follow-up-damage') ?? finalSnapshot;
    await saveScreenshot('04-map27-weapon-proc-defense-down-follow-up-damage.png');
  }
  const finalEnemy = finalSnapshot?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const finalStatus = finalSnapshot?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder) ?? null;
  const preStatusDamageMean = attacks.length === 0 ? null
    : attacks.reduce((sum, attack) => sum + (attack.damage ?? 0), 0) / attacks.length;
  const followUpDamageMean = followUpAttacks.length === 0 ? null
    : followUpAttacks.reduce((sum, attack) => sum + (attack.damage ?? 0), 0) / followUpAttacks.length;
  return {
    passed: observedStatus && (!observeSlowCooldown || slowCooldownObservation?.passed === true) &&
      finalEnemy?.hp > 0 && finalEnemy.hp < startingEnemy.hp &&
      finalEnemy.state === 'alive' && after?.level === 99 && after.hp > 0 &&
      after.tileX === 9 && after.tileY === 31,
    source: {
      enemyId,
      sourceOrder,
      procWeapon: { category: 0, itemId, procCode, statusId },
      expectedStatus: statusName,
      targetStartHp: startingEnemy.hp,
      targetTile: [startingEnemy.tileX, startingEnemy.tileY],
    },
    attackCount: attacks.length,
    attacks,
    followUpAttacks,
    slowCooldownObservation,
    defenseDownDamageCompared: statusId === 4 && attacks.length > 0 && followUpAttacks.length > 0
      ? {
        preStatusDamageMean,
        postStatusDamages: followUpAttacks.map((attack) => attack.damage),
        postStatusDamageMean: followUpDamageMean,
        postStatusDamageMeanGreater: followUpDamageMean > preStatusDamageMean,
        statusRemainsActive: followUpAttacks.every((attack) =>
          attack.status?.effects.some((effect) => effect.id === 4) === true),
      }
      : null,
    final: {
      mapId: finalSnapshot?.mapId,
      player: [finalSnapshot?.tileX, finalSnapshot?.tileY],
      level: finalSnapshot?.level,
      hp: finalSnapshot?.hp,
      enemyHp: finalEnemy?.hp,
      enemyState: finalEnemy?.state,
      status: finalStatus,
    },
    observedStatus,
  };
}

async function runMap27WeaponProcDamage(initialState) {
  const sourceOrder = 14;
  const enemyId = 24;
  const seededHp = 50000000;
  const startingEnemy = initialState?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const weapon = initialState?.runtime?.equipment?.[0];
  const maxHp = initialState?.runtime?.resources?.maxHp;
  const expectedHpCost = Number.isInteger(maxHp) ? Math.trunc(maxHp / 25) : null;
  if (initialState?.mapId !== 27 || initialState.tileX !== 9 || initialState.tileY !== 31 ||
    startingEnemy?.tileX !== 10 || startingEnemy?.tileY !== 31 || startingEnemy.hp !== seededHp ||
    startingEnemy.state !== 'alive' || weapon?.category !== 0 || weapon?.itemId !== 32 ||
    weapon.equipmentState?.subtypeBytes?.[2] !== 8 || expectedHpCost === null) {
    throw new Error(`Proc-code-8 fixture did not initialize as expected: ${JSON.stringify({
      mapId: initialState?.mapId,
      tile: [initialState?.tileX, initialState?.tileY],
      target: startingEnemy,
      weapon: weapon === undefined ? null : { category: weapon.category, itemId: weapon.itemId,
        subtypeBytes: weapon.equipmentState?.subtypeBytes },
      maxHp,
    })}`);
  }

  await saveScreenshot('02-map27-proc-code-8-before.png');
  let previous = initialState;
  let previousEnemyHp = startingEnemy.hp;
  let procObservation = null;
  const attacks = [];
  for (let attackIndex = 1; attackIndex <= 50; attackIndex += 1) {
    await tap('5', 'Numpad5', 101, '5');
    let state = await readRuntime();
    let enemy = state?.runtime?.enemies.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    const hitDeadline = Date.now() + 1200;
    while (enemy?.hp === previousEnemyHp && Date.now() < hitDeadline) {
      await delay(40);
      state = await readRuntime();
      enemy = state?.runtime?.enemies.find((candidate) =>
        candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    }
    const enemyDamage = enemy?.hp === undefined ? null : previousEnemyHp - enemy.hp;
    const playerHpCost = previous?.hp === undefined || state?.hp === undefined
      ? null
      : previous.hp - state.hp;
    const attack = {
      attackIndex,
      enemyHp: enemy?.hp ?? null,
      enemyDamage,
      enemyState: enemy?.state ?? null,
      playerHp: state?.hp ?? null,
      playerHpCost,
      combo: state?.runtime?.combo ?? null,
    };
    attacks.push(attack);
    if (playerHpCost === expectedHpCost && (enemyDamage ?? 0) > 0) {
      procObservation = { ...attack, screenshot: '03-map27-proc-code-8-observed.png' };
      await observe('map27-proc-code-8-observed');
      await saveScreenshot('03-map27-proc-code-8-observed.png');
      break;
    }
    if (enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    previous = state;
    if (enemy?.state !== 'alive' || (state?.hp ?? 0) <= 0) break;
  }
  const finalSnapshot = await readRuntime();
  const finalEnemy = finalSnapshot?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const passed = procObservation !== null && finalSnapshot?.mapId === 27 &&
    finalSnapshot.level === 99 && finalSnapshot.hp > 0 && finalSnapshot.tileX === 9 &&
    finalSnapshot.tileY === 31 && procObservation.enemyDamage > 0 &&
    procObservation.playerHpCost === expectedHpCost && finalEnemy?.state === 'alive' &&
    finalEnemy.hp > 0;
  return {
    passed,
    source: {
      weapon: { category: weapon.category, itemId: weapon.itemId,
        procCode: weapon.equipmentState.subtypeBytes[2] },
      enemyId,
      sourceOrder,
      seededEnemyHp: seededHp,
    },
    expected: { hpCost: expectedHpCost, formula: 'trunc(maxHp / 25)', maxHp },
    attackCount: attacks.length,
    procObservation,
    attacks,
    final: {
      mapId: finalSnapshot?.mapId,
      playerTile: [finalSnapshot?.tileX, finalSnapshot?.tileY],
      level: finalSnapshot?.level,
      hp: finalSnapshot?.hp,
      maxHp: finalSnapshot?.runtime?.resources?.maxHp,
      enemyHp: finalEnemy?.hp ?? null,
      enemyState: finalEnemy?.state ?? null,
    },
  };
}

async function runMap27WeaponProcResource(initialState, resource) {
  const sourceOrder = 14;
  const enemyId = 24;
  const seededHp = 50000000;
  const procCode = resource === 'sp' ? 3 : 4;
  const itemId = resource === 'sp' ? 30 : 36;
  const startingEnemy = initialState?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const weapon = initialState?.runtime?.equipment?.[0];
  if (initialState?.mapId !== 27 || initialState.tileX !== 9 || initialState.tileY !== 31 ||
    startingEnemy?.tileX !== 10 || startingEnemy?.tileY !== 31 || startingEnemy.hp !== seededHp ||
    startingEnemy.state !== 'alive' || weapon?.category !== 0 || weapon?.itemId !== itemId ||
    weapon.equipmentState?.subtypeBytes?.[2] !== procCode) {
    throw new Error(`Proc-code-${procCode} fixture did not initialize as expected: ${JSON.stringify({
      mapId: initialState?.mapId,
      tile: [initialState?.tileX, initialState?.tileY],
      target: startingEnemy,
      weapon: weapon === undefined ? null : { category: weapon.category, itemId: weapon.itemId,
        subtypeBytes: weapon.equipmentState?.subtypeBytes },
    })}`);
  }

  await saveScreenshot('02-map27-proc-resource-before.png');
  let previous = initialState;
  let previousEnemyHp = startingEnemy.hp;
  const attacks = [];
  let procObservation = null;
  for (let attackIndex = 1; attackIndex <= 50; attackIndex += 1) {
    await tap('5', 'Numpad5', 101, '5');
    let state = await readRuntime();
    let enemy = state?.runtime?.enemies.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    const hitDeadline = Date.now() + 1200;
    while (enemy?.hp === previousEnemyHp && Date.now() < hitDeadline) {
      await delay(40);
      state = await readRuntime();
      enemy = state?.runtime?.enemies.find((candidate) =>
        candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    }
    const enemyDamage = enemy?.hp === undefined ? null : previousEnemyHp - enemy.hp;
    const playerHpCost = previous?.hp === undefined || state?.hp === undefined
      ? null : previous.hp - state.hp;
    const playerSpCost = previous?.runtime?.resources?.sp === undefined ||
      state?.runtime?.resources?.sp === undefined
      ? null : previous.runtime.resources.sp - state.runtime.resources.sp;
    const expectedCost = (enemyDamage ?? 0) <= 0 ? null : resource === 'sp'
      ? Math.trunc((enemyDamage * 80) / 100)
      : Math.trunc(enemyDamage / 2);
    const attack = {
      attackIndex,
      enemyHp: enemy?.hp ?? null,
      enemyDamage,
      enemyState: enemy?.state ?? null,
      playerHp: state?.hp ?? null,
      playerHpCost,
      playerSp: state?.runtime?.resources?.sp ?? null,
      playerSpCost,
      expectedCost,
      combo: state?.runtime?.combo ?? null,
    };
    attacks.push(attack);
    const actualCost = resource === 'sp' ? playerSpCost : playerHpCost;
    if (expectedCost !== null && actualCost === expectedCost && expectedCost > 0 &&
      (resource === 'sp' ? playerHpCost === 0 : playerSpCost === 0)) {
      procObservation = { ...attack, screenshot: '03-map27-proc-resource-observed.png' };
      await observe(`map27-proc-code-${procCode}-${resource}-drain-observed`);
      await saveScreenshot('03-map27-proc-resource-observed.png');
      break;
    }
    if (enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    previous = state;
    if (enemy?.state !== 'alive' || (state?.hp ?? 0) <= 0) break;
  }
  const finalSnapshot = await readRuntime();
  const finalEnemy = finalSnapshot?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  return {
    passed: procObservation !== null && finalSnapshot?.mapId === 27 &&
      finalSnapshot.level === 99 && finalSnapshot.hp > 0 && finalSnapshot.tileX === 9 &&
      finalSnapshot.tileY === 31 && finalEnemy?.state === 'alive' && finalEnemy.hp > 0,
    source: { resource, weapon: { category: weapon.category, itemId,
      procCode: weapon.equipmentState.subtypeBytes[2] }, enemyId, sourceOrder, seededEnemyHp: seededHp },
    expected: { formula: resource === 'sp' ? 'trunc(calculatedDamage * 80 / 100)' :
      'trunc(calculatedDamage / 2)', cost: procObservation?.expectedCost ?? null },
    attackCount: attacks.length,
    procObservation,
    attacks,
    final: {
      mapId: finalSnapshot?.mapId,
      playerTile: [finalSnapshot?.tileX, finalSnapshot?.tileY],
      level: finalSnapshot?.level,
      hp: finalSnapshot?.hp,
      maxHp: finalSnapshot?.runtime?.resources?.maxHp,
      sp: finalSnapshot?.runtime?.resources?.sp,
      maxSp: finalSnapshot?.runtime?.resources?.maxSp,
      enemyHp: finalEnemy?.hp ?? null,
      enemyState: finalEnemy?.state ?? null,
    },
  };
}

async function runMap13AuProcResource(initialState, resource) {
  const enemyId = 35;
  const seededHp = 50000000;
  const procCode = resource === 'sp' ? 3 : 4;
  const itemId = resource === 'sp' ? 30 : 36;
  const startingTarget = initialState?.runtime?.enemies.find((enemy) => enemy.enemyId === enemyId);
  const weapon = initialState?.runtime?.equipment?.[0];
  const sourceOrder = startingTarget?.sourceOrder;
  if (initialState?.mapId !== 13 || initialState.tileX !== 9 || initialState.tileY !== 6 ||
    initialState.runtime?.player?.direction !== 1 || startingTarget?.sourceAu !== true ||
    startingTarget.hp !== seededHp || startingTarget.state !== 'alive' ||
    weapon?.category !== 0 || weapon?.itemId !== itemId ||
    weapon.equipmentState?.subtypeBytes?.[2] !== procCode || sourceOrder === undefined) {
    throw new Error(`Source-au proc-code-${procCode} fixture did not initialize as expected: ${JSON.stringify({
      mapId: initialState?.mapId,
      tile: [initialState?.tileX, initialState?.tileY],
      playerDirection: initialState?.runtime?.player?.direction,
      target: startingTarget,
      weapon: weapon === undefined ? null : { category: weapon.category, itemId: weapon.itemId,
        subtypeBytes: weapon.equipmentState?.subtypeBytes },
    })}`);
  }

  await saveScreenshot(`02-map13-au-proc-${resource}-before.png`);
  let previous = initialState;
  let previousEnemyHp = startingTarget.hp;
  const attacks = [];
  let procObservation = null;
  for (let attackIndex = 1; attackIndex <= 50; attackIndex += 1) {
    await tap('5', 'Numpad5', 101, '5');
    let state = await readRuntime();
    let enemy = state?.runtime?.enemies.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    const hitDeadline = Date.now() + 1200;
    while (enemy?.hp === previousEnemyHp && Date.now() < hitDeadline) {
      await delay(40);
      state = await readRuntime();
      enemy = state?.runtime?.enemies.find((candidate) =>
        candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    }
    const enemyDamage = enemy?.hp === undefined ? null : previousEnemyHp - enemy.hp;
    const playerHpCost = previous?.hp === undefined || state?.hp === undefined
      ? null : previous.hp - state.hp;
    const playerSpCost = previous?.runtime?.resources?.sp === undefined ||
      state?.runtime?.resources?.sp === undefined
      ? null : previous.runtime.resources.sp - state.runtime.resources.sp;
    const expectedCost = (enemyDamage ?? 0) <= 0 ? null : resource === 'sp'
      ? Math.trunc((enemyDamage * 30) / 100)
      : Math.trunc(enemyDamage / 2);
    const actualCost = resource === 'sp' ? playerSpCost : playerHpCost;
    const otherCost = resource === 'sp' ? playerHpCost : playerSpCost;
    const attack = {
      attackIndex,
      enemyHp: enemy?.hp ?? null,
      enemyDamage,
      enemyState: enemy?.state ?? null,
      playerHp: state?.hp ?? null,
      playerHpCost,
      playerSp: state?.runtime?.resources?.sp ?? null,
      playerSpCost,
      expectedCost,
      direction: state?.runtime?.player?.direction ?? null,
      combo: state?.runtime?.combo ?? null,
    };
    attacks.push(attack);
    if (expectedCost !== null && expectedCost > 0 && actualCost === expectedCost && otherCost === 0) {
      procObservation = { ...attack, screenshot: `03-map13-au-proc-${resource}-observed.png` };
      await observe(`map13-source-au-proc-code-${procCode}-${resource}-cost-observed`);
      await saveScreenshot(`03-map13-au-proc-${resource}-observed.png`);
      break;
    }
    if (enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    previous = state;
    if (enemy?.state !== 'alive' || (state?.hp ?? 0) <= 0) break;
  }
  const finalSnapshot = await readRuntime();
  const finalEnemy = finalSnapshot?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const startingHp = initialState.hp ?? null;
  const finalHp = finalSnapshot?.hp ?? null;
  const startingSp = initialState.runtime?.resources?.sp ?? null;
  const finalSp = finalSnapshot?.runtime?.resources?.sp ?? null;
  return {
    passed: procObservation !== null && finalSnapshot?.mapId === 13 &&
      finalSnapshot.profile === 'max-level' && finalSnapshot.level === 99 && finalSnapshot.hp > 0 &&
      finalSnapshot.tileX === 9 && finalSnapshot.tileY === 6 &&
      finalSnapshot.runtime?.player?.direction === 1 && finalEnemy?.sourceAu === true &&
      finalEnemy?.state === 'alive' && finalEnemy.hp > 0 && startingSp !== null &&
      finalSp !== null && startingHp !== null && finalHp !== null &&
      (resource === 'sp'
        ? finalSp < startingSp && finalHp === startingHp
        : finalHp < startingHp && finalSp === startingSp),
    source: { enemyId, sourceOrder, sourceAu: startingTarget.sourceAu,
      weapon: { category: weapon.category, itemId,
        procCode: weapon.equipmentState.subtypeBytes[2] }, seededEnemyHp: seededHp },
    expected: { formula: resource === 'sp' ? 'trunc(calculatedDamage * 30 / 100)' :
      'trunc(calculatedDamage / 2)', cost: procObservation?.expectedCost ?? null },
    attackCount: attacks.length,
    procObservation,
    attacks,
    final: {
      mapId: finalSnapshot?.mapId,
      playerTile: [finalSnapshot?.tileX, finalSnapshot?.tileY],
      playerDirection: finalSnapshot?.runtime?.player?.direction ?? null,
      level: finalSnapshot?.level,
      hp: finalHp,
      maxHp: finalSnapshot?.runtime?.resources?.maxHp,
      sp: finalSp,
      maxSp: finalSnapshot?.runtime?.resources?.maxSp,
      enemyHp: finalEnemy?.hp ?? null,
      enemyState: finalEnemy?.state ?? null,
      enemySourceAu: finalEnemy?.sourceAu ?? null,
    },
  };
}

async function runMap27PoisonTickObservation(initialState) {
  const sourceOrder = 14;
  const enemyId = 24;
  const startingEnemy = initialState?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const startingStatus = initialState?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder)
    ?.effects.find((effect) => effect.id === 3);
  if (initialState?.mapId !== 27 || initialState.tileX !== 9 || initialState.tileY !== 31 ||
    startingEnemy?.hp <= 0 || startingEnemy?.hp > 5000000 || startingEnemy?.state !== 'alive' ||
    startingStatus === undefined || startingStatus.ticksElapsed < 0 || startingStatus.ticksElapsed >= 40) {
    throw new Error(`Direct poison-tick fixture did not initialize as expected: ${JSON.stringify({
      initialState: { mapId: initialState?.mapId, tile: [initialState?.tileX, initialState?.tileY] },
      startingEnemy,
      startingStatus,
    })}`);
  }
  const preObservationPulseTicks = Array.from({ length: Math.floor(startingStatus.ticksElapsed / 8) },
    (_unused, index) => (index + 1) * 8);
  const preObservationPulseDamage = 5000000 - startingEnemy.hp;
  const preObservationPulseDamageValid = preObservationPulseTicks.length === 0
    ? preObservationPulseDamage === 0
    : preObservationPulseDamage >= preObservationPulseTicks.length * 15 &&
      preObservationPulseDamage <= preObservationPulseTicks.length * 25;

  await saveScreenshot('02-map27-poison-status-active.png');
  const startedAt = Date.now();
  const samples = [{
    elapsedMs: 0,
    statusTicksElapsed: startingStatus.ticksElapsed,
    enemyHp: startingEnemy.hp,
    enemyState: startingEnemy.state,
    playerHp: initialState.hp,
  }];
  const pulses = [];
  let previousStatusTick = startingStatus.ticksElapsed;
  let previousEnemyHp = startingEnemy.hp;
  let current = initialState;
  let expiredState = null;
  let capturedPulse = false;
  while (Date.now() - startedAt < 7000) {
    await delay(20);
    current = await readRuntime();
    const enemy = current?.runtime?.enemies.find((candidate) =>
      candidate.sourceOrder === sourceOrder && candidate.enemyId === enemyId);
    const effect = current?.enemyStatusEffects.find((entry) => entry.sourceOrder === sourceOrder)
      ?.effects.find((candidate) => candidate.id === 3);
    if (enemy === undefined || enemy === null) {
      throw new Error('Map27 poison-tick target disappeared before status expiry');
    }
    const currentStatusTick = effect?.ticksElapsed ?? null;
    const hpLoss = previousEnemyHp - enemy.hp;
    if (hpLoss > 0) {
      const pulseTick = currentStatusTick ?? (previousStatusTick === 39 ? 40 : null);
      pulses.push({
        statusTick: pulseTick,
        previousStatusTick,
        damage: hpLoss,
        enemyHp: enemy.hp,
      });
      if (!capturedPulse) {
        await saveScreenshot('03-map27-poison-pulse.png');
        capturedPulse = true;
      }
    }
    if (currentStatusTick !== previousStatusTick || hpLoss > 0) {
      samples.push({
        elapsedMs: Date.now() - startedAt,
        statusTicksElapsed: currentStatusTick,
        enemyHp: enemy.hp,
        enemyState: enemy.state,
        playerHp: current?.hp ?? null,
      });
    }
    if (currentStatusTick === null) {
      expiredState = current;
      await saveScreenshot('04-map27-poison-status-expired.png');
      break;
    }
    previousStatusTick = currentStatusTick;
    previousEnemyHp = enemy.hp;
  }

  const targetAtEnd = expiredState?.runtime?.enemies.find((enemy) =>
    enemy.sourceOrder === sourceOrder && enemy.enemyId === enemyId);
  const lastActiveTick = samples.filter((sample) => sample.statusTicksElapsed !== null)
    .at(-1)?.statusTicksElapsed ?? null;
  const observedPulseTicks = pulses.map((pulse) => pulse.statusTick);
  const pulsesUseEightTickPeriod = pulses.length >= 3 && observedPulseTicks.every((tick, index) =>
    tick !== null && tick % 8 === 0 && (index === 0 || tick - observedPulseTicks[index - 1] === 8));
  const validPulseDamage = pulses.length >= 3 && pulses.every((pulse) =>
    pulse.damage >= 15 && pulse.damage <= 25);
  const monotonic = samples.filter((sample) => sample.statusTicksElapsed !== null)
    .every((sample, index, activeSamples) => index === 0 ||
      sample.statusTicksElapsed >= activeSamples[index - 1].statusTicksElapsed);
  const passed = preObservationPulseDamageValid && expiredState !== null &&
    targetAtEnd?.state === 'alive' && targetAtEnd.hp > 0 &&
    expiredState?.profile === 'max-level' && expiredState.mapId === 27 && expiredState.level === 99 &&
    expiredState.hp > 0 && lastActiveTick === 39 && monotonic && pulsesUseEightTickPeriod &&
    validPulseDamage && pulses.at(-1)?.statusTick === 40;
  return {
    passed,
    source: { enemyId, sourceOrder, seededHp: 5000000, observedHpAtProbeStart: startingEnemy.hp,
      seededStatusId: 3, initialStatusTick: startingStatus.ticksElapsed,
      preObservationPulseTicks, preObservationPulseDamage, preObservationPulseDamageValid },
    expected: { lifetimeTicks: 40, poisonPeriodTicks: 8, pulseDamageRange: [15, 25] },
    sampleCount: samples.length,
    lastActiveTick,
    expired: expiredState !== null && expiredState.enemyStatusEffects
      .find((entry) => entry.sourceOrder === sourceOrder)?.effects.some((effect) => effect.id === 3) !== true,
    monotonic,
    pulsesUseEightTickPeriod,
    validPulseDamage,
    pulses,
    samples,
    targetAtEnd: { state: targetAtEnd?.state ?? null, hp: targetAtEnd?.hp ?? null },
    playerAtEnd: { level: expiredState?.level ?? null, hp: expiredState?.hp ?? null,
      maxHp: expiredState?.runtime?.resources.maxHp ?? null },
  };
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const before = routeTarget === 'map-preview'
    ? await startNewGameAndReachMapPreview()
    : await startNewGameAndReachMap64();
  const weaponProcStatusObservation = map27WeaponProcStatusTest
    ? await runMap27WeaponProcStatus(before,
      map27WeaponProcStatusDefense ? 5 : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown ? 1 : 0,
      map27WeaponProcStatusDefense ? 34 : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown ? 33 : 31,
      map27WeaponProcStatusDefense ? 4 : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown ? 1 : 0,
      map27WeaponProcStatusDefense ? 'defense-down' : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown ? 'slow' : 'sleep',
      map27WeaponProcStatusDefense ? 30 : 20,
      map27WeaponProcStatusSlowCooldown)
    : null;
  const weaponProcDamageObservation = map27WeaponProcDamageTest
    ? await runMap27WeaponProcDamage(before)
    : null;
  const weaponProcResourceObservation = map27WeaponProcResourceTest
    ? await runMap27WeaponProcResource(before, map27WeaponProcResource)
    : null;
  const map13AuProcResourceObservation = map13AuProcResourceTest
    ? await runMap13AuProcResource(before, map13AuProcResource)
    : null;
  const poisonTickObservation = map27PoisonTickTest
    ? await runMap27PoisonTickObservation(before)
    : null;
  map37ClassSixMultiTargetObservation = map37ClassSixMultiTargetTest
    ? await runMap37ClassSixMultiTargetAttack(before)
    : null;
  map37ClassSixTripleTargetObservation = map37ClassSixTripleTargetTest
    ? await runMap37ClassSixTripleTargetAttack(before)
    : null;
  map37ClassSixLightFollowupObservation = map37ClassSixLightFollowupTest
    ? await runMap37ClassSixLightFollowup(before)
    : null;
  map37ClassSixHeavyStage4SweepObservation = map37ClassSixHeavyStage4SweepTest
    ? await runMap37ClassSixHeavyStage4Sweep(before)
    : null;
  const map66NoChoiceObservation = map66NoChoiceBranch
    ? await runMap66NoChoiceBranch(before)
    : null;
  const map59NoChoiceObservation = map59NoChoiceBranch
    ? await runMap59NoChoiceBranch(before)
    : null;
  const map59YesChoiceObservation = map59YesChoiceBranch
    ? await runMap59YesChoiceBranch(before)
    : null;
  const map59FullChainObservation = map59FullChain
    ? await runMap59YesChoiceBranch(before, { followMap12Prerequisite: true })
    : null;
  const map54ItemPrizeObservation = map54ItemPrize
    ? await runMap54ItemPrize(before)
    : null;
  const map54CurrentCellExitObservation = map54CurrentCellExit
    ? await runMap54CurrentCellExit(before)
    : null;
  const map54ToMap13ChainObservation = map54ToMap13Chain
    ? await runMap54ToMap13Chain(before)
    : null;
  const map53BluebrickObservation = map53BluebrickChain
    ? await runMap53BluebrickToMap13(before)
    : null;
  const enemyApproachRun = observeMapPreviewEnemy && approachMapPreviewEnemy
    ? await approachMapPreviewEnemyForAttack(before)
    : null;
  const enemyObservation = observeMapPreviewEnemy
    ? await observeMapPreviewEnemyAttack(enemyApproachRun?.state ?? before, {
      includeMapReadySample: enemyApproachRun === null,
    })
    : null;
  const enemyApproach = enemyApproachRun?.summary ?? null;
  const mapPreviewRoute = mapPreviewExitMapId === 17
    ? await followMap27PreviewExitToMap17(before)
    : null;
  const mobileTouchExit = routeTarget === 'map0-mobile-touch'
    ? await holdMobileControlUntil('down', (state) => state?.mapId === 0, {
      timeoutMs: 8000,
      label: 'touch-down-map64-to-map0',
    })
    : null;
  const afterMap0 = routeTarget === 'map-preview' ? null : mobileTouchExit?.state ?? await holdUntil(
    'ArrowDown', 'ArrowDown', 40,
    (state) => state?.mapId === 0,
    { timeoutMs: 8000, label: 'held-down-map64-to-map0' },
  );
  if (routeTarget !== 'map-preview') {
    await observe('after-held-bedroom-exit');
    await saveScreenshot('02-after-held-bedroom-exit.png');
  }
  const houseReentry = routeTarget === 'map0-reentry'
    ? await holdUntil('ArrowUp', 'ArrowUp', 38, (state) => state?.mapId === 64 &&
      state?.runtime !== null && state?.tileX === 10 && state?.tileY === 18, {
      timeoutMs: 12000,
      label: 'map0-marker-5-to-map64-bedroom-reentry',
    })
    : null;
  if (houseReentry !== null) {
    await observe('map64-bedroom-reentry');
    await saveScreenshot('03-map64-reentry.png');
  }
  let map0InteractionApproach = null;
  let map0InteractionState = null;
  if (routeTarget === 'map0-interaction') {
    const movementSteps = [
      { key: 'ArrowDown', code: 'ArrowDown', virtualKeyCode: 40, tileX: 26, tileY: 25 },
      { key: 'ArrowLeft', code: 'ArrowLeft', virtualKeyCode: 37, tileX: 18, tileY: 25 },
      { key: 'ArrowUp', code: 'ArrowUp', virtualKeyCode: 38, tileX: 18, tileY: 24 },
    ];
    for (const step of movementSteps) {
      const state = await holdUntil(step.key, step.code, step.virtualKeyCode, (candidate) =>
        candidate?.mapId === 0 && candidate.tileX === step.tileX && candidate.tileY === step.tileY, {
        timeoutMs: 8000,
        label: `map0-marker-8-approach-${step.tileX}-${step.tileY}`,
      });
      if (state?.tileX !== step.tileX || state?.tileY !== step.tileY) break;
    }
    await tap('ArrowRight', 'ArrowRight', 39);
    map0InteractionApproach = await observe('map0-marker-8-type2-approach');
    await saveScreenshot('03-map0-marker8-approach.png');
    await tap('Enter', 'Enter', 13);
    map0InteractionState = await waitFor((state) => state?.mapId === 0 &&
      state?.tileX === 18 && state?.tileY === 24 && state?.runtime?.dialogueOpen === true, {
      timeoutMs: 5000,
      label: 'map0-marker-8-type2-dialogue',
    });
    await observe('map0-marker-8-type2-dialogue');
    await saveScreenshot('04-map0-marker8-dialogue.png');
  }
  let map27Arrival = null;
  let combatObservation = null;
  let pursuitObservation = null;
  if (routeTarget === 'map27' || routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit' || routeTarget === 'map27-combat' || routeTarget === 'map27-combat-cycle' || routeTarget === 'map27-mobile-touch') {
    map27Arrival = await followRecordedMap0RouteToMap27();
  }
  if (routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit') {
    pursuitObservation = await approachAndSampleMap27Pursuit();
  }
  if (routeTarget === 'map27-combat' || routeTarget === 'map27-combat-cycle' || routeTarget === 'map27-mobile-touch') {
    combatObservation = await approachAndAttackMap27Enemy({ touch: routeTarget === 'map27-mobile-touch' });
  }
  const respawnObservation = routeTarget === 'map27-combat-cycle'
    ? await waitForMap27EnemyRespawn(combatObservation.targetOrder)
    : null;
  const finalState = routeTarget === 'map-preview'
    ? await readRuntime()
    : routeTarget === 'map0' ? afterMap0
      : routeTarget === 'map0-reentry' ? houseReentry
        : routeTarget === 'map0-interaction' ? map0InteractionState : await readRuntime();
  const errors = cdpEvents.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const browserStorageAccesses = await cdp.evaluate('window.__heroesLoreStorageCalls ?? []');
  const expectedFinalMap = routeTarget === 'map-preview'
    ? (map53BluebrickChain || map59FullChain ? 13 : map59YesChoiceBranch ? 12 :
      map54ToMap13Chain ? 13 : map54CurrentCellExit ? 59 : mapPreviewExitMapId ?? mapPreviewId)
    : routeTarget === 'map0-reentry' ? 64
      : routeTarget === 'map0-interaction' ? 0
      : routeTarget === 'map0' || routeTarget === 'map0-mobile-touch' ? 0 : 27;
  const isPursuitRoute = routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit';
  const mapPreviewReady = routeTarget !== 'map-preview' || (
    (mapPreviewExitMapId !== null || finalState?.mapPreviewReady === true) &&
    finalState?.runtime !== null && finalState?.runtime !== undefined &&
    finalState?.tileX >= 0 && finalState?.tileY >= 0 &&
    finalState?.tileX < finalState.runtime.mapSize.width &&
    finalState?.tileY < finalState.runtime.mapSize.height);
  const passed = finalState?.mapId === expectedFinalMap && finalState?.profile === profileName &&
    finalState?.level === (profileName === 'max-level' ? 99 : 1) && (isPursuitRoute
      ? finalState?.hp > 0 && pursuitObservation?.observedPlayerTarget === true &&
        pursuitObservation?.observedWalkingState === true && pursuitObservation?.sampleCount >= 100 &&
        (routeTarget !== 'map27-damage-pursuit' || pursuitObservation?.enemyAttackObserved === true &&
          pursuitObservation?.playerHpDamageObserved === true && pursuitObservation?.playerHpRemainedPositive === true)
      : observeMapPreviewEnemy
        ? enemyObservation?.attackAnimationObserved === true && enemyObservation?.hitResolvedDuringAttack === true &&
          enemyObservation?.playerHpRemainedPositive === true &&
          (profileName !== 'damage-survival' || enemyObservation.playerHpMinimum < enemyObservation.playerHpStart)
      : map27WeaponProcStatusTest
        ? weaponProcStatusObservation?.passed === true
      : map13AuProcResourceTest
        ? map13AuProcResourceObservation?.passed === true
      : map27WeaponProcDamageTest
        ? weaponProcDamageObservation?.passed === true
      : map27WeaponProcResourceTest
        ? weaponProcResourceObservation?.passed === true
      : map27PoisonTickTest
        ? poisonTickObservation?.passed === true
      : map37ClassSixMultiTargetTest
        ? map37ClassSixMultiTargetObservation?.passed === true
      : map37ClassSixTripleTargetTest
        ? map37ClassSixTripleTargetObservation?.passed === true
      : map37ClassSixLightFollowupTest
        ? map37ClassSixLightFollowupObservation?.passed === true
      : map37ClassSixHeavyStage4SweepTest
        ? map37ClassSixHeavyStage4SweepObservation?.passed === true
      : map27BasicDamageFormulaTest
        ? combatObservation?.enemyId === 24 && combatObservation?.targetBefore?.hp === 43 &&
          combatObservation?.damage === 11 && combatObservation?.playerBefore?.level === 1 &&
          combatObservation?.playerBefore?.hp === combatObservation?.playerBefore?.maxHp &&
          combatObservation?.playerBefore?.maxHp > 720 && combatObservation?.playerAfter?.hp > 0
        : map59NoChoiceBranch
          ? map59NoChoiceObservation?.after?.hp > 0
        : map59YesChoiceBranch
          ? map59YesChoiceObservation?.after?.hp > 0
        : map59FullChain
          ? map59FullChainObservation?.after?.hp > 0
        : map54ItemPrize
          ? map54ItemPrizeObservation?.passed === true
        : map54ToMap13Chain
          ? map54ToMap13ChainObservation?.passed === true && browserStorageAccesses?.length === 0
        : map54CurrentCellExit
          ? map54CurrentCellExitObservation?.passed === true && browserStorageAccesses?.length === 0
        : map53BluebrickChain
          ? map53BluebrickObservation?.passed === true
      : mapPreviewMovementSmoke
        ? mapPreviewMovementObservation?.passed === true && finalState?.hp > 0
        : mapPreviewExitMapId !== null
          ? mapPreviewRoute?.arrived === true && finalState?.hp > 0
      : mapPreviewIdleObservationMs > 0
        ? mapPreviewIdleObservation?.passed === true
      : map27BasicDamageFormulaTest
        ? finalState?.hp > 0
        : finalState?.hp === before?.hp) && mapPreviewReady && errors.length === 0 &&
    (routeTarget !== 'map0-reentry' || afterMap0?.mapId === 0 && houseReentry?.mapId === 64 &&
      houseReentry.tileX === 10 && houseReentry.tileY === 18 && houseReentry.hp === before.hp) &&
    (routeTarget !== 'map0-interaction' || afterMap0?.mapId === 0 &&
      map0InteractionApproach?.mapId === 0 && map0InteractionApproach.tileX === 18 &&
      map0InteractionApproach.tileY === 24 && map0InteractionApproach.runtime?.player?.direction === 4 &&
      map0InteractionState?.mapId === 0 && map0InteractionState.tileX === 18 &&
      map0InteractionState.tileY === 24 && map0InteractionState.runtime?.dialogueOpen === true &&
      map0InteractionState.hp === before.hp) &&
    (!map66NoChoiceBranch || map66NoChoiceObservation?.passed === true) &&
    (!map59NoChoiceBranch || map59NoChoiceObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map59YesChoiceBranch || map59YesChoiceObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map59FullChain || map59FullChainObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map54ItemPrize || map54ItemPrizeObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map54CurrentCellExit || map54CurrentCellExitObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map54ToMap13Chain || map54ToMap13ChainObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!map53BluebrickChain || map53BluebrickObservation?.passed === true &&
      browserStorageAccesses?.length === 0) &&
    (!['map27-combat', 'map27-combat-cycle', 'map27-mobile-touch'].includes(routeTarget) || combatObservation?.attackChanged === true) &&
    (routeTarget !== 'map27-mobile-touch' || combatObservation?.touchControl?.activeWhileHeld === true &&
      combatObservation?.touchControl?.coarsePointer === true && combatObservation?.touchControl?.maxTouchPoints >= 1) &&
    (routeTarget !== 'map0-mobile-touch' || mobileTouchExit?.activeWhileHeld === true &&
      mobileTouchExit?.coarsePointer === true && mobileTouchExit?.maxTouchPoints >= 1) &&
    (routeTarget !== 'map27-combat-cycle' || respawnObservation?.revived?.enemy?.state === 'alive');
  const result = {
    id: milestoneId,
    profile: profileName,
    route: routeTarget === 'map0-interaction'
      ? 'visible-UI-New-Game -> max-level Map64 -> Map0/(26,24) -> ordinary Down/Left/Up route to (18,24) -> face Right and Enter on Map0 marker 8 type-2 interaction'
      : routeTarget === 'map0-reentry'
      ? 'visible-UI-New-Game -> max-level Map64 -> held Down to Map0/(26,24) -> held Up across marker -5 -> Map64/(10,18)'
      : routeTarget === 'map27-damage-pursuit'
      ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> damage-survival pursuit and attack trace'
      : routeTarget === 'map27-combat' && map27BasicDamageFormulaTest
      ? 'visible New Game -> Map64 -> Map0 -> Map27 -> level-1 damage-survival basic attack against data0 enemy 24'
      : routeTarget === 'map27-mobile-touch'
      ? 'mobile-emulated-UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> Attack touch control'
      : routeTarget === 'map0-mobile-touch'
        ? 'mobile-emulated-UI-key-input-New-Game -> Map64 -> Down touch control -> Map0'
      : routeTarget === 'map27-combat-cycle'
      ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> light attack -> enemy respawn'
      : routeTarget === 'map-preview' && mapPreviewExitMapId !== null
        ? 'visible-UI-New-Game -> DEV max-level Map27 preview -> live north exit event -> Map17'
      : routeTarget === 'map-preview' && map37ClassSixMultiTargetTest
        ? 'visible-UI-New-Game -> DEV max-level Map37 fixture -> Numpad7 class-6 heavy stage-0 fan -> verify two enemies lose HP'
      : routeTarget === 'map-preview' && map37ClassSixTripleTargetTest
        ? 'visible-UI-New-Game -> DEV max-level Map37 fixture -> Numpad7 class-6 heavy stage-0 fan -> verify all three source-cell targets lose HP'
      : routeTarget === 'map-preview' && map37ClassSixLightFollowupTest
        ? 'visible-UI-New-Game -> DEV max-level Map37 fixture -> Numpad5 light stage 0 then queued Numpad5 stage 1 -> verify stage-1 fan damage on all three source cells'
      : routeTarget === 'map-preview' && map37ClassSixHeavyStage4SweepTest
        ? 'visible-UI-New-Game -> DEV max-level Map37 eight-target fixture -> Numpad5 x4 light stages then queued Numpad7 heavy stage 4 -> verify eight-cell sweep'
      : routeTarget === 'map-preview' && mapPreviewMovementSmoke
        ? 'visible-UI-New-Game -> DEV max-level map preview -> one ordinary cardinal movement step'
      : routeTarget === 'map-preview' && map37ClassSixMultiTargetTest
        ? 'visible-UI-New-Game -> DEV max-level Map37 fixture -> Numpad7 class-6 heavy stage-0 fan -> verify two enemies lose HP'
      : routeTarget === 'map-preview' && map27WeaponProcDamageTest
        ? 'visible-UI-New-Game -> DEV max-level Map27 proc-code-8 fixture -> Numpad5 attack -> observe maxHP/25 cost and surviving target'
      : routeTarget === 'map-preview' && map27WeaponProcResourceTest
        ? `visible-UI-New-Game -> DEV max-level Map27 proc-code-${map27WeaponProcResource === 'sp' ? '3' : '4'} fixture -> Numpad5 attack -> observe ${map27WeaponProcResource.toUpperCase()} drain`
      : routeTarget === 'map-preview' && map13AuProcResourceTest
        ? `visible-UI-New-Game -> DEV max-level Map13 source-AQ fixture -> source-au proc-code-${map13AuProcResource === 'sp' ? 3 : 4} hit -> observe ${map13AuProcResource === 'sp' ? '30% SP drain' : 'half-damage HP cost'}`
      : routeTarget === 'map-preview' && map27WeaponProcStatusTest
        ? `visible-UI-New-Game -> DEV max-level Map27 proc-status fixture -> Numpad5 attacks with source proc weapon -> observe enemy ${map27WeaponProcStatusDefense ? 'defense-down' : map27WeaponProcStatusSlow || map27WeaponProcStatusSlowCooldown ? 'slowdown' : 'sleep'} status${map27WeaponProcStatusSlowCooldown ? ' and doubled cooldown' : ''}`
      : routeTarget === 'map-preview' && map27PoisonTickTest
        ? 'visible-UI-New-Game -> DEV max-level Map27 direct status-3 fixture -> observe periodic poison damage and expiry'
      : routeTarget === 'map-preview' && map66NoChoiceBranch
        ? 'visible-UI-New-Game -> DEV max-level Map66 preview -> visible walk to Lesley -> select No -> script 1 ends without quest/item changes'
      : routeTarget === 'map-preview' && map59NoChoiceBranch
        ? 'visible-UI-New-Game -> DEV max-level Map59 preview -> walk to type-3 marker 2 -> select No -> script 1 ends without flag/item changes'
      : routeTarget === 'map-preview' && map59YesChoiceBranch
        ? 'visible-UI-New-Game -> DEV max-level Map59 preview with key -> marker 2 -> select Yes -> key consumed -> Map12/(13,13)'
      : routeTarget === 'map-preview' && map59FullChain
        ? 'visible-UI-New-Game -> DEV max-level Map59 preview with required items -> choose Yes -> Map12 script 0 -> Map13/(10,10)'
      : routeTarget === 'map-preview' && map54ItemPrize
        ? 'visible-UI-New-Game -> DEV max-level Map54 preview -> walk to NPC at (17,9) -> receive item 21/3 -> repeat interaction after flag 40'
      : routeTarget === 'map-preview' && map54ToMap13Chain
        ? 'visible New Game UI -> DEV max-level Map54 checkpoint with flags 0/42 and required items -> marker 8/script 13 -> marker -6/script 19 -> Map59 Yes -> Map12 script 0 -> Map13/(10,10)'
      : routeTarget === 'map-preview' && map54CurrentCellExit
        ? 'visible-UI-New-Game -> DEV max-level Map54/(5,13) -> marker 8 script 13 -> held Down into marker -6 -> Map59/(10,26)'
      : routeTarget === 'map-preview' && map53BluebrickChain
        ? 'visible New Game UI -> DEV max-level Map53 checkpoint flags 0/27/31/82 -> live materials/key/forge -> Map54 item reward -> Map59 Yes -> Map12 -> Map13'
      : routeTarget === 'map-preview'
        ? observeMapPreviewEnemy
          ? `visible-UI-New-Game -> DEV ${profileName} map preview ${mapPreviewId}; ${approachMapPreviewEnemy ? 'visible approach -> ' : ''}seeded live behavior-${enemyObservationTarget.behaviorType} enemy observation`
          : mapPreviewIdleObservationMs > 0
            ? `visible-UI-New-Game -> DEV ${profileName} map preview ${mapPreviewId}; ${mapPreviewIdleObservationMs}ms input-free runtime observation`
            : `visible-UI-New-Game -> DEV ${profileName} map preview ${mapPreviewId}; new-game flags, map state seeded`
      : routeTarget === 'map27-combat'
        ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> light attack'
        : routeTarget === 'map27-pursuit'
          ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> held approach -> enemy pursuit trace'
          : routeTarget === 'map27'
            ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> recorded route -> Map27'
            : 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0',
    passed,
    before,
    afterMap0,
    houseReentry,
    map0InteractionApproach,
    map0InteractionState,
    mobileTouchExit,
    map27Arrival,
    mapPreviewRoute,
    map66NoChoiceObservation,
    map59NoChoiceObservation,
    map59YesChoiceObservation,
    map59FullChainObservation,
    map54ItemPrizeObservation,
    map54CurrentCellExitObservation,
    map54ToMap13ChainObservation,
    map53BluebrickObservation,
    poisonTickObservation,
    weaponProcStatusObservation,
    weaponProcDamageObservation,
    weaponProcResourceObservation,
    map13AuProcResourceObservation,
    enemyApproach,
    combatObservation,
    pursuitObservation,
    respawnObservation,
    enemyObservation,
    mapPreviewMovementObservation,
    mapPreviewIdleObservation,
    map37ClassSixMultiTargetObservation,
    map37ClassSixTripleTargetObservation,
    map37ClassSixLightFollowupObservation,
    map37ClassSixHeavyStage4SweepObservation,
    finalState,
    browserStorageAccesses,
    observations,
    errors,
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: browserStorageAccesses.some(({ method }) =>
        ['getItem', 'key', 'length'].includes(method)),
      browserStorageWrite: browserStorageAccesses.some(({ method }) =>
        ['setItem', 'removeItem', 'clear'].includes(method)),
      browserStorageProfile: 'fresh temporary Chromium profile, removed after capture',
      gameSaveActionUsed: false,
      mapStateSeeded: routeTarget === 'map-preview',
      originalJarAccessed: false,
    },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`Held-input route did not meet verification criteria for ${routeTarget}`);
  process.stdout.write(`${JSON.stringify({
    id: result.id,
    profile: result.profile,
    passed: result.passed,
    before: { mapId: before.mapId, tile: [before.tileX, before.tileY], level: before.level, hp: before.hp },
    afterMap0: { mapId: afterMap0?.mapId, tile: [afterMap0?.tileX, afterMap0?.tileY], hp: afterMap0?.hp },
    final: { mapId: finalState?.mapId, tile: [finalState?.tileX, finalState?.tileY], level: finalState?.level, hp: finalState?.hp },
    mapPreviewRoute: mapPreviewRoute === null ? null : {
      targetMapId: mapPreviewRoute.targetMapId,
      approachTile: mapPreviewRoute.approachTile,
      routeStepCount: mapPreviewRoute.routeStepCount,
      arrived: mapPreviewRoute.arrived,
      finalTile: mapPreviewRoute.finalTile,
    },
    mapPreviewMovement: mapPreviewMovementObservation === null ? null : {
      passed: mapPreviewMovementObservation.passed,
      status: mapPreviewMovementObservation.status,
      direction: mapPreviewMovementObservation.direction ?? null,
      startTile: mapPreviewMovementObservation.startTile,
      targetTile: mapPreviewMovementObservation.targetTile,
      attempts: mapPreviewMovementObservation.attempts.length,
    },
    map66NoChoice: map66NoChoiceObservation === null ? null : {
      passed: map66NoChoiceObservation.passed,
      choiceDefault: map66NoChoiceObservation.choiceDefault,
      choiceNo: map66NoChoiceObservation.choiceNo,
      noBranchStart: map66NoChoiceObservation.noBranchStart,
      noStateMutation: map66NoChoiceObservation.noStateMutation,
      after: map66NoChoiceObservation.after,
    },
    map59NoChoice: map59NoChoiceObservation === null ? null : {
      passed: map59NoChoiceObservation.passed,
      source: map59NoChoiceObservation.source,
      routeTrace: map59NoChoiceObservation.routeTrace,
      choiceDefault: map59NoChoiceObservation.choiceDefault,
      choiceNo: map59NoChoiceObservation.choiceNo,
      noBranchStart: map59NoChoiceObservation.noBranchStart,
      noStateMutation: map59NoChoiceObservation.noStateMutation,
      after: map59NoChoiceObservation.after,
    },
    map59YesChoice: map59YesChoiceObservation === null ? null : {
      passed: map59YesChoiceObservation.passed,
      source: map59YesChoiceObservation.source,
      routeTrace: map59YesChoiceObservation.routeTrace,
      choiceDefault: map59YesChoiceObservation.choiceDefault,
      keyConsumed: map59YesChoiceObservation.keyConsumed,
      prerequisiteConsumed: map59YesChoiceObservation.prerequisiteConsumed,
      expectedFlags: map59YesChoiceObservation.expectedFlags,
      after: map59YesChoiceObservation.after,
    },
    map59FullChain: map59FullChainObservation === null ? null : {
      passed: map59FullChainObservation.passed,
      source: map59FullChainObservation.source,
      routeTrace: map59FullChainObservation.routeTrace,
      choiceDefault: map59FullChainObservation.choiceDefault,
      map12Start: map59FullChainObservation.map12Start,
      map12DialogueSkip: map59FullChainObservation.map12DialogueSkip,
      keyConsumed: map59FullChainObservation.keyConsumed,
      prerequisiteConsumed: map59FullChainObservation.prerequisiteConsumed,
      expectedFlags: map59FullChainObservation.expectedFlags,
      after: map59FullChainObservation.after,
    },
    map54ItemPrize: map54ItemPrizeObservation === null ? null : {
      passed: map54ItemPrizeObservation.passed,
      source: map54ItemPrizeObservation.source,
      routeTrace: map54ItemPrizeObservation.routeTrace,
      approach: map54ItemPrizeObservation.approach,
      dialogueAdvancePresses: map54ItemPrizeObservation.dialogueAdvancePresses,
      afterReward: map54ItemPrizeObservation.afterReward,
      afterRepeat: map54ItemPrizeObservation.afterRepeat,
    },
    map54CurrentCellExit: map54CurrentCellExitObservation === null ? null : {
      passed: map54CurrentCellExitObservation.passed,
      source: map54CurrentCellExitObservation.source,
      start: map54CurrentCellExitObservation.start,
      afterMarkerEight: map54CurrentCellExitObservation.afterMarkerEight,
      after: map54CurrentCellExitObservation.after,
    },
    map54ToMap13Chain: map54ToMap13ChainObservation === null ? null : {
      passed: map54ToMap13ChainObservation.passed,
      source: map54ToMap13ChainObservation.source,
      start: map54ToMap13ChainObservation.start,
      afterMarkerEight: map54ToMap13ChainObservation.afterMarkerEight,
      map59Arrival: map54ToMap13ChainObservation.map59Arrival,
      map59Chain: map54ToMap13ChainObservation.map59Chain,
      after: map54ToMap13ChainObservation.after,
    },
    map53BluebrickChain: map53BluebrickObservation === null ? null : {
      passed: map53BluebrickObservation.passed,
      start: map53BluebrickObservation.start,
      map53: map53BluebrickObservation.map53,
      map54: map53BluebrickObservation.map54,
      final: map53BluebrickObservation.final,
    },
    poisonTickObservation,
    map37ClassSixMultiTarget: map37ClassSixMultiTargetObservation,
    map37ClassSixTripleTarget: map37ClassSixTripleTargetObservation,
    map37ClassSixLightFollowup: map37ClassSixLightFollowupObservation,
    map37ClassSixHeavyStage4Sweep: map37ClassSixHeavyStage4SweepObservation,
    enemyApproach,
    enemyObservation: enemyObservation === null ? null : {
      target: enemyObservation.target,
      sampleCount: enemyObservation.sampleCount,
      observedDurationMs: enemyObservation.observedDurationMs,
      attackAnimationObserved: enemyObservation.attackAnimationObserved,
      hitResolvedDuringAttack: enemyObservation.hitResolvedDuringAttack,
      playerHpStart: enemyObservation.playerHpStart,
      playerHpMinimum: enemyObservation.playerHpMinimum,
      playerHpEnd: enemyObservation.playerHpEnd,
      playerHpRemainedPositive: enemyObservation.playerHpRemainedPositive,
    },
    weaponProcStatus: weaponProcStatusObservation,
    weaponProcDamage: weaponProcDamageObservation,
    weaponProcResource: weaponProcResourceObservation,
    poisonTickObservation,
    basicAttackDamageFormula: map27BasicDamageFormulaTest ? {
      sourceAttackPower: 16,
      enemyId: 24,
      sourceEnemyDefense: 5,
      playerElement: 0,
      damageExpected: 11,
      damageObserved: combatObservation?.damage ?? null,
      playerLevel: combatObservation?.playerBefore?.level ?? null,
      playerHp: combatObservation?.playerBefore?.hp ?? null,
      playerMaxHp: combatObservation?.playerBefore?.maxHp ?? null,
    } : null,
    pursuit: pursuitObservation === null ? null : {
      sampleCount: pursuitObservation.sampleCount,
      durationMs: pursuitObservation.actualDurationMs,
      enemyTileCount: pursuitObservation.enemyTileCount,
      enemyStates: pursuitObservation.enemyStates,
      pursuitTargetCounts: pursuitObservation.pursuitTargetCounts,
      observedPlayerTarget: pursuitObservation.observedPlayerTarget,
      observedWalkingState: pursuitObservation.observedWalkingState,
      enemyAttackObserved: pursuitObservation.enemyAttackObserved,
      playerHpMinimum: pursuitObservation.playerHpMinimum,
      playerHpDamageObserved: pursuitObservation.playerHpDamageObserved,
      playerHpRemainedPositive: pursuitObservation.playerHpRemainedPositive,
    },
    browserErrors: errors.length,
    browserStorageAccesses,
    artifacts: routeTarget === 'map27-damage-pursuit'
      ? `reference/screenshots/web-render/M992-damage-survival-map27-pursuit/attempt-${attemptNumber}`
      : routeTarget === 'map0-interaction'
        ? `reference/screenshots/web-render/M1041-map0-type2-interaction/attempt-${attemptNumber}`
      : routeTarget === 'map0-reentry'
        ? `reference/screenshots/web-render/M1040-house-reentry/attempt-${attemptNumber}`
      : routeTarget === 'map0-mobile-touch'
      ? `reference/screenshots/web-render/M991-mobile-touch-map64-exit/attempt-${attemptNumber}`
      : routeTarget === 'map27-mobile-touch'
      ? `reference/screenshots/web-render/M990-mobile-touch-map27-attack/attempt-${attemptNumber}`
      : routeTarget === 'map-preview'
      ? (map37ClassSixHeavyStage4SweepTest
        ? `reference/screenshots/web-render/M1128-map37-class6-heavy-stage4-sweep/attempt-${attemptNumber}`
        : map37ClassSixLightFollowupTest
        ? `reference/screenshots/web-render/M1127-map37-class6-light-followup/attempt-${attemptNumber}`
        : map37ClassSixTripleTargetTest
        ? `reference/screenshots/web-render/M1126-map37-class6-triple-target/attempt-${attemptNumber}`
        : map37ClassSixMultiTargetTest
        ? `reference/screenshots/web-render/M1125-map37-class6-multitarget/attempt-${attemptNumber}`
        : map13AuProcResourceTest
        ? `reference/screenshots/web-render/${milestoneId}-map13-au-proc-${map13AuProcResource}/attempt-${attemptNumber}`
        : map27PoisonTickTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-poison-tick/attempt-${attemptNumber}`
        : map27WeaponProcDamageTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-damage/attempt-${attemptNumber}`
        : map27WeaponProcResourceTest
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-${map27WeaponProcResource}/attempt-${attemptNumber}`
        : map27WeaponProcStatusDefense
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-status-defense/attempt-${attemptNumber}`
        : map27WeaponProcStatusSlowCooldown
        ? `reference/screenshots/web-render/${milestoneId}-map27-weapon-proc-status-slow-cooldown/attempt-${attemptNumber}`
        : map27WeaponProcStatusSlow
        ? `reference/screenshots/web-render/M1083-map27-weapon-proc-status-slow/attempt-${attemptNumber}`
        : map66NoChoiceBranch
        ? `reference/screenshots/web-render/M1042-map66-reference-book-no/attempt-${attemptNumber}`
        : map59NoChoiceBranch
          ? `reference/screenshots/web-render/M1043-map59-choice-no/attempt-${attemptNumber}`
        : map59YesChoiceBranch
          ? `reference/screenshots/web-render/M1044-map59-choice-yes/attempt-${attemptNumber}`
        : map59FullChain
          ? `reference/screenshots/web-render/M1045-map59-to-map13/attempt-${attemptNumber}`
        : map54ItemPrize
          ? `reference/screenshots/web-render/M1046-map54-item-prize/attempt-${attemptNumber}`
        : map53BluebrickChain
          ? `reference/screenshots/web-render/M1047-map53-bluebrick-chain/attempt-${attemptNumber}`
        : map54ToMap13Chain
          ? `reference/screenshots/web-render/M1051-map54-to-map13-chain/attempt-${attemptNumber}`
        : map54CurrentCellExit
          ? `reference/screenshots/web-render/M1049-map54-current-cell-exit-latch/attempt-${attemptNumber}`
        : mapPreviewExitMapId === 17
        ? `reference/screenshots/web-render/M1023-map27-to-map17/attempt-${attemptNumber}`
        : `reference/screenshots/web-render/${milestoneId}-map-preview-${mapPreviewId}/attempt-${attemptNumber}`)
      : routeTarget === 'map27-combat-cycle'
      ? 'reference/screenshots/web-render/M988-max-level-map27-respawn'
      : routeTarget === 'map27'
        ? 'reference/screenshots/web-render/M986-max-level-map0-map27'
      : routeTarget === 'map27-combat'
          ? (map27BasicDamageFormulaTest
            ? `reference/screenshots/web-render/M1108-map27-basic-damage-formula/attempt-${attemptNumber}`
            : 'reference/screenshots/web-render/M987-max-level-map27-combat')
          : routeTarget === 'map27-pursuit'
            ? `reference/screenshots/web-render/M989-max-level-map27-pursuit/attempt-${attemptNumber}`
            : 'reference/screenshots/web-render/M978-max-level-held-input',
  })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
  const exited = () => browserProcess.exitCode !== null || browserProcess.signalCode !== null;
  const waitForExit = (timeoutMs) => new Promise((resolvePromise) => {
    if (exited()) return resolvePromise(true);
    const timeout = setTimeout(() => resolvePromise(false), timeoutMs);
    browserProcess.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise(true);
    });
  });
  if (browserProcess !== undefined && !exited()) {
    browserProcess.kill('SIGTERM');
    if (!await waitForExit(4000)) {
      browserProcess.kill('SIGKILL');
      if (!await waitForExit(4000)) throw new Error('Owned Chromium did not exit after SIGKILL');
    }
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await run();
} catch (error) {
  const latestRuntime = await readRuntime().catch(() => null);
  const browserErrors = cdpEvents.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  await saveScreenshot('failure-state.png').catch(() => {});
  const partial = {
    id: milestoneId,
    profile: profileName,
    passed: false,
    observations,
    latestRuntime,
    browserErrors,
    error: error instanceof Error ? error.message : String(error),
    browser: { stderr: chromeStderr.slice(-4000) },
  };
  await mkdir(outputDir, { recursive: true });
  const resultPath = join(outputDir, 'result.json');
  let hasDetailedResult = false;
  try {
    const existingResult = JSON.parse(await readFile(resultPath, 'utf8'));
    hasDetailedResult = existingResult.id === milestoneId && typeof existingResult.passed === 'boolean';
  } catch {}
  await writeFile(
    hasDetailedResult ? join(outputDir, 'probe-error.json') : resultPath,
    `${JSON.stringify(partial, null, 2)}\n`,
  );
  const latest = observations.at(-1);
  const latestState = latest?.state;
  process.stderr.write(`${JSON.stringify({
    id: milestoneId,
    profile: profileName,
    attemptNumber,
    passed: false,
    error: partial.error,
    observationCount: observations.length,
    latestObservation: latest === undefined ? null : {
      label: latest.label,
      state: latestState === null || latestState === undefined ? null : {
        mapId: latestState.mapId,
        tileX: latestState.tileX,
        tileY: latestState.tileY,
        hp: latestState.hp,
        level: latestState.level,
      },
    },
  })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
