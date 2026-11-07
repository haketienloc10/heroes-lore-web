#!/usr/bin/env node

/** Capture Map64 left/right class-6 walk cycles in its open south corridor. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1151_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1151 attempt must be from 1 to 3');
}
const mapId = 64;
const scenario = `map-preview-${mapId}`;
const outDir = join(root, `reference/screenshots/web-render/M1151-map64-horizontal-walk/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1151-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;

let chrome;
let ws;
let page;
let stderr = '';
const events = [];
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
  return await page.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let snapshot = null;
    let spritePose = null;
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    try { spritePose = JSON.parse(host.dataset.testPlayerSpritePose ?? 'null'); } catch {}
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      spritePose, snapshot,
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
  const previewSpawn = await waitFor((state) => state?.profile === 'max-level' && state.scenario === scenario &&
    state.mapId === mapId && state.level === 99 && state.mapPreviewReady && state.spritePose?.animationSlot === 0 &&
    state.spritePose?.moving === false, 'idle player pose in the Map64 New Game scenario');
  const reposition = ['down', 'right', 'right', 'right', 'down', 'down', 'down', 'down', 'down', 'down', 'down'];
  const keys = {
    up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38, dx: 0, dy: -1 },
    down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, dx: 0, dy: 1 },
    left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37, dx: -1, dy: 0 },
    right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39, dx: 1, dy: 0 },
  };
  const repositionSteps = [];
  let position = previewSpawn;
  for (const name of reposition) {
    const key = keys[name];
    const target = { tileX: position.tileX + key.dx, tileY: position.tileY + key.dy };
    const params = { key: key.key, code: key.code, windowsVirtualKeyCode: key.vk };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    let moved;
    try {
      moved = await waitFor((state) => state?.mapId === mapId &&
        state.tileX === target.tileX && state.tileY === target.tileY,
      `visible ${name} reposition to (${target.tileX},${target.tileY})`, 5000);
    } finally {
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    }
    const settled = await waitFor((state) => state?.mapId === mapId &&
      state.tileX === target.tileX && state.tileY === target.tileY &&
      state.spritePose?.moving === false && state.spritePose?.animationSlot === 0,
    `idle at Map64 reposition tile (${target.tileX},${target.tileY})`, 5000);
    repositionSteps.push({ direction: name, target, moved, settled });
    position = settled;
  }
  const repositionResult = { from: previewSpawn, directions: reposition, steps: repositionSteps,
    target: { tileX: position.tileX, tileY: position.tileY } };
  const start = await waitFor((state) => state?.profile === 'max-level' && state.scenario === scenario &&
    state.mapId === mapId && state.level === 99 && state.mapPreviewReady && state.spritePose?.animationSlot === 0 &&
    state.spritePose?.moving === false, 'idle class-6 player at the Map64 four-way walk route');
  await delay(150);
  await capture('Map64 idle before left/right walk cycles', '01-map64-horizontal-start.png');

  const directions = [
    { name: 'left', key: 'ArrowLeft', code: 'ArrowLeft', vk: 37, directionSlot: 2 },
    { name: 'right', key: 'ArrowRight', code: 'ArrowRight', vk: 39, directionSlot: 3 },
  ];
  const directionalRuns = [];
  let captureIndex = 2;
  for (const direction of directions) {
    const params = { key: direction.key, code: direction.code, windowsVirtualKeyCode: direction.vk };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    let renderedFrames;
    try {
      renderedFrames = await captureRenderedWalkFrames(direction);
    } finally {
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    }
    const walkStart = renderedFrames.find(({ frameIndex }) => frameIndex === 0)?.state ?? null;
    const frames = renderedFrames.map(({ frameIndex }) => frameIndex);
    const renderedPoses = renderedFrames.map(({ state }) => state.renderedActor);
    for (const frame of renderedFrames) {
      const filename = `${String(captureIndex++).padStart(2, '0')}-${direction.name}-walk-frame-${frame.frameIndex}.png`;
      const bytes = Buffer.from(frame.dataUrl.slice('data:image/png;base64,'.length), 'base64');
      await writeFile(join(outDir, filename), bytes);
      captures.push({ at: new Date().toISOString(), label: `${direction.name} walk frame ${frame.frameIndex}`,
        state: frame.state, file: filename, dimensions: [frame.width, frame.height],
        captureMethod: 'Phaser WebGL renderer.snapshot sampled from its in-page render loop',
        sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength });
    }
    const idle = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === false &&
      state.spritePose?.animationSlot === 0 && state.spritePose?.directionSlot === direction.directionSlot &&
      state.spritePose?.frameIndex === 0,
    `${direction.name} idle slot 0 after release`, 5000);
    const idleCapture = await capture(`${direction.name} idle after release`,
      `${String(captureIndex++).padStart(2, '0')}-${direction.name}-idle-after-release.png`);
    directionalRuns.push({
      direction: direction.name,
      directionSlot: direction.directionSlot,
      walkStart,
      frames,
      renderedPoses,
      idle,
      idleCapturePose: idleCapture.renderedActor,
    });
  }
  const failures = browserErrors();
  const passed = start.spritePose.animationSlot === 0 && start.spritePose.frameIndex === 0 &&
    directionalRuns.length === 2 && directionalRuns.every((run, index) =>
      run.directionSlot === index + 2 && run.frames.join(',') === '0,1,2,3' &&
      run.renderedPoses.every((pose, frame) => pose?.animationSlot === 1 &&
        pose.directionSlot === index + 2 && pose.frameIndex === frame) &&
      run.walkStart.renderedActor.frameIndex === 0 && run.idleCapturePose.animationSlot === 0 &&
      run.idleCapturePose.directionSlot === index + 2 && run.idleCapturePose.frameIndex === 0) && failures.length === 0;
  const result = {
    id: 'M1151', attempt, passed, profile: 'max-level', scenario,
    start, directionalRuns, captures, browserErrors: failures,
    reposition: repositionResult,
    route: `visible New Game -> DEV Map64 preview -> visible route from (${previewSpawn.tileX},${previewSpawn.tileY}) to (${position.tileX},${position.tileY}) -> Left/Right walk cycles with a release to idle between directions`,
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1151 Map64 horizontal walk criteria failed: ${JSON.stringify({ start, directionalRuns, failures })}`);
  process.stdout.write(`${JSON.stringify({ id: 'M1151', attempt, passed, mapId: start.mapId,
    directions: directionalRuns.map(({ direction, directionSlot, frames, idleCapturePose }) =>
      ({ direction, directionSlot, frames, idleCapturePose })),
    browserErrors: failures.length, artifacts: `reference/screenshots/web-render/M1151-map64-horizontal-walk/attempt-${attempt}` })}\n`);
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
  const partial = { id: 'M1151', attempt, profile: 'max-level', scenario, passed: false, captures, events,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1151', attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
