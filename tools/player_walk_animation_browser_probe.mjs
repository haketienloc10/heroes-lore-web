#!/usr/bin/env node

/** Capture every class-6 walking frame from a visible max-level New Game. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_WALK_ATTEMPT ?? process.env.HEROES_LORE_M1037_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('Player walk probe attempt must be from 1 to 3');
}
const mapId = Number(process.env.HEROES_LORE_WALK_MAP ?? 76);
if (!Number.isInteger(mapId) || mapId < 0 || mapId > 255) {
  throw new Error('Player walk probe map must be an integer from 0 to 255');
}
const milestoneId = process.env.HEROES_LORE_WALK_MILESTONE ?? 'M1037';
const scenario = `map-preview-${mapId}`;
const directionName = (process.env.HEROES_LORE_WALK_DIRECTION ?? 'down').toLowerCase();
const direction = {
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38, directionSlot: 0 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, directionSlot: 1 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37, directionSlot: 2 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39, directionSlot: 3 },
}[directionName];
if (direction === undefined) throw new Error('Player walk probe direction must be up, down, left, or right');
const preMoveNames = (process.env.HEROES_LORE_WALK_PRE_MOVE ?? '').toLowerCase()
  .split(',').map((name) => name.trim()).filter((name) => name !== '');
const preMoveOptions = {
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38, dx: 0, dy: -1 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40, dx: 0, dy: 1 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37, dx: -1, dy: 0 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39, dx: 1, dy: 0 },
};
const preMoveDirections = preMoveNames.map((name) => preMoveOptions[name]);
if (preMoveDirections.some((direction) => direction === undefined)) {
  throw new Error('Player walk pre-move steps must be up, down, left, or right');
}
const walkCycles = Number(process.env.HEROES_LORE_WALK_CYCLES ?? 2);
if (!Number.isInteger(walkCycles) || walkCycles < 1 || walkCycles > 2) {
  throw new Error('Player walk probe cycles must be 1 or 2');
}
const captureWalkTimeline = process.env.HEROES_LORE_WALK_TIMELINE === '1';
const outDir = join(root, `reference/screenshots/web-render/${milestoneId}-player-walk-frames/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), `heroes-lore-${milestoneId.toLowerCase()}-`));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = `http://127.0.0.1:5174/?testProfile=max-level&testScenario=${scenario}`;

let chrome;
let ws;
let page;
let stderr = '';
const events = [];
const captures = [];
let preMove = null;

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

async function startWalkTimeline() {
  if (!captureWalkTimeline) return;
  await page.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) throw new Error('Game telemetry host is unavailable');
    const timeline = { enabled: true, startedAtMs: performance.now(), rafSamples: 0,
      changes: [], lastSignature: null };
    window.__heroesLoreWalkTimeline = timeline;
    const sample = (rafTimestampMs) => {
      if (!timeline.enabled) return;
      timeline.rafSamples += 1;
      try {
        const pose = JSON.parse(document.querySelector('#game')?.dataset.testPlayerSpritePose ?? 'null');
        if (pose !== null) {
          const signature = [pose.moving, pose.animationSlot, pose.frameIndex, pose.directionSlot].join(':');
          if (signature !== timeline.lastSignature) {
            timeline.changes.push({ rafTimestampMs, relativeMs: rafTimestampMs - timeline.startedAtMs, pose });
            timeline.lastSignature = signature;
          }
        }
      } catch {}
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
}

async function stopWalkTimeline() {
  if (!captureWalkTimeline) return null;
  return await page.evaluate(`(() => {
    const timeline = window.__heroesLoreWalkTimeline;
    if (!timeline) return null;
    timeline.enabled = false;
    return { startedAtMs: timeline.startedAtMs, stoppedAtMs: performance.now(),
      rafSamples: timeline.rafSamples, changes: timeline.changes };
  })()`);
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
    state.spritePose?.moving === false, `idle player pose in the Map${mapId} New Game scenario`);
  if (preMoveDirections.length > 0) {
    const steps = [];
    let current = previewSpawn;
    for (let index = 0; index < preMoveDirections.length; index += 1) {
      const directionName = preMoveNames[index];
      const preMoveDirection = preMoveDirections[index];
      const target = { tileX: current.tileX + preMoveDirection.dx, tileY: current.tileY + preMoveDirection.dy };
      const preParams = { key: preMoveDirection.key, code: preMoveDirection.code,
        windowsVirtualKeyCode: preMoveDirection.vk };
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...preParams });
      let movement;
      try {
        movement = await waitFor((state) => state?.mapId === mapId && state.tileX === target.tileX &&
          state.tileY === target.tileY, `one visible ${directionName} step to (${target.tileX},${target.tileY})`, 5000);
      } finally {
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...preParams });
      }
      const settled = await waitFor((state) => state?.mapId === mapId && state.tileX === target.tileX &&
        state.tileY === target.tileY && state.spritePose?.moving === false && state.spritePose?.animationSlot === 0,
      `idle at the one-step ${directionName} destination`, 5000);
      steps.push({ direction: directionName, target, from: current, movement, settled });
      current = settled;
    }
    preMove = { directions: preMoveNames, target: { tileX: current.tileX, tileY: current.tileY },
      from: previewSpawn, steps };
    await delay(120);
    await capture(`idle after visible ${preMoveNames.join(',')} reposition`, '01b-prewalk-idle.png');
  }
  const start = await waitFor((state) => state?.profile === 'max-level' && state.scenario === scenario &&
    state.mapId === mapId && state.level === 99 && state.mapPreviewReady && state.spritePose?.animationSlot === 0 &&
    state.spritePose?.moving === false, `idle player pose in the Map${mapId} New Game scenario`);
  await delay(150);
  await capture('idle slot 0 frame 0', '01-idle-slot-0.png');

  const params = { key: direction.key, code: direction.code, windowsVirtualKeyCode: direction.vk };
  await startWalkTimeline();
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  const walkingFrames = [];
  let walkTimeline = null;
  let walkStart;
  try {
    walkStart = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === true &&
      state.spritePose?.animationSlot === 1 && state.spritePose?.frameIndex === 0,
    `walking slot 1 frame 0 after visible ${directionName} input`, 3000);
    const firstWalkCapture = await capture('walking slot 1 frame 0', '02-walk-frame-0.png');
    walkingFrames.push(firstWalkCapture.spritePose.frameIndex);
    for (const frameIndex of (walkCycles === 1 ? [1, 2, 3] : [1, 2, 3, 0])) {
      const observed = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === true &&
        state.spritePose?.animationSlot === 1 && state.spritePose?.frameIndex === frameIndex,
      `walking slot 1 frame ${frameIndex}`, 5000);
      const frameCapture = await capture(`walking slot 1 frame ${frameIndex}`,
        `walk-frame-${frameIndex}-${walkingFrames.length}.png`);
      walkingFrames.push(frameCapture.spritePose.frameIndex);
    }
    if (walkCycles === 2) {
      for (const frameIndex of [1, 2, 3]) {
        const observed = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === true &&
          state.spritePose?.animationSlot === 1 && state.spritePose?.frameIndex === frameIndex,
        `walking slot 1 second-cycle frame ${frameIndex}`, 5000);
        walkingFrames.push(observed.spritePose.frameIndex);
      }
    }
  } finally {
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  const idleAgain = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === false &&
    state.spritePose?.animationSlot === 0, `idle pose slot 0 after releasing ${directionName}`);
  walkTimeline = await stopWalkTimeline();
  await delay(120);
  await capture('idle slot 0 after release', '08-idle-after-release.png');

  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  let restartedWalk;
  try {
    restartedWalk = await runtime();
    if (restartedWalk?.spritePose?.moving !== true) {
      restartedWalk = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === true &&
        state.spritePose?.animationSlot === 1, `second visible ${directionName} hold starts walking`, 3000);
    }
    await capture(`second ${directionName} hold starts from walk frame 0`, '09-second-walk-start-frame-0.png');
  } finally {
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  const finalIdle = await waitFor((state) => state?.mapId === mapId && state.spritePose?.moving === false &&
    state.spritePose?.animationSlot === 0, `idle after the second ${directionName} hold`);
  await capture(`idle after second ${directionName} hold`, '10-final-idle.png');
  const failures = browserErrors();
  const expectedWalkFrames = walkCycles === 1 ? '0,1,2,3' : '0,1,2,3,0,1,2,3';
  const passed = start.spritePose.animationSlot === 0 && start.spritePose.frameIndex === 0 &&
    walkingFrames.join(',') === expectedWalkFrames && walkStart.spritePose.frameIndex === 0 &&
    walkStart.spritePose.directionSlot === direction.directionSlot &&
    idleAgain.spritePose.animationSlot === 0 && idleAgain.spritePose.frameIndex === 0 &&
    restartedWalk.spritePose.moving === true && restartedWalk.spritePose.animationSlot === 1 &&
    restartedWalk.spritePose.frameIndex === 0 && restartedWalk.spritePose.directionSlot === direction.directionSlot &&
    finalIdle.spritePose.frameIndex === 0 && finalIdle.spritePose.directionSlot === direction.directionSlot && failures.length === 0;
  const result = {
    id: milestoneId, attempt, passed, profile: 'max-level', scenario, direction: directionName, walkCycles,
    start, preMove, walkStart, walkingFrames, idleAgain, walkTimeline, restartedWalk, finalIdle, captures, browserErrors: failures,
    route: `visible New Game -> DEV map-${mapId} preview${preMove === null ? '' : ` -> visible ${preMoveNames.join(',')} reposition to (${preMove.target.tileX},${preMove.target.tileY})`} -> sample walk frames 0-3 during held ${directionName} -> release -> start a second ${directionName} walk at frame 0`,
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`${milestoneId} player animation criteria failed: ${JSON.stringify({ start, walkStart, walkingFrames, idleAgain, restartedWalk, finalIdle, failures })}`);
  process.stdout.write(`${JSON.stringify({ id: milestoneId, attempt, passed, mapId: walkStart.mapId,
    idlePose: start.spritePose, walkingFrames, restartedWalkPose: restartedWalk.spritePose,
    resumedIdlePose: finalIdle.spritePose, browserErrors: failures.length,
    artifacts: `reference/screenshots/web-render/${milestoneId}-player-walk-frames/attempt-${attempt}` })}\n`);
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
  const partial = { id: milestoneId, attempt, profile: 'max-level', scenario, passed: false, preMove, captures, events,
    error: error instanceof Error ? error.message : String(error), browser: { stderr: stderr.slice(-3000) } };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: milestoneId, attempt, passed: false, error: partial.error,
    latest: captures.at(-1)?.state ?? null })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
