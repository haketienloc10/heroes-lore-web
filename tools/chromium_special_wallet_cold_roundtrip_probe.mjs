#!/usr/bin/env node

/** Import a synthetic nonzero `/o` wallet package, save through the UI, and cold-load it. */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const attempt = Number(process.env.HEROES_LORE_M1131_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1131 attempt must be from 1 through 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const playwrightPackage = JSON.parse(await (await import('node:fs/promises')).readFile(
  join(resolve(playwrightEntry, '..'), 'package.json'), 'utf8',
));
const executablePath = process.env.HEROES_LORE_CHROME_BIN;
const baseUrl = process.env.HEROES_LORE_BASE_URL ?? 'http://127.0.0.1:5174/';
const outputDir = join(root, `reference/screenshots/web-render/M1131-special-wallet-cold-roundtrip/attempt-${attempt}`);
const profileRoot = await mkdtemp(join(tmpdir(), 'heroes-lore-m1131-'));
const errors = [];
const observations = [];
let context = null;
let page = null;
let result;

async function readState() {
  return page.evaluate(() => {
    const game = window.__heroesLoreDebugGame;
    const scenes = game?.scene.getScenes(true) ?? [];
    const startup = scenes.find((scene) => scene.sys.settings.key === 'StartupFlowScene');
    const world = scenes.find((scene) => scene.sys.settings.key === 'WorldScene');
    let worldSave = null;
    try {
      const state = world?.createSaveState?.();
      if (state !== undefined) worldSave = {
        mapId: state.mapId,
        tileX: state.tileX,
        tileY: state.tileY,
        level: state.hud.level,
        hp: state.hud.hp,
        maxHp: state.hud.maxHp,
        wallet: state.wallet,
        specialWallet: state.specialWallet,
      };
    } catch {}
    return {
      startupPage: startup?.page ?? null,
      selectedMenu: startup?.selectedMenu ?? null,
      startupMessage: startup?.loadGameMessage ?? null,
      savedGames: startup?.savedGames?.map((save) => ({
        heroClassId: save.heroClassId,
        mapId: save.mapId,
        tileX: save.tileX,
        tileY: save.tileY,
        level: save.hud.level,
        wallet: save.wallet,
        specialWallet: save.specialWallet,
      })) ?? [],
      systemMenuVisible: world?.systemMenuVisible ?? false,
      systemMenuMessage: world?.systemMenuMessage ?? null,
      worldActive: world !== undefined,
      worldSave,
      browserStorageAccesses: window.__heroesLoreStorageAccesses ?? [],
    };
  });
}

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readState();
    if (predicate(state)) {
      observations.push({ label, state });
      return state;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function capture(label, filename) {
  const state = await readState();
  await page.screenshot({ path: join(outputDir, filename) });
  observations.push({ label, screenshot: filename, state });
  return state;
}

async function openProfile(phase) {
  context = await chromium.launchPersistentContext(profileRoot, {
    headless: true,
    ...(executablePath === undefined ? {} : { executablePath }),
    viewport: { width: 780, height: 600 },
    deviceScaleFactor: 1,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
  });
  await context.addInitScript(() => {
    const accesses = [];
    Object.defineProperty(window, '__heroesLoreStorageAccesses', { value: accesses });
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        accesses.push({ method, key: method === 'key' ? null : (args[0] ?? null) });
        return original.apply(this, args);
      };
    }
  });
  page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', (error) => errors.push({ phase, kind: 'page-error', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ phase, kind: 'console-error', text: message.text() });
  });
  page.on('requestfailed', (request) => errors.push({
    phase, kind: 'request-failed', url: request.url(), failure: request.failure()?.errorText ?? null,
  }));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#game canvas', { timeout: 30000 });
  await waitFor((state) => state.startupPage !== null, `${phase} StartupFlowScene`);
}

async function reachMenu() {
  let state = await readState();
  for (let count = 0; count < 5 && state.startupPage !== 'menu'; count += 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    state = await readState();
  }
  return waitFor((candidate) => candidate.startupPage === 'menu', 'title menu');
}

async function clickCanvas(logicalX, logicalY) {
  const canvas = await page.locator('#game canvas').boundingBox();
  if (canvas === null) throw new Error('Game canvas is unavailable for visible input');
  await page.mouse.click(
    canvas.x + canvas.width * logicalX / 240,
    canvas.y + canvas.height * logicalY / 320,
  );
}

async function openLoadGame() {
  // Select the visible Load Game row with the same canvas pointer path used by touch input.
  await clickCanvas(120, 123);
  return waitFor((state) => state.startupPage === 'load-game', 'visible Load Game screen');
}

async function createSyntheticPackage() {
  return page.evaluate(async () => {
    const { serializeSourceRmsPackage } = await import('/src/world/source-rms-package.ts');
    const skill = (skillId) => ({
      skillId,
      skillRank: 1,
      skillExperience: 0,
      skillLevelSlotOne: 0,
      skillLevelSlotThree: null,
    });
    return serializeSourceRmsPackage({
      version: 1,
      savedAt: 1,
      mapId: 64,
      tileX: 9,
      tileY: 8,
      direction: 2,
      playthroughMode: 0,
      completionPoints: 0,
      playTimeSeconds: 0,
      gameFlags: [0],
      questFlags: [],
      guardianIndices: [0, 1],
      heroClassId: 6,
      attributes: { power: 1, hp: 1, agility: 1, will: 1 },
      skillIds: [0, 1],
      activeSkillId: 0,
      skillProgress: [skill(0), skill(1)],
      comboLimit: 1,
      hud: {
        hp: 394392,
        maxHp: 394392,
        sp: 394392,
        maxSp: 394392,
        experience: 0,
        experienceToNextLevel: 1,
        level: 99,
        attributePoints: 0,
        selectedItemCount: 0,
        selectedItemCategory: 7,
      },
      wallet: 300,
      specialWallet: 1234,
      inventory: [],
      specialInventory: [],
      equipmentSlots: [null, null, null, null, null],
    });
  });
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await openProfile('import-and-save');
  await capture('fresh title screen', '00-title-screen.png');
  await reachMenu();
  await capture('title menu before Load Game', '01-title-menu.png');
  const emptyLoadPage = await openLoadGame();
  await capture('Load Game screen in a fresh temporary profile', '02-load-game-empty.png');

  const packageText = await createSyntheticPackage();
  await clickCanvas(60, 310);
  const picker = page.locator('input[type="file"][accept*=".hlrms.json"]');
  await picker.waitFor({ state: 'attached', timeout: 10000 });
  await picker.setInputFiles({
    name: 'm1131-synthetic-special-wallet.hlrms.json',
    mimeType: 'application/json',
    buffer: Buffer.from(packageText),
  });
  const imported = await waitFor((state) => state.startupMessage === 'Source save imported. Press Enter to load it.',
    'visible import confirmation');
  await capture('synthetic source package imported through the visible picker', '03-package-imported.png');
  if (imported.savedGames.length !== 1 || imported.savedGames[0]?.specialWallet !== 1234) {
    throw new Error(`Imported roster does not preserve the special wallet: ${JSON.stringify(imported.savedGames)}`);
  }

  await page.keyboard.press('Enter');
  const afterImportLoad = await waitFor((state) => state.worldActive && state.worldSave !== null,
    'WorldScene after importing and loading the source package');
  await capture('Map64 after importing and loading the source package', '04-after-import-load.png');
  if (afterImportLoad.worldSave?.specialWallet !== 1234) {
    throw new Error(`WorldScene did not restore special wallet: ${JSON.stringify(afterImportLoad.worldSave)}`);
  }

  await page.keyboard.press('Escape');
  await waitFor((state) => state.systemMenuVisible, 'System menu after loading the package');
  for (let index = 0; index < 3; index += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const saved = await waitFor((state) => state.systemMenuMessage === 'Game saved.', 'visible Game saved confirmation');
  await capture('normal UI Save Game confirmation', '05-game-saved.png');
  if (saved.worldSave?.specialWallet !== 1234) {
    throw new Error(`Saved scene lost special wallet: ${JSON.stringify(saved.worldSave)}`);
  }

  const importPhaseStorageAccesses = await readState().then((state) => state.browserStorageAccesses);
  await context.close();
  context = null;
  page = null;

  await openProfile('cold-load');
  await reachMenu();
  const coldLoadPage = await openLoadGame();
  await capture('cold-process Load Game roster', '06-cold-load-roster.png');
  await page.keyboard.press('Enter');
  const coldLoaded = await waitFor((state) => state.worldActive && state.worldSave !== null,
    'WorldScene after cold-process Load Game');
  await capture('Map64 after cold-process Load Game', '07-cold-load-map64.png');
  const coldStorageAccesses = coldLoaded.browserStorageAccesses;
  const noErrors = errors.length === 0;
  const passed = emptyLoadPage.savedGames.length === 0 && coldLoadPage.savedGames.length === 1 &&
    coldLoadPage.savedGames[0]?.specialWallet === 1234 &&
    afterImportLoad.worldSave?.specialWallet === 1234 && saved.worldSave?.specialWallet === 1234 &&
    coldLoaded.worldSave?.specialWallet === 1234 && coldLoaded.worldSave?.mapId === 64 && noErrors;
  result = {
    id: 'M1131',
    attempt,
    passed,
    flow: 'synthetic max-level RMS package import through Load Game UI -> normal System/Save Game -> close Chromium -> visible cold Load Game',
    sourcePackage: { generatedInPageFromCurrentCodec: true, savedToDisk: false, specialWallet: 1234 },
    initialProfile: { disposable: true, noSavedGame: emptyLoadPage.savedGames.length === 0 },
    import: { roster: imported.savedGames, loaded: afterImportLoad.worldSave },
    saveAction: { confirmation: saved.systemMenuMessage, state: saved.worldSave },
    coldLoad: { roster: coldLoadPage.savedGames, state: coldLoaded.worldSave },
    storage: {
      importAndSaveApiCalls: importPhaseStorageAccesses,
      coldLoadApiCalls: coldStorageAccesses,
      valuesRecorded: false,
      profile: 'fresh temporary Chromium profile, deleted after capture',
    },
    browser: { product: 'Chromium', playwrightVersion: playwrightPackage.version, viewport: [780, 600] },
    errors,
    observations,
    restrictions: {
      preexistingSaveAccessed: false,
      browserStorageAccessedByHarness: false,
      gameSaveActionUsed: true,
      testGeneratedSaveOnly: true,
      originalJarAccessed: false,
    },
  };
}

try {
  await run();
} catch (error) {
  result = {
    id: 'M1131',
    attempt,
    passed: false,
    error: error instanceof Error ? error.message : String(error),
    browser: { product: 'Chromium', playwrightVersion: playwrightPackage.version, processOwned: true },
    errors,
    observations,
    restrictions: {
      preexistingSaveAccessed: false,
      browserStorageAccessedByHarness: false,
      testGeneratedSaveOnly: true,
      originalJarAccessed: false,
    },
  };
} finally {
  await context?.close().catch(() => {});
  await rm(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  if (result !== undefined) {
    result.temporaryProfileDeleted = true;
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
}

process.stdout.write(`${JSON.stringify({
  id: result.id,
  attempt,
  passed: result.passed,
  importedSpecialWallet: result.import?.loaded?.specialWallet ?? null,
  coldLoadedSpecialWallet: result.coldLoad?.state?.specialWallet ?? null,
  errors: result.errors?.length ?? 0,
  artifacts: `reference/screenshots/web-render/M1131-special-wallet-cold-roundtrip/attempt-${attempt}`,
})}\n`);
if (!result.passed) process.exitCode = 1;
