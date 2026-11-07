#!/usr/bin/env node

/** Check Left movement after the natural DEV max-level New Game route reaches Map64. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1161_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1161 attempt must be from 1 to 3');
}
const mapId = 64;
const scenario = null;
const outDir = join(root, `reference/screenshots/M1161-map64-natural-left-route/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1161-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = 'http://127.0.0.1:5174/?testProfile=max-level';

let chrome;
let ws;
let page;
let stderr = '';
const events = [];
const captures = [];
let lastRuntimeState = null;

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
  const canvasDeadline = Date.now() + 30000;
  while (Date.now() < canvasDeadline) {
    if (await page.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await page.send('Page.bringToFront');
  await delay(1000);
}

async function runtime() {
  lastRuntimeState = await page.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let snapshot = null;
    let spritePose = null;
    let inputState = null;
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    try { spritePose = JSON.parse(host.dataset.testPlayerSpritePose ?? 'null'); } catch {}
    try { inputState = JSON.parse(host.dataset.testPlayerInputState ?? 'null'); } catch {}
    const game = window.__heroesLoreDebugGame;
    const scene = game?.scene?.getScenes?.(true)?.find((candidate) => candidate.scene?.key === 'WorldScene');
    const activeMap = scene?.maps?.get(scene.currentMapId);
    const collision = activeMap?.world?.collision;
    const collisionNeighborhood = [6, 7, 8, 9].map((tileY) => ({
      tileY,
      values: [5, 6, 7, 8, 9].map((tileX) => ({
        tileX,
        value: collision?.values?.[tileY]?.[tileX] ?? null,
      })),
    }));
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      spritePose, inputState, collisionNeighborhood, snapshot,
    };
  })()`);
  return lastRuntimeState;
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

async function keyTap(key, code, vk) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(160);
}

async function capture(label, filename) {
  const snapshot = await page.evaluate(`new Promise((resolve, reject) => {
    const game = window.__heroesLoreDebugGame;
    if (!game || typeof game.renderer?.snapshot !== 'function') {
      reject(new Error('Phaser WebGL snapshot is unavailable'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Timed out waiting for a post-render snapshot')), 5000);
    game.renderer.snapshot((image) => {
      try {
        const host = document.querySelector('#game');
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not copy the renderer snapshot');
        context.drawImage(image, 0, 0);
        const parse = (value) => { try { return JSON.parse(value ?? 'null'); } catch { return null; } };
        const state = {
          profile: host?.dataset.testProfile ?? null,
          scenario: host?.dataset.testScenario ?? null,
          mapId: host?.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
          tileX: host?.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
          tileY: host?.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
          hp: host?.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
          level: host?.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
          mapPreviewReady: host?.dataset.testMapPreviewReady === 'true',
          spritePose: parse(host?.dataset.testPlayerSpritePose),
          snapshot: parse(host?.dataset.testRuntime),
        };
        const scene = game.scene.getScenes(true).find((candidate) => candidate.scene?.key === 'WorldScene');
        const actor = scene?.actor;
        state.renderedActor = actor === undefined ? null : {
          animationSlot: actor.moving ? 1 : 0,
          directionSlot: actor.direction - 1,
          frameIndex: actor.moving ? Math.max(0, actor.animationFrame) : 0,
          movementCursor: actor.animationFrame,
          moving: actor.moving,
          pixelX: actor.x,
          pixelY: actor.y,
          heroTextures: [...(scene.heroParts?.values?.() ?? [])]
            .filter((part) => part.visible)
            .map((part) => ({ key: part.texture?.key ?? null, x: part.x, y: part.y, flipX: part.flipX }))
            .sort((left, right) => String(left.key).localeCompare(String(right.key))),
        };
        clearTimeout(timer);
        resolve({ state, dataUrl: canvas.toDataURL('image/png'), width: image.width, height: image.height });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    }, 'image/png');
  })`);
  if (!snapshot?.dataUrl?.startsWith('data:image/png;base64,')) {
    throw new Error(`Invalid Phaser snapshot result for ${label}`);
  }
  const bytes = Buffer.from(snapshot.dataUrl.slice('data:image/png;base64,'.length), 'base64');
  await writeFile(join(outDir, filename), bytes);
  captures.push({ at: new Date().toISOString(), label, state: snapshot.state, file: filename,
    dimensions: [snapshot.width, snapshot.height], captureMethod: 'Phaser WebGL renderer.snapshot after rendered frame',
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength });
  return snapshot.state;
}

async function captureRenderedWalkFrames(direction) {
  return await page.evaluate(`new Promise((resolve, reject) => {
    const game = window.__heroesLoreDebugGame;
    const directionSlot = ${direction.directionSlot};
    const captured = new Map();
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error('Timed out capturing all four rendered walk frames'));
    }, 5000);
    const renderedState = () => {
      const host = document.querySelector('#game');
      const scene = game?.scene?.getScenes(true).find((candidate) => candidate.scene?.key === 'WorldScene');
      const actor = scene?.actor;
      if (actor === undefined) return null;
      return {
        profile: host?.dataset.testProfile ?? null,
        scenario: host?.dataset.testScenario ?? null,
        mapId: host?.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
        level: host?.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
        hp: host?.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
        tileX: actor.x >> 4,
        tileY: actor.y >> 4,
        renderedActor: {
          animationSlot: actor.moving ? 1 : 0,
          directionSlot: actor.direction - 1,
          frameIndex: actor.moving ? Math.max(0, actor.animationFrame) : 0,
          movementCursor: actor.animationFrame,
          moving: actor.moving,
          pixelX: actor.x,
          pixelY: actor.y,
          heroTextures: [...(scene.heroParts?.values?.() ?? [])]
            .filter((part) => part.visible)
            .map((part) => ({ key: part.texture?.key ?? null, x: part.x, y: part.y, flipX: part.flipX }))
            .sort((left, right) => String(left.key).localeCompare(String(right.key))),
        },
      };
    };
    const pump = () => {
      if (finished) return;
      const before = renderedState();
      if (before === null || before.renderedActor.moving !== true ||
        before.renderedActor.directionSlot !== directionSlot || before.renderedActor.movementCursor < 0 ||
        captured.has(before.renderedActor.frameIndex)) {
        requestAnimationFrame(pump);
        return;
      }
      if (typeof game.renderer?.snapshot !== 'function') {
        finished = true;
        clearTimeout(timeout);
        reject(new Error('Phaser WebGL snapshot is unavailable'));
        return;
      }
      game.renderer.snapshot((image) => {
        if (finished) return;
        try {
          const state = renderedState();
          const pose = state?.renderedActor;
          if (state !== null && pose?.moving === true && pose.directionSlot === directionSlot &&
            pose.movementCursor >= 0 && pose.frameIndex <= 3 && !captured.has(pose.frameIndex)) {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not copy the renderer snapshot');
            context.drawImage(image, 0, 0);
            captured.set(pose.frameIndex, {
              frameIndex: pose.frameIndex,
              state,
              dataUrl: canvas.toDataURL('image/png'),
              width: image.width,
              height: image.height,
            });
          }
          if (captured.size === 4) {
            finished = true;
            clearTimeout(timeout);
            resolve([0, 1, 2, 3].map((frame) => captured.get(frame)));
          } else {
            requestAnimationFrame(pump);
          }
        } catch (error) {
          finished = true;
          clearTimeout(timeout);
          reject(error);
        }
      }, 'image/png');
    };
    pump();
  })`);
}

function browserErrors() {
  return events.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
}

async function run() {
  await mkdir(dirname(outDir), { recursive: true });
  await mkdir(outDir);
  await launch();
  await capture('cold title', '00-title.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const opening = await waitFor((state) => state?.profile === 'max-level' && state.mapId === 0 &&
    state.level === 99 && state.hp === 394392,
  'fresh max-level New Game at the opening scene', 30000);
  await capture('natural New Game opening at Map0', '01-map0-opening.png');
  await delay(9000);
  await keyTap('w', 'KeyW', 87);
  const arrival = await waitFor((state) => state?.profile === 'max-level' && state.scenario === null &&
    state.mapId === mapId && state.level === 99 && state.hp === 394392,
  'Map64 through the visible New Game W/Skip route', 30000);
  await delay(200);
  let dialogueInputs = 0;
  while (dialogueInputs < 12) {
    const current = await runtime();
    if (current?.snapshot?.dialogueOpen !== true) break;
    await keyTap('Enter', 'Enter', 13);
    dialogueInputs += 1;
  }
  const map64Idle = await waitFor((state) => state?.profile === 'max-level' && state.scenario === null &&
    state.mapId === mapId && state.level === 99 && state.hp === 394392 &&
    state.spritePose?.moving === false && state.spritePose?.animationSlot === 0,
  'idle actor after natural Map64 arrival', 10000);
  await capture('natural Map64 arrival before reposition', '02-map64-arrival.png');

  const repositionSteps = [];
  let position = map64Idle;
  for (let step = 0; step < 2; step += 1) {
    const target = { tileX: position.tileX - 1, tileY: position.tileY };
    const params = { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    let moved;
    try {
      moved = await waitFor((state) => state?.mapId === mapId &&
        state.tileX === target.tileX && state.tileY === target.tileY,
      `visible Left reposition to (${target.tileX},${target.tileY})`, 5000);
    } finally {
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    }
    const settled = await waitFor((state) => state?.mapId === mapId &&
      state.tileX === target.tileX && state.tileY === target.tileY &&
      state.spritePose?.moving === false && state.spritePose?.animationSlot === 0,
    `idle at Map64 tile (${target.tileX},${target.tileY})`, 5000);
    repositionSteps.push({ target, moved, settled });
    position = settled;
  }
  const start = await runtime();
  await capture('natural Map64 idle at source comparison tile', '03-map64-left-start.png');
  const params = { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  let during;
  try {
    await delay(350);
    during = await runtime();
  } finally {
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  await delay(300);
  const end = await runtime();
  await capture('natural Map64 after 350 ms visible Left hold', '04-map64-left-end.png');
  const failures = browserErrors();
  const passed = arrival.tileX === 9 && arrival.tileY === 8 && start.tileX === 7 && start.tileY === 8 &&
    end.mapId === mapId && end.tileX === 5 && end.tileY === 7 &&
    end.level === 99 && end.hp === 394392 && failures.length === 0;
  const result = {
    id: 'M1161', attempt, passed, profile: 'max-level', scenario,
    opening, arrival, start, repositionSteps, dialogueInputs, during, end, captures, browserErrors: failures,
    sourceReference: { mapId: 64, from: [7, 8], visibleLeftHoldMs: 350, to: [5, 7], evidence: 'M1160 source attempt 2' },
    route: 'visible New Game -> W/Skip to natural Map64 entry -> two visible Left steps to (7,8) -> 350 ms visible Left hold',
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false,
      originalJarAccessed: false, directMapStart: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ id: 'M1161', attempt, passed,
    map64Arrival: [arrival.tileX, arrival.tileY], leftStart: [start.tileX, start.tileY],
    leftEnd: [end.tileX, end.tileY], level: end.level, hp: end.hp,
    browserErrors: failures.length, artifacts: `reference/screenshots/M1161-map64-natural-left-route/attempt-${attempt}` })}\n`);
  if (!passed) process.exitCode = 1;
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
  const partial = { id: 'M1161', attempt, profile: 'max-level', scenario, passed: false, captures, events,
    lastRuntimeState,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1161', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
