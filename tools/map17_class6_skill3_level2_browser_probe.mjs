#!/usr/bin/env node

/** Verify skill ID 3 level 2 against a source-compatible element-1 enemy on Map17. */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1060_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('M1060 attempt must be from 1 to 3');
const outDir = join(root, `reference/screenshots/web-render/M1060-skill3-level2-element1/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1060-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map17-class6-skill3-level2';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map17-class6-skill3-level2') {
  throw new Error('M1060 requires the local DEV max-level Map17 element-1 skill-3 scenario');
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
  const state = await waitFor((candidate) => {
    const target = candidate?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
    return candidate?.mapId === 17 && candidate.scenario === 'map17-class6-skill3-level2' &&
      candidate.tileX === 5 && candidate.tileY === 11 && target?.tileX === 6 && target.tileY === 11 &&
      target.hp === 183 && (target.actionDelayTicksRemaining ?? 0) >= 100 &&
      candidate.snapshot.skillAction.skillId === 3;
  }, 'Map17 skill-3 element-1 scenario after seeded enemies load');
  const target = state.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
  if (state.profile !== 'max-level' || state.level !== 99 || state.tileX !== 5 || state.tileY !== 11 ||
    state.snapshot?.player?.direction !== 4 ||
    state.snapshot?.skillAction.skillId !== 3 || state.snapshot.skillAction.skillRank !== 20 ||
    state.snapshot.skillAction.skillLevelSlotOne !== 0 || state.snapshot.skillAction.skillLevelSlotThree !== 1 ||
    state.snapshot.skillAction.chargeTicksRemaining[2] !== 0 ||
    state.snapshot.skillAction.phase !== 0 ||
    state.hp !== state.snapshot.resources.maxHp ||
    target?.tileX !== 6 || target.tileY !== 11 || target.hp !== 183 ||
    (target.actionDelayTicksRemaining ?? 0) < 100) {
    throw new Error(`Unexpected seeded skill-3 element-1 state: ${JSON.stringify(state)}`);
  }
  // The first test runtime is written during Phaser's update callback. Let the
  // corresponding render complete before recording a visual checkpoint.
  await delay(750);
  await capture('map17-skill3-start', '01-map17-skill3-start.png');
  return state;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  await launch();
  const start = await startScenario();
  await keyTap('w', 'KeyW', 87, 'w');
  await capture('system-menu', '02-system-menu.png');
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('ArrowDown', 'ArrowDown', 40);
  await keyTap('Enter', 'Enter', 13);
  await capture('skill-menu', '03-skill-menu.png');
  await keyTap('Tab', 'Tab', 9);
  await capture('skill-level-menu-before-assignment', '04-skill-level-menu-before.png');
  await keyTap('ArrowUp', 'ArrowUp', 38);
  await keyTap('Enter', 'Enter', 13);
  const assigned = await waitFor((state) => state?.snapshot?.skillAction.skillId === 3 &&
    state.snapshot.skillAction.skillLevelSlotOne === 2 &&
    state.snapshot.skillAction.skillLevelSlotThree === 1,
  'visible Skills menu assigns level 2 to action button 1');
  await capture('skill-level-2-assigned-to-button-1', '05-skill-level-2-assigned.png');
  await keyTap('Escape', 'Escape', 27);
  await keyTap('Escape', 'Escape', 27);
  await keyTap('Escape', 'Escape', 27);
  const charged = await waitFor((state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
    return state?.snapshot?.skillAction.skillId === 3 &&
      state.snapshot.skillAction.skillLevelSlotOne === 2 &&
      state.snapshot.skillAction.chargeTicksRemaining[2] === 0 &&
      state.tileX === 5 && state.tileY === 11 && target?.state === 'alive' && target.hp === 183 &&
      target.tileY === 11 && target.tileX === 6;
  }, 'skill ID 3 level 2 charge with element-1 enemy 8 in the forward sweep', 30000);
  await capture('skill3-level2-charge-ready', '06-skill3-level2-charge-ready.png');
  await keyTap('1', 'Numpad1', 97, '1');
  const started = await waitFor((state) => state?.snapshot?.skillAction.skillId === 3 &&
    state.snapshot.skillAction.levelSlot === 2 && state.snapshot.skillAction.phase !== 0,
  'skill ID 3 level 2 Numpad1 action starts');
  captures.push({ at: new Date().toISOString(), label: 'skill3-level2-action-started', state: started });
  await delay(1200);
  const afterStartDelay = await runtime();
  captures.push({ at: new Date().toISOString(), label: 'after-start-delay-1200ms', state: afterStartDelay });
  const hit = await waitFor((state) => {
    const target = state?.snapshot?.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
    return state?.mapId === 17 && state.snapshot.skillAction.skillId === 3 &&
      state.snapshot.skillAction.levelSlot === 2 && target?.hp === 0 && target.state === 'death-pending';
  }, 'skill ID 3 level 2 forward sweep defeats element-1 enemy 8/order 2', 8000);
  await capture('skill3-level2-target-hit', '07-skill3-level2-target-hit.png');
  const target = hit.snapshot.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8);
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const skillAction = hit.snapshot.skillAction;
  const passed = start.profile === 'max-level' && start.level === 99 && start.hp === start.snapshot.resources.maxHp &&
    start.snapshot.skillAction.skillId === 3 && start.snapshot.skillAction.skillRank === 20 &&
    start.snapshot.skillAction.skillLevelSlotOne === 0 && start.snapshot.skillAction.skillLevelSlotThree === 1 &&
    assigned.snapshot.skillAction.skillLevelSlotOne === 2 && assigned.snapshot.skillAction.skillLevelSlotThree === 1 &&
    charged.snapshot.skillAction.chargeTicksRemaining[2] === 0 &&
    charged.tileX === start.tileX && charged.tileY === start.tileY &&
    started.snapshot.skillAction.levelSlot === 2 && started.snapshot.skillAction.phase !== 0 &&
    skillAction.skillId === 3 && skillAction.skillRank >= 20 && skillAction.levelSlot === 2 &&
    skillAction.phase !== 0 && hit.level === 99 && hit.hp > 0 && hit.hp <= hit.snapshot.resources.maxHp &&
    target?.hp === 0 && target.state === 'death-pending' && pageErrors.length === 0;
  const result = {
    id: 'M1060', attempt, profile: 'max-level', scenario: 'map17-class6-skill3-level2', passed,
    start, assigned, charged, activationInput: 'Numpad1', started, afterStartDelay, hit, target, captures, errors: pageErrors,
    route: 'visible New Game -> DEV max-level Map17 scenario with real enemy 8/order 2 (element 1) in range -> visible System/Skills menus assign level 2 to button 1 -> Numpad1 -> source-matching level-2 sweep defeats the enemy',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, viewport: [780, 420],
      temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1060 skill-3 level-2 browser criteria failed: ${JSON.stringify({ start, assigned, charged, started, afterStartDelay, hit, target, pageErrors })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed, profile: result.profile,
    start: { mapId: start.mapId, tile: [start.tileX, start.tileY], level: start.level,
      hp: start.hp, maxHp: start.snapshot.resources.maxHp, skillId: start.snapshot.skillAction.skillId,
      skillRank: start.snapshot.skillAction.skillRank },
    assignment: { button1: assigned.snapshot.skillAction.skillLevelSlotOne,
      button3: assigned.snapshot.skillAction.skillLevelSlotThree },
    charge: { slot2: charged.snapshot.skillAction.chargeTicksRemaining[2], targetTile:
      [charged.snapshot.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8)?.tileX,
        charged.snapshot.enemies.find((enemy) => enemy.sourceOrder === 2 && enemy.enemyId === 8)?.tileY] },
    action: { skillId: skillAction.skillId, skillRank: skillAction.skillRank,
      levelSlot: skillAction.levelSlot, phase: skillAction.phase, effectAge: skillAction.effectAge,
      tile: [skillAction.tileX, skillAction.tileY] },
    final: { mapId: hit.mapId, tile: [hit.tileX, hit.tileY], level: hit.level, hp: hit.hp,
      maxHp: hit.snapshot.resources.maxHp, targetHp: target?.hp, targetState: target?.state,
      targetTile: target === undefined ? null : [target.tileX, target.tileY] },
    activationInput: 'Numpad1', browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1060-skill3-level2-element1/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1060', attempt, profile: 'max-level', scenario: 'map17-class6-skill3-level2', passed: false,
    captures, errors, error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1060', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state === undefined ? null : {
      label: captures.at(-1)?.label, mapId: captures.at(-1)?.state?.mapId,
      tile: [captures.at(-1)?.state?.tileX, captures.at(-1)?.state?.tileY],
      skillAction: captures.at(-1)?.state?.snapshot?.skillAction,
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
