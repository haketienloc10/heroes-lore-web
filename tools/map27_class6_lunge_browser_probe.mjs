#!/usr/bin/env node

/** Replay Ronin's class-6 combo stage-3 heavy lunge in the DEV max-level map scenario. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M993_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('M993 attempt must be from 1 to 3');
const outDir = join(root, `reference/screenshots/web-render/M993-max-level-map27-class6-stage3-lunge/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m993-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map27-class6-lunge';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map27-class6-lunge') {
  throw new Error('M993 requires the local DEV max-level Map27 lunge scenario');
}

let chrome;
let ws;
let page;
let stderr = '';
const errors = [];
const captures = [];

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
      } else if (['Runtime.exceptionThrown', 'Network.loadingFailed', 'Runtime.consoleAPICalled', 'Log.entryAdded']
        .includes(message.method)) {
        errors.push({ method: message.method, params: message.params ?? {} });
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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          ws.addEventListener('open', resolvePromise, { once: true });
          ws.addEventListener('error', rejectPromise, { once: true });
        });
        page = new CdpPage(ws);
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
    `--user-data-dir=${profileDir}`, '--window-size=780,420', url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
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
  const canvasDeadline = Date.now() + 30000;
  while (Date.now() < canvasDeadline) {
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
      snapshot,
    };
  })()`);
  return value ?? null;
}

async function waitFor(predicate, label, timeoutMs = 15000, intervalMs = 12) {
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
  await delay(45);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(25);
}

async function screenshot(name) {
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(outDir, name), Buffer.from(image.data, 'base64'));
}

async function capture(label, filename) {
  const state = await runtime();
  captures.push({ at: new Date().toISOString(), label, state });
  if (filename !== undefined) await screenshot(filename);
  return state;
}

async function startScenario() {
  await capture('fresh-title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const state = await waitFor((candidate) => candidate?.mapId === 27 && candidate.scenario === 'map27-class6-lunge',
    'Map27 lunge scenario');
  if (state.profile !== 'max-level' || state.level !== 99 || state.tileX !== 2 || state.tileY !== 21 ||
    state.snapshot?.combo.comboLimit !== 4 || state.hp !== state.snapshot.resources.maxHp) {
    throw new Error(`Unexpected seeded lunge state: ${JSON.stringify(state)}`);
  }
  // The first test runtime is written during Phaser's update callback. Let the
  // corresponding render complete before recording a visual checkpoint.
  await delay(750);
  await capture('map27-combo-lunge-start', '01-map27-before-combo.png');
  return state;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  await launch();
  const start = await startScenario();
  await keyTap('5', 'Numpad5', 101, '5');
  const stage0 = await waitFor((state) => state?.snapshot?.combo.stage === 0 && state.snapshot.combo.activeStyle === 'light',
    'stage 0 light');
  await keyTap('5', 'Numpad5', 101, '5');
  captures.push({ at: new Date().toISOString(), label: 'stage-0-light', state: stage0 });
  const stage1 = await waitFor((state) => state?.snapshot?.combo.stage === 1 && state.snapshot.combo.activeStyle === 'light',
    'stage 1 light');
  await keyTap('5', 'Numpad5', 101, '5');
  captures.push({ at: new Date().toISOString(), label: 'stage-1-light', state: stage1 });
  const stage2 = await waitFor((state) => state?.snapshot?.combo.stage === 2 && state.snapshot.combo.activeStyle === 'light',
    'stage 2 light');
  await keyTap('7', 'Numpad7', 103, '7');
  captures.push({ at: new Date().toISOString(), label: 'stage-2-light', state: stage2 });
  const stage3 = await waitFor((state) => state?.snapshot?.combo.stage === 3 && state.snapshot.combo.activeStyle === 'heavy',
    'stage 3 heavy');
  captures.push({ at: new Date().toISOString(), label: 'stage-3-heavy-entered', state: stage3 });
  const lunge = await waitFor((state) => state?.mapId === 27 && state.tileX > start.tileX,
    'stage 3 lunge movement', 8000);
  await capture('stage-3-heavy-lunge-settled', '06-stage-3-lunge-settled.png');
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const passed = lunge.profile === 'max-level' && lunge.level === 99 && lunge.hp === lunge.snapshot.resources.maxHp &&
    lunge.snapshot.combo.comboLimit === 4 && lunge.tileX === start.tileX + 2 && lunge.tileY === start.tileY &&
    lunge.snapshot.combo.stage === 3 && lunge.snapshot.combo.activeStyle === 'heavy' && pageErrors.length === 0;
  const result = {
    id: 'M993', attempt, profile: 'max-level', scenario: 'map27-class6-lunge', passed,
    start, stage0, stage1, stage2, stage3, lunge, captures, errors: pageErrors,
    route: 'visible New Game -> seeded Map27 open corridor -> Numpad5 light stages 0/1/2 -> Numpad7 heavy stage 3 -> two-cell lunge',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M993 stage-3 lunge criteria failed: ${JSON.stringify({ start, stage0, stage1, stage2, stage3, lunge, pageErrors })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    start: { mapId: start.mapId, tile: [start.tileX, start.tileY], level: start.level,
      hp: start.hp, maxHp: start.snapshot.resources.maxHp },
    stages: [stage0, stage1, stage2, stage3].map((state) => ({ stage: state.snapshot.combo.stage,
      style: state.snapshot.combo.activeStyle, frame: state.snapshot.combo.frame })),
    final: { mapId: lunge.mapId, tile: [lunge.tileX, lunge.tileY], direction: lunge.snapshot.player.direction,
      level: lunge.level, hp: lunge.hp, maxHp: lunge.snapshot.resources.maxHp,
      comboStage: lunge.snapshot.combo.stage, comboStyle: lunge.snapshot.combo.activeStyle },
    browserErrors: pageErrors.length, artifacts: `reference/screenshots/web-render/M993-max-level-map27-class6-stage3-lunge/attempt-${attempt}` })}\n`);
}

async function cleanup() {
  try { ws?.close(); } catch {}
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
  const partial = { id: 'M993', attempt, profile: 'max-level', scenario: 'map27-class6-lunge', passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M993', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      combo: captures.at(-1)?.state?.snapshot?.combo,
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
