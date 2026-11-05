#!/usr/bin/env node

/**
 * Drive a fresh New Game route or DEV map preview through normal game UI key
 * input in an owned Chromium process. Chromium is headless; screenshots capture the page.
 * The probe uses real CDP key-down/key-up events, so directional inputs can be
 * held across the game's update ticks. It reads only the DEV route telemetry
 * attributes and never accesses browser storage or game-save files.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileName = process.env.HEROES_LORE_TEST_PROFILE ?? 'max-level';
const routeTarget = process.env.HEROES_LORE_ROUTE_TARGET ?? 'map0';
const mapPreviewId = routeTarget === 'map-preview'
  ? Number(process.env.HEROES_LORE_MAP_ID ?? 13)
  : null;
const requiredProfile = routeTarget === 'map27-damage-pursuit' ? 'damage-survival' : 'max-level';
if (profileName !== requiredProfile) {
  throw new Error(`Route target ${routeTarget} requires the ${requiredProfile} profile`);
}
if (!['map0', 'map27', 'map27-pursuit', 'map27-damage-pursuit', 'map27-combat', 'map27-combat-cycle', 'map27-mobile-touch', 'map0-mobile-touch', 'map-preview'].includes(routeTarget)) {
  throw new Error('The held-input route probe does not support this target');
}
if (mapPreviewId !== null && (!Number.isInteger(mapPreviewId) || mapPreviewId < 0 || mapPreviewId > 255)) {
  throw new Error('Map preview requires HEROES_LORE_MAP_ID to be an integer from 0 through 255');
}
const attemptNumber = Number(process.env.HEROES_LORE_ROUTE_ATTEMPT ?? 1);
if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
  throw new Error('The held-input route probe attempt number must be between 1 and 3');
}
const defaultMilestoneId = routeTarget === 'map27-combat-cycle' ? 'M988'
  : routeTarget === 'map27-combat' ? 'M987'
    : routeTarget === 'map27-damage-pursuit' ? 'M992'
    : routeTarget === 'map27-pursuit' ? 'M989'
      : routeTarget === 'map0-mobile-touch' ? 'M991'
      : routeTarget === 'map27-mobile-touch' ? 'M990'
      : routeTarget === 'map-preview' ? 'M1010'
      : routeTarget === 'map27' ? 'M986' : 'M978';
const requestedMilestoneId = process.env.HEROES_LORE_MILESTONE_ID;
if (requestedMilestoneId !== undefined && !/^M\d{3,5}$/.test(requestedMilestoneId)) {
  throw new Error('HEROES_LORE_MILESTONE_ID must look like M1011');
}
const milestoneId = routeTarget === 'map-preview' && requestedMilestoneId !== undefined
  ? requestedMilestoneId
  : defaultMilestoneId;

const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const previewScenario = mapPreviewId === null ? null : `map-preview-${mapPreviewId}`;
const startUrl = process.env.HEROES_LORE_URL ??
  `http://127.0.0.1:5174/?testProfile=${encodeURIComponent(profileName)}${previewScenario === null ? '' : `&testScenario=${encodeURIComponent(previewScenario)}`}`;
const parsedStartUrl = new URL(startUrl);
if (parsedStartUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedStartUrl.hostname)) {
  throw new Error('The campaign probe can connect only to a local HTTP development server');
}
if (parsedStartUrl.searchParams.get('testProfile') !== profileName) {
  throw new Error(`The start URL must select testProfile=${profileName}`);
}
if (previewScenario !== null && parsedStartUrl.searchParams.get('testScenario') !== previewScenario) {
  throw new Error(`The start URL must select testScenario=${previewScenario}`);
}
const outputBaseDir = resolve(root, routeTarget === 'map27-combat-cycle'
  ? 'reference/screenshots/web-render/M988-max-level-map27-respawn'
  : routeTarget === 'map27-damage-pursuit'
    ? 'reference/screenshots/web-render/M992-damage-survival-map27-pursuit'
  : routeTarget === 'map0-mobile-touch'
    ? 'reference/screenshots/web-render/M991-mobile-touch-map64-exit'
  : routeTarget === 'map27-mobile-touch'
    ? 'reference/screenshots/web-render/M990-mobile-touch-map27-attack'
  : routeTarget === 'map27-combat'
    ? 'reference/screenshots/web-render/M987-max-level-map27-combat'
    : routeTarget === 'map27-pursuit'
      ? 'reference/screenshots/web-render/M989-max-level-map27-pursuit'
    : routeTarget === 'map27'
      ? 'reference/screenshots/web-render/M986-max-level-map0-map27'
      : routeTarget === 'map-preview'
        ? `reference/screenshots/web-render/${milestoneId}-map-preview-${mapPreviewId}`
      : 'reference/screenshots/web-render/M978-max-level-held-input');
const outputDir = routeTarget === 'map27-pursuit'
  ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map27-damage-pursuit'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map0-mobile-touch'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map27-mobile-touch'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : routeTarget === 'map-preview'
    ? join(outputBaseDir, `attempt-${attemptNumber}`)
  : outputBaseDir;
const userDataDir = await mkdtemp(join(tmpdir(), 'heroes-lore-owned-chromium-'));
const observations = [];
const cdpEvents = [];
let browserProcess;
let socket;
let cdp;
let chromeStderr = '';

class DevToolsPage {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else if ([
        'Network.loadingFailed',
        'Runtime.consoleAPICalled',
        'Runtime.exceptionThrown',
        'Log.entryAdded',
      ].includes(message.method)) {
        cdpEvents.push({ method: message.method, params: message.params ?? {} });
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
        resolve: (value) => { clearTimeout(timeout); resolvePromise(value); },
        reject: (error) => { clearTimeout(timeout); rejectPromise(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? 'Browser evaluation failed');
    }
    return response.result?.value;
  }
}

async function waitFor(predicate, { timeoutMs = 30000, intervalMs = 50, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await readRuntime();
    if (predicate(lastValue)) return lastValue;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}; last runtime: ${JSON.stringify(lastValue)}`);
}

async function readRuntime() {
  const value = await cdp.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    const raw = host.dataset.testRuntime;
    let runtime = null;
    if (raw) {
      try { runtime = JSON.parse(raw); } catch {}
    }
    return {
      profile: host.dataset.testProfile ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      runtime,
    };
  })()`);
  return value ?? null;
}

async function waitForCanvas() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`document.readyState === 'complete' &&
      document.querySelector('#game canvas') !== null`);
    if (ready) return;
    await delay(50);
  }
  throw new Error('Timed out waiting for the game canvas');
}

async function observe(label) {
  const state = await readRuntime();
  const record = { at: new Date().toISOString(), label, state };
  observations.push(record);
  return state;
}

async function tap(key, code, virtualKeyCode, textValue = undefined) {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
  if (textValue !== undefined) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...keyParams });
  }
  await delay(90);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
  await delay(140);
}

async function holdUntil(key, code, virtualKeyCode, predicate, { timeoutMs = 8000, label } = {}) {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  const deadline = Date.now() + timeoutMs;
  let finalState = null;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
  try {
    while (Date.now() < deadline) {
      finalState = await readRuntime();
      if (predicate(finalState)) {
        observations.push({ at: new Date().toISOString(), label, state: finalState });
        return finalState;
      }
      await delay(20);
    }
    observations.push({ at: new Date().toISOString(), label: `${label}-timeout`, state: finalState });
    return finalState;
  } finally {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
    await delay(250);
  }
}

async function saveScreenshot(name) {
  const response = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(join(outputDir, name), Buffer.from(response.data, 'base64'));
}

async function waitForDevToolsPort() {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (port !== undefined && /^\d+$/.test(port)) return Number(port);
    } catch {}
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chromium exited before DevTools became ready (${browserProcess.exitCode})`);
    }
    await delay(50);
  }
  throw new Error('Timed out waiting for Chromium DevTools port');
}

async function connectToPage(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page !== undefined) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          socket.addEventListener('open', resolvePromise, { once: true });
          socket.addEventListener('error', rejectPromise, { once: true });
        });
        cdp = new DevToolsPage(socket);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');
        await cdp.send('Log.enable');
        return;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out connecting to Chromium page');
}

async function launch() {
  browserProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=780,380',
    startUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browserProcess.stderr.setEncoding('utf8');
  browserProcess.stderr.on('data', (chunk) => { chromeStderr += chunk; });
  const port = await waitForDevToolsPort();
  await connectToPage(port);
  if (routeTarget === 'map27-mobile-touch' || routeTarget === 'map0-mobile-touch') {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await delay(250);
  }
  await waitForCanvas();
  await delay(1500);
  await cdp.send('Page.bringToFront');
}

async function startNewGameAndReachMap64() {
  await observe('fresh-title');
  await saveScreenshot('00-title-screen.png');
  const initialPresses = [
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowRight', 'ArrowRight', 39],
    ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of initialPresses) await tap(key, code, vk);

  await waitFor((state) => state?.mapId === 0 && state?.runtime !== null, {
    timeoutMs: 30000,
    label: 'opening Map0 runtime',
  });
  await observe('new-game-opening-map0');
  // The opening scene initializes asynchronously after the telemetry appears.
  await delay(9000);
  await tap('w', 'KeyW', 87, 'w');
  await waitFor((state) => state?.mapId === 64, {
    timeoutMs: 30000,
    label: 'opening transfer to Map64',
  });
  const state = await observe('map64-bedroom-start');
  const expectedLevel = profileName === 'max-level' ? 99 : 1;
  if (state.level !== expectedLevel || state.profile !== profileName) {
    throw new Error(`Unexpected test profile at Map64: ${JSON.stringify(state)}`);
  }
  await saveScreenshot('01-map64-before-held-move.png');
  return state;
}

async function startNewGameAndReachMapPreview() {
  if (mapPreviewId === null) throw new Error('Map preview route has no map ID');
  await observe('fresh-title');
  await saveScreenshot('00-title-screen.png');
  const initialPresses = [
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13],
    ['ArrowRight', 'ArrowRight', 39],
    ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of initialPresses) await tap(key, code, vk);
  await waitFor((candidate) => candidate?.mapPreviewReady === true && candidate?.mapId === mapPreviewId &&
    candidate?.runtime !== null && candidate.tileX !== null && candidate.tileY !== null &&
    candidate.tileX >= 0 && candidate.tileY >= 0 &&
    candidate.tileX < candidate.runtime.mapSize.width &&
    candidate.tileY < candidate.runtime.mapSize.height, {
    timeoutMs: 30000,
    label: `map-preview-${mapPreviewId} in-bounds player spawn`,
  });
  await delay(300);
  const settled = await observe(`map-preview-${mapPreviewId}-arrival`);
  if (settled.level !== 99 || settled.profile !== 'max-level' || settled.mapId !== mapPreviewId) {
    throw new Error(`Unexpected map preview runtime: ${JSON.stringify(settled)}`);
  }
  await saveScreenshot(`01-map-preview-${mapPreviewId}.png`);
  return settled;
}

async function followRecordedMap0RouteToMap27() {
  const routePath = join(
    root,
    'reference/screenshots/web-render/M863-newgame-map64-map0-map27-max-level/map0-to-map27-route-trace.json',
  );
  const recordedRoute = JSON.parse(await readFile(routePath, 'utf8'));
  if (recordedRoute.success !== true || recordedRoute.final?.mapId !== 27 || !Array.isArray(recordedRoute.trail)) {
    throw new Error(`M863 route guide is incomplete: ${routePath}`);
  }

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const expectedStart = await readRuntime();
  if (expectedStart?.mapId !== 0 || expectedStart.tileX !== 26 || expectedStart.tileY !== 24) {
    throw new Error(`Unexpected Map0 route start: ${JSON.stringify(expectedStart)}`);
  }
  await saveScreenshot('02-map0-route-start.png');

  for (const step of recordedRoute.trail) {
    const state = await readRuntime();
    if (step.type === 'move') {
      const [fromX, fromY] = step.from;
      const [toX, toY] = step.to;
      if (state?.mapId !== 0 || state.tileX !== fromX || state.tileY !== fromY) {
        throw new Error(`Map0 route diverged before step ${step.action}: ${JSON.stringify(state)}`);
      }
      const input = directionInputs.get(`${toX - fromX},${toY - fromY}`);
      if (input === undefined) throw new Error(`Invalid route direction at step ${step.action}`);
      const moved = await holdUntil(
        input[0], input[1], input[2],
        (candidate) => candidate?.mapId === 0 && candidate.tileX === toX && candidate.tileY === toY,
        { timeoutMs: 3000, label: `map0-route-step-${step.action}` },
      );
      if (moved?.mapId !== 0 || moved.tileX !== toX || moved.tileY !== toY) {
        throw new Error(`Map0 route did not reach step ${step.action}: ${JSON.stringify(moved)}`);
      }
      if ((step.action + 1) % 10 === 0) {
        await saveScreenshot(`map0-route-checkpoint-${step.action + 1}.png`);
      }
      continue;
    }

    if (step.type === 'enter-marker' && state?.mapId === 0 &&
      state.tileX === step.from[0] && state.tileY === step.from[1]) {
      const arrived = await holdUntil(
        'ArrowUp', 'ArrowUp', 38,
        (candidate) => candidate?.mapId === 27,
        { timeoutMs: 8000, label: 'map0-marker-1-to-map27' },
      );
      if (arrived?.mapId !== 27) {
        throw new Error(`Map0 marker did not reach Map27: ${JSON.stringify(arrived)}`);
      }
      await observe('map27-arrival');
      await saveScreenshot('03-map27-arrival.png');
      return arrived;
    }

    throw new Error(`Unexpected Map0 route action: ${JSON.stringify(step)}`);
  }

  throw new Error('Recorded Map0 route ended without entering Map27');
}

async function tapMobileControl(control) {
  const point = await cdp.evaluate(`(() => {
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
    };
  })()`);
  if (point === null || !point.visible || point.x < 0 || point.y < 0 || point.x > 360 || point.y > 640) {
    throw new Error(`Mobile touch control ${control} is not visible in the viewport: ${JSON.stringify(point)}`);
  }

  let activeWhileHeld = false;
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await delay(140);
    activeWhileHeld = await cdp.evaluate(`document.querySelector('[data-touch-control="${control}"]')?.classList.contains('touch-active') === true`);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await delay(140);
  return { ...point, activeWhileHeld, input: 'CDP touchStart/touchEnd' };
}

async function holdMobileControlUntil(control, predicate, { timeoutMs = 8000, label } = {}) {
  const point = await cdp.evaluate(`(() => {
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
    };
  })()`);
  if (point === null || !point.visible || point.x < 0 || point.y < 0 || point.x > 360 || point.y > 640) {
    throw new Error(`Mobile touch control ${control} is not visible in the viewport: ${JSON.stringify(point)}`);
  }

  let finalState = null;
  let activeWhileHeld = false;
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y, id: 2, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await delay(140);
    activeWhileHeld = await cdp.evaluate(`document.querySelector('[data-touch-control="${control}"]')?.classList.contains('touch-active') === true`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      finalState = await readRuntime();
      if (predicate(finalState)) {
        observations.push({ at: new Date().toISOString(), label, state: finalState });
        break;
      }
      await delay(30);
    }
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(180);
  }

  if (!predicate(finalState)) {
    observations.push({ at: new Date().toISOString(), label: `${label}-timeout`, state: finalState });
    throw new Error(`Mobile touch control ${control} did not reach ${label}: ${JSON.stringify(finalState)}`);
  }
  return { ...point, activeWhileHeld, input: 'held CDP touchStart/touchEnd', state: finalState };
}

async function approachAndAttackMap27Enemy({ touch = false } = {}) {
  const collision = JSON.parse(await readFile(
    join(root, 'web/public/assets/generated/collision/6/27.json'),
    'utf8',
  ));
  const previousRun = JSON.parse(await readFile(
    join(root, 'reference/screenshots/web-render/M916-max-level-map27-combat/run-result.json'),
    'utf8',
  ));
  const approach = previousRun.route.filter((step) => step.label === 'map27-combat-approach');
  if (approach.length === 0) throw new Error('M916 has no recorded Map27 combat approach route');

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  if (!touch) {
    for (const step of approach) {
      const state = await readRuntime();
      if (state?.mapId !== 27 || state.tileX !== step.from[0] || state.tileY !== step.from[1]) {
        throw new Error(`Map27 approach diverged before ${JSON.stringify(step)}: ${JSON.stringify(state)}`);
      }
      const input = directionInputs.get(`${step.to[0] - step.from[0]},${step.to[1] - step.from[1]}`);
      if (input === undefined) throw new Error(`Invalid Map27 combat approach step: ${JSON.stringify(step)}`);
      const moved = await holdUntil(
        input[0], input[1], input[2],
        (candidate) => candidate?.mapId === 27 && candidate.tileX === step.to[0] && candidate.tileY === step.to[1],
        { timeoutMs: 3000, label: `map27-combat-approach-${step.to.join('-')}` },
      );
      if (moved?.mapId !== 27 || moved.tileX !== step.to[0] || moved.tileY !== step.to[1]) {
        throw new Error(`Map27 combat approach did not reach ${step.to}: ${JSON.stringify(moved)}`);
      }
    }
  }

  const cardinalDirections = [
    { dx: 0, dy: -1, input: directionInputs.get('0,-1') },
    { dx: 0, dy: 1, input: directionInputs.get('0,1') },
    { dx: -1, dy: 0, input: directionInputs.get('-1,0') },
    { dx: 1, dy: 0, input: directionInputs.get('1,0') },
  ];
  const targetOrder = 14;
  let attackReady;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const state = await readRuntime();
    if (state?.mapId !== 27 || state.runtime === null) {
      throw new Error(`WorldScene ended while approaching Map27 enemy: ${JSON.stringify(state)}`);
    }
    const player = state.runtime.player;
    const target = state.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    if (target === undefined || target.state !== 'alive') {
      throw new Error(`Map27 enemy order ${targetOrder} is not alive: ${JSON.stringify(target)}`);
    }
    const dx = target.tileX - player.tileX;
    const dy = target.tileY - player.tileY;
    const direction = cardinalDirections.find((candidate) => candidate.dx === dx && candidate.dy === dy);
    if (direction !== undefined) {
      await tap(direction.input[0], direction.input[1], direction.input[2]);
      const faced = await readRuntime();
      const facedPlayer = faced?.runtime?.player;
      const facedTarget = faced?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
      if (faced?.mapId === 27 && facedPlayer !== undefined && facedTarget?.state === 'alive' &&
        Math.abs(facedTarget.tileX - facedPlayer.tileX) + Math.abs(facedTarget.tileY - facedPlayer.tileY) === 1) {
        attackReady = { state: faced, target: facedTarget, direction: direction.input[0] };
        break;
      }
      continue;
    }

    const width = collision.width;
    const height = collision.height;
    const occupied = new Set(state.runtime.entityOccupiedCells.map((cell) => `${cell.tileX},${cell.tileY}`));
    const start = { x: player.tileX, y: player.tileY, firstDirection: null };
    const startKey = `${start.x},${start.y}`;
    const queue = [start];
    const visited = new Set([startKey]);
    const goalKeys = new Set(cardinalDirections.map((candidate) =>
      `${target.tileX - candidate.dx},${target.tileY - candidate.dy}`));
    let firstStep;
    for (let queueIndex = 0; queueIndex < queue.length && firstStep === undefined; queueIndex += 1) {
      const current = queue[queueIndex];
      if (goalKeys.has(`${current.x},${current.y}`) && current.firstDirection !== null) {
        firstStep = current.firstDirection;
        break;
      }
      for (const candidate of cardinalDirections) {
        const x = current.x + candidate.dx;
        const y = current.y + candidate.dy;
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= width || y >= height || visited.has(key)) continue;
        if ((collision.values[y]?.[x] ?? -1) < 0 || occupied.has(key)) continue;
        visited.add(key);
        queue.push({ x, y, firstDirection: current.firstDirection ?? candidate.input });
      }
    }
    if (firstStep === undefined) {
      throw new Error(`No live-occupancy path to Map27 enemy order ${targetOrder}: ${JSON.stringify({ player, target })}`);
    }
    const beforeTile = [player.tileX, player.tileY];
    const destination = [player.tileX + cardinalDirections.find((candidate) => candidate.input === firstStep).dx,
      player.tileY + cardinalDirections.find((candidate) => candidate.input === firstStep).dy];
    const moved = await holdUntil(
      firstStep[0], firstStep[1], firstStep[2],
      (candidate) => {
        if (candidate?.mapId !== 27) return false;
        if (candidate.tileX === destination[0] && candidate.tileY === destination[1]) return true;
        const candidatePlayer = candidate.runtime?.player;
        const candidateTarget = candidate.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
        return candidatePlayer !== undefined && candidateTarget?.state === 'alive' &&
          Math.abs(candidateTarget.tileX - candidatePlayer.tileX) + Math.abs(candidateTarget.tileY - candidatePlayer.tileY) <= 1;
      },
      { timeoutMs: 3000, label: `map27-live-path-${beforeTile.join('-')}-to-${destination.join('-')}` },
    );
    const movedTarget = moved?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    const isAdjacent = moved?.runtime?.player !== undefined && movedTarget?.state === 'alive' &&
      Math.abs(movedTarget.tileX - moved.runtime.player.tileX) + Math.abs(movedTarget.tileY - moved.runtime.player.tileY) <= 1;
    if (moved?.mapId !== 27 || (moved.tileX !== destination[0] || moved.tileY !== destination[1]) && !isAdjacent) {
      throw new Error(`Map27 live route stalled at ${beforeTile.join(',')}: ${JSON.stringify(moved)}`);
    }
  }

  if (attackReady === undefined) throw new Error(`Could not align next to Map27 enemy order ${targetOrder}`);
  const beforeAttack = await readRuntime();
  const targetBefore = beforeAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  if (targetBefore?.state !== 'alive') throw new Error(`Map27 target left the attack window: ${JSON.stringify(targetBefore)}`);
  await observe('map27-before-light-attack');
  await saveScreenshot('04-map27-before-light-attack.png');
  const touchControl = touch ? await tapMobileControl('attack') : null;
  if (!touch) await tap('5', 'Numpad5', 101, '5');

  const deadline = Date.now() + 5000;
  let afterAttack = await readRuntime();
  let targetAfter = afterAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  while (Date.now() < deadline && targetAfter?.hp === targetBefore.hp && targetAfter?.state === 'alive') {
    await delay(50);
    afterAttack = await readRuntime();
    targetAfter = afterAttack?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  }
  const attackChanged = targetAfter !== undefined &&
    (targetAfter.hp < targetBefore.hp || targetAfter.state !== 'alive');
  const observation = {
    targetOrder,
    enemyId: targetBefore.enemyId,
    playerBefore: {
      tile: [beforeAttack.tileX, beforeAttack.tileY],
      direction: beforeAttack.runtime.player.direction,
      hp: beforeAttack.runtime.resources.hp,
      sp: beforeAttack.runtime.resources.sp,
    },
    targetBefore: { tile: [targetBefore.tileX, targetBefore.tileY], hp: targetBefore.hp, state: targetBefore.state },
    facingInput: attackReady.direction,
    attackInput: touch ? 'mobile Attack touch control' : 'Numpad5 light attack',
    touchControl,
    playerAfter: {
      tile: [afterAttack?.tileX, afterAttack?.tileY],
      hp: afterAttack?.runtime?.resources.hp,
      sp: afterAttack?.runtime?.resources.sp,
    },
    targetAfter: targetAfter === undefined
      ? null
      : { tile: [targetAfter.tileX, targetAfter.tileY], hp: targetAfter.hp, state: targetAfter.state },
    attackChanged,
  };
  await observe('map27-after-light-attack');
  await saveScreenshot('05-map27-after-light-attack.png');
  return observation;
}

async function waitForMap27EnemyRespawn(targetOrder) {
  const postAttackWaitStartedAt = Date.now();
  const death = await waitFor((state) => {
    const target = state?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    return state?.mapId === 27 && target?.state === 'respawn-wait';
  }, { timeoutMs: 8000, intervalMs: 50, label: `map27-enemy-${targetOrder}-respawn-wait` });
  const waitingTarget = death.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  const waiting = {
    mapId: death.mapId,
    tile: [death.tileX, death.tileY],
    playerHp: death.runtime.resources.hp,
    playerSp: death.runtime.resources.sp,
    enemy: waitingTarget === undefined ? null : {
      tile: [waitingTarget.tileX, waitingTarget.tileY],
      hp: waitingTarget.hp,
      state: waitingTarget.state,
    },
  };
  observations.push({ at: new Date().toISOString(), label: 'map27-enemy-respawn-wait', state: death });
  await saveScreenshot('06-map27-enemy-respawn-wait.png');

  const restored = await waitFor((state) => {
    const target = state?.runtime?.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
    return state?.mapId === 27 && target?.state === 'alive' && target.hp === 43;
  }, { timeoutMs: 45000, intervalMs: 100, label: `map27-enemy-${targetOrder}-respawned` });
  const restoredTarget = restored.runtime.enemies.find((enemy) => enemy.sourceOrder === targetOrder);
  const revived = {
    mapId: restored.mapId,
    tile: [restored.tileX, restored.tileY],
    playerHp: restored.runtime.resources.hp,
    playerSp: restored.runtime.resources.sp,
    enemy: restoredTarget === undefined ? null : {
      tile: [restoredTarget.tileX, restoredTarget.tileY],
      hp: restoredTarget.hp,
      state: restoredTarget.state,
    },
  };
  observations.push({ at: new Date().toISOString(), label: 'map27-enemy-respawned', state: restored });
  await saveScreenshot('07-map27-enemy-respawned.png');
  return {
    waiting,
    revived,
    elapsedFromPostAttackWaitStartMs: Date.now() - postAttackWaitStartedAt,
  };
}

async function approachAndSampleMap27Pursuit() {
  const approachStart = await readRuntime();
  const approachStartHp = approachStart?.runtime?.resources.hp;
  const previousRun = JSON.parse(await readFile(
    join(root, 'reference/screenshots/web-render/M916-max-level-map27-combat/run-result.json'),
    'utf8',
  ));
  const approach = previousRun.route.filter((step) => step.label === 'map27-combat-approach');
  // Stop beside the enemy's spawn tile. Attempt 2 confirmed the enemy occupies
  // (9,32) and immediately targets the player from (8,32).
  const stopTile = [8, 32];
  const stopIndex = approach.findIndex((step) => step.to?.[0] === stopTile[0] && step.to?.[1] === stopTile[1]);
  if (stopIndex < 0) throw new Error(`M916 has no Map27 pursuit approach to ${stopTile.join(',')}`);

  const directionInputs = new Map([
    ['0,-1', ['ArrowUp', 'ArrowUp', 38]],
    ['0,1', ['ArrowDown', 'ArrowDown', 40]],
    ['-1,0', ['ArrowLeft', 'ArrowLeft', 37]],
    ['1,0', ['ArrowRight', 'ArrowRight', 39]],
  ]);
  const route = approach.slice(0, stopIndex + 1);
  const approachSamples = [];
  const approachStartedAt = Date.now();
  const captureEnemySample = (state, elapsedMs) => {
    const player = state?.runtime?.player;
    const enemy = state?.runtime?.enemies.find((candidate) => candidate.sourceOrder === 14);
    if (state?.mapId !== 27 || player === undefined || enemy === undefined) {
      throw new Error(`Map27 pursuit target disappeared during approach sampling: ${JSON.stringify(state)}`);
    }
    return {
      elapsedMs,
      player: { tileX: player.tileX, tileY: player.tileY, direction: player.direction },
      resources: {
        hp: state.runtime.resources.hp,
        maxHp: state.runtime.resources.maxHp,
        sp: state.runtime.resources.sp,
      },
      enemy: {
        tileX: enemy.tileX,
        tileY: enemy.tileY,
        pixelX: enemy.pixelX,
        pixelY: enemy.pixelY,
        hp: enemy.hp,
        state: enemy.state,
        animationStateIndex: enemy.animationStateIndex,
        pursuitTarget: enemy.pursuitTarget,
        attackHitResolved: enemy.attackHitResolved,
      },
    };
  };
  for (const step of route) {
    const state = await readRuntime();
    if (state?.mapId !== 27 || state.tileX !== step.from[0] || state.tileY !== step.from[1]) {
      throw new Error(`Map27 pursuit approach diverged before ${step.from.join(',')}>${step.to.join(',')}: ${state?.mapId}:${state?.tileX},${state?.tileY}`);
    }
    const input = directionInputs.get(`${step.to[0] - step.from[0]},${step.to[1] - step.from[1]}`);
    if (input === undefined) throw new Error(`Invalid Map27 pursuit step: ${JSON.stringify(step)}`);
    const moved = await holdUntil(
      input[0], input[1], input[2],
      (candidate) => candidate?.mapId === 27 && candidate.tileX === step.to[0] && candidate.tileY === step.to[1],
      { timeoutMs: 3000, label: `map27-pursuit-approach-${step.to.join('-')}` },
    );
    if (moved?.mapId !== 27 || moved.tileX !== step.to[0] || moved.tileY !== step.to[1]) {
      throw new Error(`Map27 pursuit approach did not reach ${step.to.join(',')}; stopped at ${moved?.mapId}:${moved?.tileX},${moved?.tileY}`);
    }
    for (let sample = 0; sample < 2; sample += 1) {
      const stateAtStep = await readRuntime();
      approachSamples.push(captureEnemySample(stateAtStep, Date.now() - approachStartedAt));
      await delay(71);
    }
  }

  const start = await readRuntime();
  const sourceOrder = 14;
  const targetAtStart = start?.runtime?.enemies.find((enemy) => enemy.sourceOrder === sourceOrder);
  if (start?.mapId !== 27 || start.tileX !== stopTile[0] || start.tileY !== stopTile[1] || targetAtStart === undefined) {
    throw new Error(`Unexpected Map27 pursuit observation start: ${JSON.stringify({ start, targetAtStart })}`);
  }
  await observe('map27-pursuit-sampling-start');
  await saveScreenshot('map27-pursuit-start.png');

  const samples = [];
  const requestedDurationMs = 12000;
  const sampleIntervalMs = 71;
  const startedAt = Date.now();
  while (Date.now() - startedAt < requestedDurationMs) {
    const state = await readRuntime();
    samples.push(captureEnemySample(state, Date.now() - startedAt));
    await delay(sampleIntervalMs);
  }

  const end = await readRuntime();
  await observe('map27-pursuit-sampling-end');
  await saveScreenshot('map27-pursuit-end.png');
  const allSamples = [...approachSamples, ...samples];
  const enemyTiles = new Set(allSamples.map((sample) => `${sample.enemy.tileX},${sample.enemy.tileY}`));
  const enemyStates = new Set(allSamples.map((sample) => sample.enemy.state));
  const pursuitTargetCounts = Object.fromEntries(allSamples.reduce((counts, sample) => {
    const key = sample.enemy.pursuitTarget ?? 'null';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map()));
  const finalEnemy = end?.runtime?.enemies.find((enemy) => enemy.sourceOrder === sourceOrder);
  return {
    sourceOrder,
    sampleIntervalMs,
    requestedDurationMs,
    actualDurationMs: Date.now() - startedAt,
    sampleCount: samples.length,
    approachSampleCount: approachSamples.length,
    enemyTileCount: enemyTiles.size,
    enemyStates: [...enemyStates],
    pursuitTargetCounts,
    startsAt: { player: [start.tileX, start.tileY], enemy: [targetAtStart.tileX, targetAtStart.tileY] },
    approachStartHp,
    final: end === null ? null : {
      mapId: end.mapId,
      player: [end.tileX, end.tileY],
      hp: end.hp,
      enemy: finalEnemy === undefined ? null : {
        tile: [finalEnemy.tileX, finalEnemy.tileY],
        hp: finalEnemy.hp,
        state: finalEnemy.state,
      },
    },
    approachSamples,
    samples,
    observedPlayerTarget: allSamples.some((sample) => sample.enemy.pursuitTarget === 'player'),
    observedWalkingState: allSamples.some((sample) => sample.enemy.animationStateIndex === 1),
    enemyAttackObserved: allSamples.some((sample) => sample.enemy.attackHitResolved === true),
    playerHpMinimum: Math.min(...allSamples.map((sample) => sample.resources.hp)),
    playerHpDamageObserved: approachStartHp !== undefined &&
      allSamples.some((sample) => sample.resources.hp < approachStartHp),
    playerHpRemainedPositive: allSamples.every((sample) => sample.resources.hp > 0),
  };
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const before = routeTarget === 'map-preview'
    ? await startNewGameAndReachMapPreview()
    : await startNewGameAndReachMap64();
  const mobileTouchExit = routeTarget === 'map0-mobile-touch'
    ? await holdMobileControlUntil('down', (state) => state?.mapId === 0, {
      timeoutMs: 8000,
      label: 'touch-down-map64-to-map0',
    })
    : null;
  const afterMap0 = routeTarget === 'map-preview' ? null : mobileTouchExit?.state ?? await holdUntil(
    'ArrowDown', 'ArrowDown', 40,
    (state) => state?.mapId === 0,
    { timeoutMs: 8000, label: 'held-down-map64-to-map0' },
  );
  if (routeTarget !== 'map-preview') {
    await observe('after-held-bedroom-exit');
    await saveScreenshot('02-after-held-bedroom-exit.png');
  }
  let map27Arrival = null;
  let combatObservation = null;
  let pursuitObservation = null;
  if (routeTarget === 'map27' || routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit' || routeTarget === 'map27-combat' || routeTarget === 'map27-combat-cycle' || routeTarget === 'map27-mobile-touch') {
    map27Arrival = await followRecordedMap0RouteToMap27();
  }
  if (routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit') {
    pursuitObservation = await approachAndSampleMap27Pursuit();
  }
  if (routeTarget === 'map27-combat' || routeTarget === 'map27-combat-cycle' || routeTarget === 'map27-mobile-touch') {
    combatObservation = await approachAndAttackMap27Enemy({ touch: routeTarget === 'map27-mobile-touch' });
  }
  const respawnObservation = routeTarget === 'map27-combat-cycle'
    ? await waitForMap27EnemyRespawn(combatObservation.targetOrder)
    : null;
  const finalState = routeTarget === 'map-preview'
    ? await readRuntime()
    : routeTarget === 'map0' ? afterMap0 : await readRuntime();
  const errors = cdpEvents.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const expectedFinalMap = routeTarget === 'map-preview' ? mapPreviewId
    : routeTarget === 'map0' || routeTarget === 'map0-mobile-touch' ? 0 : 27;
  const isPursuitRoute = routeTarget === 'map27-pursuit' || routeTarget === 'map27-damage-pursuit';
  const mapPreviewReady = routeTarget !== 'map-preview' || (
    finalState?.mapPreviewReady === true && finalState?.runtime !== null && finalState?.runtime !== undefined &&
    finalState?.tileX >= 0 && finalState?.tileY >= 0 &&
    finalState?.tileX < finalState.runtime.mapSize.width &&
    finalState?.tileY < finalState.runtime.mapSize.height);
  const passed = finalState?.mapId === expectedFinalMap && finalState?.profile === profileName &&
    finalState?.level === (profileName === 'max-level' ? 99 : 1) && (isPursuitRoute
      ? finalState?.hp > 0 && pursuitObservation?.observedPlayerTarget === true &&
        pursuitObservation?.observedWalkingState === true && pursuitObservation?.sampleCount >= 100 &&
        (routeTarget !== 'map27-damage-pursuit' || pursuitObservation?.enemyAttackObserved === true &&
          pursuitObservation?.playerHpDamageObserved === true && pursuitObservation?.playerHpRemainedPositive === true)
      : finalState?.hp === before?.hp) && mapPreviewReady && errors.length === 0 &&
    (!['map27-combat', 'map27-combat-cycle', 'map27-mobile-touch'].includes(routeTarget) || combatObservation?.attackChanged === true) &&
    (routeTarget !== 'map27-mobile-touch' || combatObservation?.touchControl?.activeWhileHeld === true &&
      combatObservation?.touchControl?.coarsePointer === true && combatObservation?.touchControl?.maxTouchPoints >= 1) &&
    (routeTarget !== 'map0-mobile-touch' || mobileTouchExit?.activeWhileHeld === true &&
      mobileTouchExit?.coarsePointer === true && mobileTouchExit?.maxTouchPoints >= 1) &&
    (routeTarget !== 'map27-combat-cycle' || respawnObservation?.revived?.enemy?.state === 'alive');
  const result = {
    id: milestoneId,
    profile: profileName,
    route: routeTarget === 'map27-damage-pursuit'
      ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> damage-survival pursuit and attack trace'
      : routeTarget === 'map27-mobile-touch'
      ? 'mobile-emulated-UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> Attack touch control'
      : routeTarget === 'map0-mobile-touch'
        ? 'mobile-emulated-UI-key-input-New-Game -> Map64 -> Down touch control -> Map0'
      : routeTarget === 'map27-combat-cycle'
      ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> light attack -> enemy respawn'
      : routeTarget === 'map-preview'
        ? `visible-UI-New-Game -> DEV max-level map preview ${mapPreviewId}; new-game flags, map state seeded`
      : routeTarget === 'map27-combat'
        ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> light attack'
        : routeTarget === 'map27-pursuit'
          ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> Map27 -> held approach -> enemy pursuit trace'
          : routeTarget === 'map27'
            ? 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0 -> recorded route -> Map27'
            : 'UI-key-input-New-Game -> Map64 -> held-ArrowDown -> Map0',
    passed,
    before,
    afterMap0,
    mobileTouchExit,
    map27Arrival,
    combatObservation,
    pursuitObservation,
    respawnObservation,
    finalState,
    observations,
    errors,
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
    restrictions: {
      saveFilesAccessed: false,
      browserStorageRead: false,
      gameSaveActionUsed: false,
      mapStateSeeded: routeTarget === 'map-preview',
      originalJarAccessed: false,
    },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`Held-input route did not meet verification criteria for ${routeTarget}`);
  process.stdout.write(`${JSON.stringify({
    id: result.id,
    profile: result.profile,
    passed: result.passed,
    before: { mapId: before.mapId, tile: [before.tileX, before.tileY], level: before.level, hp: before.hp },
    afterMap0: { mapId: afterMap0?.mapId, tile: [afterMap0?.tileX, afterMap0?.tileY], hp: afterMap0?.hp },
    final: { mapId: finalState?.mapId, tile: [finalState?.tileX, finalState?.tileY], level: finalState?.level, hp: finalState?.hp },
    pursuit: pursuitObservation === null ? null : {
      sampleCount: pursuitObservation.sampleCount,
      durationMs: pursuitObservation.actualDurationMs,
      enemyTileCount: pursuitObservation.enemyTileCount,
      enemyStates: pursuitObservation.enemyStates,
      pursuitTargetCounts: pursuitObservation.pursuitTargetCounts,
      observedPlayerTarget: pursuitObservation.observedPlayerTarget,
      observedWalkingState: pursuitObservation.observedWalkingState,
      enemyAttackObserved: pursuitObservation.enemyAttackObserved,
      playerHpMinimum: pursuitObservation.playerHpMinimum,
      playerHpDamageObserved: pursuitObservation.playerHpDamageObserved,
      playerHpRemainedPositive: pursuitObservation.playerHpRemainedPositive,
    },
    browserErrors: errors.length,
    artifacts: routeTarget === 'map27-damage-pursuit'
      ? `reference/screenshots/web-render/M992-damage-survival-map27-pursuit/attempt-${attemptNumber}`
      : routeTarget === 'map0-mobile-touch'
      ? `reference/screenshots/web-render/M991-mobile-touch-map64-exit/attempt-${attemptNumber}`
      : routeTarget === 'map27-mobile-touch'
      ? `reference/screenshots/web-render/M990-mobile-touch-map27-attack/attempt-${attemptNumber}`
      : routeTarget === 'map-preview'
      ? `reference/screenshots/web-render/${milestoneId}-map-preview-${mapPreviewId}/attempt-${attemptNumber}`
      : routeTarget === 'map27-combat-cycle'
      ? 'reference/screenshots/web-render/M988-max-level-map27-respawn'
      : routeTarget === 'map27'
        ? 'reference/screenshots/web-render/M986-max-level-map0-map27'
      : routeTarget === 'map27-combat'
          ? 'reference/screenshots/web-render/M987-max-level-map27-combat'
          : routeTarget === 'map27-pursuit'
            ? `reference/screenshots/web-render/M989-max-level-map27-pursuit/attempt-${attemptNumber}`
            : 'reference/screenshots/web-render/M978-max-level-held-input',
  })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
  const exited = () => browserProcess.exitCode !== null || browserProcess.signalCode !== null;
  const waitForExit = (timeoutMs) => new Promise((resolvePromise) => {
    if (exited()) return resolvePromise(true);
    const timeout = setTimeout(() => resolvePromise(false), timeoutMs);
    browserProcess.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise(true);
    });
  });
  if (browserProcess !== undefined && !exited()) {
    browserProcess.kill('SIGTERM');
    if (!await waitForExit(4000)) {
      browserProcess.kill('SIGKILL');
      if (!await waitForExit(4000)) throw new Error('Owned Chromium did not exit after SIGKILL');
    }
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await run();
} catch (error) {
  const partial = {
    id: milestoneId,
    profile: profileName,
    passed: false,
    observations,
    error: error instanceof Error ? error.message : String(error),
    browser: { stderr: chromeStderr.slice(-4000) },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  const latest = observations.at(-1);
  const latestState = latest?.state;
  process.stderr.write(`${JSON.stringify({
    id: milestoneId,
    profile: profileName,
    attemptNumber,
    passed: false,
    error: partial.error,
    observationCount: observations.length,
    latestObservation: latest === undefined ? null : {
      label: latest.label,
      state: latestState === null || latestState === undefined ? null : {
        mapId: latestState.mapId,
        tileX: latestState.tileX,
        tileY: latestState.tileY,
        hp: latestState.hp,
        level: latestState.level,
      },
    },
  })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
