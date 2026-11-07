#!/usr/bin/env node

/** Verify skill ID 3 level 1 against its matching Map17 enemy in visible max-level New Game. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1138_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1138 attempt must be from 1 through 3');
}
const scenario = 'map17-class6-skill3-level1';
const outDir = join(root, `reference/screenshots/web-render/M1138-skill3-level1/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1138-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  `http://127.0.0.1:5175/?testProfile=max-level&testScenario=${scenario}`;
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== scenario) {
  throw new Error('M1138 requires the local DEV max-level Map17 skill-3 level-1 scenario');
}

let chrome;
let ws;
let page;
let stderr = '';
const browserEvents = [];
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
        browserEvents.push({ method: message.method, params: message.params ?? {} });
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
    return result.result?.value ?? null;
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
        for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable']) await page.send(method);
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
  const deadlineCanvas = Date.now() + 30000;
  while (Date.now() < deadlineCanvas) {
    if (await page.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await delay(1000);
  await page.send('Page.bringToFront');
}

async function runtime() {
  return page.evaluate(`(() => {
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
}

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(20);
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

async function capture(label, filename) {
  const state = await runtime();
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(outDir, filename), Buffer.from(image.data, 'base64'));
  captures.push({ at: new Date().toISOString(), label, state, filename });
  return state;
}

function browserErrors() {
  return browserEvents.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
}

function targetFor(state) {
  return state?.snapshot?.enemies?.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8) ?? null;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  await launch();
  await capture('fresh title', '00-title.png');
  for (const [key, code, vk] of [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ]) await keyTap(key, code, vk);

  const start = await waitFor((state) => state?.profile === 'max-level' && state.scenario === scenario &&
    state.mapId === 17 && state.tileX === 5 && state.tileY === 11 && state.level === 99 &&
    state.snapshot?.format?.startsWith('heroes-lore-campaign-test-runtime-') &&
    state.snapshot.skillAction.skillId === 3 && state.snapshot.skillAction.skillRank === 9 &&
    state.snapshot.skillAction.skillLevelSlotThree === 1 &&
    state.snapshot.skillAction.chargeTicksRemaining[1] === 0,
  'visible New Game reaches Map17 with skill-3 level-1 ready');
  const targetBefore = targetFor(start);
  if (targetBefore === null || targetBefore.tileX !== 6 || targetBefore.tileY !== 11 ||
    targetBefore.state !== 'alive' || targetBefore.hp <= 0 || start.hp !== start.snapshot.resources.maxHp ||
    start.snapshot.player.direction !== 4) {
    throw new Error(`Unexpected skill-3 level-1 fixture: ${JSON.stringify({ targetBefore, start })}`);
  }
  await capture('max-level Map17 before skill', '01-before.png');

  await keyTap('3', 'Digit3', 51, '3');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 3 &&
    state.snapshot.skillAction.levelSlot === 1 && state.snapshot.skillAction.phase !== 0,
  'visible number-3 input starts skill-3 level 1');
  const hit = await waitFor((state) => {
    const enemy = targetFor(state);
    return enemy !== null && (enemy.hp < targetBefore.hp || enemy.state !== 'alive');
  }, 'skill-3 level 1 damages the matching element-1 enemy', 12000);
  await capture('skill-3 level-1 target hit', '02-hit.png');
  const targetAfter = targetFor(hit);
  const failures = browserErrors();
  const damage = targetBefore.hp - (targetAfter?.hp ?? targetBefore.hp);
  const passed = start.mapId === 17 && start.level === 99 && start.hp > 0 &&
    start.snapshot.skillAction.skillId === 3 && start.snapshot.skillAction.skillRank === 9 &&
    start.snapshot.skillAction.skillLevelSlotThree === 1 && started.snapshot.skillAction.levelSlot === 1 &&
    targetBefore.tileX === 6 && targetBefore.tileY === 11 && targetAfter !== null &&
    (targetAfter.hp < targetBefore.hp || targetAfter.state !== 'alive') && damage > 0 &&
    hit.hp > 0 && failures.length === 0;
  const result = {
    id: 'M1138', attempt, passed, profile: 'max-level', scenario, start, started,
    targetBefore, hit, targetAfter, damage, browserErrors: failures, captures,
    route: 'visible New Game -> DEV Map17 max-level skill ID 3 rank-9 fixture -> visible number-3 input -> observe damage to the matching element-1 enemy',
    browser: { product: 'Chromium', processOwned: true, temporaryProfileDeleted: true, viewport: [780, 420] },
    restrictions: { saveFilesAccessed: false, browserStorageReadByHarness: false,
      gameSaveActionUsed: false, originalJarAccessed: false },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1138 skill-3 level-1 criteria failed: ${JSON.stringify({
    skill: hit.snapshot.skillAction, targetBefore, targetAfter, damage, hp: hit.hp, browserErrors: failures,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, mapId: hit.mapId,
    level: hit.level, skillId: hit.snapshot.skillAction.skillId,
    skillRank: hit.snapshot.skillAction.skillRank, levelSlot: hit.snapshot.skillAction.levelSlot,
    targetHp: { before: targetBefore.hp, after: targetAfter.hp, state: targetAfter.state, damage },
    playerHp: `${hit.hp}/${hit.snapshot.resources.maxHp}`, browserErrors: failures.length,
    artifacts: `reference/screenshots/web-render/M1138-skill3-level1/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1138', attempt, passed: false, profile: 'max-level', scenario,
    captures, browserEvents, error: error instanceof Error ? error.message : String(error),
    browser: { product: 'Chromium', stderr: stderr.slice(-3000) },
    restrictions: { saveFilesAccessed: false, browserStorageReadByHarness: false,
      gameSaveActionUsed: false, originalJarAccessed: false } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1138', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
