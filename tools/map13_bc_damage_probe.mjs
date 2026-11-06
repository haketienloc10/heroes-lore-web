#!/usr/bin/env node

/** Observe a real BC hit against the high-HP, ordinary-defense browser profile. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1096_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1096 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1096-map13-bc-hit-damage/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1096-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=damage-survival&testScenario=map13-bc-attack-live';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'damage-survival' ||
  parsedUrl.searchParams.get('testScenario') !== 'map13-bc-attack-live') {
  throw new Error('M1096 requires the local DEV damage-survival Map13 BC-attack preview');
}

let chrome;
let socket;
let page;
let stderr = '';
const browserErrors = [];
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
        browserErrors.push({ method: message.method, params: message.params ?? {} });
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
  const deadlineCanvas = Date.now() + 30000;
  while (Date.now() < deadlineCanvas) {
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
    try { snapshot = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    const game = window.__heroesLoreDebugGame;
    const scene = game?.scene?.getScenes(true).find((candidate) => candidate.scene?.key === 'WorldScene');
    const map = scene?.maps?.get?.(13);
    const bc = (map?.enemies ?? []).find((enemy) => enemy.enemyId === 37);
    const effects = (map?.enemyAttackAnimations ?? []).filter((animation) => animation.spriteId === 293)
      .map((animation) => ({
        tileX: animation.tileX,
        tileY: animation.tileY,
        frameIndex: animation.frameIndex,
        componentCount: (map.enemyAttackSprites?.get?.(animation.id)?.list ?? [])
          .filter((child) => child?.type === 'Image').length,
      }));
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: Number(host.dataset.testMapId ?? -1),
      tileX: Number(host.dataset.testPlayerTileX ?? -1),
      tileY: Number(host.dataset.testPlayerTileY ?? -1),
      hp: Number(host.dataset.testHp ?? -1),
      level: Number(host.dataset.testLevel ?? -1),
      mapPreviewReady: host.dataset.testMapPreviewReady === 'true',
      maxHp: snapshot?.resources?.maxHp ?? null,
      enemyIds: (map?.enemies ?? []).map((enemy) => enemy.enemyId),
      bc: bc ? { state: bc.state, ai: bc.sourceMap13Ai } : null,
      effects,
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

async function keyTap(key, code, vk) {
  const params = { key, code, windowsVirtualKeyCode: vk };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await delay(90);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(180);
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
  for (const args of presses) await keyTap(...args);
  const start = await waitFor((state) => state?.mapId === 13 && state.scenario === 'map13-bc-attack-live' &&
    state.profile === 'damage-survival' && state.mapPreviewReady && state.bc?.state === 'alive',
  'visible New Game to Map13 BC-attack damage-survival preview');
  if (start.level !== 1 || start.hp <= 0 || start.hp > start.maxHp ||
    start.tileX !== 10 || start.tileY !== 10 || start.enemyIds.length !== 1 || start.enemyIds[0] !== 37 ||
    start.bc.ai === undefined) {
    throw new Error(`Unexpected BC damage-survival fixture: ${JSON.stringify(start)}`);
  }
  await screenshot('map13-before-bc-hit', '01-map13-before-bc-hit.png');
  const damageBeforeObservation = start.maxHp - start.hp;

  const observations = [];
  let lastTick = null;
  let impact = damageBeforeObservation > 0 ? start : null;
  const deadline = Date.now() + 45000;
  while (impact === null && Date.now() < deadline) {
    const state = await runtime();
    const tick = state?.bc?.ai?.tick ?? null;
    if (tick !== null && tick !== lastTick) {
      observations.push({ elapsedMs: Date.now() - (deadline - 45000), hp: state.hp,
        state: state.bc?.ai?.state ?? null, tick, sampledPlayerTileX: state.bc?.ai?.sampledPlayerTileX ?? null,
        sampledPlayerTileY: state.bc?.ai?.sampledPlayerTileY ?? null, effects: state.effects });
      lastTick = tick;
    }
    if (state?.hp < start.hp) { impact = state; break; }
    await delay(8);
  }
  if (impact !== null) await screenshot('map13-after-bc-hit', '02-map13-after-bc-hit.png');
  const errors = browserErrors.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const totalDamage = start.maxHp - (impact?.hp ?? start.hp);
  const passed = impact !== null && impact.hp > 0 && totalDamage > 0 &&
    impact.profile === 'damage-survival' && impact.mapId === 13 && errors.length === 0;
  const result = {
    id: 'M1096', attempt, passed,
    profile: 'damage-survival', scenario: 'map13-bc-attack-live',
    route: 'visible New Game -> DEV Map13 BC-only fixture -> source-sampled player cell -> browser attaches at or after BC tick-7 check with HP below max while Ronin remains alive',
    title, start, damageBeforeObservation, impact, additionalDamage: impact === start ? 0 : start.hp - impact.hp,
    totalDamage, observations, screenshots, browserErrors: errors,
    restrictions: {
      saveFilesAccessed: false, browserStorageInspected: false,
      gameSaveActionUsed: false, originalJarAccessed: false,
      gameplayStateSeeded: true, postPreviewGameplayStateSeeded: false,
      directCombatMethodInvoked: false,
    },
    browser: { product: 'Chromium', ownedProcess: true, viewport: [780, 420],
      temporaryProfile: 'isolated-and-deleted-after-capture' },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`M1096 BC damage criteria failed: ${JSON.stringify({
    start, impact, lastObservation: observations.at(-1), errors,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: 'M1096', attempt, passed,
    level: start.level, maxHp: start.maxHp, hpAtObservation: start.hp, hpAfterObservation: impact.hp,
    damageBeforeObservation, additionalDamage: impact === start ? 0 : start.hp - impact.hp,
    totalDamage, hpAfterHit: impact.hp,
    browserErrors: errors.length,
    artifacts: `reference/screenshots/web-render/M1096-map13-bc-hit-damage/attempt-${attempt}` })}\n`);
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
    id: 'M1096', attempt, passed: false, profile: 'damage-survival',
    scenario: 'map13-bc-attack-live', screenshots, browserErrors,
    error: error instanceof Error ? error.message : String(error),
    browser: { product: 'Chromium', ownedProcess: true, stderr: stderr.slice(-3000) },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1096', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
