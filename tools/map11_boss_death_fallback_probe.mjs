#!/usr/bin/env node

/** Observe Map11 boss 32 death-pose fallback from a fresh DEV max-level run. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1073_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1073 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1073-map11-boss-death-fallback/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1073-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const startUrl = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map11-boss-death-fallback';
const parsedUrl = new URL(startUrl);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map11-boss-death-fallback') {
  throw new Error('M1073 requires the local DEV max-level Map11 preview');
}

let chrome;
let socket;
let page;
let chromeStderr = '';
let lastRuntime = null;
let resultWritten = false;
const events = [];
const captures = [];
const deathSamples = [];

class CdpPage {
  constructor(webSocket) {
    this.ws = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    webSocket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else if ([
        'Runtime.exceptionThrown', 'Network.loadingFailed', 'Runtime.consoleAPICalled', 'Log.entryAdded',
      ].includes(message.method)) {
        events.push({ method: message.method, params: message.params ?? {} });
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
        resolve: (result) => { clearTimeout(timeout); resolvePromise(result); },
        reject: (error) => { clearTimeout(timeout); rejectPromise(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text ?? 'CDP evaluate failed');
    return result.result?.value;
  }
}

async function connect(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (target !== undefined) {
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          socket.addEventListener('open', resolvePromise, { once: true });
          socket.addEventListener('error', rejectPromise, { once: true });
        });
        page = new CdpPage(socket);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        await page.send('Log.enable');
        return;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out connecting to owned Chromium page');
}

async function launch() {
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`, '--window-size=780,420', startUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { chromeStderr += chunk; });
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  let port;
  while (Date.now() < deadline) {
    try {
      const [value] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (value !== undefined && /^\d+$/.test(value)) { port = Number(value); break; }
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chromium exited before DevTools startup: ${chrome.exitCode}`);
    await delay(50);
  }
  if (port === undefined) throw new Error('Timed out waiting for Chromium DevTools port');
  await connect(port);
  const deadlineCanvas = Date.now() + 30000;
  while (Date.now() < deadlineCanvas) {
    if (await page.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await delay(1000);
  await page.send('Page.bringToFront');
}

async function runtime() {
  const value = await page.evaluate(`(() => {
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
  })()`);
  lastRuntime = value ?? null;
  return lastRuntime;
}

async function waitFor(predicate, label, timeoutMs = 15000, intervalMs = 15) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function keyTap(key, code, vk, textValue) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(180);
}

function bossFrom(state) {
  return state?.snapshot?.enemies.find((enemy) => enemy.enemyId === 32);
}

async function saveScreenshot(label, filename) {
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outputDir, filename), bytes);
  const record = {
    label,
    file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
  };
  captures.push(record);
  return record;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const title = await runtime();
  await saveScreenshot('fresh-title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const start = await waitFor((state) => state?.mapId === 11 &&
    state.scenario === 'map11-boss-death-fallback' && state.mapPreviewReady &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' && bossFrom(state)?.hp > 0,
  'Map11 preview and boss 32');
  await delay(250);
  await saveScreenshot('map11-preview-start', '01-map11-preview-start.png');
  const startBoss = bossFrom(start);
  if (start.profile !== 'max-level' || start.level !== 99 || start.hp !== start.snapshot.resources.maxHp ||
    start.tileX !== 9 || start.tileY !== 9 || startBoss?.tileX !== 10 || startBoss?.tileY !== 9 ||
    startBoss?.sourceAu !== true || startBoss.renderSpriteId !== 256 || startBoss.state !== 'alive' ||
    Math.abs(startBoss.tileX - start.tileX) + Math.abs(startBoss.tileY - start.tileY) !== 1) {
    throw new Error(`Unexpected Map11 max-level preview: ${JSON.stringify({ start, startBoss })}`);
  }

  const dx = startBoss.tileX - start.tileX;
  const dy = startBoss.tileY - start.tileY;
  const approach = dx > 0 ? ['ArrowRight', 'ArrowRight', 39]
    : dx < 0 ? ['ArrowLeft', 'ArrowLeft', 37]
      : dy > 0 ? ['ArrowDown', 'ArrowDown', 40] : ['ArrowUp', 'ArrowUp', 38];
  const startTile = [start.tileX, start.tileY];
  await keyTap(...approach);
  const expectedDirection = dx > 0 ? 4 : dx < 0 ? 3 : dy > 0 ? 2 : 1;
  const facing = await waitFor((state) => state?.snapshot?.player?.direction ===
    expectedDirection, 'player faces adjacent Map11 boss');
  if (facing.mapId !== 11 || facing.level !== 99 || facing.tileX !== startTile[0] ||
    facing.tileY !== startTile[1] || bossFrom(facing)?.state !== 'alive') {
    throw new Error(`Unexpected Map11 boss-facing state: ${JSON.stringify({ facing, startTile })}`);
  }
  await saveScreenshot('boss-approach', '02-boss-approach.png');
  let started = null;
  let dead = null;
  for (let strike = 0; strike < 16; strike += 1) {
    await keyTap('5', 'Numpad5', 101, '5');
    started ??= await runtime();
    dead = await waitFor((state) => bossFrom(state)?.state === 'death-pending' && bossFrom(state)?.hp === 0,
      `boss 32 dies after light attack ${strike + 1}`, 900, 30).catch(() => null);
    if (dead !== null) break;
    await delay(250);
  }
  if (dead === null) throw new Error(`Boss 32 remained alive after sixteen light-attack inputs: ${JSON.stringify(bossFrom(lastRuntime))}`);
  await saveScreenshot('boss-death-entry', '03-boss-death-entry.png');

  const deathStartedAt = Date.now();
  let finalState = dead;
  while (Date.now() - deathStartedAt < 3500) {
    const state = await runtime();
    const enemy = bossFrom(state);
    if (enemy !== undefined) {
      deathSamples.push({
        atMs: Date.now() - deathStartedAt,
        state: enemy.state,
        mapId: state.mapId,
        enemyId: enemy.enemyId,
        hp: enemy.hp,
        sourceAu: enemy.sourceAu,
        renderSpriteId: enemy.renderSpriteId,
        renderAnimationStateIndex: enemy.renderAnimationStateIndex,
        animationDirection: enemy.animationDirection,
        animationFrameIndex: enemy.animationFrameIndex,
        deathUpdatesRemaining: enemy.deathUpdatesRemaining,
      });
    }
    finalState = state;
    if (enemy?.state === 'removed') break;
    await delay(45);
  }
  await saveScreenshot('boss-death-countdown-end', '05-boss-death-countdown-end.png');
  const pageErrors = events.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const frameIndices = [...new Set(deathSamples
    .filter((sample) => sample.state === 'death-pending')
    .map((sample) => sample.animationFrameIndex)
    .filter((frame) => Number.isInteger(frame)))];
  const countdownValues = deathSamples
    .filter((sample) => sample.state === 'death-pending')
    .map((sample) => sample.deathUpdatesRemaining)
    .filter((ticks) => Number.isInteger(ticks));
  const observedDeathTrack = deathSamples.some((sample) => sample.state === 'death-pending' &&
    sample.sourceAu === true && sample.enemyId === 32 && sample.renderSpriteId === 256 &&
    sample.renderAnimationStateIndex === 0);
  const countdownReachedEnd = deathSamples.some((sample) => sample.state === 'removed') ||
    countdownValues.some((ticks) => ticks <= 0);
  const passed = start.profile === 'max-level' && start.level === 99 &&
    facing.snapshot.player.direction === expectedDirection &&
    facing.tileX === startTile[0] && facing.tileY === startTile[1] &&
    bossFrom(dead)?.state === 'death-pending' &&
    observedDeathTrack && frameIndices.length >= 2 && countdownReachedEnd && pageErrors.length === 0 &&
    (finalState?.mapId === 11 || finalState?.mapId === 13) && finalState.level === 99 && finalState.hp > 0;
  const result = {
    id: 'M1073', attempt, passed,
    profile: 'max-level', scenario: 'map11-boss-death-fallback',
    route: 'visible New Game UI -> DEV max-level Map11 preview -> face adjacent source-created boss 32 -> Numpad5 attacks -> observe idle fallback through the death countdown and removal handoff',
    title, start, startBoss, facing, started, deathEntry: dead, finalState,
    deathSamples, frameIndices, countdownValues, observedDeathTrack, countdownReachedEnd,
    captures, browserErrors: pageErrors,
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
      mapStateSeeded: true,
    },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  resultWritten = true;
  if (!passed) throw new Error(`M1073 boss-death observation incomplete: ${JSON.stringify({
    start: { mapId: start?.mapId, tile: [start?.tileX, start?.tileY], level: start?.level, boss: startBoss },
    facing: facing?.snapshot?.player, started: started?.snapshot?.skillAction,
    deathEntry: bossFrom(dead), frameIndices, countdownValues, observedDeathTrack, countdownReachedEnd,
    browserErrors: pageErrors.length,
  })}`);
  process.stdout.write(`${JSON.stringify({
    id: 'M1073', attempt, passed, mapId: finalState.mapId, level: finalState.level,
    hp: finalState.hp, maxHp: finalState.snapshot.resources.maxHp,
    target: { enemyId: 32, state: bossFrom(dead)?.state, renderSlot: bossFrom(dead)?.renderAnimationStateIndex },
    deathSampleCount: deathSamples.length, frameIndices, countdownValues,
    observedDeathTrack, countdownReachedEnd, browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1073-map11-boss-death-fallback/attempt-${attempt}`,
  })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
  if (chrome !== undefined && chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM');
    await new Promise((resolvePromise) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return resolvePromise();
      const timeout = setTimeout(resolvePromise, 4000);
      chrome.once('exit', () => { clearTimeout(timeout); resolvePromise(); });
    });
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await run();
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const partial = {
    id: 'M1073', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error),
    deathSamples, captures, lastRuntime,
    browser: { stderr: chromeStderr.slice(-3000) },
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      gameSaveActionUsed: false,
      originalJarAccessed: false,
      mapStateSeeded: true,
    },
  };
  await writeFile(join(outputDir, resultWritten ? 'probe-error.json' : 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1073', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
