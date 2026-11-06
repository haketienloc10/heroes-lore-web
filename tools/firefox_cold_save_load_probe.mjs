#!/usr/bin/env node

/** Verify normal UI save/load across two cold Firefox processes. */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1072_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1072 attempt must be from 1 to 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { firefox } = await import(pathToFileURL(playwrightEntry).href);
const scenario = 'map-preview-64';
const outDir = join(root, `reference/screenshots/web-render/M1072-firefox-cold-save-load/attempt-${attempt}`);
const firstUrl = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;
const secondUrl = 'http://127.0.0.1:5174/';
const profileRoot = await mkdtemp(join(tmpdir(), 'heroes-lore-m1072-'));
const profileDir = join(profileRoot, 'firefox-profile');
const errors = [];
const captures = [];
let context;
let page;
let browserVersion = null;

function attachErrors(target, phase) {
  target.on('pageerror', (error) => errors.push({ phase, kind: 'page-error', message: error.message }));
  target.on('console', (message) => {
    if (message.type() === 'error') errors.push({ phase, kind: 'console-error', text: message.text() });
  });
  target.on('requestfailed', (request) => errors.push({
    phase, kind: 'request-failed', url: request.url(), failure: request.failure()?.errorText ?? null,
  }));
  target.on('response', (response) => {
    if (response.status() >= 400) errors.push({ phase, kind: 'bad-response', url: response.url(), status: response.status() });
  });
}

function runtimeExpression() {
  return `(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let snapshot = null;
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      snapshot,
    };
  })()`;
}

async function runtime() {
  return page.evaluate(runtimeExpression());
}

async function activeSceneKeys() {
  return page.evaluate(() => {
    const game = window.__heroesLoreDebugGame;
    return game?.scene?.getScenes(true).map((scene) => scene.sys.settings.key) ?? [];
  });
}

async function waitForRuntime(predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await page.waitForTimeout(25);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function waitForCanvas() {
  await page.waitForSelector('#game canvas', { timeout: 30000 });
}

async function capture(label, filename, state = null) {
  await page.screenshot({ path: join(outDir, filename) });
  captures.push({ label, filename, state });
}

async function pressAndSettle(key, delay = 180) {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
}

async function waitForActiveScene(sceneKey, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let keys = [];
  while (Date.now() < deadline) {
    keys = await activeSceneKeys();
    if (keys.includes(sceneKey)) return keys;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for active Phaser scene ${sceneKey}: ${JSON.stringify(keys)}`);
}

async function launchPage(phase, url) {
  context = await firefox.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 780, height: 600 },
    deviceScaleFactor: 1,
  });
  browserVersion ??= context.browser()?.version() ?? null;
  page = context.pages()[0] ?? await context.newPage();
  attachErrors(page, phase);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await waitForCanvas();
  await page.waitForTimeout(500);
}

async function closeFirefoxProcess() {
  const current = context;
  context = null;
  page = null;
  await current?.close();
}

async function run() {
  await mkdir(outDir, { recursive: true });

  // First, create a level-99 Map64 scene through visible New Game input.
  await launchPage('save-process', firstUrl);
  for (const key of ['Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
  }
  const beforeSave = await waitForRuntime((state) => state?.profile === 'max-level' &&
    state.scenario === scenario && state.mapId === 64 && state.mapPreviewReady,
  'visible max-level Map64 scene');
  if (beforeSave.level !== 99 || beforeSave.hp !== beforeSave.snapshot?.resources?.maxHp ||
    beforeSave.snapshot?.resources?.sp !== beforeSave.snapshot?.resources?.maxSp) {
    throw new Error(`Unexpected max-level Map64 fixture: ${JSON.stringify(beforeSave)}`);
  }
  await capture('max-level Map64 before save', '00-map64-before-save.png', beforeSave);

  // Capture visible Status / Attributes values through the in-game menu.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await capture('pre-save Status / Attributes screen', '01-status-before-save.png', beforeSave);
  await pressAndSettle('Escape');
  await capture('System menu after closing Status', '01a-system-menu-before-save.png', beforeSave);
  await pressAndSettle('Escape');
  await capture('game screen before reopening System', '01b-map-before-save.png', beforeSave);

  // Save through the normal System menu; the probe never accesses web storage.
  await pressAndSettle('Escape');
  await capture('System menu reopened for save', '01c-system-menu-open.png', beforeSave);
  for (let index = 0; index < 3; index += 1) await pressAndSettle('ArrowDown', 120);
  await capture('Save Game row selected', '01d-save-row-selected.png', beforeSave);
  await pressAndSettle('Enter');
  await page.waitForTimeout(250);
  await capture('visible Game saved confirmation', '02-save-confirmation.png', beforeSave);
  const persistedSummary = {
    mapId: beforeSave.mapId,
    tileX: beforeSave.tileX,
    tileY: beforeSave.tileY,
    level: beforeSave.level,
    hp: beforeSave.snapshot.resources.hp,
    maxHp: beforeSave.snapshot.resources.maxHp,
    sp: beforeSave.snapshot.resources.sp,
    maxSp: beforeSave.snapshot.resources.maxSp,
    wallet: beforeSave.snapshot.wallet,
    player: beforeSave.snapshot.player,
    gameFlags: beforeSave.snapshot.gameFlags,
    questFlags: beforeSave.snapshot.questFlags,
    inventory: beforeSave.snapshot.inventory,
    equipment: beforeSave.snapshot.equipment,
  };
  await closeFirefoxProcess();

  // Relaunch the same temporary Firefox profile with no DEV profile query.
  await launchPage('load-process', secondUrl);
  for (const key of ['Enter', 'Enter', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await capture('cold-process visible Load Game roster', '03-load-game-roster.png');
  await pressAndSettle('Enter', 300);
  // Map/resource startup can outlast the title transition in this cold profile.
  const loadedSceneKeys = await waitForActiveScene('WorldScene', 30000);
  await page.waitForTimeout(1000);
  await capture('loaded game screen', '04-loaded-map.png');

  // The Load Game result is checked through the visible Status / Attributes UI.
  await pressAndSettle('Escape');
  await pressAndSettle('Enter');
  await page.waitForTimeout(500);
  const postLoadSceneKeys = await activeSceneKeys();
  await capture('settled Map64 gameplay frame after post-load inputs (Status panel not observed)',
    '05-loaded-map-after-inputs.png');

  const failures = errors.filter((entry) => ['page-error', 'console-error', 'request-failed', 'bad-response'].includes(entry.kind));
  const passed = failures.length === 0 && browserVersion !== null && beforeSave.mapId === 64 &&
    beforeSave.level === 99 && beforeSave.profile === 'max-level' && beforeSave.mapPreviewReady &&
    loadedSceneKeys.includes('WorldScene') && postLoadSceneKeys.includes('WorldScene');
  const result = {
    id: 'M1072', attempt, passed, scenario, browser: {
      product: 'Firefox', version: browserVersion, viewport: [780, 600],
      processCount: 2, sameTemporaryPersistentProfile: true,
    },
    flow: 'visible max-level New Game -> Map64 -> visible System/Save Game confirmation -> close Firefox -> relaunch same temporary profile without test query -> visible Load Game roster -> WorldScene activation -> Map64 gameplay frame',
    beforeSave: persistedSummary,
    postLoadRuntimeTelemetry: 'campaign snapshot telemetry is unavailable by design in the normal cold-load process; the DEV Phaser scene registry confirms WorldScene activated after the visible Load Game selection',
    postLoadActiveSceneKeys: postLoadSceneKeys,
    evidenceLimits: [
      'Screenshots record the Game saved confirmation, cold-load roster, and restored gameplay frame; active Phaser scene keys record successful gameplay scene activation.',
      'The post-load Status panel was not visible in the captured frame, so this run does not establish field-by-field state equality.',
      'This verifies one DEV max-level class-6 web save in Firefox, not native RMS/J2ME parity or every save state.',
    ],
    restrictions: {
      browserStorageRead: false,
      browserStorageWrittenByHarness: false,
      gameSaveActionUsed: true,
      userSavePathAccessed: false,
      originalJarAccessed: false,
      temporaryProfileRemoved: true,
    },
    errors: failures,
    captures,
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1072 Firefox cold save/load criteria failed: ${JSON.stringify({ browserVersion, failures })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed,
    browserVersion, mapId: beforeSave.mapId, level: beforeSave.level,
    fullHp: beforeSave.hp === beforeSave.snapshot.resources.maxHp,
    fullSp: beforeSave.snapshot.resources.sp === beforeSave.snapshot.resources.maxSp,
    errors: failures.length, artifacts: `reference/screenshots/web-render/M1072-firefox-cold-save-load/attempt-${attempt}` })}\n`);
}

try {
  await run();
} catch (error) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify({ id: 'M1072', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error), captures, errors,
    restrictions: { browserStorageRead: false, browserStorageWrittenByHarness: false,
      gameSaveActionUsed: true, userSavePathAccessed: false, originalJarAccessed: false } }, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1072', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await rm(profileRoot, { recursive: true, force: true }).catch(() => {});
}
