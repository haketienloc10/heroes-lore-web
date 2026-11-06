#!/usr/bin/env node

/** Observe BC's live sampled-cell strike and its rendered effect on Map13. */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attempt = Number(process.env.HEROES_LORE_M1094_ATTEMPT ?? 1);
if (!Number.isInteger(attempt) || attempt < 1 || attempt > 3) {
  throw new Error('M1094 attempt must be from 1 to 3');
}
const outputDir = join(root,
  `reference/screenshots/web-render/M1094-map13-bc-attack-live/attempt-${attempt}`);
const profileDir = await mkdtemp(join(tmpdir(), 'heroes-lore-m1094-'));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const url = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map13-bc-attack-live';
const parsedUrl = new URL(url);
if (parsedUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  parsedUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedUrl.searchParams.get('testScenario') !== 'map13-bc-attack-live') {
  throw new Error('M1094 requires the local DEV max-level Map13 BC-attack preview');
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
    const game = window.__heroesLoreDebugGame;
    const scene = game?.scene?.getScenes(true).find((candidate) => candidate.scene?.key === 'WorldScene');
    const map = scene?.maps?.get?.(13);
    const mapEnemies = (map?.enemies ?? []).map((enemy) => ({
      enemyId: enemy.enemyId,
      sourceOrder: enemy.sourceOrder,
      sourceBehavior: enemy.sourceBehavior ?? null,
      state: enemy.state,
      sourceMap13Ai: enemy.sourceMap13Ai ?? null,
    }));
    const enemyAttackEffects = (map?.enemyAttackAnimations ?? []).map((animation) => {
      const sprite = map.enemyAttackSprites?.get?.(animation.id);
      const images = (sprite?.list ?? []).filter((child) => child?.type === 'Image');
      return {
        id: animation.id,
        spriteId: animation.spriteId,
        frameIndex: animation.frameIndex,
        tileX: animation.tileX,
        tileY: animation.tileY,
        attachedSourceOrder: animation.attachedSourceOrder ?? null,
        renderedComponentCount: images.length,
        imageTextureKeys: images.map((image) => image.texture?.key ?? null),
      };
    });
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
      mapEnemies,
      enemyProjectiles,
      enemyAttackEffects,
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

function enemyFrom(state, enemyId) {
  return state?.snapshot?.enemies.find((enemy) => enemy.enemyId === enemyId);
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
  const start = await waitFor((state) => state?.mapId === 13 && state.scenario === 'map13-bc-attack-live' &&
    state.mapPreviewReady && state.snapshot?.format === 'heroes-lore-campaign-test-runtime-v9' &&
    enemyFrom(state, 37)?.state === 'alive',
  'visible New Game to Map13 BC-attack preview');
  const bc = enemyFrom(start, 37);
  const seededBc = start.mapEnemies.find((enemy) => enemy.enemyId === 37);
  if (start.profile !== 'max-level' || start.level !== 99 || start.hp !== start.snapshot.resources.maxHp ||
    bc?.sourceAu !== true || bc.renderSpriteId !== 293 || seededBc?.sourceBehavior !== 'map13-bc' ||
    seededBc.sourceMap13Ai?.state !== 3 || seededBc.sourceMap13Ai?.tick < 3 ||
    start.snapshot.enemies.some((enemy) => [35, 36, 38].includes(enemy.enemyId))) {
    throw new Error(`Unexpected Map13 max-level BC-attack fixture: ${JSON.stringify({ start, bc, seededBc })}`);
  }
  await screenshot('map13-bc-before-strike', '01-map13-bc-before-strike.png');
  const attackEffect = await waitFor((state) => {
    const currentBc = state?.mapEnemies.find((enemy) => enemy.enemyId === 37);
    return currentBc?.sourceMap13Ai?.state === 3 &&
      currentBc.sourceMap13Ai.tick >= 4 &&
      currentBc.sourceMap13Ai.sampledPlayerTileX === state.tileX &&
      currentBc.sourceMap13Ai.sampledPlayerTileY === state.tileY &&
      state.enemyAttackEffects.some((effect) => effect.spriteId === 293 &&
        effect.tileX === state.tileX && effect.tileY === state.tileY &&
        effect.renderedComponentCount > 0);
  }, 'BC samples the player cell and its attack effect renders there', 12000);
  const visibleStrikeEffects = attackEffect.enemyAttackEffects.filter((effect) =>
    effect.spriteId === 293 && effect.tileX === attackEffect.tileX && effect.tileY === attackEffect.tileY &&
    effect.renderedComponentCount > 0);
  await screenshot('bc-sampled-cell-strike-effect', '02-bc-sampled-cell-strike-effect.png');
  const impact = await waitFor((state) => {
    const currentBc = state?.mapEnemies.find((enemy) => enemy.enemyId === 37);
    return currentBc?.sourceMap13Ai?.state === 3 && currentBc.sourceMap13Ai.tick >= 7 &&
      currentBc.sourceMap13Ai.sampledPlayerTileX === attackEffect.tileX &&
      currentBc.sourceMap13Ai.sampledPlayerTileY === attackEffect.tileY && state.hp > 0;
  }, 'BC reaches its frame-7 sampled-cell hit check while the max-level player stays alive', 8000);
  await screenshot('bc-strike-hit-check', '03-bc-strike-hit-check.png');
  const pageErrors = errors.filter((event) => event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const passed = impact.mapId === 13 && impact.profile === 'max-level' && impact.level === 99 &&
    impact.hp > 0 && visibleStrikeEffects.length > 0 && visibleStrikeEffects.every((effect) =>
      effect.spriteId === bc.renderSpriteId && effect.renderedComponentCount > 0) && pageErrors.length === 0;
  const result = {
    id: 'M1094', attempt, passed,
    profile: 'max-level', scenario: 'map13-bc-attack-live',
    route: 'visible New Game -> DEV Map13 fixture seeds BC at attack tick 3 -> BC samples the level-99 player cell at tick 4, renders /boss/atef/37 there, then reaches the tick-7 sampled-cell hit check',
    title, start, seededBc, attackEffect, visibleStrikeEffects, impact,
    screenshots,
    browserErrors: pageErrors,
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
  if (!passed) throw new Error(`M1094 BC attack effect criteria failed: ${JSON.stringify({
    seededBc, visibleStrikeEffects, impact, pageErrors,
  })}`);
  process.stdout.write(`${JSON.stringify({ id: result.id, attempt, passed,
    startHp: start.hp, impactHp: impact.hp,
    bcSpriteId: bc.renderSpriteId, sampledCell: { tileX: impact.tileX, tileY: impact.tileY },
    visibleEffects: visibleStrikeEffects,
    browserErrors: pageErrors.length,
    artifacts: `reference/screenshots/web-render/M1094-map13-bc-attack-live/attempt-${attempt}` })}\n`);
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
    id: 'M1094', attempt, passed: false, profile: 'max-level', scenario: 'map13-bc-attack-live',
    screenshots, browserErrors: errors,
    error: error instanceof Error ? error.message : String(error),
    browser: { product: 'Chromium', ownedProcess: true, stderr: stderr.slice(-3000) },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M1094', attempt, passed: false, error: partial.error })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
