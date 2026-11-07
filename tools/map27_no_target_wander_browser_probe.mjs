#!/usr/bin/env node

/** Observe ordinary enemy wandering on Map27 while the max-level player stays outside acquisition range. */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1119_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1119 attempt must be from 1 to 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const playwrightPackage = JSON.parse(await (await import('node:fs/promises')).readFile(
  join(dirname(playwrightEntry), 'package.json'), 'utf8',
));

const scenario = 'map27-no-target-wander';
const outputDir = join(root, `reference/screenshots/web-render/M1119-map27-no-target-wander/attempt-${attempt}`);
const url = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;
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

function targetFrom(state) {
  return state?.snapshot?.enemies?.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24) ?? null;
}

async function waitForRuntime(predicate, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) {
      observations.push({ at: new Date().toISOString(), label, state });
      return state;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function capture(label, filename) {
  const state = await runtime();
  await page.screenshot({ path: join(outputDir, filename) });
  observations.push({ at: new Date().toISOString(), label, screenshot: filename, state });
  return state;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
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
  await capture('title screen before starting New Game', '00-title.png');

  for (const key of [
    'Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'ArrowRight', 'Enter',
  ]) {
    await page.keyboard.press(key);
  }

  const start = await waitForRuntime((state) => {
    const enemy = targetFrom(state);
    return state?.mapId === 27 && state.scenario === scenario && state.profile === 'max-level' &&
      state.level === 99 && enemy?.hp === 43 && enemy.pursuitTarget === null && enemy.sourceRenderedOnScreen === true;
  }, 'visible Map27 targetless enemy after the New Game route');
  const startEnemy = targetFrom(start);
  const fullHp = start.hp === start.snapshot?.resources?.maxHp;
  if (start.tileX !== 10 || start.tileY !== 25 || startEnemy?.behaviorType !== 0 ||
    Math.abs(startEnemy.tileX - start.tileX) <= 2 && Math.abs(startEnemy.tileY - start.tileY) <= 2 || !fullHp) {
    throw new Error(`Unexpected targetless-wander fixture: ${JSON.stringify({
      player: { tileX: start.tileX, tileY: start.tileY, hp: start.hp, level: start.level },
      enemy: startEnemy,
      maxHp: start.snapshot?.resources?.maxHp,
    })}`);
  }
  await capture('Map27 enemy 24/order 14 visible outside its acquisition range', '01-no-target-start.png');

  const moved = await waitForRuntime((state) => {
    const enemy = targetFrom(state);
    return enemy?.hp === 43 && enemy.pursuitTarget === null && enemy.sourceRenderedOnScreen === true &&
      (enemy.tileX !== startEnemy.tileX || enemy.tileY !== startEnemy.tileY);
  }, 'enemy 24 moves while still having no pursuit target', 15000);
  await capture('enemy wandered without acquiring the max-level player', '02-no-target-wandered.png');

  const movedEnemy = targetFrom(moved);
  const failures = errors.filter((error) => [
    'page-error', 'console-error', 'request-failed',
  ].includes(error.kind));
  const passed = moved.profile === 'max-level' && moved.level === 99 &&
    moved.hp === moved.snapshot?.resources?.maxHp && moved.mapId === 27 && moved.tileX === 10 && moved.tileY === 25 &&
    startEnemy !== null && movedEnemy !== null && movedEnemy.pursuitTarget === null &&
    (movedEnemy.tileX !== startEnemy.tileX || movedEnemy.tileY !== startEnemy.tileY) &&
    movedEnemy.sourceRenderedOnScreen === true && failures.length === 0;
  const result = {
    id: 'M1119', attempt, passed, scenario, profile: 'max-level', start, moved, observations,
    errors: failures,
    route: 'visible New Game -> DEV max-level Map27 no-target-wander preview -> no further input; enemy 24/order 14 moves in view outside acquisition range',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', version: browser.version(), viewport: [1280, 800], input: 'Playwright keyboard.press for New Game route only', processOwned: true, isolatedContext: true },
    playwrightVersion: playwrightPackage.version,
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1119 browser criteria failed: ${JSON.stringify({ movedEnemy, player: {
    hp: moved.hp, maxHp: moved.snapshot?.resources?.maxHp, level: moved.level, tileX: moved.tileX, tileY: moved.tileY,
  }, failures })}`);
  process.stdout.write(`${JSON.stringify({
    id: result.id, attempt, passed, browser: result.browser, playwrightVersion: result.playwrightVersion,
    player: { level: moved.level, hp: moved.hp, maxHp: moved.snapshot?.resources?.maxHp, tileX: moved.tileX, tileY: moved.tileY },
    enemy: { sourceOrder: movedEnemy.sourceOrder, enemyId: movedEnemy.enemyId,
      from: { tileX: startEnemy.tileX, tileY: startEnemy.tileY }, to: { tileX: movedEnemy.tileX, tileY: movedEnemy.tileY },
      pursuitTarget: movedEnemy.pursuitTarget, visible: movedEnemy.sourceRenderedOnScreen },
    errors: failures.length, artifacts: `reference/screenshots/web-render/M1119-map27-no-target-wander/attempt-${attempt}`,
  })}\n`);
}

try {
  await run();
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify({
    id: 'M1119', attempt, passed: false, observations, errors,
    error: error instanceof Error ? error.message : String(error),
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', version: browser?.version() ?? null, viewport: [1280, 800], processOwned: true },
    playwrightVersion: playwrightPackage.version,
  }, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1119', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}
