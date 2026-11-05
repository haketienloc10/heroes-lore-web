#!/usr/bin/env node

/** Replay class-6 skill ID 2 level 0 against a seeded Map27 enemy. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1002_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('M1002 attempt must be from 1 to 3');
const outDir = join(root, `reference/screenshots/web-render/M1002-mobile-touch-map27-skill2/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m997-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map27-class6-skill2';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map27-class6-skill2') {
  throw new Error('M1002 requires the local DEV max-level Map27 skill-2 scenario');
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
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 640,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
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

async function touchSkillButton(control) {
  const point = await page.evaluate(`(() => {
    const button = document.querySelector('[data-touch-control="${control}"]');
    if (!(button instanceof HTMLButtonElement)) return null;
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      bounds: [rect.left, rect.top, rect.width, rect.height],
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      viewport: [innerWidth, innerHeight],
    };
  })()`);
  if (point === null || !point.visible || !point.coarsePointer || point.maxTouchPoints < 1 ||
    point.x < 0 || point.y < 0 || point.x > point.viewport[0] || point.y > point.viewport[1]) {
    throw new Error(`Mobile skill control is not available in the emulated viewport: ${JSON.stringify(point)}`);
  }
  await page.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, id: 9, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await delay(140);
  const activeWhileHeld = await page.evaluate(
    `document.querySelector('[data-touch-control="${control}"]')?.classList.contains('touch-active') === true`,
  );
  await screenshot('03-skill1-touch-held.png');
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(100);
  return { ...point, activeWhileHeld, input: 'CDP touchStart/touchEnd' };
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
  const state = await waitFor((candidate) => {
    const target = candidate?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
    return candidate?.mapId === 27 && candidate.scenario === 'map27-class6-skill2' &&
      candidate.tileX === 8 && candidate.tileY === 31 && target?.tileX === 10 && target.tileY === 31 &&
      target.hp === 43 && (target.actionDelayTicksRemaining ?? 0) >= 50 &&
      candidate.snapshot.skillAction.skillId === 2;
  }, 'Map27 skill-2 scenario after seeded enemies load');
  const target = state.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
  if (state.profile !== 'max-level' || state.level !== 99 || state.tileX !== 8 || state.tileY !== 31 ||
    state.snapshot?.skillAction.skillId !== 2 || state.snapshot.skillAction.skillRank !== 1 ||
    state.snapshot.skillAction.phase !== 0 ||
    state.hp !== state.snapshot.resources.maxHp ||
    target?.tileX !== 10 || target.tileY !== 31 || target.hp !== 43 ||
    (target.actionDelayTicksRemaining ?? 0) < 50) {
    throw new Error(`Unexpected seeded skill-2 state: ${JSON.stringify(state)}`);
  }
  // The first test runtime is written during Phaser's update callback. Let the
  // corresponding render complete before recording a visual checkpoint.
  await delay(750);
  await capture('map27-skill2-start', '01-map27-skill2-start.png');
  return state;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  await launch();
  const start = await startScenario();
  const charged = await waitFor((state) => state?.snapshot?.skillAction.skillId === 2 &&
    state.snapshot.skillAction.chargeTicksRemaining[0] === 0 &&
    state.snapshot.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24)?.hp === 43,
  'skill ID 2 level 0 charge', 30000);
  await capture('skill2-charge-ready', '02-skill2-charge-ready.png');
  const touchControl = await touchSkillButton('skill1');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 2 &&
    state.snapshot.skillAction.phase !== 0, 'skill ID 2 action starts');
  captures.push({ at: new Date().toISOString(), label: 'skill2-action-started', state: started });
  await capture('skill2-action-started', '04-skill2-action-started.png');
  const hit = await waitFor((state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
    return state?.mapId === 27 && target?.hp === 0 && target.state === 'death-pending';
  }, 'skill ID 2 level 0 hits enemy 24 at distance two', 8000);
  await capture('skill2-target-hit', '03-skill2-target-hit.png');
  const target = hit.snapshot.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24);
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const skillAction = hit.snapshot.skillAction;
  const passed = hit.profile === 'max-level' && hit.level === 99 && hit.hp === hit.snapshot.resources.maxHp &&
    hit.tileX === start.tileX && hit.tileY === start.tileY && skillAction.skillId === 2 &&
    skillAction.skillRank === 1 && skillAction.levelSlot === 0 && skillAction.phase === 3 &&
    skillAction.effectAge >= 3 &&
    target?.hp === 0 && target.state === 'death-pending' && touchControl.activeWhileHeld &&
    touchControl.visible && touchControl.coarsePointer && touchControl.maxTouchPoints >= 1 && pageErrors.length === 0;
  const result = {
    id: 'M1002', attempt, profile: 'max-level', scenario: 'map27-class6-skill2', passed,
    start, startTarget: start.snapshot.enemies.find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24),
    charged, started, touchControl, hit, target, captures, errors: pageErrors,
    route: 'visible New Game -> seeded max-level Map27 in 360x640 Chromium touch emulation -> wait for source charge -> tap Skill 1 touch control -> forward pulse defeats enemy 24/order 14',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, viewport: [360, 640], touchEmulation: true,
      temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1002 mobile skill-2 browser criteria failed: ${JSON.stringify({ start, charged, started, hit, target, pageErrors })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    start: { mapId: start.mapId, tile: [start.tileX, start.tileY], level: start.level,
      hp: start.hp, maxHp: start.snapshot.resources.maxHp, skillId: start.snapshot.skillAction.skillId },
    charge: { slot0: charged.snapshot.skillAction.chargeTicksRemaining[0], targetDelay: charged.snapshot.enemies
      .find((enemy) => enemy.sourceOrder === 14 && enemy.enemyId === 24)?.actionDelayTicksRemaining },
    action: { skillId: skillAction.skillId, levelSlot: skillAction.levelSlot, phase: skillAction.phase,
      effectAge: skillAction.effectAge, tile: [skillAction.tileX, skillAction.tileY] },
    final: { mapId: hit.mapId, tile: [hit.tileX, hit.tileY], level: hit.level, hp: hit.hp,
      maxHp: hit.snapshot.resources.maxHp, targetHp: target?.hp, targetState: target?.state,
      targetTile: target === undefined ? null : [target.tileX, target.tileY] },
    touchControl,
    browserErrors: pageErrors.length, artifacts: `reference/screenshots/web-render/M1002-mobile-touch-map27-skill2/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1002', attempt, profile: 'max-level', scenario: 'map27-class6-skill2', passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1002', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      skillAction: captures.at(-1)?.state?.snapshot?.skillAction,
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
