#!/usr/bin/env node

/** Defeat Map13 AQ through visible controls and observe its live linked wave. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1092_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1092 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1092-map13-aq-live-defeat-wave/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1092-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map13-aq-ai-live';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map13-aq-ai-live') {
  throw new Error('M1092 requires the local DEV max-level Map13 AQ AI preview');
}

let chrome;
let socket;
let page;
let stderr = '';
const errors = [];
const screenshots = [];

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
      } else if (['Runtime.exceptionThrown', 'Network.loadingFailed', 'Runtime.consoleAPICalled',
        'Log.entryAdded'].includes(message.method)) {
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
    const result = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
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
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolvePromise, rejectPromise) => {
          socket.addEventListener('open', resolvePromise, { once: true });
          socket.addEventListener('error', rejectPromise, { once: true });
        });
        page = new CdpPage(socket);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        await page.send('Log.enable');
        return;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out connecting to the owned Chromium page');
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
  await delay(750);
  await page.send('Page.bringToFront');
}

async function runtime() {
  return page.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let snapshot = null;
    let enemyProjectiles = [];
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    try { enemyProjectiles = JSON.parse(host.dataset.testEnemyProjectiles ?? '[]'); } catch {}
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: Number(host.dataset.testMapId ?? -1),
      tileX: Number(host.dataset.testPlayerTileX ?? -1),
      tileY: Number(host.dataset.testPlayerTileY ?? -1),
      hp: Number(host.dataset.testHp ?? -1),
      level: Number(host.dataset.testLevel ?? -1),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      snapshot,
      enemyProjectiles,
    };
  })()`);
}

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await runtime();
    if (predicate(state)) return state;
    await delay(8);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function keyTap(key, code, vk, textValue) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) await page.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(180);
}

async function moveOneTile(key, code, vk, tileX, tileY) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  let state;
  try {
    state = await waitFor((candidate) => candidate?.tileX === tileX && candidate?.tileY === tileY,
      `player reaches (${tileX},${tileY})`, 4000);
  } finally {
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  await delay(180);
  state = await runtime();
  if (state?.tileX !== tileX || state?.tileY !== tileY) {
    throw new Error(`Visible movement did not settle at (${tileX},${tileY}): ${JSON.stringify(state)}`);
  }
  return state;
}

async function screenshot(label, filename) {
  const image = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(image.data, 'base64');
  await writeFile(join(outputDir, filename), bytes);
  screenshots.push({
    label,
    file: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
  });
}

function bossFrom(state) {
  return state?.snapshot?.enemies.find((enemy) => enemy.enemyId === 35);
}

function relevantProjectiles(state, sourceOrder) {
  return (state?.enemyProjectiles ?? []).filter((projectile) => projectile.sourceOrder === sourceOrder);
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const title = await runtime();
  await screenshot('fresh-title', '00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await keyTap(key, code, vk);
  const start = await waitFor((state) => state?.mapId === 13 && state.scenario === 'map13-aq-ai-live' &&
    state.mapPreviewReady && state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    bossFrom(state)?.state === 'alive', 'visible New Game to Map13 AQ preview');
  const boss = bossFrom(start);
  if (start.profile !== 'max-level' || start.level !== 99 || start.hp !== start.snapshot.resources.maxHp ||
    boss?.sourceAu !== true || boss.renderSpriteId !== 291) {
    throw new Error(`Unexpected Map13 max-level AQ starting state: ${JSON.stringify({ start, boss })}`);
  }
  await screenshot('map13-aq-start', '01-map13-aq-start.png');

  const movement = [];
  for (const y of [9, 8, 7, 6]) movement.push(await moveOneTile('ArrowUp', 'ArrowUp', 38, 10, y));
  movement.push(await moveOneTile('ArrowLeft', 'ArrowLeft', 37, 9, 6));
  const approach = await runtime();
  if (approach.mapId !== 13 || approach.tileX !== 9 || approach.tileY !== 6 ||
    approach.profile !== 'max-level' || approach.hp <= 0) {
    throw new Error(`Visible approach to AQ failed: ${JSON.stringify(approach)}`);
  }
  await keyTap('ArrowUp', 'ArrowUp', 38);
  const facing = await runtime();
  if (facing.tileX !== 9 || facing.tileY !== 6 || facing.snapshot?.player.direction !== 1) {
    throw new Error(`Could not face AQ from the adjacent tile: ${JSON.stringify(facing)}`);
  }
  await screenshot('aq-facing-live-approach', '02-aq-facing-live-approach.png');

  let defeatEntry = null;
  const attackInputs = [];
  for (let strike = 0; strike < 16; strike += 1) {
    await keyTap('5', 'Numpad5', 101, '5');
    attackInputs.push({ strike: strike + 1, atMs: Date.now() });
    defeatEntry = await waitFor((state) => {
      const current = bossFrom(state);
      return current === undefined || current.state !== 'alive' || current.hp <= 0;
    }, `AQ defeat after visible Numpad5 input ${strike + 1}`, 650, 20).catch(() => null);
    if (defeatEntry !== null) break;
  }
  if (defeatEntry === null) {
    throw new Error(`AQ remained alive after sixteen visible light attacks: ${JSON.stringify(bossFrom(await runtime()))}`);
  }

  const deathSamples = [];
  const waveDeadline = Date.now() + 6000;
  let waveState = null;
  while (Date.now() < waveDeadline) {
    const state = await runtime();
    const currentBoss = bossFrom(state);
    const group = state?.snapshot?.enemies.filter((enemy) => [36, 37, 38].includes(enemy.enemyId)) ?? [];
    deathSamples.push({ atMs: Date.now(), aqState: currentBoss?.state ?? null,
      aqDeathUpdatesRemaining: currentBoss?.deathUpdatesRemaining ?? null,
      group: group.map(({ sourceOrder, enemyId, tileX, tileY, hp, state: enemyState, renderSpriteId }) =>
        ({ sourceOrder, enemyId, tileX, tileY, hp, state: enemyState, renderSpriteId })) });
    if (currentBoss?.state === 'removed' && group.length === 3 && group.every((enemy) => enemy.state === 'alive')) {
      waveState = state;
      break;
    }
    await delay(12);
  }
  if (waveState === null) throw new Error(`AQ removal callback did not produce the linked wave: ${JSON.stringify(deathSamples.slice(-5))}`);
  await screenshot('aq-removed-linked-wave-visible', '03-aq-removed-linked-wave.png');

  const observedWaveProjectiles = [];
  const attackDeadline = Date.now() + 8000;
  let waveAttackState = null;
  while (Date.now() < attackDeadline) {
    const state = await runtime();
    const rendered = (state?.enemyProjectiles ?? []).filter((projectile) =>
      /^boss\/atef\/(36|37|38)$/.test(projectile.sourceResource ?? '') &&
      projectile.effectFrameCount > 0 && projectile.renderedComponentCount > 0);
    for (const projectile of rendered) observedWaveProjectiles.push({ atMs: Date.now(), ...projectile });
    if (rendered.length > 0) {
      waveAttackState = state;
      break;
    }
    await delay(8);
  }
  if (waveAttackState !== null) await screenshot('linked-wave-rendered-projectile', '04-linked-wave-projectile.png');
  else waveAttackState = await runtime();
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const waveEnemies = waveState.snapshot.enemies.filter((enemy) => [36, 37, 38].includes(enemy.enemyId));
  const passed = approach.mapId === 13 && approach.profile === 'max-level' && approach.level === 99 &&
    approach.snapshot.resources.hp > 0 && facing.snapshot.player.direction === 1 &&
    defeatEntry.mapId === 13 && bossFrom(defeatEntry)?.state !== 'alive' &&
    waveState.mapId === 13 && bossFrom(waveState)?.state === 'removed' && waveEnemies.length === 3 &&
    waveEnemies.every((enemy) => enemy.state === 'alive' && enemy.sourceAu === true) && pageErrors.length === 0;
  const result = {
    id: 'M1092', attempt, passed,
    profile: 'max-level', scenario: 'map13-aq-ai-live',
    route: 'visible New Game -> DEV max-level Map13 preview -> visible movement to AQ -> visible Numpad5 defeat -> source removal callback creates AF/BC/CC -> observe rendered linked-wave projectile when available',
    title, start, movement, approach, facing, attackInputs, defeatEntry, deathSamples, waveState,
    waveEnemies, waveAttackState, observedWaveProjectiles,
    screenshots,
    browserErrors: pageErrors,
    restrictions: { saveFilesAccessed: false, browserStorageInspected: false,
      gameSaveActionUsed: false, originalJarAccessed: false, gameplayStateSeeded: true,
      postPreviewGameplayStateSeeded: false, directCombatMethodInvoked: false },
    browser: { product: 'Chromium', ownedProcess: true, viewport: [780, 420],
      temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1092 AQ defeat/wave criteria failed: ${JSON.stringify({
    approach: { tile: [approach.tileX, approach.tileY], hp: approach.hp },
    defeat: bossFrom(defeatEntry), waveEnemies, pageErrors,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed,
    approach: [approach.tileX, approach.tileY], attacks: attackInputs.length,
    defeat: bossFrom(defeatEntry)?.state, wave: waveEnemies.map(({ enemyId, sourceOrder, state }) => ({ enemyId, sourceOrder, state })),
    renderedWaveProjectiles: observedWaveProjectiles.length, browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1092-map13-aq-live-defeat-wave/attempt-${attempt}` })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
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
  const partial = {
    id: 'M1092', attempt, passed: false, profile: 'max-level', scenario: 'map13-aq-ai-live',
    screenshots, browserErrors: errors,
    error: error instanceof Error ? error.message : String(error),
    browser: { product: 'Chromium', ownedProcess: true, stderr: stderr.slice(-3000) },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1092', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
