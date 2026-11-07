#!/usr/bin/env node

/** Compare a visible Chromium Save/Load across two cold processes without reading browser storage. */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const attempt = Number(process.env.HEROES_LORE_M1101_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1101 attempt must be from 1 to 3');
}
const chromePath = process.env.HEROES_LORE_CHROME_BIN ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const baseUrl = process.env.HEROES_LORE_BASE_URL ?? 'http://127.0.0.1:5174/';
const scenario = 'map-preview-64';
const outputDir = join('reference/screenshots/web-render/M1101-chromium-cold-save-load-fields', `attempt-${attempt}`);
const profileRoot = await mkdtemp(join(tmpdir(), 'heroes-lore-m1101-'));
const profileDir = join(profileRoot, 'chrome-profile');
const errors = [];
const captures = [];
let chromeProcess = null;
let page = null;
let chromeLog = '';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, label, timeoutMs = 30000, pollMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await predicate();
    if (value) return value;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

function connect(url, phase) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error(`CDP WebSocket failed during ${phase}`)), { once: true });
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      errors.push({ phase, kind: 'invalid-cdp-message' });
      return;
    }
    if (message.id === undefined) {
      if (message.method === 'Runtime.exceptionThrown') {
        errors.push({ phase, kind: 'page-error', text: message.params?.exceptionDetails?.text ?? 'unknown exception' });
      }
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        errors.push({ phase, kind: 'console-error', text: message.params.entry.text ?? 'unknown console error' });
      }
      if (message.method === 'Network.loadingFailed') {
        errors.push({ phase, kind: 'request-failed', text: message.params?.errorText ?? 'unknown network error' });
      }
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error(`CDP closed during ${phase}`));
    pending.clear();
  });

  return {
    async ready() {
      await opened;
    },
    command(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    },
  };
}

async function startChrome(phase) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  await rm(portFile, { force: true });
  chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--no-first-run',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=780,600',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chromeProcess.stdout.on('data', (chunk) => { chromeLog += String(chunk); });
  chromeProcess.stderr.on('data', (chunk) => { chromeLog += String(chunk); });
  chromeProcess.on('error', (error) => errors.push({ phase, kind: 'process-error', text: error.message }));

  const details = await waitFor(async () => {
    try {
      const [port, browserPath] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (!port || !browserPath) return null;
      return { port: Number(port), browserPath };
    } catch {
      if (chromeProcess?.exitCode !== null) throw new Error(`Chromium exited: ${chromeLog.slice(-2000)}`);
      return null;
    }
  }, `${phase} Chromium DevTools endpoint`, 20000);

  const browserSocket = connect(`ws://127.0.0.1:${details.port}${details.browserPath}`, phase);
  await browserSocket.ready();
  const version = await browserSocket.command('Browser.getVersion');
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${details.port}/json/list`).catch(() => null);
    if (!response?.ok) return null;
    const targets = await response.json();
    return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ?? null;
  }, `${phase} Chromium page target`, 10000);
  const response = await fetch(`http://127.0.0.1:${details.port}/json/list`);
  const targets = await response.json();
  const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
  if (target === undefined) throw new Error(`${phase} Chromium page target disappeared`);
  page = connect(target.webSocketDebuggerUrl, phase);
  await page.ready();
  await Promise.all([
    page.command('Page.enable'),
    page.command('Runtime.enable'),
    page.command('Log.enable'),
    page.command('Network.enable'),
  ]);
  return { browserSocket, browserVersion: version.product };
}

async function evaluate(expression) {
  const response = await page.command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails !== undefined) {
    throw new Error(response.exceptionDetails.text ?? 'Page evaluation failed');
  }
  return response.result?.value ?? null;
}

async function navigate(url) {
  await page.command('Page.navigate', { url });
}

async function pressKey(key, settleMs = 160) {
  const virtualKey = ({ Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 })[key];
  if (virtualKey === undefined) throw new Error(`Unsupported probe key ${key}`);
  await page.command('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code: key, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey,
  });
  await page.command('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code: key, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey,
  });
  await sleep(settleMs);
}

async function capture(filename, label, state = null) {
  const response = await page.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(outputDir, filename), Buffer.from(response.data, 'base64'));
  captures.push({ filename, label, state });
}

async function readRuntime() {
  return evaluate(`(() => {
    const host = document.querySelector('#game');
    let snapshot = null;
    try { snapshot = JSON.parse(host?.dataset.testRuntime ?? 'null'); } catch {}
    return {
      profile: host?.dataset.testProfile ?? null,
      scenario: host?.dataset.testScenario ?? null,
      mapId: host?.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      mapPreviewReady: host?.dataset.testMapPreviewReady === 'true',
      snapshot,
    };
  })()`);
}

async function readSceneState() {
  return evaluate(`(() => {
    const game = window.__heroesLoreDebugGame;
    const scene = game?.scene.getScenes(true).find((candidate) => candidate.sys.settings.key === 'WorldScene');
    if (!scene || typeof scene.createSaveState !== 'function') return null;
    return {
      mapLoaded: scene.world !== null,
      mapId: scene.currentMapId,
      systemMenuMessage: scene.systemMenuMessage,
      saveState: scene.createSaveState(),
    };
  })()`);
}

async function waitForRuntime(predicate, label, timeoutMs = 30000) {
  return waitFor(async () => {
    const state = await readRuntime();
    return predicate(state) ? state : null;
  }, label, timeoutMs);
}

async function waitForLoadedState(predicate, label, timeoutMs = 30000) {
  return waitFor(async () => {
    const state = await readSceneState();
    return state !== null && state.mapLoaded && predicate(state) ? state : null;
  }, label, timeoutMs);
}

function compareValues(before, after, path = '$', differences = []) {
  if (before === after) return differences;
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') {
    differences.push({ path, before, after });
    return differences;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
      differences.push({ path, before, after });
      return differences;
    }
    before.forEach((value, index) => compareValues(value, after[index], `${path}[${index}]`, differences));
    return differences;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    if (path === '$' && (key === 'savedAt' || key === 'playTimeSeconds')) continue;
    compareValues(before[key], after[key], `${path}.${key}`, differences);
  }
  return differences;
}

async function stopChrome(browserSocket) {
  const processToStop = chromeProcess;
  chromeProcess = null;
  page?.close();
  page = null;
  if (processToStop === null) {
    browserSocket?.close();
    return;
  }
  if (processToStop.exitCode !== null || processToStop.signalCode !== null) return;
  const exited = new Promise((resolve) => processToStop.once('exit', resolve));
  await browserSocket?.command('Browser.close').catch(() => {});
  await Promise.race([
    exited,
    sleep(5000),
  ]);
  if (processToStop.exitCode === null && processToStop.signalCode === null) processToStop.kill('SIGTERM');
  await Promise.race([exited, sleep(3000)]);
  if (processToStop.exitCode === null && processToStop.signalCode === null) processToStop.kill('SIGKILL');
  browserSocket?.close();
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  let browserSocket;
  try {
    let launch = await startChrome('save-process');
    browserSocket = launch.browserSocket;
    const firstUrl = new URL(baseUrl);
    firstUrl.searchParams.set('testProfile', 'max-level');
    firstUrl.searchParams.set('testScenario', scenario);
    await navigate(firstUrl.href);
    await waitFor(() => evaluate("Boolean(document.querySelector('#game canvas'))"), 'save-process game canvas');
    await page.command('Page.bringToFront');
    // Match the shared campaign probe's cold-start settling window. A canvas
    // can exist while the Hands-On splash is still active and ignoring menu input.
    await sleep(1500);
    const initialPage = await evaluate(`(() => ({
      url: location.href,
      activeScenes: window.__heroesLoreDebugGame?.scene.getScenes(true).map((scene) => scene.sys.settings.key) ?? [],
      canvas: document.querySelector('#game canvas')?.getAttribute('style') ?? null,
      hostProfile: document.querySelector('#game')?.dataset.testProfile ?? null,
    }))()`);
    await capture('00-initial-page.png', 'initial page after visible New Game URL load', initialPage);
    for (const key of ['Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'ArrowRight', 'Enter']) {
      await pressKey(key, 250);
    }
    const afterNewGameInputs = await evaluate(`(() => ({
      url: location.href,
      activeScenes: window.__heroesLoreDebugGame?.scene.getScenes(true).map((scene) => scene.sys.settings.key) ?? [],
      runtime: document.querySelector('#game')?.dataset.testRuntime ?? null,
      profile: document.querySelector('#game')?.dataset.testProfile ?? null,
      text: document.body.innerText,
    }))()`);
    await capture('01-after-newgame-inputs.png', 'page after visible New Game inputs', afterNewGameInputs);
    const before = await waitForRuntime((state) => state?.profile === 'max-level' &&
      state.scenario === scenario && state.mapId === 64 && state.mapPreviewReady,
    'visible max-level Map64 New Game');
    const initialScene = await waitForLoadedState((state) => state.mapId === 64, 'Map64 world resources');
    const beforeSave = initialScene.saveState;
    if (beforeSave.hud.level !== 99 || beforeSave.hud.hp !== beforeSave.hud.maxHp ||
      beforeSave.hud.sp !== beforeSave.hud.maxSp || beforeSave.mapId !== 64) {
      throw new Error(`Unexpected max-level save fixture: ${JSON.stringify({ before, beforeSave })}`);
    }
    await capture('00-map64-before-save.png', 'visible max-level Map64 before save', beforeSave);

    await pressKey('Escape', 220);
    await capture('01-system-menu.png', 'System menu open', null);
    for (let index = 0; index < 3; index += 1) await pressKey('ArrowDown', 140);
    await capture('02-save-game-selected.png', 'Save Game row selected', null);
    await pressKey('Enter', 350);
    const savedScene = await waitFor(async () => {
      const state = await readSceneState();
      return state?.systemMenuMessage === 'Game saved.' ? state : null;
    }, 'visible Game saved confirmation', 10000);
    await capture('03-game-saved.png', 'visible Game saved confirmation', savedScene.systemMenuMessage);
    await stopChrome(browserSocket);
    browserSocket = null;

    launch = await startChrome('load-process');
    browserSocket = launch.browserSocket;
    await navigate(new URL(baseUrl).href);
    await waitFor(() => evaluate("Boolean(document.querySelector('#game canvas'))"), 'load-process game canvas');
    await page.command('Page.bringToFront');
    // The cold-load title route has the same splash/title transition as New Game.
    await sleep(1500);
    for (const key of ['Enter', 'Enter', 'ArrowDown', 'Enter']) await pressKey(key, 240);
    await sleep(500);
    await capture('04-load-game-roster.png', 'visible cold-process Load Game roster', null);
    await pressKey('Enter', 400);
    const loadedScene = await waitForLoadedState((state) => state.mapId === 64 &&
      state.saveState.heroClassId === 6 && state.saveState.hud.level === 99,
    'visible loaded Map64 max-level character');
    await sleep(500);
    const afterLoad = await readSceneState();
    await capture('05-loaded-map64.png', 'settled Map64 after cold-process Load Game', afterLoad?.saveState ?? null);
    if (afterLoad === null || !afterLoad.mapLoaded) throw new Error('Loaded WorldScene disappeared before comparison');

    const differences = compareValues(beforeSave, afterLoad.saveState);
    const playTimeDeltaSeconds = afterLoad.saveState.playTimeSeconds - beforeSave.playTimeSeconds;
    const runtimeErrors = errors.filter((entry) => entry.kind !== 'process-error');
    const passed = launch.browserVersion !== null && errors.length === 0 && differences.length === 0 &&
      afterLoad.mapId === 64 && afterLoad.saveState.hud.hp === afterLoad.saveState.hud.maxHp &&
      afterLoad.saveState.hud.sp === afterLoad.saveState.hud.maxSp &&
      playTimeDeltaSeconds >= 0 && playTimeDeltaSeconds <= 10;
    const result = {
      id: 'M1101', attempt, passed,
      browser: { product: 'Chromium', version: launch.browserVersion, processCount: 2, sameTemporaryProfile: true },
      flow: 'visible max-level New Game -> Map64 -> visible System/Save Game confirmation -> terminate Chromium -> relaunch same disposable profile without test query -> visible Load Game roster -> load -> compare in-memory GameSaveState',
      comparedFields: Object.keys(beforeSave).sort(),
      ignoredVolatileFields: ['savedAt', 'playTimeSeconds'],
      playTime: { before: beforeSave.playTimeSeconds, after: afterLoad.saveState.playTimeSeconds, deltaSeconds: playTimeDeltaSeconds,
        acceptedMaximumDeltaSeconds: 10 },
      beforeSave,
      afterLoad: afterLoad.saveState,
      differences,
      activeSceneMapId: loadedScene.mapId,
      errors: runtimeErrors,
      captures,
      restrictions: {
        browserStorageReadByHarness: false,
        browserStorageWrittenByHarness: false,
        visibleGameSaveActionUsed: true,
        visibleLoadGameActionUsed: true,
        temporaryProfileRemoved: true,
        userSavePathAccessed: false,
        originalJarAccessed: false,
      },
      limits: [
        'This compares current web GameSaveState fields on one DEV max-level class-6 save; it does not establish native RMS/J2ME parity or other classes/states.',
        'playTimeSeconds is allowed to advance by up to ten seconds across the visible menu and cold restart; savedAt is browser-only metadata.',
        'Runtime comparison reads the in-memory WorldScene after ordinary UI actions; the harness does not inspect browser storage.',
      ],
    };
    await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    if (!passed) throw new Error(`M1101 criteria failed: ${JSON.stringify({ differences, playTimeDeltaSeconds, errors })}`);
    process.stdout.write(`${JSON.stringify({ id: 'M1101', attempt, passed, browserVersion: launch.browserVersion,
      mapId: afterLoad.mapId, level: afterLoad.saveState.hud.level, fields: result.comparedFields.length,
      differences: differences.length, playTimeDeltaSeconds, errors: runtimeErrors.length, outputDir })}\n`);
  } catch (error) {
    await writeFile(join(outputDir, 'result.json'), `${JSON.stringify({ id: 'M1101', attempt, passed: false,
      error: error instanceof Error ? error.message : String(error), errors, captures, chromeLog: chromeLog.slice(-4000),
      restrictions: { browserStorageReadByHarness: false, browserStorageWrittenByHarness: false,
        userSavePathAccessed: false, originalJarAccessed: false } }, null, 2)}\n`);
    throw error;
  } finally {
    await stopChrome(browserSocket).catch(() => {});
    await rm(profileRoot, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
