#!/usr/bin/env node

/** Verify Map76's category-6 event reward through visible gameplay input. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1034_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1034 attempt must be from 1 to 3');
}
const outDir = join(root, `reference/screenshots/web-render/M1034-map76-equipment-reward/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1034-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map76-equipment-reward';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map76-equipment-reward') {
  throw new Error('M1034 requires the local DEV max-level Map76 reward scenario');
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
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(140);
}

function hasItem(state, category, itemId) {
  return state?.snapshot?.inventory.some((item) => item.category === category && item.itemId === itemId) ?? false;
}

async function capture(label, filename) {
  const state = await runtime();
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outDir, filename), bytes);
  captures.push({
    at: new Date().toISOString(), label, state,
    file: filename, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength,
  });
  return state;
}

function browserErrors() {
  return errors.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
}

async function run() {
  await mkdir(dirname(outDir), { recursive: true });
  await mkdir(outDir);
  await launch();
  const title = await capture('fresh title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const start = await waitFor((state) => state?.mapId === 76 &&
    state.scenario === 'map76-equipment-reward' && state.profile === 'max-level' &&
    state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    state.tileX === 11 && state.tileY === 4 && state.snapshot.gameFlags.includes(59) && hasItem(state, 17, 5),
  'Map76 reward scenario with its visible interaction prerequisites');
  await delay(500);
  await capture('Map76 reward prerequisites', '01-map76-before-interaction.png');
  if (start.level !== 99 || start.hp !== start.snapshot.resources.maxHp || start.snapshot.gameFlags.includes(60) ||
    start.snapshot.questFlags.includes(42) || hasItem(start, 6, 12)) {
    throw new Error(`Unexpected Map76 reward precondition: ${JSON.stringify(start)}`);
  }

  await keyTap('Enter', 'Enter', 13);
  const eventStarted = await waitFor((state) => state?.mapId === 76 && state.snapshot?.dialogueOpen === true &&
    hasItem(state, 6, 12), 'Map76 category-6 reward and first dialogue');
  await capture('category-6 reward shown in dialogue', '02-map76-equipment-award.png');
  await keyTap('w', 'KeyW', 87, 'w');
  const completed = await waitFor((state) => state?.mapId === 76 && hasItem(state, 6, 12) &&
    state.snapshot.gameFlags.includes(60) && state.snapshot.questFlags.includes(42),
  'Map76 script completion and game/quest flags', 15000);
  await delay(300);
  await capture('Map76 reward event complete', '03-map76-reward-complete.png');
  const reward = completed.snapshot.inventory.find((item) => item.category === 6 && item.itemId === 12);

  await keyTap('w', 'KeyW', 87, 'w');
  await delay(200);
  await capture('system menu before equipment', '04-system-menu.png');
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('Enter', 'Enter', 13);
  await delay(200);
  await capture('equipment slots with Map76 reward in bag', '05-equipment-slots.png');
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('Enter', 'Enter', 13);
  await delay(200);
  await capture('helmet item selection', '06-helmet-selection.png');
  await keyTap('Enter', 'Enter', 13);
  const equipped = await waitFor((state) => state?.mapId === 76 &&
    state.snapshot?.equipment[3]?.category === 6 && state.snapshot.equipment[3].itemId === 12 &&
    hasItem(state, 6, 0), 'Map76 reward equipped with the replaced helmet returned to inventory');
  await delay(200);
  await capture('Map76 reward equipped', '07-reward-equipped.png');
  const pageErrors = browserErrors();
  const passed = title.mapId === null && completed.profile === 'max-level' && completed.level === 99 &&
    completed.hp === completed.snapshot.resources.maxHp && reward?.count === 1 &&
    reward.equipmentState?.sourceFlag === true && reward.equipmentState.bonusValues.length === 4 &&
    hasItem(completed, 17, 5) && completed.snapshot.gameFlags.includes(60) &&
    completed.snapshot.questFlags.includes(42) && equipped.profile === 'max-level' && equipped.level === 99 &&
    equipped.hp > 0 && equipped.snapshot.equipment[3]?.category === 6 &&
    equipped.snapshot.equipment[3]?.itemId === 12 && equipped.snapshot.equipment[3].equipmentState?.sourceFlag === true &&
    hasItem(equipped, 6, 0) && hasItem(equipped, 17, 5) &&
    equipped.snapshot.gameFlags.includes(60) && equipped.snapshot.questFlags.includes(42) && pageErrors.length === 0;
  const result = {
    id: 'M1034', attempt, profile: 'max-level', scenario: 'map76-equipment-reward', passed,
    title, start, eventStarted, completed, reward, equipped, captures, errors: pageErrors,
    route: 'visible New Game selections -> DEV-only Map76 prerequisite scenario -> visible Enter interaction with Sid -> visible W fast-forward -> category-6/item-12 reward -> open Inventory/Equipment through the System menu -> equip the reward helmet',
    expectedSource: { trigger: 2, triggerType: 2, gameFlag: 59, requiredItem: { category: 17, itemId: 5, count: 1 }, reward: { category: 6, itemId: 12, count: 1 }, gameFlagSet: 60, questFlagSet: 42 },
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1034 Map76 reward criteria failed: ${JSON.stringify({ completed, reward, pageErrors })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    start: { mapId: start.mapId, tile: [start.tileX, start.tileY], level: start.level, hp: start.hp,
      gateItem: hasItem(start, 17, 5) },
    final: { mapId: completed.mapId, tile: [completed.tileX, completed.tileY], level: completed.level,
      hp: completed.hp, reward: { category: reward.category, itemId: reward.itemId, count: reward.count,
        sourceFlag: reward.equipmentState?.sourceFlag, bonusValues: reward.equipmentState?.bonusValues },
      gameFlag60: equipped.snapshot.gameFlags.includes(60), questFlag42: equipped.snapshot.questFlags.includes(42),
      equippedHelmet: { category: equipped.snapshot.equipment[3]?.category,
        itemId: equipped.snapshot.equipment[3]?.itemId, sourceFlag: equipped.snapshot.equipment[3]?.equipmentState?.sourceFlag },
      replacedHelmetReturnedToBag: hasItem(equipped, 6, 0),
      hp: equipped.hp, maxHp: equipped.snapshot.resources.maxHp },
    browserErrors: pageErrors.length, artifacts: `reference/screenshots/web-render/M1034-map76-equipment-reward/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1034', attempt, profile: 'max-level', scenario: 'map76-equipment-reward', passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1034', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      inventory: captures.at(-1)?.state?.snapshot?.inventory,
      gameFlags: captures.at(-1)?.state?.snapshot?.gameFlags,
      questFlags: captures.at(-1)?.state?.snapshot?.questFlags,
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
