#!/usr/bin/env node

/** Identify a seeded starter weapon through a distinct direct-approach Map80 Blacksmith fixture. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1080_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('M1080 attempt must be from 1 to 3');
const outDir = join(root, `reference/screenshots/web-render/M1080-map80-blacksmith-identify-direct/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1080-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map80-blacksmith-identify-direct';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map80-blacksmith-identify-direct') {
  throw new Error('M1080 requires the local DEV max-level Map80 Blacksmith scenario');
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
      commerceService: host.dataset.testCommerceService ?? null,
      commerceScreen: host.dataset.testCommerceScreen ?? null,
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
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(140);
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
  const state = await waitFor((candidate) => candidate?.mapId === 80 &&
    candidate.scenario === 'map80-blacksmith-identify-direct' && candidate.profile === 'max-level' &&
    candidate.tileX === 12 && candidate.tileY === 9 &&
    candidate.snapshot?.equipment[0]?.equipmentState?.sourceFlag === false,
  'Map80 Blacksmith scenario after equipment seed loads');
  if (state.level !== 99 || state.snapshot.wallet !== 180 || state.hp !== state.snapshot.resources.maxHp ||
    state.snapshot.equipment[0]?.category !== 0 || state.snapshot.equipment[0]?.itemId !== 0) {
    throw new Error(`Unexpected seeded Identify state: ${JSON.stringify(state)}`);
  }
  await delay(750);
  await capture('map80-identify-start', '01-map80-before-identify.png');
  return state;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  await launch();
  const start = await startScenario();
  await keyTap('ArrowUp', 'ArrowUp', 38);
  await keyTap('Enter', 'Enter', 13);
  // The service marker opens its map-event dialogue before the Blacksmith handoff.
  await keyTap('w', 'KeyW', 87, 'w');
  const blacksmith = await waitFor((state) => state?.commerceService === 'blacksmith' &&
    state.commerceScreen === 'blacksmith-main', 'Blacksmith main screen');
  await capture('blacksmith-main', '02-blacksmith-main.png');
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('Enter', 'Enter', 13);
  const targets = await waitFor((state) => state?.commerceService === 'blacksmith' &&
    state.commerceScreen === 'identify-target', 'Blacksmith Identify target');
  const targetMenu = await capture('identify-target', '03-identify-target.png');
  await keyTap('Enter', 'Enter', 13);
  const confirmation = await waitFor((state) => state?.commerceService === 'blacksmith' &&
    state.commerceScreen === 'confirm', 'Identify confirmation');
  await capture('identify-confirmation', '04-identify-confirmation.png');
  await keyTap('Enter', 'Enter', 13);
  const identified = await waitFor((state) => state?.commerceService === 'blacksmith' &&
    state.commerceScreen === 'message' && state.snapshot.wallet === 80 &&
    state.snapshot?.equipment[0]?.equipmentState?.sourceFlag === true,
  'Identify transaction result', 5000);
  await capture('identify-success', '05-identify-success.png');
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const identifiedWeapon = identified.snapshot.equipment[0];
  const passed = identified.profile === 'max-level' && identified.level === 99 &&
    identified.hp === identified.snapshot.resources.maxHp &&
    identified.snapshot.wallet === start.snapshot.wallet - 100 &&
    identifiedWeapon?.category === start.snapshot.equipment[0].category &&
    identifiedWeapon?.itemId === start.snapshot.equipment[0].itemId &&
    identifiedWeapon.equipmentState?.sourceFlag === true && confirmation.commerceScreen === 'confirm' &&
    targetMenu.commerceScreen === 'identify-target' && pageErrors.length === 0;
  const result = {
    id: 'M1080', attempt, profile: 'max-level', scenario: 'map80-blacksmith-identify-direct', passed,
    start, blacksmith, targets, confirmation, identified,
    captures, errors: pageErrors,
    route: 'visible New Game -> distinct DEV scenario at Map80 (12,9) with 180 GOLD and an unidentified starter weapon -> direct visible Blacksmith interaction -> Identify confirmation -> wallet 80 and sourceFlag true',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1080 Identify transaction criteria failed: ${JSON.stringify({ start, blacksmith, targets, confirmation, identified, pageErrors })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    start: { mapId: start.mapId, tile: [start.tileX, start.tileY], level: start.level, wallet: start.snapshot.wallet,
      hp: start.hp, maxHp: start.snapshot.resources.maxHp, weaponIdentified: start.snapshot.equipment[0]?.equipmentState?.sourceFlag },
    final: { mapId: identified.mapId, tile: [identified.tileX, identified.tileY], level: identified.level,
      hp: identified.hp, wallet: identified.snapshot.wallet, weaponIdentified: identifiedWeapon?.equipmentState?.sourceFlag,
      commerceScreen: identified.commerceScreen },
    browserErrors: pageErrors.length, artifacts: `reference/screenshots/web-render/M1080-map80-blacksmith-identify-direct/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1080', attempt, profile: 'max-level', scenario: 'map80-blacksmith-identify-direct', passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1080', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      commerce: { service: captures.at(-1)?.state?.commerceService, screen: captures.at(-1)?.state?.commerceScreen },
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
