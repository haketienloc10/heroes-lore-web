#!/usr/bin/env node

/** Verify the visible max-level New Game house route in Playwright WebKit. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1117_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1117 attempt must be from 1 to 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { webkit } = await import(pathToFileURL(playwrightEntry).href);
const playwrightPackage = JSON.parse(await readFile(join(dirname(playwrightEntry), 'package.json'), 'utf8'));
const webkitExecutable = process.env.HEROES_LORE_WEBKIT_EXECUTABLE;

const outputDir = join(root, `reference/screenshots/web-render/M1117-webkit-newgame-route/attempt-${attempt}`);
const url = 'http://127.0.0.1:5174/?testProfile=max-level';
const errors = [];
const observations = [];
let browser;
let context;
let page;

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
      snapshot,
    };
  })()`;
}

async function runtime() {
  return page.evaluate(runtimeExpression());
}

async function waitForRuntime(predicate, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) {
      observations.push({ label, state });
      return state;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function capture(label, filename) {
  const state = await runtime();
  await page.screenshot({ path: join(outputDir, filename) });
  observations.push({ label, state, screenshot: filename });
}

async function holdDownUntilMap0(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  await page.keyboard.down('ArrowDown');
  try {
    while (Date.now() < deadline) {
      state = await runtime();
      if (state?.mapId === 0 && state.tileX === 26 && state.tileY === 24) {
        observations.push({ label: 'held Down transfers from Map64 to Map0', state });
        return state;
      }
      await page.waitForTimeout(25);
    }
  } finally {
    await page.keyboard.up('ArrowDown');
  }
  throw new Error(`Timed out on held Down from Map64: ${JSON.stringify(state)}`);
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  browser = await webkit.launch({
    headless: true,
    ...(webkitExecutable === undefined ? {} : { executablePath: webkitExecutable }),
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push({ kind: 'page-error', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console-error', text: message.text() });
  });
  page.on('requestfailed', (request) => errors.push({
    kind: 'request-failed', url: request.url(), failure: request.failure()?.errorText ?? null,
  }));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#game canvas', { timeout: 30000 });
  await page.waitForTimeout(500);
  await capture('WebKit title screen', '00-title.png');

  for (const key of [
    'Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter',
    'ArrowDown', 'Enter', 'ArrowRight', 'Enter',
  ]) {
    await page.keyboard.press(key);
  }
  const opening = await waitForRuntime((state) => state?.mapId === 0 && state.snapshot !== null,
    'visible New Game opening on Map0');
  await page.waitForTimeout(9000);
  await page.keyboard.press('w');
  const bedroom = await waitForRuntime((state) => state?.mapId === 64,
    'opening transfer to Map64 bedroom');
  await capture('Map64 bedroom after visible opening', '01-map64-bedroom.png');

  const outside = await holdDownUntilMap0();
  await capture('Map0 outside after held Down', '02-map0-outside.png');
  const failures = errors.filter((error) => [
    'page-error', 'console-error', 'request-failed',
  ].includes(error.kind));
  const fullHp = outside.hp === outside.snapshot?.resources?.maxHp;
  const passed = opening.level === 99 && bedroom.level === 99 && outside.level === 99 &&
    bedroom.profile === 'max-level' && outside.profile === 'max-level' &&
    bedroom.scenario === null && outside.mapId === 0 && outside.tileX === 26 && outside.tileY === 24 &&
    fullHp && failures.length === 0;
  const result = {
    id: 'M1117',
    attempt,
    passed,
    route: 'visible New Game -> opening Map0 -> Map64 bedroom -> held Down -> Map0 outside',
    browser: {
      product: 'Playwright WebKit',
      version: browser.version(),
      playwrightVersion: playwrightPackage.version,
      viewport: [1280, 800],
      processOwned: true,
      isolatedContext: true,
    },
    profile: 'max-level',
    opening,
    bedroom,
    outside,
    errors: failures,
    observations,
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      browserStorageWrittenByHarness: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
      directMapStart: false,
      gameplayStateSeed: false,
    },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) {
    throw new Error(`M1117 WebKit route criteria failed: ${JSON.stringify({
      bedroom: { mapId: bedroom.mapId, level: bedroom.level, profile: bedroom.profile },
      outside: { mapId: outside.mapId, tileX: outside.tileX, tileY: outside.tileY, hp: outside.hp },
      maxHp: outside.snapshot?.resources?.maxHp,
      failures,
    })}`);
  }
  process.stdout.write(`${JSON.stringify({
    id: result.id,
    attempt,
    passed,
    browser: result.browser,
    opening: { mapId: opening.mapId, level: opening.level },
    bedroom: { mapId: bedroom.mapId, tile: [bedroom.tileX, bedroom.tileY], level: bedroom.level },
    outside: { mapId: outside.mapId, tile: [outside.tileX, outside.tileY], level: outside.level,
      hp: outside.hp, maxHp: outside.snapshot.resources.maxHp },
    errors: failures.length,
    artifacts: `reference/screenshots/web-render/M1117-webkit-newgame-route/attempt-${attempt}`,
  })}\n`);
}

try {
  await run();
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify({
    id: 'M1117',
    attempt,
    passed: false,
    error: error instanceof Error ? error.message : String(error),
    browser: {
      product: 'Playwright WebKit',
      version: browser?.version() ?? null,
      playwrightVersion: playwrightPackage.version,
      viewport: [1280, 800],
      processOwned: true,
    },
    errors,
    observations,
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      browserStorageWrittenByHarness: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
      directMapStart: false,
      gameplayStateSeed: false,
    },
  }, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1117', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}
