#!/usr/bin/env node

/** Verify keyboard skill combat in a fresh desktop-sized Firefox context. */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1070_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1070 attempt must be from 1 to 3');
}
const playwrightEntry = process.env.HEROES_LORE_PLAYWRIGHT_ENTRY;
if (!playwrightEntry) throw new Error('Set HEROES_LORE_PLAYWRIGHT_ENTRY to an installed Playwright index.mjs path');
const { firefox } = await import(pathToFileURL(playwrightEntry).href);
const scenario = 'map27-class6-skill2';
const outDir = join(root, `reference/screenshots/web-render/M1070-firefox-desktop-skill/attempt-${attempt}`);
const url = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;
const errors = [];
let browser;
let context;

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

async function runtime(page) {
  return await page.evaluate(runtimeExpression());
}

async function waitForRuntime(page, predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime(page);
    if (predicate(state)) return state;
    await page.waitForTimeout(20);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

let page;
let captures = [];
async function capture(label, filename) {
  const state = await runtime(page);
  await page.screenshot({ path: join(outDir, filename) });
  captures.push({ label, filename, state });
}

async function run() {
  await mkdir(outDir, { recursive: true });
  browser = await firefox.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push({ kind: 'page-error', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console-error', text: message.text() });
  });
  page.on('requestfailed', (request) => errors.push({
    kind: 'request-failed', url: request.url(), failure: request.failure()?.errorText ?? null,
  }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#game canvas', { timeout: 30000 });
  await page.waitForTimeout(500);
  await capture('fresh title', '00-title.png');

  // Enter the title/New Game menu through visible UI keyboard input.
  for (const key of ['Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
  }
  const start = await waitForRuntime(page, (state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
    return state?.mapId === 27 && state.scenario === scenario && state.tileX === 8 && state.tileY === 31 &&
      target?.tileX === 10 && target.tileY === 31 && target.hp === 43 &&
      (target.actionDelayTicksRemaining ?? 0) >= 50 && state.snapshot.skillAction.skillId === 2;
  }, 'visible New Game max-level Map27 skill-2 scene');
  if (start.profile !== 'max-level' || start.level !== 99 || start.hp !== start.snapshot.resources.maxHp ||
    start.snapshot.skillAction.skillRank !== 1) {
    throw new Error(`Unexpected Firefox desktop skill fixture: ${JSON.stringify(start)}`);
  }
  await page.waitForTimeout(500);
  await capture('Map27 skill-2 start', '01-map27-start.png');
  const charged = await waitForRuntime(page, (state) => state?.snapshot?.skillAction.skillId === 2 &&
    state.snapshot.skillAction.chargeTicksRemaining[0] === 0 &&
    state.snapshot.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24)?.hp === 43,
  'skill-2 level-0 charge-ready state', 30000);
  await capture('skill-2 charge ready', '02-charge-ready.png');

  await page.keyboard.press('Digit1');
  const started = await waitForRuntime(page, (state) => state?.snapshot?.skillAction.skillId === 2 &&
    state.snapshot.skillAction.phase !== 0, 'skill-2 action starts through Firefox keyboard');
  await capture('skill action started by keyboard', '03-skill-action-started.png');
  const hit = await waitForRuntime(page, (state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
    return target?.hp === 0 && target.state === 'death-pending';
  }, 'skill-2 forward pulse defeats target', 8000);
  await capture('skill-2 target defeated', '04-target-defeated.png');

  const target = hit.snapshot.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
  const failures = errors.filter((error) => ['page-error', 'console-error', 'request-failed'].includes(error.kind));
  const passed = start.level === 99 && start.profile === 'max-level' && start.hp === start.snapshot.resources.maxHp &&
    charged.snapshot.skillAction.chargeTicksRemaining[0] === 0 &&
    started.snapshot.skillAction.levelSlot === 0 && target.hp === 0 && target.state === 'death-pending' &&
    hit.hp === hit.snapshot.resources.maxHp && failures.length === 0;
  const result = {
    id: 'M1070', attempt, passed, scenario, profile: 'max-level', start, charged, started, hit, target, captures,
    errors: failures,
    route: 'visible New Game -> DEV max-level Map27 skill-2 scenario -> keyboard Digit1 -> skill-2 level-0 pulse defeats enemy 24/order 14',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Firefox', version: browser.version(), viewport: [1280, 800], input: 'Playwright keyboard.press', processOwned: true, isolatedContext: true },
    playwrightVersion: '1.56.1',
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1070 Firefox desktop criteria failed: ${JSON.stringify({ target, hp: hit.hp, failures })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, browser: result.browser,
    level: hit.level, hp: hit.hp, maxHp: hit.snapshot.resources.maxHp,
    target: { before: 43, after: target.hp, state: target.state }, errors: failures.length,
    artifacts: `reference/screenshots/web-render/M1070-firefox-desktop-skill/attempt-${attempt}` })}\n`);
}

try {
  await run();
} catch (error) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify({ id: 'M1070', attempt, passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error),
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Firefox', version: browser?.version() ?? null, viewport: [1280, 800], processOwned: true } }, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1070', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}
