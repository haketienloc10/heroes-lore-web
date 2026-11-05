#!/usr/bin/env node

/**
 * Replay the DEV max-level Map60 investigation scenario using rendered-game
 * keyboard input. The scenario seeds only the already-accepted Map60 quest
 * state; all Map60/61 movement, item pickup, and Guard interaction are live.
 * The probe reads read-only DEV telemetry and never inspects browser storage.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const attemptNumber = Number(process.env.HEROES_LORE_M969_ATTEMPT ?? 2);
if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
  throw new Error('M969 attempt number must be between 1 and 3');
}
const outputDir = join(root, `reference/screenshots/web-render/M969-map60-guard-quest/attempt-${attemptNumber}`);
const userDataDir = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), 'heroes-lore-m969-')));
const chromePath = process.env.HEROES_LORE_CHROME ??
  '/home/locdt/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const startUrl = process.env.HEROES_LORE_URL ??
  'http://127.0.0.1:5174/?testProfile=max-level&testScenario=map60-investigation';
const parsedStartUrl = new URL(startUrl);
if (parsedStartUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedStartUrl.hostname) ||
  parsedStartUrl.searchParams.get('testProfile') !== 'max-level' ||
  parsedStartUrl.searchParams.get('testScenario') !== 'map60-investigation') {
  throw new Error('M969 probe requires the local max-level Map60 investigation DEV scenario');
}

let browserProcess;
let socket;
let cdp;
let chromeStderr = '';
const observations = [];
const cdpEvents = [];

class DevToolsPage {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else if (['Network.loadingFailed', 'Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded']
        .includes(message.method)) {
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
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails !== undefined) throw new Error(response.exceptionDetails.text ?? 'Evaluation failed');
    return response.result?.value;
  }
}

async function waitForDevToolsPort() {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split('\n');
      if (port !== undefined && /^\d+$/.test(port)) return Number(port);
    } catch {}
    if (browserProcess.exitCode !== null) throw new Error(`Chromium exited (${browserProcess.exitCode})`);
    await delay(50);
  }
  throw new Error('Timed out waiting for owned Chromium DevTools');
}

async function launch() {
  browserProcess = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`, '--window-size=780,400', startUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browserProcess.stderr.setEncoding('utf8');
  browserProcess.stderr.on('data', (chunk) => { chromeStderr += chunk; });
  const port = await waitForDevToolsPort();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
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
        break;
      }
    } catch {}
    await delay(100);
  }
  if (cdp === undefined) throw new Error('Timed out connecting to owned Chromium page');
  const canvasDeadline = Date.now() + 30000;
  while (Date.now() < canvasDeadline) {
    if (await cdp.evaluate("document.readyState === 'complete' && document.querySelector('#game canvas') !== null")) break;
    await delay(50);
  }
  await delay(1200);
  await cdp.send('Page.bringToFront');
}

async function readRuntime() {
  const value = await cdp.evaluate(`(() => {
    const host = document.querySelector('#game');
    if (!host) return null;
    let runtime = null;
    try { runtime = JSON.parse(host.dataset.testRuntime ?? 'null'); } catch {}
    return {
      profile: host.dataset.testProfile ?? null,
      scenario: host.dataset.testScenario ?? null,
      mapId: host.dataset.testMapId === undefined ? null : Number(host.dataset.testMapId),
      tileX: host.dataset.testPlayerTileX === undefined ? null : Number(host.dataset.testPlayerTileX),
      tileY: host.dataset.testPlayerTileY === undefined ? null : Number(host.dataset.testPlayerTileY),
      hp: host.dataset.testHp === undefined ? null : Number(host.dataset.testHp),
      level: host.dataset.testLevel === undefined ? null : Number(host.dataset.testLevel),
      runtime,
    };
  })()`);
  return value ?? null;
}

async function waitFor(predicate, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readRuntime();
    if (predicate(state)) return state;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function tap(key, code, virtualKeyCode, textValue) {
  const params = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  if (textValue !== undefined) await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: textValue, ...params });
  await delay(90);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  await delay(150);
}

async function holdUntil(key, code, virtualKeyCode, predicate, label, timeoutMs = 2500) {
  const params = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  const deadline = Date.now() + timeoutMs;
  let state = null;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  try {
    while (Date.now() < deadline) {
      state = await readRuntime();
      if (predicate(state)) {
        observations.push({ at: new Date().toISOString(), label, state });
        return state;
      }
      await delay(25);
    }
  } finally {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    await delay(130);
  }
  return state;
}

async function observe(label) {
  const state = await readRuntime();
  observations.push({ at: new Date().toISOString(), label, state });
  return state;
}

async function screenshot(name) {
  const response = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const { writeFile: write } = await import('node:fs/promises');
  await write(join(outputDir, name), Buffer.from(response.data, 'base64'));
}

async function startScenario() {
  await observe('fresh-title');
  await screenshot('00-title-screen.png');
  const presses = [
    ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13], ['Enter', 'Enter', 13],
    ['ArrowDown', 'ArrowDown', 40], ['Enter', 'Enter', 13], ['ArrowDown', 'ArrowDown', 40],
    ['Enter', 'Enter', 13], ['ArrowRight', 'ArrowRight', 39], ['Enter', 'Enter', 13],
  ];
  for (const [key, code, vk] of presses) await tap(key, code, vk);
  const state = await waitFor((candidate) => candidate?.mapId === 60, 'seeded Map60 runtime');
  if (state.profile !== 'max-level' || state.scenario !== 'map60-investigation' || state.level !== 99 ||
    state.runtime?.resources.hp !== state.runtime?.resources.maxHp ||
    !state.runtime.inventory.some((stack) => stack.category === 18 && stack.itemId === 3 && stack.count === 1) ||
    !state.runtime.gameFlags.includes(28) || state.runtime.combo.comboLimit !== 2) {
    throw new Error(`Unexpected Map60 investigation test state: ${JSON.stringify(state)}`);
  }
  await observe('map60-seeded-stage-start');
  await screenshot('01-map60-seeded-stage-start.png');
  return state;
}

const directionInputs = [
  { dx: 0, dy: -1, key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  { dx: 0, dy: 1, key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  { dx: -1, dy: 0, key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  { dx: 1, dy: 0, key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
];

function nextDirection(state, collision, goals) {
  const width = state.runtime.mapSize.width;
  const height = state.runtime.mapSize.height;
  const player = state.runtime.player;
  const isGoal = (x, y) => goals.has(`${x},${y}`);
  if (isGoal(player.tileX, player.tileY)) return null;
  const occupied = new Set(state.runtime.entityOccupiedCells.map((cell) => `${cell.tileX},${cell.tileY}`));
  occupied.delete(`${player.tileX},${player.tileY}`);
  const queue = [{ x: player.tileX, y: player.tileY, first: null }];
  const seen = new Set([`${player.tileX},${player.tileY}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of directionInputs) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= width || y >= height || seen.has(key) || occupied.has(key)) continue;
      if ((collision.values[y]?.[x] ?? -1) < 0 && !isGoal(x, y)) continue;
      const first = current.first ?? direction;
      if (isGoal(x, y)) return first;
      seen.add(key);
      queue.push({ x, y, first });
    }
  }
  return undefined;
}

async function advanceDialogue(label, limit = 12) {
  const steps = [];
  for (let index = 0; index < limit; index += 1) {
    const state = await readRuntime();
    if (state?.runtime?.dialogueOpen !== true) return steps;
    await screenshot(`${label}-dialogue-${String(index + 1).padStart(2, '0')}.png`);
    steps.push({ index: index + 1, mapId: state.mapId, tile: [state.tileX, state.tileY], inventory: state.runtime.inventory });
    await tap('Enter', 'Enter', 13);
  }
  const final = await readRuntime();
  if (final?.runtime?.dialogueOpen) throw new Error(`${label} dialogue did not settle after ${limit} Enter inputs`);
  return steps;
}

async function moveToTile(mapId, targetTile, targetMapId, label) {
  const collision = JSON.parse(await readFile(join(root, `web/public/assets/generated/collision/6/${mapId}.json`), 'utf8'));
  const goals = new Set([`${targetTile[0]},${targetTile[1]}`]);
  const route = [];
  let blockedMoves = 0;
  for (let iteration = 0; iteration < 320; iteration += 1) {
    let state = await readRuntime();
    if (targetMapId !== null && state?.mapId === targetMapId) return { route, final: state, blockedMoves };
    if (state?.mapId !== mapId || state.runtime === null) throw new Error(`${label}: unexpected runtime ${JSON.stringify(state)}`);
    if (state.runtime.dialogueOpen) {
      const steps = await advanceDialogue(`${label}-dialogue`);
      route.push({ type: 'advance-dialogue', steps });
      state = await readRuntime();
      if (state?.mapId === targetMapId) return { route, final: state, blockedMoves };
    }
    if (state.tileX === targetTile[0] && state.tileY === targetTile[1]) {
      const arrived = targetMapId === null
        ? await readRuntime()
        : await waitFor((candidate) => candidate?.mapId === targetMapId, `${label} transfer`, 8000);
      return { route, final: arrived, blockedMoves };
    }
    const direction = nextDirection(state, collision, goals);
    if (direction === undefined) throw new Error(`${label}: no live path from ${state.tileX},${state.tileY} to ${targetTile}`);
    if (direction === null) continue;
    const from = [state.tileX, state.tileY];
    const moved = await holdUntil(direction.key, direction.code, direction.vk,
      (candidate) => candidate?.mapId !== mapId || candidate.tileX !== from[0] || candidate.tileY !== from[1],
      `${label}-move-${iteration + 1}`, 1800);
    if (targetMapId !== null && moved?.mapId === targetMapId) {
      route.push({ from, to: [moved.tileX, moved.tileY], mapId: moved.mapId });
      const arrival = await observe(`${label}-arrival`);
      await screenshot(`${label}-arrival.png`);
      return { route, final: arrival, blockedMoves };
    }
    if (moved?.mapId === mapId && (moved.tileX !== from[0] || moved.tileY !== from[1])) {
      route.push({ from, to: [moved.tileX, moved.tileY] });
    } else {
      blockedMoves += 1;
      route.push({ from, blocked: true, player: [moved?.tileX, moved?.tileY] });
      if (blockedMoves > 30) throw new Error(`${label}: repeated blocked movement at ${from.join(',')}`);
    }
    if ((iteration + 1) % 12 === 0) await screenshot(`${label}-checkpoint-${iteration + 1}.png`);
  }
  throw new Error(`${label}: exceeded movement limit; last state ${JSON.stringify(await readRuntime())}`);
}

async function moveToAnyAdjacentNpc(mapId, npcSourceOrder, label) {
  const collision = JSON.parse(await readFile(join(root, `web/public/assets/generated/collision/6/${mapId}.json`), 'utf8'));
  const route = [];
  let blockedMoves = 0;
  for (let iteration = 0; iteration < 250; iteration += 1) {
    const state = await readRuntime();
    if (state?.mapId !== mapId || state.runtime === null) throw new Error(`${label}: unexpected runtime ${JSON.stringify(state)}`);
    const npc = state.runtime.npcs.find((candidate) => candidate.sourceOrder === npcSourceOrder && candidate.visible);
    if (npc === undefined) throw new Error(`${label}: target NPC ${npcSourceOrder} is not visible`);
    const goals = new Set(directionInputs.map(({ dx, dy }) => `${npc.tileX - dx},${npc.tileY - dy}`));
    if (goals.has(`${state.tileX},${state.tileY}`)) return { route, final: state, npc, blockedMoves };
    const direction = nextDirection(state, collision, goals);
    if (direction === undefined) throw new Error(`${label}: no live path to NPC ${npcSourceOrder}`);
    const from = [state.tileX, state.tileY];
    const moved = await holdUntil(direction.key, direction.code, direction.vk,
      (candidate) => candidate?.mapId !== mapId || candidate.tileX !== from[0] || candidate.tileY !== from[1],
      `${label}-move-${iteration + 1}`, 1800);
    if (moved?.mapId !== mapId) throw new Error(`${label}: left Map${mapId}: ${JSON.stringify(moved)}`);
    if (moved.tileX !== from[0] || moved.tileY !== from[1]) route.push({ from, to: [moved.tileX, moved.tileY] });
    else if (++blockedMoves > 30) throw new Error(`${label}: repeated blocked movement at ${from.join(',')}`);
    if ((iteration + 1) % 12 === 0) await screenshot(`${label}-checkpoint-${iteration + 1}.png`);
  }
  throw new Error(`${label}: exceeded movement limit`);
}

async function interactWithGuard() {
  const approached = await moveToAnyAdjacentNpc(60, 2, 'map60-guard-approach');
  await observe('map60-guard-approach');
  await screenshot('05-map60-guard-approach.png');
  const npc = approached.npc;
  const dx = npc.tileX - approached.final.tileX;
  const dy = npc.tileY - approached.final.tileY;
  const facing = directionInputs.find((direction) => direction.dx === dx && direction.dy === dy);
  if (facing === undefined) throw new Error(`Guard adjacency is not cardinal: ${JSON.stringify({ approached, npc })}`);
  await tap(facing.key, facing.code, facing.vk);
  await tap('Enter', 'Enter', 13);
  await delay(350);
  await observe('map60-guard-event-open');
  await screenshot('06-map60-guard-event-open.png');
  const dialogueSteps = await advanceDialogue('map60-guard-event');
  const settled = await waitFor((state) => state?.mapId === 60 && state.runtime?.dialogueOpen === false,
    'Map60 Guard event settlement', 12000);
  await observe('map60-combo-unlock-settled');
  await screenshot('07-map60-combo-unlock-settled.png');
  return { route: approached.route, blockedMoves: approached.blockedMoves, dialogueSteps, settled };
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await launch();
  const start = await startScenario();
  const map60ToMap61 = await moveToTile(60, [1, 3], 61, 'map60-west-marker-to-map61');
  await observe('map61-arrival');
  await screenshot('02-map61-arrival.png');
  const map61WelcomeSteps = await advanceDialogue('map61-arrival-dialogue');
  const afterWelcome = await readRuntime();
  if (afterWelcome?.mapId !== 61) throw new Error(`Unexpected Map61 welcome state: ${JSON.stringify(afterWelcome)}`);

  const map61ToCrest = await moveToTile(61, [30, 3], null, 'map61-crest-approach');
  await observe('map61-crest-marker-approach');
  await screenshot('03-map61-crest-marker-approach.png');
  await tap('ArrowUp', 'ArrowUp', 38);
  await tap('Enter', 'Enter', 13);
  await delay(350);
  await observe('map61-crest-event-open');
  await screenshot('04-map61-crest-event-open.png');
  const crestDialogueSteps = await advanceDialogue('map61-crest-event');
  const crestState = await waitFor((state) => state?.mapId === 61 && state.runtime?.inventory?.some(
    (stack) => stack.category === 20 && stack.itemId === 0 && stack.count === 1,
  ) && state.runtime?.gameFlags?.includes(30), 'Map61 Crest award and flag 30', 12000);
  await observe('map61-crest-awarded');
  await screenshot('05-map61-crest-awarded.png');

  const map61ToMap60 = await moveToTile(61, [4, 39], 60, 'map61-south-marker-to-map60');
  await advanceDialogue('map60-return-dialogue');
  const guard = await interactWithGuard();
  const finalState = guard.settled;
  const inventory = finalState.runtime.inventory;
  const passed = finalState.profile === 'max-level' && finalState.scenario === 'map60-investigation' &&
    finalState.level === 99 && finalState.hp === finalState.runtime.resources.maxHp &&
    finalState.runtime.combo.comboLimit === 3 &&
    inventory.some((stack) => stack.category === 18 && stack.itemId === 4 && stack.count === 1) &&
    !inventory.some((stack) => stack.category === 18 && stack.itemId === 3) &&
    !inventory.some((stack) => stack.category === 20 && stack.itemId === 0) &&
    finalState.runtime.gameFlags.includes(30);
  const errors = cdpEvents.filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Network.loadingFailed' ||
    (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') ||
    (event.method === 'Log.entryAdded' && event.params.entry?.level === 'error'));
  const result = {
    id: 'M969', attempt: attemptNumber, profile: 'max-level', scenario: 'map60-investigation', passed,
    route: 'Visible New Game -> seeded Map60 investigation stage -> Map61 Crest marker -> Map60 Guard',
    start, map60ToMap61, map61WelcomeSteps, map61ToCrest, crestDialogueSteps,
    crestState, map61ToMap60, guard, finalState, errors,
    browser: { product: 'Chromium', ownedProcess: true, temporaryProfile: 'isolated-and-deleted-after-capture' },
    restrictions: { saveFilesAccessed: false, browserStorageRead: false, gameSaveActionUsed: false, originalJarAccessed: false },
  };
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed || errors.length > 0) throw new Error(`M969 web route did not meet verification criteria: ${JSON.stringify({ passed, errors, finalState })}`);
  process.stdout.write(`${JSON.stringify({
    id: result.id, attempt: result.attempt, passed, profile: result.profile, scenario: result.scenario,
    map60Start: [start.tileX, start.tileY], level: start.level,
    crest: { mapId: crestState.mapId, inventory: crestState.runtime.inventory, gameFlags: [...crestState.runtime.gameFlags] },
    final: { mapId: finalState.mapId, tile: [finalState.tileX, finalState.tileY], level: finalState.level,
      hp: finalState.hp, maxHp: finalState.runtime.resources.maxHp, comboLimit: finalState.runtime.combo.comboLimit,
      inventory: finalState.runtime.inventory, gameFlags: [...finalState.runtime.gameFlags] },
    browserErrors: errors.length, artifacts: `reference/screenshots/web-render/M969-map60-guard-quest/attempt-${attemptNumber}`,
  })}\n`);
}

async function cleanup() {
  try { socket?.close(); } catch {}
  if (browserProcess !== undefined && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    browserProcess.kill('SIGTERM');
    await new Promise((resolvePromise) => {
      if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) return resolvePromise();
      const timeout = setTimeout(resolvePromise, 4000);
      browserProcess.once('exit', () => { clearTimeout(timeout); resolvePromise(); });
    });
    if (browserProcess.exitCode === null && browserProcess.signalCode === null) browserProcess.kill('SIGKILL');
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await run();
} catch (error) {
  const partial = {
    id: 'M969', attempt: attemptNumber, profile: 'max-level', scenario: 'map60-investigation', passed: false,
    observations, error: error instanceof Error ? error.message : String(error),
    browser: { stderr: chromeStderr.slice(-4000) },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'result.json'), `${JSON.stringify(partial, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify({ id: 'M969', attempt: attemptNumber, passed: false, error: partial.error,
    latest: observations.at(-1)?.state === undefined ? null : {
      label: observations.at(-1)?.label, state: {
        mapId: observations.at(-1)?.state?.mapId, tile: [observations.at(-1)?.state?.tileX, observations.at(-1)?.state?.tileY],
        level: observations.at(-1)?.state?.level, hp: observations.at(-1)?.state?.hp,
      },
    } })}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
