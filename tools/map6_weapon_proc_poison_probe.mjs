#!/usr/bin/env node

/** Observe poison proc application and status-3 expiry in the live Map6 preview. */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const attempt = Number(process.env.HEROES_LORE_M1116_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) throw new Error('M1116 attempt must be from 1 to 3');
const chromePath = process.env.HEROES_LORE_CHROME_BIN ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const baseUrl = process.env.HEROES_LORE_BASE_URL ?? 'http://127.0.0.1:5176/';
const scenarioName = 'map6-weapon-proc-poison';
const outDir = join('reference/screenshots/web-render/M1116-map6-weapon-proc-poison', `attempt-${attempt}`);
const profileRoot = await mkdtemp(join(tmpdir(), 'heroes-lore-m1116-'));
const profileDir = join(profileRoot, 'chrome-profile');
const errors = [];
const captures = [];
let processHandle = null;
let page = null;
let browser = null;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, label, timeoutMs = 30000, pollMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await delay(pollMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

function connect(url, phase) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error(`${phase} CDP WebSocket failed`)), { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (request === undefined) return;
      pending.delete(message.id);
      if (message.error !== undefined) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push({ phase, kind: 'page-error', text: message.params?.exceptionDetails?.text ?? 'unknown exception' });
    } else if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      errors.push({ phase, kind: 'console-error', text: message.params.entry.text ?? 'unknown console error' });
    } else if (message.method === 'Network.loadingFailed') {
      errors.push({ phase, kind: 'request-failed', text: message.params?.errorText ?? 'unknown network error' });
    }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error(`${phase} CDP closed`));
    pending.clear();
  });
  return {
    ready: () => opened,
    command(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

async function openChromium() {
  const portFile = join(profileDir, 'DevToolsActivePort');
  await rm(portFile, { force: true });
  processHandle = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--disable-extensions', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=780,600', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const endpoint = await waitFor(async () => {
    try {
      const [port, browserPathname] = (await readFile(portFile, 'utf8')).trim().split('\n');
      return port && browserPathname ? { port: Number(port), browserPathname } : null;
    } catch {
      if (processHandle?.exitCode !== null) throw new Error('Chromium exited before exposing DevTools');
      return null;
    }
  }, 'Chromium DevTools endpoint', 20000);
  browser = connect(`ws://127.0.0.1:${endpoint.port}${endpoint.browserPathname}`, 'browser');
  await browser.ready();
  const version = await browser.command('Browser.getVersion');
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/json/list`).catch(() => null);
    if (!response?.ok) return null;
    const targets = await response.json();
    return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) ?? null;
  }, 'Chromium page target');
  page = connect(target.webSocketDebuggerUrl, 'page');
  await page.ready();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable']
    .map((method) => page.command(method)));
  return version.product;
}

async function evaluate(expression) {
  const response = await page.command('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (response.exceptionDetails !== undefined) throw new Error(response.exceptionDetails.text ?? 'page evaluation failed');
  return response.result?.value ?? null;
}

async function press(key, code = key, virtualKey = ({ Enter: 13, ArrowDown: 40, ArrowRight: 39 })[key], text = undefined) {
  const input = { key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey };
  if (text !== undefined) Object.assign(input, { text, unmodifiedText: text });
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', ...input });
  await delay(90);
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', ...input });
}

async function pressUiKey(key, settleMs = 140) {
  await press(key);
  await delay(settleMs);
}

async function readState() {
  return evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let runtime = null;
    let statusEffects = null;
    try { runtime = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    try { statusEffects = JSON.parse(host.dataset.testEnemyStatusEffects ?? 'null'); } catch {}
    return {
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      ready: host.dataset.testMapPreviewReady === 'true',
      runtime,
      statusEffects,
    };
  })()`);
}

async function capture(file, label, state = null) {
  const screenshot = await page.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(outDir, file), Buffer.from(screenshot.data, 'base64'));
  captures.push({ file, label, state });
}

function targetEnemy(state) {
  return state?.runtime?.enemies?.find((enemy) => enemy.sourceOrder === 5 && enemy.enemyId === 4) ?? null;
}

function targetStatus(state) {
  return state?.statusEffects?.find((entry) => entry.sourceOrder === 5)?.effects?.find((effect) => effect.id === 3) ?? null;
}

async function closeChromium() {
  const current = processHandle;
  processHandle = null;
  page?.close();
  page = null;
  if (current !== null && current.exitCode === null && current.signalCode === null) {
    const exited = new Promise((resolve) => current.once('exit', resolve));
    await browser?.command('Browser.close').catch(() => {});
    await Promise.race([exited, delay(5000)]);
    if (current.exitCode === null && current.signalCode === null) current.kill('SIGTERM');
    await Promise.race([exited, delay(2500)]);
    if (current.exitCode === null && current.signalCode === null) current.kill('SIGKILL');
  }
  browser?.close();
  browser = null;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browserVersion = await openChromium();
  const url = new URL(baseUrl);
  url.searchParams.set('testProfile', 'max-level');
  url.searchParams.set('testScenario', scenarioName);
  await page.command('Page.navigate', { url: url.href });
  await waitFor(() => evaluate("Boolean(document.querySelector('#game canvas'))"), 'game canvas');
  await page.command('Page.bringToFront');
  const pageReady = await waitFor(() => evaluate(`Boolean(window.__heroesLoreDebugGame?.scene.getScenes(true)
    .some((scene) => scene.sys.settings.key === 'StartupFlowScene'))`), 'StartupFlowScene ready', 10000);
  if (!pageReady) throw new Error('StartupFlowScene did not become active');
  // Match the shared campaign probe's cold-start settling window. The prior
  // 500 ms wait captured the Hands-On splash and began sending menu input
  // before the title/menu route was ready.
  await delay(1500);
  const initialPage = await evaluate(`(() => ({ url: location.href,
    activeScenes: window.__heroesLoreDebugGame?.scene.getScenes(true).map((scene) => scene.sys.settings.key) ?? [],
    hostProfile: document.querySelector('#game')?.dataset.testProfile ?? null,
    text: document.body.innerText }))()`);
  await capture('00-initial-page.png', 'startup page before visible New Game input', initialPage);
  for (const key of ['Enter', 'Enter', 'Enter', 'Enter', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'ArrowRight', 'Enter']) {
    await pressUiKey(key);
  }
  const postInputPage = await evaluate(`(() => ({ url: location.href,
    activeScenes: window.__heroesLoreDebugGame?.scene.getScenes(true).map((scene) => scene.sys.settings.key) ?? [],
    profile: document.querySelector('#game')?.dataset.testProfile ?? null,
    runtime: document.querySelector('#game')?.dataset.testRuntime ?? null,
    text: document.body.innerText }))()`);
  await capture('01-after-newgame-inputs.png', 'page after visible New Game input sequence', postInputPage);
  const before = await waitFor(async () => {
    const state = await readState();
    return state?.profile === 'max-level' && state.scenario === scenarioName &&
      state.mapId === 6 && state.tileX === 10 && state.tileY === 12 && state.ready ? state : null;
  }, 'visible max-level Map6 poison-proc fixture');
  const enemyAtStart = targetEnemy(before);
  if (enemyAtStart?.hp !== 50000000 || before.level !== 99 || before.hp !== before.runtime?.resources?.maxHp) {
    throw new Error(`Unexpected poison-status fixture: ${JSON.stringify({ before, enemyAtStart })}`);
  }
  await capture('00-map6-proc-fixture.png', `visible max-level Map6 ${scenarioName} fixture`, before);

  const attacks = [];
  for (let attackIndex = 1; attackIndex <= 30; attackIndex += 1) {
    await press('5', 'Numpad5', 101, '5');
    await delay(150);
    const state = await readState();
    const enemy = targetEnemy(state);
    const status = targetStatus(state);
    attacks.push({ attackIndex, enemyHp: enemy?.hp ?? null, enemyState: enemy?.state ?? null,
      statusTicksElapsed: status?.ticksElapsed ?? null, playerHp: state?.hp ?? null });
    if (status !== null) {
      await capture('01-status-3-applied.png', 'poison status 3 applied by a visible weapon-proc hit', state);
      break;
    }
  }
  const appliedState = await readState();
  const appliedStatus = targetStatus(appliedState);
  if (appliedStatus === null) throw new Error(`Poison status 3 was not observed after visible attacks: ${JSON.stringify(attacks)}`);

  const statusSamples = [{ elapsedMs: 0, ticksElapsed: appliedStatus.ticksElapsed }];
  const poisonPulses = [];
  let previousEnemyHp = targetEnemy(appliedState)?.hp ?? null;
  const expiryStart = Date.now();
  let expiredState = null;
  while (Date.now() - expiryStart < 8000) {
    await delay(12);
    const state = await readState();
    const status = targetStatus(state);
    const enemy = targetEnemy(state);
    if (enemy?.hp !== null && enemy?.hp !== undefined && previousEnemyHp !== null && enemy.hp < previousEnemyHp) {
      poisonPulses.push({
        elapsedMs: Date.now() - expiryStart,
        statusTick: status?.ticksElapsed ?? null,
        previousStatusTick: statusSamples.at(-1)?.ticksElapsed ?? null,
        damage: previousEnemyHp - enemy.hp,
        enemyHp: enemy.hp,
      });
    }
    if (enemy?.hp !== null && enemy?.hp !== undefined) previousEnemyHp = enemy.hp;
    const ticksElapsed = status?.ticksElapsed ?? null;
    const previous = statusSamples.at(-1);
    if (ticksElapsed !== previous.ticksElapsed) {
      statusSamples.push({ elapsedMs: Date.now() - expiryStart, ticksElapsed });
    }
    if (status === null) {
      expiredState = state;
      break;
    }
  }
  if (expiredState === null) throw new Error(`Status 3 did not expire within eight seconds: ${JSON.stringify(statusSamples)}`);
  await capture('02-status-3-expired.png', 'poison status 3 expired while the max-level player and target remain alive', expiredState);

  const lastActiveTick = statusSamples.filter((sample) => sample.ticksElapsed !== null)
    .at(-1)?.ticksElapsed ?? null;
  const observedTicks = statusSamples.filter((sample) => sample.ticksElapsed !== null)
    .map((sample) => sample.ticksElapsed);
  const monotonic = observedTicks.every((tick, index) => index === 0 || tick >= observedTicks[index - 1]);
  const targetAtEnd = targetEnemy(expiredState);
  const validPoisonPulses = poisonPulses.length >= 4 && poisonPulses.every((pulse) =>
    pulse.damage >= 15 && pulse.damage <= 25 &&
    (pulse.statusTick !== null && pulse.statusTick % 8 === 0 ||
      pulse.statusTick === null && pulse.previousStatusTick === 39));
  const passed = browserVersion.startsWith('Chrome/') && attacks.length > 0 && appliedStatus !== null &&
    expiredState.profile === 'max-level' && expiredState.mapId === 6 && expiredState.level === 99 &&
    expiredState.hp > 0 && targetAtEnd?.state === 'alive' && targetAtEnd.hp > 0 &&
    monotonic && lastActiveTick === 39 && validPoisonPulses && errors.length === 0;
  const result = {
    id: 'M1116', attempt, passed,
    browser: { product: 'Chromium', version: browserVersion, viewport: [780, 600] },
    profile: { name: 'max-level', level: before.level, hp: before.hp, maxHp: before.runtime.resources.maxHp },
    scenario: { name: scenarioName, mapId: 6, playerTile: [before.tileX, before.tileY],
      target: { enemyId: 4, sourceOrder: 5, startHp: enemyAtStart.hp } },
    proc: { weapon: { category: 2, itemId: 33, procCode: 6 }, visibleAttackCount: attacks.length,
      attacks, statusApplied: appliedStatus },
    poison: { statusId: 3, expectedSourceTicks: 40, pulsePeriodTicks: 8,
      samples: statusSamples, pulses: poisonPulses, validPulses: validPoisonPulses,
      lastActiveTick, monotonic, expired: targetStatus(expiredState) === null,
      targetAtEnd: { state: targetAtEnd?.state ?? null, hp: targetAtEnd?.hp ?? null },
      playerAtEnd: { level: expiredState.level, hp: expiredState.hp, maxHp: expiredState.runtime.resources.maxHp } },
    errors,
    captures,
    restrictions: { browserStorageReadByHarness: false, browserStorageWrittenByHarness: false,
      userSavePathAccessed: false, originalJarAccessed: false, temporaryProfileRemoved: true },
    limits: [
      'This observes a seeded current-web Map6 poison proc fixture, not natural equipment acquisition, proc probability, or J2ME parity.',
      'Poison update ticks and damage changes are observed from DEV telemetry; exact source paint/update phase parity and random damage sequence parity are not established.',
    ],
  };
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1116 criteria failed: ${JSON.stringify({ lastActiveTick, monotonic,
    validPoisonPulses, poisonPulses, errors, targetAtEnd })}`);
  process.stdout.write(`${JSON.stringify({ id: 'M1116', attempt, passed, browserVersion,
    attacks: attacks.length, statusAppliedTick: appliedStatus.ticksElapsed,
    lastActiveTick, expired: true, poisonPulseCount: poisonPulses.length, validPoisonPulses,
    targetHp: targetAtEnd.hp, playerHp: expiredState.hp, samples: statusSamples.length,
    errors: errors.length, outDir })}\n`);
}

try {
  await run();
} catch (error) {
  await writeFile(join(outDir, 'result.json'), `${JSON.stringify({ id: 'M1116', attempt, passed: false,
    error: error instanceof Error ? error.message : String(error), errors, captures,
    restrictions: { browserStorageReadByHarness: false, browserStorageWrittenByHarness: false,
      userSavePathAccessed: false, originalJarAccessed: false } }, null, 2)}\n`);
  throw error;
} finally {
  await closeChromium().catch(() => {});
  await rm(profileRoot, { recursive: true, force: true }).catch(() => {});
}
