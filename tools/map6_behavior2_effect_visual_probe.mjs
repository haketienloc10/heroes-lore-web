#!/usr/bin/env node

/** Observe the source type-9 effect from a visible max-level New Game on Map6. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const attempt = Number(process.env.HEROES_LORE_M1133_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1133 attempt must be from 1 through 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { chromium } = await import(pathToFileURL(resolve(playwrightEntry)).href);
const playwrightPackage = JSON.parse(await readFile(join(dirname(resolve(playwrightEntry)), 'package.json'), 'utf8'));
const executablePath = process.env.HEROES_LORE_CHROME_BIN;
const appUrl = new URL(process.env.HEROES_LORE_BASE_URL ?? 'http://127.0.0.1:5174/');
appUrl.searchParams.set('testProfile', 'max-level');
appUrl.searchParams.set('testScenario', 'map-preview-6');
const outputDir = join(root, `reference/screenshots/web-render/M1133-map6-behavior2-effect/attempt-${attempt}`);
const profileRoot = await mkdtemp(join(tmpdir(), 'heroes-lore-m1133-'));
const errors = [];
const observations = [];
const effectFrames = new Map();
let context;
let page;
let result;

async function readState() {
  return page.evaluate(() => {
    const game = window.__heroesLoreDebugGame;
    const scenes = game?.scene.getScenes(true) ?? [];
    const startup = scenes.find((scene) => scene.sys.settings.key === 'StartupFlowScene');
    const world = scenes.find((scene) => scene.sys.settings.key === 'WorldScene');
    const map = world?.maps?.get(world.currentMapId);
    const playerTileX = world?.actor === undefined ? null : world.actor.x >> 4;
    const playerTileY = world?.actor === undefined ? null : world.actor.y >> 4;
    const attackEffects = (map?.enemyAttackAnimations ?? []).map((animation) => {
      const effect = world.enemyAttackEffects.get(animation.spriteId);
      const textureSet = map.enemyTextureKeys.get(animation.spriteId);
      const sourceFrame = effect?.frames[animation.frameIndex] ?? [];
      const sprite = map.enemyAttackSprites.get(animation.id);
      const renderedComponents = sprite?.list.map((image) => ({
        textureKey: image.texture?.key ?? null,
        x: image.x,
        y: image.y,
        flipX: image.flipX,
        visible: image.visible,
      })) ?? [];
      const expectedTextureKeys = sourceFrame
        .filter((component) => component.imageIndex >= 0 && textureSet?.has(component.imageIndex))
        .map((component) => textureSet.get(component.imageIndex));
      const targetEnemies = (map?.enemies ?? []).filter((enemy) =>
        enemy.enemyId === animation.spriteId && enemy.definition.behaviorType === 2);
      return {
        id: animation.id,
        spriteId: animation.spriteId,
        tileX: animation.tileX,
        tileY: animation.tileY,
        frameIndex: animation.frameIndex,
        frameCount: effect?.frameCount ?? null,
        sourceFrame,
        expectedTextureKeys,
        renderedComponents,
        textureAssetsPresent: expectedTextureKeys.map((key) => game.textures.exists(key)),
        playerTile: { x: playerTileX, y: playerTileY },
        sourceBehavior2EnemyOrders: targetEnemies.map((enemy) => enemy.sourceOrder),
        atPlayerTile: animation.tileX === playerTileX && animation.tileY === playerTileY,
        matchesSourceFrame: renderedComponents.length === expectedTextureKeys.length &&
          renderedComponents.every((component, index) =>
            component.textureKey === expectedTextureKeys[index] && component.visible),
      };
    });
    const target = map?.enemies?.find((enemy) => enemy.enemyId === 4 && enemy.sourceOrder === 5);
    return {
      startupPage: startup?.page ?? null,
      selectedMenu: startup?.selectedMenu ?? null,
      profile: world?.campaignTestProfile ?? null,
      scenario: world?.campaignTestScenario ?? null,
      mapId: world?.currentMapId ?? null,
      worldReady: map !== undefined,
      renderedObjectCount: map?.objects?.length ?? 0,
      playerTile: { x: playerTileX, y: playerTileY },
      level: world?.hudState?.level ?? null,
      hp: world?.hudState?.hp ?? null,
      maxHp: world?.hudState?.maxHp ?? null,
      targetEnemy4Order5: target === undefined ? null : {
        state: target.state,
        behaviorType: target.definition.behaviorType,
        tileX: target.tileX,
        tileY: target.tileY,
      },
      attackEffects,
      browserStorageAccesses: window.__heroesLoreStorageAccesses ?? [],
    };
  });
}

async function waitFor(predicate, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    state = await readState();
    if (predicate(state)) {
      observations.push({ label, state });
      return state;
    }
    await page.waitForTimeout(40);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function clickCanvas(x, y) {
  const canvas = await page.locator('#game canvas').boundingBox();
  if (canvas === null) throw new Error('Game canvas is unavailable for visible menu input');
  await page.mouse.click(canvas.x + canvas.width * x / 240, canvas.y + canvas.height * y / 320);
}

async function capture(label, filename, state = null) {
  await page.screenshot({ path: join(outputDir, filename) });
  observations.push({ label, screenshot: filename, state: state ?? await readState() });
}

async function startVisibleMaxLevelMap6() {
  let state = await readState();
  for (let count = 0; count < 4 && state.startupPage !== 'menu'; count += 1) {
    await clickCanvas(120, 160);
    state = await waitFor((candidate) => candidate.startupPage !== state.startupPage,
      `startup advances from ${state.startupPage}`, 5000);
  }
  await waitFor((candidate) => candidate.startupPage === 'menu', 'title menu');
  await clickCanvas(120, 107);
  await waitFor((candidate) => candidate.startupPage === 'hero', 'Ronin selection');
  await clickCanvas(120, 160);
  await waitFor((candidate) => candidate.startupPage === 'guardians', 'Guardian selection');
  await clickCanvas(80, 145);
  await page.waitForTimeout(100);
  await clickCanvas(114, 145);
  await waitFor((candidate) => candidate.startupPage === 'confirm', 'Guardian confirmation');
  await clickCanvas(120, 208);
  await waitFor((candidate) => candidate.worldReady && candidate.mapId === 6,
    'visible New Game arrival at Map6');
  return waitFor((candidate) => candidate.mapId === 6 && candidate.profile === 'max-level' &&
    candidate.level === 99 && candidate.renderedObjectCount > 0 &&
    !(candidate.playerTile.x === 22 && candidate.playerTile.y === 4),
  'settled Map6 render and max-level preview spawn');
}

async function run() {
  await mkdir(outputDir, { recursive: true });
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
  page.on('pageerror', (error) => errors.push({ kind: 'page-error', text: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console-error', text: message.text() });
  });
  page.on('requestfailed', (request) => errors.push({
    kind: 'request-failed', url: request.url(), failure: request.failure()?.errorText ?? null,
  }));
  await page.goto(appUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#game canvas', { timeout: 30000 });
  await waitFor((state) => state.startupPage !== null, 'StartupFlowScene');
  await capture('fresh startup screen', '00-title-splash.png');
  const ready = await startVisibleMaxLevelMap6();
  await capture('Map6 ready after visible New Game', '01-map6-ready.png', ready);
  if (ready.profile !== 'max-level' || ready.scenario !== 'map-preview-6' ||
    ready.level !== 99 || ready.maxHp !== 394392 || ready.hp <= 0 ||
    ready.targetEnemy4Order5?.behaviorType !== 2) {
    throw new Error(`Map6 max-level fixture did not match expectations: ${JSON.stringify(ready)}`);
  }

  const deadline = Date.now() + 12000;
  let firstEffect = null;
  while (Date.now() < deadline) {
    const state = await readState();
    for (const effect of state.attackEffects) {
      if (effect.spriteId !== 4 || effect.sourceBehavior2EnemyOrders.length === 0 || !effect.atPlayerTile) continue;
      const frames = effectFrames.get(effect.id) ?? new Map();
      if (!frames.has(effect.frameIndex)) {
        frames.set(effect.frameIndex, effect);
        effectFrames.set(effect.id, frames);
        if (effect.matchesSourceFrame && effect.textureAssetsPresent.every(Boolean)) {
          await capture(`behavior-2 type-9 effect frame ${effect.frameIndex}`,
            `02-type9-frame-${effect.frameIndex}.png`, state);
        }
      }
      if (firstEffect === null) firstEffect = effect;
    }
    const confirmed = [...effectFrames.values()].some((frames) => frames.size >= 2 &&
      [...frames.values()].every((effect) => effect.matchesSourceFrame &&
        effect.textureAssetsPresent.length === effect.expectedTextureKeys.length &&
        effect.textureAssetsPresent.every(Boolean)));
    if (confirmed) break;
    await page.waitForTimeout(25);
  }
  const finalState = await readState();
  const observedAttackAnimations = [...effectFrames.entries()].map(([id, frames]) => ({
    id,
    frames: [...frames.values()].sort((left, right) => left.frameIndex - right.frameIndex),
  }));
  const hasMultipleFrames = observedAttackAnimations.some(({ frames }) => frames.length >= 2);
  const sourceFrameMatches = observedAttackAnimations.some(({ frames }) => frames.length >= 2 &&
    frames.every((frame) => frame.matchesSourceFrame &&
      frame.textureAssetsPresent.length === frame.expectedTextureKeys.length &&
      frame.textureAssetsPresent.every(Boolean)));
  const passed = hasMultipleFrames && sourceFrameMatches && firstEffect !== null &&
    finalState.mapId === 6 && finalState.level === 99 && finalState.hp > 0 && errors.length === 0;
  result = {
    id: 'M1133',
    attempt,
    passed,
    flow: 'fresh temporary profile -> visible New Game -> Ronin -> Hestia/Ran -> DEV max-level Map6 preview -> behavior-2 type-9 effect capture',
    sourceExpectation: 'A Map6 behavior-2 attack from enemy sprite ID 4 emits a five-frame effect at the player tile; the runtime visual record does not identify which of the map placements with that ID initiated it.',
    initialState: ready,
    finalState,
    observedAttackAnimations,
    errors,
    browser: { product: 'Chromium', playwrightVersion: playwrightPackage.version, viewport: [780, 600] },
    storage: {
      apiCalls: finalState.browserStorageAccesses,
      valuesRecorded: false,
      profile: 'fresh temporary Chromium profile, deleted after capture',
    },
    restrictions: {
      preexistingSaveAccessed: false,
      browserStorageAccessedByHarness: false,
      inGameSaveLoadUsed: false,
      originalJarAccessed: false,
    },
    observations,
  };
}

try {
  await run();
} catch (error) {
  result = {
    id: 'M1133',
    attempt,
    passed: false,
    error: error instanceof Error ? error.message : String(error),
    errors,
    browser: { product: 'Chromium', playwrightVersion: playwrightPackage.version },
    restrictions: {
      preexistingSaveAccessed: false,
      browserStorageAccessedByHarness: false,
      inGameSaveLoadUsed: false,
      originalJarAccessed: false,
    },
    observations,
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
  mapId: result.finalState?.mapId ?? result.initialState?.mapId ?? null,
  attackVisualIds: result.observedAttackAnimations?.map(({ id }) => id) ?? [],
  errorCount: result.errors?.length ?? 0,
  artifacts: `reference/screenshots/web-render/M1133-map6-behavior2-effect/attempt-${attempt}`,
})}\n`);
if (!result.passed) process.exitCode = 1;
