#!/usr/bin/env node

/** Observe Map11 boss 32's attack damage in a fresh DEV damage-survival run. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1076_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1076 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1076-map11-boss-ai-damage/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1076-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const startUrl = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=damage-survival&testScenario=map11-boss-ai-live';
const parsedUrl = new URL(startUrl);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'damage-survival' ||
  parsedUrl.searchParams.get('testScenario') !== 'map11-boss-ai-live') {
  throw new Error('M1076 requires the local DEV damage-survival Map11 AI preview');
}

let chrome;
let socket;
let page;
let chromeStderr = '';
let lastRuntime = null;
let resultWritten = false;
const events = [];
const captures = [];
const bossSamples = [];

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
    state.scenario === 'map11-boss-ai-live' && state.mapPreviewReady &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' && bossFrom(state)?.hp > 0,
  'Map11 preview and boss 32');
  await saveScreenshot('map11-preview-start', '01-map11-preview-start.png');
  const startBoss = bossFrom(start);
  if (start.profile !== 'damage-survival' || start.level !== 1 || start.hp !== start.snapshot.resources.maxHp ||
    start.tileX !== 9 || start.tileY !== 9 || startBoss?.sourceAu !== true ||
    startBoss.renderSpriteId !== 256 || startBoss.state !== 'alive') {
    throw new Error(`Unexpected Map11 damage-survival preview: ${JSON.stringify({ start, startBoss })}`);
  }
  const sampleStartedAt = Date.now();
  let finalState = start;
  let midCaptureSaved = false;
  while (Date.now() - sampleStartedAt < 10000) {
    const state = await runtime();
    const enemy = bossFrom(state);
    if (enemy !== undefined) {
      bossSamples.push({
        atMs: Date.now() - sampleStartedAt,
        state: enemy.state,
        mapId: state.mapId,
        playerHp: state.hp,
        enemyId: enemy.enemyId,
        hp: enemy.hp,
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        behaviorType: enemy.behaviorType,
        animationStateIndex: enemy.animationStateIndex,
        sourceAu: enemy.sourceAu,
        renderSpriteId: enemy.renderSpriteId,
        renderAnimationStateIndex: enemy.renderAnimationStateIndex,
        animationDirection: enemy.animationDirection,
        animationFrameIndex: enemy.animationFrameIndex,
        attackCooldownTicksRemaining: enemy.attackCooldownTicksRemaining,
        actionDelayTicksRemaining: enemy.actionDelayTicksRemaining,
      });
    }
    finalState = state;
    if (!midCaptureSaved && Date.now() - sampleStartedAt >= 4500) {
      await saveScreenshot('boss-ai-live-mid-run', '02-boss-ai-mid-run.png');
      midCaptureSaved = true;
    }
    await delay(40);
  }
  await saveScreenshot('boss-ai-live-end', '03-boss-ai-end.png');
  const pageErrors = events.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const renderSlots = [...new Set(bossSamples.map((sample) => sample.renderAnimationStateIndex))];
  const playerHpTrail = [...new Set(bossSamples.map((sample) => sample.playerHp))];
  const minPlayerHp = Math.min(start.hp, ...bossSamples.map((sample) => sample.playerHp));
  const hpLossObserved = minPlayerHp < start.hp;
  const attackSamples = bossSamples.filter((sample) => [3, 4, 5].includes(sample.renderAnimationStateIndex));
  const attackTransitions = bossSamples.reduce((count, sample, index) => {
    const wasAttacking = index > 0 && [3, 4, 5].includes(bossSamples[index - 1].renderAnimationStateIndex);
    return count + ([3, 4, 5].includes(sample.renderAnimationStateIndex) && !wasAttacking ? 1 : 0);
  }, 0);
  const tileTrail = [...new Set(bossSamples.map((sample) => `${sample.tileX},${sample.tileY}`))];
  const passed = start.profile === 'damage-survival' && start.level === 1 &&
    start.hp === start.snapshot.resources.maxHp && startBoss.behaviorType === 3 &&
    startBoss.sourceAu === true && startBoss.renderSpriteId === 256 &&
    attackSamples.length >= 5 && attackTransitions >= 1 && tileTrail.length >= 1 &&
    finalState?.mapId === 11 && bossFrom(finalState)?.state === 'alive' &&
    hpLossObserved && finalState.level === 1 && finalState.hp > 0 && pageErrors.length === 0;
  const result = {
    id: 'M1076', attempt, passed,
    profile: 'damage-survival', scenario: 'map11-boss-ai-live',
    route: 'visible New Game UI -> DEV level-1 damage-survival Map11 preview -> no gameplay input -> observe boss 32 attacks and player HP for ten seconds',
    title, start, startBoss, finalState,
    bossSamples, renderSlots, attackSamples: attackSamples.length, attackTransitions, tileTrail,
    playerHpTrail, minPlayerHp, hpLossObserved,
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
  if (!passed) throw new Error(`M1076 boss damage observation incomplete: ${JSON.stringify({
    start: { mapId: start?.mapId, tile: [start?.tileX, start?.tileY], level: start?.level, boss: startBoss },
    final: { mapId: finalState?.mapId, hp: finalState?.hp, boss: bossFrom(finalState) },
    renderSlots, attackSamples: attackSamples.length, attackTransitions, tileTrail,
    playerHpTrail, minPlayerHp, hpLossObserved,
    browserErrors: pageErrors.length,
  })}`);
  process.stdout.write(`${JSON.stringify({
    id: 'M1076', attempt, passed, mapId: finalState.mapId, level: finalState.level,
    hp: finalState.hp, maxHp: finalState.snapshot.resources.maxHp,
    target: { enemyId: 32, state: bossFrom(finalState)?.state, hp: bossFrom(finalState)?.hp },
    sampleCount: bossSamples.length, renderSlots, attackSamples: attackSamples.length,
    attackTransitions, tileTrail, playerHpTrail, minPlayerHp, hpLossObserved, browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1076-map11-boss-ai-damage/attempt-${attempt}`,
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
    id: 'M1076', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error),
    bossSamples, captures, lastRuntime,
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
  process.stderr.write(`${JSON.stringify({ id: 'M1076', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
